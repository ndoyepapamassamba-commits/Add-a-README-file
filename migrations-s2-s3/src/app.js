/* =====================================================================
   ECOBANK SÉNÉGAL · Migrations S2 & S3 · Studio
   Charge PORTEFEUILLE (un onglet par arrêté), calcule les migrations de
   stage au niveau client, simule l'impairment avec le moteur ECL du
   PDO Monitor (eclRun / eclContract) et génère ECOBANK_MIGRATIONS.xlsx.
   ===================================================================== */
const KIT={org:'ECOBANK SÉNÉGAL',unit:'Direction des Risques',app:'Migrations S2 & S3',footer:'INTERNAL USE ONLY',docTitle:'Migrations S2 & S3',docSubject:'Migrations IFRS9',keywords:'IFRS9;ECL;Stage'};
const $=s=>document.querySelector(s);
function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(t._h);t._h=setTimeout(()=>t.classList.remove('on'),3800);}
function busy(on,txt){$('#busy').classList.toggle('on',!!on);if(txt)$('#busyT').textContent=txt;}
const tick=()=>new Promise(r=>setTimeout(r,20));
const esc=t=>String(t==null?'':t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=v=>Math.round(v||0).toLocaleString('fr-FR').replace(/ | /g,' ');
const fM=v=>((v||0)/1e6).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}).replace(/ | /g,' ')+' M';
const pct=v=>((v||0)*100).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1})+' %';
const dFR=d=>d?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear():'';

/* ------------------------------------------------------------------ moteur ECL (réplique ECL_PARAMS du PDO Monitor) */
const P={W:{be:0.6,o:0.2,dn:0.2},
 pd12:{1:1e-7,2:1e-6,3:4e-6,4:3.1e-5,5:2.18e-4,6:1.554e-3,7:0.01103,8:0.076572,9:0.454067,10:1.0},
 rankToSP:{1:'AA',2:'AA',3:'A',4:'BBB',5:'BB',6:'B',7:'CCC',8:'CCC',9:'CCC',10:'D'},
 spCum:{AA:[0.0002,0.0006,0.0011,0.0021,0.0030,0.0041,0.0049,0.0056],A:[0.0005,0.0013,0.0022,0.0033,0.0046,0.0060,0.0076,0.0090],
  BBB:[0.0016,0.0043,0.0075,0.0114,0.0154,0.0194,0.0227,0.0261],BB:[0.0063,0.0193,0.0346,0.0499,0.0643,0.0775,0.0889,0.0990],
  B:[0.0334,0.0780,0.1175,0.1489,0.1735,0.1936,0.2099,0.2231],CCC:[0.2830,0.3833,0.4342,0.4636,0.4858,0.4961,0.5075,0.5149]},
 lgd:{CORPORATE:{cure:0.0712,be:[0.0386,0.0290,0.0193,0.0097,0],dn:[0.0355,0.0267,0.0178,0.0089,0]},
      COMMERCIAL:{cure:0.0201,be:[0.1247,0.0935,0.0624,0.0312,0],dn:[0.1147,0.0861,0.0574,0.0287,0]},
      CONSUMER:{cure:0.0574,be:[0.1325,0.0994,0.0662,0.0331,0],dn:[0.1219,0.0914,0.0609,0.0305,0]}},
 ccf:0.9999942009,eir:0.08,rho:0.15,z:{be:0,o:-1,dn:1.96},collF:{be:1,o:1,dn:0.95},
 hc:{DEBENTURE:0.0131,CASH:0.0286,INVENTORY:0.0537,PLANT_AND_EQUIPMENT:0.0472,RESIDENTIAL_PROPERTY:0.0190,COMMERCIAL_PROPERTY:0.0937,RECEIVABLES:0.0545,SHARES:0,VEHICLE:0.0755}};
const OFF=new Set(['CKU','LCU']);   // engagements par signature
function phi(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989422804014327*Math.exp(-x*x/2);
  const p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429))));return x>0?1-p:p;}
function phiInv(p){if(p<=0)return -8;if(p>=1)return 8;
  const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00],
  b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01],
  c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00],
  d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00],pl=0.02425;let q,r;
  if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
  if(p<=1-pl){q=p-0.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);}
  q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);}
const vas=(pd,z)=>pd<=0?0:pd>=1?1:phi((phiInv(pd)+Math.sqrt(P.rho)*z)/Math.sqrt(1-P.rho));
function secType(sec,seg){sec=String(sec==null?'':sec).trim();const s1=sec.charAt(0),s2=sec.slice(0,2);
  if(sec==='1000')return 'DEBENTURE';if(s1==='3')return 'CASH';if(s2==='41')return 'INVENTORY';if(s2==='42'||s2==='43')return 'RECEIVABLES';
  if(s2==='51'||s2==='53'||s2==='55')return 'PLANT_AND_EQUIPMENT';if(s2==='52')return 'VEHICLE';
  if(s2==='54')return seg==='1000'?'RESIDENTIAL_PROPERTY':'COMMERCIAL_PROPERTY';return 'SHARES';}
const segKey=s=>{s=String(s||'').toUpperCase();return s.includes('CORPOR')?'CORPORATE':s.includes('COMMER')?'COMMERCIAL':'CONSUMER';};
const bucket=d=>d>=360?4:d>=270?3:d>=180?2:d>=90?1:0;
function lifePD(rank,years){const sp=P.rankToSP[rank]||'BB';if(sp==='D')return 1;const c=P.spCum[sp]||P.spCum.BB;
  return c[Math.max(1,Math.min(c.length,Math.round(years||1)))-1];}
function eclContract(stage,rank,ead,sk,bk,coll,years,sc){
  let pd=stage>=3?1:stage===2?lifePD(rank,years):(P.pd12[rank]||0);pd=stage>=3?1:vas(pd,P.z[sc]);
  const lp=P.lgd[sk]||P.lgd.CONSUMER,rec=(sc==='dn'?lp.dn:lp.be)[bk]||0;
  const rc=ead>0?Math.min(1,coll*P.collF[sc]/ead):0;let lgd=Math.max(0,1-rc-rec*(1-rc))*(1-lp.cure);
  const df=stage>=2?1/Math.pow(1+P.eir,Math.max(0,years)):1;return ead*pd*lgd*df;}

/* ------------------------------------------------------------------ lecture */
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const COLS={ctr:/^contracts? ?accounts?$/,cli:/^code client$/,rel:/^relationship$/,grp:/^group name$/,orr:/^orr$/,seg:/^segment code$/,prod:/^product code$/,
  sec:/^security code$/,coll:/^collateral value/,frr:/^frr$/,cls:/^classification$/,stg:/^stage ifrs ?9/,ftot:/^ftotal/,otot:/^ototal including pdo/,
  prov:/^cprovisions ifrs ?9/,pdo:/^pdo amount/,dpdo:/^date in pdo$/,ao:/^account officer$/,regl:/^cprovisions per local/,mat:/^maturity date$/,rep:/^reporting date$/,bs:/^business segment$/};
const num=v=>{if(v==null||v==='')return 0;if(typeof v==='number')return v;const n=parseFloat(String(v).replace(/[\s  ]/g,'').replace(',','.'));return isNaN(n)?0:n;};
const toD=v=>{if(v instanceof Date)return isNaN(v)?null:v;if(typeof v==='number')return new Date(Math.round((v-25569)*864e5));if(!v)return null;
  const s=String(v).trim();let m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);if(m)return new Date(+m[3],+m[2]-1,+m[1]);const d=new Date(s);return isNaN(d)?null:d;};
const str=v=>v==null?'':String(v).trim();

function readSheet(ws,name){
  const A=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null,blankrows:false});
  let h=-1;for(let i=0;i<Math.min(25,A.length);i++){const n=(A[i]||[]).map(norm);if(n.some(x=>COLS.stg.test(x))&&n.some(x=>COLS.ctr.test(x))){h=i;break;}}
  if(h<0)return null;const H=A[h].map(norm),ix={};
  for(const k in COLS){const j=H.findIndex(x=>COLS[k].test(x));ix[k]=j;}
  const miss=['ctr','cli','stg','otot'].filter(k=>ix[k]<0);if(miss.length)return null;
  const g=(r,k)=>ix[k]<0?null:r[ix[k]];const rows=[];let rep=null;
  for(let i=h+1;i<A.length;i++){const r=A[i];if(!r)continue;const ctr=str(g(r,'ctr'));if(!ctr)continue;
    const rd=toD(g(r,'rep'));if(rd&&(!rep||rd>rep))rep=rd;
    rows.push({ctr,cli:str(g(r,'cli')),rel:str(g(r,'rel')),grp:str(g(r,'grp')),orr:num(g(r,'orr')),segc:str(g(r,'seg')),prod:str(g(r,'prod')),sec:str(g(r,'sec')),
      coll:Math.abs(num(g(r,'coll'))),frr:num(g(r,'frr')),cls:str(g(r,'cls')),stg:parseInt(num(g(r,'stg')))||0,ftot:num(g(r,'ftot')),otot:num(g(r,'otot')),
      prov:num(g(r,'prov')),pdo:num(g(r,'pdo')),dpdo:toD(g(r,'dpdo')),ao:str(g(r,'ao')),regl:num(g(r,'regl')),mat:toD(g(r,'mat')),bs:str(g(r,'bs'))});}
  if(!rep){const m=String(name).match(/^(\d{2})(\d{2})(\d{4})$/);if(m)rep=new Date(+m[3],+m[2]-1,+m[1]);}
  return {name,rows,rep};
}

/* applique le moteur à un arrêté */
function runEcl(snap){const rep=snap.rep||new Date();const R=snap.rows;
  const cons=new Set();R.forEach(r=>{if(/CONSUMER/i.test(r.bs))cons.add(r.cli);});
  R.forEach(r=>{const ob=Math.abs(r.otot),lim=Math.abs(r.ftot);r.ead=OFF.has(r.prod)?Math.max(ob,lim)*P.ccf:ob;
    r._net=/^[678]/.test(r.sec)?0:r.coll*(1-(P.hc[secType(r.sec,cons.has(r.cli)?'1000':'')]??0.10));});
  const cc=new Map(),ce=new Map();R.forEach(r=>{cc.set(r.cli,(cc.get(r.cli)||0)+r._net);ce.set(r.cli,(ce.get(r.cli)||0)+r.ead);});
  R.forEach(r=>{const e=ce.get(r.cli)||0;r.collNet=e>0?(cc.get(r.cli)||0)*r.ead/e:0;
    r.dpd=r.dpdo?Math.max(0,Math.round((rep-r.dpdo)/864e5)):0;
    let y=r.mat?(r.mat-rep)/(365.25*864e5):1;y=Math.max(0.5,Math.min(7,y||1));r.ttr=y;
    let rk=Math.round(r.frr)||Math.round(r.orr)||6;rk=Math.max(1,Math.min(10,rk));
    const st=Math.max(1,Math.min(3,r.stg||1)),sk=segKey(r.bs),bk=bucket(r.dpd);
    r.be=eclContract(st,rk,r.ead,sk,bk,r.collNet,y,'be');r.o=eclContract(st,rk,r.ead,sk,bk,r.collNet,y,'o');r.dn=eclContract(st,rk,r.ead,sk,bk,r.collNet,y,'dn');});
}
const ORD=['I','IA','IIA','IIN','III','IV','V'];const worst=(a,b)=>ORD.indexOf(b)>ORD.indexOf(a)?b:a;

/* ------------------------------------------------------------------ analyse */
let S=null;
function analyse(cur,ref){
  const W=P.W,ecl=x=>W.be*x.be+W.o*x.o+W.dn*x.dn;
  // référence : contrats dédoublonnés
  const refBy=new Map();ref.rows.forEach(r=>{if(!refBy.has(r.ctr))refBy.set(r.ctr,r);});
  const refRows=[...refBy.values()];
  const ca=new Map();
  refRows.forEach(r=>{let c=ca.get(r.cli);if(!c){c={stg:0,ead:0,prov:0,cls:'',nom:r.rel,seg:r.bs,gest:r.ao};ca.set(r.cli,c);}
    c.stg=Math.max(c.stg,r.stg);c.ead+=r.ead;c.prov+=r.prov;c.cls=c.cls?worst(c.cls,r.cls):r.cls;});
  const cs=new Map();
  cur.rows.forEach(r=>{let c=cs.get(r.cli);if(!c){c={cli:r.cli,nom:r.rel,seg:r.bs,gest:r.ao,stg:0,cls:'',nb:0,ead:0,enc:0,pdo:0,dpd:0,coll:0,be:0,o:0,dn:0,prod:new Set(),regl:0};cs.set(r.cli,c);}
    if(!c.nom)c.nom=r.rel;if(!c.seg)c.seg=r.bs;if(!c.gest)c.gest=r.ao;
    c.stg=Math.max(c.stg,r.stg);c.cls=c.cls?worst(c.cls,r.cls):r.cls;c.nb++;c.ead+=r.ead;c.enc+=r.otot;c.pdo+=r.pdo;c.dpd=Math.max(c.dpd,r.dpd);
    c.coll+=r.collNet;c.be+=r.be;c.o+=r.o;c.dn+=r.dn;if(r.prod)c.prod.add(r.prod);c.regl+=r.regl;});
  const lab={0:'Nouveau',1:'S1',2:'S2',3:'S3'};
  const cli=[...cs.values()].map(c=>{const a=ca.get(c.cli);c.prod=[...c.prod].sort().join(', ');
    c.stgA=a?a.stg:0;c.eadA=a?a.ead:0;c.provA=a?a.prov:0;c.clsA=a?(a.cls||''):'Nouveau';c.ecl=ecl(c);c.imp=c.ecl-c.provA;
    c.flux=lab[c.stgA]+' → S'+c.stg;return c;});
  const s3=cli.filter(c=>c.stg===3&&c.stgA<3&&c.ead>0).sort((a,b)=>b.ead-a.ead);
  const s2=cli.filter(c=>c.stg===2&&c.stgA<2&&c.ead>0).sort((a,b)=>b.ead-a.ead);
  const z3=cli.filter(c=>c.stg===3&&c.stgA<3&&!(c.ead>0)).length,z2=cli.filter(c=>c.stg===2&&c.stgA<2&&!(c.ead>0)).length;
  // base : tous les clients (y compris sortis)
  const base=cli.map(c=>({cli:c.cli,nom:c.nom,seg:c.seg,gest:c.gest,stgA:c.stgA,stg:c.stg,eadA:c.eadA,ead:c.ead,provA:c.provA,be:c.be,o:c.o,dn:c.dn}));
  ca.forEach((a,k)=>{if(!cs.has(k))base.push({cli:k,nom:a.nom,seg:a.seg,gest:a.gest,stgA:a.stg,stg:0,eadA:a.ead,ead:0,provA:a.prov,be:0,o:0,dn:0});});
  const bl={0:'Absent',1:'S1',2:'S2',3:'S3'};
  base.forEach(b=>{b.flux=(b.stgA?bl[b.stgA]:'Nouveau')+' → '+(b.stg?bl[b.stg]:'Sorti');});
  base.sort((a,b)=>b.ead-a.ead);
  // détail contrats
  const i3=new Set(s3.map(c=>c.cli)),i2=new Set(s2.map(c=>c.cli));
  const det=cur.rows.filter(r=>i3.has(r.cli)||i2.has(r.cli)).map(r=>{const a=refBy.get(r.ctr);
    return Object.assign({},r,{cat:i3.has(r.cli)?'S3 incoming':'S2 incoming',stgA:a?a.stg:0,clsA:a?a.cls:'',provA:a?a.prov:0});})
    .sort((a,b)=>a.cat<b.cat?1:a.cat>b.cat?-1:(a.rel<b.rel?-1:a.rel>b.rel?1:b.ead-a.ead));
  // back-test et simulation globale
  const bt={1:[0,0,0],2:[0,0,0],3:[0,0,0]},sep={1:[0,0],2:[0,0],3:[0,0]};
  refRows.forEach(r=>{const s=Math.max(1,Math.min(3,r.stg||1));bt[s][0]++;bt[s][1]+=r.prov;bt[s][2]+=ecl(r);});
  cur.rows.forEach(r=>{const s=Math.max(1,Math.min(3,r.stg||1));sep[s][0]+=r.ead;sep[s][1]+=ecl(r);});
  // matrice
  const cnt=[[0,0,0],[0,0,0],[0,0,0]],amt=[[0,0,0],[0,0,0],[0,0,0]];
  base.forEach(b=>{if(b.stgA>=1&&b.stg>=1){cnt[b.stgA-1][b.stg-1]++;amt[b.stgA-1][b.stg-1]+=b.eadA;}});
  const heat=amt.map(r=>{const t=r.reduce((x,y)=>x+y,0)||1;return r.map(v=>v/t);});
  const outS2S1=base.filter(b=>b.stgA===2&&b.stg===1),outS3S1=base.filter(b=>b.stgA===3&&b.stg===1);
  S={cur,ref,cli,s3,s2,z3,z2,base,det,bt,sep,cnt,heat,outS2S1,outS3S1,ecl};
  return S;
}
const sum=(a,f)=>a.reduce((s,x)=>s+(f(x)||0),0);
function stats(){const A=S,e=A.ecl;
  const flows={};[...A.s3,...A.s2].forEach(c=>{const f=flows[c.flux]||(flows[c.flux]={n:0,ead:0,prov:0,ecl:0,imp:0});f.n++;f.ead+=c.ead;f.prov+=c.provA;f.ecl+=c.ecl;f.imp+=c.imp;});
  const t=(L)=>({n:L.length,ead:sum(L,c=>c.ead),prov:sum(L,c=>c.provA),ecl:sum(L,c=>c.ecl),be:sum(L,c=>c.be),o:sum(L,c=>c.o),dn:sum(L,c=>c.dn),imp:sum(L,c=>c.imp)});
  const T3=t(A.s3),T2=t(A.s2),all=[...A.s3,...A.s2];
  const tot=T3.imp+T2.imp,dot=sum(all,c=>Math.max(0,c.imp)),rep=sum(all,c=>Math.min(0,c.imp));
  const sorted=all.map(c=>c.imp).sort((a,b)=>b-a);const top20=sorted.slice(0,20).reduce((a,b)=>a+b,0)/(tot||1);
  const cons3=sum(A.s3.filter(c=>/CONSUMER/i.test(c.seg)),c=>c.imp)/(T3.imp||1);
  const covered=A.s2.filter(c=>c.ecl<0.01*c.ead&&c.coll>=c.ead).sort((a,b)=>b.ead-a.ead)[0];
  const repr=all.filter(c=>c.imp<0).sort((a,b)=>a.imp-b.imp)[0];
  const byA=(L,k)=>L.filter(c=>c.stgA===k);
  const clsA2=A.s2.reduce((m,c)=>(m[c.clsA]=(m[c.clsA]||0)+1,m),{});
  return {flows,T3,T2,tot,dot,rep,top20,cons3,covered,repr,byA,clsA2};}

/* ------------------------------------------------------------------ visuels 3D (kit g3) */
async function visuals(){const A=S,X=stats(),V={};
  V.badge=await g3LogoBadge();
  const fk=['S1 → S2','S1 → S3','S2 → S3'];
  V.flows=g3Bars({title:'Impairment à prendre par flux de migration',sub:'ECL simulé '+dFR(A.cur.rep)+' − provision IFRS9 '+dFR(A.ref.rep)+' (XOF)',labels:fk,values:fk.map(k=>(X.flows[k]||{}).imp||0),colors:['#d4a13a','#c0392b','#00415e'],w:760,h:400});
  V.heat=g3Heat({title:'Matrice de migration (part de l’encours '+dFR(A.ref.rep).slice(0,5)+')',sub:'Lignes : stage au '+dFR(A.ref.rep)+' · Colonnes : stage au '+dFR(A.cur.rep)+' · niveau client',rows:['Stage 1','Stage 2','Stage 3'],cols:['Stage 1','Stage 2','Stage 3'],m:A.heat,w:760,h:400});
  const top=(L,k)=>L.slice().sort((a,b)=>b[k]-a[k]).slice(0,k==='ead'?15:12);
  const hb=(L,k,title,sub,col)=>{const t=top(L,k);return g3HBars({title,sub,labels:t.map(c=>c.nom),values:t.map(c=>c[k]),color:col,w:860,left:300});};
  V.top3=hb(A.s3,'ead','S3 incoming — Top 15 noms par encours','EAD '+dFR(A.cur.rep)+' (XOF)','#c0392b');
  V.top2=hb(A.s2,'ead','S2 incoming — Top 15 noms par encours','EAD '+dFR(A.cur.rep)+' (XOF)','#d4a13a');
  V.imp3=hb(A.s3,'imp','S3 incoming — Impairment à prendre par nom','Top 12 dotations (XOF)','#00415e');
  V.imp2=hb(A.s2,'imp','S2 incoming — Impairment à prendre par nom','Top 12 dotations (XOF)','#005c83');
  const seg=(L,title)=>{const m={};L.forEach(c=>m[c.seg||'N/D']=(m[c.seg||'N/D']||0)+c.ead);const k=Object.keys(m).sort();
    return g3Donut({title,labels:k,values:k.map(x=>m[x]),colors:['#00415e','#8cc63f','#2b9ad6'],center:g3Md(sum(L,c=>c.ead)),w:760,h:380});};
  V.seg3=seg(A.s3,'S3 incoming — encours par segment');V.seg2=seg(A.s2,'S2 incoming — encours par segment');
  V.scen=g3Bars({title:'ECL simulé des entrants S2 + S3 par scénario',sub:'Moteur PDO Monitor · pondération '+[P.W.be,P.W.o,P.W.dn].map(x=>Math.round(x*100)).join(' / '),
    labels:['Provision réf.','Optimiste','Best estimate','Downturn','Pondéré'],values:[X.T3.prov+X.T2.prov,X.T3.o+X.T2.o,X.T3.be+X.T2.be,X.T3.dn+X.T2.dn,X.T3.ecl+X.T2.ecl],colors:['#3e5c6b','#8cc63f','#005c83','#c0392b','#00415e'],w:760,h:400});
  const bt=A.bt;V.bt=g3Bars({title:'Back-test du moteur sur l’arrêté '+dFR(A.ref.rep),sub:'Provision IFRS9 comptabilisée vs ECL simulé (XOF)',labels:['S1 booké','S1 simulé','S2 booké','S2 simulé','S3 booké','S3 simulé'],
    values:[bt[1][1],bt[1][2],bt[2][1],bt[2][2],bt[3][1],bt[3][2]],colors:['#a6d867','#6ba23a','#2b9ad6','#005c83','#5c7f92','#00415e'],w:760,h:400});
  V.card=g3Card({title:'Lecture — Migrations S2 & S3 · '+dFR(A.ref.rep).slice(0,5)+' → '+dFR(A.cur.rep),tag:'INTERNAL USE ONLY',w:1100,blocks:narrative(X)});
  S.V=V;S.X=X;return V;}
function narrative(X){const A=S;const s3a2=X.byA(A.s3,2),s3a1=X.byA(A.s3,1);
  const cls=Object.entries(X.clsA2).sort((a,b)=>b[1]-a[1]).map(([k,v])=>v+' en '+k).join(', ');
  const rec=['Valider la dotation de '+fM(X.tot)+' en Comité ; les 20 premiers noms concentrent '+Math.round(X.top20*100)+' % de l’impairment → revue individuelle prioritaire.',
    'S3 incoming : '+Math.round(X.cons3*100)+' % de l’impairment vient du Consumer – activer domiciliations et relances avant passage en Douteux.'];
  const chk=[];if(X.covered)chk.push(X.covered.nom+' ('+fM(X.covered.ead)+' en S2, ECL ≈ 0 : garanties nettes '+fM(X.covered.coll)+')');
  if(X.repr)chk.push(X.repr.nom+' (provision '+fM(X.repr.provA)+' > ECL '+fM(X.repr.ecl)+' : pas de reprise sans revue)');
  if(chk.length)rec.push('Revoir '+chk.join(' et ')+'.');
  return [{h:'Constats',col:'#00415e',items:[
    'S3 incoming : '+A.s3.length+' clients pour '+fM(X.T3.ead)+' XOF d’encours au '+dFR(A.cur.rep)+' (S2→S3 : '+fM(sum(s3a2,c=>c.ead))+' ; S1→S3 direct : '+fM(sum(s3a1,c=>c.ead))+').',
    'S2 incoming : '+A.s2.length+' clients pour '+fM(X.T2.ead)+' XOF, tous issus du Stage 1 ('+cls+' au '+dFR(A.ref.rep)+').',
    'Sorties sur la période : '+A.outS2S1.length+' clients S2→S1 ('+fM(sum(A.outS2S1,b=>b.eadA))+' d’encours) et '+A.outS3S1.length+' clients S3→S1 ('+fM(sum(A.outS3S1,b=>b.eadA))+').']},
   {h:'Impairment à prendre',col:'#c0392b',items:[
    'Total à doter : '+fM(X.tot)+' XOF = ECL simulé ('+fM(X.T3.ecl+X.T2.ecl)+') − provisions IFRS9 au '+dFR(A.ref.rep)+' ('+fM(X.T3.prov+X.T2.prov)+').',
    'Dont S3 incoming '+fM(X.T3.imp)+' et S2 incoming '+fM(X.T2.imp)+' ; dotations brutes '+fM(X.dot)+', reprises '+fM(-X.rep)+'.',
    'Stress downturn : ECL des entrants porté à '+fM(X.T3.dn+X.T2.dn)+' (soit '+fM(X.T3.dn+X.T2.dn-X.T3.prov-X.T2.prov)+' à doter).']},
   {h:'Recommandations',col:'#6ba23a',items:rec}];}

/* ------------------------------------------------------------------ écran */
const TABS=[['syn','Synthèse'],['s3','S3 incoming'],['s2','S2 incoming'],['mx','Matrice'],['imp','Impairment']];
function show(id){document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('on',p.id==='p-'+id));document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.t===id));}
function render(){const A=S,X=S.X,V=S.V;
  $('#drop').hidden=true;$('#nav').hidden=false;$('#bXl').hidden=false;$('#bPpt').hidden=false;$('#bDoc').hidden=false;$('#foot').hidden=false;
  $('#tabs').innerHTML=TABS.map(([k,l])=>`<button class="tab" data-t="${k}">${l}${k==='s3'?`<span class="ct">${A.s3.length}</span>`:k==='s2'?`<span class="ct">${A.s2.length}</span>`:''}</button>`).join('');
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>show(t.dataset.t));
  const kp=(l,v,s,c)=>`<div class="kpi" style="--c:${c}"><div class="l">${l}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;
  const qa=(n,c,q,txt,m,tab)=>`<div class="n" style="background:${c}">${n}</div><div class="b"><h4>${q}</h4><p>${txt}</p><div class="m">${m}${tab?` · <a href="#" data-go="${tab}">voir le détail →</a>`:''}</div></div>`;
  const mm=t=>`<span>Clients <b>${t.n}</b></span><span>EAD <b>${fmt(t.ead)}</b></span><span>Provision réf. <b>${fmt(t.prov)}</b></span><span>ECL simulé <b>${fmt(t.ecl)}</b></span><span>Impairment <b class="r">${fmt(t.imp)}</b></span>`;
  const TT={n:X.T3.n+X.T2.n,ead:X.T3.ead+X.T2.ead,prov:X.T3.prov+X.T2.prov,ecl:X.T3.ecl+X.T2.ecl,imp:X.tot};
  const card=V.card?`<div class="card vis" style="margin-top:14px"><img src="${V.card}" alt="Lecture"></div>`:'';
  $('#p-syn').innerHTML=`<div class="river"><div class="rt"><div><div class="cap">Impairment à prendre · ${dFR(A.ref.rep)} → ${dFR(A.cur.rep)}</div><div class="big">${fmt(X.tot)}<small>XOF</small></div></div>
    <div class="side"><div>S3 incoming<b>${fM(X.T3.imp)}</b></div><div>S2 incoming<b>${fM(X.T2.imp)}</b></div><div>Dotations brutes<b>${fM(X.dot)}</b></div><div>Reprises<b>${fM(-X.rep)}</b></div><div>Downturn<b>${fM(X.T3.dn+X.T2.dn-X.T3.prov-X.T2.prov)}</b></div></div></div><div class="rule"></div>
    <div class="hint">Moteur ECL du PDO Monitor (PD Vasicek · LGD PwC · 3 scénarios ${[P.W.be,P.W.o,P.W.dn].map(x=>Math.round(x*100)).join('/')}). Arrêté courant : onglet ${esc(A.cur.name)} (${A.cur.rows.length} lignes) · référence : ${esc(A.ref.name)} (${A.ref.rows.length} lignes).</div></div>
    <div class="grid g6" style="margin-top:14px">${kp('S3 incoming · clients',A.s3.length,'noms entrés en Stage 3','#c0392b')}${kp('S3 incoming · EAD',fM(X.T3.ead),'XOF','#c0392b')}${kp('S3 · impairment',fM(X.T3.imp),'ECL − provision réf.','#c0392b')}
    ${kp('S2 incoming · clients',A.s2.length,'noms entrés en Stage 2','#b67d1c')}${kp('S2 incoming · EAD',fM(X.T2.ead),'XOF','#b67d1c')}${kp('S2 · impairment',fM(X.T2.imp),'ECL − provision réf.','#b67d1c')}</div>
    <div class="card" style="margin-top:14px"><div class="hd"><h3>Réponses aux questions « MIGRATIONS S2 &amp; S3 »</h3><small>niveau client · stage le plus dégradé</small></div><div class="qa">
    ${qa(1,'#c0392b','S3 incoming',`${A.s3.length} clients ont basculé en Stage 3 : ${X.byA(A.s3,2).length} depuis le Stage 2, ${X.byA(A.s3,1).length} directement depuis le Stage 1, ${X.byA(A.s3,0).length} nouveaux noms.`,mm(X.T3),'s3')}
    ${qa(2,'#00415e','Impairment à prendre ?',`Oui : dotation nette de ${fM(X.tot)} XOF (${fM(X.dot)} de dotations brutes, ${fM(-X.rep)} de reprises théoriques). Downturn : ${fM(X.T3.dn+X.T2.dn-X.T3.prov-X.T2.prov)}.`,mm(TT),'imp')}
    ${qa(3,'#b67d1c','S2 incoming',`${A.s2.length} clients passés du Stage 1 au Stage 2. Les 20 premiers noms pèsent ${Math.round(X.top20*100)} % de l’impairment total.`,mm(X.T2),'s2')}
    ${qa(4,'#6ba23a','Le détail des noms S2 & S3',`Listes nominatives dans les onglets S3 / S2 incoming, et ${A.det.length} contrats dans le classeur Excel (onglet DETAIL CONTRATS, filtrable par segments).`,'','')}</div></div>
    <div class="grid g2" style="margin-top:14px"><div class="card vis"><img src="${V.flows}"></div><div class="card vis"><img src="${V.heat}"></div><div class="card vis"><img src="${V.seg3}"></div><div class="card vis"><img src="${V.seg2}"></div></div>${card}`;
  document.querySelectorAll('[data-go]').forEach(a=>a.onclick=e=>{e.preventDefault();show(a.dataset.go);});
  const list=(id,L,title,imgs)=>{$('#p-'+id).innerHTML=`<div class="card"><div class="hd"><h3>${title}</h3><small>${L.length} clients · EAD ${fmt(sum(L,c=>c.ead))} · impairment ${fmt(sum(L,c=>c.imp))}</small></div>
    <div class="ctrl"><input type="search" placeholder="Rechercher un nom, un gestionnaire, un produit…" data-q="${id}"><select data-s="${id}"><option value="">Tous segments</option>${[...new Set(L.map(c=>c.seg))].sort().map(s=>`<option>${esc(s)}</option>`).join('')}</select></div>
    <div class="tw"><table class="dt"><thead><tr><th>Nom client</th><th>Segment</th><th>Gestionnaire</th><th>Produits</th><th>Flux</th><th>Classe réf.</th><th>Classe</th><th class="r">Jours PDO</th><th class="r">EAD</th><th class="r">Garanties nettes</th><th class="r">Provision réf.</th><th class="r">ECL simulé</th><th class="r">Impairment</th></tr></thead><tbody id="tb-${id}"></tbody></table></div></div>
    <div class="grid g3" style="margin-top:14px">${imgs.map(k=>`<div class="card vis"><img src="${V[k]}"></div>`).join('')}</div>`;
    const draw=()=>{const q=norm($(`[data-q="${id}"]`).value),sg=$(`[data-s="${id}"]`).value;
      const F=L.filter(c=>(!sg||c.seg===sg)&&(!q||norm(c.nom+' '+c.gest+' '+c.prod+' '+c.cli).includes(q)));
      $('#tb-'+id).innerHTML=F.map(c=>`<tr><td><b>${esc(c.nom)}</b></td><td>${esc(c.seg)}</td><td>${esc(c.gest)}</td><td>${esc(c.prod)}</td><td><span class="tag ${c.stg===3?'risk':'warn'}">${c.flux}</span></td><td>${esc(c.clsA)}</td><td>${esc(c.cls)}</td><td class="r">${c.dpd}</td><td class="r">${fmt(c.ead)}</td><td class="r">${fmt(c.coll)}</td><td class="r">${fmt(c.provA)}</td><td class="r">${fmt(c.ecl)}</td><td class="r" style="color:var(--risk);font-weight:700">${fmt(c.imp)}</td></tr>`).join('')||'<tr><td colspan="13" class="empty">Aucun nom</td></tr>';};
    $(`[data-q="${id}"]`).oninput=draw;$(`[data-s="${id}"]`).onchange=draw;draw();};
  list('s3',A.s3,'S3 incoming — Entrées en Stage 3',['top3','imp3','seg3']);
  list('s2',A.s2,'S2 incoming — Entrées en Stage 2',['top2','imp2','seg2']);
  const L3=['Stage 1','Stage 2','Stage 3'];
  $('#p-mx').innerHTML=`<div class="grid g2"><div class="card"><div class="hd"><h3>Matrice de migration — nombre de clients</h3><small>${dFR(A.ref.rep)} → ${dFR(A.cur.rep)}</small></div>
    <table class="mx"><thead><tr><th>Réf. \\ Courant</th>${L3.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${A.cnt.map((r,i)=>`<tr><td>${L3[i]}</td>${r.map((v,j)=>`<td style="background:${j>i?'#fbe3e2':j<i?'#e6f2d0':'#e3eff5'}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <p class="read" style="margin-top:12px">Vert = cure, rouge = dégradation. Sorties S2→S1 : <b>${A.outS2S1.length}</b> clients ; S3→S1 : <b>${A.outS3S1.length}</b>.</p></div><div class="card vis"><img src="${V.heat}"></div></div>`;
  const bt=A.bt;
  $('#p-imp').innerHTML=`<div class="grid g2"><div class="card"><div class="hd"><h3>Pondération des scénarios</h3><small>modifiable — recalcule tout</small></div>
    <div class="params"><div><label>Best estimate</label><input id="wBE" value="${P.W.be}"></div><div><label>Optimiste</label><input id="wO" value="${P.W.o}"></div><div><label>Downturn</label><input id="wDN" value="${P.W.dn}"></div></div>
    <div style="margin-top:10px"><button class="btn pri sm" id="bW">Recalculer</button></div>
    <table class="mx" style="margin-top:16px"><thead><tr><th>Flux</th><th>Clients</th><th>EAD</th><th>Provision réf.</th><th>ECL simulé</th><th>Impairment</th></tr></thead><tbody>
    ${['S1 → S3','S2 → S3','Nouveau → S3','S1 → S2'].map(k=>{const f=X.flows[k]||{n:0,ead:0,prov:0,ecl:0,imp:0};return `<tr><td>${k}</td><td>${f.n}</td><td>${fmt(f.ead)}</td><td>${fmt(f.prov)}</td><td>${fmt(f.ecl)}</td><td>${fmt(f.imp)}</td></tr>`;}).join('')}
    <tr class="gt"><td>Total à doter</td><td>${X.T3.n+X.T2.n}</td><td>${fmt(X.T3.ead+X.T2.ead)}</td><td>${fmt(X.T3.prov+X.T2.prov)}</td><td>${fmt(X.T3.ecl+X.T2.ecl)}</td><td>${fmt(X.tot)}</td></tr></tbody></table>
    <table class="mx" style="margin-top:16px"><thead><tr><th>Back-test ${dFR(A.ref.rep)}</th><th>Provision booké</th><th>ECL simulé</th><th>Écart</th></tr></thead><tbody>
    ${[1,2,3].map(s=>`<tr><td>Stage ${s}</td><td>${fmt(bt[s][1])}</td><td>${fmt(bt[s][2])}</td><td>${pct(bt[s][1]?bt[s][2]/bt[s][1]-1:0)}</td></tr>`).join('')}</tbody></table></div>
    <div><div class="card vis"><img src="${V.scen}"></div><div class="card vis" style="margin-top:14px"><img src="${V.flows}"></div><div class="card vis" style="margin-top:14px"><img src="${V.bt}"></div></div></div>`;
  $('#bW').onclick=async()=>{const a=num($('#wBE').value),b=num($('#wO').value),c=num($('#wDN').value);if(Math.abs(a+b+c-1)>1e-6){toast('Les pondérations doivent totaliser 100 %');return;}
    P.W={be:a,o:b,dn:c};await compute(true);show('imp');toast('Simulation recalculée');};
  $('#foot').textContent='ECOBANK SÉNÉGAL · Direction des Risques – Cellule Portefeuille · '+A.cur.rows.length+' lignes '+A.cur.name+' · '+A.ref.rows.length+' lignes '+A.ref.name+' · INTERNAL USE ONLY';
  show('syn');
}

/* ------------------------------------------------------------------ chargement */
let SNAPS=[];
async function loadFile(f){
  try{busy(true,'Lecture de '+f.name+'…');await tick();
    const buf=await f.arrayBuffer();const wb=XLSX.read(buf,{type:'array',cellDates:true,dense:true,cellStyles:false,cellHTML:false,cellNF:false});
    SNAPS=[];for(const n of wb.SheetNames){busy(true,'Lecture de l’onglet '+n+'…');await tick();const s=readSheet(wb.Sheets[n],n);if(s&&s.rows.length)SNAPS.push(s);}
    if(SNAPS.length<2)throw new Error('Il faut au moins deux onglets d’arrêté (ex. 31082026 et 30092026) avec les colonnes Contracts/Accounts et Stage IFRS9 Model.');
    SNAPS.sort((a,b)=>(a.rep||0)-(b.rep||0));
    const opt=(i)=>SNAPS.map((s,j)=>`<option value="${j}"${j===i?' selected':''}>${esc(s.name)} · ${dFR(s.rep)}</option>`).join('');
    $('#selCur').innerHTML=opt(SNAPS.length-1);$('#selRef').innerHTML=opt(SNAPS.length-2);$('#fCur').hidden=false;$('#fRef').hidden=false;
    await compute();
  }catch(e){console.error(e);busy(false);toast('Erreur : '+e.message);}
}
async function compute(keepTab){
  const cur=SNAPS[+$('#selCur').value],ref=SNAPS[+$('#selRef').value];
  if(cur===ref){toast('Choisissez deux arrêtés différents');return;}
  busy(true,'Moteur ECL — '+cur.name+'…');await tick();if(!cur._ecl){runEcl(cur);cur._ecl=1;}
  busy(true,'Moteur ECL — '+ref.name+'…');await tick();if(!ref._ecl){runEcl(ref);ref._ecl=1;}
  busy(true,'Migrations et impairment…');await tick();analyse(cur,ref);
  busy(true,'Visuels 3D…');await tick();await visuals();render();busy(false);
  toast(S.s3.length+' S3 incoming · '+S.s2.length+' S2 incoming · impairment '+fM(S.X.tot));
}

/* =====================================================================
   EXPORT EXCEL — ExcelJS + chirurgie XML (thème, slicers) via JSZip
   ===================================================================== */
const C={NAVY:'00415E',BLUE:'005C83',SKY:'1A86B3',LIME:'8CC63F',LIME2:'A6D867',GREEN:'6BA23A',INK:'12333F',MUT:'3E5C6B',LINE:'CFE0E7',BG1:'EEF4F7',RED:'C0392B',AMB:'D4A13A'};
const TXT='Segoe UI',NUMF='Consolas',AMT='#,##0;[Red]-#,##0;"–"',PCT='0.0%;[Red]-0.0%;"–"',INT='#,##0;-#,##0;"–"';
const argb=h=>'FF'+h;const fill=h=>({type:'pattern',pattern:'solid',fgColor:{argb:argb(h)}});
const thinB={style:'thin',color:{argb:argb(C.LINE)}};
const CL=n=>{let s='';while(n>0){const m=(n-1)%26;s=String.fromCharCode(65+m)+s;n=Math.floor((n-1)/26);}return s;};
const fx=(f,r)=>({formula:f,result:(typeof r==='number'&&!isFinite(r))?0:r});

function pngSizeB64(u){const b=atob(u.split(',')[1].slice(0,64));return {w:(b.charCodeAt(16)<<24|b.charCodeAt(17)<<16|b.charCodeAt(18)<<8|b.charCodeAt(19))>>>0,h:(b.charCodeAt(20)<<24|b.charCodeAt(21)<<16|b.charCodeAt(22)<<8|b.charCodeAt(23))>>>0};}
async function buildXlsx(){
  const A=S,X=S.X,V=S.V,W=P.W,wb=new ExcelJS.Workbook();
  wb.creator='PNDOYE · ESN-RISK';wb.title='Migrations S2 & S3 · '+dFR(A.cur.rep);wb.created=new Date();
  wb.calcProperties.fullCalcOnLoad=true;
  const IMG={};const imgId=k=>IMG[k]??(IMG[k]=wb.addImage({base64:V[k],extension:'png'}));
  const SL=[];const cd=dFR(A.cur.rep),rd=dFR(A.ref.rep);
  const font=(o)=>Object.assign({name:TXT,size:9.5,color:{argb:argb(C.INK)}},o||{});
  const img=(ws,k,col,row,width)=>{const s=pngSizeB64(V[k]);const h=Math.round(width*s.h/s.w);ws.addImage(imgId(k),{tl:{col:col-1,row:row-1},ext:{width,height:h},editAs:'oneCell'});return h;};
  function setup(ws,tab,widths,title,sub,last){
    ws.properties.tabColor={argb:argb(tab)};
    widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
    [30,30,22].forEach((h,i)=>ws.getRow(i+1).height=h);ws.getRow(4).height=4;
    const gf={type:'gradient',gradient:'angle',degree:0,stops:[{position:0,color:{argb:argb(C.NAVY)}},{position:1,color:{argb:argb(C.BLUE)}}]};
    for(let r=1;r<=3;r++)for(let c=1;c<=last;c++)ws.getCell(r,c).fill=gf;
    for(let c=1;c<=last;c++)ws.getCell(4,c).fill=fill(C.LIME);
    let x=ws.getCell(1,5);x.value=title;x.font=font({size:20,bold:true,color:{argb:'FFFFFFFF'}});x.alignment={vertical:'bottom'};
    x=ws.getCell(2,5);x.value=sub;x.font=font({size:11,color:{argb:'FFDCEBF2'}});x.alignment={vertical:'middle'};
    x=ws.getCell(3,5);x.value='ECOBANK SÉNÉGAL · Direction des Risques – Cellule Portefeuille · INTERNAL USE ONLY';x.font=font({size:9,italic:true,color:{argb:argb(C.LIME2)}});
    ws.addImage(imgId('badge'),{tl:{col:1,row:0},ext:{width:213,height:76},editAs:'oneCell'});
    ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:4'};
    ws.headerFooter={oddFooter:'&C&8ECOBANK SÉNÉGAL · Migrations S2 & S3 · '+cd+' · INTERNAL USE ONLY&R&8Page &P / &N'};
  }
  function section(ws,r,c1,c2,text,color){for(let c=c1;c<=c2;c++){const x=ws.getCell(r,c);x.fill=fill(color||C.NAVY);x.border={bottom:{style:'medium',color:{argb:argb(C.LIME)}}};}
    const x=ws.getCell(r,c1);x.value='  '+text;x.font=font({size:11,bold:true,color:{argb:'FFFFFFFF'}});x.alignment={vertical:'middle'};ws.getRow(r).height=22;}
  function tile(ws,r,c1,c2,label,value,sub,color,nf){
    for(let rr=r;rr<r+3;rr++)for(let c=c1;c<=c2;c++){const x=ws.getCell(rr,c);x.fill=fill(rr<r+2?'FFFFFF':C.BG1);
      x.border={left:c===c1?{style:'thick',color:{argb:argb(color)}}:undefined,top:rr===r?thinB:undefined,bottom:rr===r+2?thinB:undefined,right:c===c2?thinB:undefined};}
    for(let k=0;k<3;k++)ws.mergeCells(r+k,c1,r+k,c2);
    let x=ws.getCell(r,c1);x.value=label.toUpperCase();x.font=font({size:8.5,bold:true,color:{argb:argb(C.MUT)}});x.alignment={indent:1,vertical:'bottom'};
    x=ws.getCell(r+1,c1);x.value=value;x.font={name:NUMF,size:18,bold:true,color:{argb:argb(color)}};x.numFmt=nf||AMT;x.alignment={indent:1,vertical:'middle',horizontal:'left'};
    x=ws.getCell(r+2,c1);x.value=sub;x.font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});x.alignment={indent:1,vertical:'middle'};
    ws.getRow(r).height=17;ws.getRow(r+1).height=30;ws.getRow(r+2).height=16;}
  function header(ws,r,c1,heads){heads.forEach((h,i)=>{const x=ws.getCell(r,c1+i);x.value=h;x.fill=fill(C.NAVY);x.font=font({size:9.5,bold:true,color:{argb:'FFFFFFFF'}});
    x.alignment={horizontal:'center',vertical:'middle',wrapText:true};x.border={bottom:{style:'thick',color:{argb:argb(C.LIME)}},right:{style:'thin',color:{argb:'FF2A6584'}}};});ws.getRow(r).height=34;}
  function body(x,nf,o){o=o||{};x.font={name:nf&&nf!=='date'?NUMF:TXT,size:9.5,bold:!!o.bold,color:{argb:argb(o.color||C.INK)}};
    if(nf==='date')x.numFmt='dd/mm/yyyy';else if(nf)x.numFmt=nf;x.border={bottom:thinB};x.alignment={horizontal:o.align||(nf&&nf!=='date'?'right':'left'),vertical:'middle'};}
  function table(ws,name,r1,c1,heads,rows){ws.addTable({name,displayName:name,ref:CL(c1)+r1,headerRow:true,totalsRow:false,style:{theme:'TableStyleMedium2',showRowStripes:true},
    columns:heads.map(h=>({name:h,filterButton:true})),rows});}
  function stageCF(ws,ref){ws.addConditionalFormatting({ref,rules:[
    {type:'cellIs',operator:'equal',formulae:['3'],priority:1,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF6D5D1'}},font:{bold:true,color:{argb:argb(C.RED)}}}},
    {type:'cellIs',operator:'equal',formulae:['2'],priority:2,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF8EBCB'}},font:{bold:true,color:{argb:'FF8A5A00'}}}},
    {type:'cellIs',operator:'equal',formulae:['1'],priority:3,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFE3F1D3'}},font:{bold:true,color:{argb:'FF3F7A1E'}}}}]});}
  const dbar=(ws,ref,col)=>ws.addConditionalFormatting({ref,rules:[{type:'dataBar',priority:10,minLength:0,maxLength:100,gradient:true,cfvo:[{type:'num',value:0},{type:'max'}],color:{argb:argb(col)}}]});

  const ws0=wb.addWorksheet('SYNTHESE',{views:[{state:'frozen',ySplit:4,showGridLines:false,showRowColHeaders:false,zoomScale:90}]});
  const wsI=wb.addWorksheet('IMPAIRMENT',{views:[{showGridLines:false,showRowColHeaders:false,zoomScale:90}]});
  const HR=16;
  const sheetOpts={views:[{state:'frozen',xSplit:3,ySplit:0,showGridLines:false,zoomScale:85}]};   // colonnes figées seulement : l'en-tête du tableau Excel remplace A,B,C au défilement
  const ws3=wb.addWorksheet('S3 INCOMING',sheetOpts),ws2=wb.addWorksheet('S2 INCOMING',sheetOpts);
  const wsM=wb.addWorksheet('MATRICE MIGRATION',{views:[{showGridLines:false,showRowColHeaders:false,zoomScale:90}]});
  const wsD=wb.addWorksheet('DETAIL CONTRATS',{views:[{state:'frozen',xSplit:4,ySplit:0,showGridLines:false,zoomScale:85}]});
  const wsB=wb.addWorksheet('BASE CLIENTS',sheetOpts);

  /* --- IMPAIRMENT : pondérations (noms définis) */
  setup(wsI,C.NAVY,[2,30,15,17,17,17,17,17,14,3,12,12,12,12,12,12,12,12,12],'IMPAIRMENT À PRENDRE — Simulation ECL','Moteur ECL du PDO Monitor (PwC · Vasicek · 3 scénarios) appliqué aux entrants S2 & S3',9);
  section(wsI,6,2,9,'PARAMÈTRES DE PONDÉRATION DES SCÉNARIOS  (cellules jaunes modifiables → tout le classeur se recalcule)');
  [['Best estimate','W_BE',W.be,'+0,00'],['Optimiste','W_OPT',W.o,'-1,00'],['Downturn','W_DN',W.dn,'+1,96']].forEach(([l,k,v,z],i)=>{const r=7+i;
    body(wsI.getCell(r,2),null,{bold:true});wsI.getCell(r,2).value=l;
    const c=wsI.getCell(r,3);c.value=v;body(c,'0%',{color:'0000FF'});c.fill=fill('FFF4B8');
    wb.definedNames.add("'IMPAIRMENT'!$C$"+r,k);wsI.mergeCells(r,4,r,6);const n=wsI.getCell(r,4);n.value='Choc Vasicek z = '+z;body(n,null,{color:C.MUT});});
  wsI.getCell(7,3).note='Source : ECL_PARAMS.scenarios du PDO Monitor (best 0,60 / optimistic 0,20 / downturn 0,20).';
  wsI.getCell(10,2).value='Total pondérations';body(wsI.getCell(10,2),null,{bold:true});
  wsI.getCell(10,3).value=fx('W_BE+W_OPT+W_DN',W.be+W.o+W.dn);body(wsI.getCell(10,3),'0%',{bold:true});
  wsI.getCell(10,4).value='doit être égal à 100 %';wsI.getCell(10,4).font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});

  /* --- feuilles clients S3 / S2 */
  const CC=[['Code client','cli',null,12],['Nom client','nom',null,36],['Segment','seg',null,13],['Gestionnaire','gest',null,20],['Produits','prod',null,15],['Nb contrats','nb',INT,9],
    ['Flux','flux',null,13],['Stage '+rd.slice(0,5),'stgA','stg',9],['Stage '+cd.slice(0,5),'stg','stg',9],['Classe '+rd.slice(0,5),'clsA',null,10],['Classe '+cd.slice(0,5),'cls',null,10],['Jours PDO max','dpd',INT,10],
    ['EAD '+rd.slice(0,5),'eadA',AMT,15],['EAD '+cd.slice(0,5),'ead',AMT,15],['Impayés PDO '+cd.slice(0,5),'pdo',AMT,14],['Garanties nettes','coll',AMT,15],['Provision IFRS9 '+rd.slice(0,5),'provA',AMT,15],
    ['ECL Best estimate','be',AMT,14],['ECL Optimiste','o',AMT,14],['ECL Downturn','dn',AMT,14],['ECL simulé '+cd.slice(0,5),'=ECL',AMT,15],['Impairment à prendre','=IMP',AMT,16],['Couverture ECL / EAD','=COV',PCT,11],['Décision Comité','dec',null,20],['Commentaire','com',null,30]];
  const REF={};
  function clientSheet(ws,L,tname,title,sub,color,imgs){
    const last=1+CC.length,col={};CC.forEach(([, k],i)=>col[k]=2+i);const Lc=k=>CL(col[k]);
    setup(ws,color,[2,...CC.map(c=>c[3]),3],title,sub,last);
    const r1=HR+1,r2=HR+Math.max(1,L.length),rg=k=>Lc(k)+r1+':'+Lc(k)+r2;
    const T={ead:sum(L,c=>c.ead),prov:sum(L,c=>c.provA),ecl:sum(L,c=>c.ecl),imp:sum(L,c=>c.imp)};
    [['Clients filtrés',fx(`SUBTOTAL(103,${rg('cli')})`,L.length),'nombre de noms visibles',C.NAVY,INT,2,3],
     ['EAD '+cd,fx(`SUBTOTAL(109,${rg('ead')})`,T.ead),'exposition XOF',C.BLUE,AMT,4,6],
     ['Provision IFRS9 '+rd,fx(`SUBTOTAL(109,${rg('provA')})`,T.prov),'déjà constituée',C.MUT,AMT,7,10],
     ['ECL simulé '+cd,fx(`SUBTOTAL(109,${rg('=ECL')})`,T.ecl),'pondéré 3 scénarios',C.SKY,AMT,11,14],
     ['Impairment à prendre',fx(`SUBTOTAL(109,${rg('=IMP')})`,T.imp),'ECL simulé − provision '+rd,C.RED,AMT,15,18],
     ['Couverture ECL',fx(`IFERROR(SUBTOTAL(109,${rg('=ECL')})/SUBTOTAL(109,${rg('ead')}),0)`,T.ead?T.ecl/T.ead:0),'ECL / EAD',C.GREEN,PCT,19,21]]
     .forEach(([l,f,s,c,nf,a,b])=>tile(ws,6,a,b,l,f,s,c,nf));
    const n=ws.getCell(10,2);n.value='▸ FILTRES — cliquer dans les segments ci-dessous (Ctrl+clic = multi-sélection) ; les tuiles et totaux se recalculent';n.font=font({size:9,bold:true,color:{argb:argb(C.GREEN)}});
    for(let r=11;r<HR-1;r++)ws.getRow(r).height=26;ws.getRow(HR-1).height=8;
    const rows=L.map((c,i)=>{const r=r1+i;return CC.map(([,k,nf])=>{
      if(k==='=ECL')return fx(`W_BE*${Lc('be')}${r}+W_OPT*${Lc('o')}${r}+W_DN*${Lc('dn')}${r}`,c.ecl);
      if(k==='=IMP')return fx(`${Lc('=ECL')}${r}-${Lc('provA')}${r}`,c.imp);
      if(k==='=COV')return fx(`IFERROR(${Lc('=ECL')}${r}/${Lc('ead')}${r},0)`,c.ead?c.ecl/c.ead:0);
      const v=c[k];if(nf==='stg')return v?v:'Nouveau';if(nf)return Math.round(v||0);return v==null?'':String(v);});});
    if(!rows.length)rows.push(CC.map(()=>''));
    table(ws,tname,HR,2,CC.map(c=>c[0]),rows);
    header(ws,HR,2,CC.map(c=>c[0]));
    rows.forEach((_,i)=>{const r=r1+i;ws.getRow(r).height=17;CC.forEach(([,k,nf])=>{const x=ws.getCell(r,col[k]);
      body(x,nf==='stg'?null:nf,{bold:k==='nom'||k==='=IMP',color:k==='=IMP'?C.RED:C.INK,align:(nf==='stg'||['flux','cls','clsA','seg'].includes(k))?'center':undefined});});});
    const tr=r2+2;for(let c=2;c<=last;c++){const x=ws.getCell(tr,c);x.fill=fill(C.NAVY);x.border={top:{style:'thick',color:{argb:argb(C.LIME)}}};}
    ws.getCell(tr,2).value='TOTAL (filtré)';ws.getCell(tr,2).font=font({size:10,bold:true,color:{argb:'FFFFFFFF'}});
    const tot={nb:sum(L,c=>c.nb),eadA:sum(L,c=>c.eadA),ead:T.ead,pdo:sum(L,c=>c.pdo),coll:sum(L,c=>c.coll),provA:T.prov,be:sum(L,c=>c.be),o:sum(L,c=>c.o),dn:sum(L,c=>c.dn),'=ECL':T.ecl,'=IMP':T.imp};
    Object.keys(tot).forEach(k=>{const x=ws.getCell(tr,col[k]);x.value=fx(`SUBTOTAL(109,${rg(k)})`,tot[k]);x.numFmt=AMT;x.font={name:NUMF,size:10,bold:true,color:{argb:k==='=IMP'?argb(C.LIME2):'FFFFFFFF'}};x.alignment={horizontal:'right'};});
    let x=ws.getCell(tr,col['=COV']);x.value=fx(`IFERROR(${Lc('=ECL')}${tr}/${Lc('ead')}${tr},0)`,T.ead?T.ecl/T.ead:0);x.numFmt=PCT;x.font={name:NUMF,size:10,bold:true,color:{argb:'FFFFFFFF'}};
    ws.getRow(tr).height=22;
    stageCF(ws,Lc('stgA')+r1+':'+Lc('stg')+r2);dbar(ws,rg('ead'),C.BLUE);dbar(ws,rg('=IMP'),C.RED);dbar(ws,rg('provA'),C.LIME);
    ws.addConditionalFormatting({ref:rg('dpd'),rules:[{type:'colorScale',priority:20,cfvo:[{type:'num',value:0},{type:'num',value:90},{type:'num',value:180}],color:[{argb:'FFFFFFFF'},{argb:'FFF8EBCB'},{argb:'FFF1A9A0'}]},
      {type:'iconSet',priority:21,iconSet:'3Flags',reverse:true,showValue:true,cfvo:[{type:'num',value:0},{type:'num',value:90},{type:'num',value:180}]}]});
    ws.addConditionalFormatting({ref:rg('=COV'),rules:[{type:'iconSet',priority:22,iconSet:'3Symbols2',reverse:false,showValue:true,cfvo:[{type:'num',value:0},{type:'num',value:0.2},{type:'num',value:0.5}]}]});
    // suivi Comité : liste déroulante + couleurs de décision
    ws.dataValidations.add(rg('dec'),{type:'list',allowBlank:true,showErrorMessage:true,errorTitle:'Décision Comité',error:'Choisir une valeur de la liste',
      formulae:['"À revoir,Dotation validée,Garantie à vérifier,Reprise à confirmer,Sortie attendue"']});
    for(let r=r1;r<=r2;r++){const a=ws.getCell(r,col.dec),b=ws.getCell(r,col.com);a.fill=fill('FFFBEA');b.fill=fill('FFFBEA');a.alignment={horizontal:'center',vertical:'middle'};}
    ws.getCell(HR,col.dec).note='Liste déroulante : décision du Comité des Risques pour ce nom (cellules jaunes à renseigner).';
    const dcf=(t,bg,fc,pr)=>({type:'cellIs',operator:'equal',formulae:['"'+t+'"'],priority:pr,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FF'+bg}},font:{bold:true,color:{argb:'FF'+fc}}}});
    ws.addConditionalFormatting({ref:rg('dec'),rules:[dcf('Dotation validée','E3F1D3','3F7A1E',40),dcf('À revoir','F8EBCB','8A5A00',41),dcf('Garantie à vérifier','DCEBF2','005C83',42),dcf('Reprise à confirmer','F6D5D1','C0392B',43),dcf('Sortie attendue','EEF4F7','3E5C6B',44)]});
    [['Segment',2,3,1,'SlicerStyleDark1'],['Flux',4,6,1,'SlicerStyleDark2'],['Classe '+cd.slice(0,5),7,8,1,'SlicerStyleDark3'],['Produits',9,12,2,'SlicerStyleDark5'],['Gestionnaire',13,21,3,'SlicerStyleDark6']]
      .forEach(([cn,a,b,cc,st])=>SL.push({sheet:ws.name,table:tname,col:cn,cap:cn.replace(/ \d\d\/\d\d$/,''),anc:[a-1,10,b,HR-2],st,cc}));
    const xc=last+2;ws.getColumn(xc-1).width=3;for(let i=xc;i<xc+12;i++)ws.getColumn(i).width=11;
    let r=6;imgs.forEach(k=>{const h=img(ws,k,xc,r,620);r+=Math.floor(h/20)+2;});
    REF[tname]={sheet:ws.name,r1,r2,Lc,L};
  }
  clientSheet(ws3,A.s3,'T_S3_INCOMING','S3 INCOMING — Entrées en Stage 3',`${A.s3.length} clients passés en Stage 3 entre le ${rd} et le ${cd} · détail des noms`,C.RED,['top3','imp3','seg3']);
  clientSheet(ws2,A.s2,'T_S2_INCOMING','S2 INCOMING — Entrées en Stage 2',`${A.s2.length} clients passés en Stage 2 entre le ${rd} et le ${cd} · détail des noms`,C.AMB,['top2','imp2','seg2']);
  const R=(t,k)=>{const x=REF[t];return `'${x.sheet}'!$${x.Lc(k)}$${x.r1}:$${x.Lc(k)}$${x.r2}`;};

  /* --- IMPAIRMENT : tableaux */
  section(wsI,12,2,9,'IMPAIRMENT À PRENDRE PAR FLUX DE MIGRATION  (formules liées aux onglets S3 / S2 INCOMING)');
  header(wsI,13,2,['Flux de migration','Nb clients','EAD '+cd,'Provision IFRS9 '+rd,'ECL simulé '+cd,'Impairment à prendre','Couverture ECL','Poids dans l’impairment']);
  const FL=[['S1 → S3','T_S3_INCOMING'],['S2 → S3','T_S3_INCOMING'],['Nouveau → S3','T_S3_INCOMING'],['S1 → S2','T_S2_INCOMING']];
  const fv=k=>X.flows[k]||{n:0,ead:0,prov:0,ecl:0,imp:0};
  FL.forEach(([f,t],i)=>{const r=14+i,v=fv(f);wsI.getCell(r,2).value=f;body(wsI.getCell(r,2),null,{bold:true});
    let x=wsI.getCell(r,3);x.value=fx(`COUNTIFS(${R(t,'flux')},B${r})`,v.n);body(x,INT);
    [['ead',v.ead],['provA',v.prov],['=ECL',v.ecl],['=IMP',v.imp]].forEach(([k,val],j)=>{x=wsI.getCell(r,4+j);x.value=fx(`SUMIFS(${R(t,k)},${R(t,'flux')},$B${r})`,val);body(x,AMT,{bold:k==='=IMP',color:k==='=IMP'?C.RED:C.INK});});
    x=wsI.getCell(r,8);x.value=fx(`IFERROR(F${r}/D${r},0)`,v.ead?v.ecl/v.ead:0);body(x,PCT);
    x=wsI.getCell(r,9);x.value=fx(`IFERROR(G${r}/$G$20,0)`,X.tot?v.imp/X.tot:0);body(x,PCT);});
  const sub=(ks)=>ks.reduce((o,k)=>{const v=fv(k);o.n+=v.n;o.ead+=v.ead;o.prov+=v.prov;o.ecl+=v.ecl;o.imp+=v.imp;return o;},{n:0,ead:0,prov:0,ecl:0,imp:0});
  const ST={18:sub(['S1 → S3','S2 → S3','Nouveau → S3']),19:sub(['S1 → S2'])};ST[20]=sub(['S1 → S3','S2 → S3','Nouveau → S3','S1 → S2']);
  [[18,'Sous-total S3 incoming',14,16],[19,'Sous-total S2 incoming',17,17],[20,'TOTAL À DOTER',14,17]].forEach(([r,l,a,b])=>{const big=r===20,v=ST[r];
    for(let c=2;c<=9;c++){const x=wsI.getCell(r,c);x.fill=fill(big?C.NAVY:C.BG1);x.border={top:{style:big?'thick':'thin',color:{argb:argb(big?C.LIME:C.LINE)}}};}
    wsI.getCell(r,2).value=l;wsI.getCell(r,2).font=font({size:10,bold:true,color:{argb:big?'FFFFFFFF':argb(C.NAVY)}});
    const vals=[v.n,v.ead,v.prov,v.ecl,v.imp];
    for(let c=3;c<=7;c++){const x=wsI.getCell(r,c);x.value=fx(big?`${CL(c)}18+${CL(c)}19`:`SUM(${CL(c)}${a}:${CL(c)}${b})`,vals[c-3]);x.numFmt=c===3?INT:AMT;
      x.font={name:NUMF,size:big?10.5:10,bold:true,color:{argb:big?(c===7?argb(C.LIME2):'FFFFFFFF'):(c===7?argb(C.RED):argb(C.NAVY))}};}
    let x=wsI.getCell(r,8);x.value=fx(`IFERROR(F${r}/D${r},0)`,v.ead?v.ecl/v.ead:0);x.numFmt=PCT;x.font={name:NUMF,bold:true,color:{argb:big?'FFFFFFFF':argb(C.NAVY)}};
    x=wsI.getCell(r,9);x.value=fx(`IFERROR(G${r}/$G$20,0)`,X.tot?v.imp/X.tot:0);x.numFmt=PCT;x.font={name:NUMF,bold:true,color:{argb:big?'FFFFFFFF':argb(C.NAVY)}};wsI.getRow(r).height=20;});
  wsI.getCell(21,2).value='Dotations brutes (clients à impairment positif)';wsI.getCell(21,2).font=font({size:9,color:{argb:argb(C.MUT)}});
  let x=wsI.getCell(21,7);x.value=fx(`SUMIF(${R('T_S3_INCOMING','=IMP')},">0")+SUMIF(${R('T_S2_INCOMING','=IMP')},">0")`,X.dot);body(x,AMT);
  wsI.getCell(22,2).value='Reprises théoriques (provision > ECL simulé)';wsI.getCell(22,2).font=font({size:9,color:{argb:argb(C.MUT)}});
  x=wsI.getCell(22,7);x.value=fx(`SUMIF(${R('T_S3_INCOMING','=IMP')},"<0")+SUMIF(${R('T_S2_INCOMING','=IMP')},"<0")`,X.rep);body(x,AMT);
  dbar(wsI,'G14:G17',C.RED);
  section(wsI,24,2,9,'SENSIBILITÉ PAR SCÉNARIO — ENTRANTS S2 + S3');
  header(wsI,25,2,['Scénario','Pondération','ECL S3 incoming','ECL S2 incoming','ECL total','Provision '+rd,'Impairment à prendre','vs pondéré']);
  const provT=X.T3.prov+X.T2.prov,wImp=X.T3.ecl+X.T2.ecl-provT;
  [['Optimiste','o','W_OPT',W.o],['Best estimate','be','W_BE',W.be],['Downturn','dn','W_DN',W.dn],['Pondéré (retenu)','=ECL','W_BE+W_OPT+W_DN',W.be+W.o+W.dn]].forEach(([l,k,w,wv],i)=>{const r=26+i;
    const e3=k==='=ECL'?X.T3.ecl:X.T3[k],e2=k==='=ECL'?X.T2.ecl:X.T2[k];
    wsI.getCell(r,2).value=l;body(wsI.getCell(r,2),null,{bold:true});
    x=wsI.getCell(r,3);x.value=fx(w,wv);body(x,'0%');
    x=wsI.getCell(r,4);x.value=fx(`SUM(${R('T_S3_INCOMING',k)})`,e3);body(x,AMT);
    x=wsI.getCell(r,5);x.value=fx(`SUM(${R('T_S2_INCOMING',k)})`,e2);body(x,AMT);
    x=wsI.getCell(r,6);x.value=fx(`D${r}+E${r}`,e3+e2);body(x,AMT,{bold:true});
    x=wsI.getCell(r,7);x.value=fx('$E$20',provT);body(x,AMT);
    x=wsI.getCell(r,8);x.value=fx(`F${r}-G${r}`,e3+e2-provT);body(x,AMT,{bold:true,color:C.RED});
    x=wsI.getCell(r,9);x.value=fx(`H${r}-$H$29`,e3+e2-provT-wImp);body(x,AMT,{color:C.MUT});
    if(k==='=ECL')for(let c=2;c<=9;c++)wsI.getCell(r,c).fill=fill(C.BG1);});
  section(wsI,31,2,9,'BACK-TEST DU MOTEUR SUR L’ARRÊTÉ '+rd+'  (fiabilité de la simulation)');
  header(wsI,32,2,['Stage IFRS9','Contrats','Provision IFRS9 comptabilisée '+rd,'ECL simulé '+rd+' (moteur)','Écart','Écart %','EAD '+cd,'ECL simulé '+cd+' (portefeuille)']);
  const bt=A.bt,sp=A.sep;
  [1,2,3].forEach((s,i)=>{const r=33+i;wsI.getCell(r,2).value='Stage '+s;body(wsI.getCell(r,2),null,{bold:true});
    const vals=[[bt[s][0],INT],[Math.round(bt[s][1]),AMT],[Math.round(bt[s][2]),AMT]];vals.forEach(([v,nf],j)=>{x=wsI.getCell(r,3+j);x.value=v;body(x,nf);});
    x=wsI.getCell(r,6);x.value=fx(`E${r}-D${r}`,Math.round(bt[s][2])-Math.round(bt[s][1]));body(x,AMT);
    x=wsI.getCell(r,7);x.value=fx(`IFERROR(F${r}/D${r},0)`,bt[s][1]?(Math.round(bt[s][2])-Math.round(bt[s][1]))/Math.round(bt[s][1]):0);body(x,PCT);
    x=wsI.getCell(r,8);x.value=Math.round(sp[s][0]);body(x,AMT);x=wsI.getCell(r,9);x.value=Math.round(sp[s][1]);body(x,AMT);});
  for(let c=2;c<=9;c++)wsI.getCell(36,c).fill=fill(C.NAVY);
  wsI.getCell(36,2).value='TOTAL';wsI.getCell(36,2).font=font({bold:true,color:{argb:'FFFFFFFF'}});
  const btT=k=>[1,2,3].reduce((s,i)=>s+Math.round(k(i)),0);
  [[3,btT(i=>bt[i][0])],[4,btT(i=>bt[i][1])],[5,btT(i=>bt[i][2])],[6,btT(i=>bt[i][2])-btT(i=>bt[i][1])],[8,btT(i=>sp[i][0])],[9,btT(i=>sp[i][1])]].forEach(([c,v])=>{
    x=wsI.getCell(36,c);x.value=fx(`SUM(${CL(c)}33:${CL(c)}35)`,v);x.numFmt=c===3?INT:AMT;x.font={name:NUMF,bold:true,color:{argb:'FFFFFFFF'}};});
  x=wsI.getCell(36,7);x.value=fx('IFERROR(F36/D36,0)',btT(i=>bt[i][1])?(btT(i=>bt[i][2])-btT(i=>bt[i][1]))/btT(i=>bt[i][1]):0);x.numFmt=PCT;x.font={name:NUMF,bold:true,color:{argb:'FFFFFFFF'}};
  wsI.getCell(37,2).value=`Valeurs calculées par l’application (réplique de eclRun) sur les onglets ${A.ref.name} / ${A.cur.name} du fichier PORTEFEUILLE.`;wsI.getCell(37,2).font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});
  section(wsI,39,2,9,'PARAMÈTRES DU MOTEUR (ECL_PARAMS du PDO Monitor — ancre PwC)');
  header(wsI,40,2,['Notation (FRR)','PD 12 mois','Notation S&P (lifetime)','PD cumulée 1 an','PD cumulée 3 ans','PD cumulée 5 ans','','']);
  for(let rk=1;rk<=10;rk++){const r=40+rk,spn=P.rankToSP[rk];x=wsI.getCell(r,2);x.value=rk;body(x,null,{align:'center'});x=wsI.getCell(r,3);x.value=P.pd12[rk];body(x,'0.000%');
    x=wsI.getCell(r,4);x.value=spn;body(x,null,{align:'center'});[1,3,5].forEach((h,j)=>{x=wsI.getCell(r,5+j);x.value=spn==='D'?1:P.spCum[spn][h-1];body(x,'0.00%');});}
  header(wsI,52,2,['Segment (LGD)','Taux de cure','Récup. non sécurisée 0-89j','90-179j','180-269j','270-359j','≥ 360j','']);
  Object.entries(P.lgd).forEach(([k,v],i)=>{const r=53+i;x=wsI.getCell(r,2);x.value=k;body(x,null,{bold:true});x=wsI.getCell(r,3);x.value=v.cure;body(x,PCT);
    v.be.forEach((b,j)=>{x=wsI.getCell(r,4+j);x.value=b;body(x,'0.00%');});});
  header(wsI,57,2,['Autres paramètres','Valeur','Commentaire','','','','','']);
  [['Corrélation Vasicek ρ',0.15,'PD conditionnelle : Φ((Φ⁻¹(PD)+√ρ·z)/√(1−ρ))'],['Taux d’actualisation (EIR)',0.08,'Actualisation lifetime Stage 2 / 3 sur la maturité résiduelle (0,5 à 7 ans)'],
   ['CCF hors bilan (CKU, LCU)',P.ccf,'EAD = max(encours, limite) × CCF'],['Facteur collatéral downturn',0.95,'Valeur de réalisation des garanties en scénario dégradé'],
   ['Haircut immobilier commercial',0.0937,'Garanties nettes = OMV × (1 − haircut du type) ; codes sécurité 6xxx/7xxx/8xxx exclus'],['Haircut domiciliation / créances',0.0545,'Codes 42xx / 43xx'],['Haircut cash / DAT',0.0286,'Codes 3xxx']]
   .forEach(([a,v,cm],i)=>{const r=58+i;x=wsI.getCell(r,2);x.value=a;body(x,null,{bold:true});x=wsI.getCell(r,3);x.value=v;body(x,v<0.99?'0.00%':'0.0000%');
     wsI.mergeCells(r,4,r,9);x=wsI.getCell(r,4);x.value=cm;body(x,null,{color:C.MUT});});
  section(wsI,66,2,9,'MÉTHODOLOGIE');
  [`1. Rapprochement des deux arrêtés du fichier PORTEFEUILLE (${rd} : ${A.ref.rows.length} lignes · ${cd} : ${A.cur.rows.length} lignes) au niveau CLIENT (Code Client).`,
   `2. Stage client = stage IFRS9 le plus dégradé de ses contrats (colonne « Stage IFRS9 Model »). S3 incoming = Stage 3 au ${cd} et < 3 au ${rd} ; S2 incoming = Stage 2 au ${cd} et Stage 1 (ou absent) au ${rd}.`,
   `3. Sont exclus des listes les noms à exposition nulle au ${cd} (${A.z3} en S3, ${A.z2} en S2 : comptes soldés / lignes techniques sans impact ECL).`,
   '4. ECL simulé = réplique du moteur eclRun() du PDO Monitor : PD 12 mois (S1) ou lifetime S&P (S2) conditionnée Vasicek, PD = 100 % en S3, LGD par segment net des garanties (haircut par type, allouées au prorata de l’EAD client), cure rate, actualisation 8 %.',
   `5. Impairment à prendre = ECL simulé ${cd} − provision IFRS9 comptabilisée au ${rd} sur le même client. Un montant négatif = reprise théorique (à ne pas extourner sans revue individuelle).`,
   '6. Les pondérations des scénarios (C7:C9) sont modifiables : les colonnes « ECL simulé », « Impairment à prendre » et toutes les synthèses se recalculent.']
   .forEach((t,i)=>{const r=67+i;wsI.mergeCells(r,2,r,9);x=wsI.getCell(r,2);x.value=t;x.font=font({size:9});x.alignment={wrapText:true,vertical:'top'};wsI.getRow(r).height=30;});
  let ry=6;['flows','scen','bt'].forEach(k=>{const h=img(wsI,k,11,ry,640);ry+=Math.floor(h/20)+2;});

  /* --- BASE CLIENTS */
  const BC=[['Code client','cli',null,12],['Nom client','nom',null,34],['Segment','seg',null,13],['Gestionnaire','gest',null,20],['Stage '+rd.slice(0,5),'stgA',INT,9],['Stage '+cd.slice(0,5),'stg',INT,9],['Flux','flux',null,15],
    ['EAD '+rd.slice(0,5),'eadA',AMT,15],['EAD '+cd.slice(0,5),'ead',AMT,15],['Provision IFRS9 '+rd.slice(0,5),'provA',AMT,15],['ECL Best estimate','be',AMT,14],['ECL Optimiste','o',AMT,14],['ECL Downturn','dn',AMT,14],
    ['ECL simulé '+cd.slice(0,5),'=ECL',AMT,15],['Δ ECL vs provision','=IMP',AMT,15]];
  setup(wsB,C.MUT,[2,...BC.map(c=>c[3])],'BASE CLIENTS — Rapprochement '+rd.slice(0,5)+' ↔ '+cd.slice(0,5),fmt(A.base.length)+' clients · stage max par client · alimente la matrice de migration',1+BC.length);
  const bcol={};BC.forEach(([,k],i)=>bcol[k]=2+i);const BL=k=>CL(bcol[k]);const b1=HR+1,b2=HR+A.base.length;const brg=k=>BL(k)+b1+':'+BL(k)+b2;
  const e=S.ecl;
  tile(wsB,6,2,3,'Clients filtrés',fx(`SUBTOTAL(103,${brg('cli')})`,A.base.length),'noms visibles',C.NAVY,INT);
  tile(wsB,6,4,6,'EAD '+cd,fx(`SUBTOTAL(109,${brg('ead')})`,sum(A.base,b=>Math.round(b.ead))),'XOF',C.BLUE);
  tile(wsB,6,7,9,'EAD '+rd,fx(`SUBTOTAL(109,${brg('eadA')})`,sum(A.base,b=>Math.round(b.eadA))),'XOF',C.MUT);
  tile(wsB,6,10,12,'ECL simulé '+cd,fx(`SUBTOTAL(109,${brg('=ECL')})`,sum(A.base,b=>e(b))),'portefeuille filtré',C.SKY);
  tile(wsB,6,13,16,'Provision '+rd,fx(`SUBTOTAL(109,${brg('provA')})`,sum(A.base,b=>Math.round(b.provA))),'comptabilisée',C.GREEN);
  x=wsB.getCell(10,2);x.value='▸ FILTRES';x.font=font({size:9,bold:true,color:{argb:argb(C.GREEN)}});
  for(let r=11;r<HR-1;r++)wsB.getRow(r).height=26;wsB.getRow(HR-1).height=8;
  const brows=A.base.map((b,i)=>{const r=b1+i;return BC.map(([,k,nf])=>{if(k==='=ECL')return fx(`W_BE*${BL('be')}${r}+W_OPT*${BL('o')}${r}+W_DN*${BL('dn')}${r}`,e(b));
    if(k==='=IMP')return fx(`${BL('=ECL')}${r}-${BL('provA')}${r}`,e(b)-Math.round(b.provA));return nf?Math.round(b[k]||0):(b[k]==null?'':String(b[k]));});});
  table(wsB,'T_BASE',HR,2,BC.map(c=>c[0]),brows);header(wsB,HR,2,BC.map(c=>c[0]));
  const ft={name:TXT,size:9,color:{argb:argb(C.INK)}},fn={name:NUMF,size:9,color:{argb:argb(C.INK)}},fr={name:NUMF,size:9,bold:true,color:{argb:argb(C.RED)}};
  for(let i=0;i<A.base.length;i++){const row=wsB.getRow(b1+i);BC.forEach(([,k,nf])=>{const c=row.getCell(bcol[k]);c.font=k==='=IMP'?fr:nf?fn:ft;if(nf)c.numFmt=nf;});}
  stageCF(wsB,BL('stgA')+b1+':'+BL('stg')+b2);
  [['Segment',2,3,1,'SlicerStyleDark1'],['Stage '+rd.slice(0,5),4,5,2,'SlicerStyleDark3'],['Stage '+cd.slice(0,5),6,7,2,'SlicerStyleDark2'],['Flux',8,16,4,'SlicerStyleDark6']]
    .forEach(([cn,a,b,cc,st])=>SL.push({sheet:wsB.name,table:'T_BASE',col:cn,cap:cn,anc:[a-1,10,b,HR-2],st,cc}));
  const BR=k=>`'BASE CLIENTS'!$${BL(k)}$${b1}:$${BL(k)}$${b2}`;

  /* --- MATRICE */
  setup(wsM,C.BLUE,[2,24,15,15,15,15,15,3,12,12,12,12,12,12,12,12],'MATRICE DE MIGRATION — Stage '+rd.slice(0,5)+' → '+cd.slice(0,5),'Niveau client · nombre de noms et EAD (formules COUNTIFS / SUMIFS sur BASE CLIENTS)',7);
  const rowsM=[['Stage 1',1],['Stage 2',2],['Stage 3',3],['Nouveaux clients',0]],colsM=[['Stage 1',1],['Stage 2',2],['Stage 3',3],['Sortis',0]];
  function matrix(r0,title,kind){section(wsM,r0,2,7,title);header(wsM,r0+1,2,[rd.slice(0,5)+'  \\  '+cd.slice(0,5),...colsM.map(c=>c[0]),'Total']);
    const val=(rv,cv)=>{const L=A.base.filter(b=>b.stgA===rv&&b.stg===cv);return kind==='n'?L.length:sum(L,b=>Math.round(kind==='a'?b.eadA:b.ead));};
    const colT=[0,0,0,0,0];
    rowsM.forEach(([rl,rv],i)=>{const r=r0+2+i;x=wsM.getCell(r,2);x.value=rl;body(x,null,{bold:true});x.fill=fill(C.BG1);let rt=0;
      colsM.forEach(([,cv],j)=>{const v=val(rv,cv);rt+=v;colT[j]+=v;x=wsM.getCell(r,3+j);
        x.value=fx(kind==='n'?`COUNTIFS(${BR('stgA')},${rv},${BR('stg')},${cv})`:`SUMIFS(${BR(kind==='a'?'eadA':'ead')},${BR('stgA')},${rv},${BR('stg')},${cv})`,v);
        body(x,kind==='n'?INT:AMT,{align:'center'});if(rv&&cv)x.fill=fill(cv<rv?'E3F1D3':cv>rv?'F6D5D1':'DCEBF2');});
      colT[4]+=rt;x=wsM.getCell(r,7);x.value=fx(`SUM(C${r}:F${r})`,rt);body(x,kind==='n'?INT:AMT,{bold:true,align:'center'});});
    const r=r0+6;for(let c=2;c<=7;c++)wsM.getCell(r,c).fill=fill(C.NAVY);wsM.getCell(r,2).value='Total';wsM.getCell(r,2).font=font({bold:true,color:{argb:'FFFFFFFF'}});
    for(let c=3;c<=7;c++){x=wsM.getCell(r,c);x.value=fx(`SUM(${CL(c)}${r0+2}:${CL(c)}${r0+5})`,colT[c-3]);x.numFmt=kind==='n'?INT:AMT;x.font={name:NUMF,bold:true,color:{argb:'FFFFFFFF'}};x.alignment={horizontal:'center'};}}
  matrix(6,'NOMBRE DE CLIENTS','n');matrix(14,'EAD AU '+rd+' (XOF) — d’où vient le risque','a');matrix(22,'EAD AU '+cd+' (XOF) — où il se trouve','b');
  x=wsM.getCell(30,2);x.value='Lecture : vert = amélioration (cure), rouge = dégradation, bleu = stabilité. Les entrées S2/S3 détaillées sont dans les onglets S2 / S3 INCOMING.';x.font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});
  img(wsM,'heat',9,6,600);

  /* --- DETAIL CONTRATS */
  const DC=[['Catégorie','cat',null,12],['Code client','cli',null,12],['Nom client','rel',null,32],['Contrat / compte','ctr',null,19],['Produit','prod',null,9],['Segment','bs',null,13],['Gestionnaire','ao',null,20],
    ['Stage '+rd.slice(0,5),'stgA',INT,9],['Stage '+cd.slice(0,5),'stg',INT,9],['Classe '+rd.slice(0,5),'clsA',null,10],['Classe '+cd.slice(0,5),'cls',null,10],['Date in PDO','dpdo','date',11],['Jours PDO','dpd',INT,9],['Échéance','mat','date',11],
    ['Encours '+cd.slice(0,5),'otot',AMT,15],['EAD '+cd.slice(0,5),'ead',AMT,15],['Garanties nettes allouées','collNet',AMT,15],['Provision IFRS9 '+rd.slice(0,5),'provA',AMT,15],
    ['ECL Best estimate','be',AMT,14],['ECL Optimiste','o',AMT,14],['ECL Downturn','dn',AMT,14],['ECL simulé '+cd.slice(0,5),'=ECL',AMT,15],['Impairment à prendre','=IMP',AMT,16]];
  setup(wsD,C.GREEN,[2,...DC.map(c=>c[3])],'DÉTAIL CONTRATS — Noms S2 & S3 incoming',`${A.det.length} contrats / comptes des ${A.s3.length+A.s2.length} clients entrants`,1+DC.length);
  const dcol={};DC.forEach(([,k],i)=>dcol[k]=2+i);const DL=k=>CL(dcol[k]);const d1=HR+1,d2=HR+Math.max(1,A.det.length),drg=k=>DL(k)+d1+':'+DL(k)+d2;
  tile(wsD,6,2,3,'Contrats filtrés',fx(`SUBTOTAL(103,${drg('cat')})`,A.det.length),'lignes visibles',C.NAVY,INT);
  tile(wsD,6,4,6,'EAD '+cd,fx(`SUBTOTAL(109,${drg('ead')})`,sum(A.det,r=>Math.round(r.ead))),'XOF',C.BLUE);
  tile(wsD,6,7,9,'Provision '+rd,fx(`SUBTOTAL(109,${drg('provA')})`,sum(A.det,r=>Math.round(r.provA))),'comptabilisée',C.MUT);
  tile(wsD,6,10,13,'ECL simulé '+cd,fx(`SUBTOTAL(109,${drg('=ECL')})`,sum(A.det,r=>e(r))),'pondéré',C.SKY);
  tile(wsD,6,14,17,'Impairment à prendre',fx(`SUBTOTAL(109,${drg('=IMP')})`,sum(A.det,r=>e(r)-Math.round(r.provA))),'ECL − provision '+rd,C.RED);
  x=wsD.getCell(10,2);x.value='▸ FILTRES';x.font=font({size:9,bold:true,color:{argb:argb(C.GREEN)}});
  for(let r=11;r<HR-1;r++)wsD.getRow(r).height=26;wsD.getRow(HR-1).height=8;
  const drows=A.det.map((d,i)=>{const r=d1+i;return DC.map(([,k,nf])=>{
    if(k==='=ECL')return fx(`W_BE*${DL('be')}${r}+W_OPT*${DL('o')}${r}+W_DN*${DL('dn')}${r}`,e(d));
    if(k==='=IMP')return fx(`${DL('=ECL')}${r}-${DL('provA')}${r}`,e(d)-Math.round(d.provA));
    if(nf==='date')return d[k]||null;if(nf)return Math.round(d[k]||0);return d[k]==null?'':String(d[k]);});});
  if(!drows.length)drows.push(DC.map(()=>''));
  table(wsD,'T_DETAIL',HR,2,DC.map(c=>c[0]),drows);header(wsD,HR,2,DC.map(c=>c[0]));
  drows.forEach((_,i)=>{const row=wsD.getRow(d1+i);DC.forEach(([,k,nf])=>{body(row.getCell(dcol[k]),nf,{bold:k==='rel'||k==='=IMP',color:k==='=IMP'?C.RED:C.INK,
    align:(['cat','prod','clsA','cls'].includes(k)||nf===INT||nf==='date')?'center':undefined});});});
  stageCF(wsD,DL('stgA')+d1+':'+DL('stg')+d2);dbar(wsD,drg('=IMP'),C.RED);
  wsD.addConditionalFormatting({ref:drg('cat'),rules:[{type:'cellIs',operator:'equal',formulae:['"S3 incoming"'],priority:30,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF6D5D1'}},font:{bold:true,color:{argb:argb(C.RED)}}}},
    {type:'cellIs',operator:'equal',formulae:['"S2 incoming"'],priority:31,style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF8EBCB'}},font:{bold:true,color:{argb:'FF8A5A00'}}}}]});
  [['Catégorie',2,3,1,'SlicerStyleDark2'],['Produit',4,6,3,'SlicerStyleDark1'],['Classe '+cd.slice(0,5),7,8,2,'SlicerStyleDark3'],['Segment',9,10,1,'SlicerStyleDark5'],['Gestionnaire',11,20,3,'SlicerStyleDark6']]
    .forEach(([cn,a,b,cc,st])=>SL.push({sheet:wsD.name,table:'T_DETAIL',col:cn,cap:cn.replace(/ \d\d\/\d\d$/,''),anc:[a-1,10,b,HR-2],st,cc}));

  /* --- SYNTHESE */
  setup(ws0,C.NAVY,[2,14,14,14,14,14,14,14,14,14,14,14,14,14,14,2],'MIGRATIONS S2 & S3',`Portefeuille Ecobank Sénégal · arrêté ${cd} vs ${rd} · réponse à M. CISSE Massokhna [ESN-RISK]`,15);
  ws0.mergeCells('L1:O1');ws0.mergeCells('L2:O2');ws0.mergeCells('L3:O3');
  x=ws0.getCell('L1');x.value='IMPAIRMENT À PRENDRE (XOF)';x.font=font({size:9,bold:true,color:{argb:argb(C.LIME2)}});x.alignment={horizontal:'right',vertical:'bottom'};
  x=ws0.getCell('L2');x.value=fx('IMPAIRMENT!G20',X.tot);x.numFmt='#,##0';x.font={name:NUMF,size:22,bold:true,color:{argb:'FFFFFFFF'}};x.alignment={horizontal:'right',vertical:'middle'};
  const f1=v=>(v/1e6).toFixed(1);
  x=ws0.getCell('L3');x.value=fx('"dont "&FIXED(IMPAIRMENT!G18/1000000,1)&" M S3  ·  "&FIXED(IMPAIRMENT!G19/1000000,1)&" M S2"','dont '+f1(X.T3.imp)+' M S3  ·  '+f1(X.T2.imp)+' M S2');
  x.font=font({size:9,color:{argb:'FFDCEBF2'}});x.alignment={horizontal:'right'};
  tile(ws0,6,2,3,'S3 incoming · clients',fx('IMPAIRMENT!C18',X.T3.n),'noms entrés en Stage 3',C.RED,INT);
  tile(ws0,6,4,5,'S3 incoming · EAD',fx('IMPAIRMENT!D18',X.T3.ead),'XOF au '+cd,C.RED);
  tile(ws0,6,6,8,'S3 · impairment à prendre',fx('IMPAIRMENT!G18',X.T3.imp),'ECL simulé − provision '+rd,C.RED);
  tile(ws0,6,9,10,'S2 incoming · clients',fx('IMPAIRMENT!C19',X.T2.n),'noms entrés en Stage 2',C.AMB,INT);
  tile(ws0,6,11,12,'S2 incoming · EAD',fx('IMPAIRMENT!D19',X.T2.ead),'XOF au '+cd,C.AMB);
  tile(ws0,6,13,15,'S2 · impairment à prendre',fx('IMPAIRMENT!G19',X.T2.imp),'ECL simulé − provision '+rd,C.AMB);
  section(ws0,10,2,15,'RÉPONSES AUX QUESTIONS DU MAIL « MIGRATIONS S2 & S3 »');
  header(ws0,11,2,['#','Question','','Nb clients','EAD '+cd,'Provision '+rd,'ECL simulé','Impairment','Réponse','','','','Détail','']);
  ws0.mergeCells('C11:D11');ws0.mergeCells('J11:M11');ws0.mergeCells('N11:O11');
  const s3a=k=>X.byA(A.s3,k);
  const QA=[['1','S3 incoming',18,`${A.s3.length} clients ont basculé en Stage 3 : ${s3a(2).length} depuis le Stage 2 (${fM(sum(s3a(2),c=>c.ead))}), ${s3a(1).length} directement depuis le Stage 1 (${fM(sum(s3a(1),c=>c.ead))}), ${s3a(0).length} nouveaux noms. ${Math.round(X.cons3*100)} % de l’impairment S3 est Consumer.`,'S3 INCOMING',C.RED],
    ['2','Impairment à prendre ?',20,`Oui : dotation nette de ${fM(X.tot)} XOF selon le moteur ECL du PDO Monitor (${fM(X.dot)} de dotations brutes, ${fM(-X.rep)} de reprises théoriques). Downturn : ${fM(X.T3.dn+X.T2.dn-provT)}.`,'IMPAIRMENT',C.NAVY],
    ['3','S2 incoming',19,`${A.s2.length} clients passés du Stage 1 au Stage 2. Les 20 premiers noms pèsent ${Math.round(X.top20*100)} % de l’impairment total S2 + S3.`,'S2 INCOMING',C.AMB],
    ['4','Le détail des noms S2 & S3',20,'Listes nominatives filtrables (segments, flux, classe, produit, gestionnaire) + détail contrat par contrat.','DETAIL CONTRATS',C.GREEN]];
  QA.forEach(([n,q,ir,ans,sh,col],i)=>{const r=12+i,v=ST[ir];ws0.mergeCells(r,3,r,4);ws0.mergeCells(r,10,r,13);ws0.mergeCells(r,14,r,15);
    x=ws0.getCell(r,2);x.value=+n;x.font={name:NUMF,size:16,bold:true,color:{argb:'FFFFFFFF'}};x.fill=fill(col);x.alignment={horizontal:'center',vertical:'middle'};
    x=ws0.getCell(r,3);x.value=q;x.font=font({size:10.5,bold:true,color:{argb:argb(C.NAVY)}});x.alignment={vertical:'middle',wrapText:true,indent:1};
    [['C',v.n,INT],['D',v.ead,AMT],['E',v.prov,AMT],['F',v.ecl,AMT],['G',v.imp,AMT]].forEach(([cl,val,nf],j)=>{x=ws0.getCell(r,5+j);x.value=fx('IMPAIRMENT!'+cl+ir,val);body(x,nf,{bold:cl==='G',color:cl==='G'?C.RED:C.INK,align:'center'});});
    x=ws0.getCell(r,10);x.value=ans;x.font=font({size:9});x.alignment={wrapText:true,vertical:'middle'};
    x=ws0.getCell(r,14);x.value={text:'→ '+sh,hyperlink:`#'${sh}'!A1`};x.font=font({size:9.5,bold:true,color:{argb:argb(C.SKY)},underline:true});x.alignment={horizontal:'center',vertical:'middle'};
    for(let c=3;c<=15;c++)ws0.getCell(r,c).border={bottom:thinB};ws0.getRow(r).height=48;});
  // barre de navigation (boutons hyperliens)
  ws0.getRow(9).height=24;
  [['S3 INCOMING',C.RED],['S2 INCOMING',C.AMB],['IMPAIRMENT',C.NAVY],['MATRICE MIGRATION',C.BLUE],['DETAIL CONTRATS',C.GREEN],['BASE CLIENTS',C.MUT]].forEach(([sh,col],i)=>{
    const c1=2+i*2+(i>2?1:0)-(i>2?1:0);ws0.mergeCells(9,c1,9,c1+1);const b=ws0.getCell(9,c1);b.value={text:'▸ '+sh,hyperlink:`#'${sh}'!A1`};
    b.fill={type:'gradient',gradient:'angle',degree:90,stops:[{position:0,color:{argb:'FF'+g3Shade('#'+col,0.18).slice(1).toUpperCase()}},{position:1,color:{argb:'FF'+col}}]};
    b.font=font({size:9,bold:true,color:{argb:'FFFFFFFF'}});b.alignment={horizontal:'center',vertical:'middle'};
    b.border={left:{style:'thin',color:{argb:'FFFFFFFF'}},right:{style:'thin',color:{argb:'FFFFFFFF'}},bottom:{style:'medium',color:{argb:argb(C.LIME)}}};});
  x=ws0.getCell(9,14);ws0.mergeCells(9,14,9,15);x.value='Navigation · cliquer pour ouvrir';x.font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});x.alignment={horizontal:'center',vertical:'middle'};
  // Top 10 des noms
  section(ws0,17,2,15,'TOP 10 DES NOMS — IMPAIRMENT À PRENDRE (scénario pondéré)');
  header(ws0,18,2,['Rang','Nom client','','','Catégorie','Segment','Gestionnaire','','EAD '+cd,'Provision '+rd,'ECL simulé','Impairment','% cumulé','']);
  [[3,5],[8,9],[14,15]].forEach(([a,b])=>ws0.mergeCells(18,a,18,b));
  const top10=[...A.s3.map(c=>Object.assign({cat:'S3 incoming'},c)),...A.s2.map(c=>Object.assign({cat:'S2 incoming'},c))].sort((a,b)=>b.imp-a.imp).slice(0,10);
  let cum=0;top10.forEach((c,i)=>{const r=19+i;cum+=c.imp;[[3,5],[8,9],[14,15]].forEach(([a,b])=>ws0.mergeCells(r,a,r,b));
    x=ws0.getCell(r,2);x.value=i+1;x.fill=fill(i<3?C.NAVY:C.BLUE);x.font={name:NUMF,size:11,bold:true,color:{argb:'FFFFFFFF'}};x.alignment={horizontal:'center',vertical:'middle'};
    x=ws0.getCell(r,3);x.value=c.nom;body(x,null,{bold:true});
    x=ws0.getCell(r,6);x.value=c.cat;x.fill=fill(c.cat[1]==='3'?'F6D5D1':'F8EBCB');x.font=font({size:9,bold:true,color:{argb:c.cat[1]==='3'?argb(C.RED):'FF8A5A00'}});x.alignment={horizontal:'center',vertical:'middle'};x.border={bottom:thinB};
    x=ws0.getCell(r,7);x.value=c.seg;body(x,null,{align:'center'});x=ws0.getCell(r,8);x.value=c.gest;body(x);
    [[10,c.ead],[11,c.provA],[12,c.ecl],[13,c.imp]].forEach(([cc,v])=>{x=ws0.getCell(r,cc);x.value=Math.round(v);body(x,AMT,{bold:cc===13,color:cc===13?C.RED:C.INK});});
    x=ws0.getCell(r,14);x.value=X.tot?cum/X.tot:0;body(x,PCT,{align:'center'});ws0.getRow(r).height=19;});
  dbar(ws0,'M19:M28',C.RED);dbar(ws0,'N19:N28',C.LIME);
  x=ws0.getCell(29,2);x.value='Valeurs au scénario pondéré retenu à la génération · le détail vivant (formules, filtres) est dans les onglets S3 / S2 INCOMING.';x.font=font({size:8.5,italic:true,color:{argb:argb(C.MUT)}});
  section(ws0,31,2,15,'VISUELS');
  const h1=img(ws0,'flows',2,32,640);img(ws0,'heat',9,32,640);let y=32+Math.floor(h1/20)+1;
  const h2=img(ws0,'seg3',2,y,640);img(ws0,'seg2',9,y,640);y+=Math.floor(h2/20)+1;img(ws0,'card',2,y,1290);

  const buf=await wb.xlsx.writeBuffer();
  return await xlsxSurgery(buf,SL);
}

/* chirurgie XML : thème Ecobank + slicers natifs de tableaux (Excel 2013+) */
async function xlsxSurgery(buf,SL){
  const z=await JSZip.loadAsync(buf);const rd=async n=>z.file(n)?await z.file(n).async('string'):null;const wr=(n,s)=>z.file(n,s);
  const xe=t=>String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  // thème
  let th=await rd('xl/theme/theme1.xml');
  if(th){const acc={dk2:'00415E',lt2:'EEF4F7',accent1:'005C83',accent2:'8CC63F',accent3:'00415E',accent4:'D4A13A',accent5:'1A86B3',accent6:'6BA23A',hlink:'1A86B3',folHlink:'3E5C6B'};
    for(const k in acc)th=th.replace(new RegExp('(<a:'+k+'>\\s*<a:srgbClr val=")[0-9A-Fa-f]{6}'),'$1'+acc[k]);
    th=th.replace(/(<a:(?:major|minor)Font>\s*<a:latin typeface=")[^"]*/g,'$1Segoe UI');wr('xl/theme/theme1.xml',th);}
  // correspondances feuilles / tables
  let wbx=await rd('xl/workbook.xml'),wbr=await rd('xl/_rels/workbook.xml.rels'),ct=await rd('[Content_Types].xml');
  const relT={};wbr.replace(/<Relationship\b[^>]*>/g,m=>{const id=(m.match(/Id="([^"]+)"/)||[])[1],t=(m.match(/Target="([^"]+)"/)||[])[1];if(id)relT[id]=t;return m;});
  const sheetPath={};wbx.replace(/<sheet\b[^>]*>/g,m=>{const n=(m.match(/name="([^"]+)"/)||[])[1],id=(m.match(/r:id="([^"]+)"/)||[])[1];
    let t=relT[id];t=t.replace(/^\//,'');if(!t.startsWith('xl/'))t='xl/'+t;sheetPath[n.replace(/&amp;/g,'&')]=t;return m;});
  // conformité au schéma SpreadsheetML (corrige les écarts d'ExcelJS qui déclenchent la « réparation » d'Excel)
  for(const n of Object.values(sheetPath)){let sx=await rd(n);if(!sx)continue;
    sx=sx.replace(/<extLst><ext uri="\{B025F937-C7B1-47D3-B67F-A62EFF666E3E\}"[^>]*><x14:id\/><\/ext><\/extLst>/g,'');   // x14:id vides dans les cfRule
    const ld=sx.match(/<legacyDrawing\b[^>]*\/>/);                                                                         // ordre : drawing → legacyDrawing → tableParts
    if(ld){sx=sx.replace(ld[0],'');sx=/<drawing\b[^>]*\/>/.test(sx)?sx.replace(/(<drawing\b[^>]*\/>)/,'$1'+ld[0]):sx.replace(/(<tableParts\b|<extLst>(?![\s\S]*<extLst>)|<\/worksheet>)/,ld[0]+'$1');}
    wr(n,sx);}
  for(const n of Object.keys(z.files).filter(n=>/^xl\/drawings\/drawing\d+\.xml$/.test(n))){let dx=await rd(n);wr(n,dx.replace(/<xdr:oneCellAnchor editAs="[^"]*">/g,'<xdr:oneCellAnchor>'));}
  // liens internes : location sans « # » et sans relation externe parasite
  for(const n of Object.values(sheetPath)){let sx=await rd(n);if(!sx||!/<hyperlink /.test(sx))continue;const relp=n.replace('worksheets/','worksheets/_rels/')+'.rels';let rels=await rd(relp);
    sx=sx.replace(/<hyperlink ref="([^"]+)" r:id="([^"]+)" location="#([^"]*)"\/>/g,(m,ref,id,loc)=>{if(rels)rels=rels.replace(new RegExp('<Relationship Id="'+id+'"[^>]*/>'),'');return `<hyperlink ref="${ref}" location="${loc}" display="${loc.replace(/&apos;/g,"'").replace(/'/g,'&apos;')}"/>`;});
    wr(n,sx);if(rels)wr(relp,rels);}
  const tables={};
  for(const n of Object.keys(z.files).filter(n=>/^xl\/tables\/table\d+\.xml$/.test(n))){let x=await rd(n);let k=0;
    x=x.replace(/<autoFilter ref="([^"]+)">[\s\S]*?<\/autoFilter>/,'<autoFilter ref="$1"/>');   // aucun critère de filtre résiduel
    x=x.replace(/<tableColumn\b([^>]*?)\bid="\d+"/g,(m,pre)=>'<tableColumn'+pre+'id="'+(++k)+'"').replace(' totalsRowShown="1"',' totalsRowShown="0"');wr(n,x);
    const tid=(x.match(/<table\b[^>]*\bid="(\d+)"/)||[])[1],nm=(x.match(/displayName="([^"]+)"/)||[])[1];const cols={};
    x.replace(/<tableColumn\b[^>]*>/g,m=>{const id=(m.match(/\bid="(\d+)"/)||[])[1],name=(m.match(/\bname="([^"]+)"/)||[])[1];if(name)cols[name.replace(/&amp;/g,'&').replace(/&apos;/g,"'")]=id;return m;});
    tables[nm]={tid,cols};}
  const NS14='http://schemas.microsoft.com/office/spreadsheetml/2009/9/main',NS15='http://schemas.microsoft.com/office/spreadsheetml/2010/11/main',
    NSMC='http://schemas.openxmlformats.org/markup-compatibility/2006',NSX='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const used=new Set(),cacheR=[],dn=[],bySheet={};
  SL.forEach((s,i0)=>{const i=i0+1,t=tables[s.table];if(!t||!t.cols[s.col])return;
    const base='Slicer_'+s.col.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9_]/g,'_').replace(/^_+|_+$/g,'');let cn=base,k=1;while(used.has(cn))cn=base+(k++);used.add(cn);
    wr(`xl/slicerCaches/slicerCache${i}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<slicerCacheDefinition xmlns="${NS14}" xmlns:mc="${NSMC}" mc:Ignorable="x" xmlns:x="${NSX}" name="${cn}" sourceName="${xe(s.col)}"><extLst><x:ext uri="{2F2917AC-EB37-4324-AD4E-5DD8C200BD13}" xmlns:x15="${NS15}"><x15:tableSlicerCache tableId="${t.tid}" column="${t.cols[s.col]}" crossFilter="showItemsWithDataAtTop"/></x:ext></extLst></slicerCacheDefinition>`);
    ct=ct.replace('</Types>',`<Override PartName="/xl/slicerCaches/slicerCache${i}.xml" ContentType="application/vnd.ms-excel.slicerCache+xml"/></Types>`);
    wbr=wbr.replace('</Relationships>',`<Relationship Id="rIdSc${i}" Type="http://schemas.microsoft.com/office/2007/relationships/slicerCache" Target="slicerCaches/slicerCache${i}.xml"/></Relationships>`);
    cacheR.push('rIdSc'+i);dn.push(cn);(bySheet[s.sheet]=bySheet[s.sheet]||[]).push(Object.assign({name:s.cap+' '+i,cache:cn},s));});
  let j=0;
  for(const sh of Object.keys(bySheet)){j++;const items=bySheet[sh],path=sheetPath[sh];let sx=await rd(path);
    const relp=path.replace('worksheets/','worksheets/_rels/')+'.rels';let rels=await rd(relp)||'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    wr(`xl/slicers/slicer${j}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<slicers xmlns="${NS14}" xmlns:mc="${NSMC}" mc:Ignorable="x" xmlns:x="${NSX}">`+
      items.map(s=>`<slicer name="${xe(s.name)}" cache="${s.cache}" caption="${xe(s.cap)}" columnCount="${s.cc}" rowHeight="225425" style="${s.st}"/>`).join('')+'</slicers>');
    ct=ct.replace('</Types>',`<Override PartName="/xl/slicers/slicer${j}.xml" ContentType="application/vnd.ms-excel.slicer+xml"/></Types>`);
    rels=rels.replace('</Relationships>','<Relationship Id="rIdSl1" Type="http://schemas.microsoft.com/office/2007/relationships/slicer" Target="../slicers/slicer'+j+'.xml"/></Relationships>');wr(relp,rels);
    const ext=`<ext uri="{3A4CF648-6AED-40f4-86FF-DC5316D8AED3}" xmlns:x15="${NS15}"><x14:slicerList xmlns:x14="${NS14}"><x14:slicer xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rIdSl1"/></x14:slicerList></ext>`;
    // extLst de NIVEAU FEUILLE uniquement (ExcelJS place aussi des extLst dans les règles de barres de données)
    sx=/<\/extLst><\/worksheet>\s*$/.test(sx)?sx.replace(/<\/extLst><\/worksheet>\s*$/,ext+'</extLst></worksheet>'):sx.replace(/<\/worksheet>\s*$/,'<extLst>'+ext+'</extLst></worksheet>');wr(path,sx);
    // ancres dans le dessin
    const dm=rels.match(/Target="([^"]*drawings\/drawing\d+\.xml)"/);if(!dm)continue;
    const dpath='xl/'+dm[1].replace(/^\.\.\//,'').replace(/^\/?xl\//,'');let dx=await rd(dpath);
    const px=/<xdr:wsDr/.test(dx)?'xdr:':'';
    const anchors=items.map((s,k)=>{const [c1,r1,c2,r2]=s.anc;return `<${px}twoCellAnchor editAs="oneCell"><${px}from><${px}col>${c1}</${px}col><${px}colOff>38100</${px}colOff><${px}row>${r1}</${px}row><${px}rowOff>38100</${px}rowOff></${px}from><${px}to><${px}col>${c2}</${px}col><${px}colOff>0</${px}colOff><${px}row>${r2}</${px}row><${px}rowOff>0</${px}rowOff></${px}to>`+
      `<mc:AlternateContent xmlns:mc="${NSMC}"><mc:Choice xmlns:sle15="http://schemas.microsoft.com/office/drawing/2012/slicer" Requires="sle15"><${px}graphicFrame macro=""><${px}nvGraphicFramePr><${px}cNvPr id="${900+k}" name="${xe(s.name)}"/><${px}cNvGraphicFramePr/></${px}nvGraphicFramePr>`+
      `<${px}xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></${px}xfrm><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.microsoft.com/office/drawing/2010/slicer"><sle:slicer xmlns:sle="http://schemas.microsoft.com/office/drawing/2010/slicer" name="${xe(s.name)}"/></a:graphicData></a:graphic></${px}graphicFrame></mc:Choice>`+
      `<mc:Fallback><${px}sp macro="" textlink=""><${px}nvSpPr><${px}cNvPr id="0" name=""/><${px}cNvSpPr><a:spLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noTextEdit="1"/></${px}cNvSpPr></${px}nvSpPr><${px}spPr><a:xfrm xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:off x="0" y="0"/><a:ext cx="1828800" cy="1000000"/></a:xfrm><a:prstGeom xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" prst="rect"><a:avLst/></a:prstGeom></${px}spPr>`+
      `<${px}txBody><a:bodyPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:lstStyle xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/><a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:rPr lang="fr-FR" sz="900"/><a:t>Segment « ${xe(s.cap)} » : Excel 2013 ou ultérieur.</a:t></a:r></a:p></${px}txBody></${px}sp></mc:Fallback></mc:AlternateContent><${px}clientData/></${px}twoCellAnchor>`;}).join('');
    dx=dx.replace(new RegExp('</'+px+'wsDr>'),anchors+'</'+px+'wsDr>');wr(dpath,dx);}
  // visuels en relief : coins arrondis, ombre portée, biseau doux (sauf badge logo)
  const PIC3D='<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 3500"/></a:avLst></a:prstGeom><a:effectLst><a:outerShdw blurRad="114300" dist="57150" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="00344B"><a:alpha val="42000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="44450" h="19050" prst="softRound"/></a:sp3d>';
  for(const n of Object.keys(z.files).filter(n=>/^xl\/drawings\/drawing\d+\.xml$/.test(n))){let dx=await rd(n);
    dx=dx.replace(/<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/g,a=>{if(!/<xdr:pic>/.test(a)||/cx="2028825"/.test(a))return a;
      return a.replace(/<a:prstGeom prst="rect">\s*<a:avLst\s*\/>\s*<\/a:prstGeom>|<a:prstGeom prst="rect"\s*\/>/,PIC3D);});wr(n,dx);}
  // classeur
  const dnx=dn.map(n=>`<definedName name="${n}">#N/A</definedName>`).join('');
  wbx=/<definedNames>/.test(wbx)?wbx.replace('<definedNames>','<definedNames>'+dnx):wbx.replace('</sheets>','</sheets><definedNames>'+dnx+'</definedNames>');
  if(!/xmlns:r=/.test(wbx.slice(0,600)))wbx=wbx.replace('<workbook ','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  const wext=`<ext uri="{46BE6895-7355-4a93-B00E-2C351335B9C9}" xmlns:x15="${NS15}"><x15:slicerCaches xmlns:x14="${NS14}">`+cacheR.map(r=>`<x14:slicerCache r:id="${r}"/>`).join('')+'</x15:slicerCaches></ext>';
  wbx=/<extLst>/.test(wbx)?wbx.replace('</extLst>',wext+'</extLst>'):wbx.replace('</workbook>','<extLst>'+wext+'</extLst></workbook>');
  wr('xl/workbook.xml',wbx);wr('xl/_rels/workbook.xml.rels',wbr);wr('[Content_Types].xml',ct);
  return await z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
}
async function exportXlsx(){
  if(!S)return;try{busy(true,'Construction du classeur Excel…');await tick();
    const blob=await buildXlsx();const d=S.cur.rep||new Date();
    const name='ECOBANK_MIGRATIONS_S2_S3_'+String(d.getDate()).padStart(2,'0')+String(d.getMonth()+1).padStart(2,'0')+d.getFullYear()+'.xlsx';
    dl(blob,name);
    busy(false);toast('Classeur généré : '+name);
  }catch(e){console.error(e);busy(false);toast('Erreur export : '+e.message);}
}


/* =====================================================================
   POWERPOINT — LAYOUT_WIDE, bandeau marine / filet lime / badge 3D
   ===================================================================== */
const stampD=()=>{const d=S.cur.rep||new Date();return String(d.getDate()).padStart(2,'0')+String(d.getMonth()+1).padStart(2,'0')+d.getFullYear();};
const cut=(t,n)=>{t=String(t||'');return t.length>n?t.slice(0,n-1)+'…':t;};
function fitImg(s,u,x,y,w,h){if(!u)return;const z=pngSizeB64(u);let iw=w,ih=w*z.h/z.w;if(ih>h){ih=h;iw=h*z.w/z.h;}s.addImage({data:u,x:x+(w-iw)/2,y:y+(h-ih)/2,w:iw,h:ih});}
async function exportPptx(){
  const PG=window.PptxGenJS;if(!PG||!S){toast('Moteur PowerPoint indisponible');return;}
  busy(true,'Construction de la présentation…');await tick();
  try{const A=S,X=S.X,V=S.V,badge=V.badge,cd=dFR(A.cur.rep),rd=dFR(A.ref.rep);const provT=X.T3.prov+X.T2.prov,dnImp=X.T3.dn+X.T2.dn-provT;
    const pp=new PG();pp.layout='LAYOUT_WIDE';pp.title='Migrations S2 & S3 — '+cd;pp.company='Ecobank Sénégal';pp.author='PNDOYE · ESN-RISK';
    const foot=`Migrations S2 & S3 · arrêté ${cd} vs ${rd} · Ecobank Sénégal – Direction des Risques · INTERNAL USE ONLY`;let n=0,s;
    const F='Segoe UI';
    /* 1. couverture */
    s=pp.addSlide();s.background={color:PX.NV};
    s.addShape(pp.ShapeType.ellipse,{x:8.4,y:-2.4,w:7.4,h:7.4,fill:{color:PX.LM,transparency:86},line:{color:PX.LM,transparency:100}});
    s.addShape(pp.ShapeType.ellipse,{x:10.6,y:3.7,w:4.8,h:4.8,fill:{color:'1A86B3',transparency:78},line:{color:'1A86B3',transparency:100}});
    s.addShape(pp.ShapeType.ellipse,{x:-1.4,y:5.6,w:3.2,h:3.2,fill:{color:PX.LM,transparency:90},line:{color:PX.LM,transparency:100}});
    s.addImage({data:badge,x:0.7,y:0.65,w:3.1,h:1.06});
    s.addText('MIGRATIONS S2 & S3',{x:0.7,y:2.25,w:9,h:0.9,fontSize:42,bold:true,color:'FFFFFF',fontFace:F,charSpacing:1});
    s.addShape(pp.ShapeType.rect,{x:0.72,y:3.2,w:1.5,h:0.07,fill:{color:PX.LM}});
    s.addText(`Entrées en Stage 2 et Stage 3 · arrêté ${cd} vs ${rd}`,{x:0.7,y:3.4,w:9.5,h:0.5,fontSize:19,color:PX.L2,fontFace:F});
    s.addText('Impairment simulé avec le moteur ECL du PDO Monitor (PwC · Vasicek · 3 scénarios)',{x:0.7,y:3.92,w:9.5,h:0.4,fontSize:13,color:'CFE0EE',fontFace:F});
    s.addShape(pp.ShapeType.roundRect,{x:0.7,y:4.65,w:5.6,h:1.35,fill:{color:'FFFFFF',transparency:88},line:{color:PX.L2,width:1.25},rectRadius:0.12});
    s.addText('IMPAIRMENT À PRENDRE',{x:0.95,y:4.75,w:5.2,h:0.32,fontSize:10.5,bold:true,color:PX.L2,fontFace:F,charSpacing:2});
    s.addText([{text:fmt(X.tot),options:{bold:true,color:'FFFFFF'}},{text:'  XOF',options:{fontSize:16,color:'CFE0EE'}}],{x:0.95,y:5.08,w:5.3,h:0.7,fontSize:34,fontFace:'Consolas'});
    s.addText(`S3 ${fM(X.T3.imp)}  ·  S2 ${fM(X.T2.imp)}  ·  downturn ${fM(dnImp)}`,{x:0.95,y:5.68,w:5.3,h:0.28,fontSize:10.5,color:'CFE0EE',fontFace:F});
    s.addText('Réponse à M. CISSE Massokhna [ESN-RISK] · Ecobank Sénégal · Direction des Risques – Cellule Portefeuille · INTERNAL USE ONLY',{x:0.7,y:6.75,w:11.5,h:0.35,fontSize:10.5,color:'9FC3D8',fontFace:F});
    /* 2. synthèse — réponses */
    s=pp.addSlide();pptBand(pp,s,'Synthèse — les réponses','S3 incoming · impairment à prendre · S2 incoming · détail des noms',foot,++n,badge);
    pptKpis(pp,s,[['S3 incoming',A.s3.length+' clients',PX.RK,fM(X.T3.ead)+' d’EAD'],['Impairment S3',fM(X.T3.imp),PX.RK,'ECL − provision '+rd.slice(0,5)],['S2 incoming',A.s2.length+' clients',PX.AM,fM(X.T2.ead)+' d’EAD'],
      ['Impairment S2',fM(X.T2.imp),PX.AM,'ECL − provision '+rd.slice(0,5)],['Total à doter',fM(X.tot),PX.NV,'downturn '+fM(dnImp)]],1.28);
    const s3a=k=>X.byA(A.s3,k);
    const QA=[[PX.RK,'S3 incoming',`${A.s3.length} clients basculés en Stage 3 : ${s3a(2).length} depuis le Stage 2 (${fM(sum(s3a(2),c=>c.ead))}), ${s3a(1).length} directement depuis le Stage 1, ${s3a(0).length} nouveaux noms.`],
      [PX.NV,'Impairment à prendre ?',`Oui — ${fM(X.tot)} XOF nets (${fM(X.dot)} de dotations, ${fM(-X.rep)} de reprises théoriques) ; ${fM(dnImp)} en downturn.`],
      [PX.AM,'S2 incoming',`${A.s2.length} clients passés du Stage 1 (IA / I) à IIA ; les 20 premiers noms pèsent ${Math.round(X.top20*100)} % de l’impairment.`],
      [PX.GR,'Le détail des noms S2 & S3',`Listes nominatives en annexe et dans le classeur Excel (slicers par segment, flux, classe, produit, gestionnaire) — ${A.det.length} contrats.`]];
    QA.forEach(([col,q,t],i)=>{const y=2.6+i*1.08;s.addShape(pp.ShapeType.roundRect,{x:0.5,y,w:12.33,h:0.95,fill:{color:i%2?'F4F9FB':'FFFFFF'},line:{color:'CFE0E7',width:0.75},rectRadius:0.08,shadow:{type:'outer',blur:3,offset:1.2,angle:90,color:'00415E',opacity:0.10}});
      s.addShape(pp.ShapeType.roundRect,{x:0.5,y,w:0.85,h:0.95,fill:{color:col},rectRadius:0.08});
      s.addText(String(i+1),{x:0.5,y,w:0.85,h:0.95,fontSize:26,bold:true,color:'FFFFFF',align:'center',valign:'middle',fontFace:'Consolas'});
      s.addText(q,{x:1.55,y:y+0.08,w:11.1,h:0.32,fontSize:13,bold:true,color:PX.NV,fontFace:F});
      s.addText(t,{x:1.55,y:y+0.4,w:11.1,h:0.48,fontSize:11,color:PX.INK,fontFace:F,valign:'top'});});
    /* 3. impairment */
    s=pp.addSlide();pptBand(pp,s,'Impairment à prendre','ECL simulé '+cd+' − provision IFRS9 '+rd+' · par flux de migration',foot,++n,badge);
    pptKpis(pp,s,[['Total à doter',fmt(X.tot),PX.NV,'XOF · scénario pondéré'],['Dotations brutes',fmt(X.dot),PX.RK,'clients à impairment > 0'],['Reprises théoriques',fmt(X.rep),PX.GR,'provision > ECL simulé'],['Stress downturn',fmt(dnImp),PX.AM,'z = +1,96 · collatéral ×0,95']],1.28);
    const fl=['S1 → S3','S2 → S3','Nouveau → S3','S1 → S2'].map(k=>[k,X.flows[k]||{n:0,ead:0,prov:0,ecl:0,imp:0}]);
    const fr=fl.map(([k,f])=>[k,String(f.n),fM(f.ead),fM(f.prov),fM(f.ecl),fM(f.imp)]);const ft=['TOTAL',String(X.T3.n+X.T2.n),fM(X.T3.ead+X.T2.ead),fM(provT),fM(X.T3.ecl+X.T2.ecl),fM(X.tot)];ft.__total=true;fr.push(ft);
    pptTable(s,['Flux','Clients','EAD','Provision','ECL simulé','Impairment'],fr,{x:0.5,y:2.65,w:6.3,colW:[1.4,0.8,1.05,1.0,1.0,1.05],right:[1,2,3,4,5],rowH:0.42,fs:10.5,
      pills:(ri,ci)=>ci===0&&ri<4?(fl[ri][0].endsWith('S3')?'C0392B':'B67D1C'):null});
    fitImg(s,V.flows,6.95,2.55,5.9,4.5);
    /* 4. matrice */
    s=pp.addSlide();pptBand(pp,s,'Matrice de migration','niveau client · stage le plus dégradé · '+rd+' → '+cd,foot,++n,badge);
    const L3=['Stage 1','Stage 2','Stage 3'];
    const mh=[{text:rd.slice(0,5)+' \\ '+cd.slice(0,5),options:{bold:true,color:'FFFFFF',fill:{color:PX.NV},fontSize:11,fontFace:F}},...L3.map(t=>({text:t,options:{bold:true,color:'FFFFFF',fill:{color:PX.NV},fontSize:11,align:'center',fontFace:F}}))];
    const mr=A.cnt.map((r,i)=>[{text:L3[i],options:{bold:true,color:PX.NV,fill:{color:PX.SF},fontSize:12,fontFace:F}},...r.map((v,j)=>({text:fmt(v),options:{fontSize:15,bold:true,align:'center',fontFace:'Consolas',color:j>i?'A51F1A':j<i?'3F6F1F':PX.NV,fill:{color:j>i?'FBE3E2':j<i?'E6F2D0':'E3EFF5'}}}))]);
    s.addTable([mh,...mr],{x:0.5,y:1.45,w:6.2,colW:[1.7,1.5,1.5,1.5],rowH:0.75,border:{type:'solid',pt:1,color:'FFFFFF'}});
    s.addText([{text:'Lecture  ',options:{bold:true,color:PX.NV}},{text:`vert = cure, rouge = dégradation. ${A.cnt[0][1]} clients S1→S2 et ${A.cnt[1][2]} S2→S3 ; en sens inverse ${A.outS2S1.length} cures S2→S1 et ${A.outS3S1.length} sorties S3→S1.`,options:{color:PX.INK}}],
      {x:0.5,y:4.75,w:6.2,h:1.1,fontSize:11.5,fontFace:F,valign:'top'});
    fitImg(s,V.heat,6.95,1.35,5.9,5.6);
    /* 5-8. S3 / S2 */
    const listSlides=(L,lab,col,iTop,iImp,iSeg,T)=>{
      s=pp.addSlide();pptBand(pp,s,lab+' — Top 15 des noms',`${L.length} clients · EAD ${fM(T.ead)} · impairment ${fM(T.imp)}`,foot,++n,badge);
      const top=L.slice().sort((a,b)=>b.imp-a.imp).slice(0,15);
      const rows=top.map((c,i)=>[String(i+1),cut(c.nom,34),c.seg,c.flux,(c.clsA||'–')+' → '+c.cls,String(c.dpd),fM(c.ead),fM(c.provA),fM(c.ecl),fM(c.imp)]);
      const tt=['','TOTAL '+L.length+' noms','','','','',fM(T.ead),fM(T.prov),fM(T.ecl),fM(T.imp)];tt.__total=true;rows.push(tt);
      pptTable(s,['#','Nom client','Segment','Flux','Classe','Jours PDO','EAD','Provision','ECL simulé','Impairment'],rows,{x:0.5,y:1.3,w:12.33,colW:[0.4,3.4,1.15,1.05,1.15,0.9,1.07,1.07,1.07,1.07],right:[5,6,7,8,9],rowH:0.33,fs:9.5,
        pills:(ri,ci)=>ci===0&&ri<top.length?(ri<3?PX.NV:PX.BL):(ci===3&&ri<top.length?col:null)});
      s=pp.addSlide();pptBand(pp,s,lab+' — profil','concentration, impairment par nom et répartition par segment',foot,++n,badge);
      fitImg(s,V[iImp],0.45,1.3,6.2,5.75);fitImg(s,V[iSeg],6.75,1.3,6.1,2.85);fitImg(s,V[iTop],6.75,4.2,6.1,2.9);};
    listSlides(A.s3,'S3 incoming',PX.RK,'top3','imp3','seg3',X.T3);
    listSlides(A.s2,'S2 incoming',PX.AM,'top2','imp2','seg2',X.T2);
    /* 9. sensibilité & fiabilité */
    s=pp.addSlide();pptBand(pp,s,'Sensibilité et fiabilité du moteur','scénarios macro (Vasicek) et back-test sur l’arrêté '+rd,foot,++n,badge);
    fitImg(s,V.scen,0.45,1.3,6.2,4.5);fitImg(s,V.bt,6.7,1.3,6.2,4.5);
    const bt=A.bt;s.addText([1,2,3].map(k=>({text:`Stage ${k} : provision ${fM(bt[k][1])} vs simulé ${fM(bt[k][2])} (${pct(bt[k][1]?bt[k][2]/bt[k][1]-1:0)})`,options:{bullet:{code:'25B8'},color:PX.INK,paraSpaceAfter:4}})),
      {x:6.8,y:5.9,w:6.0,h:1.15,fontSize:10.5,fontFace:F,valign:'top'});
    s.addText([{text:'Optimiste ',options:{bold:true,color:PX.GR}},{text:fM(X.T3.o+X.T2.o-provT)+'   ',options:{color:PX.INK}},{text:'Best ',options:{bold:true,color:PX.BL}},{text:fM(X.T3.be+X.T2.be-provT)+'   ',options:{color:PX.INK}},
      {text:'Downturn ',options:{bold:true,color:PX.RK}},{text:fM(dnImp),options:{color:PX.INK}}],{x:0.5,y:5.95,w:6.1,h:0.5,fontSize:12,fontFace:F});
    s.addText('Impairment à prendre selon le scénario (ECL − provision '+rd+')',{x:0.5,y:6.45,w:6.1,h:0.4,fontSize:9.5,italic:true,color:PX.MU,fontFace:F});
    /* 10. lecture */
    s=pp.addSlide();pptBand(pp,s,'Lecture et recommandations','constats chiffrés, impairment, actions proposées au Comité',foot,++n,badge);fitImg(s,V.card,0.9,1.3,11.5,5.75);
    /* 11. méthodologie */
    s=pp.addSlide();pptBand(pp,s,'Méthodologie','périmètre, règles de migration et moteur ECL',foot,++n,badge);
    const meth=[`Rapprochement des onglets ${A.ref.name} (${fmt(A.ref.rows.length)} lignes) et ${A.cur.name} (${fmt(A.cur.rows.length)} lignes) du fichier PORTEFEUILLE au niveau Code Client.`,
      'Stage client = stage IFRS9 le plus dégradé de ses contrats. S3 incoming : Stage 3 au '+cd+' et < 3 au '+rd+'. S2 incoming : Stage 2 au '+cd+' et Stage 1 ou absent au '+rd+'.',
      `Noms à exposition nulle exclus des listes (${A.z3} en S3, ${A.z2} en S2).`,
      'ECL = réplique du moteur eclRun() du PDO Monitor : PD 12 mois (S1) ou lifetime S&P (S2) conditionnée Vasicek (ρ 0,15), PD 100 % en S3, LGD par segment nette des garanties (haircuts PwC), cure rate, actualisation 8 %.',
      'Pondération des scénarios : best '+Math.round(P.W.be*100)+' %, optimiste '+Math.round(P.W.o*100)+' %, downturn '+Math.round(P.W.dn*100)+' %.',
      'Impairment à prendre = ECL simulé '+cd+' − provision IFRS9 comptabilisée au '+rd+'. Un montant négatif est une reprise théorique, à confirmer par revue individuelle.'];
    s.addText(meth.map(t=>({text:t,options:{bullet:{code:'25B8'},color:PX.INK,paraSpaceAfter:10}})),{x:0.6,y:1.4,w:12.1,h:5.5,fontSize:13,fontFace:F,valign:'top'});
    /* 12. clôture */
    s=pp.addSlide();s.background={color:PX.NV};
    s.addShape(pp.ShapeType.ellipse,{x:-2,y:-2.5,w:6,h:6,fill:{color:PX.LM,transparency:90},line:{color:PX.LM,transparency:100}});
    s.addShape(pp.ShapeType.ellipse,{x:10,y:4,w:5,h:5,fill:{color:'1A86B3',transparency:80},line:{color:'1A86B3',transparency:100}});
    s.addImage({data:badge,x:5.1,y:2.15,w:3.1,h:1.06});s.addShape(pp.ShapeType.rect,{x:5.9,y:3.5,w:1.5,h:0.06,fill:{color:PX.LM}});
    s.addText('Merci',{x:0,y:3.7,w:13.33,h:0.6,fontSize:28,bold:true,color:'FFFFFF',align:'center',fontFace:F});
    s.addText('Migrations S2 & S3 · Ecobank Sénégal · Direction des Risques · INTERNAL USE ONLY',{x:0,y:4.35,w:13.33,h:0.4,fontSize:13,color:'CFE0EE',align:'center',fontFace:F});
    const blob=await pp.write({outputType:'blob'});dl(blob,'ECOBANK_MIGRATIONS_S2_S3_'+stampD()+'.pptx');
    busy(false);toast('Présentation générée — '+(n+2)+' diapositives');
  }catch(e){console.error(e);busy(false);toast('Erreur PowerPoint : '+e.message);}
}

/* =====================================================================
   WORD — note au Comité (A4, couverture marine, titres soulignés lime)
   ===================================================================== */
async function exportWord(){
  if(!S)return;busy(true,'Rédaction de la note Word…');await tick();
  try{const A=S,X=S.X,V=S.V,cd=dFR(A.cur.rep),rd=dFR(A.ref.rep),provT=X.T3.prov+X.T2.prov,dnImp=X.T3.dn+X.T2.dn-provT;
    const media=[];const add=u=>{const u8=g3Bytes(u);media.push(u8);return {rid:'rIdImg'+media.length,id:100+media.length,u8};};
    const H1=t=>dxP(dxRun(t),{style:'Titre1'}),H2=t=>dxP(dxRun(t),{style:'Titre2'});
    const img=(k,w)=>{if(!V[k])return '';const m=add(V[k]);return dxP(dxImg(m.rid,m.id,m.u8,w||16.5),{after:140,align:'center'});};
    const call=(html,col)=>dxRich(html,{shade:'EEF4F7',border:col||'005C83',after:140,ind:80});
    let body='';const lg=add(V.badge);
    // couverture
    body+=`<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="36" w:color="8CC63F"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="9638"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="5200"/></w:trPr>`+
      dxCell(dxP(dxImg(lg.rid,lg.id,lg.u8,6.2),{after:420,ind:200})+
        dxP(dxRun('NOTE AU COMITÉ DES RISQUES',{b:true,sz:18,color:'A6D867'}),{after:80,ind:200})+
        dxP(dxRun('MIGRATIONS S2 & S3',{b:true,sz:52,color:'FFFFFF'}),{after:60,ind:200})+
        dxP(dxRun(`Entrées en Stage 2 et Stage 3 · arrêté ${cd} vs ${rd}`,{sz:24,color:'CFE0EE'}),{after:260,ind:200})+
        dxP([dxRun('Impairment à prendre  ',{sz:20,color:'A6D867',b:true}),dxRun(fmt(X.tot)+' XOF',{sz:36,b:true,color:'FFFFFF',font:'Consolas'})],{after:60,ind:200})+
        dxP(dxRun(`S3 incoming ${fM(X.T3.imp)} · S2 incoming ${fM(X.T2.imp)} · downturn ${fM(dnImp)}`,{sz:17,color:'CFE0EE'}),{after:300,ind:200})+
        dxP(dxRun('Réponse à M. CISSE Massokhna [ESN-RISK] · Ecobank Sénégal · Direction des Risques – Cellule Portefeuille · INTERNAL USE ONLY',{sz:15,color:'9FC3D8'}),{after:0,ind:200}),
        {w:9638,fill:'00415E',va:'center'})+'</w:tr></w:tbl>';
    body+=dxP('',{after:200});
    body+=dxKpis([['Impairment à prendre',fM(X.tot),'C0392B','scénario pondéré'],['S3 incoming',A.s3.length+' noms','C0392B',fM(X.T3.ead)+' d’EAD'],['S2 incoming',A.s2.length+' noms','B67D1C',fM(X.T2.ead)+' d’EAD'],['Downturn',fM(dnImp),'00415E','z = +1,96']]);
    body+=call(`<b>En bref.</b> ${A.s3.length} clients entrent en Stage 3 et ${A.s2.length} en Stage 2 entre le ${rd} et le ${cd}. Le moteur ECL du PDO Monitor chiffre l’impairment complémentaire à <b>${fM(X.tot)} XOF</b> (${fM(X.dot)} de dotations brutes, ${fM(-X.rep)} de reprises théoriques).`,'8CC63F');
    // 1. réponses
    body+=H1('1. Réponses aux questions');
    const s3a=k=>X.byA(A.s3,k);
    const qa=[['1','S3 incoming',`${A.s3.length} clients : ${s3a(2).length} depuis le Stage 2, ${s3a(1).length} depuis le Stage 1, ${s3a(0).length} nouveaux.`,fM(X.T3.imp)],
      ['2','Impairment à prendre ?',`Oui, ${fM(X.tot)} nets ; ${fM(dnImp)} en downturn.`,fM(X.tot)],
      ['3','S2 incoming',`${A.s2.length} clients passés de IA / I à IIA.`,fM(X.T2.imp)],
      ['4','Détail des noms',`Sections 4 et 5 (liste exhaustive) et classeur Excel.`,'—']];
    const qc=['C0392B','00415E','B67D1C','6BA23A'];
    body+=dxTableS(['#','Question','Réponse','Impairment'],qa,[600,2300,5238,1500],[3],(ri,ci)=>ci===0?qc[ri]:null);
    // 2. impairment
    body+=H1('2. Impairment à prendre');
    const fl=['S1 → S3','S2 → S3','Nouveau → S3','S1 → S2'].map(k=>[k,X.flows[k]||{n:0,ead:0,prov:0,ecl:0,imp:0}]);
    const fr=fl.map(([k,f])=>[k,f.n,fmt(f.ead),fmt(f.prov),fmt(f.ecl),fmt(f.imp)]);const ft=['TOTAL',X.T3.n+X.T2.n,fmt(X.T3.ead+X.T2.ead),fmt(provT),fmt(X.T3.ecl+X.T2.ecl),fmt(X.tot)];ft.__total=true;fr.push(ft);
    body+=dxTableS(['Flux','Clients','EAD '+cd.slice(0,5),'Provision '+rd.slice(0,5),'ECL simulé','Impairment'],fr,[1500,900,1900,1800,1800,1738],[1,2,3,4,5],(ri,ci)=>ci===0&&ri<4?(fl[ri][0].endsWith('S3')?'C0392B':'B67D1C'):null);
    body+=img('flows',15.5);
    body+=H2('Sensibilité aux scénarios');
    body+=dxTableS(['Scénario','Pondération','ECL entrants','Impairment à prendre'],[['Optimiste',pct(P.W.o),fmt(X.T3.o+X.T2.o),fmt(X.T3.o+X.T2.o-provT)],['Best estimate',pct(P.W.be),fmt(X.T3.be+X.T2.be),fmt(X.T3.be+X.T2.be-provT)],
      ['Downturn',pct(P.W.dn),fmt(X.T3.dn+X.T2.dn),fmt(dnImp)],Object.assign(['Pondéré (retenu)','100 %',fmt(X.T3.ecl+X.T2.ecl),fmt(X.tot)],{__total:true})],[2600,1800,2600,2638],[1,2,3]);
    body+=img('scen',14);
    // 3. matrice
    body+=H1('3. Matrice de migration');
    const L3=['Stage 1','Stage 2','Stage 3'];
    body+=dxTableS([rd.slice(0,5)+' \\ '+cd.slice(0,5),...L3],A.cnt.map((r,i)=>[L3[i],...r.map(fmt)]),[2638,2333,2333,2334],[1,2,3],(ri,ci)=>ci>0&&ci-1!==ri?(ci-1>ri?'C0392B':'6BA23A'):null);
    body+=dxRich(`<b>Lecture.</b> Rouge = dégradation, vert = cure. En sens inverse : ${A.outS2S1.length} clients S2→S1 et ${A.outS3S1.length} S3→S1.`,{after:120});
    body+=img('heat',14);
    // 4-5. listes nominatives
    const listSec=(no,lab,L,T,col,iTop,iSeg)=>{body+=H1(no+'. '+lab+' — détail des noms');
      body+=call(`<b>${L.length} clients</b> · EAD ${fM(T.ead)} · provision ${rd} ${fM(T.prov)} · ECL simulé ${fM(T.ecl)} · <b>impairment ${fM(T.imp)}</b>.`,col);
      body+=img(iTop,15.5);
      const rows=L.map((c,i)=>[i+1,cut(c.nom,34),String(c.seg||'').slice(0,4),c.flux,fmt(c.ead),fmt(c.provA),fmt(c.ecl),fmt(c.imp)]);
      const tt=['','TOTAL '+L.length+' noms','','',fmt(T.ead),fmt(T.prov),fmt(T.ecl),fmt(T.imp)];tt.__total=true;rows.push(tt);
      body+=dxTableS(['#','Nom client','Seg.','Flux','EAD','Provision','ECL simulé','Impairment'],rows,[430,2458,850,900,1250,1250,1250,1250],[0,4,5,6,7],(ri,ci)=>ci===3&&ri<L.length?col:null);
      body+=img(iSeg,13);};
    listSec(4,'S3 incoming',A.s3,X.T3,'C0392B','imp3','seg3');
    listSec(5,'S2 incoming',A.s2,X.T2,'B67D1C','imp2','seg2');
    // 6. lecture
    body+=H1('6. Lecture et recommandations');
    narrative(X).forEach(b=>{body+=H2(b.h);b.items.forEach(t=>body+=dxRich('▸ '+t,{after:80,ind:160}));});
    body+=img('card',16.5);
    // annexes
    body+=H1('Annexe A — Fiabilité du moteur (back-test '+rd+')');
    const bt=A.bt;body+=dxTableS(['Stage','Contrats','Provision comptabilisée','ECL simulé','Écart'],[1,2,3].map(k=>['Stage '+k,fmt(bt[k][0]),fmt(bt[k][1]),fmt(bt[k][2]),pct(bt[k][1]?bt[k][2]/bt[k][1]-1:0)]),[1600,1500,2400,2400,1738],[1,2,3,4]);
    body+=img('bt',14);
    body+=H1('Annexe B — Méthodologie et paramètres');
    [`Rapprochement des onglets ${A.ref.name} et ${A.cur.name} du fichier PORTEFEUILLE au niveau Code Client ; stage client = stage IFRS9 le plus dégradé.`,
     `Noms à exposition nulle exclus des listes (${A.z3} en S3, ${A.z2} en S2).`,
     'PD 12 mois (Stage 1) ou lifetime S&P (Stage 2) conditionnée par Vasicek (ρ = 0,15 ; z = 0 / −1 / +1,96) ; PD = 100 % en Stage 3.',
     'LGD par segment (CORPORATE / COMMERCIAL / CONSUMER) nette des garanties (haircuts PwC par type, codes 6xxx–8xxx exclus), réduite du taux de cure ; actualisation 8 % sur la maturité résiduelle.',
     'Impairment à prendre = ECL simulé '+cd+' − provision IFRS9 '+rd+'. Note interne, ne constitue pas un avis réglementaire.']
     .forEach(t=>body+=dxRich('▸ '+t,{after:80,ind:160}));
    body+=dxTableS(['Notation (FRR)','PD 12 mois','S&P','PD cumulée 1 an','PD cumulée 5 ans'],Array.from({length:10},(_,i)=>{const rk=i+1,sp=P.rankToSP[rk];
      return [rk,(P.pd12[rk]*100).toFixed(3).replace('.',',')+' %',sp,sp==='D'?'100 %':pct(P.spCum[sp][0]),sp==='D'?'100 %':pct(P.spCum[sp][4])];}),[1800,1900,1600,2200,2138],[1,3,4]);
    const u8=await docxBuild(body,media,'Ecobank Sénégal · Migrations S2 & S3 · arrêté '+cd+' · INTERNAL USE ONLY');
    dl(new Blob([u8],{type:MIME.docx}),'ECOBANK_MIGRATIONS_S2_S3_Note_'+stampD()+'.docx');busy(false);toast('Note Word générée');
  }catch(e){console.error(e);busy(false);toast('Erreur Word : '+e.message);}
}

/* ------------------------------------------------------------------ init */
(function init(){
  $('#logoTop').src=LOGO_SRC;$('#logoDrop').src=LOGO_SRC;
  const f=$('#file');$('#bLoad').onclick=()=>f.click();$('#zone').onclick=()=>f.click();
  f.onchange=()=>{if(f.files[0])loadFile(f.files[0]);f.value='';};
  const z=$('#zone');['dragover','dragenter'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('over');}));
  z.addEventListener('drop',e=>{const x=e.dataTransfer.files[0];if(x)loadFile(x);});
  $('#bXl').onclick=exportXlsx;$('#bPpt').onclick=exportPptx;$('#bDoc').onclick=exportWord;
  $('#selCur').onchange=()=>compute();$('#selRef').onchange=()=>compute();
})();

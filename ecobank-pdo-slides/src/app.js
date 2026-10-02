/* =====================================================================
   PDO SLIDES STUDIO — Ecobank Sénégal
   Charge l'export ECOBANK_PDO_*.xlsx du PDO Monitor et le transforme en
   présentation interactive (diapositives 1600×900 mises à l'échelle).
   ===================================================================== */
const KIT={org:'ECOBANK SÉNÉGAL',unit:'Direction des Engagements',app:'PDO Slides Studio',footer:'ECOBANK SÉNÉGAL · PDO Slides · INTERNAL USE ONLY',
  docTitle:'PDO Monitor — présentation',docSubject:'Revue du risque de crédit',keywords:'PDO, NPL, impayés, BCEAO, IFRS9'};

/* ---------- utilitaires ---------- */
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const tick=()=>new Promise(r=>setTimeout(r,30));
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const num=v=>{ if(typeof v==='number') return isFinite(v)?v:0; if(v==null||v==='') return 0; const n=parseFloat(String(v).replace(/[\s\u00a0\u202f]/g,'').replace(',','.')); return isFinite(n)?n:0; };
const str=v=>v==null?'':String(v).trim();
const sum=(a,f)=>a.reduce((s,r)=>s+f(r),0);
const NB='\u00a0';
const fInt=v=>Math.round(v).toLocaleString('fr-FR').replace(/[\u202f\s]/g,NB);
const fDec=(v,d)=>v.toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d}).replace(/[\u202f\s]/g,NB);
const fSmart=v=>{ const a=Math.abs(v); return a>=1e9?fDec(v/1e9,2)+NB+'Mds':a>=1e6?fDec(v/1e6,1)+NB+'M':fInt(v); };
const fMds=(v,d=2)=>Math.abs(v)>=1e9||v===0?fDec(v/1e9,d)+NB+'Mds':fSmart(v);
const fPct=(v,d=2)=>fDec(v,d)+NB+'%';
const fTaux=t=>{ if(t===''||t==null) return ''; const n=num(t); return n<=1&&n>0?fDec(n*100,0)+NB+'%':fDec(n,0)+NB+'%'; };
const plural=(n,s,p)=>fInt(n)+' '+(n>1?(p||s+'s'):s);
function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('on'),3200); }
function busy(on,t,s){ $('#busy').classList.toggle('on',on); if(t) $('#busyT').textContent=t; $('#busyS').textContent=s||'Patientez quelques secondes'; }

/* ---------- référentiel ---------- */
const CLS=['I','IA','IIA','IIN','II','III','IV','V'];
const CLS_LIB={I:'Normal',IA:'Sur surveillance',IIA:'Watch-list A',IIN:'Watch-list N',II:'Watch-list',III:'Substandard',IV:'Douteuse',V:'Perte'};
const CLS_COL={I:'#4e8a2e',IA:'#8cc63f',IIA:'#d4a13a',IIN:'#b67d1c',II:'#d4a13a',III:'#e07b39',IV:'#c0392b',V:'#7b1e16'};
const clsCol=c=>CLS_COL[c]||'#6e8794';
const clsRank=c=>{ const i=CLS.indexOf(c); return i<0?-1:i; };
const NPL_EXCL_PROD=new Set(['OA','LGMO','LTB','CC','CKU','LCU']), NPL_EXCL_SEG='8110';
const SEGS=['CORPORATE','COMMERCIAL','CONSUMER'];
const SEG_COL={CORPORATE:'#00415e',COMMERCIAL:'#1a86b3',CONSUMER:'#8cc63f'};
const AGE=[['1–30 j',1,30,'#8cc63f'],['31–90 j',31,90,'#d4a13a'],['91–180 j',91,180,'#e07b39'],['181–360 j',181,360,'#c0392b'],['> 360 j',361,1e9,'#7b1e16']];
const ageOf=j=>{ for(let i=0;i<AGE.length;i++) if(j>=AGE[i][1]&&j<=AGE[i][2]) return i; return j<=0?-1:AGE.length-1; };

/* ---------- lecture du classeur ---------- */
const SHEETS={
  SYN:/^synthese/, IMP:/^impaye/, CRO:/croisement/, DEB:/^debiteur/, COD:/^cod/, DEC:/^declassement/, DDET:/detail/, DOU:/douteux/, A7:/acte ?7|moteur/
};
const SPEC={
  IMP:{ref:/^reference/,code:/^code client/,client:/^client$/,prod:/^produit/,ech:/^echeance/,j:/^jours/,cl:/^classe/,st:/^stade/,m:/^montant/,g:/^gestionnaire/,seg:/^segment/},
  CRO:{code:/^code client/,client:/^relationship|^client$/,eng:/^engagement/,imp:/^impaye/,taux:/^taux/,j:/^jours/,cl:/^classe/,g:/^gestionnaire/,seg:/^segment/},
  DEB:{cpt:/^compte/,code:/^code client/,client:/^client$/,solde:/^solde/,lim:/^limite/,depuis:/^debiteur depuis/,j:/^jours/,cl:/^classe/,stat:/^statut/,g:/^gestionnaire/,seg:/^segment/},
  COD:{cpt:/^compte/,code:/^code client/,client:/^client$/,solde:/^solde/,depuis:/^debiteur depuis/,j:/^jours/,cl:/^classe/,g:/^gestionnaire/,seg:/^segment/},
  DEC:{code:/^code client/,client:/^relationship|^client$/,motif:/^motif/,ctr:/^contrats/,enc:/^encours/,hyp:/^gar/,expo:/^expo/,frr:/^frr/,j:/^jours/,dd:/^date defaut/,cl:/^classe/,taux:/^taux/,prov:/^provision/,g:/^gestionnaire/,seg:/^segment/},
  DDET:{code:/^code client/,client:/^relationship|^client$/,type:/^type/,ref:/^reference/,prod:/^produit/,enc:/^encours/,stat:/^statut/,ncl:/^nouvelle classe/,g:/^gestionnaire/,seg:/^segment/},
  DOU:{code:/^code client/,client:/^client$/,enc:/^encours/,pifrs:/ifrs/,ploc:/locale/,hyp:/^gar/,dd:/^date/,preq:/requise/,compl:/^complement/,g:/^gestionnaire/,seg:/^segment/},
  A7:{code:/^code client/,client:/^relationship$/,grp:/^group name/,prod:/^product code$/,segc:/^segment code/,cl:/^classification$/,st:/^stage/,ot:/^ototal including/,pdo:/^pdo amount/,stat:/^status/,ploc:/per local regulatory/,off:/^account officer/,bseg:/business.?segment/,desc:/^description/,ref:/^contracts/}
};
const NUMK=new Set(['m','j','st','eng','imp','taux','solde','lim','ctr','enc','hyp','expo','frr','prov','pifrs','ploc','preq','compl','ot','pdo']);

function findHeader(rows){
  for(let i=0;i<Math.min(rows.length,30);i++){ const r=rows[i]||[];
    const cells=r.filter(v=>v!=null&&v!==''), strs=cells.filter(v=>typeof v==='string');
    if(strs.length>=4 && strs.length>=cells.length*0.8 && !strs.some(s=>s.includes('\n'))) return i; }
  return -1;
}
function mapSheet(rows,spec){
  const hi=findHeader(rows); if(hi<0) return [];
  const H=(rows[hi]||[]).map(norm), idx={};
  for(const k in spec){ idx[k]=H.findIndex(h=>spec[k].test(h)); }
  const out=[];
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]; if(!r||!r.some(v=>v!=null&&v!=='')) continue;
    const o={}; for(const k in idx){ const v=idx[k]<0?null:r[idx[k]]; o[k]=NUMK.has(k)?num(v):str(v); }
    if(o.cl) o.cl=o.cl.toUpperCase().replace(/[^IVAN]/g,'');
    if(o.seg) o.seg=o.seg.toUpperCase(); if(o.bseg) o.bseg=o.bseg.toUpperCase();
    out.push(o); }
  return out;
}
function synTiles(rows){ const out=[];
  rows.forEach(r=>(r||[]).forEach(v=>{ if(typeof v==='string'&&v.includes('\n')){ const [l,...rest]=v.split('\n'); out.push({l:l.trim(),v:rest.join(' ').trim()}); } }));
  return out; }
function findDate(rows,loose){ const re=loose?/(\d{2}\/\d{2}\/\d{4})/:/arr[eê]t[eé]\s*(?:au\s*)?(\d{2}\/\d{2}\/\d{4})/i;
  for(const r of rows.slice(0,12)) for(const v of (r||[])){ const m=typeof v==='string'&&v.match(re); if(m) return m[1]; } return ''; }

let D=null;   // données brutes
async function loadFile(f){
  busy(true,'Lecture du fichier…',f.name); await tick();
  try{
    const buf=await f.arrayBuffer(); await tick();
    const wb=XLSX.read(buf,{type:'array',dense:true});
    busy(true,'Analyse des onglets…',wb.SheetNames.length+' onglets détectés'); await tick();
    const d={file:f.name,date:'',found:[],tiles:[]};
    for(const name of wb.SheetNames){ const n=norm(name); const key=Object.keys(SHEETS).find(k=>SHEETS[k].test(n)&&!d.found.includes(k)); if(!key) continue;
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null,blankrows:false});
      if(!d.date) d.date=findDate(rows); if(!d.date2) d.date2=findDate(rows,true);
      if(key==='SYN'){ d.tiles=synTiles(rows); d.found.push(key); continue; }
      d[key]=mapSheet(rows,SPEC[key]); d.found.push(key); await tick(); }
    ['IMP','CRO','DEB','COD','DEC','DDET','DOU','A7'].forEach(k=>{ if(!d[k]) d[k]=[]; });
    if(!d.date) d.date=d.date2||'';
    if(!d.date){ const m=f.name.match(/(\d{4})-(\d{2})-(\d{2})/); if(m) d.date=m[3]+'/'+m[2]+'/'+m[1]; }
    if(!d.IMP.length&&!d.A7.length&&!d.DEB.length) throw new Error('Aucun onglet PDO reconnu dans ce fichier.');
    D=d; buildIndex();
    busy(true,'Construction des diapositives…','Calcul des agrégats et des graphiques'); await tick();
    $('#home').hidden=true; $('#deck').hidden=false; startTimer();
    render(0);
    toast('✅ '+f.name+' — '+d.found.length+' onglets lus');
  }catch(e){ console.error(e); toast('⚠️ '+(e.message||'Lecture impossible')); }
  busy(false);
}

/* ---------- index client 360° ---------- */
let IDX={};
function buildIndex(){ IDX={};
  const get=(code,name)=>{ code=code||('§'+name); return IDX[code]||(IDX[code]={code,name:name||'',seg:'',g:'',A7:[],IMP:[],DEB:[],COD:[],DEC:[],DDET:[],DOU:[],CRO:[]}); };
  ['A7','IMP','DEB','COD','DEC','DDET','DOU','CRO'].forEach(k=>D[k].forEach(r=>{ if(!r.code&&!r.client) return; const o=get(r.code,r.client); o[k].push(r);
    if(!o.name||k==='A7') o.name=r.client||o.name; if(!o.seg) o.seg=r.seg||r.bseg||''; if(!o.g) o.g=r.g||r.off||''; }));
}

/* ---------- modèle (selon filtre segment) ---------- */
let SEG='ALL', M=null;
function model(seg){
  const f=r=>seg==='ALL'||r.seg===seg;
  const a7=D.A7.filter(r=>seg==='ALL'||r.bseg===seg);
  const base=a7.filter(r=>!NPL_EXCL_PROD.has(r.prod)&&r.segc!==NPL_EXCL_SEG);
  const m={seg,date:D.date};
  // portefeuille
  m.hasA7=base.length>0;
  m.enc=sum(base,r=>r.ot); m.np=sum(base.filter(r=>r.stat==='NP'),r=>r.ot); m.npl=m.enc?m.np/m.enc*100:0;
  m.nCtr=base.length; m.nCli=new Set(base.map(r=>r.code)).size;
  m.ploc=sum(base,r=>r.ploc); m.cov=m.np?m.ploc/m.np*100:0;
  m.byCl=CLS.map(c=>{ const rs=base.filter(r=>r.cl===c); return {c,amt:sum(rs,r=>r.ot),n:rs.length}; }).filter(x=>x.n);
  m.bySt=[1,2,3].map(s=>{ const rs=base.filter(r=>Math.round(r.st)===s); return {s,amt:sum(rs,r=>r.ot),n:rs.length}; });
  const allBase=D.A7.filter(r=>!NPL_EXCL_PROD.has(r.prod)&&r.segc!==NPL_EXCL_SEG);
  m.bySeg=SEGS.map(s=>{ const rs=allBase.filter(r=>r.bseg===s), imp=D.IMP.filter(r=>r.seg===s); const enc=sum(rs,r=>r.ot), np=sum(rs.filter(r=>r.stat==='NP'),r=>r.ot);
    return {s,enc,np,npl:enc?np/enc*100:0,imp:sum(imp,r=>r.m),nimp:imp.length,ncli:new Set(rs.map(r=>r.code)).size}; }).filter(x=>x.enc||x.nimp);
  const gm={}; base.forEach(r=>{ const k=r.grp||r.client||r.code; (gm[k]||(gm[k]={k,amt:0,n:0,np:0})); gm[k].amt+=r.ot; gm[k].n++; if(r.stat==='NP') gm[k].np+=r.ot; });
  m.groups=Object.values(gm).sort((a,b)=>b.amt-a.amt); m.top10=m.groups.slice(0,10); m.top10Sh=m.enc?sum(m.top10,g=>g.amt)/m.enc*100:0;
  const pm={}; base.forEach(r=>{ pm[r.prod]=(pm[r.prod]||0)+r.ot; }); m.prods=Object.entries(pm).sort((a,b)=>b[1]-a[1]);
  // impayés
  const imp=D.IMP.filter(f); m.imp=imp; m.impT=sum(imp,r=>r.m); m.impN=imp.length; m.impCli=new Set(imp.map(r=>r.code)).size;
  m.impMaxJ=imp.reduce((a,r)=>Math.max(a,r.j),0);
  m.impAge=AGE.map((a,i)=>{ const rs=imp.filter(r=>ageOf(r.j)===i); return {l:a[0],c:a[3],amt:sum(rs,r=>r.m),n:rs.length}; });
  m.impCl=CLS.map(c=>{ const rs=imp.filter(r=>r.cl===c); return {c,amt:sum(rs,r=>r.m),n:rs.length}; }).filter(x=>x.n);
  const im={}; imp.forEach(r=>{ const k=r.code||r.client; (im[k]||(im[k]={code:r.code,client:r.client,amt:0,n:0,j:0,cl:'',g:r.g,seg:r.seg})); const o=im[k]; o.amt+=r.m; o.n++; o.j=Math.max(o.j,r.j); if(clsRank(r.cl)>clsRank(o.cl)) o.cl=r.cl; });
  m.impByCli=Object.values(im).sort((a,b)=>b.amt-a.amt); m.impTop1Sh=m.impT&&m.impByCli[0]?m.impByCli[0].amt/m.impT*100:0;
  m.imp90=imp.filter(r=>r.j>90); m.imp90T=sum(m.imp90,r=>r.m);
  const gg={}; imp.forEach(r=>{ const k=r.g||'(non renseigné)'; (gg[k]||(gg[k]={g:k,amt:0,n:0,n90:0})); gg[k].amt+=r.m; gg[k].n++; if(r.j>90) gg[k].n90++; });
  m.impByG=Object.values(gg).sort((a,b)=>b.amt-a.amt);
  // croisement
  m.cro=D.CRO.filter(f);
  // débiteurs
  const deb=D.DEB.filter(f); m.deb=deb; m.debT=sum(deb,r=>r.solde); m.debN=deb.length;
  m.debNoLim=deb.filter(r=>r.lim<=0); m.debNoLimT=sum(m.debNoLim,r=>r.solde);
  m.debOver=deb.filter(r=>r.lim>0&&r.solde>r.lim); m.debOverT=sum(m.debOver,r=>r.solde-r.lim);
  const DAGE=[['À jour (0 j)',0,0,'#4e8a2e'],...AGE];
  m.debAge=DAGE.map(a=>{ const rs=deb.filter(r=>r.j>=a[1]&&r.j<=a[2]); return {l:a[0],c:a[3],amt:sum(rs,r=>r.solde),n:rs.length}; });
  m.debCl=CLS.map(c=>{ const rs=deb.filter(r=>r.cl===c); return {c,amt:sum(rs,r=>r.solde),n:rs.length}; }).filter(x=>x.n);
  m.debTop=[...deb].sort((a,b)=>b.solde-a.solde);
  m.debNP=deb.filter(r=>r.stat==='NP');
  // COD à déclasser
  const cod=D.COD.filter(f); m.cod=cod; m.codT=sum(cod,r=>r.solde); m.codN=cod.length; m.codJ=cod.length?sum(cod,r=>r.j)/cod.length:0;
  m.codCl=CLS.map(c=>{ const rs=cod.filter(r=>r.cl===c); return {c,amt:sum(rs,r=>r.solde),n:rs.length}; }).filter(x=>x.n);
  const cg={}; cod.forEach(r=>{ const k=r.g||'(non renseigné)'; (cg[k]||(cg[k]={g:k,amt:0,n:0})); cg[k].amt+=r.solde; cg[k].n++; });
  m.codByG=Object.values(cg).sort((a,b)=>b.n-a.n||b.amt-a.amt);
  // déclassements
  const dec=D.DEC.filter(f); m.dec=[...dec].sort((a,b)=>b.expo-a.expo); m.decN=dec.length; m.decEnc=sum(dec,r=>r.enc); m.decExpo=sum(dec,r=>r.expo); m.decHyp=sum(dec,r=>r.hyp); m.decProv=sum(dec,r=>r.prov);
  m.decCl=CLS.map(c=>{ const rs=dec.filter(r=>r.cl===c); return {c,n:rs.length,expo:sum(rs,r=>r.expo),prov:sum(rs,r=>r.prov),taux:rs[0]?rs[0].taux:''}; }).filter(x=>x.n);
  const mo={}; dec.forEach(r=>{ const k=r.motif||'(non précisé)'; (mo[k]||(mo[k]={k,n:0,expo:0})); mo[k].n++; mo[k].expo+=r.expo; }); m.decMotif=Object.values(mo).sort((a,b)=>b.n-a.n);
  // douteux
  const dou=D.DOU.filter(f); m.dou=dou; m.douN=dou.length; m.douEnc=sum(dou,r=>r.enc); m.douPloc=sum(dou,r=>r.ploc); m.douPifrs=sum(dou,r=>r.pifrs); m.douHyp=sum(dou,r=>r.hyp); m.douReq=sum(dou,r=>r.preq); m.douCompl=sum(dou,r=>r.compl);
  m.douTop=[...dou].sort((a,b)=>b.compl-a.compl);
  m.douCov=m.douEnc?m.douPloc/m.douEnc*100:0;
  return m;
}

/* ---------- graphiques ---------- */
let CH={};
if(window.Chart){
  Chart.defaults.font.family='"Segoe UI",Roboto,Arial,sans-serif'; Chart.defaults.font.size=14; Chart.defaults.color='#3e5c6b';
  Chart.defaults.devicePixelRatio=Math.max(2,window.devicePixelRatio||1);
  Chart.defaults.plugins.legend.labels.usePointStyle=true; Chart.defaults.plugins.legend.labels.boxWidth=10;
  Object.assign(Chart.defaults.plugins.tooltip,{backgroundColor:'#00415e',titleColor:'#fff',bodyColor:'#e8f3f8',borderColor:'#8cc63f',borderWidth:1,padding:12,cornerRadius:10,titleFont:{weight:'700',size:14},bodyFont:{size:13}});
  Chart.defaults.animation.duration=1100;
}
const gridC='rgba(0,65,94,.07)';
function vGrad(ctx,area,col){ if(!area) return col; const g=ctx.createLinearGradient(0,area.bottom,0,area.top); g.addColorStop(0,g3Shade(col,-0.18)); g.addColorStop(1,g3Shade(col,0.18)); return g; }
function hGrad(ctx,area,col){ if(!area) return col; const g=ctx.createLinearGradient(area.left,0,area.right,0); g.addColorStop(0,g3Shade(col,-0.15)); g.addColorStop(1,g3Shade(col,0.25)); return g; }
const valLbl={id:'valLbl',afterDatasetsDraw(c,_,o){ if(!o||!o.on) return; const x=c.ctx; x.save(); x.font='700 13px Consolas,monospace'; x.fillStyle='#00415e';
  c.data.datasets.forEach((ds,di)=>{ if(o.ds!=null&&o.ds!==di) return; const meta=c.getDatasetMeta(di); if(meta.hidden) return; meta.data.forEach((el,i)=>{ const v=ds.data[i]; if(!v) return; const t=o.fmt?o.fmt(v,i):fSmart(v);
    if(c.options.indexAxis==='y'){ x.textAlign='left'; x.textBaseline='middle'; x.fillText(t,el.x+8,el.y); } else { x.textAlign='center'; x.textBaseline='bottom'; x.fillText(t,el.x,el.y-6); } }); });
  x.restore(); }};
const whiteBg={id:'whiteBg',beforeDraw(c){ const x=c.ctx; x.save(); x.globalCompositeOperation='destination-over'; x.fillStyle='#fff'; x.fillRect(0,0,c.width,c.height); x.restore(); }};
const donutCenter={id:'donutCenter',afterDraw(c,_,o){ if(!o||!o.t) return; const a=c.chartArea, x=c.ctx, cx=(a.left+a.right)/2, cy=(a.top+a.bottom)/2; x.save(); x.textAlign='center'; x.textBaseline='middle';
  x.fillStyle='#00415e'; x.font='800 30px "Segoe UI",Arial'; x.fillText(o.t,cx,cy-8); x.fillStyle='#6e8794'; x.font='700 12px "Segoe UI",Arial'; x.fillText((o.s||'').toUpperCase(),cx,cy+20); x.restore(); }};
if(window.Chart) Chart.register(valLbl,whiteBg,donutCenter);

function mk(id,cfg){ const el=document.getElementById(id); if(!el||!window.Chart) return null; if(CH[id]) CH[id].destroy(); cfg.options=cfg.options||{}; cfg.options.responsive=true; cfg.options.maintainAspectRatio=false;
  const ch=new Chart(el,cfg); CH[id]=ch; return ch; }
function barCfg(labels,vals,cols,o={}){
  const horiz=!!o.h;
  return {type:'bar',data:{labels,datasets:[{data:vals,backgroundColor:c=>{ const col=Array.isArray(cols)?cols[c.dataIndex]:cols; return horiz?hGrad(c.chart.ctx,c.chart.chartArea,col):vGrad(c.chart.ctx,c.chart.chartArea,col); },
      borderRadius:horiz?8:10,borderSkipped:false,maxBarThickness:o.thick||70,hoverBackgroundColor:'#1a86b3'}].concat(o.extra||[])},
    options:{indexAxis:horiz?'y':'x',layout:{padding:{top:horiz?0:28,right:horiz?110:10}},onClick:o.click?(e,els)=>{ if(els[0]) o.click(els[0].index); }:undefined,
      onHover:(e,els)=>{ e.native.target.style.cursor=els.length&&o.click?'pointer':'default'; },
      plugins:{legend:{display:!!o.legend},valLbl:{on:o.lbl!==false,fmt:o.fmt,ds:0},tooltip:{callbacks:{label:o.tip||(c=>' '+fSmart(c.raw)+' XOF')}}},
      scales:{x:{grid:{display:horiz,color:gridC},border:{display:false},ticks:horiz?{callback:v=>fSmart(v)}:{font:{weight:'600'}}},
              y:{grid:{display:!horiz,color:gridC},border:{display:false},ticks:horiz?{font:{weight:'600'},callback:function(v){ const l=this.getLabelForValue(v); return l.length>30?l.slice(0,29)+'…':l; }}:{callback:v=>fSmart(v)}}}}};
}
function donutCfg(labels,vals,cols,center,o={}){
  return {type:'doughnut',data:{labels,datasets:[{data:vals,backgroundColor:cols,borderColor:'#fff',borderWidth:4,hoverOffset:16}]},
    options:{cutout:'64%',layout:{padding:14},onClick:o.click?(e,els)=>{ if(els[0]) o.click(els[0].index); }:undefined,
      onHover:(e,els)=>{ e.native.target.style.cursor=els.length&&o.click?'pointer':'default'; },
      plugins:{legend:{position:'right',labels:{font:{size:14,weight:'600'},padding:14}},donutCenter:center,
        tooltip:{callbacks:{label:c=>{ const t=c.dataset.data.reduce((a,b)=>a+b,0); return ' '+(o.fmt?o.fmt(c.raw):fSmart(c.raw)+' XOF')+' · '+fPct(t?c.raw/t*100:0,1); }}}}}};
}

/* ---------- briques HTML ---------- */
let ICN=0; const cid=()=>'c'+(++ICN);
function kp(label,val,sub,col,cls=''){ return `<div class="kp rv ${cls}" style="--c:${col||'#005c83'}"><small>${label}</small><b>${val}</b>${sub?`<span>${sub}</span>`:''}</div>`; }
function cnt(v,f){ if((f==='mds'||f==='mds1')&&Math.abs(v)<1e9) f='smart'; return `<span class="cnt" data-v="${v}" data-f="${f}">${FMT[f](v)}</span>`; }
const FMT={mds:v=>fMds(v),int:v=>fInt(v),pct:v=>fPct(v),pct1:v=>fPct(v,1),smart:v=>fSmart(v),mds1:v=>fMds(v,1)};
function cv(id,h){ return `<div class="cv" style="height:${h}px"><canvas id="${id}"></canvas></div>`; }
function pill(c){ return `<span class="pill" style="--c:${clsCol(c)}">${esc(c||'—')}</span>`; }
function jpill(j){ const i=ageOf(j); const c=i<0?'#4e8a2e':AGE[i][3]; return `<span class="pill" style="--c:${c}">${fInt(j)} j</span>`; }
function head(k,t,sub){ return `<div class="sh"><div><div class="k rv">${k}</div><h2 class="rv" style="--i:1">${t}</h2>${sub?`<div class="sub rv" style="--i:2">${sub}</div>`:''}</div><img class="lg rv" src="${LOGO_SRC}" alt="Ecobank"></div>`; }
function foot(){ return `<div class="sf"><b>ECOBANK SÉNÉGAL</b>&nbsp;·&nbsp;PDO Monitor&nbsp;·&nbsp;arrêté au ${esc(M.date||'—')}${SEG!=='ALL'?'&nbsp;·&nbsp;Segment '+esc(SEG):''}&nbsp;·&nbsp;INTERNAL USE ONLY<span class="pg"></span><div class="bar"><i></i></div></div>`; }
function segLbl(){ return SEG==='ALL'?'Tous segments':'Segment '+SEG; }

/* ---------- définition des diapositives ---------- */
/* chaque diapositive : {id, k (rubrique), t (titre), ok(M), html(M), after(M) (graphiques), ppt(pp,s,M)} */
const SL=[];
const S=o=>SL.push(o);

S({id:'cover',dark:true,k:'Couverture',t:'PDO Monitor',html:m=>`
  <div class="disc" style="width:760px;height:760px;right:-200px;top:-260px;background:rgba(140,198,63,.13)"></div>
  <div class="disc" style="width:480px;height:480px;right:120px;bottom:-260px;background:rgba(26,134,179,.30)"></div>
  <svg class="arc" viewBox="0 0 400 400" style="right:-40px;top:40px;width:820px;opacity:.09"><path d="M20 300 Q 200 20 390 120" fill="none" stroke="#fff" stroke-width="16" stroke-linecap="round"/></svg>
  <div class="cov">
    <img class="lgc rv" src="${LOGO_SRC}" alt="Ecobank">
    <div class="ey rv" style="--i:1">Revue du risque de crédit · ${esc(segLbl())}</div>
    <h1 class="rv" style="--i:2">PDO <span>Monitor</span></h1>
    <div class="rule rv" style="--i:3"></div>
    <div class="dt rv" style="--i:3">Arrêté au <b>${esc(m.date||'—')}</b> · Comité des Risques</div>
    <div class="hero">
      ${m.hasA7?`<div class="hs rv" style="--i:4"><small>Encours crédit</small><b>${cnt(m.enc,'mds')}</b></div>
      <div class="hs l rv" style="--i:5"><small>Ratio NPL</small><b>${cnt(m.npl,'pct')}</b></div>`:''}
      <div class="hs rv" style="--i:6"><small>Impayés</small><b>${cnt(m.impT,'mds')}</b></div>
      <div class="hs rv" style="--i:7"><small>Clients à déclasser</small><b>${cnt(m.decN,'int')}</b></div>
    </div>
  </div>
  <div class="meta rv" style="--i:8">Ecobank Sénégal · Direction des Engagements<br>Source : ${esc(D.file)}</div>`});

S({id:'agenda',k:'Sommaire',t:'Au programme',html:m=>`${head('Sommaire','Au programme','Cliquez sur une rubrique pour y aller directement')}
  <div class="sb"><div class="ag">${visible().filter(s=>!['cover','agenda','end'].includes(s.id)).map((s,i)=>`<div class="ai rv" style="--i:${i};--c:${i%2?'#8cc63f':'#005c83'}" data-go="${s.id}"><b>${String(i+1).padStart(2,'0')}</b><span>${esc(s.t)}<small>${esc(s.k)}</small></span></div>`).join('')}</div></div>`});

S({id:'kpi',k:'Vue d’ensemble',t:'Les indicateurs clés',ok:m=>(m.seg==='ALL'&&D.tiles.length)||m.hasA7||m.impN,
  html:m=>{
    if(m.seg==='ALL'&&D.tiles.length){
      const cols=['#00415e','#005c83','#1a86b3','#6ba23a'];
      const t=D.tiles.slice(0,12);
      return `${head('Vue d’ensemble','Les indicateurs clés','Tels qu’arrêtés dans l’onglet Synthèse du PDO Monitor')}
      <div class="sb" style="display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:20px">${t.map((x,i)=>{ const p=parseTile(x.v);
        return `<div class="kp rv ${i<4?'big':''}" style="--i:${i};--c:${cols[i%4]}"><small>${esc(x.l)}</small><b>${p?`<span class="cnt" data-v="${p.v}" data-f="raw" data-d="${p.d}" data-s="${esc(p.s)}">${esc(x.v)}</span>`:esc(x.v)}</b></div>`; }).join('')}</div>`; }
    return `${head('Vue d’ensemble','Les indicateurs clés',segLbl()+' — calculés à partir des onglets détaillés')}
      <div class="sb" style="display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:20px">
      ${kp('Encours crédit',cnt(m.enc,'mds'),plural(m.nCli,'client'),'#00415e','big')}${kp('Créances NP',cnt(m.np,'mds'),'Ratio NPL '+fPct(m.npl),'#c0392b','big')}
      ${kp('Impayés',cnt(m.impT,'mds'),plural(m.impN,'ligne'),'#005c83','big')}${kp('Solde débiteur',cnt(m.debT,'mds'),plural(m.debN,'compte'),'#1a86b3','big')}
      ${kp('COD à déclasser',cnt(m.codT,'mds'),plural(m.codN,'compte'),'#b67d1c')}${kp('Clients à déclasser',cnt(m.decN,'int'),'Exposition nette '+fMds(m.decExpo),'#e07b39')}
      ${kp('Provision BCEAO requise',cnt(m.decProv,'mds'),'sur les déclassements','#6ba23a')}${kp('Complément douteux',cnt(m.douCompl,'mds'),plural(m.douN,'dossier')+' douteux','#c0392b')}</div>`; },
  ppt:(pp,s,m)=>{ if(m.seg==='ALL'&&D.tiles.length){ const t=D.tiles.slice(0,12); for(let r=0;r<3;r++) pptKpis(pp,s,t.slice(r*4,r*4+4).map((x,i)=>[x.l,x.v,'',['00415E','005C83','1A86B3','6BA23A'][i]]),1.5+r*1.75); }
    else { pptKpis(pp,s,[['Encours crédit',fMds(m.enc),'00415E'],['Créances NP',fMds(m.np),'C0392B'],['Impayés',fMds(m.impT),'005C83'],['Solde débiteur',fMds(m.debT),'1A86B3']],1.6);
      pptKpis(pp,s,[['COD à déclasser',fMds(m.codT),'B67D1C'],['Clients à déclasser',fInt(m.decN),'E07B39'],['Provision BCEAO',fMds(m.decProv),'6BA23A'],['Complément douteux',fMds(m.douCompl),'C0392B']],3.4); } }});

S({id:'npl',k:'Qualité du portefeuille',t:'Ratio NPL & classification',ok:m=>m.hasA7,html:m=>{ const a=cid(), b=cid();
  return `${head('Qualité du portefeuille','Ratio NPL & classification',`Encours ${fMds(m.enc)} · ${plural(m.nCtr,'contrat')} · exclusions BCEAO symétriques (OA, LGMO, LTB, CC, CKU, LCU, segment 8110)`)}
  <div class="sb" style="display:grid;grid-template-columns:420px 1fr;gap:24px">
    <div style="display:flex;flex-direction:column;gap:20px">
      <div class="card rv"><div class="cb">${gauge(m.npl)}</div></div>
      ${kp('Créances non performantes',cnt(m.np,'mds'),'statut NP · ACTE 7','#c0392b')}
      ${kp('Provisions réglementaires',cnt(m.ploc,'mds'),'couverture NP '+fPct(m.cov,1),'#6ba23a')}
    </div>
    <div style="display:grid;grid-template-rows:1fr 1fr;gap:20px;min-height:0">
      <div class="card rv" style="--i:2"><div class="cb"><h3>Encours par classe <small>XOF · cliquez une barre pour le détail</small></h3>${cv(a,250)}</div></div>
      <div class="card rv" style="--i:3"><div class="cb"><h3>Stades IFRS9 <small>répartition de l’encours</small></h3>${cv(b,250)}</div></div>
    </div>
  </div>`; },
  after:(m,el)=>{ const [a,b]=ids(el);
    mk(a,barCfg(m.byCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.byCl.map(x=>x.amt),m.byCl.map(x=>clsCol(x.c)),{click:i=>drillA7Class(m.byCl[i].c),tip:c=>' '+fSmart(c.raw)+' XOF · '+plural(m.byCl[c.dataIndex].n,'contrat')}));
    mk(b,donutCfg(m.bySt.map(x=>'Stade '+x.s),m.bySt.map(x=>x.amt),['#4e8a2e','#d4a13a','#c0392b'],{t:fPct(m.enc?m.bySt[2].amt/m.enc*100:0,1),s:'en stade 3'},{click:i=>drillA7Stage(i+1)})); },
  ppt:(pp,s,m,img)=>{ pptKpis(pp,s,[['Ratio NPL',fPct(m.npl),'C0392B'],['Encours',fMds(m.enc),'00415E'],['Créances NP',fMds(m.np),'C0392B'],['Provisions régl.',fMds(m.ploc),'6BA23A']],1.35); img(0,0.5,2.75,7.3,4.2); img(1,8.0,2.75,4.85,4.2); }});

S({id:'seg',k:'Segmentation',t:'Lecture par segment',ok:m=>m.bySeg.length>0,html:m=>{ const a=cid(), b=cid();
  const T={enc:sum(m.bySeg,x=>x.enc),np:sum(m.bySeg,x=>x.np),imp:sum(m.bySeg,x=>x.imp),nimp:sum(m.bySeg,x=>x.nimp)};
  return `${head('Segmentation','Lecture par segment','Corporate, Commercial, Consumer — encours, ratio NPL et impayés')}
  <div class="sb" style="display:grid;grid-template-columns:1fr 1fr;grid-template-rows:auto 1fr;gap:22px">
    <div class="card rv" style="grid-column:1/3"><div class="cb" style="padding:0">
      <table class="tb"><thead><tr><th>Segment</th><th class="r">Clients</th><th class="r">Encours XOF</th><th class="r">Créances NP</th><th class="r">Ratio NPL</th><th class="r">Impayés XOF</th><th class="r">Lignes impayées</th></tr></thead><tbody>
      ${m.bySeg.map(x=>`<tr data-seg="${x.s}"><td><span class="pill" style="--c:${SEG_COL[x.s]}">${x.s}</span></td><td class="r">${fInt(x.ncli)}</td><td class="r">${fInt(x.enc)}</td><td class="r">${fInt(x.np)}</td><td class="r"><b>${fPct(x.npl)}</b></td><td class="r">${fInt(x.imp)}</td><td class="r">${fInt(x.nimp)}</td></tr>`).join('')}
      <tr class="tot"><td>TOTAL</td><td class="r"></td><td class="r">${fInt(T.enc)}</td><td class="r">${fInt(T.np)}</td><td class="r">${fPct(T.enc?T.np/T.enc*100:0)}</td><td class="r">${fInt(T.imp)}</td><td class="r">${fInt(T.nimp)}</td></tr></tbody></table></div></div>
    <div class="card rv" style="--i:2"><div class="cb"><h3>Encours par segment <small>XOF</small></h3>${cv(a,280)}</div></div>
    <div class="card rv" style="--i:3"><div class="cb"><h3>Ratio NPL par segment <small>% de l’encours</small></h3>${cv(b,280)}</div></div>
  </div>`; },
  after:(m,el)=>{ const [a,b]=ids(el); const cols=m.bySeg.map(x=>SEG_COL[x.s]);
    mk(a,donutCfg(m.bySeg.map(x=>x.s),m.bySeg.map(x=>x.enc),cols,{t:fMds(sum(m.bySeg,x=>x.enc),0),s:'encours'},{click:i=>setSeg(m.bySeg[i].s)}));
    mk(b,barCfg(m.bySeg.map(x=>x.s),m.bySeg.map(x=>x.npl),cols,{fmt:v=>fPct(v),tip:c=>' '+fPct(c.raw)+' · NP '+fSmart(m.bySeg[c.dataIndex].np)+' XOF',click:i=>setSeg(m.bySeg[i].s),thick:110}));
    CH[b].options.scales.y.ticks.callback=v=>fPct(v,0); CH[b].update('none');
    el.querySelectorAll('tr[data-seg]').forEach(tr=>tr.onclick=()=>setSeg(tr.dataset.seg)); },
  ppt:(pp,s,m,img)=>{ pptTable(s,['Segment','Clients','Encours XOF','Créances NP','Ratio NPL','Impayés XOF','Lignes'],m.bySeg.map(x=>[x.s,fInt(x.ncli),fInt(x.enc),fInt(x.np),fPct(x.npl),fInt(x.imp),fInt(x.nimp)]),{right:[1,2,3,4,5,6],y:1.35,pills:(r,i)=>i===0?SEG_COL[m.bySeg[r].s].slice(1).toUpperCase():null}); img(0,0.5,3.0,6.1,4.0); img(1,6.75,3.0,6.1,4.0); }});

S({id:'conc',k:'Concentration',t:'Les 10 premières expositions',ok:m=>m.hasA7&&m.top10.length,html:m=>{ const a=cid();
  const t1=m.groups[0];
  return `${head('Concentration','Les 10 premières expositions','Par groupe (ou client hors groupe) · base crédit retenue pour le ratio NPL')}
  <div class="sb" style="display:grid;grid-template-columns:1fr 360px;gap:24px">
    <div class="card rv"><div class="cb"><h3>Top 10 groupes <small>encours XOF · cliquez pour le détail des contrats</small></h3>${cv(a,560)}</div></div>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${kp('Poids du top 10',cnt(m.top10Sh,'pct1'),fMds(sum(m.top10,g=>g.amt))+' sur '+fMds(m.enc),'#00415e','big')}
      ${kp('1ʳᵉ exposition',cnt(m.enc?t1.amt/m.enc*100:0,'pct1'),esc(t1.k),'#005c83')}
      ${kp('Groupes / clients',cnt(m.groups.length,'int'),'contreparties distinctes','#6ba23a')}
      <div class="hint rv" style="--i:6">Seuils de concentration à apprécier au regard des fonds propres effectifs.</div>
    </div>
  </div>`; },
  after:(m,el)=>{ const [a]=ids(el); mk(a,barCfg(m.top10.map(g=>g.k),m.top10.map(g=>g.amt),m.top10.map((g,i)=>i===0?'#00415e':g.np>0?'#c0392b':'#1a86b3'),{h:true,click:i=>drillGroup(m.top10[i].k),
    fmt:(v)=>fMds(v)+'  ·  '+fPct(m.enc?v/m.enc*100:0,1),tip:c=>[' '+fInt(c.raw)+' XOF',' '+plural(m.top10[c.dataIndex].n,'contrat')+(m.top10[c.dataIndex].np?' · dont NP '+fSmart(m.top10[c.dataIndex].np):'')]})); CH[a].options.layout.padding.right=190; CH[a].update('none'); },
  ppt:(pp,s,m,img)=>{ img(0,0.5,1.35,8.6,5.6); const t1=m.groups[0];
    [['Poids du top 10',fPct(m.top10Sh,1),fMds(sum(m.top10,g=>g.amt))+' sur '+fMds(m.enc),'00415E'],['1re exposition',fPct(m.enc?t1.amt/m.enc*100:0,1),t1.k,'005C83'],['Groupes / clients',fInt(m.groups.length),'contreparties distinctes','6BA23A']]
      .forEach((k,i)=>pptKpiBox(pp,s,9.35,1.35+i*1.5,3.5,k)); }});

S({id:'imp',k:'Impayés',t:'Anatomie des impayés',ok:m=>m.impN>0,html:m=>{ const a=cid(), b=cid();
  return `${head('Impayés','Anatomie des impayés',`${plural(m.impN,'ligne')} · ${plural(m.impCli,'client')} · ancienneté maximale ${fInt(m.impMaxJ)} jours`)}
  <div class="sb" style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:auto 1fr;gap:20px">
    ${kp('Total impayés',cnt(m.impT,'mds'),plural(m.impN,'ligne'),'#005c83','big')}
    ${kp('Impayés > 90 jours',cnt(m.imp90T,'mds'),plural(m.imp90.length,'ligne')+' · '+fPct(m.impT?m.imp90T/m.impT*100:0,1),'#c0392b','big')}
    ${kp('1ᵉʳ débiteur',cnt(m.impTop1Sh,'pct1'),esc(m.impByCli[0]?m.impByCli[0].client:'—'),'#00415e','big')}
    ${kp('Ticket moyen',cnt(m.impN?m.impT/m.impN:0,'smart'),'XOF par ligne','#6ba23a','big')}
    <div class="card rv" style="grid-column:1/3;--i:4"><div class="cb"><h3>Par ancienneté <small>montant XOF · cliquez pour lister</small></h3>${cv(a,330)}</div></div>
    <div class="card rv" style="grid-column:3/5;--i:5"><div class="cb"><h3>Par classe <small>montant XOF</small></h3>${cv(b,330)}</div></div>
  </div>`; },
  after:(m,el)=>{ const [a,b]=ids(el);
    mk(a,barCfg(m.impAge.map(x=>x.l),m.impAge.map(x=>x.amt),m.impAge.map(x=>x.c),{click:i=>drillImp(r=>ageOf(r.j)===i,'Impayés '+AGE[i][0]),tip:c=>' '+fSmart(c.raw)+' XOF · '+plural(m.impAge[c.dataIndex].n,'ligne')}));
    mk(b,donutCfg(m.impCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.impCl.map(x=>x.amt),m.impCl.map(x=>clsCol(x.c)),{t:fMds(m.impT),s:'impayés'},{click:i=>drillImp(r=>r.cl===m.impCl[i].c,'Impayés classe '+m.impCl[i].c)})); },
  ppt:(pp,s,m,img)=>{ pptKpis(pp,s,[['Total impayés',fMds(m.impT),'005C83'],['> 90 jours',fMds(m.imp90T),'C0392B'],['1er débiteur',fPct(m.impTop1Sh,1),'00415E'],['Lignes',fInt(m.impN),'6BA23A']],1.35); img(0,0.5,2.75,6.1,4.2); img(1,6.75,2.75,6.1,4.2); }});

S({id:'imptop',k:'Impayés',t:'Les 12 premiers impayés',ok:m=>m.impN>0,html:m=>{ const t=m.impByCli.slice(0,12), mx=t[0]?t[0].amt:1;
  return `${head('Impayés','Les 12 premiers impayés','Consolidés par client · cliquez une ligne pour ouvrir la fiche 360°')}
  <div class="sb"><div class="card rv" style="height:100%"><table class="tb"><thead><tr><th>#</th><th>Client</th><th>Segment</th><th>Gestionnaire</th><th class="r">Lignes</th><th class="r">Jours max</th><th>Classe</th><th class="r">Montant XOF</th><th style="width:170px">Poids</th></tr></thead><tbody>
  ${t.map((x,i)=>`<tr data-cli="${esc(x.code)}"><td><span class="rk">${i+1}</span></td><td><b>${esc(x.client)}</b></td><td>${esc(x.seg)}</td><td>${esc(x.g)}</td><td class="r">${x.n}</td><td class="r">${jpill(x.j)}</td><td>${pill(x.cl)}</td><td class="r"><b>${fInt(x.amt)}</b></td><td><span class="bar-in" style="width:${Math.max(3,x.amt/mx*150)}px"></span> <small>${fPct(x.amt/m.impT*100,1)}</small></td></tr>`).join('')}
  <tr class="tot"><td></td><td>TOTAL TOP 12</td><td></td><td></td><td class="r">${sum(t,x=>x.n)}</td><td></td><td></td><td class="r">${fInt(sum(t,x=>x.amt))}</td><td>${fPct(sum(t,x=>x.amt)/m.impT*100,1)} du stock</td></tr>
  </tbody></table></div></div>`; },
  after:(m,el)=>bindCli(el),
  ppt:(pp,s,m)=>{ const t=m.impByCli.slice(0,12); pptTable(s,['#','Client','Segment','Lignes','Jours max','Classe','Montant XOF'],t.map((x,i)=>[i+1,x.client,x.seg,x.n,x.j,x.cl||'—',fInt(x.amt)]),{right:[3,4,6],colW:[0.5,4.6,1.6,0.9,1.2,1.0,2.53],pills:(r,i)=>i===5?clsCol(t[r].cl).slice(1).toUpperCase():null}); }});

S({id:'cro',k:'Impayés × engagements',t:'Croisement impayés / engagements',ok:m=>m.cro.length>0,html:m=>{ const a=cid();
  const hi=m.cro.filter(r=>r.taux>=50);
  return `${head('Impayés × engagements','Croisement impayés / engagements','Chaque bulle est un client : engagement total (échelle log.) × part en impayé · taille = montant impayé')}
  <div class="sb" style="display:grid;grid-template-columns:1fr 340px;gap:24px">
    <div class="card rv"><div class="cb"><h3>Carte des clients en impayé <small>survolez · cliquez une bulle pour la fiche 360°</small></h3>${cv(a,560)}</div></div>
    <div style="display:flex;flex-direction:column;gap:20px">
      ${kp('Clients croisés',cnt(m.cro.length,'int'),'en impayé ce jour','#005c83')}
      ${kp('Engagements concernés',cnt(sum(m.cro,r=>r.eng),'mds'),'impayés '+fMds(sum(m.cro,r=>r.imp)),'#00415e')}
      ${kp('Impayé ≥ 50 % de l’engagement',cnt(hi.length,'int'),fMds(sum(hi,r=>r.imp))+' en jeu','#c0392b')}
      <div class="hint rv" style="--i:6">Zone haute : clients dont l’essentiel de l’engagement est déjà en impayé.</div>
    </div>
  </div>`; },
  after:(m,el)=>{ const [a]=ids(el); const pts=m.cro.filter(r=>r.eng>0); const mx=Math.max(...pts.map(r=>r.imp),1);
    const groups={}; pts.forEach(r=>{ const c=r.cl||'—'; (groups[c]||(groups[c]=[])).push({x:Math.max(1e5,r.eng),y:Math.min(100,r.taux),r:3+Math.sqrt(r.imp/mx)*30,_:r}); });
    const ds=Object.keys(groups).sort((x,y)=>clsRank(x)-clsRank(y)).map(c=>({label:c+' · '+(CLS_LIB[c]||''),data:groups[c],backgroundColor:clsCol(c)+'b3',borderColor:clsCol(c),borderWidth:1.5,hoverBorderWidth:3}));
    mk(a,{type:'bubble',data:{datasets:ds},options:{onClick:(e,els)=>{ if(els[0]){ const p=CH[a].data.datasets[els[0].datasetIndex].data[els[0].index]; openCli(p._.code); } },
      onHover:(e,els)=>{ e.native.target.style.cursor=els.length?'pointer':'default'; },
      plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{title:c=>c[0].raw._.client,label:c=>[' Engagements '+fSmart(c.raw._.eng)+' XOF',' Impayés '+fSmart(c.raw._.imp)+' XOF ('+fPct(c.raw._.taux,1)+')',' '+fInt(c.raw._.j)+' j · classe '+c.raw._.cl]}}},
      scales:{x:{type:'logarithmic',grid:{color:gridC},border:{display:false},min:1e5,title:{display:true,text:'Engagements XOF (log. · ≤ 100 000 regroupés à gauche)',font:{weight:'700'}},ticks:{maxRotation:0,callback:v=>{ const l=Math.log10(v); return Math.abs(l-Math.round(l))<1e-9?fSmart(v):''; }}},
              y:{min:0,max:105,grid:{color:gridC},border:{display:false},title:{display:true,text:'Part en impayé',font:{weight:'700'}},ticks:{callback:v=>v<=100?v+' %':''}}}}}); },
  ppt:(pp,s,m,img)=>{ img(0,0.5,1.35,12.3,5.7); }});

S({id:'deb',k:'Débiteurs',t:'Comptes débiteurs',ok:m=>m.debN>0,html:m=>{ const a=cid();
  const t=m.debTop.slice(0,8);
  return `${head('Débiteurs','Comptes débiteurs',`${plural(m.debN,'compte')} · ${fMds(m.debT)} de solde débiteur · ${plural(m.debNP.length,'compte')} en NP`)}
  <div class="sb" style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:auto 1fr;gap:20px">
    ${kp('Solde débiteur',cnt(m.debT,'mds'),plural(m.debN,'compte'),'#005c83')}
    ${kp('Sans limite autorisée',cnt(m.debNoLimT,'mds'),plural(m.debNoLim.length,'compte'),'#c0392b')}
    ${kp('Dépassements de limite',cnt(m.debOverT,'mds'),plural(m.debOver.length,'compte'),'#b67d1c')}
    ${kp('Comptes NP',cnt(sum(m.debNP,r=>r.solde),'mds'),fPct(m.debN?m.debNP.length/m.debN*100:0,1)+' des comptes','#7b1e16')}
    <div class="card rv" style="grid-column:1/3;--i:4"><div class="cb"><h3>Solde par ancienneté <small>XOF · cliquez pour lister</small></h3>${cv(a,350)}</div></div>
    <div class="card rv" style="grid-column:3/5;--i:5;overflow:hidden"><table class="tb" style="font-size:14px"><thead><tr><th>Client</th><th class="r">Solde XOF</th><th class="r">Limite</th><th>Cl.</th></tr></thead><tbody>
      ${t.map(x=>`<tr data-cli="${esc(x.code)}"><td style="max-width:290px"><b>${esc(x.client)}</b></td><td class="r">${fInt(x.solde)}</td><td class="r">${x.lim?fInt(x.lim):'<span style="color:#c0392b;font-weight:700">aucune</span>'}</td><td>${pill(x.cl)}</td></tr>`).join('')}</tbody></table></div>
  </div>`; },
  after:(m,el)=>{ const [a]=ids(el); const DAGE=[[0,0],...AGE.map(x=>[x[1],x[2]])];
    mk(a,barCfg(m.debAge.map(x=>x.l),m.debAge.map(x=>x.amt),m.debAge.map(x=>x.c),{click:i=>drillDeb(r=>r.j>=DAGE[i][0]&&r.j<=DAGE[i][1],'Débiteurs '+m.debAge[i].l),tip:c=>' '+fSmart(c.raw)+' XOF · '+plural(m.debAge[c.dataIndex].n,'compte')})); bindCli(el); },
  ppt:(pp,s,m,img)=>{ pptKpis(pp,s,[['Solde débiteur',fMds(m.debT),'005C83'],['Sans limite',fMds(m.debNoLimT),'C0392B'],['Dépassements',fMds(m.debOverT),'B67D1C'],['Comptes',fInt(m.debN),'6BA23A']],1.35); img(0,0.5,2.75,6.1,4.2);
    const t=m.debTop.slice(0,10); pptTable(s,['Client','Solde XOF','Limite','Classe'],t.map(x=>[x.client,fInt(x.solde),x.lim?fInt(x.lim):'aucune',x.cl||'—']),{x:6.75,y:2.75,w:6.1,colW:[2.9,1.4,1.1,0.7],right:[1,2],fs:8.5,rowH:0.34,pills:(r,i)=>i===3?clsCol(t[r].cl).slice(1).toUpperCase():null}); }});

S({id:'cod',k:'Débiteurs',t:'COD à déclasser',ok:m=>m.codN>0,html:m=>{ const a=cid(), b=cid();
  return `${head('Débiteurs','COD à déclasser',`${plural(m.codN,'compte')} courant débiteur relevant d’une classe dégradée — ancienneté moyenne ${fInt(m.codJ)} jours`)}
  <div class="sb" style="display:grid;grid-template-columns:340px 1fr 1fr;gap:22px">
    <div style="display:flex;flex-direction:column;gap:20px">
      ${kp('Solde à déclasser',cnt(m.codT,'mds'),plural(m.codN,'compte'),'#c0392b','big')}
      ${kp('Ancienneté moyenne',cnt(m.codJ,'int'),'jours débiteurs','#b67d1c')}
      ${kp('Gestionnaires concernés',cnt(m.codByG.length,'int'),'portefeuilles à mobiliser','#005c83')}
    </div>
    <div class="card rv" style="--i:2"><div class="cb"><h3>Par classe <small>nombre de comptes</small></h3>${cv(a,560)}</div></div>
    <div class="card rv" style="--i:3"><div class="cb"><h3>Par gestionnaire <small>top 10 · nombre de comptes</small></h3>${cv(b,560)}</div></div>
  </div>`; },
  after:(m,el)=>{ const [a,b]=ids(el);
    mk(a,donutCfg(m.codCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.codCl.map(x=>x.n),m.codCl.map(x=>clsCol(x.c)),{t:fInt(m.codN),s:'comptes'},{fmt:v=>plural(v,'compte'),click:i=>drillCod(r=>r.cl===m.codCl[i].c,'COD à déclasser classe '+m.codCl[i].c)}));
    CH[a].options.plugins.legend.position='bottom'; CH[a].update('none');
    const t=m.codByG.slice(0,10); mk(b,barCfg(t.map(x=>x.g),t.map(x=>x.n),'#005c83',{h:true,fmt:v=>String(v),tip:c=>' '+plural(c.raw,'compte')+' · '+fSmart(t[c.dataIndex].amt)+' XOF',click:i=>drillCod(r=>(r.g||'(non renseigné)')===t[i].g,'COD à déclasser — '+t[i].g)})); CH[b].options.scales.x.ticks.callback=v=>v; CH[b].options.layout.padding.right=40; CH[b].update('none'); },
  ppt:(pp,s,m,img)=>{ pptKpis(pp,s,[['Solde à déclasser',fMds(m.codT),'C0392B'],['Comptes',fInt(m.codN),'B67D1C'],['Ancienneté moy.',fInt(m.codJ)+' j','005C83']],1.35); img(0,0.5,2.75,6.1,4.2); img(1,6.75,2.75,6.1,4.2); }});

S({id:'dec',k:'Déclassements',t:'Clients à déclasser',ok:m=>m.decN>0,html:m=>{ const t=m.dec.slice(0,9);
  return `${head('Déclassements','Clients à déclasser',`${plural(m.decN,'client')} · exposition nette ${fMds(m.decExpo)} · provision BCEAO requise ${fMds(m.decProv)}`)}
  <div class="sb" style="display:grid;grid-template-columns:1fr 430px;gap:22px">
    <div class="card rv" style="overflow:hidden"><table class="tb"><thead><tr><th>Client</th><th>Motif</th><th class="r">Jours</th><th>Classe</th><th class="r">Expo nette</th><th class="r">Provision</th></tr></thead><tbody>
      ${t.map(x=>`<tr data-cli="${esc(x.code)}"><td><b>${esc(x.client)}</b><br><small style="color:#6e8794">${esc(x.seg)} · ${esc(x.g)}</small></td><td style="white-space:normal;max-width:300px;font-size:13px">${esc(x.motif)}</td><td class="r">${jpill(x.j)}</td><td>${pill(x.cl)}</td><td class="r">${fInt(x.expo)}</td><td class="r"><b>${fInt(x.prov)}</b></td></tr>`).join('')}
      ${m.decN>t.length?`<tr class="tot" data-more="1" style="cursor:pointer"><td colspan="6">+ ${m.decN-t.length} autres clients — cliquez pour voir la liste complète</td></tr>`:''}
    </tbody></table></div>
    <div style="display:flex;flex-direction:column;gap:18px">
      <div class="card rv" style="--i:2"><div class="cb" style="padding:0"><table class="tb"><thead><tr><th>Classe</th><th class="r">Clients</th><th class="r">Taux</th><th class="r">Provision</th></tr></thead><tbody>
        ${m.decCl.map(x=>`<tr><td>${pill(x.c)} ${CLS_LIB[x.c]}</td><td class="r">${x.n}</td><td class="r">${fTaux(x.taux)}</td><td class="r">${fSmart(x.prov)}</td></tr>`).join('')}
        <tr class="tot"><td>TOTAL</td><td class="r">${m.decN}</td><td></td><td class="r">${fSmart(m.decProv)}</td></tr></tbody></table></div></div>
      ${kp('Provision BCEAO requise',cnt(m.decProv,'mds'),'nette de garantie hypothécaire','#6ba23a','big')}
      ${kp('Encours contaminé',cnt(m.decEnc,'mds'),'garanties hypo. '+fMds(m.decHyp),'#00415e')}
    </div>
  </div>`; },
  after:(m,el)=>{ bindCli(el); const mr=el.querySelector('[data-more]'); if(mr) mr.onclick=()=>drillDec(); },
  ppt:(pp,s,m)=>{ const t=m.dec.slice(0,14); pptTable(s,['Client','Motif','Jours','Classe','Expo nette','Provision'],t.map(x=>[x.client,x.motif,x.j,x.cl,fInt(x.expo),fInt(x.prov)]),{colW:[3.3,4.4,0.8,0.9,1.5,1.43],right:[2,4,5],fs:8.5,rowH:0.33,pills:(r,i)=>i===3?clsCol(t[r].cl).slice(1).toUpperCase():null});
    s.addText('Provision BCEAO requise : '+fInt(m.decProv)+' XOF  ·  exposition nette '+fInt(m.decExpo)+' XOF',{x:0.5,y:6.7,w:12.3,h:0.4,fontSize:12,bold:true,color:PX.NV,fontFace:'Segoe UI'}); }});

S({id:'dou',k:'Douteux',t:'Douteux 292 — besoin de provision',ok:m=>m.douN>0,html:m=>{ const a=cid(), t=m.douTop.slice(0,8);
  return `${head('Douteux','Douteux 292 — besoin de provision',`${plural(m.douN,'dossier')} · encours ${fMds(m.douEnc)} · couverture actuelle ${fPct(m.douCov,1)}`)}
  <div class="sb" style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:auto 1fr;gap:20px">
    ${kp('Encours douteux',cnt(m.douEnc,'mds'),plural(m.douN,'dossier'),'#00415e')}
    ${kp('Provision locale',cnt(m.douPloc,'mds'),'couverture '+fPct(m.douCov,1),'#6ba23a')}
    ${kp('Garanties hypo. 54*',cnt(m.douHyp,'mds'),'valeur déclarée','#1a86b3')}
    ${kp('Complément à doter',cnt(m.douCompl,'mds'),'provision requise '+fMds(m.douReq),'#c0392b')}
    <div class="card rv" style="grid-column:1/3;--i:4"><div class="cb"><h3>De l’encours au besoin <small>XOF</small></h3>${cv(a,350)}</div></div>
    <div class="card rv" style="grid-column:3/5;--i:5;overflow:hidden"><table class="tb" style="font-size:14px"><thead><tr><th>Client</th><th class="r">Encours</th><th class="r">Complément</th></tr></thead><tbody>
      ${t.map(x=>`<tr data-cli="${esc(x.code)}"><td style="max-width:330px"><b>${esc(x.client)}</b></td><td class="r">${fInt(x.enc)}</td><td class="r"><b style="color:#c0392b">${fInt(x.compl)}</b></td></tr>`).join('')}</tbody></table></div>
  </div>`; },
  after:(m,el)=>{ const [a]=ids(el); mk(a,barCfg(['Encours','Provision requise','Provision locale','Complément'],[m.douEnc,m.douReq,m.douPloc,m.douCompl],['#00415e','#1a86b3','#6ba23a','#c0392b'],{thick:120,click:i=>i===3&&drillDou()})); bindCli(el); },
  ppt:(pp,s,m,img)=>{ pptKpis(pp,s,[['Encours douteux',fMds(m.douEnc),'00415E'],['Provision locale',fMds(m.douPloc),'6BA23A'],['Gar. hypo.',fMds(m.douHyp),'1A86B3'],['Complément',fMds(m.douCompl),'C0392B']],1.35); img(0,0.5,2.75,6.1,4.2);
    const t=m.douTop.slice(0,10); pptTable(s,['Client','Encours','Complément'],t.map(x=>[x.client,fInt(x.enc),fInt(x.compl)]),{x:6.75,y:2.75,w:6.1,colW:[3.1,1.5,1.5],right:[1,2],fs:8.5,rowH:0.34}); }});

S({id:'gest',k:'Gestionnaires',t:'Mobilisation des gestionnaires',ok:m=>m.impByG.length>0,html:m=>{ const a=cid();
  const t=m.impByG.slice(0,12);
  return `${head('Gestionnaires','Mobilisation des gestionnaires','Top 12 des portefeuilles par montant impayé — cliquez une barre pour la liste des lignes')}
  <div class="sb" style="display:grid;grid-template-columns:1fr 420px;gap:22px">
    <div class="card rv"><div class="cb"><h3>Impayés par gestionnaire <small>XOF</small></h3>${cv(a,560)}</div></div>
    <div class="card rv" style="--i:2;overflow:hidden"><table class="tb" style="font-size:14px"><thead><tr><th>Gestionnaire</th><th class="r">Lignes</th><th class="r">&gt; 90 j</th></tr></thead><tbody>
      ${t.map((x,i)=>`<tr data-g="${i}"><td style="max-width:250px"><b>${esc(x.g)}</b></td><td class="r">${x.n}</td><td class="r">${x.n90?`<span class="pill" style="--c:#c0392b">${x.n90}</span>`:'—'}</td></tr>`).join('')}</tbody></table></div>
  </div>`; },
  after:(m,el)=>{ const [a]=ids(el); const t=m.impByG.slice(0,12);
    const go=i=>drillImp(r=>(r.g||'(non renseigné)')===t[i].g,'Impayés — '+t[i].g);
    mk(a,barCfg(t.map(x=>x.g),t.map(x=>x.amt),t.map(x=>x.n90?'#c0392b':'#005c83'),{h:true,click:go,tip:c=>[' '+fSmart(c.raw)+' XOF',' '+plural(t[c.dataIndex].n,'ligne')+' · '+t[c.dataIndex].n90+' > 90 j']}));
    el.querySelectorAll('tr[data-g]').forEach(tr=>tr.onclick=()=>go(+tr.dataset.g)); },
  ppt:(pp,s,m,img)=>{ img(0,0.5,1.35,8.0,5.6); const t=m.impByG.slice(0,12); pptTable(s,['Gestionnaire','Lignes','> 90 j'],t.map(x=>[x.g,x.n,x.n90]),{x:8.7,y:1.35,w:4.15,colW:[2.75,0.7,0.7],right:[1,2],fs:8.5,rowH:0.36}); }});

S({id:'read',k:'Synthèse',t:'Constats & actions proposées',html:m=>{ const L=lecture(m);
  return `${head('Synthèse','Constats & actions proposées','Lecture rédigée générée à partir des chiffres du fichier')}
  <div class="sb" style="display:grid;grid-template-columns:1.25fr 1fr;gap:26px">
    <div class="ins">${L.c.map((t,i)=>`<div class="in rv" style="--i:${i};--c:${['#00415e','#005c83','#1a86b3','#c0392b','#b67d1c','#6ba23a'][i%6]}"><i>${i+1}</i><div>${t}</div></div>`).join('')}</div>
    <div class="card rv" style="--i:3;background:linear-gradient(160deg,#fff,#f3f9ec)"><div class="cb"><h3 style="font-size:22px">Actions proposées</h3>
      <div class="ins" style="margin-top:16px">${L.a.map((t,i)=>`<div class="in rv" style="--i:${i+4};--c:#8cc63f;box-shadow:none"><i style="color:#10300a">✓</i><div>${t}</div></div>`).join('')}</div></div></div>
  </div>`; },
  ppt:(pp,s,m)=>{ const L=lecture(m), tx=h=>h.replace(/<[^>]+>/g,'');
    s.addText(L.c.map(t=>({text:tx(t),options:{bullet:{code:'25A0'},breakLine:true}})),{x:0.5,y:1.4,w:7.2,h:5.6,fontSize:13,color:PX.INK,fontFace:'Segoe UI',paraSpaceAfter:8,valign:'top'});
    s.addShape(pp.ShapeType.roundRect,{x:7.95,y:1.4,w:4.9,h:5.6,fill:{color:'F3F9EC'},line:{color:'CFE0E7'},rectRadius:0.12});
    s.addText('Actions proposées',{x:8.15,y:1.5,w:4.5,h:0.45,fontSize:16,bold:true,color:PX.NV,fontFace:'Segoe UI'});
    s.addText(L.a.map(t=>({text:tx(t),options:{bullet:{code:'2713'},breakLine:true}})),{x:8.15,y:2.0,w:4.5,h:4.9,fontSize:12,color:PX.INK,fontFace:'Segoe UI',paraSpaceAfter:8,valign:'top'}); }});

S({id:'end',dark:true,k:'Clôture',t:'Merci',html:m=>`
  <div class="disc" style="width:900px;height:900px;left:-300px;bottom:-480px;background:rgba(140,198,63,.12)"></div>
  <div class="disc" style="width:420px;height:420px;right:-80px;top:-120px;background:rgba(26,134,179,.32)"></div>
  <div class="cov" style="align-items:center;justify-content:center;text-align:center">
    <img class="lgc rv" src="${LOGO_SRC}" alt="Ecobank" style="width:380px">
    <h1 class="rv" style="--i:2;margin-top:60px">Merci<span>.</span></h1>
    <div class="rule rv" style="--i:3;margin-left:auto;margin-right:auto"></div>
    <div class="dt rv" style="--i:4">Questions & échanges · Comité des Risques</div>
    <div class="dt rv" style="--i:5;font-size:17px;color:#9fc3d8;margin-top:30px">PDO Monitor · arrêté au ${esc(m.date||'—')} · Ecobank Sénégal · INTERNAL USE ONLY</div>
  </div>`});

/* ---------- lecture rédigée ---------- */
function lecture(m){ const c=[], a=[];
  if(m.hasA7) c.push(`Le <b>ratio NPL ressort à ${fPct(m.npl)}</b> : ${fMds(m.np)} de créances non performantes sur un encours de ${fMds(m.enc)}, après exclusions BCEAO appliquées au numérateur et au dénominateur.`);
  if(m.hasA7&&m.top10.length) c.push(`Les <b>10 premières expositions pèsent ${fPct(m.top10Sh,1)}</b> de l’encours ; la première (${esc(m.groups[0].k)}) en représente ${fPct(m.groups[0].amt/m.enc*100,1)}.`);
  if(m.impN) c.push(`Les <b>impayés totalisent ${fMds(m.impT)}</b> sur ${plural(m.impN,'ligne')} ; ${esc(m.impByCli[0].client)} en concentre ${fPct(m.impTop1Sh,1)}. ${plural(m.imp90.length,'ligne')} dépasse${m.imp90.length>1?'nt':''} 90 jours pour ${fMds(m.imp90T)}.`);
  if(m.debN) c.push(`Le <b>solde débiteur atteint ${fMds(m.debT)}</b> sur ${plural(m.debN,'compte')}, dont ${fMds(m.debNoLimT)} sans limite autorisée (${plural(m.debNoLim.length,'compte')}).`);
  if(m.decN) c.push(`<b>${plural(m.decN,'client')} à déclasser</b> pour une exposition nette de ${fMds(m.decExpo)} : la provision BCEAO requise s’élève à ${fMds(m.decProv)}.`);
  if(m.douN) c.push(`Sur le <b>douteux 292</b> (${fMds(m.douEnc)}), le complément de provision à doter est de <b>${fMds(m.douCompl)}</b>, la couverture actuelle étant de ${fPct(m.douCov,1)}.`);
  if(m.imp90.length) a.push(`Plan de recouvrement ciblé sur les ${plural(m.imp90.length,'ligne')} en impayé de plus de 90 jours, avant la prochaine bascule de classe.`);
  if(m.impByCli[0]&&m.impTop1Sh>20) a.push(`Suivi rapproché de ${esc(m.impByCli[0].client)}, qui porte ${fPct(m.impTop1Sh,1)} du stock d’impayés.`);
  if(m.debNoLim.length) a.push(`Régulariser ou autoriser les ${plural(m.debNoLim.length,'compte')} débiteur${m.debNoLim.length>1?'s':''} sans limite (${fMds(m.debNoLimT)}).`);
  if(m.decN) a.push(`Valider en comité le déclassement des ${plural(m.decN,'client')} et passer la provision de ${fMds(m.decProv)}.`);
  if(m.douCompl>0) a.push(`Programmer la dotation complémentaire de ${fMds(m.douCompl)} sur le douteux 292, en priorisant les plus gros compléments.`);
  if(m.codN) a.push(`Mobiliser les ${plural(m.codByG.length,'gestionnaire')} concernés sur les ${plural(m.codN,'COD')} à déclasser.`);
  return {c:c.slice(0,6),a:a.slice(0,5)};
}

/* ---------- jauge ---------- */
function gauge(v){ const R=150, L=Math.PI*R, f=Math.min(1,v/20), col=v<5?'#6ba23a':v<10?'#d4a13a':'#c0392b';
  return `<div class="gauge rv"><svg viewBox="0 0 360 218"><defs><linearGradient id="gg" x1="0" x2="1"><stop offset="0" stop-color="#8cc63f"/><stop offset=".5" stop-color="#d4a13a"/><stop offset="1" stop-color="#c0392b"/></linearGradient></defs>
    <path d="M30 185 A150 150 0 0 1 330 185" fill="none" stroke="#e5eef3" stroke-width="26" stroke-linecap="round"/>
    <path class="garc" d="M30 185 A150 150 0 0 1 330 185" fill="none" stroke="url(#gg)" stroke-width="26" stroke-linecap="round" stroke-dasharray="${L}" stroke-dashoffset="${L}" data-off="${L*(1-f)}"/>
    <text x="30" y="215" font-size="12" fill="#6e8794" text-anchor="middle">0 %</text><text x="330" y="215" font-size="12" fill="#6e8794" text-anchor="middle">20 %</text></svg>
    <div class="gv"><b style="color:${col}">${cnt(v,'pct')}</b><span>Ratio NPL</span></div></div>`; }
function parseTile(s){ const m=String(s).match(/^([\d\s\u202f\u00a0]+(?:[.,]\d+)?)\s*(.*)$/); if(!m) return null; const raw=m[1].replace(/[\s\u202f\u00a0]/g,''); const d=(raw.split(/[.,]/)[1]||'').length;
  return {v:parseFloat(raw.replace(',','.')),d,s:m[2]?' '+m[2]:''}; }

/* ---------- moteur de présentation ---------- */
let CUR=0, VIS=[];
const ids=el=>[...el.querySelectorAll('canvas')].map(c=>c.id);
function visible(){ return SL.filter(s=>!s.ok||s.ok(M)); }
function render(at){
  M=model(SEG); VIS=visible(); Object.values(CH).forEach(c=>c.destroy()); CH={};
  const st=$('#stage'); st.innerHTML='';
  VIS.forEach((s,i)=>{ const el=document.createElement('section'); el.className='slide'+(s.dark?' dark':''); el.dataset.id=s.id; el.innerHTML=s.html(M)+(s.dark?'':foot()); st.appendChild(el); s.el=el;
    const pg=el.querySelector('.pg'); if(pg) pg.textContent=(i+1)+' / '+VIS.length; const b=el.querySelector('.sf .bar i'); if(b) b.style.width=((i+1)/VIS.length*100)+'%'; });
  VIS.forEach(s=>{ try{ s.after&&s.after(M,s.el); }catch(e){ console.error(s.id,e); } });
  st.querySelectorAll('[data-go]').forEach(x=>x.onclick=()=>go(VIS.findIndex(s=>s.id===x.dataset.go)));
  $('#ctlT').textContent='PDO Monitor · '+(M.date||''); $('#ctlS').textContent=segLbl()+' · '+D.file;
  segBar(); fit(); go(Math.min(at||0,VIS.length-1),true);
}
function go(i,force){ if(i<0||i>=VIS.length) return; if(i===CUR&&!force) return; CUR=i;
  VIS.forEach((s,k)=>{ s.el.classList.toggle('on',k===i); s.el.classList.toggle('prev',k<i); });
  const s=VIS[i]; $('#ctlN').textContent=(i+1)+' / '+VIS.length; $('#prog').style.width=((i+1)/VIS.length*100)+'%';
  // relance des animations
  s.el.querySelectorAll('.rv').forEach(x=>{ x.style.animation='none'; void x.offsetWidth; x.style.animation=''; });
  s.el.querySelectorAll('canvas').forEach(c=>{ const ch=CH[c.id]; if(ch){ ch.reset(); ch.update(); } });
  s.el.querySelectorAll('.garc').forEach(p=>{ p.style.strokeDashoffset=p.getAttribute('stroke-dasharray'); requestAnimationFrame(()=>requestAnimationFrame(()=>p.style.strokeDashoffset=p.dataset.off)); });
  counters(s.el);
  try{ history.replaceState(null,'','#'+(i+1)); }catch(e){}
}
function counters(root){ root.querySelectorAll('.cnt').forEach(el=>{ const v=+el.dataset.v, f=el.dataset.f, t0=performance.now(), T=1300;
  const fmt=f==='raw'?(x=>fDec(x,+el.dataset.d)+(el.dataset.s||'')):FMT[f];
  const step=t=>{ const p=Math.min(1,(t-t0)/T), e=1-Math.pow(1-p,4); el.textContent=fmt(v*e); if(p<1) requestAnimationFrame(step); }; requestAnimationFrame(step); }); }
function fit(){ const vp=$('#viewport'), W=vp.clientWidth, H=vp.clientHeight, pad=W<700?8:28; const s=Math.min((W-pad*2)/1600,(H-pad*2)/900);
  const st=$('#stage'); st.style.transform=`scale(${s})`; st.style.left=((W-1600*s)/2)+'px'; st.style.top=((H-900*s)/2)+'px'; }
function segBar(){ const segs=['ALL',...SEGS.filter(s=>D.A7.some(r=>r.bseg===s)||D.IMP.some(r=>r.seg===s))];
  $('#segF').innerHTML=segs.map(s=>`<button class="${s===SEG?'on':''}" data-s="${s}">${s==='ALL'?'Tous':s.charAt(0)+s.slice(1).toLowerCase()}</button>`).join('');
  $('#segF').querySelectorAll('button').forEach(b=>b.onclick=()=>setSeg(b.dataset.s)); }
function setSeg(s){ if(SEG===s) s='ALL'; SEG=s; const id=VIS[CUR]&&VIS[CUR].id; closeAll(); render(0); const j=VIS.findIndex(x=>x.id===id); go(j<0?0:j,true); toast('Périmètre : '+segLbl()); }

/* ---------- tiroir fiche client 360° ---------- */
function bindCli(el){ el.querySelectorAll('tr[data-cli]').forEach(tr=>tr.onclick=()=>openCli(tr.dataset.cli)); }
function openCli(code){ const o=IDX[code]; if(!o){ toast('Client introuvable'); return; }
  const a7=o.A7, base=a7.filter(r=>!NPL_EXCL_PROD.has(r.prod)&&r.segc!==NPL_EXCL_SEG), enc=sum(a7,r=>r.ot), np=sum(a7.filter(r=>r.stat==='NP'),r=>r.ot);
  const worst=[...a7,...o.IMP,...o.DEB].reduce((w,r)=>clsRank(r.cl)>clsRank(w)?r.cl:w,'');
  const tbl=(h,rows,right=[])=>rows.length?`<table class="tb"><thead><tr>${h.map((x,i)=>`<th class="${right.includes(i)?'r':''}">${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map((c,i)=>`<td class="${right.includes(i)?'r':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<div class="empty">Aucune ligne</div>';
  $('#drawer').innerHTML=`<div class="dh"><small>Fiche client 360°</small><h3>${esc(o.name)}</h3><p>Code ${esc(o.code)} · ${esc(o.seg||'—')} · ${esc(o.g||'—')}${a7[0]&&a7[0].grp?' · Groupe '+esc(a7[0].grp):''}</p><button class="x" aria-label="Fermer">✕</button></div>
  <div class="dbd">
    <div class="dk">${kp('Engagements (ACTE 7)',fSmart(enc),plural(a7.length,'contrat'),'#00415e')}${kp('Classe la plus dégradée',worst?pill(worst)+' '+(CLS_LIB[worst]||''):'—','',clsCol(worst))}
    ${kp('Impayés',fSmart(sum(o.IMP,r=>r.m)),plural(o.IMP.length,'ligne'),'#005c83')}${kp('Créances NP',fSmart(np),base.length+' contrats base NPL','#c0392b')}</div>
    ${o.DEC.length?`<div class="ds"><h4>Déclassement proposé</h4>${o.DEC.map(r=>`<div class="in" style="font-size:13.5px;--c:${clsCol(r.cl)}"><i>${esc(r.cl)}</i><div><b>${esc(r.motif)}</b><br>Expo nette ${fInt(r.expo)} XOF · taux ${fTaux(r.taux)} · provision <b>${fInt(r.prov)} XOF</b> · défaut le ${esc(r.dd)}</div></div>`).join('')}</div>`:''}
    ${o.DOU.length?`<div class="ds"><h4>Douteux 292</h4>${tbl(['Encours','Prov. locale','Gar. hypo.','Complément'],o.DOU.map(r=>[fInt(r.enc),fInt(r.ploc),fInt(r.hyp),'<b>'+fInt(r.compl)+'</b>']),[0,1,2,3])}</div>`:''}
    <div class="ds"><h4>Impayés</h4>${tbl(['Référence','Produit','Échéance','Jours','Cl.','Montant'],o.IMP.map(r=>[esc(r.ref),esc(r.prod),esc(r.ech),jpill(r.j),pill(r.cl),fInt(r.m)]),[3,5])}</div>
    <div class="ds"><h4>Comptes débiteurs</h4>${tbl(['Compte','Solde','Limite','Jours','Cl.'],[...o.DEB.map(r=>[esc(r.cpt),fInt(r.solde),fInt(r.lim),fInt(r.j),pill(r.cl)]),...o.COD.filter(c=>!o.DEB.some(d=>d.cpt===c.cpt)).map(r=>[esc(r.cpt)+' <small>(COD)</small>',fInt(r.solde),'—',fInt(r.j),pill(r.cl)])],[1,2,3])}</div>
    <div class="ds"><h4>Contrats ACTE 7 ${a7.length>15?'<small>(15 plus gros)</small>':''}</h4>${tbl(['Contrat','Produit','Cl.','St.','P/NP','Encours'],[...a7].sort((x,y)=>y.ot-x.ot).slice(0,15).map(r=>[esc(r.ref),esc(r.prod),pill(r.cl),r.st||'',esc(r.stat),fInt(r.ot)]),[5])}</div>
  </div>`;
  $('#drawer').querySelector('.x').onclick=closeAll; $('#drawer').classList.add('on'); $('#ov').classList.add('on'); }

/* ---------- fenêtres de détail ---------- */
function modal(title,sub,headH,rows,right,clis,total){
  $('#modal').innerHTML=`<div class="dh"><small>Détail</small><h3>${esc(title)}</h3><p>${sub}</p><button class="x" aria-label="Fermer">✕</button></div>
   <div class="dbd"><table class="tb"><thead><tr>${headH.map((h,i)=>`<th class="${right.includes(i)?'r':''}">${h}</th>`).join('')}</tr></thead><tbody>
   ${rows.map((r,k)=>`<tr ${clis&&clis[k]?`data-cli="${esc(clis[k])}"`:''}>${r.map((c,i)=>`<td class="${right.includes(i)?'r':''}">${c}</td>`).join('')}</tr>`).join('')}
   ${total?`<tr class="tot">${total.map((c,i)=>`<td class="${right.includes(i)?'r':''}">${c}</td>`).join('')}</tr>`:''}</tbody></table></div>`;
  $('#modal').querySelector('.x').onclick=closeAll; $('#modal').querySelectorAll('tr[data-cli]').forEach(tr=>tr.onclick=()=>{ closeAll(); openCli(tr.dataset.cli); });
  $('#modal').classList.add('on'); $('#ov').classList.add('on'); }
function closeAll(){ ['#modal','#drawer','#ov'].forEach(s=>$(s).classList.remove('on')); }
const LIM=200;
function baseA7(){ return D.A7.filter(r=>(SEG==='ALL'||r.bseg===SEG)&&!NPL_EXCL_PROD.has(r.prod)&&r.segc!==NPL_EXCL_SEG); }
function drillRows(rs,title,key){ rs=[...rs].sort((a,b)=>b[key]-a[key]); return rs; }
function drillA7(rs,title){ rs=drillRows(rs,title,'ot'); const t=rs.slice(0,LIM);
  modal(title,`${plural(rs.length,'contrat')} · ${fInt(sum(rs,r=>r.ot))} XOF${rs.length>LIM?' · '+LIM+' plus gros affichés':''}`,['Client','Contrat','Produit','Segment','Gestionnaire','Cl.','P/NP','Encours XOF'],
    t.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.ref),esc(r.prod),esc(r.bseg),esc(r.off),pill(r.cl),esc(r.stat),fInt(r.ot)]),[7],t.map(r=>r.code),['TOTAL','','','','','','',fInt(sum(rs,r=>r.ot))]); }
function drillA7Class(c){ drillA7(baseA7().filter(r=>r.cl===c),'Encours classe '+c+' · '+CLS_LIB[c]); }
function drillA7Stage(s){ drillA7(baseA7().filter(r=>Math.round(r.st)===s),'Encours en stade '+s); }
function drillGroup(g){ drillA7(baseA7().filter(r=>(r.grp||r.client||r.code)===g),'Groupe '+g); }
function drillImp(f,title){ const rs=drillRows(M.imp.filter(f),title,'m'), t=rs.slice(0,LIM);
  modal(title,`${plural(rs.length,'ligne')} · ${fInt(sum(rs,r=>r.m))} XOF`,['Client','Référence','Produit','Échéance','Jours','Cl.','Gestionnaire','Montant XOF'],
    t.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.ref),esc(r.prod),esc(r.ech),jpill(r.j),pill(r.cl),esc(r.g),fInt(r.m)]),[4,7],t.map(r=>r.code),['TOTAL','','','','','','',fInt(sum(rs,r=>r.m))]); }
function drillDeb(f,title){ const rs=drillRows(M.deb.filter(f),title,'solde'), t=rs.slice(0,LIM);
  modal(title,`${plural(rs.length,'compte')} · ${fInt(sum(rs,r=>r.solde))} XOF`,['Client','Compte','Débiteur depuis','Jours','Cl.','Limite','Solde XOF'],
    t.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.cpt),esc(r.depuis),fInt(r.j),pill(r.cl),fInt(r.lim),fInt(r.solde)]),[3,5,6],t.map(r=>r.code),['TOTAL','','','','','',fInt(sum(rs,r=>r.solde))]); }
function drillCod(f,title){ const rs=drillRows(M.cod.filter(f),title,'solde'), t=rs.slice(0,LIM);
  modal(title,`${plural(rs.length,'compte')} · ${fInt(sum(rs,r=>r.solde))} XOF`,['Client','Compte','Débiteur depuis','Jours','Cl.','Gestionnaire','Solde XOF'],
    t.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.cpt),esc(r.depuis),fInt(r.j),pill(r.cl),esc(r.g),fInt(r.solde)]),[3,6],t.map(r=>r.code),['TOTAL','','','','','',fInt(sum(rs,r=>r.solde))]); }
function drillDec(){ const rs=M.dec; modal('Clients à déclasser',`${plural(rs.length,'client')} · provision ${fInt(M.decProv)} XOF`,['Client','Motif','Jours','Cl.','Taux','Expo nette','Provision'],
    rs.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.motif),fInt(r.j),pill(r.cl),fTaux(r.taux),fInt(r.expo),fInt(r.prov)]),[2,5,6],rs.map(r=>r.code),['TOTAL','','','','',fInt(M.decExpo),fInt(M.decProv)]); }
function drillDou(){ const rs=M.douTop.filter(r=>r.compl>0), t=rs.slice(0,LIM); modal('Douteux 292 — compléments à doter',`${plural(rs.length,'dossier')} · ${fInt(sum(rs,r=>r.compl))} XOF`,['Client','Gestionnaire','Encours','Prov. locale','Gar. hypo.','Complément'],
    t.map(r=>[`<b>${esc(r.client)}</b>`,esc(r.g),fInt(r.enc),fInt(r.ploc),fInt(r.hyp),fInt(r.compl)]),[2,3,4,5],t.map(r=>r.code),['TOTAL','',fInt(sum(rs,r=>r.enc)),fInt(sum(rs,r=>r.ploc)),fInt(sum(rs,r=>r.hyp)),fInt(sum(rs,r=>r.compl))]); }

/* ---------- plan & recherche ---------- */
function overview(){ $('#modal').innerHTML=`<div class="dh"><small>Plan</small><h3>${VIS.length} diapositives</h3><p>${esc(segLbl())} · cliquez pour y aller</p><button class="x" aria-label="Fermer">✕</button></div>
  <div class="dbd"><div class="ovg">${VIS.map((s,i)=>`<div class="oc ${s.dark?'dk2':''} ${i===CUR?'cur':''}" data-i="${i}" style="--c:${i%2?'#6ba23a':'#005c83'}"><b>${String(i+1).padStart(2,'0')}</b><span>${esc(s.t)}</span><small>${esc(s.k)}</small></div>`).join('')}</div></div>`;
  $('#modal').querySelector('.x').onclick=closeAll; $('#modal').querySelectorAll('[data-i]').forEach(x=>x.onclick=()=>{ closeAll(); go(+x.dataset.i); });
  $('#modal').classList.add('on'); $('#ov').classList.add('on'); }
function search(){ $('#modal').innerHTML=`<div class="dh"><small>Recherche</small><h3>Trouver un client</h3><p>Nom, code client ou groupe — ouvre la fiche 360°</p><button class="x" aria-label="Fermer">✕</button></div>
  <div class="srch"><input id="q" placeholder="ex. SENELEC, 101304873…" autocomplete="off"></div><div class="dbd" id="qr"></div>`;
  const all=Object.values(IDX); const q=$('#q'), out=$('#qr');
  const run=()=>{ const t=norm(q.value); if(t.length<2){ out.innerHTML='<div class="empty">Saisissez au moins 2 caractères.</div>'; return; }
    const r=all.filter(o=>norm(o.name).includes(t)||String(o.code).includes(t)||(o.A7[0]&&norm(o.A7[0].grp).includes(t))).map(o=>({o,e:sum(o.A7,r=>r.ot),i:sum(o.IMP,r=>r.m)})).sort((a,b)=>b.e-a.e).slice(0,40);
    out.innerHTML=r.length?`<table class="tb"><thead><tr><th>Client</th><th>Code</th><th>Segment</th><th class="r">Engagements</th><th class="r">Impayés</th></tr></thead><tbody>${r.map(x=>`<tr data-cli="${esc(x.o.code)}"><td><b>${esc(x.o.name)}</b></td><td>${esc(x.o.code)}</td><td>${esc(x.o.seg)}</td><td class="r">${fSmart(x.e)}</td><td class="r">${x.i?fSmart(x.i):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">Aucun client trouvé.</div>';
    out.querySelectorAll('tr[data-cli]').forEach(tr=>tr.onclick=()=>{ closeAll(); openCli(tr.dataset.cli); }); };
  q.oninput=run; run(); $('#modal').querySelector('.x').onclick=closeAll; $('#modal').classList.add('on'); $('#ov').classList.add('on'); setTimeout(()=>q.focus(),50); }

/* ---------- export PowerPoint ---------- */
function pptKpiBox(pp,s,x,y,w,k){ s.addShape(pp.ShapeType.roundRect,{x,y,w,h:1.3,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.1,shadow:{type:'outer',blur:3,offset:1.5,angle:90,color:'00415E',opacity:0.12}});
  s.addShape(pp.ShapeType.rect,{x,y:y+0.14,w:0.07,h:1.02,fill:{color:k[3]}});
  s.addText(k[0].toUpperCase(),{x:x+0.2,y:y+0.08,w:w-0.3,h:0.28,fontSize:8.5,bold:true,color:PX.MU,fontFace:'Segoe UI'});
  s.addText(k[1],{x:x+0.2,y:y+0.36,w:w-0.3,h:0.5,fontSize:20,bold:true,color:k[3],fontFace:'Consolas'});
  s.addText(k[2],{x:x+0.2,y:y+0.88,w:w-0.3,h:0.3,fontSize:9,color:PX.MU,fontFace:'Segoe UI',fit:'shrink'}); }
async function exportPptx(){ const P=window.PptxGenJS; if(!P){ toast('Moteur PowerPoint indisponible'); return; }
  busy(true,'Construction du PowerPoint…','Capture des graphiques et mise en page'); await tick();
  try{ const badge=await g3LogoBadge(); const pp=new P(); pp.layout='LAYOUT_WIDE'; pp.title='PDO Monitor — '+M.date; pp.company='Ecobank Sénégal';
    const foot='PDO Monitor · arrêté au '+M.date+' · '+segLbl()+' · Ecobank Sénégal · INTERNAL USE ONLY'; let n=0;
    for(const sd of VIS){
      if(sd.id==='cover'){ const s=pp.addSlide(); s.background={color:PX.NV};
        s.addShape(pp.ShapeType.ellipse,{x:8.6,y:-2.2,w:7,h:7,fill:{color:PX.LM,transparency:86},line:{color:PX.LM,transparency:100}});
        s.addShape(pp.ShapeType.ellipse,{x:10.4,y:3.6,w:4.6,h:4.6,fill:{color:'1A86B3',transparency:80},line:{color:'1A86B3',transparency:100}});
        if(badge) s.addImage({data:badge,x:0.7,y:0.7,w:3.1,h:1.13});
        s.addText('PDO Monitor',{x:0.7,y:2.4,w:10,h:1.0,fontSize:44,bold:true,color:'FFFFFF',fontFace:'Segoe UI'});
        s.addShape(pp.ShapeType.rect,{x:0.72,y:3.45,w:1.4,h:0.07,fill:{color:PX.LM}});
        s.addText('Revue du risque de crédit — arrêté au '+M.date,{x:0.7,y:3.65,w:11,h:0.5,fontSize:20,color:PX.L2,fontFace:'Segoe UI'});
        const h=[]; if(M.hasA7){ h.push(['Encours crédit',fMds(M.enc)],['Ratio NPL',fPct(M.npl)]); } h.push(['Impayés',fMds(M.impT)],['Clients à déclasser',fInt(M.decN)]);
        h.forEach((k,i)=>{ const x=0.7+i*3.05; s.addShape(pp.ShapeType.roundRect,{x,y:4.7,w:2.85,h:1.2,fill:{color:'FFFFFF',transparency:90},line:{color:'FFFFFF',transparency:75},rectRadius:0.12});
          s.addText(k[0].toUpperCase(),{x:x+0.2,y:4.8,w:2.5,h:0.3,fontSize:9,bold:true,color:'A9CDE0',fontFace:'Segoe UI'}); s.addText(k[1],{x:x+0.2,y:5.1,w:2.6,h:0.6,fontSize:24,bold:true,color:i===1&&M.hasA7?PX.L2:'FFFFFF',fontFace:'Segoe UI'}); });
        s.addText('Ecobank Sénégal · Direction des Engagements · '+segLbl(),{x:0.7,y:6.6,w:11,h:0.4,fontSize:11,color:'9FC3D8',fontFace:'Segoe UI'}); continue; }
      if(sd.id==='end'){ const s=pp.addSlide(); s.background={color:PX.NV}; if(badge) s.addImage({data:badge,x:5.1,y:2.2,w:3.1,h:1.13});
        s.addText('Merci',{x:0,y:3.6,w:13.33,h:0.8,fontSize:36,bold:true,color:'FFFFFF',align:'center',fontFace:'Segoe UI'});
        s.addText('PDO Monitor · Ecobank Sénégal · INTERNAL USE ONLY',{x:0,y:4.5,w:13.33,h:0.5,fontSize:14,color:'CFE0EE',align:'center',fontFace:'Segoe UI'}); continue; }
      if(!sd.ppt) continue;
      const s=pp.addSlide(); pptBand(pp,s,sd.t,sd.k+' · '+segLbl(),foot,++n,badge);
      const cs=[...sd.el.querySelectorAll('canvas')].map(c=>CH[c.id]).filter(Boolean);
      const img=(k,x,y,w,h)=>{ const ch=cs[k]; if(!ch) return; ch.stop(); ch.update('none'); const r=ch.canvas.width/ch.canvas.height; let W=w,H=w/r; if(H>h){ H=h; W=h*r; }
        s.addShape(pp.ShapeType.roundRect,{x,y,w,h,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.08,shadow:{type:'outer',blur:4,offset:2,angle:90,color:'00415E',opacity:0.15}});
        s.addImage({data:ch.toBase64Image('image/png',1),x:x+(w-W)/2,y:y+(h-H)/2,w:W*0.96,h:H*0.96}); };
      sd.ppt(pp,s,M,img); }
    await pp.writeFile({fileName:'ECOBANK_PDO_Slides_'+(M.date||'').split('/').reverse().join('-')+(SEG!=='ALL'?'_'+SEG:'')+'.pptx'});
    toast('✅ PowerPoint exporté'); }
  catch(e){ console.error(e); toast('⚠️ Export PowerPoint impossible : '+e.message); }
  busy(false); }

/* ---------- minuteur ---------- */
let T0=0; function startTimer(){ T0=Date.now(); clearInterval(startTimer._i); startTimer._i=setInterval(()=>{ const s=Math.floor((Date.now()-T0)/1000); $('#timer').textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); },1000); }

/* ---------- branchements ---------- */
(function init(){
  $('#homeLogo').src=LOGO_SRC; $('#ctlLogo').src=LOGO_SRC;
  const z=$('#zone'), fi=$('#file');
  fi.onchange=()=>{ if(fi.files[0]) loadFile(fi.files[0]); fi.value=''; };
  z.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); fi.click(); } });
  ['dragenter','dragover'].forEach(t=>document.addEventListener(t,e=>{ e.preventDefault(); z.classList.add('drag'); }));
  ['dragleave','drop'].forEach(t=>document.addEventListener(t,e=>{ e.preventDefault(); z.classList.remove('drag'); }));
  document.addEventListener('drop',e=>{ const f=e.dataTransfer&&e.dataTransfer.files[0]; if(f) loadFile(f); });
  $('#bPrev').onclick=()=>go(CUR-1); $('#bNext').onclick=()=>go(CUR+1); $('#bOv').onclick=overview; $('#bSearch').onclick=search; $('#bPpt').onclick=exportPptx;
  $('#bPrint').onclick=()=>{ VIS.forEach(s=>s.el.querySelectorAll('.garc').forEach(p=>p.style.strokeDashoffset=p.dataset.off)); setTimeout(()=>window.print(),100); };
  $('#bHome').onclick=()=>{ $('#deck').hidden=true; $('#home').hidden=false; closeAll(); };
  $('#bFs').onclick=toggleFs; $('#ov').onclick=closeAll;
  window.addEventListener('resize',()=>{ if(D) fit(); });
  document.addEventListener('fullscreenchange',()=>{ document.body.classList.toggle('fs',!!document.fullscreenElement); setTimeout(fit,60); });
  let hideT; document.addEventListener('mousemove',e=>{ if(!document.body.classList.contains('fs')) return; document.body.classList.toggle('show',e.clientY>window.innerHeight-90); clearTimeout(hideT); hideT=setTimeout(()=>document.body.classList.remove('show'),2500); });
  document.addEventListener('keydown',e=>{ if($('#deck').hidden) return; const typing=e.target.tagName==='INPUT';
    if(e.key==='Escape'){ closeAll(); return; } if(typing) return;
    const open=$('#modal').classList.contains('on')||$('#drawer').classList.contains('on');
    if(['ArrowRight','PageDown',' '].includes(e.key)&&!open){ e.preventDefault(); go(CUR+1); }
    else if(['ArrowLeft','PageUp'].includes(e.key)&&!open){ e.preventDefault(); go(CUR-1); }
    else if(e.key==='Home'){ go(0); } else if(e.key==='End'){ go(VIS.length-1); }
    else if(e.key==='o'||e.key==='O'){ open?closeAll():overview(); }
    else if(e.key==='f'||e.key==='F'){ toggleFs(); }
    else if(e.key==='/'||(e.key==='k'&&(e.ctrlKey||e.metaKey))){ e.preventDefault(); search(); } });
  let sx=null, sy=null; const vp=$('#viewport');
  vp.addEventListener('touchstart',e=>{ sx=e.touches[0].clientX; sy=e.touches[0].clientY; },{passive:true});
  vp.addEventListener('touchend',e=>{ if(sx==null) return; const dx=e.changedTouches[0].clientX-sx, dy=e.changedTouches[0].clientY-sy; if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)) go(CUR+(dx<0?1:-1)); sx=null; });
})();
function toggleFs(){ try{ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); }catch(e){ toast('Plein écran indisponible'); } }

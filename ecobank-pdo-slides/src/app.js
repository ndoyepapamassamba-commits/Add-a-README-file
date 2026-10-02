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
      ${kp('Provision BCEAO requise',cnt(m.decProv,'mds'),'sur les déclassements','#6ba23a')}${kp('Complément douteux',cnt(m.douCompl,'mds'),plural(m.douN,'dossier')+' douteux','#c0392b')}</div>`; }});

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
    mk(b,donutCfg(m.bySt.map(x=>'Stade '+x.s),m.bySt.map(x=>x.amt),['#4e8a2e','#d4a13a','#c0392b'],{t:fPct(m.enc?m.bySt[2].amt/m.enc*100:0,1),s:'en stade 3'},{click:i=>drillA7Stage(i+1)})); }});

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
    el.querySelectorAll('tr[data-seg]').forEach(tr=>tr.onclick=()=>setSeg(tr.dataset.seg)); }});

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
    fmt:(v)=>fMds(v)+'  ·  '+fPct(m.enc?v/m.enc*100:0,1),tip:c=>[' '+fInt(c.raw)+' XOF',' '+plural(m.top10[c.dataIndex].n,'contrat')+(m.top10[c.dataIndex].np?' · dont NP '+fSmart(m.top10[c.dataIndex].np):'')]})); CH[a].options.layout.padding.right=190; CH[a].update('none'); }});

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
    mk(b,donutCfg(m.impCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.impCl.map(x=>x.amt),m.impCl.map(x=>clsCol(x.c)),{t:fMds(m.impT),s:'impayés'},{click:i=>drillImp(r=>r.cl===m.impCl[i].c,'Impayés classe '+m.impCl[i].c)})); }});

S({id:'imptop',k:'Impayés',t:'Les 12 premiers impayés',ok:m=>m.impN>0,html:m=>{ const t=m.impByCli.slice(0,12), mx=t[0]?t[0].amt:1;
  return `${head('Impayés','Les 12 premiers impayés','Consolidés par client · cliquez une ligne pour ouvrir la fiche 360°')}
  <div class="sb"><div class="card rv" style="height:100%"><table class="tb"><thead><tr><th>#</th><th>Client</th><th>Segment</th><th>Gestionnaire</th><th class="r">Lignes</th><th class="r">Jours max</th><th>Classe</th><th class="r">Montant XOF</th><th style="width:170px">Poids</th></tr></thead><tbody>
  ${t.map((x,i)=>`<tr data-cli="${esc(x.code)}"><td><span class="rk">${i+1}</span></td><td><b>${esc(x.client)}</b></td><td>${esc(x.seg)}</td><td>${esc(x.g)}</td><td class="r">${x.n}</td><td class="r">${jpill(x.j)}</td><td>${pill(x.cl)}</td><td class="r"><b>${fInt(x.amt)}</b></td><td><span class="bar-in" style="width:${Math.max(3,x.amt/mx*150)}px"></span> <small>${fPct(x.amt/m.impT*100,1)}</small></td></tr>`).join('')}
  <tr class="tot"><td></td><td>TOTAL TOP 12</td><td></td><td></td><td class="r">${sum(t,x=>x.n)}</td><td></td><td></td><td class="r">${fInt(sum(t,x=>x.amt))}</td><td>${fPct(sum(t,x=>x.amt)/m.impT*100,1)} du stock</td></tr>
  </tbody></table></div></div>`; },
  after:(m,el)=>bindCli(el)});

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
              y:{min:0,max:105,grid:{color:gridC},border:{display:false},title:{display:true,text:'Part en impayé',font:{weight:'700'}},ticks:{callback:v=>v<=100?v+' %':''}}}}}); }});

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
    mk(a,barCfg(m.debAge.map(x=>x.l),m.debAge.map(x=>x.amt),m.debAge.map(x=>x.c),{click:i=>drillDeb(r=>r.j>=DAGE[i][0]&&r.j<=DAGE[i][1],'Débiteurs '+m.debAge[i].l),tip:c=>' '+fSmart(c.raw)+' XOF · '+plural(m.debAge[c.dataIndex].n,'compte')})); bindCli(el); }});

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
    const t=m.codByG.slice(0,10); mk(b,barCfg(t.map(x=>x.g),t.map(x=>x.n),'#005c83',{h:true,fmt:v=>String(v),tip:c=>' '+plural(c.raw,'compte')+' · '+fSmart(t[c.dataIndex].amt)+' XOF',click:i=>drillCod(r=>(r.g||'(non renseigné)')===t[i].g,'COD à déclasser — '+t[i].g)})); CH[b].options.scales.x.ticks.callback=v=>v; CH[b].options.layout.padding.right=40; CH[b].update('none'); }});

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
  after:(m,el)=>{ bindCli(el); const mr=el.querySelector('[data-more]'); if(mr) mr.onclick=()=>drillDec(); }});

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
  after:(m,el)=>{ const [a]=ids(el); mk(a,barCfg(['Encours','Provision requise','Provision locale','Complément'],[m.douEnc,m.douReq,m.douPloc,m.douCompl],['#00415e','#1a86b3','#6ba23a','#c0392b'],{thick:120,click:i=>i===3&&drillDou()})); bindCli(el); }});

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
    el.querySelectorAll('tr[data-g]').forEach(tr=>tr.onclick=()=>go(+tr.dataset.g)); }});

S({id:'read',k:'Synthèse',t:'Constats & actions proposées',html:m=>{ const L=lecture(m);
  return `${head('Synthèse','Constats & actions proposées','Lecture rédigée générée à partir des chiffres du fichier')}
  <div class="sb" style="display:grid;grid-template-columns:1.25fr 1fr;gap:26px">
    <div class="ins">${L.c.map((t,i)=>`<div class="in rv" style="--i:${i};--c:${['#00415e','#005c83','#1a86b3','#c0392b','#b67d1c','#6ba23a'][i%6]}"><i>${i+1}</i><div>${t}</div></div>`).join('')}</div>
    <div class="card rv" style="--i:3;background:linear-gradient(160deg,#fff,#f3f9ec)"><div class="cb"><h3 style="font-size:22px">Actions proposées</h3>
      <div class="ins" style="margin-top:16px">${L.a.map((t,i)=>`<div class="in rv" style="--i:${i+4};--c:#8cc63f;box-shadow:none"><i style="color:#10300a">✓</i><div>${t}</div></div>`).join('')}</div></div></div>
  </div>`; }});

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

/* =====================================================================
   EXPORT POWERPOINT INTERACTIF
   - graphiques NATIFS PowerPoint (valeurs au survol, données éditables dans Excel)
   - sommaire et barre de navigation cliquables (◀ ⌂ ▶) sur chaque diapositive
   - approfondissement : classes, groupes et fiches clients en annexe, avec « Retour »
   - animations d'entrée en cascade, transitions, notes du présentateur
   Les liens et animations sont ajoutés par post-traitement XML (JSZip).
   ===================================================================== */
const PF='Segoe UI';
const hx=c=>String(c).replace('#','').toUpperCase();
const cut=(t,n)=>{ t=String(t==null?'':t); return t.length>n?t.slice(0,n-1)+'…':t; };
const unitOf=mx=>mx>=5e9?{d:1e9,l:'Mds XOF',f:'#,##0.00'}:{d:1e6,l:'M XOF',f:'#,##0.0'};
const CHB={fontFace:PF,catAxisLabelColor:'3E5C6B',valAxisLabelColor:'6E8794',catAxisLabelFontSize:10,valAxisLabelFontSize:9,catAxisLabelFontFace:PF,valAxisLabelFontFace:PF,
  valGridLine:{color:'E3EDF2',size:0.75},catGridLine:{style:'none'},catAxisLineShow:false,valAxisLineShow:false,showValue:true,dataLabelFontSize:9,dataLabelColor:'00415E',
  dataLabelFontBold:true,dataLabelFontFace:PF,showLegend:false,barGapWidthPct:55};

function pptKpiBox(pp,s,x,y,w,k){ s.addShape(pp.ShapeType.roundRect,{x,y,w,h:1.3,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.1,shadow:{type:'outer',blur:3,offset:1.5,angle:90,color:'00415E',opacity:0.12}});
  s.addShape(pp.ShapeType.rect,{x,y:y+0.14,w:0.07,h:1.02,fill:{color:k[3]}});
  s.addText(String(k[0]).toUpperCase(),{x:x+0.2,y:y+0.08,w:w-0.3,h:0.28,fontSize:8.5,bold:true,color:PX.MU,fontFace:PF});
  s.addText(String(k[1]),{x:x+0.2,y:y+0.36,w:w-0.3,h:0.5,fontSize:20,bold:true,color:k[3],fontFace:'Consolas'});
  if(k[2]) s.addText(String(k[2]),{x:x+0.2,y:y+0.88,w:w-0.3,h:0.3,fontSize:9,color:PX.MU,fontFace:PF,fit:'shrink'}); }

/* contexte de construction d'une diapositive */
function pptCtx(pp,s,num){
  const X={pp,s,
    link(x,y,w,h,key){ s.addText(' ',{x,y,w,h,fill:{color:'FFFFFF',transparency:100},line:{color:'FFFFFF',transparency:100},objectName:'LNK|'+key}); },
    btn(x,y,w,label,key,o={}){ const h=o.h||0.34;
      s.addText(label,{x,y,w,h,shape:pp.ShapeType.roundRect,rectRadius:0.08,fill:{color:o.fill||'FFFFFF'},line:{color:o.line||'1A86B3',width:1},fontSize:o.fs||9.5,bold:true,
        color:o.color||PX.NV,align:'center',valign:'middle',fontFace:PF,margin:0,objectName:'LNK|'+key,shadow:{type:'outer',blur:2,offset:1,angle:90,color:'00415E',opacity:0.15}}); },
    card(x,y,w,h,title,sub){ s.addShape(pp.ShapeType.roundRect,{x,y,w,h,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.08,shadow:{type:'outer',blur:4,offset:2,angle:90,color:'00415E',opacity:0.13}});
      s.addShape(pp.ShapeType.rect,{x,y:y+0.12,w:0.06,h:0.3,fill:{color:PX.LM}});
      if(title) s.addText([{text:title,options:{bold:true,color:PX.NV,fontSize:12}},...(sub?[{text:'   '+sub,options:{color:'6E8794',fontSize:9}}]:[])],{x:x+0.15,y:y+0.06,w:w-0.3,h:0.42,fontFace:PF,valign:'middle'}); },
    bar(x,y,w,h,labels,vals,cols,o={}){ const u=o.unit||unitOf(Math.max(...vals,0)); const horiz=!!o.h;
      s.addChart(pp.ChartType.bar,[{name:o.name||u.l,labels:labels.map(l=>cut(l,horiz?34:22)),values:vals.map(v=>o.raw?v:+(v/u.d).toFixed(3))}],
        Object.assign({},CHB,{x,y,w,h,barDir:horiz?'bar':'col',chartColors:(Array.isArray(cols)?cols:[cols]).map(hx),dataLabelFormatCode:o.raw?(o.fmt||'#,##0'):u.f,
          valAxisLabelFormatCode:o.raw?(o.fmt||'#,##0'):u.f,catAxisOrientation:horiz?'maxMin':'minMax',valAxisHidden:horiz,valGridLine:horiz?{style:'none'}:CHB.valGridLine,
          dataLabelPosition:'outEnd',showValAxisTitle:!horiz,valAxisTitle:o.raw?(o.axis||''):u.l,valAxisTitleFontSize:9,valAxisTitleColor:'6E8794'},o.opt||{})); },
    donut(x,y,w,h,labels,vals,cols,o={}){
      s.addChart(pp.ChartType.doughnut,[{name:o.name||'Répartition',labels,values:vals}],{x,y,w,h,holeSize:58,chartColors:cols.map(hx),showPercent:true,showValue:false,showLegend:true,legendPos:'r',
        legendFontSize:10,legendFontFace:PF,legendColor:'12333F',dataLabelColor:'FFFFFF',dataLabelFontSize:9,dataLabelFontBold:true,dataLabelFormatCode:'0.0%',fontFace:PF}); },
    notes(t){ if(t) s.addNotes(String(t).replace(/<[^>]+>/g,'')); }
  };
  return X;
}

/* tableau + zones cliquables par ligne (hauteur de ligne fixe, libellés tronqués pour éviter tout retour à la ligne) */
function pptTableLinked(X,head,rows,o){ const rowH=o.rowH||0.3, y=o.y||1.35;
  pptTable(X.s,head,rows,Object.assign({rowH,y},o));
  if(o.links) o.links.forEach((k,i)=>{ if(k) X.link(o.x||0.5,y+rowH*(i+1),o.w||12.33,rowH,k); }); }

/* ---------- construction ---------- */
async function exportPptx(){ const P=window.PptxGenJS; if(!P){ toast('Moteur PowerPoint indisponible'); return; }
  busy(true,'Construction du PowerPoint interactif…','Graphiques natifs, liens et animations'); await tick();
  try{
    const m=M, badge=await g3LogoBadge(), pp=new P(); pp.layout='LAYOUT_WIDE'; pp.title='PDO Monitor — '+m.date; pp.company='Ecobank Sénégal'; pp.author='Direction des Engagements';
    const foot='PDO Monitor · arrêté au '+m.date+' · '+segLbl()+' · INTERNAL USE ONLY';
    const LC=lecture(m), noteFor=re=>(LC.c.find(t=>re.test(t))||'');
    /* 1. plan : diapositives principales puis annexes */
    const main=VIS.filter(s=>s.id!=='end').map(s=>s.id);
    const ann=[];
    const clsA=m.hasA7?m.byCl.map(x=>x.c):[]; clsA.forEach(c=>ann.push('cls:'+c));
    const grpA=m.hasA7?m.top10.slice(0,5).map(g=>g.k):[]; grpA.forEach((g,i)=>ann.push('grp:'+i));
    const fiche=[], from={}; const addF=(code,src)=>{ if(code&&IDX[code]&&!fiche.includes(code)){ fiche.push(code); from[code]=src; } };
    if(main.includes('imptop')) m.impByCli.slice(0,12).forEach(x=>addF(x.code,'imptop'));
    if(main.includes('dec')) m.dec.slice(0,14).forEach(x=>addF(x.code,'dec'));
    if(main.includes('dou')) m.douTop.slice(0,10).forEach(x=>addF(x.code,'dou'));
    if(main.includes('deb')) m.debTop.slice(0,10).forEach(x=>addF(x.code,'deb'));
    fiche.forEach(c=>ann.push('cli:'+c));
    const plan=[...main,'end',...(ann.length?['annex',...ann]:[])];
    const NUM={}; plan.forEach((k,i)=>NUM[k]=i+1);
    const has=k=>NUM[k]!=null;
    const back={}; clsA.forEach(c=>back['cls:'+c]='npl'); grpA.forEach((g,i)=>back['grp:'+i]='conc'); fiche.forEach(c=>back['cli:'+c]=from[c]);
    const cliLink=code=>has('cli:'+code)?'cli:'+code:null;
    const navBar=(X,key)=>{ const i=NUM[key]; const y=7.225;
      if(has('agenda')&&key!=='agenda') X.btn(9.55,y,1.05,'⌂ Sommaire','agenda',{h:0.25,fs:8});
      if(i>1) X.btn(10.7,y,0.45,'◀','#'+(i-1),{h:0.25,fs:8});
      if(i<plan.length) X.btn(11.25,y,0.45,'▶','#'+(i+1),{h:0.25,fs:8}); };
    const band=(key,t,st)=>{ const s=pp.addSlide(); pptBand(pp,s,t,st,foot,NUM[key],badge); const X=pptCtx(pp,s); navBar(X,key);
      if(back[key]) X.btn(8.15,7.225,1.3,'↩ Retour','#'+NUM[back[key]],{h:0.25,fs:8,fill:'E6F2D0',line:'6BA23A'}); return X; };
    const BUILD={
      cover(){ const s=pp.addSlide(); s.background={color:PX.NV}; const X=pptCtx(pp,s);
        s.addShape(pp.ShapeType.ellipse,{x:8.6,y:-2.2,w:7,h:7,fill:{color:PX.LM,transparency:86},line:{color:PX.LM,transparency:100}});
        s.addShape(pp.ShapeType.ellipse,{x:10.4,y:3.6,w:4.6,h:4.6,fill:{color:'1A86B3',transparency:80},line:{color:'1A86B3',transparency:100}});
        if(badge) s.addImage({data:badge,x:0.7,y:0.7,w:3.1,h:1.13});
        s.addText('REVUE DU RISQUE DE CRÉDIT · '+segLbl().toUpperCase(),{x:0.7,y:2.15,w:10,h:0.4,fontSize:13,bold:true,color:PX.L2,charSpacing:4,fontFace:PF});
        s.addText([{text:'PDO ',options:{color:'FFFFFF'}},{text:'Monitor',options:{color:PX.L2}}],{x:0.7,y:2.55,w:10,h:1.1,fontSize:54,bold:true,fontFace:PF});
        s.addShape(pp.ShapeType.rect,{x:0.72,y:3.7,w:1.4,h:0.07,fill:{color:PX.LM}});
        s.addText('Arrêté au '+m.date+' · Comité des Risques',{x:0.7,y:3.9,w:11,h:0.5,fontSize:20,color:'D6E8F1',fontFace:PF});
        const h=[]; if(m.hasA7){ h.push(['Encours crédit',fMds(m.enc),'npl'],['Ratio NPL',fPct(m.npl),'npl']); } h.push(['Impayés',fMds(m.impT),'imp'],['Clients à déclasser',fInt(m.decN),'dec']);
        h.forEach((k,i)=>{ const x=0.7+i*3.05; s.addShape(pp.ShapeType.roundRect,{x,y:4.75,w:2.85,h:1.2,fill:{color:'FFFFFF',transparency:90},line:{color:'FFFFFF',transparency:75},rectRadius:0.12});
          s.addText(k[0].toUpperCase(),{x:x+0.2,y:4.85,w:2.5,h:0.3,fontSize:9,bold:true,color:'A9CDE0',fontFace:PF});
          s.addText(k[1],{x:x+0.2,y:5.15,w:2.6,h:0.6,fontSize:24,bold:true,color:i===1&&m.hasA7?PX.L2:'FFFFFF',fontFace:PF}); if(has(k[2])) X.link(x,4.75,2.85,1.2,k[2]); });
        if(has('agenda')) X.btn(0.7,6.35,2.4,'Commencer  ▶','agenda',{fill:PX.LM,line:PX.LM,color:'10300A',h:0.45,fs:12});
        s.addText('Ecobank Sénégal · Direction des Engagements · Source : '+D.file,{x:3.3,y:6.38,w:9.5,h:0.4,fontSize:10,color:'9FC3D8',fontFace:PF});
        X.notes('PDO Monitor, arrêté au '+m.date+'. '+LC.c.slice(0,2).join(' ')); },
      agenda(){ const X=band('agenda','Au programme','Cliquez une rubrique pour y aller — ⌂ Sommaire ramène ici depuis chaque diapositive');
        const items=main.filter(k=>!['cover','agenda'].includes(k)); const cols=3, w=3.95, h=0.78, gx=0.2, gy=0.16;
        items.forEach((k,i)=>{ const sd=SL.find(s=>s.id===k), x=0.5+(i%cols)*(w+gx), y=1.4+Math.floor(i/cols)*(h+gy), col=i%2?PX.GR:PX.BL;
          X.s.addShape(pp.ShapeType.roundRect,{x,y,w,h,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.1,shadow:{type:'outer',blur:3,offset:1.5,angle:90,color:'00415E',opacity:0.12}});
          X.s.addText(String(i+1).padStart(2,'0'),{x:x+0.12,y,w:0.75,h,fontSize:22,bold:true,color:col,fontFace:PF,valign:'middle'});
          X.s.addText([{text:sd.t,options:{bold:true,color:PX.NV,fontSize:13,breakLine:true}},{text:sd.k+'  ▸',options:{color:'6E8794',fontSize:9}}],{x:x+0.85,y,w:w-0.95,h,fontFace:PF,valign:'middle'});
          X.link(x,y,w,h,k); });
        if(ann.length) X.btn(0.5,6.6,3.2,'Annexes : détails & fiches clients  ▸','annex',{h:0.38}); },
      kpi(){ const X=band('kpi','Les indicateurs clés','Vue d’ensemble · '+segLbl());
        if(m.seg==='ALL'&&D.tiles.length){ const t=D.tiles.slice(0,12); for(let r=0;r<3;r++) pptKpis(pp,X.s,t.slice(r*4,r*4+4).map((x,i)=>[x.l,x.v,['00415E','005C83','1A86B3','6BA23A'][i]]),1.5+r*1.75); }
        else { pptKpis(pp,X.s,[['Encours crédit',fMds(m.enc),'00415E'],['Créances NP',fMds(m.np),'C0392B'],['Impayés',fMds(m.impT),'005C83'],['Solde débiteur',fMds(m.debT),'1A86B3']],1.6);
          pptKpis(pp,X.s,[['COD à déclasser',fMds(m.codT),'B67D1C'],['Clients à déclasser',fInt(m.decN),'E07B39'],['Provision BCEAO',fMds(m.decProv),'6BA23A'],['Complément douteux',fMds(m.douCompl),'C0392B']],3.4); }
        X.notes(LC.c.join('\n')); },
      npl(){ const X=band('npl','Ratio NPL & classification','Encours '+fMds(m.enc)+' · exclusions BCEAO symétriques (OA, LGMO, LTB, CC, CKU, LCU, segment 8110)');
        pptKpis(pp,X.s,[['Ratio NPL',fPct(m.npl),'C0392B'],['Encours',fMds(m.enc),'00415E'],['Créances NP',fMds(m.np),'C0392B'],['Provisions régl.',fMds(m.ploc),'6BA23A']],1.3);
        X.card(0.5,2.6,7.4,4.5,'Encours par classe','survolez les barres · cliquez une classe ci-dessous pour le détail');
        X.bar(0.6,3.05,7.2,3.45,m.byCl.map(x=>x.c),m.byCl.map(x=>x.amt),m.byCl.map(x=>clsCol(x.c)));
        m.byCl.forEach((x,i)=>X.btn(0.65+i*1.2,6.6,1.12,'Classe '+x.c+' ▸','cls:'+x.c,{h:0.32,fs:8.5,fill:hx(clsCol(x.c)),line:hx(clsCol(x.c)),color:'FFFFFF'}));
        X.card(8.1,2.6,4.73,4.5,'Stades IFRS9','part de l’encours');
        X.donut(8.2,3.05,4.55,3.9,m.bySt.map(x=>'Stade '+x.s),m.bySt.map(x=>x.amt),['4E8A2E','D4A13A','C0392B']);
        X.notes(noteFor(/ratio NPL/)); },
      seg(){ const X=band('seg','Lecture par segment','Corporate, Commercial, Consumer — encours, ratio NPL et impayés');
        pptTable(X.s,['Segment','Clients','Encours XOF','Créances NP','Ratio NPL','Impayés XOF','Lignes'],m.bySeg.map(x=>[x.s,fInt(x.ncli),fInt(x.enc),fInt(x.np),fPct(x.npl),fInt(x.imp),fInt(x.nimp)]),{right:[1,2,3,4,5,6],y:1.3,pills:(r,i)=>i===0?hx(SEG_COL[m.bySeg[r].s]):null});
        X.card(0.5,2.85,6.1,4.25,'Encours par segment','part de l’encours');
        X.donut(0.6,3.3,5.9,3.7,m.bySeg.map(x=>x.s),m.bySeg.map(x=>x.enc),m.bySeg.map(x=>SEG_COL[x.s]));
        X.card(6.75,2.85,6.08,4.25,'Ratio NPL par segment','% de l’encours');
        X.bar(6.85,3.3,5.9,3.7,m.bySeg.map(x=>x.s),m.bySeg.map(x=>x.npl/100),m.bySeg.map(x=>SEG_COL[x.s]),{raw:true,fmt:'0.00%',axis:'Ratio NPL',name:'Ratio NPL'}); },
      conc(){ const X=band('conc','Les 10 premières expositions','Par groupe (ou client hors groupe) · base crédit du ratio NPL'); const t1=m.groups[0];
        X.card(0.5,1.3,8.6,5.8,'Top 10 groupes','encours · survolez les barres');
        X.bar(0.6,1.75,8.4,5.25,m.top10.map(g=>g.k),m.top10.map(g=>g.amt),m.top10.map((g,i)=>i===0?'00415E':g.np>0?'C0392B':'1A86B3'),{h:true});
        [['Poids du top 10',fPct(m.top10Sh,1),fMds(sum(m.top10,g=>g.amt))+' sur '+fMds(m.enc),'00415E'],['1re exposition',fPct(m.enc?t1.amt/m.enc*100:0,1),cut(t1.k,40),'005C83']].forEach((k,i)=>pptKpiBox(pp,X.s,9.35,1.3+i*1.45,3.5,k));
        X.s.addText('CONTRATS DÉTAILLÉS',{x:9.35,y:4.25,w:3.5,h:0.3,fontSize:9,bold:true,color:PX.MU,fontFace:PF});
        grpA.forEach((g,i)=>X.btn(9.35,4.6+i*0.47,3.5,cut(g,30)+'  ▸','grp:'+i,{h:0.38,fs:9}));
        X.notes(noteFor(/premières expositions/)); },
      imp(){ const X=band('imp','Anatomie des impayés',plural(m.impN,'ligne')+' · '+plural(m.impCli,'client')+' · ancienneté max '+fInt(m.impMaxJ)+' j');
        pptKpis(pp,X.s,[['Total impayés',fMds(m.impT),'005C83'],['> 90 jours',fMds(m.imp90T),'C0392B'],['1er débiteur',fPct(m.impTop1Sh,1),'00415E'],['Lignes',fInt(m.impN),'6BA23A']],1.3);
        X.card(0.5,2.6,6.1,4.5,'Par ancienneté','montant'); X.bar(0.6,3.05,5.9,3.95,m.impAge.map(x=>x.l),m.impAge.map(x=>x.amt),m.impAge.map(x=>x.c));
        X.card(6.75,2.6,6.08,4.5,'Par classe','montant'); X.donut(6.85,3.05,5.9,3.95,m.impCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.impCl.map(x=>x.amt),m.impCl.map(x=>clsCol(x.c)));
        if(has('imptop')) X.btn(10.55,2.67,2.15,'Top 12 impayés  ▸','imptop',{h:0.3,fs:9});
        X.notes(noteFor(/impayés totalisent/)); },
      imptop(){ const X=band('imptop','Les 12 premiers impayés','Consolidés par client · cliquez une ligne pour ouvrir la fiche client'); const t=m.impByCli.slice(0,12);
        pptTableLinked(X,['#','Client','Segment','Lignes','Jours max','Classe','Montant XOF','Fiche'],t.map((x,i)=>[i+1,cut(x.client,40),x.seg,x.n,x.j,x.cl||'—',fInt(x.amt),'Voir ▸']),
          {right:[3,4,6],colW:[0.45,4.4,1.5,0.85,1.1,0.95,2.0,1.08],rowH:0.36,fs:10,pills:(r,i)=>i===5?hx(clsCol(t[r].cl)):i===7?'1A86B3':null,links:t.map(x=>cliLink(x.code))}); },
      cro(){ const X=band('cro','Croisement impayés / engagements','Chaque bulle est un client : engagements (échelle log.) × part en impayé · taille = montant impayé');
        const pts=m.cro.filter(r=>r.eng>0).sort((a,b)=>b.imp-a.imp).slice(0,400); const cls=[...new Set(pts.map(r=>r.cl||'—'))].sort((a,b)=>clsRank(a)-clsRank(b));
        const xs=pts.map(r=>Math.max(1e5,r.eng)/1e6);
        const data=[{name:'Engagements (M XOF)',values:xs},...cls.map(c=>({name:c+' · '+(CLS_LIB[c]||''),values:pts.map(r=>(r.cl||'—')===c?+Math.min(100,r.taux).toFixed(1):null),sizes:pts.map(r=>(r.cl||'—')===c?Math.max(0.05,r.imp/1e6):null)}))];
        X.card(0.5,1.3,9.0,5.8,'Carte des clients en impayé','400 plus gros impayés · survolez une bulle');
        X.s.addChart(pp.ChartType.bubble,data,{x:0.6,y:1.75,w:8.8,h:5.25,chartColors:cls.map(c=>hx(clsCol(c))),fontFace:PF,showLegend:true,legendPos:'t',legendFontSize:9,
          valAxisMinVal:0,valAxisMaxVal:110,valAxisLabelFormatCode:'0"%"',showValAxisTitle:true,valAxisTitle:'Part en impayé',valAxisTitleFontSize:9,showCatAxisTitle:true,catAxisTitle:'Engagements M XOF (log.)',catAxisTitleFontSize:9,
          catAxisLabelFormatCode:'#,##0',valGridLine:{color:'E3EDF2',size:0.75},catAxisLabelFontSize:9,valAxisLabelFontSize:9,dataLabelFontSize:8,showValue:false,objectName:'BUBBLE'});
        const hi=m.cro.filter(r=>r.taux>=50);
        [['Clients croisés',fInt(m.cro.length),'en impayé ce jour','005C83'],['Engagements concernés',fMds(sum(m.cro,r=>r.eng)),'impayés '+fMds(sum(m.cro,r=>r.imp)),'00415E'],['Impayé ≥ 50 % de l’engagement',fInt(hi.length),fMds(sum(hi,r=>r.imp))+' en jeu','C0392B']].forEach((k,i)=>pptKpiBox(pp,X.s,9.7,1.3+i*1.5,3.15,k)); },
      deb(){ const X=band('deb','Comptes débiteurs',plural(m.debN,'compte')+' · '+fMds(m.debT)+' de solde débiteur');
        pptKpis(pp,X.s,[['Solde débiteur',fMds(m.debT),'005C83'],['Sans limite',fMds(m.debNoLimT),'C0392B'],['Dépassements',fMds(m.debOverT),'B67D1C'],['Comptes NP',fMds(sum(m.debNP,r=>r.solde)),'7B1E16']],1.3);
        X.card(0.5,2.6,6.1,4.5,'Solde par ancienneté','survolez les barres'); X.bar(0.6,3.05,5.9,3.95,m.debAge.map(x=>x.l),m.debAge.map(x=>x.amt),m.debAge.map(x=>x.c));
        const t=m.debTop.slice(0,10); pptTableLinked(X,['Client','Solde XOF','Limite','Cl.'],t.map(x=>[cut(x.client,30),fInt(x.solde),x.lim?fInt(x.lim):'aucune',x.cl||'—']),
          {x:6.75,y:2.6,w:6.08,colW:[2.88,1.35,1.2,0.65],right:[1,2],fs:8.5,rowH:0.4,pills:(r,i)=>i===3?hx(clsCol(t[r].cl)):null,links:t.map(x=>cliLink(x.code))});
        X.notes(noteFor(/solde débiteur/)); },
      cod(){ const X=band('cod','COD à déclasser',plural(m.codN,'compte')+' · ancienneté moyenne '+fInt(m.codJ)+' jours');
        pptKpis(pp,X.s,[['Solde à déclasser',fMds(m.codT),'C0392B'],['Comptes',fInt(m.codN),'B67D1C'],['Ancienneté moy.',fInt(m.codJ)+' j','005C83'],['Gestionnaires',fInt(m.codByG.length),'6BA23A']],1.3);
        X.card(0.5,2.6,5.4,4.5,'Par classe','nombre de comptes'); X.donut(0.6,3.05,5.2,3.95,m.codCl.map(x=>x.c+' · '+CLS_LIB[x.c]),m.codCl.map(x=>x.n),m.codCl.map(x=>clsCol(x.c)));
        const t=m.codByG.slice(0,10); X.card(6.05,2.6,6.78,4.5,'Par gestionnaire','top 10 · nombre de comptes');
        X.bar(6.15,3.05,6.58,3.95,t.map(x=>x.g),t.map(x=>x.n),'005C83',{h:true,raw:true,name:'Comptes'}); },
      dec(){ const X=band('dec','Clients à déclasser',plural(m.decN,'client')+' · exposition nette '+fMds(m.decExpo)+' · provision BCEAO '+fMds(m.decProv)+' · cliquez une ligne'); const t=m.dec.slice(0,14);
        pptTableLinked(X,['Client','Motif','Jours','Classe','Taux','Expo nette','Provision'],t.map(x=>[cut(x.client,32),cut(x.motif,52),x.j,x.cl,fTaux(x.taux),fInt(x.expo),fInt(x.prov)]),
          {colW:[3.2,4.3,0.7,0.8,0.8,1.3,1.23],right:[2,4,5,6],fs:8.5,rowH:0.34,pills:(r,i)=>i===3?hx(clsCol(t[r].cl)):null,links:t.map(x=>cliLink(x.code))});
        X.s.addText('Provision BCEAO requise : '+fInt(m.decProv)+' XOF  ·  exposition nette '+fInt(m.decExpo)+' XOF'+(m.decN>t.length?'  ·  '+(m.decN-t.length)+' autres clients dans l’application':''),{x:0.5,y:6.55,w:12.3,h:0.4,fontSize:12,bold:true,color:PX.NV,fontFace:PF});
        X.notes(noteFor(/à déclasser/)); },
      dou(){ const X=band('dou','Douteux 292 — besoin de provision',plural(m.douN,'dossier')+' · encours '+fMds(m.douEnc)+' · couverture '+fPct(m.douCov,1));
        pptKpis(pp,X.s,[['Encours douteux',fMds(m.douEnc),'00415E'],['Provision locale',fMds(m.douPloc),'6BA23A'],['Gar. hypo.',fMds(m.douHyp),'1A86B3'],['Complément',fMds(m.douCompl),'C0392B']],1.3);
        X.card(0.5,2.6,6.1,4.5,'De l’encours au besoin','survolez les barres'); X.bar(0.6,3.05,5.9,3.95,['Encours','Provision requise','Provision locale','Complément'],[m.douEnc,m.douReq,m.douPloc,m.douCompl],['00415E','1A86B3','6BA23A','C0392B']);
        const t=m.douTop.slice(0,10); pptTableLinked(X,['Client','Encours','Complément'],t.map(x=>[cut(x.client,32),fInt(x.enc),fInt(x.compl)]),{x:6.75,y:2.6,w:6.08,colW:[3.08,1.5,1.5],right:[1,2],fs:8.5,rowH:0.4,links:t.map(x=>cliLink(x.code))});
        X.notes(noteFor(/douteux 292/)); },
      gest(){ const X=band('gest','Mobilisation des gestionnaires','Top 12 des portefeuilles par montant impayé'); const t=m.impByG.slice(0,12);
        X.card(0.5,1.3,8.0,5.8,'Impayés par gestionnaire','survolez les barres'); X.bar(0.6,1.75,7.8,5.25,t.map(x=>x.g),t.map(x=>x.amt),t.map(x=>x.n90?'C0392B':'005C83'),{h:true});
        pptTable(X.s,['Gestionnaire','Lignes','> 90 j'],t.map(x=>[cut(x.g,28),x.n,x.n90]),{x:8.7,y:1.3,w:4.13,colW:[2.43,0.85,0.85],right:[1,2],fs:8.5,rowH:0.4}); },
      read(){ const X=band('read','Constats & actions proposées','Lecture rédigée à partir des chiffres du fichier'), tx=h=>h.replace(/<[^>]+>/g,''), s=X.s;
        s.addText(LC.c.map(t=>({text:tx(t),options:{bullet:{code:'25A0'},breakLine:true}})),{x:0.5,y:1.35,w:7.2,h:5.7,fontSize:13,color:PX.INK,fontFace:PF,paraSpaceAfter:8,valign:'top'});
        s.addShape(pp.ShapeType.roundRect,{x:7.95,y:1.35,w:4.9,h:5.7,fill:{color:'F3F9EC'},line:{color:'CFE0E7'},rectRadius:0.12});
        s.addText('Actions proposées',{x:8.15,y:1.45,w:4.5,h:0.45,fontSize:16,bold:true,color:PX.NV,fontFace:PF});
        s.addText(LC.a.map(t=>({text:tx(t),options:{bullet:{code:'2713'},breakLine:true}})),{x:8.15,y:1.95,w:4.5,h:5.0,fontSize:12,color:PX.INK,fontFace:PF,paraSpaceAfter:8,valign:'top'});
        X.notes(LC.a.join('\n')); },
      end(){ const s=pp.addSlide(); s.background={color:PX.NV}; const X=pptCtx(pp,s); if(badge) s.addImage({data:badge,x:5.1,y:2.0,w:3.1,h:1.13});
        s.addText('Merci',{x:0,y:3.4,w:13.33,h:0.8,fontSize:40,bold:true,color:'FFFFFF',align:'center',fontFace:PF});
        s.addText('Questions & échanges · PDO Monitor · arrêté au '+m.date,{x:0,y:4.25,w:13.33,h:0.5,fontSize:15,color:'CFE0EE',align:'center',fontFace:PF});
        if(has('agenda')) X.btn(4.6,5.3,1.9,'⌂ Sommaire','agenda',{h:0.42,fs:11});
        if(ann.length) X.btn(6.8,5.3,1.9,'Annexes ▸','annex',{h:0.42,fs:11,fill:PX.LM,line:PX.LM,color:'10300A'}); },
      annex(){ const X=band('annex','Annexes','Détails par classe, par groupe et fiches clients — cliquez pour ouvrir'), s=X.s, R=17;
        const col=(x,title,items)=>{ if(!items.length) return; s.addText(title,{x,y:1.25,w:3,h:0.35,fontSize:11,bold:true,color:PX.NV,fontFace:PF});
          items.slice(0,R).forEach((it,i)=>X.btn(x,1.65+i*0.315,2.95,cut(it[0],30)+'  ▸',it[1],{h:0.27,fs:8})); };
        col(0.5,'Détail par classe & groupe',clsA.map(c=>['Classe '+c+' · '+CLS_LIB[c],'cls:'+c]).concat(grpA.map((g,i)=>['Groupe '+g,'grp:'+i])));
        const F=fiche.map(c=>[IDX[c].name,'cli:'+c]);
        [0,1,2].forEach(k=>col(3.6+k*3.1,k?'Fiches clients (suite)':'Fiches clients',F.slice(k*R,(k+1)*R))); }
    };
    const contractSlide=(key,title,sub,rs)=>{ const X=band(key,title,sub); rs=[...rs].sort((a,b)=>b.ot-a.ot); const t=rs.slice(0,15);
      pptTableLinked(X,['Client','Contrat','Produit','Segment','Gestionnaire','Cl.','P/NP','Encours XOF'],t.map(r=>[cut(r.client,30),r.ref,r.prod,r.bseg,cut(r.off,22),r.cl||'—',r.stat,fInt(r.ot)]),
        {colW:[3.0,1.9,0.8,1.3,2.2,0.6,0.6,1.93],right:[7],fs:8.5,rowH:0.33,pills:(r,i)=>i===5?hx(clsCol(t[r].cl)):null,links:t.map(r=>cliLink(r.code))});
      X.s.addText(plural(rs.length,'contrat')+' · total '+fInt(sum(rs,r=>r.ot))+' XOF'+(rs.length>15?' · 15 plus gros affichés':''),{x:0.5,y:6.75,w:7.5,h:0.35,fontSize:11,bold:true,color:PX.NV,fontFace:PF}); };
    const ficheSlide=code=>{ const o=IDX[code], key='cli:'+code, a7=o.A7, np=sum(a7.filter(r=>r.stat==='NP'),r=>r.ot);
      const worst=[...a7,...o.IMP,...o.DEB].reduce((w,r)=>clsRank(r.cl)>clsRank(w)?r.cl:w,'');
      const X=band(key,'Fiche client · '+cut(o.name,40),'Code '+o.code+' · '+(o.seg||'—')+' · '+(o.g||'—')+(a7[0]&&a7[0].grp?' · Groupe '+cut(a7[0].grp,30):''));
      pptKpis(pp,X.s,[['Engagements',fSmart(sum(a7,r=>r.ot)),'00415E'],['Impayés',o.IMP.length?fSmart(sum(o.IMP,r=>r.m))+' · '+plural(o.IMP.length,'ligne'):'Aucun','005C83'],['Créances NP',fSmart(np),'C0392B'],['Classe la plus dégradée',worst?worst+' · '+(CLS_LIB[worst]||''):'—',hx(clsCol(worst))]],1.3);
      let y=2.65; const s=X.s;
      const txt=[]; o.DEC.forEach(r=>txt.push('Déclassement proposé : '+r.motif+' · classe '+r.cl+' · taux '+fTaux(r.taux)+' · provision '+fInt(r.prov)+' XOF'));
      o.DOU.forEach(r=>txt.push('Douteux 292 : encours '+fInt(r.enc)+' · provision locale '+fInt(r.ploc)+' · complément à doter '+fInt(r.compl)+' XOF'));
      if(txt.length){ s.addShape(pp.ShapeType.roundRect,{x:0.5,y,w:12.33,h:0.3+0.28*txt.length,fill:{color:'FDF1EE'},line:{color:'E8B4AA'},rectRadius:0.08});
        s.addText(txt.map(t=>({text:t,options:{bullet:true,breakLine:true}})),{x:0.6,y,w:12.1,h:0.3+0.28*txt.length,fontSize:10,color:'7B1E16',bold:true,fontFace:PF,valign:'middle'}); y+=0.45+0.28*txt.length; }
      const imp=[...o.IMP].sort((a,b)=>b.m-a.m).slice(0,8), ctr=[...a7].sort((a,b)=>b.ot-a.ot).slice(0,8);
      s.addText('IMPAYÉS',{x:0.5,y,w:6,h:0.3,fontSize:10,bold:true,color:PX.NV,fontFace:PF}); s.addText('CONTRATS ACTE 7',{x:6.75,y,w:6,h:0.3,fontSize:10,bold:true,color:PX.NV,fontFace:PF}); y+=0.32;
      if(imp.length) pptTable(s,['Référence','Produit','Jours','Cl.','Montant'],imp.map(r=>[cut(r.ref,18),r.prod,r.j,r.cl||'—',fInt(r.m)]),{x:0.5,y,w:6.1,colW:[2.0,0.8,0.8,0.7,1.8],right:[2,4],fs:8.5,rowH:0.3,pills:(r,i)=>i===3?hx(clsCol(imp[r].cl)):null});
      else s.addText('Aucun impayé',{x:0.5,y,w:6,h:0.3,fontSize:10,italic:true,color:'6E8794',fontFace:PF});
      if(ctr.length) pptTable(s,['Contrat','Produit','Cl.','P/NP','Encours'],ctr.map(r=>[cut(r.ref,18),r.prod,r.cl||'—',r.stat,fInt(r.ot)]),{x:6.75,y,w:6.08,colW:[2.0,0.8,0.7,0.7,1.88],right:[4],fs:8.5,rowH:0.3,pills:(r,i)=>i===2?hx(clsCol(ctr[r].cl)):null});
      else s.addText('Aucun contrat ACTE 7',{x:6.75,y,w:6,h:0.3,fontSize:10,italic:true,color:'6E8794',fontFace:PF}); };
    /* 2. construction dans l'ordre du plan */
    const base=baseA7();
    for(const k of plan){
      if(BUILD[k]) BUILD[k]();
      else if(k.startsWith('cls:')){ const c=k.slice(4); contractSlide(k,'Détail · classe '+c+' — '+CLS_LIB[c],'Contrats de la classe '+c+' · base NPL · cliquez une ligne pour la fiche client',base.filter(r=>r.cl===c)); }
      else if(k.startsWith('grp:')){ const g=grpA[+k.slice(4)]; contractSlide(k,'Détail · '+cut(g,45),'Contrats du groupe · cliquez une ligne pour la fiche client',base.filter(r=>(r.grp||r.client||r.code)===g)); }
      else if(k.startsWith('cli:')) ficheSlide(k.slice(4));
    }
    /* 3. post-traitement : liens, transitions, animations, axe log. */
    busy(true,'Ajout des liens et animations…',plan.length+' diapositives'); await tick();
    const buf=await pp.write({outputType:'arraybuffer'});
    const z=await JSZip.loadAsync(buf);
    for(let i=1;i<=plan.length;i++){
      const sp='ppt/slides/slide'+i+'.xml', rp='ppt/slides/_rels/slide'+i+'.xml.rels'; let x=await z.file(sp).async('string'), r=await z.file(rp).async('string');
      const rels={}; let rn=0;
      x=x.replace(/<p:cNvPr id="(\d+)" name="LNK\|([^"]*)"([^>]*?)(\/?)>/g,(all,id,key,rest,sc)=>{ const n=key.startsWith('#')?+key.slice(1):NUM[key]; if(!n) return all;
        const rid=rels[n]||(rels[n]='rIdLk'+(++rn)); const h=`<a:hlinkClick r:id="${rid}" action="ppaction://hlinksldjump"/>`;
        return `<p:cNvPr id="${id}" name="Lien ${esc(key)}"${rest}>`+h+(sc?'</p:cNvPr>':''); });
      const add=Object.entries(rels).map(([n,rid])=>`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${n}.xml"/>`).join('');
      if(add) r=r.replace('</Relationships>',add+'</Relationships>');
      const key=plan[i-1], tr=key==='cover'||key==='end'?'<p:fade/>':key.startsWith('cli:')||key.startsWith('cls:')||key.startsWith('grp:')?'<p:zoom/>':'<p:push dir="u"/>';
      const tim=pptTiming(x,key==='cover'||key==='end');
      x=x.replace(/<\/p:clrMapOvr>/,'</p:clrMapOvr><p:transition spd="med">'+tr+'</p:transition>'+tim);
      z.file(sp,x); z.file(rp,r); }
    for(const f of Object.keys(z.files).filter(f=>/^ppt\/charts\/chart\d+\.xml$/.test(f))){ let x=await z.file(f).async('string');
      if(x.includes('<c:bubbleChart>')||x.includes('<c:bubbleChart ')){ x=x.replace(/<c:pt idx="\d+"><c:v><\/c:v><\/c:pt>/g,'');
        x=x.replace(/<c:valAx>([\s\S]*?)<\/c:valAx>/,(all,inner)=>inner.includes('<c:axPos val="b"/>')?'<c:valAx>'+inner.replace('<c:scaling>','<c:scaling><c:logBase val="10"/>').replace(/<c:numFmt formatCode="[^"]*"/,'<c:numFmt formatCode="#,##0"')+'</c:valAx>':all);
        z.file(f,x); } }
    const blob=await z.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});
    dl(blob,'ECOBANK_PDO_Slides_'+(m.date||'').split('/').reverse().join('-')+(SEG!=='ALL'?'_'+SEG:'')+'.pptx');
    toast('✅ PowerPoint interactif exporté — '+plan.length+' diapositives (lancez le diaporama : F5)'); }
  catch(e){ console.error(e); toast('⚠️ Export PowerPoint impossible : '+e.message); }
  busy(false); }

/* animations d'entrée : cascade fondu (formes) et balayage vers le haut (graphiques), démarrage automatique */
function pptTiming(x,dark){
  const EMU=914400, items=[];
  const re=/<(p:sp|p:pic|p:graphicFrame)>([\s\S]*?)<\/\1>/g; let mm;
  while((mm=re.exec(x))){ const tag=mm[1], body=mm[2]; const id=(body.match(/<p:cNvPr id="(\d+)" name="([^"]*)"/)||[]); if(!id[1]) continue;
    if(/^Lien /.test(id[2])) continue;
    const off=body.match(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/); const y=off?+off[2]/EMU:0, xx=off?+off[1]/EMU:0;
    if(!dark&&(y<1.07||y>=7.15)) continue; if(dark&&(y<0||xx>8)) continue;
    const chart=tag==='p:graphicFrame'&&body.includes('/chart'); const txt=tag==='p:sp'&&body.includes('<p:txBody>');
    items.push({id:id[1],y,x:xx,chart,txt}); }
  if(!items.length) return '';
  items.sort((a,b)=>Math.round(a.y*4)-Math.round(b.y*4)||a.x-b.x);
  let n=3; const eff=items.map((it,i)=>{ const d=Math.min(i,40)*70; const a=++n,b=++n,c=++n;
    const set=`<p:set><p:cBhvr><p:cTn id="${b}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${it.id}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
    const fx=it.chart?`<p:animEffect transition="in" filter="wipe(up)"><p:cBhvr><p:cTn id="${c}" dur="700"/><p:tgtEl><p:spTgt spid="${it.id}"/></p:tgtEl></p:cBhvr></p:animEffect>`
                     :`<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${c}" dur="450"/><p:tgtEl><p:spTgt spid="${it.id}"/></p:tgtEl></p:cBhvr></p:animEffect>`;
    return `<p:par><p:cTn id="${a}" presetID="${it.chart?22:10}" presetClass="entr" presetSubtype="${it.chart?4:0}" fill="hold" grpId="0" nodeType="withEffect"><p:stCondLst><p:cond delay="${d}"/></p:stCondLst><p:childTnLst>${set}${fx}</p:childTnLst></p:cTn></p:par>`; }).join('');
  const bld=items.map(it=>it.chart?`<p:bldGraphic spid="${it.id}" grpId="0"><p:bldAsOne/></p:bldGraphic>`:it.txt?`<p:bldP spid="${it.id}" grpId="0" animBg="1"/>`:'').join('');
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>`+
    `<p:par><p:cTn id="3" fill="hold"><p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst><p:childTnLst>`+
    `<p:par><p:cTn id="${++n}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${eff}</p:childTnLst></p:cTn></p:par>`+
    `</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>`+
    (bld?`<p:bldLst>${bld}</p:bldLst>`:'')+`</p:timing>`;
}

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

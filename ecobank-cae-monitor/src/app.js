/* ============================================================================
   CRÉANCES À ÉCHOIR — moteur applicatif v3 « BLUE ECOBANK »
   Direction des Engagements · Ecobank Sénégal · niveau COMEX
   100 % offline. Jointure PORTFOLIO + détection Crédits Personnel (Staff Loan).
   Exports Excel / PDF / PowerPoint : logo partout, graphiques 3D avant en-têtes.
   ========================================================================== */
(function(){
"use strict";

/* ---------- Charte ---------- */
const COL = { navy:'#00415E', navy2:'#00344B', blue:'#005C83', sky:'#1A86B3', lime:'#8CC63F', lime2:'#A6D867',
  green:'#6BA23A', green2:'#4E8A2E', amber:'#D4A13A', risk:'#C0392B', ink:'#12333F', ink2:'#3E5C6B', ink3:'#7A93A0',
  inflow:'#6BA23A', outflow:'#D4A13A', signa:'#005C83', surete:'#00415E',
  s1:'#6BA23A', s2:'#D4A13A', s3:'#C0392B',
  cats:['#00415E','#005C83','#8CC63F','#1A86B3','#D4A13A','#6BA23A','#4FA3C7','#A6D867','#3E5C6B','#B67D1C','#2B7A9E','#7FB547'] };
const NATURE_LABEL = { EMPLOI:'Emplois (entrée trésorerie)', RESSOURCE:'Ressources (sortie / refinancement)', ENGAGEMENT:'Engagements par signature (hors-bilan)', SURETE:'Sûretés (hypothèques / nantissements)' };
const NATURE_SHORT = { EMPLOI:'Emplois', RESSOURCE:'Ressources', ENGAGEMENT:'Engagements', SURETE:'Sûretés' };
const NATURE_COL = { EMPLOI:COL.inflow, RESSOURCE:COL.outflow, ENGAGEMENT:COL.signa, SURETE:COL.surete };
const NAT_KEYS = ['EMPLOI','RESSOURCE','ENGAGEMENT'];
// Taxonomie ETAT DES LC (produit -> nature/catégorie)
const LC_PRODUCT_META = {
  aval:['ENGAGEMENT','AVAL DE TRAITE'], IPLC:['ENGAGEMENT','LC IMPORT'], EPLC:['ENGAGEMENT','LC EXPORT'],
  CASO:['ENGAGEMENT','CAUTION DE SOUMISSION'], CAAD:['ENGAGEMENT',"CAUTION D'AVANCE DE DÉMARRAGE"],
  CABE:['ENGAGEMENT','CAUTION DE BONNE EXÉCUTION'], CADO:['ENGAGEMENT','CAUTION EN DOUANE'],
  CARG:['ENGAGEMENT','CAUTION DE RETENUE DE GARANTIE'], BAGA:['ENGAGEMENT','GARANTIE BANCAIRE ÉMISE'],
  BAFI:['ENGAGEMENT','GARANTIE INTERBANCAIRE'], AUCU:['ENGAGEMENT','AUTRES CAUTIONS'],
  IRUD:['ENGAGEMENT','CAUTION IRU / BOURSE'],
  HYP1:['SURETE','HYPOTHÈQUE 1ER RANG'], HYP2:['SURETE','HYPOTHÈQUE 2E RANG'],
  HYP3:['SURETE','HYPOTHÈQUE 3E RANG'], HYP6:['SURETE','NANTISSEMENT DE STOCK'] };
const CAT_NATURE = {};
['ESCOMPTE','CREDIT COURT TERME','CREDIT MOYEN TERME'].forEach(c=>CAT_NATURE[c]='EMPLOI');
['DAT','CASH COLLATERAL'].forEach(c=>CAT_NATURE[c]='RESSOURCE');
Object.values(LC_PRODUCT_META).forEach(([nat,cat])=>CAT_NATURE[cat]=nat);
const CAT_ORDER=['ESCOMPTE','CREDIT COURT TERME','CREDIT MOYEN TERME','LC IMPORT','LC EXPORT','AVAL DE TRAITE','CAUTION DE SOUMISSION',"CAUTION D'AVANCE DE DÉMARRAGE",'CAUTION DE BONNE EXÉCUTION','CAUTION EN DOUANE','CAUTION DE RETENUE DE GARANTIE','GARANTIE BANCAIRE ÉMISE','GARANTIE INTERBANCAIRE','AUTRES CAUTIONS','CAUTION IRU / BOURSE','AUTRE ENGAGEMENT','DAT','CASH COLLATERAL'];
const AGENCES={L01:'AGP',L02:'TILENE',L03:'LAMINE GUEYE',L04:'BOURGUIBA',L05:'THIAROYE',L06:'TOUBA SIEGE',L07:'GOUYE MBIND',L08:'PARCELLES',
  L09:'VDN',L10:'HLM',L11:'KAOLACK',L12:'PIKINE',L13:'MEDINA',L14:'CASTORS',L15:'POINT E',L16:'ALMADIES',L17:'FAIDHERBE',L18:'MARISTES',
  L19:'THIES',L20:'ST LOUIS SIEGE',L21:'NDAR TOUTE',L22:'OUAKAM',L23:'MBOUR',L24:'GOLF',L25:'LOUGA',L26:'YOFF',L27:'YEUMBEUL',L28:'KEUR MASSAR',
  L29:'ZIGUINCHOR',L30:'KOLDA',L31:'TAMBA',L32:'KEDOUGOU',L33:'DIOURBEL',L34:'ROUME',L37:'SEA PLAZA',L38:'SATREC',L39:'ZONE INDUSTRIELLE',L40:'TOUBA SANDAGA'};
const agNom=c=>AGENCES[String(c||'').trim().toUpperCase()]||'';
const agL=c=>{ const n=agNom(c); return n?`${c} · ${n}`:(c||'N/D'); };
function enrich(D){ ['CAE1','CAE2'].forEach(k=>(D[k]||[]).forEach(r=>{ r.agenceNom=agNom(r.agence); })); return D; }
const CLS_ORDER=['I','IA','IIA','IIN','III','IV','V'];
const CLS_LABEL={I:'I — Normal',IA:'IA — Sous surveillance',IIA:'IIA — Watch-list',IIN:'IIN — Substandard',III:'III — Douteux',IV:'IV — Compromis',V:'V — Pertes'};
const clsColor=k=>['I','IA'].includes(k)?COL.s1:k==='IIA'?COL.s2:COL.s3;

/* ---------- Données (embarquées ou chargées) ---------- */
let DATA = enrich(window.__CAE__ || {CAE1:[],CAE2:[],meta:{}});
let PF = window.__PF__ || {};
let META = DATA.meta || {};
let ARRETE = META.arrete || PF.reportingDate || 'N/D';
const PERIOD_LABEL = { CAE1: META.cae1Label || 'Mois en cours', CAE2: META.cae2Label || 'Mois prochain',
  BOTH: (META.cae1Label||'M') + ' + ' + (META.cae2Label||'M+1') };
const hasData=()=>!!(DATA && ((DATA.CAE1||[]).length || (DATA.CAE2||[]).length));

/* ---------- État ---------- */
const state = { period:'CAE1', view:'synthese',
  f:{ nature:'', categorie:'', segment:'', agence:'', search:'', staffOnly:false },
  fonds_propres: 120000000000, ponderation: 75 };
const charts = {};

/* ---------- Format ---------- */
const $ = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>Array.from(r.querySelectorAll(s));
const nf = new Intl.NumberFormat('fr-FR');
const esc = s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function fXOF(v){ if(v==null||isNaN(v)) return '—'; return nf.format(Math.round(v))+' F'; }
function fSp(v){ v=Math.round(Number(v)||0); return (v<0?'-':'')+String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g,' '); }
function fMd(v){ if(v==null||isNaN(v)) return '—'; const a=Math.abs(v);
  if(a>=1e9) return (v/1e9).toFixed(2).replace('.',',')+' Mds';
  if(a>=1e6) return (v/1e6).toFixed(1).replace('.',',')+' M';
  if(a>=1e3) return (v/1e3).toFixed(0)+' k';
  return nf.format(v); }
function fPct(v,d=1){ if(v==null||isNaN(v)||!isFinite(v)) return 'N/D'; return v.toFixed(d).replace('.',',')+' %'; }
function pdate(s){ if(!s) return null; const m=String(s).split('/'); if(m.length!==3) return null; return new Date(+m[2],+m[1]-1,+m[0]); }
const dShort=d=>d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'});
const today=()=>{ const d=new Date(); return ('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear(); };
const short=(s,n)=>{ s=String(s==null?'':s); return s.length>n?s.slice(0,n-1)+'…':s; };
function toast(msg){ const t=$('#toast'); t.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6 9 17l-5-5"/></svg><span></span>'; t.lastChild.textContent=msg; t.classList.add('show'); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove('show'),3600); }
window.toast = toast;
window.KIT = { org:'ECOBANK SÉNÉGAL', unit:'Direction des Engagements', app:'Créances à Échoir', footer:'ECOBANK SÉNÉGAL · Créances à échoir · INTERNAL USE ONLY', docTitle:'Créances à échoir', docSubject:'Tableau de bord COMEX', keywords:'Ecobank; créances; échéancier' };
async function busy(msg, fn){ const b=$('#busy'); $('#busyMsg').textContent=msg; b.hidden=false; await new Promise(r=>setTimeout(r,40));
  try{ return await fn(); } finally { b.hidden=true; } }

/* ---------- Sélection ---------- */
function fApply(arr){ const f=state.f, q=(f.search||'').toLowerCase();
  return (arr||[]).filter(r=>{
    if(f.nature && r.nature!==f.nature) return false;
    if(f.categorie && r.categorie!==f.categorie) return false;
    if(f.segment && r.segment!==f.segment) return false;
    if(f.agence && r.agence!==f.agence) return false;
    if(f.staffOnly && !r.isStaffLoan) return false;
    if(q){ const hay=(r.client+' '+r.ref+' '+(r.codeClient||'')+' '+(r.gestionnaire||'')+' '+(r.agenceNom||'')).toLowerCase(); if(!hay.includes(q)) return false; }
    return true; }); }
function rawRows(){ if(state.period==='BOTH') return (DATA.CAE1||[]).concat(DATA.CAE2||[]); return DATA[state.period]||[]; }
const rows=()=>fApply(rawRows());
function scopeLabel(){ const f=state.f, p=[];
  if(f.nature) p.push('Nature : '+(NATURE_SHORT[f.nature]||f.nature)); if(f.categorie) p.push('Catégorie : '+f.categorie);
  if(f.segment) p.push('Segment : '+f.segment); if(f.agence) p.push('Agence : '+agL(f.agence));
  if(f.staffOnly) p.push('Staff Loan uniquement'); if(f.search) p.push('Recherche : « '+f.search+' »');
  return p.length?'Périmètre filtré — '+p.join(' · '):'Périmètre complet (aucun filtre)'; }
const sum=(arr,key)=>arr.reduce((s,r)=>s+(r[key]||0),0);
function groupSum(arr,key,val='montantXOF'){ const m={}; arr.forEach(r=>{const k=r[key]||'N/D'; m[k]=(m[k]||0)+(r[val]||0);}); return m; }
function groupCount(arr,key){ const m={}; arr.forEach(r=>{const k=r[key]||'N/D'; m[k]=(m[k]||0)+1;}); return m; }
const uniqClients=R=>new Set(R.map(r=>r.codeClient).filter(Boolean)).size;
function byClient(R){ const m={}; R.forEach(r=>{ const k=r.codeClient||r.client||'N/D'; if(!m[k]) m[k]={id:k,nm:r.client||k,v:0,n:0,seg:r.segment}; m[k].v+=(r.montantXOF||0); m[k].n++; });
  return Object.values(m).sort((a,b)=>b.v-a.v); }
function weekBuckets(R){ const b={};
  R.forEach(r=>{ const d=pdate(r.dateEcheance); if(!d) return; const mo=new Date(d); mo.setDate(d.getDate()-((d.getDay()+6)%7));
    const k=mo.toISOString().slice(0,10); if(!b[k]) b[k]={start:new Date(mo),EMPLOI:0,RESSOURCE:0,ENGAGEMENT:0,SURETE:0,n:0};
    b[k][r.nature]=(b[k][r.nature]||0)+(r.montantXOF||0); b[k].n++; });
  return Object.values(b).sort((a,b)=>a.start-b.start); }
const wkTot=w=>w.EMPLOI+w.RESSOURCE+w.ENGAGEMENT;
const catSort=(a,b)=>{ const ia=CAT_ORDER.indexOf(a), ib=CAT_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); };

/* ---------- Agrégats communs (UI + exports) ---------- */
function analyse(R){
  const tot=sum(R,'montantXOF'), byNat=groupSum(R,'nature'), cnt=groupCount(R,'nature');
  const cl=byClient(R), wk=weekBuckets(R);
  const peak=wk.reduce((p,w)=>(!p||wkTot(w)>wkTot(p))?w:p,null);
  const top5=cl.slice(0,5).reduce((s,e)=>s+e.v,0), top10=cl.slice(0,10).reduce((s,e)=>s+e.v,0);
  const hhi=tot?cl.reduce((s,e)=>s+Math.pow(100*e.v/tot,2),0):0;
  const staff=R.filter(r=>r.isStaffLoan), matched=R.filter(r=>r.pfMatched);
  const np=matched.filter(r=>String(r.status||'').toUpperCase()==='NP');
  const gr=cl.filter(e=>e.v>0.25*state.fonds_propres);
  return {R,tot,byNat,cnt,cl,wk,peak,top5,top10,hhi,staff,matched,np,gr,
    emp:byNat.EMPLOI||0,res:byNat.RESSOURCE||0,eng:byNat.ENGAGEMENT||0,net:(byNat.EMPLOI||0)-(byNat.RESSOURCE||0)};
}
function insights(A){
  const c=[], v=[], r=[]; if(!A.R.length) return {c:['Aucun contrat sur le périmètre retenu.'],v:[],r:[]};
  c.push(`${nf.format(A.R.length)} contrats arrivent à terme pour ${fSp(A.tot)} XOF, dont ${fPct(100*A.emp/A.tot,0)} d'emplois (${fMd(A.emp)}).`);
  if(A.peak) c.push(`Pic d'échéances la semaine du ${dShort(A.peak.start)} : ${fMd(wkTot(A.peak))}, soit ${fPct(100*wkTot(A.peak)/A.tot,0)} du total.`);
  if(A.cl[0]) c.push(`Première contrepartie : ${A.cl[0].nm} avec ${fMd(A.cl[0].v)} (${fPct(100*A.cl[0].v/A.tot,1)} du total).`);
  v.push(`Concentration : les 5 premières contreparties portent ${fPct(100*A.top5/A.tot,0)} des montants (HHI ${nf.format(Math.round(A.hhi))}).`);
  if(A.res) v.push(`${fMd(A.res)} de ressources (DAT, cash collateral) arrivent à échéance : risque de refinancement à anticiper.`);
  if(A.np.length) v.push(`${A.np.length} contrat(s) non performant(s) à échoir pour ${fMd(sum(A.np,'montantXOF'))}.`);
  if(A.gr.length) v.push(`${A.gr.length} contrepartie(s) au-delà de 25 % des fonds propres retenus.`);
  r.push(A.peak?`Préparer le recouvrement et les renouvellements de la semaine du ${dShort(A.peak.start)}.`:'Suivre les échéances au fil de l\'eau.');
  if(A.res) r.push('Engager tôt les discussions de renouvellement avec les principaux déposants à terme.');
  if(A.staff.length) r.push(`Vérifier le traitement des ${A.staff.length} contrat(s) du Personnel (${fMd(sum(A.staff,'montantXOF'))}).`);
  return {c,v,r};
}

/* ---------- Chart.js : thème Ecobank ---------- */
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const gridColor=()=>css('--line-2'), tickColor=()=>css('--ink-3');
function shade(hex,f){ return (typeof g3Shade==='function')?g3Shade(hex,f):hex; }
function grad(colors,horizontal){ return c=>{ const ch=c.chart, a=ch.chartArea; const col=Array.isArray(colors)?colors[c.dataIndex%colors.length]:colors;
  if(!a) return col; const g=horizontal?ch.ctx.createLinearGradient(a.left,0,a.right,0):ch.ctx.createLinearGradient(0,a.bottom,0,a.top);
  g.addColorStop(0,shade(col,-0.08)); g.addColorStop(1,shade(col,0.28)); return g; }; }
function mkChart(id,cfg){ const el=document.getElementById(id); if(!el) return;
  if(charts[id]) charts[id].destroy();
  Chart.defaults.font.family='"Segoe UI",-apple-system,Roboto,sans-serif'; Chart.defaults.color=tickColor();
  charts[id]=new Chart(el.getContext('2d'),cfg); return charts[id]; }
function baseScales(o={}){ const g=gridColor(), t=tickColor();
  return { x:{grid:{color:g,drawBorder:false},ticks:{color:t,font:{size:11}},...(o.x||{})},
           y:{grid:{color:g,drawBorder:false},ticks:Object.assign({color:t,font:{size:11}},o.money?{callback:v=>fMd(v)}:{}),...(o.y||{})} }; }
const tipStyle={backgroundColor:'#00415E',titleColor:'#A6D867',bodyColor:'#FFFFFF',borderColor:'#8CC63F',borderWidth:1,padding:11,cornerRadius:9,boxPadding:5,titleFont:{weight:'800'}};
const legendTop=()=>({position:'top',labels:{color:tickColor(),boxWidth:12,boxHeight:12,usePointStyle:true,pointStyle:'rectRounded',font:{size:11.5,weight:'600'}}});
const ring=()=>css('--bg-2');

/* ============================================================================
   FILTRES
   ========================================================================== */
const IC={
  reset:'<path d="M3 2v6h6M3 13a9 9 0 1 0 3-7.7L3 8"/>',
  xls:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13l6 5M15 13l-6 5"/>',
  pdf:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 15h8M8 18h5"/>',
  ppt:'<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M8 21h8M12 17v4M8 12V9M12 12V7M16 12v-2"/>',
  print:'<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z"/>' };
const svg=p=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${p}</svg>`;
function activeCount(){ const f=state.f; return ['nature','categorie','segment','agence','search'].filter(k=>f[k]).length+(f.staffOnly?1:0); }
function resetFilters(){ state.f={nature:'',categorie:'',segment:'',agence:'',search:'',staffOnly:false}; tbl.page=1; persist(); buildFilters(); render(); }
function renderChips(){ const el=$('#activeFilters'); if(!el) return; const f=state.f, ch=[];
  if(f.nature) ch.push(['nature','Nature',NATURE_SHORT[f.nature]||f.nature]); if(f.categorie) ch.push(['categorie','Catégorie',f.categorie]);
  if(f.segment) ch.push(['segment','Segment',f.segment]); if(f.agence) ch.push(['agence','Agence',agL(f.agence)]);
  if(f.staffOnly) ch.push(['staffOnly','Personnel','Staff Loan']); if(f.search) ch.push(['search','Recherche','« '+f.search+' »']);
  el.hidden=!ch.length||!hasData(); if(!ch.length) return;
  el.innerHTML='<span class="af-l">Filtres actifs</span>'+ch.map(([k,l,v])=>`<span class="af-chip">${l} : <b>${esc(v)}</b><button data-k="${k}" title="Retirer ce filtre">×</button></span>`).join('')
    +`<button class="af-all" id="afAll">${svg(IC.reset)}Revenir à la vue complète</button>`;
  $$('.af-chip button',el).forEach(b=>b.onclick=()=>{ state.f[b.dataset.k]=b.dataset.k==='staffOnly'?false:''; tbl.page=1; persist(); buildFilters(); render(); });
  $('#afAll').onclick=resetFilters; }
function uniq(key){ return Array.from(new Set(rawRows().map(r=>r[key]).filter(Boolean))).sort(); }
function buildFilters(){
  const bar=$('#filterBar');
  const fld=(lbl,id,opts,cur,lab)=>`<div class="ffield"><label>${lbl}</label><select data-f="${id}"><option value="">Tous</option>${opts.map(o=>`<option value="${esc(o)}" ${o===cur?'selected':''}>${esc(lab?lab(o):o)}</option>`).join('')}</select></div>`;
  bar.innerHTML=`<div class="ffield"><label>Recherche client / réf.</label><input data-f="search" placeholder="Nom, code, contrat…" value="${esc(state.f.search||'')}"></div>`
    + fld('Nature','nature',uniq('nature'),state.f.nature,o=>NATURE_SHORT[o]||o)
    + fld('Catégorie','categorie',uniq('categorie').sort(catSort),state.f.categorie)
    + fld('Segment','segment',uniq('segment'),state.f.segment)
    + fld('Agence','agence',uniq('agence'),state.f.agence,agL)
    + `<div class="ffield"><label>Personnel</label><select data-f="staffOnly"><option value="">Tous</option><option value="1" ${state.f.staffOnly?'selected':''}>Staff Loan uniquement</option></select></div>`
    + `<div class="spacer"></div>`
    + `<button class="btn" id="btnReset">${svg(IC.reset)}Réinitialiser</button>`
    + `<button class="btn xl" id="btnXlsx">${svg(IC.xls)}Excel</button>`
    + `<button class="btn pri" id="btnPdf">${svg(IC.pdf)}PDF</button>`
    + `<button class="btn pri" id="btnPpt">${svg(IC.ppt)}PowerPoint</button>`
    + `<button class="btn" id="btnPrint">${svg(IC.print)}Imprimer</button>`;
  $$('[data-f]',bar).forEach(el=>{ const ev=el.tagName==='INPUT'?'input':'change';
    el.addEventListener(ev,()=>{ state.f[el.dataset.f]=el.dataset.f==='staffOnly'?(el.value==='1'):el.value; tbl.page=1; persist(); render(); }); });
  $('#btnReset').onclick=resetFilters;
  $('#btnXlsx').onclick=()=>busy('Construction du classeur Excel Ecobank…',exportExcel);
  $('#btnPdf').onclick=()=>busy('Construction du rapport PDF…',exportPDF);
  $('#btnPpt').onclick=()=>busy('Construction de la présentation…',exportPPT);
  $('#btnPrint').onclick=()=>window.print();
}

/* ============================================================================
   VUE 1 — SYNTHÈSE EXÉCUTIVE
   ========================================================================== */
const kpi=(label,value,sub,color,icon)=>`<div class="kpi" style="--kc:${color||COL.blue}"><div class="kl">${icon?svg(icon):''}${label}</div><div class="kv">${value}</div><div class="ks">${sub||''}</div></div>`;
function viewSynthese(){
  const R=rows(), A=analyse(R), tot=A.tot||1;
  const partPF=PF.totalOtotal?100*A.tot/PF.totalOtotal:null;
  const top1=A.cl[0]||{nm:'—',v:0};
  const ins=insights(A);
  const seg=(v,c,k)=>v>0?`<i style="width:${100*v/tot}%;background:linear-gradient(180deg,${shade(c,0.25)},${c})" title="${NATURE_SHORT[k]} : ${fXOF(v)}" data-nat="${k}"></i>`:'';
  $('#view-synthese').innerHTML=`
   <div class="hero">
     <div class="hero-top">
       <div><div class="eyebrow">Total à échoir · ${esc(PERIOD_LABEL[state.period])}${activeCount()?' · périmètre filtré':''}</div>
         <div class="hero-total">${fSp(A.tot)}<span class="u">XOF</span></div>
         <div class="lead"><b>${nf.format(R.length)} contrats</b> · ${nf.format(uniqClients(R))} contreparties · arrêté <b>${esc(ARRETE)}</b>${partPF!=null?` · <b>${fPct(partPF,2)}</b> de l'encours brut du portefeuille`:''}.</div></div>
       <div style="display:flex;flex-direction:column;align-items:flex-end;gap:12px"><img class="hero-logo" data-logo src="${LOGO_SRC}" alt="Ecobank">
         ${activeCount()?`<button class="hero-back" id="heroBack">${svg(IC.reset)}Vue complète</button>`:''}</div>
     </div>
     <div class="hero-stats">
       <div class="hstat"><div class="l"><i style="background:${COL.lime}"></i>Emplois · recouvrements</div><div class="v">${fMd(A.emp)}</div><div class="s">${A.cnt.EMPLOI||0} crédits à terme</div></div>
       <div class="hstat"><div class="l"><i style="background:${COL.amber}"></i>Ressources · à refinancer</div><div class="v">${fMd(A.res)}</div><div class="s">${A.cnt.RESSOURCE||0} dépôts à échéance</div></div>
       <div class="hstat"><div class="l"><i style="background:#4FA3C7"></i>Engagements · hors-bilan</div><div class="v">${fMd(A.eng)}</div><div class="s">${A.cnt.ENGAGEMENT||0} engagements expirant</div></div>
       <div class="hstat"><div class="l"><i style="background:#fff"></i>Flux net de trésorerie</div><div class="v" style="color:${A.net>=0?COL.lime2:'#F5C26B'}">${A.net>=0?'+':''}${fMd(A.net)}</div><div class="s">Emplois − Ressources</div></div>
     </div>
     <div class="flowbar"><div class="fb">${seg(A.emp,COL.lime,'EMPLOI')}${seg(A.res,COL.amber,'RESSOURCE')}${seg(A.eng,'#4FA3C7','ENGAGEMENT')}</div>
       <div class="fl"><span>${state.f.nature?`Filtre actif : <b style="color:#fff">${NATURE_SHORT[state.f.nature]}</b> — recliquez la zone ou utilisez « Vue complète »`:"Composition du mur d'échéances — cliquez une zone pour filtrer la nature"}</span><span>${A.peak?`Pic : semaine du ${dShort(A.peak.start)} · ${fMd(wkTot(A.peak))}`:''}</span></div></div>
   </div>
   <div class="kpis k4">
     ${kpi('1ʳᵉ contrepartie',fMd(top1.v),`<span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(top1.nm)}</span>`,COL.navy)}
     ${kpi('Top 5 contreparties',fPct(100*A.top5/tot,1),`${fMd(A.top5)} · HHI ${nf.format(Math.round(A.hhi))}`,COL.blue)}
     ${kpi('Crédits Personnel',fMd(sum(A.staff,'montantXOF')),`<span class="tag up">Staff Loan</span> ${A.staff.length} contrat(s)`,COL.green)}
     ${kpi('Non-performants à échoir',fMd(sum(A.np,'montantXOF')),`<span class="tag ${A.np.length?'bad':'up'}">${A.np.length?'vigilance':'sain'}</span> ${A.np.length} contrat(s) NP`,A.np.length?COL.risk:COL.green)}
   </div>
   <div class="note"><b>Lecture rédigée.</b><ul>${ins.c.concat(ins.v).map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>
   <div class="grid g23">
     <div class="panel tall"><div class="phead"><div class="pt"><span class="dot"></span>Mur des échéances — flux hebdomadaires</div><div class="ps">par nature · XOF</div></div>
       <div class="chartwrap lg"><canvas id="c_timeline"></canvas></div></div>
     <div class="panel tall"><div class="phead"><div class="pt"><span class="dot"></span>Répartition par nature</div></div>
       <div class="chartwrap" style="height:210px"><canvas id="c_nature"></canvas></div>
       <div class="legend-list" id="leg_nature" style="margin-top:14px"></div></div>
   </div>
   <div class="grid g2">
     <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Top 10 contreparties à échoir</div><div class="ps">concentration</div></div>
       <div class="chartwrap"><canvas id="c_topclients"></canvas></div></div>
     <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Ventilation par catégorie</div></div>
       <div class="chartwrap"><canvas id="c_cat"></canvas></div></div>
   </div>`;
  $$('#view-synthese .flowbar i').forEach(i=>i.onclick=()=>{ state.f.nature=state.f.nature===i.dataset.nat?'':i.dataset.nat; tbl.page=1; persist(); buildFilters(); render(); });
  const bk=$('#heroBack'); if(bk) bk.onclick=resetFilters;
  drawTimeline('c_timeline',R);
  const natOrder=['EMPLOI','RESSOURCE','ENGAGEMENT','SURETE'].filter(k=>A.byNat[k]);
  mkChart('c_nature',{type:'doughnut',data:{labels:natOrder.map(k=>NATURE_SHORT[k]),datasets:[{data:natOrder.map(k=>A.byNat[k]),
      backgroundColor:natOrder.map(k=>NATURE_COL[k]),borderColor:css('--card'),borderWidth:3,hoverOffset:8,cutout:'64%'}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)} (${fPct(100*c.raw/tot)})`}}},maintainAspectRatio:false}});
  $('#leg_nature').innerHTML=natOrder.map(k=>`<div class="row"><span class="sw" style="background:${NATURE_COL[k]}"></span><span class="nm">${NATURE_LABEL[k]}</span><span class="vl">${fMd(A.byNat[k])}</span></div>`).join('');
  const tc=A.cl.slice(0,10);
  mkChart('c_topclients',{type:'bar',data:{labels:tc.map(x=>short(x.nm,26)),datasets:[{data:tc.map(x=>x.v),backgroundColor:grad(tc.map((x,i)=>i<3?COL.navy:COL.blue),true),borderRadius:6,maxBarThickness:18}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({x:{ticks:{callback:v=>fMd(v),color:tickColor()}}}),maintainAspectRatio:false}});
  const ce=Object.entries(groupSum(R,'categorie')).sort((a,b)=>b[1]-a[1]);
  mkChart('c_cat',{type:'bar',data:{labels:ce.map(x=>x[0]),datasets:[{data:ce.map(x=>x[1]),backgroundColor:grad(ce.map(x=>NATURE_COL[CAT_NATURE[x[0]]]||COL.blue)),borderRadius:6,maxBarThickness:30}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({money:true,x:{ticks:{maxRotation:40,minRotation:25,font:{size:9.5},color:tickColor()}}}),maintainAspectRatio:false}});
}
function drawTimeline(id,R){
  const wk=weekBuckets(R), lbl=wk.map(w=>dShort(w.start));
  const ds=(k,c)=>({label:NATURE_SHORT[k],data:wk.map(w=>w[k]),backgroundColor:grad(c),stack:'s',borderRadius:4,maxBarThickness:36});
  mkChart(id,{type:'bar',data:{labels:lbl,datasets:[ds('EMPLOI',COL.inflow),ds('RESSOURCE',COL.outflow),ds('ENGAGEMENT',COL.signa)]},
    options:{plugins:{legend:legendTop(),tooltip:{...tipStyle,callbacks:{label:c=>` ${c.dataset.label}: ${fXOF(c.raw)}`,footer:it=>'Total: '+fXOF(it.reduce((s,i)=>s+i.raw,0))}}},
      scales:{x:{stacked:true,...baseScales().x},y:{stacked:true,...baseScales({money:true}).y}},maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 2 — ÉCHÉANCIER
   ========================================================================== */
function viewEcheancier(){
  const R=rows(), A=analyse(R), tot=A.tot||1;
  const cards=A.wk.map(w=>{ const t=wkTot(w), pk=w===A.peak&&t>0, end=new Date(w.start); end.setDate(end.getDate()+6);
    const s=(v,c)=>v>0&&t>0?`<i style="width:${100*v/t}%;background:${c}"></i>`:'';
    return `<div class="weekcard ${pk?'peak':''}"><div class="wk">Semaine</div><div class="wd">${dShort(w.start)} – ${dShort(end)}</div>
      <div class="wv">${fMd(t)}</div><div class="wb">${s(w.EMPLOI,COL.inflow)}${s(w.RESSOURCE,COL.outflow)}${s(w.ENGAGEMENT,COL.signa)}</div>
      <div class="wc"><span>${w.n} contrat${w.n>1?'s':''}</span><span>${fPct(100*t/tot,0)}</span></div></div>`; }).join('');
  let cum=0; const cumPts=A.wk.map(w=>{cum+=wkTot(w);return cum;});
  $('#view-echeancier').innerHTML=`
    <div class="note"><b>Lecture du mur des échéances.</b> Chaque semaine cumule les contrats arrivant à terme.
    <b style="color:${COL.inflow}">Emplois</b> = recouvrements attendus, <b style="color:${COL.amber}">Ressources</b> = dépôts à rembourser / renouveler,
    <b style="color:${COL.blue}">Engagements</b> = engagements par signature qui s'éteignent. La carte marine marquée « PIC » est la semaine à anticiper.</div>
    <div class="panel" style="margin-bottom:16px"><div class="phead"><div class="pt"><span class="dot"></span>Calendrier des échéances</div>
      <div class="timeline-legend"><span class="li"><span class="sw" style="background:${COL.inflow}"></span>Emplois</span><span class="li"><span class="sw" style="background:${COL.outflow}"></span>Ressources</span><span class="li"><span class="sw" style="background:${COL.signa}"></span>Engagements</span></div></div>
      <div class="weekgrid">${cards||'<p style="color:var(--ink-3)">Aucune échéance sur la sélection.</p>'}</div></div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Flux hebdomadaires empilés</div></div><div class="chartwrap"><canvas id="c_tl2"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Échéances cumulées</div><div class="ps">trajectoire d'extinction</div></div><div class="chartwrap"><canvas id="c_cum"></canvas></div></div>
    </div>`;
  drawTimeline('c_tl2',R);
  mkChart('c_cum',{type:'line',data:{labels:A.wk.map(w=>dShort(w.start)),datasets:[{data:cumPts,borderColor:COL.blue,
      backgroundColor:c=>{const a=c.chart.chartArea; if(!a) return 'rgba(0,92,131,.15)'; const g=c.chart.ctx.createLinearGradient(0,a.top,0,a.bottom); g.addColorStop(0,'rgba(140,198,63,.40)'); g.addColorStop(1,'rgba(0,92,131,.02)'); return g;},
      fill:true,tension:.35,pointRadius:4,pointBackgroundColor:'#fff',pointBorderColor:COL.lime,pointBorderWidth:2.5,borderWidth:3}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' Cumul: '+fXOF(c.raw)}}},scales:baseScales({money:true}),maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 3 — CATÉGORIES
   ========================================================================== */
function catTable(a,b){ const cats=Array.from(new Set(a.concat(b).map(r=>r.categorie))).sort(catSort);
  const sa=groupSum(a,'categorie'), sb=groupSum(b,'categorie'), ca=groupCount(a,'categorie'), cb=groupCount(b,'categorie');
  return cats.map(c=>({c,nat:CAT_NATURE[c]||'ENGAGEMENT',na:ca[c]||0,va:sa[c]||0,nb:cb[c]||0,vb:sb[c]||0,t:(sa[c]||0)+(sb[c]||0)})); }
const natCls=n=>n==='EMPLOI'?'emp':n==='RESSOURCE'?'res':n==='SURETE'?'sur':'eng';
function viewCategories(){
  const a=fApply(DATA.CAE1), b=fApply(DATA.CAE2), T=catTable(a,b), totA=sum(a,'montantXOF'), totB=sum(b,'montantXOF');
  const l1=PERIOD_LABEL.CAE1.split(' (')[0], l2=PERIOD_LABEL.CAE2.split(' (')[0];
  $('#view-categories').innerHTML=`
    <div class="note"><b>Règles de catégorisation.</b> Emplois → <b>Escompte</b> (BIDA/BIDI), <b>Crédit court terme</b> (≤ 730 j) ou <b>Crédit moyen terme</b> (&gt; 730 j).
    Engagements par signature classés par code produit (LC import/export, avals, cautions, garanties…). Ressources → <b>DAT</b> et <b>Cash Collateral</b>. Les sûretés sont suivies séparément.</div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Comparatif ${esc(l1)} / ${esc(l2)}</div></div><div class="chartwrap lg"><canvas id="c_catcmp"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Poids relatif (cumul)</div></div><div class="chartwrap lg"><canvas id="c_cattree"></canvas></div></div>
    </div>
    <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Tableau des catégories</div><div class="ps">${esc(l1)} : ${fMd(totA)} · ${esc(l2)} : ${fMd(totB)}</div></div>
      <div class="tablewrap"><table class="dt"><thead><tr><th>Catégorie</th><th style="text-align:right">Nb M</th><th style="text-align:right">Montant M</th><th style="text-align:right">Nb M+1</th><th style="text-align:right">Montant M+1</th><th style="text-align:right">Total</th></tr></thead>
      <tbody>${T.map(x=>`<tr><td class="strong"><span class="chip ${natCls(x.nat)}">${NATURE_SHORT[x.nat]}</span> ${esc(x.c)}</td><td class="num">${nf.format(x.na)}</td><td class="num">${fXOF(x.va)}</td><td class="num">${nf.format(x.nb)}</td><td class="num">${fXOF(x.vb)}</td><td class="num strong">${fXOF(x.t)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td>Total</td><td class="num">${nf.format(a.length)}</td><td class="num">${fXOF(totA)}</td><td class="num">${nf.format(b.length)}</td><td class="num">${fXOF(totB)}</td><td class="num">${fXOF(totA+totB)}</td></tr></tfoot></table></div></div>`;
  mkChart('c_catcmp',{type:'bar',data:{labels:T.map(x=>x.c),datasets:[
      {label:l1,data:T.map(x=>x.va),backgroundColor:grad(COL.navy,true),borderRadius:5,maxBarThickness:22},
      {label:l2,data:T.map(x=>x.vb),backgroundColor:grad(COL.lime,true),borderRadius:5,maxBarThickness:22}]},
    options:{indexAxis:'y',plugins:{legend:legendTop(),tooltip:{...tipStyle,callbacks:{label:c=>` ${c.dataset.label}: ${fXOF(c.raw)}`}}},scales:baseScales({x:{ticks:{callback:v=>fMd(v),color:tickColor()}}}),maintainAspectRatio:false}});
  mkChart('c_cattree',{type:'doughnut',data:{labels:T.map(x=>x.c),datasets:[{data:T.map(x=>x.t),backgroundColor:T.map((x,i)=>COL.cats[i%COL.cats.length]),borderColor:css('--card'),borderWidth:2,cutout:'54%'}]},
    options:{plugins:{legend:{position:'right',labels:{color:tickColor(),boxWidth:11,font:{size:9.5}}},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)}`}}},maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 4 — CONCENTRATION & GRANDS RISQUES
   ========================================================================== */
function viewConcentration(){
  const R=rows(), A=analyse(R), tot=A.tot||1, fp=state.fonds_propres;
  const tbody=A.cl.slice(0,20).map((e,i)=>{ const pf=100*e.v/fp;
    const flag=pf>25?'<span class="chip bad">&gt; 25 % FP</span>':(pf>10?'<span class="chip res">&gt; 10 % FP</span>':'');
    return `<tr><td class="num">${i+1}</td><td class="strong">${esc(e.nm)}</td><td>${esc(e.id)}</td><td class="num">${fXOF(e.v)}</td><td class="num">${fPct(100*e.v/tot)}</td><td class="num">${fPct(pf)} ${flag}</td></tr>`; }).join('');
  $('#view-concentration').innerHTML=`
    <div class="kpis k4">
      ${kpi('Indice HHI',nf.format(Math.round(A.hhi)),A.hhi>2500?'<span class="tag bad">Très concentré</span>':A.hhi>1500?'<span class="tag down">Modéré</span>':'<span class="tag up">Diversifié</span>',COL.navy)}
      ${kpi('Top 5 contreparties',fPct(100*A.top5/tot),fMd(A.top5),COL.blue)}
      ${kpi('Top 10 contreparties',fPct(100*A.top10/tot),fMd(A.top10),COL.sky)}
      ${kpi('Grands risques (&gt; 25 % FP)',String(A.gr.length),'contreparties à surveiller',A.gr.length?COL.risk:COL.green)}
    </div>
    <div class="note"><b>Hypothèse — division des risques (UEMOA / Bâle).</b> Les fonds propres ne figurent pas dans le fichier source <b style="color:${COL.amber}">[À RENSEIGNER]</b>.
      Fonds propres = <input class="input-inline" id="fpInput" value="${fp}"> XOF.</div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Top 15 contreparties à échoir</div></div><div class="chartwrap lg"><canvas id="c_conc"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Courbe de concentration (Lorenz)</div></div><div class="chartwrap lg"><canvas id="c_lorenz"></canvas></div></div>
    </div>
    <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Détail des 20 premières contreparties</div></div>
      <div class="tablewrap"><table class="dt"><thead><tr><th style="text-align:right">#</th><th>Contrepartie</th><th>Code</th><th style="text-align:right">Montant à échoir</th><th style="text-align:right">% du total</th><th style="text-align:right">% des FP</th></tr></thead><tbody>${tbody}</tbody></table></div></div>`;
  $('#fpInput').addEventListener('change',e=>{ const v=parseFloat(String(e.target.value).replace(/\s/g,'')); if(v>0){state.fonds_propres=v;persist();viewConcentration();} });
  const t15=A.cl.slice(0,15);
  mkChart('c_conc',{type:'bar',data:{labels:t15.map(e=>short(e.nm,28)),datasets:[{data:t15.map(e=>e.v),backgroundColor:grad(t15.map((e,i)=>i<3?COL.navy:i<8?COL.blue:COL.sky),true),borderRadius:6,maxBarThickness:18}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>` ${fXOF(c.raw)} · ${fPct(100*c.raw/tot)}`}}},scales:baseScales({x:{ticks:{callback:v=>fMd(v),color:tickColor()}}}),maintainAspectRatio:false}});
  let cu=0; const lor=A.cl.map(e=>{cu+=e.v;return 100*cu/tot;}); const xs=lor.map((_,i)=>100*(i+1)/A.cl.length);
  mkChart('c_lorenz',{type:'line',data:{labels:xs.map(x=>x.toFixed(0)),datasets:[
      {label:'Concentration réelle',data:lor,borderColor:COL.blue,backgroundColor:'rgba(140,198,63,.22)',fill:true,tension:.25,pointRadius:0,borderWidth:3},
      {label:'Répartition parfaite',data:xs,borderColor:COL.ink3,borderDash:[6,5],pointRadius:0,borderWidth:1.5,fill:false}]},
    options:{plugins:{legend:legendTop(),tooltip:{...tipStyle,callbacks:{label:c=>` ${c.dataset.label}: ${fPct(c.raw)}`}}},
      scales:baseScales({x:{title:{display:true,text:'% des contreparties',color:tickColor(),font:{size:10}}},y:{ticks:{callback:v=>v+' %',color:tickColor()},title:{display:true,text:'% du montant',color:tickColor(),font:{size:10}}}}),maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 5 — SEGMENTS & AGENCES
   ========================================================================== */
function viewSegments(){
  const R=rows(), tot=sum(R,'montantXOF')||1;
  const segs=Object.entries(groupSum(R,'segment')).sort((a,b)=>b[1]-a[1]);
  const ags=Object.entries(groupSum(R,'agence')).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const aos=Object.entries(groupSum(R,'gestionnaire')).filter(x=>x[0]!=='N/D'&&x[0]!=='null').sort((a,b)=>b[1]-a[1]).slice(0,10);
  const segKeys=segs.map(s=>s[0]);
  const matrix=NAT_KEYS.map(n=>segKeys.map(s=>R.filter(r=>r.nature===n&&r.segment===s).reduce((a,r)=>a+(r.montantXOF||0),0)));
  const kc=[COL.navy,COL.blue,COL.green];
  $('#view-segments').innerHTML=`
    <div class="kpis k3">${segs.slice(0,3).map(([s,v],i)=>kpi(esc(s),fMd(v),`${fPct(100*v/tot)} du total · ${new Set(R.filter(r=>r.segment===s).map(r=>r.codeClient)).size} clients`,kc[i])).join('')}</div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Répartition par segment</div></div><div class="chartwrap" style="height:230px"><canvas id="c_seg"></canvas></div><div class="legend-list" id="leg_seg" style="margin-top:12px"></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Segment × nature</div></div><div class="chartwrap lg"><canvas id="c_segnat"></canvas></div></div>
    </div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Top agences</div></div><div class="chartwrap"><canvas id="c_ag"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Top gestionnaires de compte</div></div><div class="chartwrap"><canvas id="c_ao"></canvas></div></div>
    </div>`;
  mkChart('c_seg',{type:'doughnut',data:{labels:segKeys,datasets:[{data:segs.map(s=>s[1]),backgroundColor:segs.map((s,i)=>COL.cats[i%COL.cats.length]),borderColor:css('--card'),borderWidth:3,cutout:'64%'}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)}`}}},maintainAspectRatio:false}});
  $('#leg_seg').innerHTML=segs.map((s,i)=>`<div class="row"><span class="sw" style="background:${COL.cats[i%COL.cats.length]}"></span><span class="nm">${esc(s[0])}</span><span class="vl">${fPct(100*s[1]/tot)}</span></div>`).join('');
  mkChart('c_segnat',{type:'bar',data:{labels:segKeys,datasets:NAT_KEYS.map((n,i)=>({label:NATURE_SHORT[n],data:matrix[i],backgroundColor:grad(NATURE_COL[n]),stack:'s',borderRadius:4,maxBarThickness:52}))},
    options:{plugins:{legend:legendTop(),tooltip:{...tipStyle,callbacks:{label:c=>` ${c.dataset.label}: ${fXOF(c.raw)}`}}},scales:{x:{stacked:true,...baseScales().x},y:{stacked:true,...baseScales({money:true}).y}},maintainAspectRatio:false}});
  mkChart('c_ag',{type:'bar',data:{labels:ags.map(a=>agL(a[0])),datasets:[{data:ags.map(a=>a[1]),backgroundColor:grad(COL.blue,true),borderRadius:6,maxBarThickness:18}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({x:{ticks:{callback:v=>fMd(v),color:tickColor()}}}),maintainAspectRatio:false}});
  mkChart('c_ao',{type:'bar',data:{labels:aos.map(a=>short(a[0],22)),datasets:[{data:aos.map(a=>a[1]),backgroundColor:grad(COL.green,true),borderRadius:6,maxBarThickness:16}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({x:{ticks:{callback:v=>fMd(v),color:tickColor()}}}),maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 6 — IMPACT PORTEFEUILLE
   ========================================================================== */
function impactData(R){
  const matched=R.filter(r=>r.pfMatched), unmatched=R.filter(r=>!r.pfMatched);
  const clsM={}, clsN={}; matched.forEach(r=>{const c=r.classification||'N/D'; clsM[c]=(clsM[c]||0)+(r.montantXOF||0); clsN[c]=(clsN[c]||0)+1;});
  const cls=CLS_ORDER.filter(k=>clsM[k]).map(k=>({k,v:clsM[k],n:clsN[k]})).concat(Object.keys(clsM).filter(k=>!CLS_ORDER.includes(k)).map(k=>({k,v:clsM[k],n:clsN[k]})));
  const stgM={}; matched.forEach(r=>{const s=r.stageIFRS9!=null?String(Math.round(r.stageIFRS9)):'N/D'; stgM[s]=(stgM[s]||0)+(r.montantXOF||0);});
  const stg=[['1',stgM['1']||0],['2',stgM['2']||0],['3',stgM['3']||0]];
  const np=matched.filter(r=>String(r.status||'').toUpperCase()==='NP');
  const cov=PF.provIFRS9Disponible?PF.tauxCouverture:PF.tauxCouvertureReg;
  return {matched,unmatched,cls,stg,np,cov,covLabel:PF.provIFRS9Disponible?'IFRS 9':'réglementaire (proxy)',rate:R.length?100*matched.length/R.length:0};
}
function viewImpact(){
  const R=rows(), I=impactData(R), npl=PF.nplRatio, cov=I.cov;
  const echEmp=sum(R.filter(r=>r.nature==='EMPLOI'),'montantXOF'), rwa=echEmp*state.ponderation/100;
  const stgTot=I.stg.reduce((s,x)=>s+x[1],0)||1, npTot=sum(I.np,'montantXOF');
  const nplCol=npl>7?COL.risk:npl>5?COL.amber:COL.green;
  $('#view-impact').innerHTML=`
    <div class="note"><b>Méthode.</b> Chaque contrat à échoir est rapproché du portefeuille au ${esc(PF.reportingDate||'—')} par n° de contrat
    (taux de jointure : <b>${fPct(I.rate,0)}</b> — ${I.matched.length}/${R.length} contrats). Les ${I.unmatched.length} contrat(s) non rapprochés (souvent des ressources) ne sont pas comptabilisés dans cette vue.
    ${PF.reportingDate&&!PF.provIFRS9Disponible?`<br><b style="color:${COL.amber}">Provisions IFRS 9 non renseignées</b> : la couverture est calculée sur les provisions réglementaires (BCEAO) à titre de proxy.`:''}</div>
    <div class="kpis k4">
      ${kpi('Ratio NPL portefeuille',fPct(npl,2),`${PF.nbContratsNPL||0} contrats · base ${fMd(PF.baseNPL)}`,nplCol)}
      ${kpi('Taux de couverture',fPct(cov,1),`${I.covLabel} · ${fMd(PF.provIFRS9Disponible?PF.provIFRS9:PF.provReg)}`,COL.blue)}
      ${kpi('Encours NP dans la sélection',fMd(npTot),`${I.np.length} contrat(s) non performant(s) à échoir`,npTot>0?COL.risk:COL.green)}
      ${kpi('RWA estimé (emplois)',fMd(rwa),`pondération <input class="input-inline" id="pondInput" style="width:64px" value="${state.ponderation}"> % <b style="color:${COL.amber}">[hyp.]</b>`,COL.navy)}
    </div>
    <div class="grid g3">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Ratio NPL (portefeuille global)</div></div>
        <div class="gauge" style="height:210px"><canvas id="c_npl"></canvas><div class="gv"><div class="n" style="color:${nplCol}">${fPct(npl,2)}</div><div class="l">NPL</div></div></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Stages IFRS 9 — contrats à échoir</div></div>
        <div class="chartwrap" style="height:200px"><canvas id="c_stage"></canvas></div><div class="legend-list" id="leg_stage" style="margin-top:10px"></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Couverture du risque</div></div>
        <div class="gauge" style="height:210px"><canvas id="c_cov"></canvas><div class="gv"><div class="n" style="color:${COL.blue}">${fPct(cov,0)}</div><div class="l">Couverture</div></div></div></div>
    </div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Classification interne — contrats à échoir</div><div class="ps">${fMd(sum(I.matched,'montantXOF'))} rapprochés</div></div><div class="chartwrap"><canvas id="c_cls"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Poids de la période dans le portefeuille</div></div><div class="chartwrap"><canvas id="c_partpf"></canvas></div></div>
    </div>`;
  $('#pondInput').addEventListener('change',e=>{const v=parseFloat(e.target.value);if(v>=0){state.ponderation=v;persist();viewImpact();}});
  const arc=(v,col)=>({type:'doughnut',data:{datasets:[{data:[v,Math.max(0,100-v)],backgroundColor:[col,ring()],borderColor:'transparent',cutout:'78%',circumference:270,rotation:225,borderRadius:8}]},options:{plugins:{legend:{display:false},tooltip:{enabled:false}},maintainAspectRatio:false}});
  mkChart('c_npl',arc(Math.min(100,(npl||0)*5),nplCol));
  mkChart('c_cov',arc(Math.min(100,cov||0),COL.blue));
  mkChart('c_stage',{type:'doughnut',data:{labels:['Stage 1','Stage 2','Stage 3'],datasets:[{data:I.stg.map(x=>x[1]),backgroundColor:[COL.s1,COL.s2,COL.s3],borderColor:css('--card'),borderWidth:3,cutout:'64%'}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)} (${fPct(100*c.raw/stgTot)})`}}},maintainAspectRatio:false}});
  $('#leg_stage').innerHTML=I.stg.map((x,i)=>`<div class="row"><span class="sw" style="background:${[COL.s1,COL.s2,COL.s3][i]}"></span><span class="nm">Stage ${x[0]}</span><span class="vl">${fPct(100*x[1]/stgTot)}</span></div>`).join('');
  mkChart('c_cls',{type:'bar',data:{labels:I.cls.map(c=>CLS_LABEL[c.k]||c.k),datasets:[{data:I.cls.map(c=>c.v),backgroundColor:grad(I.cls.map(c=>clsColor(c.k))),borderRadius:6,maxBarThickness:32}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({money:true,x:{ticks:{font:{size:9.5},maxRotation:30,minRotation:15,color:tickColor()}}}),maintainAspectRatio:false}});
  const totR=sum(R,'montantXOF');
  mkChart('c_partpf',{type:'doughnut',data:{labels:['Période sélectionnée','Reste du portefeuille'],datasets:[{data:[totR,Math.max(0,(PF.totalOtotal||0)-totR)],backgroundColor:[COL.lime,COL.navy],borderColor:css('--card'),borderWidth:3,cutout:'68%'}]},
    options:{plugins:{legend:{position:'bottom',labels:{color:tickColor(),boxWidth:12,font:{size:11}}},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)}`}}},maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 7 — CRÉDITS PERSONNEL (STAFF LOAN)
   ========================================================================== */
function viewStaff(){
  const R=rawRows().filter(r=>r.isStaffLoan), tot=sum(R,'montantXOF'), byNat=groupSum(R,'nature');
  const pfS=PF.staffLoan||{count:0,total:0,nbClients:0}, pfE=PF.exStaffLoan||{count:0,total:0,nbClients:0};
  const tbody=R.slice().sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0)).map(r=>`<tr>
    <td class="strong">${esc(r.client||'—')}</td><td>${esc(r.codeClient||'—')}</td><td>${esc(r.ref||'—')}</td>
    <td><span class="chip ${natCls(r.nature)}">${NATURE_SHORT[r.nature]}</span></td><td>${esc(r.categorie||'—')}</td><td class="num">${fXOF(r.montantXOF)}</td><td>${esc(r.dateEcheance||'—')}</td>
    <td>${esc(agL(r.agence))}</td><td>${esc(r.gestionnaire||'—')}</td><td>${r.classification?`<span class="chip ${['I','IA'].includes(r.classification)?'emp':'bad'}">${esc(r.classification)}</span>`:'—'}</td></tr>`).join('');
  $('#view-staff').innerHTML=`
    <div class="note"><b>Crédits Personnel (Staff Loan).</b> Contrats à échoir dont le client est identifié <b>« Credit Program = Staff_Loan »</b> dans le portefeuille (croisement par code client).
    Portefeuille global : <b>${pfS.count}</b> contrats Staff_Loan (${fMd(pfS.total)}, ${pfS.nbClients} clients) + <b>${pfE.count}</b> contrats EX_Staff_Loan (${fMd(pfE.total)}, ${pfE.nbClients} clients, agents sortis).</div>
    <div class="kpis k4">
      ${kpi('Total Staff Loan à échoir',fMd(tot),`${R.length} contrats · ${esc(PERIOD_LABEL[state.period])}`,COL.green)}
      ${kpi('Clients Personnel concernés',String(uniqClients(R)),`sur ${pfS.nbClients} clients Staff_Loan au portefeuille`,COL.navy)}
      ${kpi('Part du Staff Loan portefeuille',fPct(pfS.total?100*tot/pfS.total:0),`de l'encours Staff_Loan total (${fMd(pfS.total)})`,COL.blue)}
      ${kpi('Répartition',`<span style="font-size:17px">${fMd(byNat.EMPLOI||0)} emplois</span>`,`${fMd(byNat.RESSOURCE||0)} ressources · ${fMd(byNat.ENGAGEMENT||0)} engagements`,COL.sky)}
    </div>
    <div class="grid g2">
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Staff Loan par agence</div></div><div class="chartwrap"><canvas id="c_staffag"></canvas></div></div>
      <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Mix Credit Program (portefeuille global)</div><div class="ps">Staff_Loan / EX_Staff_Loan vs autres</div></div><div class="chartwrap"><canvas id="c_cpmix"></canvas></div></div>
    </div>
    <div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Détail des contrats Personnel à échoir</div><div class="ps">${R.length} contrats</div></div>
      <div class="tablewrap"><table class="dt"><thead><tr><th>Client</th><th>Code</th><th>Contrat</th><th>Nature</th><th>Catégorie</th><th style="text-align:right">Montant</th><th>Échéance</th><th>Agence</th><th>Gestionnaire</th><th>Classe</th></tr></thead>
      <tbody>${tbody||'<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--ink-3)">Aucun contrat Staff Loan sur la période sélectionnée.</td></tr>'}</tbody></table></div></div>`;
  const ags=Object.entries(groupSum(R,'agence')).sort((a,b)=>b[1]-a[1]);
  mkChart('c_staffag',{type:'bar',data:{labels:ags.map(a=>agL(a[0])),datasets:[{data:ags.map(a=>a[1]),backgroundColor:grad(COL.green),borderRadius:6,maxBarThickness:30}]},
    options:{plugins:{legend:{display:false},tooltip:{...tipStyle,callbacks:{label:c=>' '+fXOF(c.raw)}}},scales:baseScales({money:true}),maintainAspectRatio:false}});
  const cp=Object.entries(PF.creditProgram||{}).sort((a,b)=>b[1].total-a[1].total).slice(0,8);
  mkChart('c_cpmix',{type:'doughnut',data:{labels:cp.map(x=>x[0]),datasets:[{data:cp.map(x=>x[1].total),backgroundColor:cp.map((x,i)=>x[0].includes('Staff')?COL.lime:COL.cats[i%COL.cats.length]),borderColor:css('--card'),borderWidth:2,cutout:'55%'}]},
    options:{plugins:{legend:{position:'right',labels:{color:tickColor(),boxWidth:11,font:{size:9.5}}},tooltip:{...tipStyle,callbacks:{label:c=>` ${c.label}: ${fXOF(c.raw)}`}}},maintainAspectRatio:false}});
}

/* ============================================================================
   VUE 8 — DÉTAIL
   ========================================================================== */
const tbl={page:1,per:25,sort:'montantXOF',dir:-1};
const COLS=[
  {k:'categorie',t:'Catégorie',w:24},{k:'nature',t:'Nature',w:13},{k:'client',t:'Contrepartie',w:34},{k:'codeClient',t:'Code',w:12},
  {k:'ref',t:'N° contrat',w:19},{k:'devise',t:'Dev.',w:7},{k:'montant',t:'Montant',num:1,w:17},{k:'montantXOF',t:'Montant XOF',num:1,w:18},
  {k:'dateValeur',t:'Date valeur',date:1,w:12},{k:'dateEcheance',t:'Échéance',date:1,w:12},{k:'joursAvantEcheance',t:'J. restants',num:1,w:10},
  {k:'segment',t:'Segment',w:14},{k:'agence',t:'Agence',w:9},{k:'agenceNom',t:'Nom agence',w:20},{k:'gestionnaire',t:'Gestionnaire',w:24},{k:'produit',t:'Produit',w:10},
  {k:'frr',t:'FRR',num:1,w:7},{k:'classification',t:'Classe',w:8},{k:'stageIFRS9',t:'Stage',num:1,w:7},{k:'status',t:'Statut',w:8},
  {k:'creditProgram',t:'Credit Program',w:15},{k:'isStaffLoan',t:'Personnel',w:10} ];
function viewDetail(){
  $('#view-detail').innerHTML=`<div class="panel"><div class="phead"><div class="pt"><span class="dot"></span>Détail des contrats à échoir</div><div class="ps" id="dt-count"></div></div>
    <div class="tablewrap" id="dt-wrap"></div>
    <div class="dt-foot"><div>Lignes par page : <select id="dt-per"><option>25</option><option>50</option><option>100</option></select></div><div class="pager" id="dt-pager"></div></div></div>`;
  $('#dt-per').value=tbl.per; $('#dt-per').onchange=e=>{tbl.per=+e.target.value;tbl.page=1;renderTable();};
  renderTable();
}
function renderTable(){
  const R=rows().slice(), s=tbl.sort, dir=tbl.dir, isDate=COLS.find(c=>c.k===s&&c.date);
  R.sort((a,b)=>{ let x=a[s],y=b[s]; if(isDate){x=pdate(a[s])||0;y=pdate(b[s])||0;}
    if(typeof x==='string'||typeof y==='string') return dir*String(x||'').localeCompare(String(y||'')); return dir*((x||0)-(y||0)); });
  const total=R.length, pages=Math.max(1,Math.ceil(total/tbl.per)); if(tbl.page>pages) tbl.page=pages;
  const slice=R.slice((tbl.page-1)*tbl.per,tbl.page*tbl.per);
  $('#dt-count').textContent=`${nf.format(total)} contrats · ${fMd(sum(R,'montantXOF'))}`;
  const head=COLS.map(c=>`<th data-s="${c.k}" style="${c.num?'text-align:right':''}">${c.t}${tbl.sort===c.k?` <span class="ar">${dir<0?'▼':'▲'}</span>`:''}</th>`).join('');
  const body=slice.map(r=>'<tr>'+COLS.map(c=>{ const v=r[c.k];
      if(c.k==='nature') return `<td><span class="chip ${natCls(v)}">${NATURE_SHORT[v]||esc(v)}</span></td>`;
      if(c.k==='isStaffLoan') return `<td>${v?'<span class="badge-staff"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>Staff</span>':'—'}</td>`;
      if(c.k==='status') return `<td>${v?`<span class="chip ${v==='NP'?'bad':'emp'}">${esc(v)}</span>`:'—'}</td>`;
      if(c.num) return `<td class="num">${v==null?'—':nf.format(v)}</td>`;
      return `<td ${c.k==='client'?'class="strong"':''}>${v==null||v===''?'—':esc(v)}</td>`; }).join('')+'</tr>').join('');
  $('#dt-wrap').innerHTML=`<table class="dt"><thead><tr>${head}</tr></thead><tbody>${body||'<tr><td colspan="22" style="text-align:center;padding:30px;color:var(--ink-3)">Aucun contrat ne correspond aux filtres.</td></tr>'}</tbody></table>`;
  $$('#dt-wrap th[data-s]').forEach(th=>th.onclick=()=>{const k=th.dataset.s; if(tbl.sort===k) tbl.dir*=-1; else {tbl.sort=k;tbl.dir=-1;} renderTable();});
  let h=`<button ${tbl.page<=1?'disabled':''} data-p="prev">‹</button>`;
  for(let i=1;i<=pages;i++){ if(i===1||i===pages||Math.abs(i-tbl.page)<=2) h+=`<button class="${i===tbl.page?'on':''}" data-p="${i}">${i}</button>`; else if(Math.abs(i-tbl.page)===3) h+='<span style="color:var(--ink-3);padding:0 4px">…</span>'; }
  $('#dt-pager').innerHTML=h+`<button ${tbl.page>=pages?'disabled':''} data-p="next">›</button>`;
  $$('#dt-pager button[data-p]').forEach(b=>b.onclick=()=>{const p=b.dataset.p; if(p==='prev') tbl.page--; else if(p==='next') tbl.page++; else tbl.page=+p; renderTable();});
}

/* ============================================================================
   NAVIGATION / RENDU / MÉMOIRE
   ========================================================================== */
const VIEW_TITLES=()=>({synthese:['Synthèse exécutive',`Vision consolidée des contrats à échoir · ${PERIOD_LABEL.CAE1.split(' (')[0]} & ${PERIOD_LABEL.CAE2.split(' (')[0]}`],
  echeancier:['Échéancier','Mur des échéances semaine par semaine'],
  categories:['Catégories','Ventilation par famille de produit · comparatif mensuel'],
  concentration:['Concentration & grands risques','Top contreparties, HHI, division des risques'],
  segments:['Segments & Agences','Structure des montants à échoir par segment et réseau'],
  impact:['Impact portefeuille','Jointure contrat réelle · cadre IFRS 9 / BCEAO'],
  staff:['Crédits Personnel','Contrats Staff Loan par croisement code client × portefeuille'],
  detail:['Détail des contrats','Tableau interactif enrichi · recherche, tri, export']});
function render(){
  const ok=hasData();
  $('#welcome').hidden=ok; $('#filterBar').hidden=!ok; $$('.view').forEach(s=>s.hidden=!ok);
  const v=state.view, T=VIEW_TITLES()[v];
  $('#vtitle').childNodes[0].nodeValue=ok?T[0]:'Bienvenue';
  $('#vsub').textContent=ok?T[1]:'Chargez le fichier CRÉANCES À ÉCHOIR pour démarrer';
  renderChips();
  if(!ok) return;
  $$('.view').forEach(s=>s.classList.remove('show')); $('#view-'+v).classList.add('show');
  ({synthese:viewSynthese,echeancier:viewEcheancier,categories:viewCategories,concentration:viewConcentration,
    segments:viewSegments,impact:viewImpact,staff:viewStaff,detail:viewDetail}[v])();
}
function persist(){ try{localStorage.setItem('cae_state_blue',JSON.stringify({f:state.f,period:state.period,view:state.view,fp:state.fonds_propres,pond:state.ponderation,theme:document.documentElement.getAttribute('data-theme')}));}catch(e){} }
function restore(){ try{ const s=JSON.parse(localStorage.getItem('cae_state_blue')); if(s){ state.f=Object.assign(state.f,s.f||{}); state.period=s.period||'CAE1'; state.view=s.view||'synthese';
  if(s.fp) state.fonds_propres=s.fp; if(s.pond) state.ponderation=s.pond; if(s.theme==='dark') document.documentElement.setAttribute('data-theme','dark'); } }catch(e){} }
function periodButtons(){ const b=$$('#periodSeg button');
  b[0].textContent='M · '+PERIOD_LABEL.CAE1.split(' (')[0]; b[1].textContent='M+1 · '+PERIOD_LABEL.CAE2.split(' (')[0]; }

/* ============================================================================
   VISUELS 3D D'EXPORT (kit G3 + barres empilées propres à l'app)
   ========================================================================== */
const PAL_NAT={EMPLOI:'#6ba23a',RESSOURCE:'#d4a13a',ENGAGEMENT:'#005c83'};
function g3Stack(o){ // o={title,sub,labels,series:[{name,values,color}],w,h}
  const g=g3Canvas(o.w||760,o.h||380); if(!g) return null; const x=g.x; g3Title(g,o.title,o.sub);
  const L=o.labels, n=L.length; if(!n) return g3Out(g);
  const top=80, bot=g.h-62, left=70, right=g.w-24, H=bot-top, W=right-left, d=Math.min(12,W/n*0.18);
  const tots=L.map((_,i)=>o.series.reduce((s,se)=>s+Math.max(0,se.values[i]||0),0)), mx=Math.max(...tots,1)*1.14;
  x.strokeStyle='#eef2f5'; x.fillStyle=G3.mut; x.font='11px Consolas,monospace'; x.textAlign='right';
  for(let i=0;i<=4;i++){ const y=bot-H*i/4; x.beginPath(); x.moveTo(left,y); x.lineTo(right,y); x.stroke(); x.fillText(g3Md(mx*i/4),left-8,y+4); }
  const bw=W/n*0.58;
  L.forEach((lb,i)=>{ const cx=left+W*(i+0.5)/n, x0=cx-bw/2; let y=bot;
    x.save(); x.shadowColor='rgba(0,40,80,.28)'; x.shadowBlur=10; x.shadowOffsetX=6; x.shadowOffsetY=4; x.fillStyle='#fff'; x.fillRect(x0,bot-tots[i]/mx*H,bw,tots[i]/mx*H); x.restore();
    o.series.forEach(se=>{ const v=Math.max(0,se.values[i]||0), h=v/mx*H; if(h<=0) return; const y0=y-h;
      const gr=x.createLinearGradient(x0,0,x0+bw,0); gr.addColorStop(0,g3Shade(se.color,0.2)); gr.addColorStop(1,g3Shade(se.color,-0.12));
      x.fillStyle=gr; x.fillRect(x0,y0,bw,h); x.fillStyle=g3Shade(se.color,-0.32);
      x.beginPath(); x.moveTo(x0+bw,y0); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw+d,y-d*0.6); x.lineTo(x0+bw,y); x.fill(); y=y0; });
    const top0=bot-tots[i]/mx*H, c0=o.series[o.series.length-1].color;
    if(tots[i]>0){ x.fillStyle='rgba(255,255,255,.55)'; x.beginPath(); x.moveTo(x0,top0); x.lineTo(x0+d,top0-d*0.6); x.lineTo(x0+bw+d,top0-d*0.6); x.lineTo(x0+bw,top0); x.fill();
      x.fillStyle=G3.ink; x.font='700 10.5px Consolas,monospace'; x.textAlign='center'; x.fillText(g3Md(tots[i]),cx+d/2,top0-d-5); }
    x.fillStyle=G3.mut; x.font='10.5px "Segoe UI",Arial'; x.textAlign='center'; x.fillText(String(lb),cx,bot+16); });
  x.strokeStyle=G3.mut; x.beginPath(); x.moveTo(left,bot); x.lineTo(right,bot); x.stroke();
  let lx=left; o.series.forEach(se=>{ x.fillStyle=se.color; x.fillRect(lx,g.h-28,14,10); x.fillStyle=G3.ink; x.font='12px "Segoe UI",Arial'; x.textAlign='left'; x.fillText(se.name,lx+20,g.h-19); lx+=x.measureText(se.name).width+46; });
  return g3Out(g); }
function visuals(A,label,big){
  const h=big?560:380, w=big?1000:760, V={};
  const natK=NAT_KEYS.filter(k=>A.byNat[k]);
  V.nature=g3Donut({title:'Répartition par nature',sub:`${label} · total ${g3Md(A.tot)} XOF`,labels:natK.map(k=>NATURE_SHORT[k]),values:natK.map(k=>A.byNat[k]),colors:natK.map(k=>PAL_NAT[k]),center:' ',w,h});
  const wk=A.wk;
  V.weeks=g3Stack({title:'Mur des échéances — flux hebdomadaires',sub:'Emplois · Ressources · Engagements (XOF)',labels:wk.map(w=>dShort(w.start)),
    series:NAT_KEYS.map(k=>({name:NATURE_SHORT[k],values:wk.map(w=>w[k]),color:PAL_NAT[k]})),w,h});
  let cu=0; V.cumul=g3Lines({title:'Échéances cumulées',sub:"Trajectoire d'extinction (XOF)",labels:wk.map(w=>dShort(w.start)),series:[{name:'Cumul à échoir',values:wk.map(w=>(cu+=wkTot(w))),color:'#005c83'}],fmt:v=>g3Md(v),w,h});
  const t10=A.cl.slice(0,10);
  V.top=g3HBars({title:'Top 10 contreparties à échoir',sub:'Montants XOF',labels:t10.map(e=>e.nm),values:t10.map(e=>e.v),colors:t10.map((e,i)=>i<3?'#00415e':'#005c83'),w,left:big?330:250});
  const ce=Object.entries(groupSum(A.R,'categorie')).sort((a,b)=>b[1]-a[1]).slice(0,12);
  V.cats=g3HBars({title:'Ventilation par catégorie',sub:'Couleur = nature',labels:ce.map(x=>x[0]),values:ce.map(x=>x[1]),colors:ce.map(x=>PAL_NAT[CAT_NATURE[x[0]]]||'#00415e'),w,left:big?330:250});
  return V;
}
function pngDims(url){ try{ return pngSize(g3Bytes(url)); }catch(e){ return {w:1520,h:760}; } }
const insightCard=(A,title)=>{ const I=insights(A); return g3Card({title:title||'Lecture du Comité — constats & recommandations',tag:'ECOBANK SÉNÉGAL',w:900,
  blocks:[{h:'Constats',col:'#005c83',items:I.c},{h:'Points de vigilance',col:'#d4a13a',items:I.v},{h:'Recommandations',col:'#6ba23a',items:I.r}].filter(b=>b.items.length)}); };

/* ============================================================================
   EXPORT EXCEL — BLUE ECOBANK : bandeau + logo, tuiles KPI, GRAPHIQUES AVANT EN-TÊTES
   ========================================================================== */
const XC={NAVY:'FF00415E',NAVY2:'FF00344B',BLUE:'FF005C83',SKY:'FF1A86B3',LIME:'FF8CC63F',LIME2:'FFA6D867',GREEN:'FF6BA23A',GREEN2:'FF4E8A2E',
  AMBER:'FFD4A13A',RISK:'FFC0392B',INK:'FF12333F',INK2:'FF3E5C6B',BG:'FFEEF4F7',TILE:'FFF4F9FB',LINE:'FFCFE0E7',ZEBRA:'FFF6FAFC',WHITE:'FFFFFFFF',TOTAL:'FFE6F2D0'};
const xFill=c=>({type:'pattern',pattern:'solid',fgColor:{argb:c}});
const xArgb=hex=>'FF'+hex.replace('#','').toUpperCase();
const NAT_X={EMPLOI:XC.GREEN,RESSOURCE:XC.AMBER,ENGAGEMENT:XC.BLUE,SURETE:XC.NAVY};
function xColPx(ws,c){ const w=ws.getColumn(c).width||9; return Math.round(w*7+5); }
function xColAt(ws,px){ let acc=0; for(let c=1;c<400;c++){ const w=xColPx(ws,c); if(acc+w>px) return (c-1)+(px-acc)/w; acc+=w; } return 0; }
function xAnchor(ws,px,row,rowOffPx){ let acc=0,c=1; while(c<400){ const w=xColPx(ws,c); if(acc+w>px) break; acc+=w; c++; }
  return {nativeCol:c-1,nativeColOff:Math.round((px-acc)*9525),nativeRow:row,nativeRowOff:Math.round((rowOffPx||0)*9525)}; }
function xWidthPx(ws,n){ let s=0; for(let c=1;c<=n;c++) s+=xColPx(ws,c); return s; }
function xSheet(wb,name,tab,widths){
  const ws=wb.addWorksheet(name,{properties:{tabColor:{argb:tab}},views:[{showGridLines:false,zoomScale:90}]});
  widths.forEach((w,i)=>ws.getColumn(i+1).width=w);
  ws.pageSetup={orientation:'landscape',paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,horizontalCentered:true,margins:{left:0.4,right:0.4,top:0.5,bottom:0.6,header:0.25,footer:0.3}};
  ws.headerFooter={oddFooter:'&L&8&K3E5C6BECOBANK SÉNÉGAL · Créances à échoir · INTERNAL USE ONLY&R&8&K00415EPage &P / &N',oddHeader:'&R&8&K005C83Direction des Engagements · Cellule Portefeuille'};
  ws._n=widths.length; ws._row=1; return ws;
}
function xBanner(wb,ws,title,sub,badgeId){
  const n=ws._n;
  ws.mergeCells(1,1,1,n); ws.mergeCells(2,1,2,n);
  const g={type:'gradient',gradient:'angle',degree:0,stops:[{position:0,color:{argb:XC.NAVY2}},{position:0.55,color:{argb:XC.NAVY}},{position:1,color:{argb:XC.BLUE}}]};
  const t=ws.getCell(1,1); t.value=title; t.font={name:'Segoe UI',bold:true,size:18,color:{argb:XC.WHITE}}; t.alignment={vertical:'middle',indent:1}; t.fill=g;
  const s=ws.getCell(2,1); s.value=sub; s.font={name:'Segoe UI',italic:true,size:10,color:{argb:XC.LIME2}}; s.alignment={vertical:'top',indent:1}; s.fill=g;
  ws.getRow(1).height=38; ws.getRow(2).height=24; ws.getRow(3).height=5;
  for(let c=1;c<=n;c++) ws.getCell(3,c).fill=xFill(XC.LIME);
  if(badgeId!=null){ const total=xWidthPx(ws,n), bw=176, bh=63;
    ws.addImage(badgeId,{tl:xAnchor(ws,Math.max(0,total-bw-30),0,3),ext:{width:bw,height:bh},editAs:'oneCell'}); }
  ws._row=5; return ws;
}
function xScope(ws,txt){ const r=ws._row; ws.mergeCells(r,1,r,ws._n); const c=ws.getCell(r,1); c.value=txt;
  c.font={name:'Segoe UI',size:9,italic:true,color:{argb:XC.INK2}}; c.alignment={indent:1,vertical:'middle'}; ws.getRow(r).height=18; ws._row+=2; }
function xSection(ws,txt,cols){ const r=ws._row, n=cols||ws._n; ws.mergeCells(r,1,r,n); const c=ws.getCell(r,1);
  c.value='▌ '+txt.toUpperCase(); c.font={name:'Segoe UI',bold:true,size:12,color:{argb:XC.NAVY}}; c.alignment={vertical:'middle'};
  for(let i=1;i<=n;i++) ws.getCell(r,i).border={bottom:{style:'medium',color:{argb:XC.LIME}}};
  ws.getRow(r).height=26; ws._row+=2; }
function xKpis(ws,kpis){ // kpis: [{label,value,sub,color}] — tuiles 4 par ligne
  const n=ws._n, per=4, bounds=[], total=xWidthPx(ws,n); let c=1, acc=0;
  for(let i=0;i<per;i++){ const c0=c, target=total*(i+1)/per; acc+=xColPx(ws,c);
    while(c<n-(per-1-i) && acc+xColPx(ws,c+1)/2<=target){ c++; acc+=xColPx(ws,c); }
    bounds.push([c0,i===per-1?n:c]); c++; }
  for(let i=0;i<kpis.length;i+=per){ const r=ws._row;
    kpis.slice(i,i+per).forEach((k,j)=>{ const [c0,c1]=bounds[j]; const col=k.color||XC.BLUE;
      [[k.label.toUpperCase(),{name:'Segoe UI',size:8.5,bold:true,color:{argb:XC.INK2}},20],[k.value,{name:'Consolas',size:16,bold:true,color:{argb:col}},28],[k.sub||'',{name:'Segoe UI',size:8.5,color:{argb:XC.INK2}},18]]
      .forEach(([v,f,h],rr)=>{ if(c1>c0) ws.mergeCells(r+rr,c0,r+rr,c1); const c=ws.getCell(r+rr,c0); c.value=v; c.font=f;
        c.alignment={vertical:'middle',indent:1,shrinkToFit:true}; ws.getRow(r+rr).height=h;
        for(let cc=c0;cc<=c1;cc++){ const x=ws.getCell(r+rr,cc); x.fill=xFill(XC.TILE);
          x.border={left:cc===c0?{style:'thick',color:{argb:col}}:undefined,right:cc===c1?{style:'thin',color:{argb:XC.WHITE}}:undefined,
            top:rr===0?{style:'thin',color:{argb:XC.LINE}}:undefined,bottom:rr===2?{style:'medium',color:{argb:XC.LINE}}:undefined}; } }); });
    ws._row+=4; }
  ws._row+=0; }
function xImages(wb,ws,imgs,opt){ // imgs: [dataURL] côte à côte, largeur cible commune
  opt=opt||{}; const list=imgs.filter(Boolean); if(!list.length) return;
  const total=xWidthPx(ws,ws._n), gap=14, per=opt.per||list.length;
  const w=opt.w||Math.min(640,Math.floor((total-gap*(per-1))/per));
  let maxH=0; const r0=ws._row;
  list.forEach((u,i)=>{ const d=pngDims(u), h=Math.round(w*d.h/d.w); maxH=Math.max(maxH,h);
    const id=wb.addImage({base64:u,extension:'png'});
    ws.addImage(id,{tl:xAnchor(ws,i*(w+gap)+2,r0-1,3),ext:{width:w,height:h},editAs:'oneCell'}); });
  const rowsN=Math.ceil(maxH/20)+1; for(let r=r0;r<r0+rowsN;r++) ws.getRow(r).height=15;
  ws._row=r0+rowsN+1; }
function xTable(ws,head,data,o){ // graphiques déjà posés au-dessus : en-tête marine souligné lime
  o=o||{}; const r0=ws._row, num=o.num||[], pct=o.pct||[], cols=head.length;
  head.forEach((h,i)=>{ const c=ws.getCell(r0,i+1); c.value=h; c.font={name:'Segoe UI',bold:true,size:10,color:{argb:XC.WHITE}};
    c.fill=xFill(XC.NAVY); c.alignment={horizontal:num.includes(i)||pct.includes(i)?'right':'left',vertical:'middle',wrapText:true,indent:num.includes(i)||pct.includes(i)?0:1};
    c.border={bottom:{style:'thick',color:{argb:XC.LIME}},right:{style:'thin',color:{argb:'FF0A5878'}}}; });
  ws.getRow(r0).height=30;
  data.forEach((row,ri)=>{ const r=r0+1+ri, isT=row.__total;
    row.forEach((v,i)=>{ const c=ws.getCell(r,i+1); c.value=(v===''||v==null)?null:v;
      c.font={name:num.includes(i)||pct.includes(i)?'Consolas':'Segoe UI',size:10,bold:!!isT,color:{argb:isT?XC.NAVY:XC.INK}};
      if(num.includes(i)) c.numFmt='#,##0'; if(pct.includes(i)) c.numFmt='0.0%';
      c.alignment={horizontal:num.includes(i)||pct.includes(i)?'right':'left',vertical:'middle',indent:num.includes(i)||pct.includes(i)?0:1};
      const pill=o.pills&&!isT&&o.pills(ri,i,v,row);
      c.fill=xFill(pill||(isT?XC.TOTAL:(ri%2?XC.ZEBRA:XC.WHITE)));
      if(pill){ c.font={name:'Segoe UI',size:9.5,bold:true,color:{argb:XC.WHITE}}; c.alignment={horizontal:'center',vertical:'middle'}; }
      c.border=isT?{top:{style:'medium',color:{argb:XC.LIME}},bottom:{style:'medium',color:{argb:XC.NAVY}}}:{bottom:{style:'hair',color:{argb:XC.LINE}}}; });
    ws.getRow(r).height=isT?22:18; });
  const last=r0+data.filter(d=>!d.__total).length;
  (o.bars||[]).forEach(i=>{ if(last>r0) ws.addConditionalFormatting({ref:`${colL(i)}${r0+1}:${colL(i)}${last}`,rules:[{type:'dataBar',cfvo:[{type:'min'},{type:'max'}],color:{argb:'FF8CC63F'},gradient:true,priority:1}]}); });
  (o.alerts||[]).forEach(([i,thr])=>{ if(last>r0) ws.addConditionalFormatting({ref:`${colL(i)}${r0+1}:${colL(i)}${last}`,rules:[
      {type:'cellIs',operator:'greaterThan',formulae:[thr],style:{fill:{type:'pattern',pattern:'solid',bgColor:{argb:'FFF6D5D1'}},font:{color:{argb:XC.RISK},bold:true}},priority:2}]}); });
  if(o.filter&&last>r0) ws.autoFilter={from:{row:r0,column:1},to:{row:last,column:cols}};
  if(o.freeze) ws.views=[{state:'frozen',ySplit:r0,xSplit:o.freeze===true?0:o.freeze,showGridLines:false,zoomScale:90}];
  ws._row=r0+data.length+3; return r0; }
const pillNat=n=>NAT_X[n]||null;

async function exportExcel(){
  try{
    if(!hasData()){ toast("Chargez d'abord le fichier Excel."); return; }
    const A1=fApply(DATA.CAE1), A2=fApply(DATA.CAE2), ALL=A1.concat(A2), A=analyse(ALL), scope=scopeLabel();
    const l1=PERIOD_LABEL.CAE1.split(' (')[0], l2=PERIOD_LABEL.CAE2.split(' (')[0];
    const wb=new ExcelJS.Workbook(); wb.creator='Ecobank Sénégal — Direction des Engagements'; wb.company='Ecobank Sénégal'; wb.title='Créances à échoir'; wb.created=new Date();
    const badge=await g3LogoBadge(); const badgeId=badge?wb.addImage({base64:badge,extension:'png'}):null;
    const head=(ws,title,sub)=>{ xBanner(wb,ws,title,sub,badgeId); xScope(ws,`${scope} · Arrêté ${ARRETE} · Édité le ${today()}`); };
    const V=visuals(A,`${l1} + ${l2}`);

    /* 1 — Tableau de bord */
    let ws=xSheet(wb,'Tableau de bord',XC.NAVY,[34,15,15,15,15,15,15,15,15,15,15,15]);
    head(ws,'ECOBANK SÉNÉGAL — CRÉANCES À ÉCHOIR',`Tableau de bord COMEX · ${l1} + ${l2}`);
    xKpis(ws,[
      {label:'Total à échoir (2 mois)',value:fSp(A.tot),sub:`${nf.format(ALL.length)} contrats · XOF`,color:XC.NAVY},
      {label:'Emplois — recouvrements',value:fSp(A.emp),sub:`${A.cnt.EMPLOI||0} crédits à terme`,color:XC.GREEN},
      {label:'Ressources — à refinancer',value:fSp(A.res),sub:`${A.cnt.RESSOURCE||0} dépôts à échéance`,color:XC.AMBER},
      {label:'Engagements — hors-bilan',value:fSp(A.eng),sub:`${A.cnt.ENGAGEMENT||0} engagements par signature`,color:XC.BLUE},
      {label:'Flux net de trésorerie',value:(A.net>=0?'+':'')+fSp(A.net),sub:'Emplois − Ressources',color:A.net>=0?XC.GREEN2:XC.RISK},
      {label:'Contreparties',value:nf.format(uniqClients(ALL)),sub:`Top 5 = ${fPct(100*A.top5/(A.tot||1),1)} du total`,color:XC.SKY},
      {label:'Part du portefeuille',value:fPct(PF.totalOtotal?100*A.tot/PF.totalOtotal:null,2),sub:`encours global ${fMd(PF.totalOtotal)}`,color:XC.NAVY},
      {label:'Crédits Personnel',value:fSp(sum(A.staff,'montantXOF')),sub:`${A.staff.length} contrat(s) Staff Loan`,color:XC.LIME}]);
    xSection(ws,'Visualisations clés');
    xImages(wb,ws,[V.nature,V.weeks]); xImages(wb,ws,[V.top,V.cats]);
    xSection(ws,'Lecture du Comité'); xImages(wb,ws,[insightCard(A)],{w:900});
    xSection(ws,'Répartition par nature');
    const natRows=NAT_KEYS.map(k=>[NATURE_SHORT[k],NATURE_LABEL[k],A.cnt[k]||0,A.byNat[k]||0,A.tot?(A.byNat[k]||0)/A.tot:0]);
    const tn=Object.assign(['TOTAL','',ALL.length,A.tot,1],{__total:true});
    xTable(ws,['Nature','Définition','Contrats','Montant XOF','% du total'],natRows.concat([tn]),{num:[2,3],pct:[4],bars:[3],pills:(ri,i)=>i===0?NAT_X[NAT_KEYS[ri]]:null});

    /* 2 — Échéancier */
    ws=xSheet(wb,'Échéancier',XC.LIME,[16,16,18,18,18,18,13,12,12]);
    head(ws,'ÉCHÉANCIER — MUR DES ÉCHÉANCES',`Semaine par semaine · ${l1} + ${l2}`);
    const pk=A.peak;
    xKpis(ws,[{label:'Semaine pic',value:pk?dShort(pk.start):'—',sub:pk?`${fSp(wkTot(pk))} XOF`:'',color:XC.NAVY},
      {label:'Semaines couvertes',value:String(A.wk.length),sub:'buckets lundi → dimanche',color:XC.BLUE},
      {label:'Moyenne hebdomadaire',value:fSp(A.wk.length?A.tot/A.wk.length:0),sub:'XOF par semaine',color:XC.SKY},
      {label:'Part du pic',value:fPct(pk&&A.tot?100*wkTot(pk)/A.tot:null,1),sub:'du total à échoir',color:XC.AMBER}]);
    xSection(ws,'Visualisations'); xImages(wb,ws,[V.weeks,V.cumul]);
    xSection(ws,'Tableau hebdomadaire');
    let cum=0; const wkRows=A.wk.map(w=>{ const t=wkTot(w); cum+=t; const e=new Date(w.start); e.setDate(e.getDate()+6);
      return [w.start.toLocaleDateString('fr-FR'),e.toLocaleDateString('fr-FR'),w.EMPLOI,w.RESSOURCE,w.ENGAGEMENT,t,w.n,A.tot?t/A.tot:0,A.tot?cum/A.tot:0]; });
    xTable(ws,['Semaine du','au','Emplois','Ressources','Engagements','Total','Contrats','% total','% cumulé'],
      wkRows.concat([Object.assign(['TOTAL','',A.emp,A.res,A.eng,A.tot,ALL.length,1,''],{__total:true})]),{num:[2,3,4,5,6],pct:[7,8],bars:[5],freeze:false});

    /* 3 — Catégories */
    ws=xSheet(wb,'Catégories',XC.BLUE,[36,14,14,18,14,18,18,12]);
    head(ws,'CATÉGORIES DE PRODUITS',`Comparatif ${l1} / ${l2}`);
    const CT=catTable(A1,A2);
    const sa=sum(A1,'montantXOF'), sb=sum(A2,'montantXOF');
    xKpis(ws,[{label:l1,value:fSp(sa),sub:`${A1.length} contrats`,color:XC.NAVY},{label:l2,value:fSp(sb),sub:`${A2.length} contrats`,color:XC.LIME},
      {label:'Variation M+1 / M',value:fPct(sa?100*(sb-sa)/sa:null,1),sub:'évolution des montants',color:sb>=sa?XC.GREEN:XC.AMBER},{label:'Catégories actives',value:String(CT.length),sub:'familles de produits',color:XC.BLUE}]);
    xSection(ws,'Visualisations');
    xImages(wb,ws,[V.cats,g3Bars({title:`Comparatif ${l1} / ${l2}`,sub:'Montants XOF',labels:[l1,l2],values:[sa,sb],colors:['#00415e','#8cc63f']})]);
    xSection(ws,'Tableau des catégories');
    xTable(ws,['Catégorie','Nature','Nb M','Montant M','Nb M+1','Montant M+1','Total','% total'],
      CT.map(x=>[x.c,NATURE_SHORT[x.nat],x.na,x.va,x.nb,x.vb,x.t,A.tot?x.t/A.tot:0]).concat([Object.assign(['TOTAL','',A1.length,sa,A2.length,sb,sa+sb,1],{__total:true})]),
      {num:[2,3,4,5,6],pct:[7],bars:[6],pills:(ri,i,v,row)=>i===1?NAT_X[CT[ri].nat]:null});

    /* 4 — Concentration */
    ws=xSheet(wb,'Concentration',XC.NAVY,[7,40,13,14,10,18,11,11,11,16]);
    head(ws,'CONCENTRATION & GRANDS RISQUES',`Fonds propres retenus : ${fSp(state.fonds_propres)} XOF [hypothèse à confirmer]`);
    xKpis(ws,[{label:'Indice HHI',value:nf.format(Math.round(A.hhi)),sub:A.hhi>2500?'très concentré':A.hhi>1500?'modéré':'diversifié',color:XC.NAVY},
      {label:'Top 5',value:fPct(100*A.top5/(A.tot||1),1),sub:fSp(A.top5)+' XOF',color:XC.BLUE},{label:'Top 10',value:fPct(100*A.top10/(A.tot||1),1),sub:fSp(A.top10)+' XOF',color:XC.SKY},
      {label:'Grands risques > 25 % FP',value:String(A.gr.length),sub:'contreparties',color:A.gr.length?XC.RISK:XC.GREEN}]);
    xSection(ws,'Visualisations');
    let cu2=0; const lor=A.cl.map(e=>{cu2+=e.v;return 100*cu2/(A.tot||1);}); const step=Math.max(1,Math.ceil(lor.length/40));
    const lorI=lor.map((v,i)=>i).filter(i=>i%step===0||i===lor.length-1);
    xImages(wb,ws,[g3HBars({title:'Top 15 contreparties',sub:'Montants XOF à échoir',labels:A.cl.slice(0,15).map(e=>e.nm),values:A.cl.slice(0,15).map(e=>e.v),colors:A.cl.slice(0,15).map((e,i)=>i<3?'#00415e':i<8?'#005c83':'#1a86b3')}),
      g3Lines({title:'Courbe de concentration (Lorenz)',sub:'% cumulé du montant selon le rang',labels:lorI.map(i=>Math.round(100*(i+1)/lor.length)+'%'),series:[{name:'Concentration réelle',values:lorI.map(i=>lor[i]),color:'#005c83'},{name:'Répartition parfaite',values:lorI.map(i=>100*(i+1)/lor.length),color:'#8cc63f'}],fmt:v=>Math.round(v)+' %'})]);
    xSection(ws,'Top 50 contreparties');
    let cc=0; xTable(ws,['#','Contrepartie','Code','Segment','Contrats','Montant XOF','% total','% cumulé','% des FP','Alerte'],
      A.cl.slice(0,50).map((e,i)=>{ cc+=e.v; const pf=e.v/state.fonds_propres; return [i+1,e.nm,e.id,e.seg||'',e.n,e.v,e.v/(A.tot||1),cc/(A.tot||1),pf,pf>0.25?'> 25 % FP':pf>0.10?'> 10 % FP':'']; }),
      {num:[0,4,5],pct:[6,7,8],bars:[5],alerts:[[8,0.1]],pills:(ri,i,v)=>i===9&&v?(String(v).includes('25')?XC.RISK:XC.AMBER):null});

    /* 5 — Segments & Agences */
    ws=xSheet(wb,'Segments & Agences',XC.GREEN,[30,18,18,18,18,12,14,14]);
    head(ws,'SEGMENTS & AGENCES','Structure des montants à échoir par segment et réseau');
    const segs=Object.entries(groupSum(ALL,'segment')).sort((a,b)=>b[1]-a[1]), ags=Object.entries(groupSum(ALL,'agence')).sort((a,b)=>b[1]-a[1]);
    xKpis(ws,segs.slice(0,4).map(([s,v],i)=>({label:s,value:fSp(v),sub:`${fPct(100*v/(A.tot||1),1)} du total`,color:[XC.NAVY,XC.BLUE,XC.GREEN,XC.SKY][i]})));
    xSection(ws,'Visualisations');
    xImages(wb,ws,[g3Donut({title:'Répartition par segment',sub:'Montants XOF',labels:segs.map(s=>s[0]),values:segs.map(s=>s[1])}),
      g3HBars({title:'Top 12 agences',sub:'Montants XOF',labels:ags.slice(0,12).map(a=>agL(a[0])),values:ags.slice(0,12).map(a=>a[1]),color:'#005c83',left:230})]);
    xSection(ws,'Segment × nature');
    xTable(ws,['Segment','Emplois','Ressources','Engagements','Total','% total'],
      segs.map(([s,v])=>{ const R=ALL.filter(r=>r.segment===s); const g=groupSum(R,'nature'); return [s,g.EMPLOI||0,g.RESSOURCE||0,g.ENGAGEMENT||0,v,v/(A.tot||1)]; })
        .concat([Object.assign(['TOTAL',A.emp,A.res,A.eng,A.tot,1],{__total:true})]),{num:[1,2,3,4],pct:[5],bars:[4]});
    xSection(ws,'Agences');
    xTable(ws,['Agence','Contrats','Clients','Montant XOF','% total'],ags.map(([a,v])=>{ const R=ALL.filter(r=>(r.agence||'N/D')===a); return [agL(a),R.length,uniqClients(R),v,v/(A.tot||1)]; }),{num:[1,2,3],pct:[4],bars:[3]});

    /* 6 — Impact portefeuille */
    ws=xSheet(wb,'Impact portefeuille',XC.RISK,[34,14,20,18,14,14,14,14]);
    const I=impactData(ALL);
    head(ws,'IMPACT SUR LE PORTEFEUILLE',`Portefeuille au ${PF.reportingDate||'—'} · encours global ${fSp(PF.totalOtotal)} XOF`);
    xKpis(ws,[{label:'Ratio NPL portefeuille',value:fPct(PF.nplRatio,2),sub:`${PF.nbContratsNPL||0} contrats NP`,color:XC.RISK},
      {label:'Couverture du risque',value:fPct(I.cov,1),sub:I.covLabel,color:XC.BLUE},{label:'Taux de jointure',value:fPct(I.rate,0),sub:`${I.matched.length}/${ALL.length} contrats rapprochés`,color:XC.GREEN},
      {label:'NP à échoir',value:fSp(sum(I.np,'montantXOF')),sub:`${I.np.length} contrat(s)`,color:I.np.length?XC.RISK:XC.GREEN}]);
    xSection(ws,'Visualisations');
    xImages(wb,ws,[g3Gauge({title:'Taux de couverture du risque',sub:I.covLabel,value:Math.min(100,I.cov||0),label:fPct(I.cov,1)}),
      g3Bars({title:'Classification interne',sub:'Contrats à échoir rapprochés (XOF)',labels:I.cls.map(c=>c.k),values:I.cls.map(c=>c.v),colors:I.cls.map(c=>clsColor(c.k).toLowerCase())})]);
    xSection(ws,'Classification des contrats à échoir',4);
    const mt=sum(I.matched,'montantXOF')||1;
    xTable(ws,['Classification','Contrats','Montant XOF','% rapproché'],I.cls.map(c=>[CLS_LABEL[c.k]||c.k,c.n,c.v,c.v/mt]),{num:[1,2],pct:[3],bars:[2]});
    xSection(ws,'Stages IFRS 9',4);
    xTable(ws,['Stage','','Montant XOF','% rapproché'],I.stg.map(s=>['Stage '+s[0],'',s[1],s[1]/mt]),{num:[2],pct:[3],pills:(ri,i)=>i===0?[XC.GREEN,XC.AMBER,XC.RISK][ri]:null});
    xSection(ws,'Mix Credit Program — portefeuille global (top 12)',4);
    xTable(ws,['Credit Program','Contrats','Montant XOF',''],Object.entries(PF.creditProgram||{}).slice(0,12).map(([k,v])=>[k,v.count,v.total,'']),{num:[1,2],bars:[2]});

    /* 7 — Crédits Personnel */
    const SA=ALL.filter(r=>r.isStaffLoan).sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0));
    ws=xSheet(wb,'Crédits Personnel',XC.LIME,COLS.map(c=>c.w));
    head(ws,'CRÉDITS PERSONNEL — STAFF LOAN','Croisement code client × Credit Program du portefeuille');
    xKpis(ws,[{label:'Staff Loan à échoir',value:fSp(sum(SA,'montantXOF')),sub:`${SA.length} contrats`,color:XC.GREEN},
      {label:'Clients Personnel (PF)',value:nf.format((PF.staffLoan||{}).nbClients||0),sub:`${(PF.staffLoan||{}).count||0} contrats Staff_Loan`,color:XC.NAVY},
      {label:'Encours Staff Loan (PF)',value:fSp((PF.staffLoan||{}).total||0),sub:'toutes échéances',color:XC.BLUE},
      {label:'EX-Staff Loan (PF)',value:fSp((PF.exStaffLoan||{}).total||0),sub:`${(PF.exStaffLoan||{}).count||0} contrats · agents sortis`,color:XC.AMBER}]);
    xSection(ws,'Visualisations');
    const sag=Object.entries(groupSum(SA,'agence')).sort((a,b)=>b[1]-a[1]).slice(0,12);
    const sn=NAT_KEYS.filter(k=>groupSum(SA,'nature')[k]);
    xImages(wb,ws,[g3HBars({title:'Staff Loan par agence',sub:'Montants XOF',labels:sag.map(a=>agL(a[0])),values:sag.map(a=>a[1]),color:'#6ba23a',left:230}),
      g3Donut({title:'Staff Loan par nature',sub:'Montants XOF',labels:sn.map(k=>NATURE_SHORT[k]),values:sn.map(k=>groupSum(SA,'nature')[k]),colors:sn.map(k=>PAL_NAT[k])})]);
    xSection(ws,'Détail des contrats Personnel');
    detailTable(ws,SA);

    /* 8/9 — Détail M et M+1 */
    [[`Détail ${l1}`.slice(0,31),A1,PERIOD_LABEL.CAE1,XC.BLUE],[`Détail ${l2}`.slice(0,31),A2,PERIOD_LABEL.CAE2,XC.SKY]].forEach(([nm,R,lab,tab])=>{
      const D=analyse(R), w=xSheet(wb,nm.replace(/[\\\/\?\*\[\]:]/g,'-'),tab,COLS.map(c=>c.w));
      head(w,`DÉTAIL DES CONTRATS — ${lab.toUpperCase()}`,`${nf.format(R.length)} contrats · ${fSp(D.tot)} XOF`);
      xKpis(w,[{label:'Total à échoir',value:fSp(D.tot),sub:`${R.length} contrats`,color:XC.NAVY},{label:'Emplois',value:fSp(D.emp),sub:`${D.cnt.EMPLOI||0} contrats`,color:XC.GREEN},
        {label:'Ressources',value:fSp(D.res),sub:`${D.cnt.RESSOURCE||0} contrats`,color:XC.AMBER},{label:'Engagements',value:fSp(D.eng),sub:`${D.cnt.ENGAGEMENT||0} contrats`,color:XC.BLUE}]);
      xSection(w,'Visualisations');
      const Vd=visuals(D,lab); xImages(wb,w,[Vd.nature,Vd.weeks,Vd.top],{per:3,w:560});
      xSection(w,'Liste des contrats');
      detailTable(w,R.slice().sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0)));
    });

    const buf=await wb.xlsx.writeBuffer();
    dl(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Ecobank_Creances_a_echoir_${ARRETE.replace(/\//g,'-')}.xlsx`);
    toast(`Export Excel BLUE ECOBANK généré (${wb.worksheets.length} feuilles)`);
  }catch(e){ console.error(e); toast('Erreur export Excel : '+e.message); }
}
function detailTable(ws,R){
  const data=R.map(r=>COLS.map(c=>{ const v=r[c.k]; if(c.k==='isStaffLoan') return v?'OUI':''; if(c.k==='nature') return NATURE_SHORT[v]||v||''; return v==null?'':v; }));
  if(R.length) data.push(Object.assign(COLS.map((c,i)=>i===0?'TOTAL':c.k==='montantXOF'?sum(R,'montantXOF'):c.k==='client'?`${R.length} contrats`:''),{__total:true}));
  const ni=COLS.map((c,i)=>c.num?i:-1).filter(i=>i>=0), iSt=COLS.findIndex(c=>c.k==='status'), iPe=COLS.findIndex(c=>c.k==='isStaffLoan');
  xTable(ws,COLS.map(c=>c.t),data,{num:ni,bars:[7],filter:true,freeze:true,
    pills:(ri,i,v)=>i===1?NAT_X[R[ri].nature]:(i===iSt&&v==='NP'?XC.RISK:(i===iPe&&v==='OUI'?XC.GREEN:null))});
}

/* ============================================================================
   EXPORT PDF — BLUE ECOBANK
   ========================================================================== */
const cleanPdf=s=>String(s==null?'':s).replace(/[–—]/g,'-').replace(/[’]/g,"'").replace(/[  ]/g,' ').replace(/[…]/g,'...').replace(/[▌▸ʳᵉ]/g,'').replace(/[^\x00-\xFF]/g,'');
const rgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
async function exportPDF(){
  try{
    if(!hasData()){ toast("Chargez d'abord le fichier Excel."); return; }
    const {jsPDF}=window.jspdf; const doc=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
    const W=doc.internal.pageSize.getWidth(), H=doc.internal.pageSize.getHeight();
    const A1=fApply(DATA.CAE1), A2=fApply(DATA.CAE2), ALL=A1.concat(A2), A=analyse(ALL), l1=PERIOD_LABEL.CAE1.split(' (')[0], l2=PERIOD_LABEL.CAE2.split(' (')[0];
    const badge=await g3LogoBadge(); const V=visuals(A,`${l1} + ${l2}`);
    let page=0, imgN=0;
    const header=(t,s)=>{ if(page++) doc.addPage();
      doc.setFillColor(0,52,75); doc.rect(0,0,W,70,'F'); doc.setFillColor(0,92,131); doc.rect(W*0.55,0,W*0.45,70,'F');
      doc.setFillColor(0,65,94); doc.triangle(W*0.55,0,W*0.55+60,0,W*0.55,70,'F');
      doc.setFillColor(140,198,63); doc.rect(0,70,W,4,'F');
      doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(17); doc.text(cleanPdf(t),32,32);
      doc.setTextColor(166,216,103); doc.setFont('helvetica','normal'); doc.setFontSize(9.5); doc.text(cleanPdf(s||''),32,52);
      if(badge) doc.addImage(badge,'PNG',W-180,9,150,53,'badge','FAST');
      doc.setFillColor(238,244,247); doc.rect(0,H-24,W,24,'F'); doc.setFillColor(140,198,63); doc.rect(0,H-24,W,1.5,'F');
      doc.setFontSize(7.5); doc.setTextColor(62,92,107); doc.text(cleanPdf(`ECOBANK SÉNÉGAL · Direction des Engagements · Créances à échoir · ${scopeLabel()} · INTERNAL USE ONLY`),32,H-9);
      doc.setTextColor(0,65,94); doc.setFont('helvetica','bold'); doc.text(String(page),W-36,H-9,{align:'right'}); doc.setFont('helvetica','normal'); };
    const tiles=(y,list)=>{ const gap=10, cw=(W-64-gap*(list.length-1))/list.length, ch=58;
      list.forEach((k,i)=>{ const x=32+i*(cw+gap), c=rgb(k.c||COL.blue);
        doc.setFillColor(205,220,228); doc.roundedRect(x+2,y+3,cw,ch,6,6,'F');
        doc.setFillColor(255,255,255); doc.setDrawColor(207,224,231); doc.setLineWidth(0.8); doc.roundedRect(x,y,cw,ch,6,6,'FD');
        doc.setFillColor(...c); doc.rect(x,y+8,3.5,ch-16,'F');
        doc.setTextColor(62,92,107); doc.setFont('helvetica','bold'); doc.setFontSize(7.2); doc.text(cleanPdf(k.l.toUpperCase()),x+12,y+15,{maxWidth:cw-20});
        doc.setTextColor(...c); doc.setFont('courier','bold'); doc.setFontSize(String(k.v).length>16?11.5:14); doc.text(cleanPdf(k.v),x+12,y+34,{maxWidth:cw-18});
        doc.setTextColor(62,92,107); doc.setFont('helvetica','normal'); doc.setFontSize(7.2); doc.text(cleanPdf(k.s||''),x+12,y+49,{maxWidth:cw-20}); });
      return y+ch+14; };
    const img=(u,x,y,w)=>{ if(!u) return y; const d=pngDims(u), h=w*d.h/d.w; doc.addImage(u,'PNG',x,y,w,h,'img'+(imgN++),'FAST'); return y+h; };
    const table=(y,head,body,o)=>{ doc.autoTable({startY:y,head:[head.map(cleanPdf)],body:body.map(r=>r.map(cleanPdf)),theme:'plain',
      headStyles:{fillColor:[0,65,94],textColor:255,fontStyle:'bold',fontSize:8.5,lineWidth:{bottom:2.5},lineColor:[140,198,63]},
      styles:{fontSize:(o&&o.fs)||8.3,cellPadding:4.5,textColor:[18,51,63],lineColor:[227,237,242],lineWidth:{bottom:0.5}},
      alternateRowStyles:{fillColor:[246,250,252]},columnStyles:(o&&o.cs)||{},margin:{left:32,right:32,top:90,bottom:36},
      didParseCell:d=>{ if(d.section==='body'&&o&&o.pill){ const c=o.pill(d.row.index,d.column.index,d.cell.raw); if(c){ d.cell.styles.fillColor=rgb(c); d.cell.styles.textColor=255; d.cell.styles.fontStyle='bold'; d.cell.styles.halign='center'; } }
        if(d.section==='body'&&o&&o.totalLast&&d.row.index===body.length-1){ d.cell.styles.fillColor=[230,242,208]; d.cell.styles.fontStyle='bold'; d.cell.styles.textColor=[0,65,94]; } },
      didDrawPage:()=>{} }); return doc.lastAutoTable.finalY+14; };
    const money=v=>fSp(v);

    // Couverture
    page++; doc.setFillColor(0,52,75); doc.rect(0,0,W,H,'F'); doc.setFillColor(0,92,131); doc.circle(W-60,-40,300,'F');
    doc.setFillColor(0,65,94); doc.circle(W-120,H+120,240,'F'); doc.setFillColor(140,198,63); doc.rect(0,H-10,W,10,'F');
    if(badge) doc.addImage(badge,'PNG',48,52,300,107,'badge','FAST');
    doc.setTextColor(166,216,103); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('DIRECTION DES ENGAGEMENTS · CELLULE PORTEFEUILLE',50,230);
    doc.setTextColor(255,255,255); doc.setFontSize(34); doc.text(cleanPdf('Créances à échoir'),48,272);
    doc.setFont('helvetica','normal'); doc.setFontSize(14); doc.text(cleanPdf(`Tableau de bord COMEX · ${l1} + ${l2}`),50,298);
    doc.setFillColor(140,198,63); doc.rect(50,314,90,4,'F');
    doc.setFontSize(10); doc.setTextColor(210,226,234); doc.text(cleanPdf(`Arrêté ${ARRETE} · édité le ${today()} · ${scopeLabel()}`),50,338);
    doc.setFont('courier','bold'); doc.setFontSize(30); doc.setTextColor(255,255,255); doc.text(money(A.tot)+' XOF',50,400);
    doc.setFont('helvetica','normal'); doc.setFontSize(10); doc.setTextColor(166,216,103); doc.text(cleanPdf(`${nf.format(ALL.length)} contrats à échoir · ${uniqClients(ALL)} contreparties`),50,420);

    // Synthèse
    header('SYNTHÈSE EXÉCUTIVE',`${l1} + ${l2} · arrêté ${ARRETE}`);
    let y=tiles(92,[{l:'Total à échoir',v:money(A.tot),s:`${ALL.length} contrats · XOF`,c:COL.navy},{l:'Emplois',v:money(A.emp),s:'recouvrements attendus',c:COL.green},
      {l:'Ressources',v:money(A.res),s:'à refinancer / renouveler',c:COL.amber},{l:'Engagements',v:money(A.eng),s:'hors-bilan expirant',c:COL.blue}]);
    const iw=(W-64-14)/2; img(V.nature,32,y,iw); img(V.weeks,32+iw+14,y,iw);
    header('LECTURE DU COMITÉ','Constats, points de vigilance et recommandations');
    y=img(insightCard(A),W/2-300,94,600)+10;
    y=tiles(Math.min(y,H-120),[{l:'Flux net',v:(A.net>=0?'+':'')+money(A.net),s:'Emplois - Ressources',c:A.net>=0?COL.green:COL.risk},{l:'Top 5 contreparties',v:fPct(100*A.top5/(A.tot||1),1),s:'du total à échoir',c:COL.blue},
      {l:'Ratio NPL portefeuille',v:fPct(PF.nplRatio,2),s:`${PF.nbContratsNPL||0} contrats NP`,c:COL.risk},{l:'Crédits Personnel',v:money(sum(A.staff,'montantXOF')),s:`${A.staff.length} contrats`,c:COL.lime}]);

    // Catégories
    header('RÉPARTITION PAR NATURE ET CATÉGORIE',`Cumul ${l1} + ${l2}`);
    img(V.cats,32,92,iw); img(V.top,32+iw+14,92,iw);
    header('TABLEAU DES CATÉGORIES',`Comparatif ${l1} / ${l2}`);
    const CT=catTable(A1,A2);
    table(92,['Catégorie','Nature','Nb M','Montant M','Nb M+1','Montant M+1','Total'],
      CT.map(x=>[x.c,NATURE_SHORT[x.nat],String(x.na),money(x.va),String(x.nb),money(x.vb),money(x.t)]).concat([['TOTAL','',String(A1.length),money(sum(A1,'montantXOF')),String(A2.length),money(sum(A2,'montantXOF')),money(A.tot)]]),
      {cs:{2:{halign:'right'},3:{halign:'right',font:'courier'},4:{halign:'right'},5:{halign:'right',font:'courier'},6:{halign:'right',font:'courier',fontStyle:'bold'}},totalLast:true,
       pill:(ri,ci)=>ci===1&&CT[ri]?NATURE_COL[CT[ri].nat]:null});

    // Échéancier + concentration
    header('ÉCHÉANCIER',"Mur des échéances et trajectoire d'extinction");
    img(V.weeks,32,92,iw); img(V.cumul,32+iw+14,92,iw);
    header('CONCENTRATION','Top 20 contreparties à échoir');
    table(92,['#','Contrepartie','Code','Contrats','Montant XOF','% total','% des FP'],A.cl.slice(0,20).map((e,i)=>[String(i+1),e.nm,e.id,String(e.n),money(e.v),fPct(100*e.v/(A.tot||1)),fPct(100*e.v/state.fonds_propres)]),
      {cs:{0:{halign:'right'},3:{halign:'right'},4:{halign:'right',font:'courier'},5:{halign:'right'},6:{halign:'right'}}});

    // Impact
    const I=impactData(ALL);
    header('IMPACT SUR LE PORTEFEUILLE',`Portefeuille au ${PF.reportingDate||'—'} · jointure contrat`);
    y=tiles(92,[{l:'Ratio NPL portefeuille',v:fPct(PF.nplRatio,2),s:`${PF.nbContratsNPL||0} contrats NP`,c:COL.risk},{l:'Couverture du risque',v:fPct(I.cov,1),s:I.covLabel,c:COL.blue},
      {l:'Taux de jointure',v:fPct(I.rate,0),s:`${I.matched.length}/${ALL.length} contrats`,c:COL.green},{l:'NP à échoir',v:money(sum(I.np,'montantXOF')),s:'dans la sélection',c:COL.risk}]);
    const sw=(W-64-14)/2;
    img(g3Gauge({title:'Taux de couverture du risque',sub:I.covLabel,value:Math.min(100,I.cov||0),label:fPct(I.cov,1)}),32,y,sw*0.82);
    img(g3Bars({title:'Classification interne',sub:'Contrats à échoir rapprochés (XOF)',labels:I.cls.map(c=>c.k),values:I.cls.map(c=>c.v),colors:I.cls.map(c=>clsColor(c.k).toLowerCase())}),32+sw+14,y,sw);

    // Staff
    const SA=ALL.filter(r=>r.isStaffLoan).sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0));
    header('CRÉDITS PERSONNEL — STAFF LOAN','Croisement code client × Credit Program du portefeuille');
    y=tiles(92,[{l:'Staff Loan à échoir',v:money(sum(SA,'montantXOF')),s:`${SA.length} contrats`,c:COL.green},{l:'Clients Personnel (PF)',v:nf.format((PF.staffLoan||{}).nbClients||0),s:`${(PF.staffLoan||{}).count||0} contrats au total`,c:COL.navy},
      {l:'Encours Staff Loan (PF)',v:money((PF.staffLoan||{}).total||0),s:'toutes échéances',c:COL.blue},{l:'EX-Staff Loan (PF)',v:money((PF.exStaffLoan||{}).total||0),s:`${(PF.exStaffLoan||{}).count||0} contrats`,c:COL.amber}]);
    table(y,['Client','Code','Contrat','Nature','Montant XOF','Échéance','Agence'],SA.slice(0,200).map(r=>[r.client,r.codeClient||'',r.ref,NATURE_SHORT[r.nature],money(r.montantXOF),r.dateEcheance||'',agL(r.agence)]),
      {cs:{4:{halign:'right',font:'courier'}},pill:(ri,ci)=>ci===3&&SA[ri]?NATURE_COL[SA[ri].nature]:null});

    // Détail
    [[`DÉTAIL DES CONTRATS — ${l1.toUpperCase()}`,A1,PERIOD_LABEL.CAE1],[`DÉTAIL DES CONTRATS — ${l2.toUpperCase()}`,A2,PERIOD_LABEL.CAE2]].forEach(([t,R,pl])=>{
      header(t,`${pl} · ${R.length} contrats · ${money(sum(R,'montantXOF'))} XOF`);
      const S=R.slice().sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0)).slice(0,300);
      table(92,['Catégorie','Nature','Contrepartie','N° contrat','Montant XOF','Échéance','Segment','Classe','Statut'],
        S.map(r=>[r.categorie,NATURE_SHORT[r.nature],r.client,r.ref,money(r.montantXOF),r.dateEcheance,r.segment,r.classification||'-',r.status||'-']),
        {fs:7.2,cs:{4:{halign:'right',font:'courier'}},pill:(ri,ci,v)=>ci===1&&S[ri]?NATURE_COL[S[ri].nature]:(ci===8&&v==='NP'?COL.risk:null)});
      if(R.length>300){ doc.setFontSize(8); doc.setTextColor(62,92,107); doc.text(cleanPdf(`... ${R.length-300} lignes supplémentaires dans l'export Excel.`),32,doc.lastAutoTable.finalY+12); }
    });
    doc.setProperties({title:'Créances à échoir — Ecobank Sénégal',author:'Direction des Engagements',subject:'Tableau de bord COMEX'});
    doc.save(`Ecobank_Creances_a_echoir_${ARRETE.replace(/\//g,'-')}.pdf`);
    toast('Export PDF BLUE ECOBANK généré');
  }catch(e){ console.error(e); toast('Erreur export PDF : '+e.message); }
}

/* ============================================================================
   EXPORT POWERPOINT — BLUE ECOBANK (kit pptBand / pptKpis / pptTable)
   ========================================================================== */
async function exportPPT(){
  try{
    if(!hasData()){ toast("Chargez d'abord le fichier Excel."); return; }
    if(typeof PptxGenJS==='undefined'){ toast('Moteur PowerPoint indisponible dans ce navigateur'); return; }
    const pp=new PptxGenJS(); pp.layout='LAYOUT_WIDE'; pp.author='Ecobank Sénégal — Direction des Engagements'; pp.title='Créances à échoir';
    const A1=fApply(DATA.CAE1), A2=fApply(DATA.CAE2), ALL=A1.concat(A2), A=analyse(ALL), l1=PERIOD_LABEL.CAE1.split(' (')[0], l2=PERIOD_LABEL.CAE2.split(' (')[0];
    const badge=await g3LogoBadge(), V=visuals(A,`${l1} + ${l2}`,true), foot=`ECOBANK SÉNÉGAL · Créances à échoir · arrêté ${ARRETE} · ${scopeLabel()}`;
    const m=v=>fSp(v); let n=1;
    const pic=(s,u,x,y,w)=>{ if(!u) return; const d=pngDims(u); let h=w*d.h/d.w; if(y+h>7.1){ const k=(7.1-y)/h; h*=k; w*=k; } s.addImage({data:u,x,y,w,h}); };
    const slide=(t,st)=>{ const s=pp.addSlide(); pptBand(pp,s,t,st,foot,++n,badge); return s; };

    // Couverture
    let s=pp.addSlide(); s.background={color:PX.NV};
    s.addShape(pp.ShapeType.ellipse,{x:8.6,y:-2.4,w:7.2,h:7.2,fill:{color:PX.BL,transparency:35},line:{color:PX.BL,transparency:100}});
    s.addShape(pp.ShapeType.ellipse,{x:10.4,y:4.4,w:4.6,h:4.6,fill:{color:PX.LM,transparency:78},line:{color:PX.LM,transparency:100}});
    s.addShape(pp.ShapeType.rect,{x:0,y:7.3,w:13.33,h:0.2,fill:{color:PX.LM}});
    if(badge) s.addImage({data:badge,x:0.7,y:0.6,w:3.6,h:1.28});
    s.addText('DIRECTION DES ENGAGEMENTS · CELLULE PORTEFEUILLE',{x:0.7,y:2.45,w:9,h:0.35,fontSize:12,bold:true,color:PX.L2,fontFace:'Segoe UI'});
    s.addText('Créances à échoir',{x:0.7,y:2.8,w:9,h:0.9,fontSize:44,bold:true,color:'FFFFFF',fontFace:'Segoe UI'});
    s.addText(`Tableau de bord COMEX · ${l1} + ${l2}`,{x:0.7,y:3.65,w:9,h:0.45,fontSize:18,color:'FFFFFF',fontFace:'Segoe UI'});
    s.addShape(pp.ShapeType.rect,{x:0.72,y:4.2,w:1.2,h:0.07,fill:{color:PX.LM}});
    s.addText(`${m(A.tot)} XOF`,{x:0.7,y:4.45,w:9,h:0.7,fontSize:32,bold:true,color:'FFFFFF',fontFace:'Consolas'});
    s.addText(`${nf.format(ALL.length)} contrats · ${uniqClients(ALL)} contreparties · arrêté ${ARRETE} · édité le ${today()}`,{x:0.7,y:5.15,w:9.5,h:0.4,fontSize:12,color:PX.L2,fontFace:'Segoe UI'});

    // Synthèse
    s=slide('Synthèse exécutive',`${l1} + ${l2} · ${scopeLabel()}`);
    pptKpis(pp,s,[['Total à échoir',m(A.tot),PX.NV,`${ALL.length} contrats · XOF`],['Emplois',m(A.emp),PX.GR,'recouvrements attendus'],['Ressources',m(A.res),PX.AM,'à refinancer'],['Engagements',m(A.eng),PX.BL,'hors-bilan expirant']],1.3);
    pic(s,V.nature,0.5,2.6,6.05); pic(s,V.weeks,6.78,2.6,6.05);
    s=slide('Lecture du Comité','Constats · points de vigilance · recommandations');
    pic(s,insightCard(A),1.9,1.3,9.5);
    s=slide('Mur des échéances','Flux hebdomadaires empilés par nature'); pic(s,V.weeks,0.9,1.3,11.5);
    s=slide('Concentration','Top 10 contreparties et catégories');
    pic(s,V.top,0.5,1.3,6.05); pic(s,V.cats,6.78,1.3,6.05);
    s=slide('Tableau des catégories',`Comparatif ${l1} / ${l2}`);
    const CT=catTable(A1,A2).slice(0,15);
    pptTable(s,['Catégorie','Nature','Nb M','Montant M','Nb M+1','Montant M+1','Total'],
      CT.map(x=>[x.c,NATURE_SHORT[x.nat],x.na,m(x.va),x.nb,m(x.vb),m(x.t)]).concat([Object.assign(['TOTAL','',A1.length,m(sum(A1,'montantXOF')),A2.length,m(sum(A2,'montantXOF')),m(A.tot)],{__total:true})]),
      {y:1.3,colW:[3.6,1.5,0.9,2.0,0.9,2.0,1.43],right:[2,3,4,5,6],fs:9,rowH:0.3,pills:(ri,i)=>i===1&&CT[ri]?NATURE_COL[CT[ri].nat].slice(1):null});
    // Impact
    const I=impactData(ALL);
    s=slide('Impact sur le portefeuille',`Portefeuille au ${PF.reportingDate||'—'} · encours global ${m(PF.totalOtotal)} XOF`);
    pptKpis(pp,s,[['Ratio NPL',fPct(PF.nplRatio,2),PX.RK,`${PF.nbContratsNPL||0} contrats NP`],['Couverture',fPct(I.cov,1),PX.BL,I.covLabel],['Jointure',fPct(I.rate,0),PX.GR,`${I.matched.length}/${ALL.length} contrats`],['NP à échoir',m(sum(I.np,'montantXOF')),PX.RK,`${I.np.length} contrat(s)`]],1.3);
    pic(s,g3Gauge({title:'Taux de couverture du risque',sub:I.covLabel,value:Math.min(100,I.cov||0),label:fPct(I.cov,1),w:760,h:460}),0.5,2.6,5.4);
    pic(s,g3Bars({title:'Classification interne',sub:'Contrats à échoir rapprochés (XOF)',labels:I.cls.map(c=>c.k),values:I.cls.map(c=>c.v),colors:I.cls.map(c=>clsColor(c.k).toLowerCase()),w:1000,h:520}),6.2,2.6,6.6);
    // Staff
    const SA=ALL.filter(r=>r.isStaffLoan).sort((a,b)=>(b.montantXOF||0)-(a.montantXOF||0));
    s=slide('Crédits Personnel — Staff Loan','Croisement code client × Credit Program');
    pptKpis(pp,s,[['Staff Loan à échoir',m(sum(SA,'montantXOF')),PX.GR,`${SA.length} contrats`],['Clients Personnel',nf.format((PF.staffLoan||{}).nbClients||0),PX.NV,'au portefeuille'],['Encours Staff Loan',m((PF.staffLoan||{}).total||0),PX.BL,'portefeuille'],['EX-Staff Loan',m((PF.exStaffLoan||{}).total||0),PX.AM,`${(PF.exStaffLoan||{}).count||0} contrats`]],1.3);
    const ts=SA.slice(0,12);
    pptTable(s,['Client','Nature','Montant XOF','Échéance','Agence'],ts.map(r=>[short(r.client,40),NATURE_SHORT[r.nature],m(r.montantXOF),r.dateEcheance||'',agL(r.agence)]),
      {y:2.65,colW:[5.2,1.6,2.4,1.6,1.53],right:[2],fs:9,rowH:0.3,pills:(ri,i)=>i===1&&ts[ri]?NATURE_COL[ts[ri].nature].slice(1):null});
    // Clôture
    s=pp.addSlide(); s.background={color:PX.NV};
    s.addShape(pp.ShapeType.ellipse,{x:-1.5,y:3.6,w:6,h:6,fill:{color:PX.BL,transparency:40},line:{color:PX.BL,transparency:100}});
    s.addShape(pp.ShapeType.rect,{x:0,y:7.3,w:13.33,h:0.2,fill:{color:PX.LM}});
    if(badge) s.addImage({data:badge,x:4.86,y:2.0,w:3.6,h:1.28});
    s.addText('Merci',{x:0,y:3.6,w:13.33,h:0.8,fontSize:40,bold:true,color:'FFFFFF',align:'center',fontFace:'Segoe UI'});
    s.addText('Direction des Engagements · Cellule Portefeuille · Ecobank Sénégal',{x:0,y:4.4,w:13.33,h:0.4,fontSize:13,color:PX.L2,align:'center',fontFace:'Segoe UI'});
    const blob=await pp.write({outputType:'blob'});
    dl(blob,`Ecobank_Creances_a_echoir_${ARRETE.replace(/\//g,'-')}.pptx`);
    toast(`Export PowerPoint BLUE ECOBANK généré (${n+1} diapositives)`);
  }catch(e){ console.error(e); toast('Erreur export PowerPoint : '+e.message); }
}

/* ============================================================================
   IMPORT DYNAMIQUE (.xlsb / .xlsm / .xlsx)
   ========================================================================== */
function reproduceFromWorkbook(wb){
  const norm=s=>String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
  const sheetName=n=>wb.SheetNames.find(x=>norm(x)===norm(n));
  const sheet=n=>{ const k=sheetName(n); return k?XLSX.utils.sheet_to_json(wb.Sheets[k],{header:1,raw:true,defval:null}):null; };
  const idx=(rows,name)=>rows&&rows[0]?rows[0].findIndex(c=>norm(c)===norm(name)):-1;
  const get=(r,i)=>i>=0?r[i]:null;
  const num=v=>{ if(typeof v==='number') return v; if(v==null||v==='') return null; const x=Number(String(v).replace(/\s/g,'').replace(',','.')); return isFinite(x)?x:null; };
  const xlDate=v=>{ if(v instanceof Date) return v; if(typeof v==='number'&&v>20000){ const d=XLSX.SSF.parse_date_code(v); if(d) return new Date(d.y,d.m-1,d.d); }
    if(typeof v==='string'){ const s=v.trim(); let m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/); if(m){ let a=+m[1],b=+m[2],y=+m[3]; if(y<100) y+=2000; return a>12?new Date(y,b-1,a):new Date(y,a-1,b); }
      m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]); } return null; };
  const fmt=d=>d?('0'+d.getDate()).slice(-2)+'/'+('0'+(d.getMonth()+1)).slice(-2)+'/'+d.getFullYear():null;
  const segN=s=>{ s=norm(s); return s.includes('CORP')?'CORPORATE':(s.includes('COMER')||s.includes('COMMER'))?'COMMERCIAL':s.includes('CONSU')?'CONSUMER':(s||'N/D'); };

  const pfSheet=sheet('PORTFOLIO');
  const PF_BY_CONTRACT={}, STAFF=new Set(), EXSTAFF=new Set(); let ARRETE_DT=null;
  const PH=pfSheet?{acc:idx(pfSheet,'Contracts/Accounts'),cc:idx(pfSheet,'Code Client'),cp:idx(pfSheet,'Credit Program'),frr:idx(pfSheet,'FRR'),cls:idx(pfSheet,'Classification'),
    stage:idx(pfSheet,'Stage IFRS9 Model'),status:idx(pfSheet,'Status (P/NP)'),oto:idx(pfSheet,'Ototal Including PDO In Local Currency'),
    prov:idx(pfSheet,'Cprovisions IFRS9 In Local Currency'),provReg:idx(pfSheet,'CProvisions Per Local Regulatory In Local Currency'),orr:idx(pfSheet,'ORR'),rd:idx(pfSheet,'Reporting Date'),
    prod:idx(pfSheet,'Product Code'),segc:idx(pfSheet,'Segment Code')}:{};
  if(pfSheet){ for(let i=1;i<pfSheet.length;i++){ const r=pfSheet[i]; if(!r) continue;
      const acc=get(r,PH.acc); if(acc!=null) PF_BY_CONTRACT[String(acc).trim()]=r;
      const cc=get(r,PH.cc), cp=get(r,PH.cp);
      if(cc!=null&&cp){ const s=String(cc).trim(), c=String(cp).trim(); if(c==='Staff_Loan') STAFF.add(s); else if(c==='EX_Staff_Loan') EXSTAFF.add(s); }
      if(!ARRETE_DT){ const d=xlDate(get(r,PH.rd)); if(d) ARRETE_DT=d; } } }
  if(!ARRETE_DT) ARRETE_DT=new Date();
  const m1d=ARRETE_DT.getMonth()+1, y1=ARRETE_DT.getFullYear()+(m1d>11?1:0), m1=m1d%12;
  const m2d=m1d+1, y2=ARRETE_DT.getFullYear()+(m2d>11?1:0), m2=m2d%12;
  const S1=new Date(y1,m1,1), E1=new Date(y1,m1+1,0), S2=new Date(y2,m2,1), E2=new Date(y2,m2+1,0);
  const MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'], cap=s=>s.charAt(0).toUpperCase()+s.slice(1);
  const meta={cae1Label:`${cap(MOIS[m1])} ${y1} (mois en cours)`,cae2Label:`${cap(MOIS[m2])} ${y2} (mois prochain)`,arrete:fmt(ARRETE_DT)};

  const pfJoin=ref=>{ const r=ref?PF_BY_CONTRACT[String(ref).trim()]:null;
    if(!r) return {pfMatched:false,frr:null,classification:null,stageIFRS9:null,status:null,ototalPortfolio:null,provisionsIFRS9:null,creditProgram:null,orr:null};
    return {pfMatched:true,frr:num(get(r,PH.frr)),classification:get(r,PH.cls),stageIFRS9:num(get(r,PH.stage)),status:get(r,PH.status),
      ototalPortfolio:num(get(r,PH.oto)),provisionsIFRS9:num(get(r,PH.prov)),creditProgram:get(r,PH.cp),orr:num(get(r,PH.orr))}; };
  const staffFlags=cc=>{ const s=cc!=null?String(cc).trim():null; return [s?STAFF.has(s):false, s?EXSTAFF.has(s):false]; };
  const empCat=(p,t)=>(p==='BIDA'||p==='BIDI')?'ESCOMPTE':(t!=null&&t<=730)?'CREDIT COURT TERME':'CREDIT MOYEN TERME';
  const resCat=p=>p==='TDDDGR'?'CASH COLLATERAL':'DAT';
  const lcMeta=c=>LC_PRODUCT_META[c]||['ENGAGEMENT','AUTRE ENGAGEMENT'];
  const inR=(d,s,e)=>d&&d>=s&&d<=e;
  const SHEETS=[
    {name:'LISTE DES EMPLOIS',h:{ref:'CONTRACT_REF_NO',cust:'COUNTERPARTY',name:'CUSTOMER_NAME1',ccy:'CURRENCY',amt:'AMOUNT',lcy:'LCY_AMOUNT',v:'VALUE_DATE',m:'MATURITY_DATE',prod:'PRODUCT',
      lib:'GET_PROD_TITLE_ECOBANK{A.PRODUCT_CODE;A.MODULE_CODE}',ao:'ACC_OFF_NAME',br:'BRANCH',sg:'BUSINESS_SEGMENT_DESC',ss:'SUB_SIC_CODE_DESC',tn:'TENOR',tx:'TAUX'},
      meta:(p,t)=>['EMPLOI',empCat(p,t)]},
    {name:'LISTE DES RESSOURCES',h:{ref:'CONTRACT_REF_NO',cust:'COUNTERPARTY',name:'CUSTOMER_NAME',ccy:'CURRENCY',amt:'AMOUNT',lcy:'LCY_AMOUNT',v:'VALUE_DATE',m:'MATURITY_DATE',prod:'PRODUCT',
      lib:'PRODUCT_NAME',ao:'ACC_OFCR_DESC',br:'BRANCH',sg:'BUSINESS_SEGMENT_DESC',ss:'SUB_SIC_CODE_DESC',tx:'RATE'},meta:p=>['RESSOURCE',resCat(p)]},
    {name:'ETAT DES LC',h:{ref:'Contract Ref No',cust:'Counterparty',name:'Customer Name1',ben:'Ben Name',ccy:'Contract Ccy',amt:'Contract Amt',lcy:'Disponiblexof',v:'Effective Date',m:'Expiry Date',
      prod:'Product Code',lib:'Product Description',ao:'Acc Ofcr Desc',br:'Branch Code',sg:'Business Segment Desc',ss:'Sub Sic Code Desc',tn:'Tenor'},meta:p=>lcMeta(p),lc:true}];
  const DATA_SH=SHEETS.map(S=>{ const rows=sheet(S.name); if(!rows) return null; const H={}; Object.entries(S.h).forEach(([k,n])=>H[k]=idx(rows,n)); return {S,rows,H}; }).filter(Boolean);
  function build(start,end){ const out=[];
    DATA_SH.forEach(({S,rows,H})=>{ for(let i=1;i<rows.length;i++){ const r=rows[i]; if(!r) continue; const md=xlDate(get(r,H.m)); if(!inR(md,start,end)) continue;
      const ref=String(get(r,H.ref)||'').trim(), cc=get(r,H.cust), product=get(r,H.prod), tenor=num(get(r,H.tn));
      const [nature,categorie]=S.meta(product,tenor), [isS,isE]=staffFlags(cc);
      const lcy=num(get(r,H.lcy));
      const row={categorie,nature,codeClient:cc!=null?String(cc):null,client:get(r,H.name)||(S.lc?get(r,H.ben):null),devise:get(r,H.ccy),montant:num(get(r,H.amt)),
        montantXOF:S.lc?lcy:(lcy!=null?lcy:num(get(r,H.amt))),dateValeur:fmt(xlDate(get(r,H.v))),dateEcheance:fmt(md),ref,gestionnaire:get(r,H.ao),
        segment:segN(get(r,H.sg)),segmentRaw:get(r,H.sg),agence:get(r,H.br),sousSecteur:get(r,H.ss),produit:product,produitLib:get(r,H.lib),tenor,taux:S.lc?null:num(get(r,H.tx)),
        joursAvantEcheance:Math.round((md-ARRETE_DT)/864e5),isStaffLoan:isS,isExStaffLoan:isE};
      Object.assign(row,pfJoin(ref)); out.push(row); } });
    return out; }
  const CAE1=build(S1,E1), CAE2=build(S2,E2);

  let pfSummary={reportingDate:meta.arrete};
  if(pfSheet){ const EXCL=new Set(['OA','LGMO','LTB','CC','CKU','LCU']);
    let tot=0,baseNPL=0,npl=0,nNPL=0,provI=0,provR=0,nProvI=0,nProvR=0; const clients=new Set(), cpm={}, st={count:0,total:0,c:new Set()}, ex={count:0,total:0,c:new Set()};
    for(let i=1;i<pfSheet.length;i++){ const r=pfSheet[i]; if(!r) continue;
      const prod=String(get(r,PH.prod)||'').trim(), segc=String(get(r,PH.segc)||'').trim(), oto=num(get(r,PH.oto))||0;
      const status=String(get(r,PH.status)||'').trim().toUpperCase(), cc=get(r,PH.cc), cp=String(get(r,PH.cp)||'').trim();
      if(cc!=null) clients.add(String(cc)); tot+=oto;
      const vI=get(r,PH.prov); if(typeof vI==='number'&&vI!==0) nProvI++; provI+=num(vI)||0;
      const vR=get(r,PH.provReg); if(typeof vR==='number'&&vR!==0) nProvR++; provR+=num(vR)||0;
      if(cp){ if(!cpm[cp]) cpm[cp]={count:0,total:0}; cpm[cp].count++; cpm[cp].total+=oto;
        if(cp==='Staff_Loan'){ st.count++; st.total+=oto; if(cc!=null) st.c.add(String(cc)); } else if(cp==='EX_Staff_Loan'){ ex.count++; ex.total+=oto; if(cc!=null) ex.c.add(String(cc)); } }
      if(!EXCL.has(prod)&&segc!=='8110'){ baseNPL+=Math.abs(oto); if(status==='NP'){ npl+=Math.abs(oto); nNPL++; } } }
    pfSummary={reportingDate:meta.arrete,totalOtotal:Math.round(tot),baseNPL:Math.round(baseNPL),npl:Math.round(npl),nplRatio:baseNPL?+(100*npl/baseNPL).toFixed(2):0,nbContratsNPL:nNPL,
      provIFRS9:Math.round(provI),provIFRS9Disponible:nProvI>0,provReg:Math.round(provR),provRegDisponible:nProvR>0,
      tauxCouverture:(npl&&nProvI>0)?+(100*provI/npl).toFixed(1):null,tauxCouvertureReg:(npl&&nProvR>0)?+(100*provR/npl).toFixed(1):null,
      nbClients:clients.size,nbContrats:pfSheet.length-1,
      creditProgram:Object.fromEntries(Object.entries(cpm).sort((a,b)=>b[1].total-a[1].total).map(([k,v])=>[k,{count:v.count,total:Math.round(v.total)}])),
      staffLoan:{count:st.count,total:Math.round(st.total),nbClients:st.c.size},exStaffLoan:{count:ex.count,total:Math.round(ex.total),nbClients:ex.c.size}}; }
  return {CAE1,CAE2,pfSummary,meta,sheets:DATA_SH.length};
}
function handleFile(file){
  $('#dropzone').classList.remove('show');
  busy(`Lecture de « ${file.name} »…`,()=>new Promise(res=>{ const rd=new FileReader();
    rd.onload=e=>{ try{
      const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array',cellDates:false});
      const got=reproduceFromWorkbook(wb);
      if(!got.sheets){ toast('Feuilles attendues introuvables (LISTE DES EMPLOIS, LISTE DES RESSOURCES, ETAT DES LC).'); return res(); }
      if(!got.CAE1.length&&!got.CAE2.length){ toast('Aucune créance détectée sur le mois courant / mois prochain.'); return res(); }
      META=got.meta; ARRETE=META.arrete; DATA=enrich({CAE1:got.CAE1,CAE2:got.CAE2,meta:META}); PF=got.pfSummary; tbl.page=1;
      PERIOD_LABEL.CAE1=META.cae1Label; PERIOD_LABEL.CAE2=META.cae2Label; PERIOD_LABEL.BOTH=META.cae1Label+' + '+META.cae2Label;
      $('#foot-ar').textContent=ARRETE; $('#foot-pf').textContent=PF.reportingDate||'—'; periodButtons();
      buildFilters(); render();
      toast(`Fichier chargé : ${got.CAE1.length+got.CAE2.length} contrats à échoir · portefeuille ${nf.format(PF.nbContrats||0)} lignes`);
    }catch(err){ console.error(err); toast('Lecture impossible : '+err.message); } res(); };
    rd.onerror=()=>{ toast('Lecture du fichier impossible.'); res(); };
    rd.readAsArrayBuffer(file); }));
}

/* ============================================================================
   INIT
   ========================================================================== */
function init(){
  restore();
  $('#foot-ar').textContent=ARRETE; $('#foot-pf').textContent=PF.reportingDate||'—';
  $$('.nav').forEach(n=>n.onclick=()=>{ $$('.nav').forEach(x=>x.classList.remove('active')); n.classList.add('active'); state.view=n.dataset.view; persist(); render(); window.scrollTo({top:0,behavior:'smooth'}); });
  const cur=$(`.nav[data-view="${state.view}"]`); if(cur){ $$('.nav').forEach(x=>x.classList.remove('active')); cur.classList.add('active'); }
  periodButtons();
  $$('#periodSeg button').forEach(b=>b.onclick=()=>{ $$('#periodSeg button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); state.period=b.dataset.p; tbl.page=1; persist(); buildFilters(); render(); });
  const pb=$(`#periodSeg button[data-p="${state.period}"]`); if(pb){ $$('#periodSeg button').forEach(x=>x.classList.remove('on')); pb.classList.add('on'); }
  $('#btnTheme').onclick=()=>{ const d=document.documentElement.getAttribute('data-theme')==='dark'; if(d) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme','dark'); persist(); render(); };
  $('#btnFull').onclick=()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); };
  const pick=()=>$('#fileInput').click();
  $('#btnImport').onclick=pick; $('#welcomeDrop').onclick=pick;
  $('#fileInput').onchange=e=>{ if(e.target.files[0]) handleFile(e.target.files[0]); e.target.value=''; };
  ['dragenter','dragover'].forEach(ev=>window.addEventListener(ev,e=>{ e.preventDefault(); $('#dropzone').classList.add('show'); }));
  $('#dropzone').addEventListener('dragleave',e=>{ if(e.target===$('#dropzone')) $('#dropzone').classList.remove('show'); });
  $('#dropzone').addEventListener('drop',e=>{ e.preventDefault(); if(e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  if(hasData()) buildFilters();
  render();
  setTimeout(()=>$('#loader').classList.remove('show'),450);
}
if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded',init);
})();

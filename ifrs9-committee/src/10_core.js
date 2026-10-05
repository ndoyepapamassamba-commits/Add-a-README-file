/* =====================================================================
   ECOBANK SÉNÉGAL — IFRS9 COMMITTEE INTELLIGENCE
   10 · socle : configuration, formats, lecture tolérante du classeur
   ===================================================================== */
'use strict';
const KIT={org:'ECOBANK SÉNÉGAL',unit:'Credit Risk · Comité IFRS9',app:'IFRS9 Committee Intelligence',
  footer:'ECOBANK SÉNÉGAL · IFRS9 COMMITTEE INTELLIGENCE · INTERNAL USE ONLY',docTitle:'IFRS9 Committee Pack',
  docSubject:'Variation de la provision IFRS9 — mois N vs mois N-1',keywords:'IFRS9, ECL, Stage, Provision, Comité'};
const C={eb:'#003DA5',ebd:'#001B4D',gold:'#C8A951',ink:'#0F1E3D',mut:'#5A6785',line:'#DDE3EE',
  up:'#B3261E',dn:'#1F7A5A',s1:'#2F6FD6',s2:'#D18B1F',s3:'#B3261E',nw:'#001B4D',ex:'#9AA3B5',sky:'#7FA6E8',
  crit:'#8E1B14',high:'#C2410C',med:'#B7860B',low:'#4B6A9B'};
const STC={1:C.s1,2:C.s2,3:C.s3};

/* --- seuils (documentés dans la Méthodologie) --- */
const T={
  pctFloor:100000,        // provision N-1 minimale (XOF) pour un classement en % ; en dessous : NEW / FROM ZERO
  provHi:[100e6,25e6,10e6], // forte hausse de provision : CRITICAL / HIGH / MEDIUM
  provLo:[100e6,25e6],     // forte baisse de provision : HIGH / MEDIUM
  outHi:[1e9,250e6],       // forte hausse d'Outstanding : HIGH / MEDIUM
  outLo:[1e9,250e6],       // forte baisse d'Outstanding : MEDIUM / LOW
  divPct:0.20, divAbs:50e6, // provision ↑ alors qu'Outstanding ↓ fortement (≥20 % et ≥50 M), et inversement
  newProv:[50e6,10e6],     // nouveaux comptes à forte provision : CRITICAL / HIGH
  exitProv:[50e6,10e6],    // sorties avec forte provision N-1 : HIGH / MEDIUM
  migMat:10e6,             // S1→S2 : HIGH si Δ provision ≥ 10 M, sinon MEDIUM
  s23Crit:50e6,            // S2→S3 : CRITICAL si Δ provision ≥ 50 M, sinon HIGH
  flat:0.005               // variation relative considérée « stable » (±0,5 %)
};

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sp=s=>String(s).replace(/[  ]/g,' ');
const fX=v=>v==null||!isFinite(v)?'—':sp((Math.round(v)||0).toLocaleString('fr-FR'));
const lc=s=>s?s[0].toLowerCase()+s.slice(1):s;
function fM(v,d){ if(v==null||!isFinite(v)) return '—'; const a=Math.abs(v);
  if(a>=1e9) return sp((v/1e9).toLocaleString('fr-FR',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d}))+' Mds';
  if(a>=1e6) return sp((v/1e6).toLocaleString('fr-FR',{minimumFractionDigits:d==null?1:d,maximumFractionDigits:d==null?1:d}))+' M';
  if(a>=1e3) return sp((v/1e3).toLocaleString('fr-FR',{maximumFractionDigits:0}))+' k';
  return sp(Math.round(v).toLocaleString('fr-FR')); }
const fS=(v,d)=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+fM(Math.abs(v),d);
const fSX=v=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+fX(Math.abs(v));
function fP(v,d){ if(v==null||!isFinite(v)) return '—'; return sp((v*100).toLocaleString('fr-FR',{minimumFractionDigits:d==null?1:d,maximumFractionDigits:d==null?1:d}))+' %'; }
const fSP=(v,d)=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+fP(Math.abs(v),d);
const fBp=v=>v==null||!isFinite(v)?'—':(v>0?'+':v<0?'−':'')+sp(Math.abs(Math.round(v*10000)).toLocaleString('fr-FR'))+' pb';
const fN=v=>v==null?'—':sp(Math.round(v).toLocaleString('fr-FR'));
const fSN=v=>v==null?'—':(v>0?'+':v<0?'−':'')+fN(Math.abs(v));
const ratio=(a,b)=>b?a/b:null;
const pctCh=(n,o)=>o?(n-o)/Math.abs(o):null;
const MOIS=['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const MOISc=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const fD=d=>d?String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear():'—';
function dirIcon(v,base){ const r=base?v/Math.abs(base):v; if(v==null||!isFinite(v)) return ['fl','→'];
  if(Math.abs(base?r:0)<T.flat&&base) return ['fl','→']; if(v>0) return ['up','↑']; if(v<0) return ['dn','↓']; return ['fl','→']; }
/* « up » = hausse (rouge pour une provision, neutre/bleu pour un encours) */
function chip(v,base,kind){ const [c,a]=dirIcon(v,base); const cls=kind==='neutral'?(c==='fl'?'fl':'neu'):kind==='inv'?(c==='up'?'dn':c==='dn'?'up':'fl'):c; return `<span class="chip ${cls}">${a}</span>`; }
const stB=s=>s==null?'<span class="st sx">—</span>':s==='N'?'<span class="st sn">NEW</span>':s==='X'?'<span class="st sx">EXIT</span>':`<span class="st s${s}">S${s}</span>`;
function toast(m,ms){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),ms||3200); }
function busy(on,msg){ $('#busy').hidden=!on; if(msg) $('#busyMsg').textContent=msg; }
const tick=()=>new Promise(r=>setTimeout(r,30));
const sum=(a,f)=>{ let s=0; for(const x of a){ const v=f(x); if(v) s+=v; } return s; };
function stamp(){ const d=new Date(); return d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'_'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0'); }

/* ---------------- normalisations ---------------- */
const normH=h=>String(h==null?'':h).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[  ]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
function normId(v){ if(v==null) return ''; if(typeof v==='number'){ if(!isFinite(v)) return ''; return Number.isInteger(v)?String(v):String(v).replace(/\.0+$/,''); }
  return String(v).replace(/^'+/,'').replace(/[\s  ]/g,'').replace(/\.0+$/,'').toUpperCase(); }
function normAmt(v){ if(v==null||v==='') return null; if(typeof v==='number') return isFinite(v)?v:null;
  let s=String(v).trim(); let neg=false; if(/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1); }
  s=s.replace(/[\s  ]/g,'').replace(/XOF|FCFA|CFA/ig,'');
  if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,''); else if(/,/.test(s)&&!/\./.test(s)) s=s.replace(',','.');
  const n=parseFloat(s); if(!isFinite(n)) return null; return neg?-n:n; }
function normStage(v){ if(v==null||v==='') return null; if(typeof v==='number') return v>=1&&v<=3&&Number.isInteger(v)?v:null;
  const m=String(v).match(/([123])/); return m?+m[1]:null; }
function normTxt(v){ if(v==null) return ''; return String(v).replace(/[  ]/g,' ').replace(/\s+/g,' ').trim(); }
const normUp=v=>normTxt(v).toUpperCase();
function normDate(v){ if(v==null||v==='') return null; if(v instanceof Date) return isNaN(v)?null:new Date(v.getFullYear(),v.getMonth(),v.getDate());
  if(typeof v==='number'){ if(v>20000&&v<80000){ const d=new Date(Math.round((v-25569)*864e5)); return new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()); } return null; }
  const s=String(v).trim(); let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return new Date(+m[1],+m[2]-1,+m[3]);
  m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/); if(m) return new Date(+m[3],+m[2]-1,+m[1]); return null; }

/* ---------------- schéma attendu (correspondance par expressions régulières) ---------------- */
const SPEC={
  cur:{label:'Ce mois (N)',name:/ce mois|mois en cours|current|courant|sept/,sig:/^impairment[- ]?pre$/,cols:{
    contract:[/^contract[_ ]?id$/,/^contract$/,/^contrat$/], account:[/^account[_ ]?no$/,/^account$/,/^compte$/],
    customer:[/^customer[_ ]?no$/,/^code client$/,/^client$/], segment:[/^segment$/], product:[/^product[_ ]?type$/,/^produit$/],
    sector:[/^sector$/,/^secteur/], stage:[/^stage$/], stageOv:[/^stage[_ ]?override$/], out:[/^outstanding balance$/,/^outstanding$/],
    imp:[/^impairment[- ]?pre$/], rpt:[/^rpt[_ ]?date$/,/^reporting date$/], aff:[/^affiliate/]},
    req:['imp','out','stage']},
  prev:{label:'Mois dernier (N-1)',name:/mois dernier|previous|precedent|last month|aout/,sig:/^impairment \(manual overrides\)$/,cols:{
    contract:[/^contract[_ ]?id$/,/^contract$/,/^contrat$/], account:[/^account[_ ]?no$/,/^account$/,/^compte$/],
    customer:[/^customer[_ ]?no$/,/^code client$/], segment:[/^segment$/], product:[/^product[_ ]?type$/], sector:[/^sector$/],
    stage:[/^stage$/], out:[/^outstanding balance$/,/^outstanding$/], imp:[/^impairment \(manual overrides\)$/],
    impModel:[/^impairment \(model output\)$/]},
    req:['imp','out','stage']},
  pf:{label:'Portefeuille (N)',name:/portefeuille|portfolio/,sig:/^contracts\/accounts$/,cols:{
    key:[/^contracts\/accounts$/], cust:[/^code client$/], name:[/^relationship$/], group:[/^group name$/], officer:[/^account officer$/],
    ccy:[/^facility currency$/], cls:[/^classification$/], frr:[/^frr$/], pcode:[/^product code$/], scode:[/^segment code$/],
    bseg:[/^business_segment$/], status:[/^status \(p\/np\)$/], pdo:[/^pdo amount/], dpdo:[/^date in pdo$/], ototal:[/^ototal including pdo/],
    stage:[/^stage ifrs9/], coll:[/^collateral value/], prog:[/^credit program$/], desc:[/^description$/], mat:[/^maturity date$/],
    book:[/^booking date$/], rdate:[/^reporting date$/], gl:[/^gl_code$/]},
    req:['key']}
};
function mapCols(header,spec){ const H=header.map(normH), m={}; for(const [k,res] of Object.entries(spec.cols)){ for(const re of res){ const i=H.findIndex(h=>re.test(h)); if(i>=0){ m[k]=i; break; } } } return m; }

/* Une table = {name, header, cols:[colonne…], n, headerRow} — même forme pour un fichier chargé ou des données embarquées */
function tableFromAoa(name,aoa){
  let best=0, bestScore=-1; const lim=Math.min(25,aoa.length);
  for(let r=0;r<lim;r++){ const row=aoa[r]||[]; let sc=0; for(const sp of Object.values(SPEC)) sc+=Object.keys(mapCols(row,sp)).length; if(sc>bestScore){ bestScore=sc; best=r; } }
  const header=(aoa[best]||[]).map(h=>h==null?'':String(h)); const W=header.length;
  let last=aoa.length-1; while(last>best&&(!aoa[last]||aoa[last].every(v=>v==null||v===''))) last--;   // dernière ligne non vide détectée automatiquement
  const cols=header.map(()=>[]); let n=0, blank=0;
  for(let r=best+1;r<=last;r++){ const row=aoa[r]||[]; if(row.every(v=>v==null||v==='')){ blank++; continue; } n++; for(let c=0;c<W;c++) cols[c].push(row[c]===undefined?null:row[c]); }
  return {name,header,cols,n,headerRow:best+1,blank};
}
function tableFromEmbed(s){ return {name:s.name,header:s.header,cols:s.cols,n:s.n,headerRow:1,blank:0}; }

function assignRoles(tables){
  const roles={}, used=new Set(), log=[];
  for(const role of ['cur','prev','pf']){ const sp=SPEC[role];
    let pick=tables.find(t=>!used.has(t)&&sp.name.test(normH(t.name))&&t.header.some(h=>sp.sig.test(normH(h))));
    if(!pick) pick=tables.find(t=>!used.has(t)&&t.header.some(h=>sp.sig.test(normH(h))));
    if(!pick) pick=tables.find(t=>!used.has(t)&&sp.name.test(normH(t.name)));
    if(pick){ used.add(pick); roles[role]=pick; log.push(sp.label+' ← feuille « '+pick.name+' »'); }
  }
  return {roles,log};
}

async function readWorkbookFile(file){
  const buf=await file.arrayBuffer();
  const wb=XLSX.read(buf,{type:'array',cellDates:true,dense:true});
  const tables=wb.SheetNames.map(nm=>tableFromAoa(nm,XLSX.utils.sheet_to_json(wb.Sheets[nm],{header:1,raw:true,defval:null,blankrows:true})));
  return {source:file.name,tables};
}
async function readEmbedded(){
  if(window.__IFRS9_EMBED_ZIP__){ const z=await JSZip.loadAsync(window.__IFRS9_EMBED_ZIP__,{base64:true}); const j=JSON.parse(await z.file('data.json').async('string'));
    return {source:j.source,tables:j.sheets.map(tableFromEmbed),embedded:true,extracted:j.extracted}; }
  return null;
}

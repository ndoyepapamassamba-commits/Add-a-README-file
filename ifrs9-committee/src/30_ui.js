/* =====================================================================
   30 · interface : état, navigation, filtres, composants, graphiques
   ===================================================================== */
const S={M:null,A:null,page:'exec',f:{},charts:[],opt:{}};
const PAGES=[
  ['exec','01','EXECUTIVE SUMMARY','Executive Summary'],
  ['bridge','02','IFRS9 BRIDGE','IFRS9 Bridge — de la provision N-1 à la provision N'],
  ['mig','03','STAGE MIGRATION','Stage Migration'],
  ['out','04','OUTSTANDING','Outstanding — évolution de l\'exposition'],
  ['mov','05','PROVISION MOVEMENTS','Provision Movements'],
  ['inc','06','TOP INCREASES','Top Increases — hausses de provision'],
  ['dec','07','TOP DECREASES','Top Decreases — baisses de provision'],
  ['seg','08','SEGMENTS','Segments'],
  ['agc','09','AGENCIES','Agencies — gestionnaires de portefeuille'],
  ['cli','10','CLIENT INTELLIGENCE','Client Intelligence'],
  ['wl','11','WATCHLIST','IFRS9 Watchlist'],
  ['dq','12','DATA QUALITY','Data Quality & Méthodologie'],
  ['pack','13','COMMITTEE PACK','Committee Pack']];

/* ---------- graphiques ---------- */
Chart.defaults.font.family='"Segoe UI","SF Pro Text",Roboto,Arial,sans-serif'; Chart.defaults.font.size=11; Chart.defaults.color=C.mut;
Chart.defaults.plugins.legend.labels.boxWidth=10; Chart.defaults.plugins.legend.labels.boxHeight=10; Chart.defaults.maintainAspectRatio=false;
Chart.defaults.plugins.tooltip.backgroundColor=C.ebd; Chart.defaults.plugins.tooltip.padding=10; Chart.defaults.plugins.tooltip.titleColor=C.gold;
Chart.defaults.animation.duration=350;
Chart.register({id:'vlab',afterDatasetsDraw(ch,_,o){ if(!o||!o.fmt) return; const x=ch.ctx; x.save(); x.font='600 10.5px "Segoe UI",Arial'; x.fillStyle=o.color||C.ink;
  ch.data.datasets.forEach((ds,di)=>{ if(o.only!=null&&o.only!==di) return; const m=ch.getDatasetMeta(di); if(m.hidden) return; m.data.forEach((el,i)=>{ const raw=ds.data[i]; const v=o.val?o.val(raw,i,di):raw; if(v==null||v===0&&o.skip0) return;
    const t=o.fmt(v,i,di); if(!t) return; const p=el.tooltipPosition(); const hz=ch.options.indexAxis==='y';
    if(hz){ x.textAlign=v<0?'right':'left'; x.textBaseline='middle'; x.fillText(t,v<0?Math.min(el.x,el.base)-4:Math.max(el.x,el.base)+4,p.y); }
    else { x.textAlign='center'; x.textBaseline='bottom'; const top=Math.min(el.y,el.base!=null?el.base:el.y); x.fillText(t,p.x,top-3); } }); }); x.restore(); }});
function mk(id,cfg){ const el=document.getElementById(id); if(!el) return null; const ch=new Chart(el.getContext('2d'),cfg); S.charts.push(ch); return ch; }
function killCharts(){ S.charts.forEach(c=>{ try{ c.destroy(); }catch(e){} }); S.charts=[]; }
const axM={ticks:{callback:v=>fM(v,0)},grid:{color:'#EEF1F6'}};
const axP={ticks:{callback:v=>fP(v,0)},grid:{color:'#EEF1F6'}};
const ttM=ctx=>' '+ctx.dataset.label+' : '+fM(ctx.raw&&ctx.raw.y!=null?ctx.raw.y:Array.isArray(ctx.raw)?ctx.raw[1]-ctx.raw[0]:ctx.raw);

function waterfallCfg(A,M,o){ o=o||{};
  const items=[{lib:['Provision',M.P.p],v:A.pA,tot:true},...A.B.map(b=>({lib:b.lib.replace(/ — /,'\n').replace(/\s\(.*\)$/,''),v:b.v,id:b.id})),{lib:['Provision',M.P.n],v:A.pS,tot:true}];
  const lo=Math.min(A.pA,A.pS,...(()=>{ let r=A.pA; return A.B.map(b=>(r+=b.v)); })()); const ymin=o.min!=null?o.min:Math.max(0,Math.floor(lo*0.8/Math.pow(10,Math.floor(Math.log10(Math.max(1,lo)))))*Math.pow(10,Math.floor(Math.log10(Math.max(1,lo)))));
  let run=0; const data=[], col=[];
  items.forEach((it,i)=>{ if(it.tot){ data.push([0,it.v]); col.push(i?C.eb:C.ebd); run=it.v; } else { data.push([run,run+it.v]); col.push(it.v>=0?C.up:C.dn); run+=it.v; } });
  const short={exit:['Sorties'],new:['Nouvelles','entrées'],vol:['Effet','volume'],rate:['Effet','couverture'],det:['Migrations','détérioration'],imp:['Migrations','amélioration'],unk:['Sans','stage']};
  return {type:'bar',data:{labels:items.map(it=>it.tot?it.lib:(short[it.id]||it.lib)),datasets:[{label:'Provision',data,backgroundColor:col,borderRadius:4,barPercentage:.72}]},
    options:{animation:o.print?false:undefined,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{ const it=items[c.dataIndex]; return ' '+(it.tot?fX(it.v)+' XOF':fSX(it.v)+' XOF'); }}},
      vlab:{fmt:(v,i)=>items[i].tot?fM(items[i].v):fS(items[i].v),val:(raw)=>raw[1]-raw[0]}},
      scales:{y:Object.assign({beginAtZero:false,min:ymin},axM),x:{grid:{display:false},ticks:{font:{size:10.5,weight:600},color:C.ink,maxRotation:0}}}}};
}

/* ---------- composants ---------- */
function kpi(o){ // {lbl, v, p, d, dp, kind:'inv'|'neutral', c, info, sm:[[l,v]...], vf}
  const [cls,ar]=dirIcon(o.d,o.base); const cc=o.kind==='neutral'?(cls==='fl'?'fl':'neu'):o.kind==='good'?(cls==='up'?'dn':cls==='dn'?'up':'fl'):cls;
  return `<div class="kpi" style="--c:${o.c||C.eb}"><div class="h">${o.lbl}${o.info?`<button class="i" data-info="${esc(o.info)}" title="Mode de calcul">ⓘ</button>`:''}</div>
  <div class="v">${o.v}</div><div class="p">${o.pl||'N-1'} : ${o.p}</div>
  <div class="d"><span class="chip ${cc}">${ar} ${o.dv}</span>${o.dp!=null?`<span class="chip ${cc}">${o.dp}</span>`:''}</div>
  ${o.sm?`<div class="sm">${o.sm.map(s=>`<div>${s[0]}<b>${s[1]}</b></div>`).join('')}</div>`:''}</div>`; }
function table(head,rows,o){ o=o||{}; // head: [lib, 'n'?]; rows: [[cells]], o.click(i)
  return `<div class="tw" ${o.h?`style="max-height:${o.h}px"`:''}><table class="t"><thead><tr>${head.map(h=>`<th class="${h[1]||''}">${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr class="${o.click?'ck':''} ${r.__cls||''}" ${o.click?`data-ri="${i}" data-tb="${o.id||''}"`:''}>${r.map((c,j)=>`<td class="${head[j]&&head[j][1]||''}">${c==null?'':c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }
const sec=(t,q,body)=>`<div class="sec"><h2>${t}</h2>${q?`<p class="q">${q}</p>`:''}${body}</div>`;
const card=(t,q,body,cls)=>`<div class="card ${cls||''}">${t?`<h3>${t}</h3>`:''}${q?`<p class="q">${q}</p>`:''}${body}</div>`;
const cv=(id,cls)=>`<div class="chart ${cls||''}"><canvas id="${id}"></canvas></div>`;
const dv=v=>`<span class="${v>0?'pos':v<0?'neg':''}">${fSX(v)}</span>`;
const dvm=v=>`<span class="${v>0?'pos':v<0?'neg':''}">${fS(v)}</span>`;
function pctTxt(r){ if(r.t==='N') return '<span class="tag">NEW</span>'; if(r.t==='X') return '<span class="tag" style="background:#9AA3B5;color:#fff">EXIT</span>';
  if(r.pA<T.pctFloor) return r.dP>0?'<span class="tag" style="background:#E8EEFA;color:#003DA5">FROM ZERO</span>':'<span class="nd">n.s.</span>'; return fSP(r.dP/r.pA,0); }
function bindTables(el,map){ el.querySelectorAll('tr[data-ri]').forEach(tr=>tr.onclick=()=>{ const f=map[tr.dataset.tb]; if(f) f(+tr.dataset.ri); }); }
function bindInfo(el){ el.querySelectorAll('[data-info]').forEach(b=>b.onclick=e=>{ e.stopPropagation(); openDrawer('MÉTHODE','Mode de calcul','',`<p>${b.dataset.info}</p>`+methodNote()); }); }
function methodNote(){ return `<div class="note" style="margin-top:12px">Toutes les valeurs sont recalculées dans le navigateur à partir des feuilles sources, sur le périmètre filtré. Voir la page <b>12 — Data Quality & Méthodologie</b> pour le détail des règles.</div>`; }

/* ---------- tiroir ---------- */
function openDrawer(tag,title,sub,html,after){ $('#drawer').hidden=false; $('#dTag').textContent=tag; $('#dTitle').textContent=title; $('#dSub').innerHTML=sub||''; $('#dBody').innerHTML=html; $('#drawer').classList.add('on'); $('#veil').hidden=false; if(after) after($('#dBody')); }
function closeDrawer(){ $('#drawer').classList.remove('on'); $('#drawer').hidden=true; $('#veil').hidden=true; S.charts=S.charts.filter(c=>{ if(c.canvas&&c.canvas.closest('#drawer')){ c.destroy(); return false; } return true; }); }

/* ---------- filtres ---------- */
const FDEF=[
  ['dt','Reporting date'],['sg','Segment'],['of','Agence / gestionnaire'],['st','Stage'],['pr','Produit'],['cy','Devise'],['sc','Secteur'],['q','Client · compte · contrat']];
function buildFilters(){
  const R=S.M.R, opts=f=>{ const m=new Map(); R.forEach(r=>{ const k=f(r)||'(non renseigné)'; m.set(k,(m.get(k)||0)+1); }); return [...m.entries()].sort((a,b)=>b[1]-a[1]); };
  const O={sg:opts(r=>r.sg),of:opts(r=>r.of),pr:opts(r=>r.pr),cy:opts(r=>r.cy),sc:opts(r=>r.sc)};
  const dates=S.M.rptDates.length?S.M.rptDates:[S.M.P.dN].filter(Boolean);
  let h=`<label>Reporting date<select data-f="dt">${dates.map(d=>`<option>${fD(d)}</option>`).join('')||'<option>—</option>'}</select></label>`;
  const sel=(k,lib,list)=>`<label>${lib}<select data-f="${k}"><option value="">Tous</option>${list.map(([v,n])=>`<option value="${esc(v)}">${esc(v)} (${fN(n)})</option>`).join('')}</select></label>`;
  h+=sel('sg','Segment',O.sg)+sel('of','Agence / gestionnaire',O.of)+
    `<label>Stage<select data-f="st"><option value="">Tous</option><option value="1">Stage 1</option><option value="2">Stage 2</option><option value="3">Stage 3</option><option value="D">Détériorations</option><option value="I">Améliorations</option><option value="N">Nouvelles entrées</option><option value="X">Sorties</option></select></label>`+
    sel('pr','Produit',O.pr)+sel('cy','Devise',O.cy)+sel('sc','Secteur',O.sc)+
    `<label>Client · compte · contrat<input data-f="q" placeholder="code, nom, n° compte…"></label><button class="btn reset" id="fReset">Réinitialiser</button><span id="fchips"></span>`;
  $('#filters').innerHTML=h;
  $$('#filters [data-f]').forEach(e=>{ const go=()=>{ if(e.dataset.f==='dt') return; S.f[e.dataset.f]=e.value.trim(); refresh(); }; if(e.tagName==='INPUT'){ let t; e.oninput=()=>{ clearTimeout(t); t=setTimeout(go,280); }; } else e.onchange=go; });
  $('#fReset').onclick=()=>{ S.f={}; $$('#filters [data-f]').forEach(e=>{ if(e.dataset.f!=='dt') e.value=''; }); refresh(); };
}
function fRows(){ const f=S.f, q=(f.q||'').toUpperCase(); const nd='(non renseigné)';
  return S.M.R.filter(r=>(!f.sg||(r.sg||nd)===f.sg)&&(!f.of||(r.of||nd)===f.of)&&(!f.pr||(r.pr||nd)===f.pr)&&(!f.cy||(r.cy||nd)===f.cy)&&(!f.sc||(r.sc||nd)===f.sc)
    &&(!f.st||(/^[123]$/.test(f.st)?String(r.sR)===f.st:r.dir===f.st))
    &&(!q||r.cu.includes(q)||r.ac.includes(q)||r.ct.includes(q)||r.nm.toUpperCase().includes(q)||r.gp.toUpperCase().includes(q))); }
function filterLabel(){ const L={sg:'Segment',of:'Gestionnaire',st:'Stage',pr:'Produit',cy:'Devise',sc:'Secteur',q:'Recherche'}; const sl={1:'S1',2:'S2',3:'S3',D:'Détériorations',I:'Améliorations',N:'Nouvelles entrées',X:'Sorties'};
  return Object.entries(S.f).filter(([k,v])=>v).map(([k,v])=>L[k]+' : '+(k==='st'?sl[v]:v)).join(' · '); }

/* ---------- navigation ---------- */
function buildNav(){ $('#nav').innerHTML=PAGES.map(p=>`<button data-p="${p[0]}"><span class="no">${p[1]}</span><span>${p[2]}</span></button>`).join('');
  $$('#nav button').forEach(b=>b.onclick=()=>go(b.dataset.p)); }
function go(p){ S.page=p; try{ history.replaceState(null,'','#'+p); }catch(e){} render(); window.scrollTo({top:0}); }
function refresh(){ S.A=compute(fRows()); const fl=filterLabel(); $('#fchips').textContent=fl?'Périmètre filtré : '+fmtCount():'' ; render(); }
const fmtCount=()=>fN(S.A.n)+' / '+fN(S.M.R.length)+' expositions';
function render(){ killCharts(); const pg=PAGES.find(p=>p[0]===S.page)||PAGES[0];
  $$('#nav button').forEach(b=>b.classList.toggle('on',b.dataset.p===pg[0])); $('#pageTitle').textContent=pg[3];
  const el=$('#view'); try{ PG[pg[0]](el,'v_'); bindInfo(el); }catch(e){ console.error(e); el.innerHTML=`<div class="note warn">Erreur d'affichage : ${esc(e.message)}</div>`; } }

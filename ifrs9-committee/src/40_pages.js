/* =====================================================================
   40 · les 13 vues du Comité
   Chaque vue : PG.x(el, p) — p = préfixe d'identifiants (écran ou impression)
   ===================================================================== */
const PG={};
const lblN=()=>S.M.P.n, lblP=()=>S.M.P.p;
function rowCells(r,A,withRank,i){ return [
  withRank?`<b>${i+1}</b>`:null, esc(r.nm||'—'), esc(r.cu), esc(r.ct), stB(r.t==='N'?'N':r.sA), stB(r.t==='X'?'X':r.sS),
  fX(r.oA), fX(r.oS), fX(r.pA), fX(r.pS), dv(r.dP), pctTxt(r), fP(A.dP?r.dP/A.dP:null,1)].filter((x,j)=>withRank||j>0); }
const HROW=[['Rang'],['Client'],['Code client'],['Compte / contrat'],['Stage N-1'],['Stage N'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ provision','n'],['Δ %','n'],['Contrib. Δ net','n']];
function openRow(r){ const A=S.A;
  openDrawer('CONTRAT',r.nm||r.cu||r.ct,`Client ${esc(r.cu)} · compte ${esc(r.ac)} · contrat ${esc(r.ct)}`,
  `<div class="grid g3" style="margin-bottom:12px">
    <div class="mini"><div class="l">Outstanding</div><div class="v">${fM(r.oS)}</div><div class="s">${lblP()} : ${fM(r.oA)} · ${fS(r.dO)}</div></div>
    <div class="mini"><div class="l">Provision</div><div class="v">${fM(r.pS)}</div><div class="s">${lblP()} : ${fM(r.pA)} · ${fS(r.dP)}</div></div>
    <div class="mini"><div class="l">Stage</div><div class="v">${stB(r.t==='N'?'N':r.sA)} → ${stB(r.t==='X'?'X':r.sS)}</div><div class="s">${r.dir==='D'?'Détérioration':r.dir==='I'?'Amélioration':r.dir==='S'?'Stable':r.t==='N'?'Nouvelle entrée':r.t==='X'?'Sortie':'Indéterminé'}</div></div></div>
  ${table([['Attribut'],['Valeur']],[
    ['Segment / produit / secteur',esc([r.sg,r.pr,r.sc].filter(Boolean).join(' · '))],['Gestionnaire',esc(r.of||'—')+(r.ofSrc==='client'?' <span class="nd">(déduit du client)</span>':'')],
    ['Groupe',esc(r.gp||'—')],['Devise',esc(r.cy||'—')],['Classification / FRR',esc((r.cl||'—')+' / '+(r.fr||'—'))],['Statut P/NP',esc(r.stt||'—')],
    ['PDO (montant / date)',r.pdo!=null?fX(r.pdo)+' / '+fD(r.dpdo):'—'],['Ototal portefeuille',fX(r.ot)],['Garanties (valeur locale)',fX(r.col)],
    ['STAGE_OVERRIDE / Stage portefeuille',(r.sO?'S'+r.sO:'—')+' / '+(r.sP?'S'+r.sP:'—')],
    ['Couverture N-1 → N',fP(ratio(r.pA,r.oA),2)+' → '+fP(ratio(r.pS,r.oS),2)],
    ['Effet volume / effet couverture',r.t==='C'?fSX(r.vol)+' / '+fSX(r.rate):'—'],
    ['Contribution à la variation nette',fP(A.dP?r.dP/A.dP:null,2)],
    ['Programme / description',esc([r.prog,r.desc].filter(Boolean).join(' · ')||'—')],
    ['Échéance',fD(r.mat)]])}
  <div class="toolbar" style="margin-top:12px"><button class="btn pri" id="dCli">Ouvrir la fiche client</button></div>
  ${(()=>{ const w=A.WL.filter(x=>x.r===r); return w.length?card('Alertes watchlist','',table([['Niveau'],['Règle'],['Constat']],w.map(x=>[`<span class="sev ${x.sev}">${x.sev}</span>`,esc(x.rule),`<span style="white-space:normal">${esc(x.why)}</span>`]))):''; })()}`,
  b=>{ const x=b.querySelector('#dCli'); if(x) x.onclick=()=>openClient(r.cu); }); }

function openClient(cu){ const A=S.A; const c=clientsOf(S.M.R.filter(r=>r.cu===cu))[0]; if(!c){ toast('Client introuvable'); return; }
  const rows=[...c.rows].sort((a,b)=>Math.abs(b.dP)-Math.abs(a.dP)); const W=A.WL.filter(w=>w.r.cu===cu);
  openDrawer('CLIENT',c.nm||cu,`Code client ${esc(cu)}${c.gp?' · groupe '+esc(c.gp):''} · ${esc(c.sg||'')} · ${esc(c.of||'')}`,
  `<div class="grid g4" style="margin-bottom:12px">
    <div class="mini"><div class="l">Outstanding</div><div class="v">${fM(c.oS)}</div><div class="s">${lblP()} ${fM(c.oA)} · ${fS(c.dO)}</div></div>
    <div class="mini"><div class="l">Provision</div><div class="v">${fM(c.pS)}</div><div class="s">${lblP()} ${fM(c.pA)} · ${fS(c.dP)}</div></div>
    <div class="mini"><div class="l">Stage le + dégradé</div><div class="v">${stB(c.sAx)} → ${stB(c.sSx)}</div><div class="s">${c.det} dégradation(s) · ${c.imp} amélioration(s)</div></div>
    <div class="mini"><div class="l">Contribution</div><div class="v">${fP(A.dP?c.dP/A.dP:null,1)}</div><div class="s">de la variation nette du périmètre</div></div></div>
  ${card('Historique du mouvement','Provision et Outstanding par contrat, '+lblP()+' → '+lblN(),cv('dCliCh','short'))}
  <div style="height:12px"></div>
  ${table([['Contrat'],['Produit'],['Stage N-1'],['Stage N'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ prov.','n'],['Δ %','n']],
    rows.map(r=>[esc(r.ct),esc(r.pr),stB(r.t==='N'?'N':r.sA),stB(r.t==='X'?'X':r.sS),fX(r.oA),fX(r.oS),fX(r.pA),fX(r.pS),dv(r.dP),pctTxt(r)]),{click:true,id:'cl'})}
  ${W.length?'<div style="height:12px"></div>'+card('Alertes watchlist ('+W.length+')','',table([['Niveau'],['Règle'],['Contrat'],['Constat']],W.map(x=>[`<span class="sev ${x.sev}">${x.sev}</span>`,esc(x.rule),esc(x.r.ct),`<span style="white-space:normal">${esc(x.why)}</span>`]))):''}`,
  b=>{ bindTables(b,{cl:i=>openRow(rows[i])}); const top=rows.slice(0,12);
    mk('dCliCh',{type:'bar',data:{labels:top.map(r=>r.ct),datasets:[{label:'Provision '+lblP(),data:top.map(r=>r.pA),backgroundColor:'#9DB3DE'},{label:'Provision '+lblN(),data:top.map(r=>r.pS),backgroundColor:C.eb},
      {label:'Outstanding '+lblN(),data:top.map(r=>r.oS),type:'line',borderColor:C.gold,backgroundColor:C.gold,yAxisID:'y2',pointRadius:3}]},
      options:{plugins:{tooltip:{callbacks:{label:ttM}}},scales:{y:axM,y2:Object.assign({position:'right',grid:{display:false}},{ticks:{callback:v=>fM(v,0)}}),x:{ticks:{font:{size:9}}}}}}); }); }

/* ===================== 01 EXECUTIVE SUMMARY ===================== */
PG.exec=(el,p)=>{ const A=S.A, M=S.M, P=M.P, K=keyMessages(A,M), I=insights(A,M);
  const k=(lbl,cur,prev,fm,o)=>kpi(Object.assign({lbl,v:fm(cur),p:fm(prev),d:cur-prev,base:prev,dv:o&&o.bp?fBp(cur-prev):fS(cur-prev),dp:o&&o.bp?null:fSP(pctCh(cur,prev))},o||{}));
  const stK=s=>{ const o=A.st[s]; return kpi({lbl:'Stage '+s,c:STC[s],v:fM(o.pS),p:fM(o.pA),d:o.dP,base:o.pA,dv:fS(o.dP),dp:fSP(pctCh(o.pS,o.pA)),
    info:`Provision Stage ${s} = Σ provision des contrats en Stage ${s} (N : colonne STAGE de « ${esc(M.roles.cur.name)} » ; N-1 : colonne STAGE de « ${esc(M.roles.prev.name)} »). Couverture = provision / Outstanding du stage.`,
    sm:[['Outstanding',fM(o.oS)],['Δ Outst.',fS(o.dO)],['Couverture',fP(o.cS,2)+' <span style="color:#8792AA">('+fBp((o.cS||0)-(o.cA||0))+')</span>']]}); };
  el.innerHTML=`
  <div class="hero sec"><div class="cols">
    <div><div class="lbl">PROVISION IFRS9 · ${P.N}</div><div class="big">${fM(A.pS)}<small>XOF</small></div>
      <div class="sub">${fX(A.pS)} XOF · ${lblP()} : ${fM(A.pA)}</div>
      <div class="delta">${A.dP>0?'↑':A.dP<0?'↓':'→'} ${fS(A.dP)} · ${fSP(pctCh(A.pS,A.pA))} MoM</div>
      <div class="sub" style="margin-top:12px">Couverture ${fP(A.cA,2)} → <b>${fP(A.cS,2)}</b> · Outstanding ${fM(A.oS)} (${fSP(pctCh(A.oS,A.oA))})</div>
      <div class="sub" style="margin-top:4px;color:#AFC0E3">${fN(A.nS)} expositions · ${fN(A.nClients)} clients${filterLabel()?' · '+esc(filterLabel()):''}</div></div>
    <div class="msgs">${K.slice(0,4).map(m=>`<div>${m}</div>`).join('')}</div></div></div>
  ${sec('Indicateurs clés','Valeur '+lblN()+' · valeur '+lblP()+' · Δ absolu · Δ % — ↑ hausse, ↓ baisse, → stable (±0,5 %).',`
    <div class="grid g4">
      ${k('Provision IFRS9',A.pS,A.pA,fM,{c:C.ebd,info:`Provision N = Σ « Impairment-pre » (feuille « ${esc(M.roles.cur.name)} »). Provision N-1 = Σ « Impairment (Manual Overrides) » (feuille « ${esc(M.roles.prev.name)} »).`})}
      ${k('Outstanding',A.oS,A.oA,fM,{kind:'neutral',c:C.eb,info:'Σ « OUTSTANDING BALANCE » (N) et Σ « Outstanding Balance » (N-1).'})}
      ${k('Coverage ratio',A.cS,A.cA,v=>fP(v,2),{bp:true,c:C.gold,info:'Provision / Outstanding, calculé sur le même périmètre pour chaque mois.'})}
      ${k('Nombre d\'expositions',A.nS,A.nA,fN,{kind:'neutral',dv:fSN(A.nS-A.nA),c:'#5A6785',info:'Nombre de contrats distincts (clé de rapprochement retenue) présents dans chaque mois.',sm:[['Nouvelles',fN(A.news.n)],['Sorties',fN(A.exits.n)],['Rapprochées',fN(A.R.filter(r=>r.t==='C').length)]]})}
    </div><div style="height:14px"></div>
    <div class="grid g4">${stK(1)}${stK(2)}${stK(3)}
      ${k('ECL moyen / exposition',A.avgS,A.avgA,v=>fM(v),{c:'#7FA6E8',info:'Provision totale / nombre d\'expositions du mois.'})}</div>`)}
  <div class="grid g64 sec">
    ${card('IFRS9 Bridge','Comment passe-t-on de la provision '+lblP()+' à la provision '+lblN()+' ? (décomposition exacte, contrat par contrat)',cv(p+'wf','tall'))}
    ${card('Ce que disent les données','Constats générés automatiquement à partir des agrégats',I.slice(0,6).map(insHtml).join('')||'<p class="nd">Aucun constat.</p>')}
  </div>
  <div class="grid g3 sec">
    ${card('Provision par stage','La hausse vient-elle du Stage 2 / 3 ?',cv(p+'stp'))}
    ${card('Migration nette','Le portefeuille s\'est-il dégradé ?',migSummary(A))}
    ${card('Concentration du mouvement','Quelques clients expliquent-ils la variation ?',concMini(A))}
  </div>`;
  mk(p+'wf',waterfallCfg(A,M));
  mk(p+'stp',{type:'bar',data:{labels:['Stage 1','Stage 2','Stage 3'],datasets:[{label:lblP(),data:[1,2,3].map(s=>A.st[s].pA),backgroundColor:'#AFC0E3',borderRadius:4},{label:lblN(),data:[1,2,3].map(s=>A.st[s].pS),backgroundColor:[C.s1,C.s2,C.s3],borderRadius:4}]},
    options:{plugins:{tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>fM(v,1),only:1}},scales:{y:axM,x:{grid:{display:false}}}}});
};
function insHtml(x){ const col={up:C.up,dn:C.dn,info:C.eb,warn:C.med}[x.lvl]; const ic={up:'↑',dn:'↓',info:'i',warn:'!'}[x.lvl];
  return `<div class="ins"><div class="ic" style="background:${col}">${ic}</div><div class="tx"><b>${x.title}</b><br>${x.text}<span class="ev">▸ ${x.ev}</span></div></div>`; }
function migSummary(A){ return `<div class="big3"><div class="mini"><div class="l" style="color:${C.up}">Détériorations</div><div class="v">${fN(A.det.n)}</div><div class="s">${fS(A.det.d)} · ${fM(A.det.oS)} outst.</div></div>
  <div class="mini"><div class="l" style="color:${C.dn}">Améliorations</div><div class="v">${fN(A.imp.n)}</div><div class="s">${fS(A.imp.d)} · ${fM(A.imp.oS)} outst.</div></div>
  <div class="mini"><div class="l">Net</div><div class="v">${fSN(A.netMig)}</div><div class="s">${fS(A.netMigP)}</div></div></div>
  <p style="margin:12px 0 0;font-size:13px">Net Stage Migration : <b style="color:${A.verdict==='détérioration'?C.up:A.verdict==='amélioration'?C.dn:C.mut}">${A.verdict.toUpperCase()}</b> — solde de ${fSN(A.notch)} cran(s) de stage sur ${fN(A.R.filter(r=>r.t==='C').length)} contrats rapprochés ; Outstanding net migré ${fS(A.netMigO)}.</p>
  <table class="t" style="margin-top:10px"><tbody>${['1>2','1>3','2>3','2>1','3>1','3>2'].map(m=>`<tr><td>${stB(+m[0])} → ${stB(+m[2])}</td><td class="n">${fN(A.migSub[m].n)}</td><td class="n">${dvm(A.migSub[m].d)}</td></tr>`).join('')}</tbody></table>`; }
function concMini(A){ return `<div class="big3"><div class="mini"><div class="l">Top 10 hausses</div><div class="v">${fP(A.top10Share,0)}</div><div class="s">de la hausse brute</div></div>
  <div class="mini"><div class="l">Top 10 baisses</div><div class="v">${fP(A.bot10Share,0)}</div><div class="s">de la baisse brute</div></div>
  <div class="mini"><div class="l">Top 10 clients</div><div class="v">${fP(A.conc[0].pS,0)}</div><div class="s">de la provision N</div></div></div>
  <p style="font-size:12.5px;margin:12px 0 4px">« Les 10 principales hausses représentent <b>${fP(A.top10Share,0)}</b> de la hausse totale (${fM(A.incTot)}). »</p>
  <p style="font-size:12.5px;margin:0">« Les 10 principales baisses représentent <b>${fP(A.bot10Share,0)}</b> de la baisse totale (${fM(Math.abs(A.decTot))}). »</p>
  <table class="t" style="margin-top:10px"><tbody>${A.clTop.slice(0,4).map(c=>`<tr class="ck" data-cu="${esc(c.cu)}"><td>${esc((c.nm||c.cu).slice(0,28))}</td><td class="n">${dvm(c.dP)}</td></tr>`).join('')}</tbody></table>`; }
document.addEventListener('click',e=>{ const t=e.target.closest('[data-cu]'); if(t&&!t.closest('#printArea')) openClient(t.dataset.cu); });

/* ===================== 02 IFRS9 BRIDGE ===================== */
PG.bridge=(el,p)=>{ const A=S.A, M=S.M;
  const rows=[[`<b>Provision ${lblP()}</b>`,fN(A.nA),`<b>${fX(A.pA)}</b>`,'','Σ Impairment (Manual Overrides) — feuille « '+esc(M.roles.prev.name)+' »'],
    ...A.B.map(b=>[b.lib,fN(b.n),dv(b.v),fP(A.dP?b.v/A.dP:null,1),b.how]),
    [`<b>Provision ${lblN()}</b>`,fN(A.nS),`<b>${fX(A.pS)}</b>`,'','Σ Impairment-pre — feuille « '+esc(M.roles.cur.name)+' »']];
  rows[rows.length-1].__cls='tot';
  const ND=[['Effet des overrides / ajustements manuels de '+lblN(),'La provision post-override de '+lblN()+' n\'est pas fournie (seul « Impairment-pre » l\'est) ; en '+lblP()+', « Model Output » = « Manual Overrides »'+(M.DQ.modelVsOvP===0?' (écart nul)':'')+'.'],
    ['Ventilation de l\'effet couverture entre PD, LGD, EAD et scénarios macro','Les paramètres de risque (PD, LGD, CCF, pondérations de scénarios) ne figurent pas dans le fichier.'],
    ['Nature des sorties (remboursement, radiation, cession, restructuration)','Aucune colonne ne qualifie le motif de sortie ; seule la provision N-1 libérée est mesurable.'],
    ['Effet change (devises)','Les cours de change N-1 / N ne sont pas fournis ; les montants sont exprimés en contre-valeur locale.']];
  el.innerHTML=`${sec('Bridge IFRS9','Décomposition additive et exhaustive : chaque contrat est affecté à une seule composante ; la somme des composantes égale la variation totale.',
    card('','',cv(p+'wf','tall')))}
  <div class="sec">${card('Composantes du mouvement','Montants en XOF — un clic sur une composante liste les contrats concernés',table([['Composante','w'],['Contrats','n'],['Montant','n'],['% du net','n'],['Mode de calcul','w']],rows,{click:true,id:'br'})
    +`<div class="note" style="margin-top:10px">Contrôle : Σ composantes = <b>${fSX(A.bSum)}</b> ; variation totale = <b>${fSX(A.dP)}</b> ; écart non rapproché = <b>${fX(A.bRes)}</b> XOF ${Math.abs(A.bRes)<1?'✔':'⚠'}.</div>`)}</div>
  <div class="sec">${card('Composantes non déterminables','Affichées comme telles plutôt que de créer une fausse attribution',`<div class="grid g4">${ND.map(x=>`<div class="mini"><div class="l">${x[0]}</div><div class="nd" style="margin:6px 0;font-size:12.5px">Non déterminable à partir des données disponibles</div><div class="s">${x[1]}</div></div>`).join('')}</div>`)}</div>
  ${sec('Détail des flux de stage','Contrats rapprochés N-1 / N : effet volume et effet couverture par flux.',card('','',table([['Flux'],['Nature'],['Contrats','n'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ provision','n'],['dont volume','n'],['dont couverture','n']],
    ['1>1','2>2','3>3','1>2','1>3','2>3','2>1','3>1','3>2'].map(m=>{ const o=A.migSub[m], a=+m[0], b=+m[2]; return [stB(a)+' → '+stB(b),b>a?'<span class="pos">Détérioration</span>':b<a?'<span class="neg">Amélioration</span>':'Stable',fN(o.n),fX(o.oA),fX(o.oS),fX(o.pA),fX(o.pS),dv(o.d),dv(o.vol),dv(o.rate)]; }))))}
  ${sec('Provision par stage','Bridge par stage : provision de chaque stage en '+lblP()+' et en '+lblN()+'.',card('','',cv(p+'sb')))}`;
  mk(p+'wf',waterfallCfg(A,M));
  mk(p+'sb',{type:'bar',data:{labels:['Stage 1','Stage 2','Stage 3'],datasets:[{label:'Provision '+lblP(),data:[1,2,3].map(s=>A.st[s].pA),backgroundColor:'#AFC0E3',borderRadius:4},{label:'Provision '+lblN(),data:[1,2,3].map(s=>A.st[s].pS),backgroundColor:C.eb,borderRadius:4},{label:'Δ',data:[1,2,3].map(s=>A.st[s].dP),backgroundColor:[1,2,3].map(s=>A.st[s].dP>=0?C.up:C.dn),borderRadius:4}]},
    options:{plugins:{tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>fM(v,1)}},scales:{y:axM,x:{grid:{display:false}}}}});
  const idmap=['_s',...A.B.map(b=>b.id),'_e'];
  bindTables(el,{br:i=>{ const id=idmap[i]; if(id[0]==='_') return; const f={exit:r=>r.t==='X',new:r=>r.t==='N',vol:r=>r.dir==='S',rate:r=>r.dir==='S',det:r=>r.dir==='D',imp:r=>r.dir==='I',unk:r=>r.dir==='U'}[id];
    const v={vol:r=>r.vol,rate:r=>r.rate}[id]||(r=>r.dP); listDrawer(A.B.find(b=>b.id===id).lib,A.R.filter(f),v); }});
};
function listDrawer(title,rows,val){ val=val||(r=>r.dP); const L=[...rows].sort((a,b)=>Math.abs(val(b))-Math.abs(val(a))); const top=L.slice(0,300);
  openDrawer('DÉTAIL',title,`${fN(rows.length)} contrats · total ${fSX(sum(rows,val))} XOF${rows.length>300?' · 300 plus forts mouvements affichés':''}`,
    table([['Client'],['Contrat'],['Stage N-1'],['Stage N'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Montant','n']],top.map(r=>[esc((r.nm||r.cu).slice(0,30)),esc(r.ct),stB(r.t==='N'?'N':r.sA),stB(r.t==='X'?'X':r.sS),fX(r.oS),fX(r.pA),fX(r.pS),dv(val(r))]),{click:true,id:'ld',h:2000}),
    b=>bindTables(b,{ld:i=>openRow(top[i])})); }

/* ===================== 03 STAGE MIGRATION ===================== */
PG.mig=(el,p)=>{ const A=S.A, met=S.opt.mx||'n';
  const MET={n:['Nb comptes',o=>o.n,fN],oS:['Outstanding N',o=>o.oS,v=>fM(v)],pA:['Provision N-1',o=>o.pA,v=>fM(v)],pS:['Provision N',o=>o.pS,v=>fM(v)],d:['Δ provision',o=>o.d,v=>fS(v)]};
  const rowsK=['1','2','3','N'], colsK=['1','2','3','X'], g=MET[met][1];
  const maxv=Math.max(1,...rowsK.flatMap(a=>colsK.map(b=>Math.abs(g(A.MX[a+'>'+b]||{n:0,oS:0,pA:0,pS:0,d:0})))));
  const cell=(a,b)=>{ const o=A.MX[a+'>'+b]||{n:0,oA:0,oS:0,pA:0,pS:0,d:0}; const v=g(o), t=Math.sqrt(Math.abs(v)/maxv);
    let base=a==='N'||b==='X'?[110,125,150]:a===b?[0,61,165]:(+b>+a?[179,38,30]:[31,122,90]); if(met==='d') base=v>0?[179,38,30]:v<0?[31,122,90]:[150,160,180];
    const al=0.08+0.82*t, fg=al>0.5?'#fff':C.ink;
    return `<td data-mx="${a}>${b}" style="background:rgba(${base.join(',')},${al.toFixed(2)});color:${fg}"><div class="a">${MET[met][2](v)}</div><div class="b">${met==='n'?fM(b==='X'?o.oA:o.oS)+' · '+fS(o.d):fN(o.n)+' cpt · '+fS(o.d)}</div></td>`; };
  const ov=ovStats(A.R); const ovP={}; A.R.filter(r=>r.t!=='X'&&r.sO!=null&&r.sS!=null).forEach(r=>{ const k=r.sS+'>'+r.sO; const o=ovP[k]||(ovP[k]={n:0,o:0,p:0}); o.n++; o.o+=r.oS; o.p+=r.pS; });
  el.innerHTML=`<div class="grid g64 sec">
    ${card('Matrice de migration '+lblP()+' → '+lblN(),'Lignes : stage '+lblP()+' (ou nouvelle entrée) · colonnes : stage '+lblN()+' (ou sortie). Rouge = détérioration, vert = amélioration. Cliquer une cellule pour la liste des comptes.',
      `<div class="toolbar"><div class="seg" id="${p}mxs">${Object.entries(MET).map(([k,v])=>`<button data-m="${k}" class="${k===met?'on':''}">${v[0]}</button>`).join('')}</div></div>
      <table class="mx"><thead><tr><th></th>${colsK.map(b=>`<th>${b==='X'?'SORTIE':lblN().toUpperCase()+' S'+b}</th>`).join('')}</tr></thead><tbody>
      ${rowsK.map(a=>`<tr><th class="rh">${a==='N'?'NOUVEAU':lblP().toUpperCase()+' S'+a}</th>${colsK.map(b=>a==='N'&&b==='X'?'<td style="background:#F3F5F9;cursor:default"></td>':cell(a,b)).join('')}</tr>`).join('')}</tbody></table>`)}
    ${card('Net Stage Migration','Solde des détériorations et des améliorations (contrats rapprochés)',migSummary(A))}</div>
  <div class="grid g2 sec">${card('Δ provision par flux de migration','Quels flux expliquent la variation ?',cv(p+'fl'))}
    ${card('Détériorations / améliorations','Nombre de comptes, Outstanding et provision',table([['Flux'],['Comptes','n'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ prov.','n']],
      ['1>2','1>3','2>3','2>1','3>1','3>2','1>1','2>2','3>3'].map(m=>{ const o=A.migSub[m]; return [stB(+m[0])+' → '+stB(+m[2]),fN(o.n),fM(o.oA),fM(o.oS),fM(o.pA),fM(o.pS),dvm(o.d)]; })))}</div>
  ${ov.n?sec('Gouvernance du staging','STAGE (colonne utilisée par le modèle et l\'Impairment-pre) comparé à STAGE_OVERRIDE (et au stage du portefeuille).',card('','',
    `<div class="note warn" style="margin-bottom:10px">${fN(ov.n)} contrats du périmètre ont un STAGE différent de STAGE_OVERRIDE (${fM(ov.o)} d'Outstanding, ${fM(ov.p)} de provision Impairment-pre). Dont <b>${fN(ov.n21)}</b> en S2 modèle / S1 override (${fM(ov.p21)}). L'impact d'une application des overrides n'est pas déterminable : la provision post-override de ${lblN()} n'est pas fournie.</div>`+
    table([['STAGE (modèle)'],['STAGE_OVERRIDE'],['Contrats','n'],['Outstanding N','n'],['Provision N (Impairment-pre)','n']],Object.entries(ovP).sort().map(([k,o])=>[stB(+k[0]),stB(+k[2]),fN(o.n),fX(o.o),fX(o.p)]).map((r,i,a)=>r))))
  :''}`;
  $$('#'+p+'mxs button').forEach(b=>b.onclick=()=>{ S.opt.mx=b.dataset.m; render(); });
  el.querySelectorAll('[data-mx]').forEach(td=>td.onclick=()=>{ const [a,b]=td.dataset.mx.split('>'); listDrawer('Flux '+(a==='N'?'NOUVEAU':'S'+a)+' → '+(b==='X'?'SORTIE':'S'+b),A.R.filter(r=>(r.t==='N'?'N':String(r.sA))===a&&(r.t==='X'?'X':String(r.sS))===b)); });
  const F=['1>2','1>3','2>3','2>1','3>1','3>2','1>1','2>2','3>3'];
  mk(p+'fl',{type:'bar',data:{labels:F.map(m=>'S'+m[0]+'→S'+m[2]),datasets:[{label:'Δ provision',data:F.map(m=>A.migSub[m].d),backgroundColor:F.map(m=>+m[2]>+m[0]?C.up:+m[2]<+m[0]?C.dn:C.sky),borderRadius:4}]},
    options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>fS(v,1)}},scales:{x:axM,y:{grid:{display:false}}}}});
};

/* ===================== 04 OUTSTANDING ===================== */
const DIMS={st:['Stage N',r=>r.sR?'Stage '+r.sR:''],sg:['Segment',r=>r.sg],pr:['Produit',r=>r.pr],cy:['Devise',r=>r.cy],of:['Gestionnaire',r=>r.of],sc:['Secteur',r=>r.sc],cl:['Classification',r=>r.cl],stt:['Statut P/NP',r=>r.stt]};
PG.out=(el,p)=>{ const A=S.A, dim=S.opt.od||'sg', RC=A.R.filter(r=>r.t==='C');
  const up=sum(RC,r=>r.dO>0?r.dO:0), dn=sum(RC,r=>r.dO<0?r.dO:0);
  const G=grp(A.R,DIMS[dim][1]).sort((a,b)=>b.oS-a.oS);
  const tU=[...RC].sort((a,b)=>b.dO-a.dO).slice(0,20).filter(r=>r.dO>0), tD=[...RC].sort((a,b)=>a.dO-b.dO).slice(0,20).filter(r=>r.dO<0);
  const oc=(r,i)=>[`<b>${i+1}</b>`,esc((r.nm||'—').slice(0,32)),esc(r.cu),esc(r.ct),stB(r.sA)+' '+stB(r.sS),fX(r.oA),fX(r.oS),`<b>${fSX(r.dO)}</b>`,fSP(pctCh(r.oS,r.oA),0),dv(r.dP)];
  const oh=[['Rang'],['Client'],['Code'],['Contrat'],['Stages'],['Outst. N-1','n'],['Outst. N','n'],['Δ Outstanding','n'],['Δ %','n'],['Impact provision','n']];
  const Q=A.Q, qd=(k,t,c,q)=>`<div class="mini" style="border-left:3px solid ${c}"><div class="l">${t}</div><div class="v">${fN(Q[k].n)}</div><div class="s">Outst. ${fS(Q[k].dO)} · prov. ${fS(Q[k].d)}</div><div class="s" style="margin-top:2px">${q}</div></div>`;
  el.innerHTML=`<div class="grid g4 sec">
    ${kpi({lbl:'Outstanding '+lblN(),v:fM(A.oS),p:fM(A.oA),d:A.dO,base:A.oA,dv:fS(A.dO),dp:fSP(pctCh(A.oS,A.oA)),kind:'neutral',info:'Σ OUTSTANDING BALANCE (N) vs Σ Outstanding Balance (N-1).'})}
    ${kpi({lbl:'Hausses (contrats rapprochés)',v:fM(up),p:fN(RC.filter(r=>r.dO>0).length)+' contrats',pl:'Nb',d:up,dv:fS(up),kind:'neutral',c:C.s1})}
    ${kpi({lbl:'Baisses (contrats rapprochés)',v:fM(dn),p:fN(RC.filter(r=>r.dO<0).length)+' contrats',pl:'Nb',d:dn,dv:fS(dn),kind:'neutral',c:C.sky})}
    ${kpi({lbl:'Entrées / sorties',v:fS(A.news.oS-A.exits.oA),p:fM(A.news.oS)+' entrées · '+fM(A.exits.oA)+' sorties',pl:'Détail',d:A.news.oS-A.exits.oA,dv:fN(A.news.n)+' / '+fN(A.exits.n)+' contrats',kind:'neutral',c:C.gold})}</div>
  <div class="grid g2 sec">${card('Pont de l\'Outstanding','De l\'Outstanding '+lblP()+' à l\'Outstanding '+lblN(),cv(p+'ob'))}
    ${card('Outstanding par stage','Structure du portefeuille '+lblP()+' vs '+lblN(),cv(p+'os'))}</div>
  ${sec('Quadrants Outstanding / provision','Contrats rapprochés : les mouvements atypiques sont ceux où provision et exposition évoluent en sens contraire.',`<div class="grid g64">
    ${card('','',cv(p+'sc','tall'))}<div class="grid" style="grid-template-columns:1fr 1fr;align-content:start">
    ${qd('uu','Outstanding ↑ · Provision ↑',C.s2,'Croissance avec risque')}${qd('ud','Outstanding ↑ · Provision ↓',C.up,'<b>Atypique</b> — couverture en baisse')}
    ${qd('du','Outstanding ↓ · Provision ↑',C.up,'<b>Atypique</b> — dégradation')}${qd('dd','Outstanding ↓ · Provision ↓',C.dn,'Amortissement normal')}
    <div class="mini" style="grid-column:span 2"><div class="l">Sans mouvement significatif</div><div class="v">${fN(Q.fl.n)}</div><div class="s">contrats dont l'Outstanding ou la provision est inchangé(e)</div></div></div></div>`)}
  ${sec('Ventilation','Outstanding '+lblP()+' / '+lblN()+' et impact provision par dimension.',card('',`<div class="seg" id="${p}ods">${Object.entries(DIMS).map(([k,v])=>`<button data-d="${k}" class="${k===dim?'on':''}">${v[0]}</button>`).join('')}</div>`,
    table([[DIMS[dim][0]],['Outst. N-1','n'],['Outst. N','n'],['Δ Outst.','n'],['Δ %','n'],['Δ provision','n'],['Couv. N-1','n'],['Couv. N','n']],G.slice(0,60).map(g=>[esc(g.k),fX(g.oA),fX(g.oS),dv(g.dO),fSP(pctCh(g.oS,g.oA),1),dv(g.d),fP(g.cA,2),fP(g.cS,2)]))))}
  <div class="grid g2 sec">${card('Top 20 augmentations d\'Outstanding','et impact sur la provision',table(oh,tU.map(oc),{click:true,id:'tu'}))}
    ${card('Top 20 diminutions d\'Outstanding','et impact sur la provision',table(oh,tD.map(oc),{click:true,id:'td'}))}</div>`;
  bindTables(el,{tu:i=>openRow(tU[i]),td:i=>openRow(tD[i])});
  $$('#'+p+'ods button').forEach(b=>b.onclick=()=>{ S.opt.od=b.dataset.d; render(); });
  const it=[['Outst. '+lblP(),A.oA,1],['Sorties',-A.exits.oA],['Entrées',A.news.oS],['Hausses',up],['Baisses',dn],['Outst. '+lblN(),A.oS,1]]; let run=0;
  const dd=it.map(x=>{ if(x[2]){ run=x[1]; return [0,x[1]]; } const a=[run,run+x[1]]; run+=x[1]; return a; });
  const lo=Math.min(...dd.map(d=>Math.min(d[0],d[1])).filter((v,i)=>!it[i][2]));
  mk(p+'ob',{type:'bar',data:{labels:it.map(x=>x[0]),datasets:[{label:'Outstanding',data:dd,backgroundColor:it.map(x=>x[2]?C.ebd:x[1]>=0?C.s1:C.sky),borderRadius:4}]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' '+fSX(it[c.dataIndex][1])}},vlab:{fmt:(v,i)=>it[i][2]?fM(it[i][1]):fS(it[i][1]),val:r=>r[1]-r[0]}},scales:{y:Object.assign({min:Math.max(0,lo*0.97)},axM),x:{grid:{display:false}}}}});
  mk(p+'os',{type:'bar',data:{labels:[lblP(),lblN()],datasets:[1,2,3].map(s=>({label:'Stage '+s,data:[A.st[s].oA,A.st[s].oS],backgroundColor:STC[s],borderRadius:3}))},
    options:{plugins:{tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>v>A.oS*0.08?fM(v,0):'',color:'#fff',val:v=>v}},scales:{x:{stacked:true,grid:{display:false}},y:Object.assign({stacked:true},axM)}}});
  const pts=[...RC].sort((a,b)=>(Math.abs(b.dP)+Math.abs(b.dO)/50)-(Math.abs(a.dP)+Math.abs(a.dO)/50)).slice(0,700);
  const qc=r=>r.dO>0&&r.dP>0?C.s2:r.dO>0&&r.dP<0?C.up:r.dO<0&&r.dP>0?'#8E1B14':r.dO<0&&r.dP<0?C.dn:'#9AA3B5';
  mk(p+'sc',{type:'scatter',data:{datasets:[{label:'Contrats',data:pts.map(r=>({x:r.dO,y:r.dP,r})),pointBackgroundColor:pts.map(qc),pointRadius:3.5,pointHoverRadius:6}]},
    options:{onClick:(e,a)=>{ if(a.length) openRow(pts[a[0].index]); },plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{ const r=c.raw.r; return [' '+(r.nm||r.cu)+' · '+r.ct,' Δ Outst. '+fS(r.dO)+' · Δ prov. '+fS(r.dP)]; }}}},
      scales:{x:Object.assign({title:{display:true,text:'Δ Outstanding'}},axM),y:Object.assign({title:{display:true,text:'Δ provision'}},axM)}}});
};

/* ===================== 05 PROVISION MOVEMENTS ===================== */
PG.mov=(el,p)=>{ const A=S.A, RC=A.R.filter(r=>r.t==='C');
  const stRows=[1,2,3].map(s=>{ const o=A.st[s]; return [stB(s),fN(o.nA),fN(o.nS),fX(o.oA),fX(o.oS),fX(o.pA),fX(o.pS),fP(o.cA,2),fP(o.cS,2),dv(o.dP),fP(A.dP?o.dP/A.dP:null,1)]; });
  const tr=['<b>Total</b>',fN(A.nA),fN(A.nS),fX(A.oA),fX(A.oS),fX(A.pA),fX(A.pS),fP(A.cA,2),fP(A.cS,2),dv(A.dP),'100 %']; tr.__cls='tot'; stRows.push(tr);
  const BK=[[-Infinity,-100e6,'< −100 M'],[-100e6,-25e6,'−100 / −25 M'],[-25e6,-10e6,'−25 / −10 M'],[-10e6,-1e6,'−10 / −1 M'],[-1e6,-1e5,'−1 M / −100 k'],[-1e5,-1,'−100 k / 0'],[-1,1,'0'],[1,1e5,'0 / 100 k'],[1e5,1e6,'100 k / 1 M'],[1e6,10e6,'1 / 10 M'],[10e6,25e6,'10 / 25 M'],[25e6,100e6,'25 / 100 M'],[100e6,Infinity,'> 100 M']];
  const hist=BK.map(b=>{ const x=A.R.filter(r=>r.dP>=b[0]&&r.dP<b[1]); return {l:b[2],n:x.length,s:sum(x,r=>r.dP)}; });
  const cum=(L,tot)=>{ let c=0; return L.slice(0,50).map(r=>{ c+=r.dP; return tot?c/tot:0; }); };
  const D=['sg','pr','sc','cy'].map(k=>({k,G:grp(A.R,DIMS[k][1]).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,8)}));
  el.innerHTML=`${sec('Vue par stage','Nombre d\'expositions, Outstanding, provision, couverture et variation — '+lblP()+' vs '+lblN()+'.',card('','',table([['Stage'],['Nb N-1','n'],['Nb N','n'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Couv. N-1','n'],['Couv. N','n'],['Δ provision','n'],['Part du Δ','n']],stRows)))}
  <div class="grid g3 sec">${card('Structure du portefeuille par stage','Part de l\'Outstanding',cv(p+'s1'))}${card('Structure de la provision par stage','Part de la provision',cv(p+'s2'))}${card('Contribution des stages au Δ','La hausse vient-elle du Stage 2 / 3 ou d\'une autre dynamique ?',cv(p+'s3'))}</div>
  <div class="grid g2 sec">${card('Distribution des variations de provision','Nombre de contrats par tranche de Δ provision (barres) et montant (ligne)',cv(p+'h'))}
    ${card('Courbe de concentration','Part cumulée de la hausse (resp. baisse) brute expliquée par les N premiers contrats et clients',cv(p+'cc'))}</div>
  ${sec('Δ provision par dimension','Principales contributions (en valeur absolue) par segment, produit, secteur et devise.',`<div class="grid g2">${D.map(d=>card(DIMS[d.k][0],'',table([[DIMS[d.k][0]],['Δ prov.','n'],['Part','n']],d.G.map(g=>[esc(String(g.k).slice(0,24)),dvm(g.d),fP(A.dP?g.d/A.dP:null,0)])))).join('')}</div>`)}`;
  const pie=(id,vals,lab)=>mk(id,{type:'bar',data:{labels:[lblP(),lblN()],datasets:[1,2,3].map(s=>({label:'Stage '+s,data:vals(s),backgroundColor:STC[s]}))},options:{plugins:{tooltip:{callbacks:{label:c=>' Stage '+(c.datasetIndex+1)+' : '+fP(c.raw,1)}},vlab:{fmt:v=>v>0.07?fP(v,0):'',color:'#fff'}},scales:{x:{stacked:true,grid:{display:false}},y:Object.assign({stacked:true,max:1},axP)}}});
  pie(p+'s1',s=>[ratio(A.st[s].oA,A.oA),ratio(A.st[s].oS,A.oS)]); pie(p+'s2',s=>[ratio(A.st[s].pA,A.pA),ratio(A.st[s].pS,A.pS)]);
  mk(p+'s3',{type:'bar',data:{labels:['Stage 1','Stage 2','Stage 3'],datasets:[{label:'Δ provision',data:[1,2,3].map(s=>A.st[s].dP),backgroundColor:[1,2,3].map(s=>STC[s]),borderRadius:4}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:ttM}},vlab:{fmt:(v)=>fS(v,1)+(A.dP?' ('+fP(v/A.dP,0)+')':'')}},scales:{y:axM,x:{grid:{display:false}}}}});
  mk(p+'h',{type:'bar',data:{labels:hist.map(h=>h.l),datasets:[{label:'Nb contrats',data:hist.map(h=>h.n),backgroundColor:BK.map(b=>b[0]>=1?C.up:b[1]<=-1?C.dn:'#9AA3B5'),borderRadius:3},{type:'line',label:'Montant Δ',data:hist.map(h=>h.s),yAxisID:'y2',borderColor:C.gold,backgroundColor:C.gold,pointRadius:3}]},
    options:{plugins:{tooltip:{callbacks:{label:c=>c.datasetIndex?' Montant : '+fS(c.raw):' '+fN(c.raw)+' contrats'}}},scales:{y:{type:'logarithmic',title:{display:true,text:'contrats (échelle log)'},grid:{color:'#EEF1F6'}},y2:Object.assign({position:'right',grid:{display:false}},{ticks:{callback:v=>fM(v,0)}}),x:{ticks:{font:{size:9.5}},grid:{display:false}}}}});
  const xs=[...Array(50)].map((_,i)=>i+1);
  mk(p+'cc',{type:'line',data:{labels:xs,datasets:[{label:'Hausses — contrats',data:cum(A.top,A.incTot),borderColor:C.up,pointRadius:0},{label:'Hausses — clients',data:cum(A.clTop,A.incTot),borderColor:C.up,borderDash:[5,4],pointRadius:0},
    {label:'Baisses — contrats',data:cum(A.bot,A.decTot),borderColor:C.dn,pointRadius:0},{label:'Baisses — clients',data:cum(A.clBot,A.decTot),borderColor:C.dn,borderDash:[5,4],pointRadius:0}]},
    options:{plugins:{tooltip:{callbacks:{title:c=>'Top '+c[0].label,label:c=>' '+c.dataset.label+' : '+fP(c.raw,0)}}},scales:{y:Object.assign({min:0,max:1},axP),x:{title:{display:true,text:'N premiers'},grid:{display:false},ticks:{maxTicksLimit:10}}}}});
};

/* ===================== 06 / 07 TOP INCREASES / DECREASES ===================== */
function topPage(el,p,inc){ const A=S.A, mode=S.opt.tm||'ct';
  const tot=inc?A.incTot:A.decTot, L=mode==='ct'?(inc?A.top:A.bot).slice(0,20):(inc?A.clTop:A.clBot).slice(0,20), share=mode==='ct'?(inc?A.top10Share:A.bot10Share):(inc?A.clTop10Share:A.clBot10Share);
  const pc=A.R.filter(r=>r.t==='C'&&r.pA>=T.pctFloor&&(inc?r.dP>0:r.dP<0)).sort((a,b)=>inc?b.dP/b.pA-a.dP/a.pA:a.dP/a.pA-b.dP/b.pA).slice(0,10);
  const fz=A.R.filter(r=>inc?(r.dP>0&&(r.t==='N'||r.pA<T.pctFloor)):false);
  const rowsCt=L.map((r,i)=>[`<b>${i+1}</b>`,esc(r.nm||'—'),esc(r.cu),esc(r.ct),stB(r.t==='N'?'N':r.sA),stB(r.t==='X'?'X':r.sS),fX(r.oA),fX(r.oS),fX(r.pA),fX(r.pS),dv(r.dP),pctTxt(r),fP(tot?r.dP/tot:null,1),fP(A.dP?r.dP/A.dP:null,1)]);
  const rowsCl=L.map((c,i)=>[`<b>${i+1}</b>`,esc(c.nm||'—'),esc(c.cu),fN(c.n)+' contrat(s)',stB(c.sAx),stB(c.sSx),fX(c.oA),fX(c.oS),fX(c.pA),fX(c.pS),dv(c.dP),c.pA>=T.pctFloor?fSP(c.dP/c.pA,0):'<span class="tag">'+(c.pA?'FROM ZERO':'NEW')+'</span>',fP(tot?c.dP/tot:null,1),fP(A.dP?c.dP/A.dP:null,1)]);
  const H=[['Rang'],['Client'],['Code client'],['Compte / contrat'],['Stage N-1'],['Stage N'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ provision','n'],['Δ %','n'],[inc?'Part hausse brute':'Part baisse brute','n'],['Contrib. Δ net','n']];
  const word=inc?'hausses':'baisses';
  el.innerHTML=`<div class="hero sec" style="padding:16px 22px"><div class="lbl">TOP CONTRIBUTORS TO PROVISION ${inc?'INCREASE':'DECREASE'}</div>
    <div style="font-size:20px;font-weight:700;margin-top:6px">« Les 10 principales ${word} ${mode==='ct'?'(contrats)':'(clients)'} représentent ${fP(share,0)} de la ${inc?'hausse':'baisse'} totale. »</div>
    <div class="sub" style="margin-top:6px">${inc?'Hausse':'Baisse'} brute : ${fS(tot)} sur ${fN((inc?A.top:A.bot).length)} contrats · variation nette ${fS(A.dP)} · contribution = variation individuelle / ${inc?'hausse':'baisse'} brute (et / variation nette).</div></div>
  <div class="toolbar"><div class="seg" id="${p}tm"><button data-m="ct" class="${mode==='ct'?'on':''}">Par contrat</button><button data-m="cl" class="${mode==='cl'?'on':''}">Par client</button></div></div>
  <div class="grid g64 sec">${card('Top 20 '+word+' de provision','Tri par variation de provision '+(inc?'décroissante':'croissante')+' — clic : fiche détaillée',table(H,mode==='ct'?rowsCt:rowsCl,{click:true,id:'tp'}))}
    ${card('Classement','Δ provision des 20 premiers',cv(p+'hb','tall'))}</div>
  <div class="grid sec">${card('Top 10 plus fortes '+word+' en %','Provision '+lblP()+' ≥ '+fM(T.pctFloor)+' XOF (en dessous, le % n\'est pas significatif : affiché NEW / FROM ZERO)',
      table([['Client'],['Contrat'],['Stages'],['Prov. N-1','n'],['Prov. N','n'],['Δ','n'],['Δ %','n']],pc.map(r=>[esc((r.nm||r.cu).slice(0,30)),esc(r.ct),stB(r.sA)+' '+stB(r.sS),fX(r.pA),fX(r.pS),dv(r.dP),`<b>${fSP(r.dP/r.pA,0)}</b>`]),{click:true,id:'pc'}))}
    ${inc?card('NEW / FROM ZERO','Hausses dont la base '+lblP()+' est nulle ou non significative — exclues du classement en %',`<div class="big3"><div class="mini"><div class="l">Nouveaux contrats</div><div class="v">${fN(fz.filter(r=>r.t==='N').length)}</div><div class="s">${fS(sum(fz.filter(r=>r.t==='N'),r=>r.dP))}</div></div><div class="mini"><div class="l">From zero</div><div class="v">${fN(fz.filter(r=>r.t!=='N').length)}</div><div class="s">${fS(sum(fz.filter(r=>r.t!=='N'),r=>r.dP))}</div></div><div class="mini"><div class="l">Part de la hausse</div><div class="v">${fP(A.incTot?sum(fz,r=>r.dP)/A.incTot:null,0)}</div><div class="s">brute</div></div></div>`)
      :card('Sorties du portefeuille','Contrats sortis : la provision '+lblP()+' est intégralement libérée',`<div class="big3"><div class="mini"><div class="l">Contrats sortis</div><div class="v">${fN(A.exits.n)}</div><div class="s">${fM(A.exits.oA)} d'Outstanding N-1</div></div><div class="mini"><div class="l">Provision libérée</div><div class="v">${fS(-A.exits.pA)}</div><div class="s">${fP(A.decTot?-A.exits.pA/A.decTot:null,0)} de la baisse brute</div></div><div class="mini"><div class="l">Motif</div><div class="v" style="font-size:13px">Non déterminable</div><div class="s">aucune colonne de motif</div></div></div>`)}</div>`;
  $$('#'+p+'tm button').forEach(b=>b.onclick=()=>{ S.opt.tm=b.dataset.m; render(); });
  bindTables(el,{tp:i=>mode==='ct'?openRow(L[i]):openClient(L[i].cu),pc:i=>openRow(pc[i])});
  mk(p+'hb',{type:'bar',data:{labels:L.map(x=>String(x.nm||x.cu||x.ct).slice(0,22)),datasets:[{label:'Δ provision',data:L.map(x=>x.dP),backgroundColor:inc?C.up:C.dn,borderRadius:3}]},
    options:{indexAxis:'y',onClick:(e,a)=>{ if(a.length){ const x=L[a[0].index]; mode==='ct'?openRow(x):openClient(x.cu); } },plugins:{legend:{display:false},tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>fS(v,1)}},scales:{x:axM,y:{ticks:{font:{size:9.5}},grid:{display:false}}}}});
}
PG.inc=(el,p)=>topPage(el,p,true); PG.dec=(el,p)=>topPage(el,p,false);

/* ===================== 08 SEGMENTS ===================== */
PG.seg=(el,p)=>{ const A=S.A, dim=S.opt.sd||'sg'; const G=grp(A.R,DIMS[dim][1]).sort((a,b)=>b.d-a.d);
  const mix=g=>{ const t=g.oS||1; return `<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;min-width:110px">${[1,2,3].map(s=>`<i title="S${s} ${fP(g.st[s].o/t,1)}" style="width:${(g.st[s].o/t*100).toFixed(2)}%;background:${STC[s]}"></i>`).join('')}</div><div style="font-size:10px;color:${C.mut}">${[1,2,3].map(s=>'S'+s+' '+fP(g.st[s].o/t,0)).join(' · ')}</div>`; };
  el.innerHTML=`<div class="toolbar"><div class="seg" id="${p}sd">${['sg','pr','sc','cl','cy'].map(k=>`<button data-d="${k}" class="${k===dim?'on':''}">${DIMS[k][0]}</button>`).join('')}</div><span class="note">Segments présents dans les données : ${esc(grp(S.M.R,r=>r.sg).map(g=>g.k).join(', '))}</span></div>
  ${sec(DIMS[dim][0]+'s — contribution à la variation','Outstanding, provision, couverture, stage mix (Outstanding N) et variation de provision, classés par contribution.',card('','',
    table([[DIMS[dim][0]],['Nb N','n'],['Outst. N-1','n'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Couv. N-1','n'],['Couv. N','n'],['Stage mix N'],['Δ provision','n'],['Contrib. Δ','n'],['Dégrad.','n']],
      G.slice(0,80).map(g=>[`<b>${esc(g.k)}</b>`,fN(g.nS),fX(g.oA),fX(g.oS),fX(g.pA),fX(g.pS),fP(g.cA,2),fP(g.cS,2),mix(g),dv(g.d),fP(A.dP?g.d/A.dP:null,1),fN(g.det)]),{click:true,id:'sg'})))}
  <div class="grid g2 sec">${card('Ranking des contributions','Δ provision par '+DIMS[dim][0].toLowerCase(),cv(p+'rk','tall'))}
    ${card('Exposition, couverture et mouvement','Abscisse : Outstanding N · ordonnée : couverture N · taille : |Δ provision| (rouge hausse, vert baisse)',cv(p+'bb','tall'))}</div>`;
  $$('#'+p+'sd button').forEach(b=>b.onclick=()=>{ S.opt.sd=b.dataset.d; render(); });
  bindTables(el,{sg:i=>{ const g=G[i]; listDrawer(DIMS[dim][0]+' '+g.k,A.R.filter(r=>(DIMS[dim][1](r)||'(non renseigné)')===g.k)); }});
  const g15=[...G].sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,15);
  mk(p+'rk',{type:'bar',data:{labels:g15.map(g=>String(g.k).slice(0,26)),datasets:[{label:'Δ provision',data:g15.map(g=>g.d),backgroundColor:g15.map(g=>g.d>=0?C.up:C.dn),borderRadius:3}]},options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{label:ttM}},vlab:{fmt:v=>fS(v,1)}},scales:{x:axM,y:{grid:{display:false}}}}});
  const mx=Math.max(1,...G.map(g=>Math.abs(g.d)));
  mk(p+'bb',{type:'bubble',data:{datasets:G.slice(0,40).map(g=>({label:g.k,data:[{x:g.oS,y:g.cS||0,r:4+22*Math.sqrt(Math.abs(g.d)/mx)}],backgroundColor:(g.d>=0?'rgba(179,38,30,.45)':'rgba(31,122,90,.45)'),borderColor:g.d>=0?C.up:C.dn}))},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>{ const g=G[c.datasetIndex]; return [' '+g.k,' Outst. '+fM(g.oS)+' · couv. '+fP(g.cS,2),' Δ prov. '+fS(g.d)]; }}}},scales:{x:Object.assign({type:'logarithmic',title:{display:true,text:'Outstanding N (log)'}},axM),y:Object.assign({title:{display:true,text:'Couverture N'}},axP)}}});
};

/* ===================== 09 AGENCIES ===================== */
PG.agc=(el,p)=>{ const A=S.A, M=S.M; const G=grp(A.R,r=>r.of);
  const tH=[...G].sort((a,b)=>b.d-a.d).slice(0,10).filter(g=>g.d>0), tB=[...G].sort((a,b)=>a.d-b.d).slice(0,10).filter(g=>g.d<0);
  const tD=[...G].sort((a,b)=>b.det-a.det).slice(0,10).filter(g=>g.det>0), tO=[...G].sort((a,b)=>b.dO-a.dO).slice(0,10).filter(g=>g.dO>0);
  const HM=[...G].sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,20);
  const cols=[['Δ prov. S1',g=>g.st[1].p-g.stA[1].p],['Δ prov. S2',g=>g.st[2].p-g.stA[2].p],['Δ prov. S3',g=>g.st[3].p-g.stA[3].p],['Δ Outstanding',g=>g.dO],['Δ provision',g=>g.d],['Dégradations',g=>g.det],['Entrées',g=>g.news],['Sorties',g=>g.exits]];
  const mxc=cols.map(c=>Math.max(1,...HM.map(g=>Math.abs(c[1](g)))));
  const hc=(v,j)=>{ const t=Math.sqrt(Math.abs(v)/mxc[j]); const cnt=j>=5; const rgb=cnt?[0,61,165]:v>0?(j===3?[47,111,214]:[179,38,30]):(j===3?[127,166,232]:[31,122,90]); const al=0.06+0.8*t;
    return `<td class="n" style="background:rgba(${rgb.join(',')},${al.toFixed(2)});color:${al>0.5?'#fff':C.ink}">${cnt?fN(v):fS(v,1)}</td>`; };
  const ranking=(t,q,L,f,col)=>card(t,q,`<table class="t"><tbody>${L.map((g,i)=>`<tr class="ck" data-of="${esc(g.k)}"><td><b>${i+1}</b></td><td>${esc(g.k)}</td><td class="n">${f(g)}</td><td style="width:90px"><div class="bar"><i style="width:${(Math.abs(L[0]?f.raw(g)/f.raw(L[0]):0)*100).toFixed(1)}%;background:${col}"></i></div></td></tr>`).join('')||'<tr><td class="nd">Aucun</td></tr>'}</tbody></table>`);
  const fd=Object.assign(g=>dvm(g.d),{raw:g=>g.d}), fdet=Object.assign(g=>fN(g.det)+' cpt · '+fS(g.st[2].p+g.st[3].p-g.stA[2].p-g.stA[3].p),{raw:g=>g.det}), fo=Object.assign(g=>fS(g.dO),{raw:g=>g.dO});
  el.innerHTML=`<div class="note warn sec">Le fichier ne contient pas de colonne « Agence ». La dimension de rattachement utilisée est <b>Account Officer</b> (feuille « ${esc(M.roles.pf?M.roles.pf.name:'—')} »), jointe par contrat ; pour un contrat sorti, le gestionnaire est déduit du client lorsqu'il a encore un contrat en portefeuille (${fN(M.DQ.officerViaClient)} cas), sinon « non renseigné » (${fN(M.DQ.officerND)} cas).</div>
  <div class="grid g2 sec">${ranking('Top hausses de provision','',tH,fd,C.up)}${ranking('Top baisses de provision','',tB,fd,C.dn)}${ranking('Top détériorations de stage','Nb de contrats dégradés · Δ prov. S2+S3',tD,fdet,C.s2)}${ranking('Top hausses d\'Outstanding','',tO,fo,C.s1)}</div>
  ${sec('Heatmap des gestionnaires','20 gestionnaires aux plus forts mouvements de provision — intensité proportionnelle à l\'amplitude de chaque colonne.',card('','',
    `<div class="tw"><table class="t"><thead><tr><th>Gestionnaire</th>${cols.map(c=>`<th class="n">${c[0]}</th>`).join('')}<th class="n">Couv. N</th></tr></thead><tbody>${HM.map(g=>`<tr class="ck" data-of="${esc(g.k)}"><td>${esc(g.k)}</td>${cols.map((c,j)=>hc(c[1](g),j)).join('')}<td class="n">${fP(g.cS,2)}</td></tr>`).join('')}</tbody></table></div>`))}
  ${sec('Tous les gestionnaires','',card('','',table([['Gestionnaire'],['Nb N','n'],['Outst. N','n'],['Δ Outst.','n'],['Prov. N','n'],['Δ provision','n'],['Contrib.','n'],['Couv. N','n'],['Dégrad.','n']],[...G].sort((a,b)=>b.d-a.d).map(g=>[esc(g.k),fN(g.nS),fX(g.oS),dv(g.dO),fX(g.pS),dv(g.d),fP(A.dP?g.d/A.dP:null,1),fP(g.cS,2),fN(g.det)]),{h:480})))}`;
  el.querySelectorAll('[data-of]').forEach(t=>t.onclick=()=>{ const k=t.dataset.of; listDrawer('Gestionnaire '+k,A.R.filter(r=>(r.of||'(non renseigné)')===k)); });
};

/* ===================== 10 CLIENT INTELLIGENCE ===================== */
PG.cli=(el,p)=>{ const A=S.A, q=(S.opt.cq||'').toUpperCase().trim();
  let res=[]; if(q.length>=2){ const M2=new Map(); for(const r of S.M.R){ if(r.cu.includes(q)||r.ac.includes(q)||r.ct.includes(q)||r.nm.toUpperCase().includes(q)){ if(!M2.has(r.cu)) M2.set(r.cu,[]); M2.get(r.cu).push(r); } if(M2.size>60) break; }
    res=[...M2.keys()].map(cu=>clientsOf(S.M.R.filter(r=>r.cu===cu))[0]).filter(Boolean); }
  const byP=[...A.CL].sort((a,b)=>b.pS-a.pS).slice(0,20);
  el.innerHTML=`<div class="card sec"><h3>Recherche client</h3><p class="q">Code client, nom du client, numéro de compte ou de contrat (recherche sur l'ensemble du portefeuille, hors filtres).</p>
    <input id="${p}cq" value="${esc(S.opt.cq||'')}" placeholder="code client, nom, n° de compte ou de contrat…" style="width:100%;font:inherit;font-size:15px;padding:12px 14px;border:1px solid var(--line);border-radius:10px">
    <div id="${p}cr" style="margin-top:12px">${q.length<2?'<p class="nd">Saisir au moins 2 caractères.</p>':res.length?table([['Client'],['Code client'],['Contrats','n'],['Stage N-1 → N'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ provision','n'],['Contrib.','n']],
      res.map(c=>[esc(c.nm||'—'),esc(c.cu),fN(c.n),stB(c.sAx)+' → '+stB(c.sSx),fX(c.oS),fX(c.pA),fX(c.pS),dv(c.dP),fP(A.dP?c.dP/A.dP:null,2)]),{click:true,id:'cr'}):'<p class="nd">Aucun résultat.</p>'}</div></div>
  ${sec('Concentration','Part des 10 / 20 / 50 premiers clients (classés par provision N ; pour le Δ, par mouvement absolu).',`<div class="grid g64">${card('','',table([['Périmètre'],['Part Outstanding N','n'],['Part provision N','n'],['Part hausse brute','n'],['Part mouvement brut |Δ|','n']],A.conc.map(c=>['<b>Top '+c.n+' clients</b>',fP(c.oS,1),fP(c.pS,1),fP(c.dInc,1),fP(c.dAbs,1)])))}
    <div class="grid" style="grid-template-columns:1fr 1fr;align-content:start"><div class="mini"><div class="l">Provision Concentration Ratio</div><div class="v">${fP(A.conc[0].pS,1)}</div><div class="s">provision des 10 premiers clients / provision totale</div></div>
    <div class="mini"><div class="l">Top 10 Contribution Ratio</div><div class="v">${fP(A.clTop10Share,1)}</div><div class="s">hausse des 10 premiers clients / hausse brute</div></div>
    <div class="mini"><div class="l">HHI provision (clients)</div><div class="v">${A.hhi==null?'—':(A.hhi*10000).toLocaleString('fr-FR',{maximumFractionDigits:0})}</div><div class="s">${A.hhi==null?'':A.hhi<0.01?'faible concentration':A.hhi<0.15?'concentration modérée':'forte concentration'} (échelle 0–10 000)</div></div>
    <div class="mini"><div class="l">Clients</div><div class="v">${fN(A.nClients)}</div><div class="s">${lblP()} : ${fN(A.nClientsA)}</div></div></div></div>`)}
  ${sec('Top 20 clients par provision '+lblN(),'',card('','',table([['Rang'],['Client'],['Code'],['Contrats','n'],['Stage N-1 → N'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ provision','n'],['Part provision','n']],
    byP.map((c,i)=>[`<b>${i+1}</b>`,esc(c.nm||'—'),esc(c.cu),fN(c.n),stB(c.sAx)+' → '+stB(c.sSx),fX(c.oS),fX(c.pA),fX(c.pS),dv(c.dP),fP(A.pS?c.pS/A.pS:null,1)]),{click:true,id:'tc'})))}`;
  const inp=$('#'+p+'cq'); let t; inp.oninput=()=>{ clearTimeout(t); t=setTimeout(()=>{ S.opt.cq=inp.value; render(); const n=$('#'+p+'cq'); if(n){ n.focus(); n.setSelectionRange(n.value.length,n.value.length); } },300); };
  bindTables(el,{cr:i=>openClient(res[i].cu),tc:i=>openClient(byP[i].cu)});
};

/* ===================== 11 WATCHLIST ===================== */
PG.wl=(el,p)=>{ const A=S.A, W=A.WL, sv=S.opt.wsev||'', ru=S.opt.wru||'';
  const rules=[...new Set(W.map(w=>w.rule))]; const L=W.filter(w=>(!sv||w.sev===sv)&&(!ru||w.rule===ru)); const show=L.slice(0,400);
  const card4=s=>{ const x=W.filter(w=>w.sev===s); return `<div class="kpi" style="--c:var(--${s==='CRITICAL'?'crit':s==='HIGH'?'high':s==='MEDIUM'?'med':'low'});cursor:pointer" data-sev="${s}"><div class="h">${s}</div><div class="v">${fN(x.length)}</div><div class="p">${fN(new Set(x.map(w=>w.r.k)).size)} contrats · Δ prov. ${fS(sum([...new Map(x.map(w=>[w.r.k,w.r])).values()],r=>r.dP))}</div></div>`; };
  el.innerHTML=`<div class="grid g4 sec">${['CRITICAL','HIGH','MEDIUM','LOW'].map(card4).join('')}</div>
  <div class="grid g64 sec">${card('Alertes par règle','Règles appliquées automatiquement (seuils en page 12)',table([['Règle'],['CRITICAL','n'],['HIGH','n'],['MEDIUM','n'],['LOW','n'],['Total','n']],rules.map(r=>{ const x=W.filter(w=>w.rule===r); return [`<a href="#" data-ru="${esc(r)}">${esc(r)}</a>`,...['CRITICAL','HIGH','MEDIUM','LOW'].map(s=>fN(x.filter(w=>w.sev===s).length)),`<b>${fN(x.length)}</b>`]; })))}
    ${card('Responsables','Répartition des alertes CRITICAL + HIGH par équipe',table([['Équipe'],['Alertes','n']],Object.entries(W.filter(w=>w.sev==='CRITICAL'||w.sev==='HIGH').reduce((o,w)=>{ w.owner.split(' · ').forEach(t=>o[t]=(o[t]||0)+1); return o; },{})).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[esc(k),fN(v)])))}</div>
  <div class="toolbar"><span class="tag">FILTRE</span> ${sv?`<span class="sev ${sv}">${sv}</span>`:'Tous niveaux'} · ${ru?esc(ru):'Toutes règles'} <button class="btn" id="${p}wr">Effacer</button><span class="note">${fN(L.length)} alertes${L.length>show.length?' — '+show.length+' premières affichées (export Excel : intégralité)':''}</span></div>
  ${card('','',table([['Niveau'],['Règle'],['Client'],['Code'],['Contrat'],['Stages'],['Outst. N','n'],['Prov. N-1','n'],['Prov. N','n'],['Δ prov.','n'],['Constat'],['Responsable']],
    show.map(w=>[`<span class="sev ${w.sev}">${w.sev}</span>`,esc(w.rule),esc((w.r.nm||'—').slice(0,28)),esc(w.r.cu),esc(w.r.ct),stB(w.r.t==='N'?'N':w.r.sA)+' '+stB(w.r.t==='X'?'X':w.r.sS),fX(w.r.oS),fX(w.r.pA),fX(w.r.pS),dv(w.r.dP),`<span style="white-space:normal;display:inline-block;min-width:240px">${esc(w.why)}</span>`,esc(w.owner)]),{click:true,id:'wl',h:640}))}`;
  el.querySelectorAll('[data-sev]').forEach(b=>b.onclick=()=>{ S.opt.wsev=S.opt.wsev===b.dataset.sev?'':b.dataset.sev; render(); });
  el.querySelectorAll('[data-ru]').forEach(b=>b.onclick=e=>{ e.preventDefault(); S.opt.wru=b.dataset.ru; render(); });
  $('#'+p+'wr').onclick=()=>{ S.opt.wsev=''; S.opt.wru=''; render(); };
  bindTables(el,{wl:i=>openRow(show[i].r)});
};

/* ===================== 12 DATA QUALITY & MÉTHODOLOGIE ===================== */
PG.dq=(el,p)=>{ const M=S.M, D=M.DQ, K=M.K, P=M.P;
  const ok=b=>b?'<span class="chip dn">✔ conforme</span>':'<span class="chip up">⚠ à examiner</span>';
  const mapT=(role)=>{ const t=M.roles[role]; if(!t) return '<p class="nd">Feuille absente.</p>'; const m=role==='pf'?M.E.pf.map:M.E[role].map; return table([['Champ normalisé'],['Colonne source'],['N° colonne','n']],Object.keys(SPEC[role].cols).map(k=>[k,m[k]!=null?esc(t.header[m[k]]):'<span class="nd">non trouvée</span>',m[k]!=null?String(m[k]+1):'—'])); };
  const col=D.score>=85?C.dn:D.score>=70?C.med:C.up;
  el.innerHTML=`<div class="grid g2 sec">
    <div class="hero"><div class="lbl">DATA QUALITY SCORE</div><div class="big">${D.score}<small>/ 100</small></div>
      <div style="height:10px;background:rgba(255,255,255,.12);border-radius:6px;overflow:hidden;margin:8px 0 12px"><i style="display:block;height:100%;width:${D.score}%;background:${col}"></i></div>
      <div class="sub">Clé de rapprochement retenue : <b style="color:#fff">${esc(K.lib)}</b> — unique dans les deux mois, ${fN(K.match)} contrats rapprochés (${fP(K.rateC,1)} de ${P.n}, ${fP(K.rateP,1)} de ${P.p}).</div>
      <div class="sub" style="margin-top:6px">${M.log.map(esc).join(' · ')}${M.src.embedded?' · données préchargées depuis « '+esc(M.src.source)+' »':' · fichier « '+esc(M.src.source)+' »'}</div></div>
    ${card('Contrôle de cohérence des totaux','Recalcul indépendant à partir des feuilles sources',table([['Contrôle','w'],['Valeur (XOF)','n'],['Statut']],[
      ['Total provision '+P.p+' (Σ Impairment (Manual Overrides))',fX(D.totA),''],['Total provision '+P.n+' (Σ Impairment-pre)',fX(D.totS),''],
      ['Variation totale ('+P.n+' − '+P.p+')',`<b>${fSX(D.dTot)}</b>`,''],['Σ des variations individuelles (table analytique)',fSX(D.dIndiv),''],
      ['Écart non rapproché',`<b>${fX(D.res)}</b>`,ok(Math.abs(D.res)<1)],['Total Outstanding '+P.p+' / '+P.n,fM(D.outA)+' / '+fM(D.outS),''],
      [`Σ composantes du bridge (périmètre complet) = variation`,fSX(M.Afull.bSum),ok(Math.abs(M.Afull.bRes)<1)]]))}</div>
  ${sec('Contrôles de qualité','Aucune ligne n\'est supprimée ; les anomalies sont signalées, jamais masquées.',card('','',table([['Contrôle','w'],[P.n,'n'],[P.p,'n'],['Statut']],[
    ['Lignes lues (en-tête auto-détecté, dernière ligne auto-détectée)',fN(D.sheets[0].rows),fN(D.sheets[1].rows),''],
    ['Clients distincts',fN(D.nCurCli),fN(D.nPrevCli),''],['Comptes distincts',fN(D.nCurAcc),fN(D.nPrevAcc),''],
    ['Doublons sur la clé retenue',fN(D.dupC),fN(D.dupP),ok(D.dupC+D.dupP===0)],
    ['Stage manquant',fN(D.nullC.stage),fN(D.nullP.stage),ok(D.nullC.stage+D.nullP.stage===0)],
    ['Outstanding manquant',fN(D.nullC.out),fN(D.nullP.out),ok(D.nullC.out+D.nullP.out===0)],
    ['Provision manquante',fN(D.nullC.imp),fN(D.nullP.imp),ok(D.nullC.imp+D.nullP.imp===0)],
    ['Code client manquant',fN(D.nullC.cust),fN(D.nullP.cust),ok(D.nullC.cust+D.nullP.cust===0)],
    ['Segment / produit manquant',fN(D.nullC.seg+D.nullC.prod),fN(D.nullP.seg+D.nullP.prod),ok(D.nullC.seg+D.nullC.prod+D.nullP.seg+D.nullP.prod===0)],
    ['Contrats rapprochés '+P.p+' ↔ '+P.n,fN(D.matched),fN(D.matched),''],
    ['Comptes nouveaux (absents en '+P.p+')',fN(D.news),'—','<span class="chip neu">information</span>'],['Comptes sortis (absents en '+P.n+')','—',fN(D.exits),'<span class="chip neu">information</span>'],
    ['Clients non rapprochés (nouveaux / sortis)',fN(D.cliNew),fN(D.cliExit),'<span class="chip neu">information</span>'],
    ['Contrats IFRS9 absents du portefeuille',fN(D.curNotPf),'—',ok(D.curNotPf===0)],
    ['Lignes du portefeuille absentes de la base IFRS9 '+P.n,fN(D.pfNotCur)+' ('+fM(D.pfNotCurOut)+' Ototal)','—',ok(D.pfNotCur===0)],
    ['Outstanding IFRS9 = Ototal portefeuille (±1 XOF)',fP(D.otEq,1)+' des '+fN(D.otN),'—',ok(D.otEq>0.99)],
    ['STAGE ≠ STAGE_OVERRIDE (N)',D.hasOv?fN(D.ovDiff):'colonne absente','—',ok(!D.ovDiff)],
    ['Provision > Outstanding',fN(D.impGtOut),'—',ok(D.impGtOut===0)],['Montants négatifs',fN(D.neg),'',ok(D.neg===0)],
    ['Outstanding nul',fN(D.zeroOut),'—','<span class="chip neu">information</span>'],['Stage 3 sans provision',fN(D.s3NoProv),'—',ok(D.s3NoProv===0)],
    ['Segment / produit / client différent entre les deux mois (même contrat)',fN(D.attrChg.seg)+' / '+fN(D.attrChg.prod)+' / '+fN(D.attrChg.cust),'—','<span class="chip neu">information</span>'],
    [P.p+' : Impairment (Model Output) vs (Manual Overrides)','—',D.modelVsOvP==null?'—':'écart '+fX(D.modelVsOvP),'<span class="chip neu">information</span>']]))) }
  <div class="grid g2 sec">${card('Calcul du score /100','100 − Σ (poids × taux d\'anomalie plafonné à 1)',table([['Critère','w'],['Poids','n'],['Taux','n'],['Pénalité','n']],D.pen.map(x=>[x.lib,fN(x.w),fP(x.x,1),'−'+x.pts.toLocaleString('fr-FR',{maximumFractionDigits:1})])))}
    ${card('Sélection de la clé de rapprochement','Toutes les clés candidates sont testées ; la clé retenue est unique dans les deux mois et maximise le rapprochement',table([['Clé candidate','w'],['Uniques N','n'],['Doublons N','n'],['Uniques N-1','n'],['Doublons N-1','n'],['Rapprochés','n'],['Retenue']],M.KS.map(k=>[esc(k.lib),fN(k.uniqC),fN(k.dupC),fN(k.uniqP),fN(k.dupP),fN(k.match),k.id===K.id?'<span class="chip dn">✔</span>':''])))}</div>
  ${sec('Traçabilité des colonnes','Correspondance automatique entre les champs du moteur et les colonnes du fichier (insensible à l\'ordre des colonnes, aux accents et à la casse).',`<div class="grid g3">${card('« '+esc(M.roles.cur.name)+' » ('+P.n+')','',mapT('cur'))}${card('« '+esc(M.roles.prev.name)+' » ('+P.p+')','',mapT('prev'))}${card('« '+esc(M.roles.pf?M.roles.pf.name:'—')+' » (portefeuille)','',mapT('pf'))}</div>`)}
  ${sec('Calculation Methodology','Comment chaque indicateur est calculé.',card('','',methodology()))}`;
};
function methodology(){ const M=S.M, P=M.P; const li=a=>'<ul>'+a.map(x=>`<li style="margin:4px 0">${x}</li>`).join('')+'</ul>';
  return `<div class="grid g2"><div>
  <h3 style="color:${C.ebd};font-size:13px">Sources et clé</h3>${li([`Provision ${P.n} = Σ « Impairment-pre » de la feuille « ${esc(M.roles.cur.name)} ».`,`Provision ${P.p} = Σ « Impairment (Manual Overrides) » de la feuille « ${esc(M.roles.prev.name)} ».`,
    `Stage ${P.n} = colonne STAGE (cohérente avec Impairment-pre) ; STAGE_OVERRIDE est affiché séparément (gouvernance). Stage ${P.p} = colonne STAGE.`,
    `Clé de rapprochement : ${esc(M.K.lib)} (testée automatiquement — voir tableau). Enrichissement portefeuille par jointure sur ${M.pfJoin==='contract'?'CONTRACT_ID':'ACCOUNT_NO'} = « Contracts/Accounts ».`,
    'Identifiants normalisés (texte, sans espaces, sans « .0 », majuscules) ; montants normalisés (séparateurs, espaces insécables) ; dates converties (Excel, ISO, jj/mm/aaaa).',
    'Agence : absente du fichier → Account Officer utilisé comme dimension de rattachement.'])}
  <h3 style="color:${C.ebd};font-size:13px">Bridge IFRS9 (décomposition exacte)</h3>${li(['Sorties = − provision N-1 des contrats absents en N ; Nouvelles entrées = + provision N des contrats absents en N-1.',
    'Contrats rapprochés à stage inchangé : Δ = ΔOutstanding × couverture N-1 (<b>effet volume</b>) + Outstanding N × Δcouverture (<b>effet couverture / paramètres</b>). Si Outstanding N-1 = 0, tout le Δ est affecté à l\'effet couverture.',
    'Contrats rapprochés dont le stage change : Δ provision affecté à « détérioration » (S1→S2, S1→S3, S2→S3) ou « amélioration » (S2→S1, S3→S1, S3→S2).',
    'Contrôle : Σ composantes = provision N − provision N-1 (écart affiché). Les effets non mesurables (overrides N, PD/LGD/macro, motif des sorties, change) sont déclarés « non déterminables ».'])}
  </div><div>
  <h3 style="color:${C.ebd};font-size:13px">Indicateurs</h3>${li(['Coverage ratio = provision / Outstanding (même périmètre, même mois).','Δ % = (N − N-1) / |N-1| ; « → stable » si |Δ %| < 0,5 %.',
    `Δ % individuel : calculé seulement si la provision N-1 ≥ ${fX(T.pctFloor)} XOF ; sinon « NEW » (nouveau contrat) ou « FROM ZERO ».`,
    'Contribution = variation individuelle / variation pertinente (hausse brute pour les hausses, baisse brute pour les baisses, et variation nette).',
    'Concentration : part cumulée des N premiers ; Provision Concentration Ratio = provision des 10 premiers clients / provision totale ; Top 10 Contribution Ratio = hausse des 10 premiers clients / hausse brute ; HHI = Σ (part de provision client)².',
    'Net Stage Migration = nb dégradations − nb améliorations ; verdict selon l\'Outstanding net migré ; solde en crans = Σ (stage N − stage N-1).',
    'Quadrants : signe de ΔOutstanding et de Δprovision pour chaque contrat rapproché (|Δ| < 1 XOF = inchangé).'])}
  <h3 style="color:${C.ebd};font-size:13px">Seuils de la watchlist (XOF)</h3>${li([`S1→S3 : CRITICAL · S2→S3 : CRITICAL si Δ ≥ ${fM(T.s23Crit)}, sinon HIGH · S1→S2 : HIGH si Δ ≥ ${fM(T.migMat)}, sinon MEDIUM.`,
    `Hausse de provision : ≥ ${fM(T.provHi[0])} CRITICAL, ≥ ${fM(T.provHi[1])} HIGH, ≥ ${fM(T.provHi[2])} MEDIUM · baisse : ≤ −${fM(T.provLo[0])} HIGH, ≤ −${fM(T.provLo[1])} MEDIUM.`,
    `Outstanding : hausse ≥ ${fM(T.outHi[0])} HIGH / ≥ ${fM(T.outHi[1])} MEDIUM ; baisse ≤ −${fM(T.outLo[0])} MEDIUM / ≤ −${fM(T.outLo[1])} LOW.`,
    `Sens contraires : |ΔOutstanding| ≥ ${fP(T.divPct,0)} et ≥ ${fM(T.divAbs)} avec provision de sens opposé : HIGH.`,
    `Nouveaux comptes : provision ≥ ${fM(T.newProv[0])} CRITICAL, ≥ ${fM(T.newProv[1])} HIGH · sorties : provision N-1 ≥ ${fM(T.exitProv[0])} HIGH, ≥ ${fM(T.exitProv[1])} MEDIUM.`,
    'STAGE ≠ STAGE_OVERRIDE : HIGH si provision ≥ 10 M, MEDIUM si ≥ 1 M, sinon LOW · données incohérentes / manquantes : MEDIUM ou LOW.'])}
  </div></div>`; }

/* ===================== 13 COMMITTEE PACK ===================== */
PG.pack=(el,p)=>{ const A=S.A, M=S.M, QA=committeeQA(A,M), K=keyMessages(A,M), I=insights(A,M);
  el.innerHTML=`<div class="hero sec"><div class="cols"><div><div class="lbl">ECOBANK SÉNÉGAL · COMITÉ IFRS9</div><div class="big" style="font-size:30px">IFRS9 Committee Pack</div><div class="sub">${M.P.P} → <b>${M.P.N}</b>${filterLabel()?' · '+esc(filterLabel()):' · périmètre banque'}</div>
    <div class="toolbar" style="margin-top:14px"><button class="btn gold" id="${p}pdf">⎙ PDF / impression</button><button class="btn" id="${p}ppt">▤ PowerPoint</button><button class="btn" id="${p}xl">⤓ Excel</button></div></div>
    <div><div class="lbl">PROVISION ${M.P.N}</div><div class="big">${fM(A.pS)}<small>XOF</small></div><div class="delta">${fS(A.dP)} · ${fSP(pctCh(A.pS,A.pA))} vs ${M.P.p}</div></div></div></div>
  ${sec('Les 7 questions du Comité','Réponses calculées à partir des données — chaque chiffre est traçable dans les pages détaillées.',QA.map(([k,s,a])=>`<div class="qa"><div class="k">${k}<small>${s}</small></div><div class="a"><ul>${a.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`).join(''))}
  <div class="grid g2 sec">${card('Key Committee Messages','Générés automatiquement',`<ol style="margin:0;padding-left:20px">${K.map(m=>`<li style="margin:6px 0">${m}</li>`).join('')}</ol>`)}
    ${card('Insights','Chaque constat est associé à une donnée chiffrée',I.map(insHtml).join(''))}</div>
  ${card('IFRS9 Bridge','',cv(p+'wf','tall'))}`;
  mk(p+'wf',waterfallCfg(A,M));
  const b=id=>$('#'+p+id); if(b('pdf')){ b('pdf').onclick=printPack; b('ppt').onclick=exportPptx; b('xl').onclick=exportXlsx; }
};

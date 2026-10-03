# Couche sémantique avancée et analyses avancées dans tous les exports (selon les données présentes)
e=open('ri_engine.js',encoding='utf-8').read()
def re_(a,b):
    global e
    assert e.count(a)==1,a[:90]; e=e.replace(a,b)
# ---- modèle : stress narratif, bénéficiaires liés, ordre des constats et phrase de lecture ----
re_("  const ins=riInsights({K,KP,wf,flow,t10,cl,up,nPrev,watch,cured,seg,off,risky,M,P,top10,J,tsL});",
r"""  const SCN={retard_paiements_etat:'Paiements de l\'État',campagne_agricole:'Campagne agricole',choc_hydrocarbures:'Hydrocarbures',hausse_taux:'Taux BCEAO',choc_sanitaire:'Crise sanitaire',perte_donneur_ordre:'Perte d\'un donneur d\'ordre',prix_importation:'Prix à l\'importation',gouvernance_fraude:'Gouvernance / fraude'};
  const odds=(p,f)=>typeof jevOdds==='function'?jevOdds(p,f):p;
  const scen=Object.entries(SCN).map(([k,l])=>{ const ex=cl.filter(o=>o.ts&&o.ts.scen&&(o.ts.scen[k]||0)>=0.6), base=ex.reduce((s2,o)=>s2+(o.pd12!=null?o.pd12:0)*o.enc,0), str=ex.reduce((s2,o)=>s2+(o.pd12!=null?odds(o.pd12,2):0)*o.enc,0);
    return {k,l,n:ex.length,enc:ex.reduce((s2,o)=>s2+o.enc,0),pdo:ex.reduce((s2,o)=>s2+o.pdo,0),base,str,top:[...ex].sort((a,b)=>b.enc-a.enc).slice(0,4).map(o=>o.rel)}; }).filter(x=>x.n).sort((a,b)=>b.enc-a.enc);
  const PF=(typeof TSX!=='undefined'&&TSX.pf)?TSX.pf:null, paires=[]; let lecture=null;
  if(PF){ Object.keys(PF).filter(k=>/^groupe_/.test(k)).forEach(k=>{ const a=PF[k], id=k.slice(7), nm=PF['meme_nom_'+id], ab=String(a.lib||'').split(' ↔ '), ca=cl.find(o=>o.rel===ab[0]), cb=cl.find(o=>o.rel===ab[1]);
      paires.push({a:ab[0]||'',b:ab[1]||'',score:+a.rep,conf:a.conf,pNom:nm?+nm.rep:null,enc:(ca?ca.enc:0)+(cb?cb.enc:0),pdo:(ca?ca.pdo:0)+(cb?cb.pdo:0)}); });
    paires.sort((x,y)=>y.score-x.score); if(PF.phrase_lecture&&(PF.phrase_lecture.conf||0)>=0.55) lecture=String(PF.phrase_lecture.rep).padStart(2,'0'); }
  const ins=riInsights({K,KP,wf,flow,t10,cl,up,nPrev,watch,cured,seg,off,risky,M,P,top10,J,tsL,scen});
  if(PF){ ins.forEach(x=>{ const a=PF['importance_'+x.n]; if(a){ x.imp=+a.rep; x.impConf=a.conf; } x.lecture=x.n===lecture; }); ins.sort((a,b)=>(b.lecture?1:0)-(a.lecture?1:0)||(b.imp??-1)-(a.imp??-1)); }""")
re_("top10,t10,top5,top5P,hhi,rm,ctl,ins,lostCli,tsL,","top10,t10,top5,top5P,hhi,rm,ctl,ins,lostCli,tsL,scen,paires,lecture,")
# ---- tableau en blocs fusionnés sur la grille des feuilles ----
re_("function riRisk(B,m,nav){",r"""function riBoxTable(sh,r,spec,rows,o){ o=o||{}; sh.h(r,o.hh||26);
  spec.forEach(([t,c0,c1,al])=>sh.box(r,c0,r,c1,t,{fill:{c:o.hdr||RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:al||'left',wrap:1,indent:al?0:1,v:'center'},bd:{bottom:['medium',RP.gold]}}));
  rows.forEach((row,i)=>{ const y=r+1+i, z=i%2?RP.pale:RP.white; sh.h(y,o.rh||20);
    spec.forEach(([t,c0,c1,al,f],j)=>{ let st={fill:{c:z},font:RI_F({sz:8.5,color:RP.ink}),al:{h:al||'left',indent:al?0:1,wrap:1,v:'center'},bd:{bottom:['thin','E6EDF7']}};
      if(f==='bold') st.font=RI_F({b:1,sz:8.5,color:RP.deep}); if(f==='md') st=Object.assign(st,{nf:RI_NFM,font:RI_F({b:1,sz:8.5,color:RP.deep})}); if(f==='mdc') st=Object.assign(st,{nf:RI_NFM,font:RI_F({b:1,sz:9,color:RP.crit})});
      if(f==='%') st.nf='0.0%'; if(f==='n') st.nf='#,##0'; if(f==='lec') st.font=RI_F({b:1,sz:8.5,color:row[j]==='Lien probable'?RP.alert:RP.eb}); if(f==='sc') st.font=RI_F({b:1,sz:9,color:row[j]>=1.5?RP.crit:row[j]>=1?RP.alert:RP.ink2});
      sh.box(y,c0,y,c1,row[j],st); }); });
  return r+rows.length; }
function riRisk(B,m,nav){""")
# ---- insights 09 et 10 ----
re_("  if(m.tsL&&m.tsL.length){ const T=m.tsL,",r"""  if(m.scen&&m.scen.length){ const s0=m.scen[0];
    I.push({n:'09',t:'STRESS NARRATIF',big:fmtN(s0.n)+' dossiers · '+s0.l,c:RP.alert,p:`${fmtN(s0.n)} dossiers sont directement exposés au scénario « ${s0.l} » pour ${riMd(s0.enc)} XOF d'encours (exposition jugée par l'analyse sémantique). Sous stress ×2 (EXPERT), les entrées en douteux attendues passent de ${riMd(s0.base)} à ${riMd(s0.str)} XOF (calcul Risk Outlook).${m.scen.length>1?' Autres scénarios : '+m.scen.slice(1,4).map(x=>x.l+' ('+x.n+')').join(', ')+'.':''}`}); }
  if(m.J&&m.J.adv){ const A=m.J.adv;
    I.push({n:'10',t:'ANALYSES AVANCÉES',big:'Guérison 31-60 j = '+riPct(A.cure[0]),c:RP.cyan,p:`Un client sain met en moyenne ${A.ttd?A.ttd[0].toFixed(0):'—'} mois avant le défaut (MARKOV). Probabilité de guérison : ${riPct(A.cure[0])} depuis 31-60 j, ${riPct(A.cure[1])} depuis 61-90 j. PD 12M : IC 90 % ${riPct(A.boot.lo)} – ${riPct(A.boot.hi)} (SIMULATED). ${A.back?'Backtest : '+A.back.exp.toFixed(1).replace('.',',')+' entrées prévues contre '+A.back.obs+' observées.':''} Un facteur ×${A.rev.factor.toFixed(2).replace('.',',')} sur les dégradations double la PD (STRESS).`}); }
  if(m.tsL&&m.tsL.length){ const T=m.tsL,""")
# ---- RISK : stress narratif ----
re_("  r=riSection(sh,r,0,23,'DISTRIBUTION PAR TRANCHE'",r"""  if(m.scen&&m.scen.length){ sh.brk(r); r=riSection(sh,r,0,23,'STRESS NARRATIF · SCÉNARIOS MACRO','exposition jugée par l\'analyse sémantique · montants et PD calculés par le code (stress ×2 EXPERT)',RP.alert);
    r=riBoxTable(sh,r,[['Scénario',0,4,null,'bold'],['Dossiers',5,6,'center','n'],['Encours exposé',7,9,'right','md'],['Impayés exposés',10,12,'right','md'],['Douteux attendus 12M · base',13,15,'right','md'],['· sous stress ×2',16,18,'right','mdc'],['Principaux dossiers',19,23]],m.scen.map(x=>[x.l,x.n,x.enc,x.pdo,x.base,x.str,x.top.slice(0,3).map(t=>String(t).slice(0,22)).join(', ')]),{rh:30,hh:30});
    sh.h(r+1,26).box(r+1,0,r+1,23,'Lecture : un dossier est « exposé » quand l\'analyse sémantique juge, avec une probabilité ≥ 0,60, que le scénario toucherait directement ses revenus ou sa capacité de remboursement (vulnérabilité, pas cause actuelle). Les encours, impayés et entrées en douteux attendues (PD 12M Risk Outlook × encours ; stress ×2 sur les cotes, EXPERT) sont calculés par le code.',{font:RI_F({sz:7.5,i:1,color:RP.neu}),al:{h:'left',wrap:1,indent:1}}); r+=1;
    sh.chart({type:'bar',cats:m.scen.map(x=>x.l),nf:RI_NFM,hideVal:true,series:[{name:'Encours exposé',v:m.scen.map(x=>x.enc),color:RP.alert,labels:{val:1,nf:RI_NFM,sz:750,col:RP.deep}}],max:Math.max(...m.scen.map(x=>x.enc))*1.25||1},r+1,0,r+13,24); r+=15; }
  r=riSection(sh,r,0,23,'DISTRIBUTION PAR TRANCHE'""")
# ---- CONCENTRATION : bénéficiaires potentiellement liés ----
re_("  sh.brk(r); r=riSection(sh,r,0,11,'TOP SEGMENTS'",r"""  if(m.paires&&m.paires.some(p=>p.score>=1||(p.pNom||0)>=0.6)){ const pl=m.paires.filter(p=>p.score>=1||(p.pNom||0)>=0.6);
    r=riSection(sh,r,0,23,'BÉNÉFICIAIRES POTENTIELLEMENT LIÉS','paires de noms repérées par le code · lien jugé par l\'analyse sémantique · expositions cumulées par le code',RP.gold);
    r=riBoxTable(sh,r,[['Contrepartie A',0,5,null,'bold'],['Contrepartie B',6,11,null,'bold'],['Lien (0 à 2)',12,13,'center','sc'],['Même famille',14,15,'center','%'],['Lecture',16,18,'center','lec'],['Encours cumulé',19,21,'right','md'],['Part de l\'encours',22,23,'center','%']],pl.map(p=>[p.a,p.b,p.score,p.pNom,p.score>=1.1&&(p.pNom||0)>=0.6?'Lien probable':'À vérifier',p.enc,p.enc/(m.K.enc||1)]),{rh:20,hh:30});
    sh.h(r+1,26).box(r+1,0,r+1,23,'Lien : 0 = entités distinctes, 1 = lien possible, 2 = même groupe (espérance du score sémantique). « Lien probable » quand les deux jugements concordent (lien ≥ 1,1 et même famille ≥ 0,60). À confirmer par la Conformité avant toute agrégation réglementaire des risques.',{font:RI_F({sz:7.5,i:1,color:RP.neu}),al:{h:'left',wrap:1,indent:1}}); r+=3; }
  sh.brk(r); r=riSection(sh,r,0,11,'TOP SEGMENTS'""")
# ---- WATCHLIST : action recommandée ----
re_("['Orientation TypeSafe','left'],['Action'],","['Orientation TypeSafe','left'],['Action recommandée','left'],['Action'],")
re_("const wd=[5,30,12,13,13,16,15,14,7,6,6,11,9,11,11,9,9,18,40,16,11,13];","const wd=[5,30,12,13,13,16,15,14,7,6,6,11,9,11,11,9,9,18,20,40,16,11,13];")
re_("base({font:RI_F({sz:8,color:RP.cyan==='06B6D4'?'0E7490':RP.ink})})],","base({font:RI_F({sz:8,color:RP.cyan==='06B6D4'?'0E7490':RP.ink})})],[o.ts&&o.ts.action||'',base({font:RI_F({b:1,sz:8,color:RP.eb})})],")
# ---- ACTIONS : recommandation sémantique sous l'action APEX ----
re_("[o.action,b({al:{h:'left',indent:1,wrap:1},font:RI_F({sz:8.5,color:RP.ink})})],[o.off,b()],","[o.action+(o.ts&&o.ts.action?'\\n→ recommandé : '+o.ts.action:''),b({al:{h:'left',indent:1,wrap:1},font:RI_F({sz:8.5,color:RP.ink})})],[o.off,b()],")
# ---- EXECUTIVE et INSIGHTS : phrase de lecture du Comité ----
re_("    sh.box(r,c,r,c+5,{rich:[[x.n+'  ',RI_F({b:1,sz:12,color:RP.gold})],[x.t,RI_F({b:1,sz:8.5,color:RP.ink2})]]},{al:{h:'left',indent:1},bd:{top:['thick',x.c]}});",
    "    sh.box(r,c,r,c+5,{rich:[[x.n+'  ',RI_F({b:1,sz:12,color:RP.gold})],[x.t,RI_F({b:1,sz:8.5,color:RP.ink2})]].concat(x.lecture?[['  ◆ LECTURE DU COMITÉ',RI_F({b:1,sz:7,color:RP.gold})]]:[])},{al:{h:'left',indent:1},bd:{top:['thick',x.c]}});")
re_("    sh.box(y+1,c+3,y+1,c1,x.t,{fill:{c:RP.white},font:RI_F({b:1,sz:9.5,color:RP.ink2}),al:{h:'left',v:'bottom'},bd:{right:['thin','DBE6F7']}});",
    "    sh.box(y+1,c+3,y+1,c1,{rich:[[x.t,RI_F({b:1,sz:9.5,color:RP.ink2})]].concat(x.lecture?[['   ◆ LECTURE DU COMITÉ',RI_F({b:1,sz:8,color:RP.gold})]]:[])},{fill:{c:RP.white},al:{h:'left',v:'bottom'},bd:{right:['thin','DBE6F7']}});")
# ---- AUDIT : couverture des capacités avancées ----
re_("    ['Montants, ratios, classes BCEAO / IFRS 9 / ACTE 7','Code APEX uniquement','✔ code','jamais confiés à TypeSafe ni à JEV']]);",
r"""    ['Dates par composants (jour, mois, relatif)','TypeSafe · Choice ; assemblage en code',adv?'✔ actif':'en attente','limite connue du modèle : dates comparées en code'],
    ['Données personnelles sensibles','TypeSafe · Noul',adv?'✔ actif':'en attente','commentaire à anonymiser avant diffusion'],
    ['Famille de motif et repli selon la confiance','TypeSafe · Choice hiérarchique',adv?'✔ actif':'en attente','motif détaillé incertain → famille retenue si confiance ≥ 0,9'],
    ['Action recommandée (catalogue du code)','TypeSafe · Choice',adv?'✔ actif':'en attente','8 actions types'],
    ['Contrôle d\'ordre des options','TypeSafe · Choice inversé',adv?'✔ actif':'en attente','divergence → revue analyste'],
    ['Stabilité (rééchantillonnage)','TypeSafe · 3 tirages avec sel',T.some(t=>t.stabilite!=null)?'✔ actif':'en attente','instabilité → revue analyste'],
    ['Stress narratif (8 scénarios macro)','TypeSafe · Noul ; agrégats et PD en code',m.scen&&m.scen.length?'✔ '+m.scen.length+' scénario(s) avec exposition':'en attente','exposition jugée, montants calculés'],
    ['Phrase de lecture et ordre des constats','TypeSafe · Score + Choice (portefeuille)',m.lecture?'✔ actif':'en attente','constats calculés par le code'],
    ['Bénéficiaires potentiellement liés','TypeSafe · Score + Noul (portefeuille)',m.paires&&m.paires.length?'✔ '+m.paires.length+' paire(s)':'en attente','paires repérées par le code'],
    ['Version exacte du modèle et jetons','Réponse de l\'API',T.length?'✔ conservés':'en attente','piste d\'audit (_TYPESAFE)'],
    ['Montants, ratios, classes BCEAO / IFRS 9 / ACTE 7','Code APEX uniquement','✔ code','jamais confiés à TypeSafe ni à JEV']]);""")
re_("const T=m.tsL||[], J=m.jev, adv=T.filter(t=>t.urg!=null).length;","const T=m.tsL||[], J=m.jev, adv=T.filter(t=>t.urg!=null||t.famille).length;")
# ---- puce de statut : libellé court (pas de troncature après renommage) ----
re_("const chips=[['PORTFOLIO STATUS',health[0],health[1]],['JEV · PD 12M',","const chips=[['PORTFOLIO STATUS',health[0],health[1]],['OUTLOOK · PD 12M',")
# navigation : bornes réparties selon la largeur réelle des colonnes (colonnes d'espacement comprises)
re_("sh.h(7,23); const edges=nav.map((_,i)=>Math.round(i*W/nav.length)).concat([W]);",
    "sh.h(7,23); const cw=c=>sh.cols[c]||5.4, tot=[...Array(W)].reduce((a,_,c)=>a+cw(c),0), edges=[0]; { let acc=0,c=0; for(let i=1;i<nav.length;i++){ const tg=i*tot/nav.length; while(c<W&&acc+cw(c)/2<tg){ acc+=cw(c); c++; } edges.push(Math.max(edges[edges.length-1]+1,c)); } edges.push(W); }")
re_("    ['TYPESAFE',m.tsL&&m.tsL.length?fmtN(m.tsL.length)+' retours · '","    ['SÉMANTIQUE',m.tsL&&m.tsL.length?fmtN(m.tsL.length)+' lus · '")
open('ri_engine.js','w',encoding='utf-8').write(e)

d=open('ri_docs.js',encoding='utf-8').read()
def rd0(a,b):
    global d
    if b in d: return
    assert d.count(a)==1,a[:90]; d=d.replace(a,b)
def rd(a,b):
    global d
    if b in d: return
    assert d.count(a)==1,a[:90]; d=d.replace(a,b)
rd("Scénario sévère : ${e(riMd(J.scen[2].esp))} XOF d'entrées en douteux attendues à 12 mois (SIMULATED).</p>`:'<p>JEV non calibré.</p>'}",
   r"""Scénario sévère : ${e(riMd(J.scen[2].esp))} XOF d'entrées en douteux attendues à 12 mois (SIMULATED).</p>${J.adv?`<p style="font-size:8.5pt"><b>Analyses avancées</b> — temps moyen avant défaut (sain) : ${J.adv.ttd?J.adv.ttd[0].toFixed(0):'—'} mois · guérison 31-60 j : ${riPct(J.adv.cure[0])} · 61-90 j : ${riPct(J.adv.cure[1])} · PD 12M IC 90 % : ${riPct(J.adv.boot.lo)} – ${riPct(J.adv.boot.hi)} (SIMULATED)${J.adv.back?' · backtest : '+J.adv.back.exp.toFixed(1)+' prévues / '+J.adv.back.obs+' observées':''} · stress inverse : ×${J.adv.rev.factor.toFixed(2)} double la PD.</p>`:''}`:'<p>JEV non calibré.</p>'}
${m.scen&&m.scen.length?tbl(['Stress narratif · scénario','Dossiers','Encours exposé','Entrées douteux · base','· sous stress ×2'],m.scen.map(x=>[x.l,x.n,riMd(x.enc),riMd(x.base),riMd(x.str)])):''}
${m.paires&&m.paires.some(p=>p.score>=1||(p.pNom||0)>=0.6)?tbl(['Bénéficiaires potentiellement liés','','Lien (0-2)','Même famille','Lecture','Encours cumulé'],m.paires.filter(p=>p.score>=1||(p.pNom||0)>=0.6).map(p=>[p.a,p.b,p.score.toFixed(2),p.pNom!=null?riPct(p.pNom,0):'—',p.score>=1.1&&(p.pNom||0)>=0.6?'Lien probable':'À vérifier',riMd(p.enc)])):''}""")
rd("  // 8 · audit\n",r"""  // 7 bis · stress narratif
  if(m.scen&&m.scen.length){ s=P.addSlide(); head(s,'STRESS NARRATIF · SCÉNARIOS MACRO','exposition jugée · montants calculés');
    s.addChart(P.ChartType.bar3d,[{name:'Encours exposé',labels:m.scen.map(x=>x.l),values:m.scen.map(x=>x.enc)}],{x:0.4,y:1.2,w:6.4,h:5.6,barDir:'bar',v3DRotX:8,v3DRotY:12,v3DRAngAx:true,catAxisOrientation:'maxMin',chartColors:[RIX.alert],catAxisLabelFontFace:F,valAxisHidden:true,valGridLine:{style:'none'},showValue:false,showLegend:false});
    s.addTable([[{text:'Scénario',options:{bold:true,color:'FFFFFF',fill:{color:RIX.deep}}},{text:'Dossiers',options:{bold:true,color:'FFFFFF',fill:{color:RIX.deep}}},{text:'Encours',options:{bold:true,color:'FFFFFF',fill:{color:RIX.deep}}},{text:'Douteux attendus · stress',options:{bold:true,color:'FFFFFF',fill:{color:RIX.deep}}}]].concat(m.scen.map(x=>[{text:x.l},{text:String(x.n)},{text:riMd(x.enc)},{text:riMd(x.base)+' → '+riMd(x.str),options:{bold:true,color:RIX.crit}}])),{x:7.0,y:1.3,w:5.9,fontFace:F,fontSize:9,border:{type:'solid',color:'E2E8F0',pt:0.5},rowH:0.42}); }
  // 8 · audit
""")
rd("{text:J?jevLbl(J.ptf.pd[12].prov)+(J.ptf.pd[12].prov.avertissement?'  ·  ⚠ '+J.ptf.pd[12].prov.avertissement:''):'',options:{fontSize:9,color:RIX.ink2}}],{x:0.6,y:1.25,w:12.1,h:1.1,fontFace:F});",
   "{text:J?jevLbl(J.ptf.pd[12].prov)+(J.ptf.pd[12].prov.avertissement?'  ·  ⚠ '+J.ptf.pd[12].prov.avertissement:''):'',options:{fontSize:9,color:RIX.ink2}},{text:J&&J.adv?'\\nAnalyses avancées : avant défaut '+(J.adv.ttd?J.adv.ttd[0].toFixed(0):'—')+' mois · guérison 31-60 j '+riPct(J.adv.cure[0])+' · IC 90 % '+riPct(J.adv.boot.lo)+' – '+riPct(J.adv.boot.hi)+' · stress inverse ×'+J.adv.rev.factor.toFixed(2):'',options:{fontSize:9,color:RIX.eb,bold:true}}],{x:0.6,y:1.25,w:12.1,h:1.1,fontFace:F});")
# ---- agent embarqué : suggestion indépendante du numéro de version ----
# ---- pont des impayés (Word, PDF, PowerPoint) : un poste nul s'affiche « 0 », sans signe, en gris ----
rd0("${i===0||i===7?'#001B4D':v>0?'#DC2626':'#16A34A'}\">${i===0||i===7?'':v>0?'+':'−'}","${i===0||i===7?'#001B4D':!v?'#64748B':v>0?'#DC2626':'#16A34A'}\">${i===0||i===7||!v?'':v>0?'+':'−'}")
rd0("(t==='t'?'':v>0?'+':'−')+riMd(Math.abs(v))","(t==='t'||!v?'':v>0?'+':'−')+riMd(Math.abs(v))")
# ---- PowerPoint : constante 3D correcte (bar3d) et remise en conformité du XML de PptxGenJS ----
rd0("s.addChart(P.ChartType.bar3D,[{name:'base'","s.addChart(P.ChartType.bar3d,[{name:'base'")
rd0("barGrouping:'stacked',barGapWidthPct:45,","barGrouping:'stacked',barGapWidthPct:45,v3DRotX:8,v3DRotY:12,v3DRAngAx:true,")
rd0("async function riDoc(kind){",r"""/* PowerPoint : XML de PptxGenJS remis en conformité (ordre des paragraphes, présentation, courbes) et
   série « base » des cascades rendue invisible (barres 3D flottantes) */
async function pptxFix(blob){ try{ const z=await JSZip.loadAsync(await blob.arrayBuffer(),{createFolders:false}); let hit=0;
    const ed=async(f,fn)=>{ const x=await z.file(f).async('string'), y=fn(x); if(y!==x){ z.file(f,y); hit++; } };
    for(const f of Object.keys(z.files)){
      if(/^ppt\/(slides\/slide|slideLayouts\/slideLayout|slideMasters\/slideMaster|notesSlides\/notesSlide)\d*\.xml$/.test(f))
        await ed(f,x=>x.replace(/<a:p>([\s\S]*?)<\/a:p>/g,(m,inner)=>{ let k=0; return '<a:p>'+inner.replace(/<a:pPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:pPr>)/g,(pp,off)=>off===0&&k++===0?pp:'')+'</a:p>'; }));
      else if(f==='ppt/presentation.xml')
        await ed(f,x=>{ const m=x.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/); if(!m||x.indexOf('</p:sldMasterIdLst>'+m[0])>=0) return x; return x.replace(m[0],'').replace('</p:sldMasterIdLst>','</p:sldMasterIdLst>'+m[0]); });
      else if(/^ppt\/charts\/chart\d+\.xml$/.test(f))
        await ed(f,x=>{ const def=new Set([...x.matchAll(/<c:(?:catAx|valAx|serAx|dateAx)>\s*<c:axId val="(\d+)"/g)].map(m=>m[1]));
          return x.replace(/<c:lineChart>(?!<c:grouping)/g,'<c:lineChart><c:grouping val="standard"/>')
          .replace(/<c:lineChart>[\s\S]*?<\/c:lineChart>/g,b=>b.replace(/<c:invertIfNegative [^>]*\/>/g,'')
            .replace(/<c:ser>[\s\S]*?<\/c:ser>/g,sr=>{ const mk=sr.match(/<c:marker>[\s\S]*?<\/c:marker>/), dl=sr.match(/<c:dLbls>[\s\S]*?<\/c:dLbls>/); return mk&&dl&&sr.indexOf(dl[0])<sr.indexOf(mk[0])?sr.replace(mk[0],'').replace(dl[0],mk[0]+dl[0]):sr; })
            .replace(/<c:axId val="(\d+)"\/>/g,(m,id)=>def.has(id)?m:''))
          .replace(/(<c:ser>(?:(?!<\/c:ser>)[\s\S])*?<c:v>base<\/c:v>(?:(?!<\/c:ser>)[\s\S])*?)<c:spPr>[\s\S]*?<\/c:spPr>/g,'$1<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>'); });
    }
    if(!hit) return null; return await z.generateAsync({type:'blob',compression:'DEFLATE',mimeType:blob.type||'application/vnd.openxmlformats-officedocument.presentationml.presentation'}); }catch(e){ console.warn('pptxFix',e); return null; } }
async function riDoc(kind){""")
rd0("[/jev-latest/gi,'moteur sémantique'],","[/jev-latest/gi,'moteur sémantique'],[/\\bjev-preview\\b/gi,'moteur sémantique (préversion)'],[/\\bjev-(\\d[\\w.]*)/gi,'moteur sémantique v$1'],[/\\bjev\\b/g,'moteur sémantique'],")
rd0("if(/TypeSafe|jev-latest|\\bJEV\\b/.test(xml)) w.push","if(/TypeSafe|TYPESAFE|\\bjev[-_]|\\bJEV\\b|\\bJev\\b/.test(xml)) w.push")
rd0("les régénérer depuis APEX 37.","les régénérer depuis la dernière version d\\'APEX.")
# ---- renommage : pas de doublon « RISK OUTLOOK OUTLOOK », parenthèses internes retirées ----
rd0("const expScrubTxt=s=>EXP_NAMES.reduce((a,[r,b])=>a.replace(r,b),s);","const expScrubTxt=s=>String(s).split(/(data:[^;,\"')\\s]+;base64,[A-Za-z0-9+\\/=]+)/).map((p,i)=>i%2?p:EXP_NAMES.reduce((a,[r,b])=>a.replace(r,b),p)).join('');")
rd0("const EXP_NAMES=[[/Méthodologie TypeSafe/g,","const EXP_NAMES=[[/\\s*\\((?:JEV|TypeSafe|TYPESAFE)\\)/g,''],[/JEV OUTLOOK/g,'RISK OUTLOOK'],[/Méthodologie TypeSafe/g,")
open('ri_docs.js','w',encoding='utf-8').write(d)

b=open('pm_blue.js',encoding='utf-8').read()
if 'Analyses avancées ·' not in b:
    a="  else rows.push({t:'sub',v:['JEV : non calibré pour cet export (aucune archive d\\'arrêtés).']});"
    assert b.count(a)==1
    b=b.replace(a,a+r"""
  if(J&&J.adv){ const A=J.adv; rows.push({t:'kpi',v:['Analyses avancées · avant défaut (sain)',A.ttd?A.ttd[0].toFixed(0)+' mois':'—','MARKOV · matrice fondamentale']}); rows.push({t:'kpi',v:['Guérison 31-60 j · 61-90 j',(100*A.cure[0]).toFixed(1)+' % · '+(100*A.cure[1]).toFixed(1)+' %','MARKOV · absorption']});
    rows.push({t:'kpi',v:['PD 12M · IC 90 %',(100*A.boot.lo).toFixed(1)+' % – '+(100*A.boot.hi).toFixed(1)+' %','SIMULATED · bootstrap Dirichlet']}); if(A.back) rows.push({t:'kpi',v:['Backtest (dernier mois)',A.back.exp.toFixed(1)+' prévues · '+A.back.obs+' observées','EMPIRICAL · hors échantillon']}); rows.push({t:'kpi',v:['Stress inverse',(A.rev.factor).toFixed(2)+' × double la PD 12M','STRESS']}); }""")
    a2="  rows.push({t:'hdr',v:['Référence','Motif','Confiance','Crédibilité','Promesse vs bascule','Urgence','Orientation','Statut retenu','JEV PD 12M','Revue / contrôles']});"
    assert b.count(a2)==1
    b=b.replace(a2,r"""  { const SC={}; T.forEach(t=>Object.entries(t.scen||{}).forEach(([k,v])=>{ if(v>=0.6) SC[k]=(SC[k]||0)+1; })); const ks=Object.entries(SC).sort((a,b)=>b[1]-a[1]); if(ks.length) rows.push({t:'kpi',v:['Stress narratif · dossiers exposés',ks.map(([k,n])=>k.replace(/_/g,' ')+' : '+n).join(' · '),'exposition jugée par l\'analyse sémantique']}); }
"""+a2.replace("'Orientation','Statut retenu'","'Orientation','Action recommandée','Statut retenu'"))
    a3="t.routage||'',t.statut||'',"
    assert b.count(a3)==1
    b=b.replace(a3,"t.routage||'',t.action||'',t.statut||'',")
    open('pm_blue.js','w',encoding='utf-8').write(b)
print('ts ok')

/* =====================================================================
   25 · moteur de commentaires : messages Comité et insights chiffrés
   Chaque phrase est construite à partir des agrégats calculés — aucune
   explication n'est rédigée « à la main ».
   ===================================================================== */
const sens=(v,h,b,s)=>v>0?h:v<0?b:(s||'stable');
function shareOf(part,tot){ return tot?part/tot:null; }

function dimConcentration(A){ // segment / produit / gestionnaire portant une part de la variation sans commune mesure avec son poids
  if(!A.dP) return null; const out=[];
  for(const [dim,f,lib] of [['sg',r=>r.sg,'segment'],['pr',r=>r.pr,'produit'],['of',r=>r.of,'gestionnaire'],['sc',r=>r.sc,'secteur']]){
    grp(A.R,f).forEach(g=>{ const sd=g.d/A.dP, so=A.oS?g.oS/A.oS:0; if(sd>0.25&&so>0&&sd/so>=2&&Math.abs(g.d)>=0.1*Math.abs(A.dP)) out.push({dim:lib,k:g.k,sd,so,d:g.d,x:sd/so}); }); }
  return out.sort((a,b)=>b.d*Math.sign(A.dP)-a.d*Math.sign(A.dP))[0]||null;
}
function ovStats(R){ const x=R.filter(r=>r.t!=='X'&&r.sO!=null&&r.sS!=null&&r.sO!==r.sS); const s21=x.filter(r=>r.sS===2&&r.sO===1);
  return {n:x.length,o:sum(x,r=>r.oS),p:sum(x,r=>r.pS),n21:s21.length,o21:sum(s21,r=>r.oS),p21:sum(s21,r=>r.pS),
    m12:s21.filter(r=>r.mg==='1>2').length, d12:sum(s21.filter(r=>r.mg==='1>2'),r=>r.dP)}; }

function keyMessages(A,M){
  const P=M.P, L=[]; if(!A.n) return ['Aucune exposition dans le périmètre filtré.'];
  const dp=pctCh(A.pS,A.pA);
  L.push(`La provision IFRS9 s'établit à <b>${fM(A.pS)} XOF</b> à fin ${P.n}, en <b>${sens(A.dP,'hausse','baisse')} de ${fM(Math.abs(A.dP))}</b> (${fSP(dp)}) par rapport à fin ${P.p} (${fM(A.pA)}).`);
  const B=[...A.B].filter(b=>Math.abs(b.v)>0).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v));
  if(B.length&&A.dP){ const b=B[0], b2=B[1];
    L.push(`Le mouvement est principalement porté par la composante « <b>${b.lib}</b> » (${fS(b.v)}, ${fP(Math.abs(b.v/A.dP),0)} de la variation nette, ${fN(b.n)} contrats)`+(b2?`, puis par « ${b2.lib} » (${fS(b2.v)}).`:'.')); }
  if(A.dP){ const s=[1,2,3].map(k=>({k,d:A.st[k].dP})).sort((a,b)=>b.d*Math.sign(A.dP)-a.d*Math.sign(A.dP))[0];
    L.push(`Le <b>Stage ${s.k}</b> représente ${fP(s.d/A.dP,0)} de la variation nette (provision S${s.k} : ${fM(A.st[s.k].pA)} → ${fM(A.st[s.k].pS)}, ${fS(s.d)}) ; S1 ${fS(A.st[1].dP)}, S2 ${fS(A.st[2].dP)}, S3 ${fS(A.st[3].dP)}.`); }
  L.push(`L'Outstanding évolue de ${fSP(pctCh(A.oS,A.oA))} (${fS(A.dO)}) contre ${fSP(dp)} pour la provision : le taux de couverture passe de ${fP(A.cA,2)} à ${fP(A.cS,2)} (${fBp(A.cS-A.cA)}).`);
  L.push(`Migrations : ${fN(A.det.n)} contrats dégradés (${fM(A.det.oS)} d'Outstanding, ${fS(A.det.d)} de provision) contre ${fN(A.imp.n)} améliorations (${fS(A.imp.d)}) — <b>migration nette en ${A.verdict}</b>.`);
  if(A.incTot) L.push(`Les 10 principales hausses représentent <b>${fP(A.top10Share,0)}</b> de la hausse brute (${fM(A.incTot)}) ; les 10 principales baisses ${fP(A.bot10Share,0)} de la baisse brute (${fM(Math.abs(A.decTot))}). Au niveau client, le top 10 explique ${fP(A.clTop10Share,0)} des hausses.`);
  const dc=dimConcentration(A); if(dc) L.push(`Concentration inhabituelle sur le ${dc.dim} <b>${esc(dc.k)}</b> : ${fP(dc.sd,0)} de la variation nette pour ${fP(dc.so,0)} de l'Outstanding (×${dc.x.toLocaleString('fr-FR',{maximumFractionDigits:1})}).`);
  const ov=ovStats(A.R); if(ov.n21) L.push(`Gouvernance : <b>${fN(ov.n21)} contrats</b> sont en Stage 2 dans la colonne STAGE (base de l'Impairment-pre) mais en Stage 1 dans STAGE_OVERRIDE / portefeuille (${fM(ov.o21)} d'Outstanding, ${fM(ov.p21)} de provision) ; ${fN(ov.m12)} d'entre eux constituent des migrations S1→S2 (${fS(ov.d12)}). L'Impairment post-override de ${P.n} n'étant pas fourni, l'impact d'une application des overrides est non déterminable à partir des données disponibles.`);
  if(A.news.n||A.exits.n) L.push(`Renouvellement du portefeuille : ${fN(A.news.n)} entrées (${fS(A.news.pS)} de provision) et ${fN(A.exits.n)} sorties (${fS(-A.exits.pA)}).`);
  return L;
}

function insights(A,M){
  const I=[], add=(lvl,title,text,ev)=>I.push({lvl,title,text,ev}); if(!A.n) return I;
  const dO=pctCh(A.oS,A.oA), dP=pctCh(A.pS,A.pA);
  if(dO!=null&&dP!=null&&Math.abs(dO)<0.03&&dP>0.05) add('up','Provision en hausse malgré un Outstanding stable',`La provision progresse de ${fSP(dP)} alors que l'Outstanding ne varie que de ${fSP(dO)} : le mouvement vient du profil de risque, pas du volume.`,`Couverture ${fP(A.cA,2)} → ${fP(A.cS,2)}`);
  if(dO!=null&&dP!=null&&dO>0.02&&dP<dO/2) add('info','Croissance du portefeuille non accompagnée d\'une hausse proportionnelle de l\'ECL',`Outstanding ${fSP(dO)} contre provision ${fSP(dP)}.`,`Couverture ${fBp(A.cS-A.cA)}`);
  if(dO!=null&&dP!=null&&dO<-0.02&&dP>0) add('up','Provision en hausse sur un portefeuille en contraction',`Outstanding ${fSP(dO)} mais provision ${fSP(dP)}.`,`Δ provision ${fS(A.dP)}`);
  const B=[...A.B].sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)), b0=B[0];
  if(b0&&A.dP&&Math.abs(b0.v)>0){
    if(b0.id==='det'){ const s=['1>2','1>3','2>3'].map(m=>({m,d:A.migSub[m].d})).sort((a,b)=>b.d-a.d)[0];
      add('up',`La migration ${s.m.replace('>',' → S').replace(/^/,'S')} est le premier moteur`,`Les détériorations de stage pèsent ${fS(b0.v)} (${fP(b0.v/A.dP,0)} de la variation nette), dont ${fS(s.d)} sur ${s.m.replace('>','→')}.`,`${fN(A.migSub[s.m].n)} contrats`); }
    else if(b0.id==='rate') add(b0.v>0?'up':'dn','Effet couverture / paramètres dominant',`À stage inchangé, l'évolution du taux de couverture explique ${fS(b0.v)} (${fP(b0.v/A.dP,0)} de la variation nette). La ventilation PD / LGD / scénarios n'est pas déterminable à partir des données disponibles.`,`${fN(b0.n)} contrats stables`);
    else if(b0.id==='vol') add(b0.v>0?'up':'dn','Effet volume dominant',`À stage inchangé, la variation d'Outstanding explique ${fS(b0.v)} de provision.`,`${fN(b0.n)} contrats`);
    else if(b0.id==='new') add('up','Nouvelles entrées : premier moteur',`Les ${fN(b0.n)} nouveaux contrats apportent ${fS(b0.v)} de provision.`,`${fP(b0.v/A.dP,0)} de la variation nette`);
    else if(b0.id==='exit') add('dn','Sorties : premier moteur',`Les ${fN(b0.n)} contrats sortis libèrent ${fS(b0.v)}.`,`${fP(b0.v/A.dP,0)} de la variation nette`);
    else if(b0.id==='imp') add('dn','Les améliorations de stage dominent',`Les retours vers un stage moins risqué libèrent ${fS(b0.v)}.`,`${fN(b0.n)} contrats`);
  }
  const s3=A.migSub['1>3'].n+A.migSub['2>3'].n, s3d=A.migSub['1>3'].d+A.migSub['2>3'].d;
  if(s3>0&&Math.abs(s3d)>=0.05*Math.abs(A.dP||1)) add('up','Détérioration significative vers le Stage 3',`${fN(s3)} contrats basculent en défaut (S1→S3 : ${fN(A.migSub['1>3'].n)}, S2→S3 : ${fN(A.migSub['2>3'].n)}).`,`Δ provision ${fS(s3d)} · Outstanding ${fM(A.migSub['1>3'].oS+A.migSub['2>3'].oS)}`);
  if(A.bot10Share!=null&&A.bot10Share>0.5) add('info','La baisse de provision est concentrée sur un petit nombre d\'expositions',`Les 10 principales baisses représentent ${fP(A.bot10Share,0)} de la baisse brute.`,`${fM(Math.abs(sum(A.bot.slice(0,10),r=>r.dP)))} sur ${fM(Math.abs(A.decTot))}`);
  if(A.top10Share!=null&&A.top10Share>0.5) add('warn','La hausse de provision est concentrée',`Les 10 principales hausses représentent ${fP(A.top10Share,0)} de la hausse brute.`,`${fM(sum(A.top.slice(0,10),r=>r.dP))} sur ${fM(A.incTot)}`);
  else if(A.top10Share!=null&&A.incTot) add('info','Hausse de provision diffuse',`Les 10 principales hausses ne représentent que ${fP(A.top10Share,0)} de la hausse brute : le mouvement est granulaire.`,`${fN(A.top.length)} contrats en hausse`);
  for(const s of [2,3]){ const o=A.st[s]; if(o.cA!=null&&o.cS!=null&&Math.abs(o.cS-o.cA)>=0.01) add(o.cS>o.cA?'up':'dn',`Couverture Stage ${s} ${o.cS>o.cA?'en hausse':'en baisse'}`,`Taux de couverture S${s} : ${fP(o.cA,1)} → ${fP(o.cS,1)}.`,`${fBp(o.cS-o.cA)}`); }
  if(A.st[2].oA&&A.st[2].oS/A.st[2].oA>1.5) add('up','Forte expansion du Stage 2',`L'Outstanding Stage 2 passe de ${fM(A.st[2].oA)} à ${fM(A.st[2].oS)} (${fSP(pctCh(A.st[2].oS,A.st[2].oA),0)}).`,`${fN(A.st[2].nA)} → ${fN(A.st[2].nS)} contrats`);
  const ov=ovStats(A.R); if(ov.n) add('warn','Divergence Stage modèle / Stage override',`${fN(ov.n)} contrats ont un STAGE différent de STAGE_OVERRIDE (dont ${fN(ov.n21)} S2 modèle / S1 override).`,`Provision Impairment-pre concernée : ${fM(ov.p)}`);
  return I;
}

function committeeQA(A,M){
  const P=M.P, W=A.WL, cnt=s=>W.filter(w=>w.sev===s).length;
  const B=[...A.B].filter(b=>b.v).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,3);
  const seg=grp(A.R,r=>r.sg).sort((a,b)=>b.d*Math.sign(A.dP||1)-a.d*Math.sign(A.dP||1)).slice(0,3);
  const ofs=grp(A.R,r=>r.of).sort((a,b)=>b.d*Math.sign(A.dP||1)-a.d*Math.sign(A.dP||1)).slice(0,3);
  const st=[1,2,3].map(s=>({s,d:A.st[s].dP})).sort((a,b)=>b.d*Math.sign(A.dP||1)-a.d*Math.sign(A.dP||1));
  const cl=(A.dP>=0?A.clTop:A.clBot).slice(0,5);
  const ov=ovStats(A.R);
  const rule=n=>W.filter(w=>w.rule===n);
  const act=[];
  const s13=rule('S1 → S3').length+rule('S2 → S3').length; if(s13) act.push(`<b>Credit Risk</b> — revue des ${fN(s13)} bascules en Stage 3 (S1→S3, S2→S3 : ${fS(A.migSub['1>3'].d+A.migSub['2>3'].d)}) et validation des stages.`);
  if(ov.n) act.push(`<b>Credit Risk / Gouvernance</b> — arbitrer les ${fN(ov.n)} écarts STAGE vs STAGE_OVERRIDE (${fM(ov.p)} de provision Impairment-pre) avant clôture.`);
  const s12=rule('S1 → S2'); if(s12.length) act.push(`<b>Credit Risk</b> — documenter le critère SICR des ${fN(s12.length)} migrations S1→S2 (${fS(A.migSub['1>2'].d)}).`);
  const rel=rule('Forte baisse de provision').length+rule('Sortie avec forte provision N-1').length; if(rel) act.push(`<b>Finance</b> — justifier ${fN(rel)} reprises / sorties significatives (remboursement, radiation, cession, garantie).`);
  const nw=rule('Nouveau compte à forte provision').length; if(nw) act.push(`<b>Credit Risk</b> — ${fN(nw)} nouveaux comptes entrent avec une provision significative : vérifier l'origination et le stage initial.`);
  const s3n=A.MX['N>3']?A.MX['N>3'].n:0, s3t=A.migSub['1>3'].n+A.migSub['2>3'].n; if(s3n+s3t) act.push(`<b>Collection</b> — plan de recouvrement sur ${fN(s3t+s3n)} expositions entrées en Stage 3 ce mois (${fM(A.migSub['1>3'].oS+A.migSub['2>3'].oS+(A.MX['N>3']?A.MX['N>3'].oS:0))} d'Outstanding).`);
  const dq=rule('Donnée incohérente / manquante').length; if(dq) act.push(`<b>Finance / Data</b> — corriger ${fN(dq)} anomalies de données (score qualité ${M.DQ.score}/100).`);
  return [
    ['QUOI ?','Provision '+P.n,[`Provision IFRS9 : <b>${fX(A.pS)} XOF</b> (${fM(A.pS)}) sur ${fM(A.oS)} d'Outstanding — couverture ${fP(A.cS,2)}.`]],
    ['COMBIEN ?','vs '+P.p,[`${sens(A.dP,'Hausse','Baisse')} de <b>${fM(Math.abs(A.dP))}</b> (${fSP(pctCh(A.pS,A.pA))}) — de ${fM(A.pA)} à ${fM(A.pS)}.`,`Outstanding ${fS(A.dO)} (${fSP(pctCh(A.oS,A.oA))}) · couverture ${fBp(A.cS-A.cA)}.`]],
    ['POURQUOI ?','Bridge',B.map(b=>`${b.lib} : <b>${fS(b.v)}</b> (${A.dP?fP(b.v/A.dP,0):'—'} du net, ${fN(b.n)} contrats).`)],
    ['OÙ ?','Stages · segments · gestionnaires',[`Stages : ${st.map(x=>'S'+x.s+' '+fS(x.d)).join(' · ')}.`,`Segments : ${seg.map(g=>esc(g.k)+' '+fS(g.d)).join(' · ')}.`,`Gestionnaires : ${ofs.map(g=>esc(g.k)+' '+fS(g.d)).join(' · ')}.`]],
    ['QUI ?','Clients',[`Top 10 clients : ${fP(A.dP>=0?A.clTop10Share:A.clBot10Share,0)} des ${A.dP>=0?'hausses':'baisses'}.`,...cl.map(c=>`${esc(c.nm||c.cu)} (${esc(c.cu)}) : <b>${fS(c.dP)}</b> — ${c.sAx?'S'+c.sAx:'NEW'} → ${c.sSx?'S'+c.sSx:'EXIT'}`)]],
    ['RISQUE ?','Watchlist',[`${cnt('CRITICAL')} CRITICAL · ${cnt('HIGH')} HIGH · ${cnt('MEDIUM')} MEDIUM · ${cnt('LOW')} LOW.`,`Migration nette en <b>${A.verdict}</b> : ${fN(A.det.n)} dégradations vs ${fN(A.imp.n)} améliorations.`]],
    ['ACTION ?','Credit Risk · Finance · Collection',act.length?act:['Aucune action particulière identifiée sur ce périmètre.']]];
}

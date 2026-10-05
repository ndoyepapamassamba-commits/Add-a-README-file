/* =====================================================================
   20 · moteur analytique : couche normalisée, rapprochement N / N-1,
        bridge, migrations, concentrations, watchlist, qualité des données
   ===================================================================== */

/* ---------- 1. couche normalisée (les sources ne sont jamais modifiées) ---------- */
function extractRows(t,spec){
  const m=mapCols(t.header,spec), g=(k,i)=>m[k]==null?null:t.cols[m[k]][i], rows=[];
  for(let i=0;i<t.n;i++) rows.push({i, contract:normId(g('contract',i)), account:normId(g('account',i)), customer:normId(g('customer',i)),
    segment:normUp(g('segment',i)), product:normUp(g('product',i)), sector:normUp(g('sector',i)),
    stageRaw:g('stage',i), stage:normStage(g('stage',i)), stageOv:normStage(g('stageOv',i)),
    outRaw:g('out',i), out:normAmt(g('out',i)), impRaw:g('imp',i), imp:normAmt(g('imp',i)), impModel:normAmt(g('impModel',i)),
    rpt:normDate(g('rpt',i)), aff:normTxt(g('aff',i))});
  return {rows,map:m};
}
function extractPf(t){
  const m=mapCols(t.header,SPEC.pf), g=(k,i)=>m[k]==null?null:t.cols[m[k]][i], rows=[];
  for(let i=0;i<t.n;i++) rows.push({i,key:normId(g('key',i)),cust:normId(g('cust',i)),name:normTxt(g('name',i)),group:normTxt(g('group',i)),
    officer:normTxt(g('officer',i)),ccy:normUp(g('ccy',i)),cls:normUp(g('cls',i)),frr:normTxt(g('frr',i)),pcode:normUp(g('pcode',i)),
    scode:normTxt(g('scode',i)),bseg:normUp(g('bseg',i)),status:normUp(g('status',i)),pdo:normAmt(g('pdo',i)),dpdo:normDate(g('dpdo',i)),
    ototal:normAmt(g('ototal',i)),stage:normStage(g('stage',i)),coll:normAmt(g('coll',i)),prog:normTxt(g('prog',i)),desc:normTxt(g('desc',i)),
    mat:normDate(g('mat',i)),book:normDate(g('book',i)),rdate:normDate(g('rdate',i))});
  return {rows,map:m};
}

/* ---------- 2. choix vérifié de la clé de rapprochement ---------- */
function keyStats(cur,prev){
  const cands=[{id:'contract',lib:'CONTRACT_ID',f:r=>r.contract},{id:'account',lib:'ACCOUNT_NO',f:r=>r.account},
    {id:'cust+contract',lib:'CUSTOMER_NO + CONTRACT_ID',f:r=>r.customer&&r.contract?r.customer+'|'+r.contract:''},
    {id:'customer',lib:'CUSTOMER_NO (niveau client)',f:r=>r.customer}];
  return cands.map(c=>{ const kc=cur.map(c.f), kp=prev.map(c.f); const sc=new Set(), sp2=new Set(); let dc=0, dp=0, ec=0, ep=0;
    kc.forEach(k=>{ if(!k){ ec++; return; } if(sc.has(k)) dc++; else sc.add(k); }); kp.forEach(k=>{ if(!k){ ep++; return; } if(sp2.has(k)) dp++; else sp2.add(k); });
    let match=0; sc.forEach(k=>{ if(sp2.has(k)) match++; });
    return Object.assign({},c,{uniqC:sc.size,uniqP:sp2.size,dupC:dc,dupP:dp,emptyC:ec,emptyP:ep,match,
      rateC:sc.size?match/sc.size:0,rateP:sp2.size?match/sp2.size:0,usable:ec+ep<(cur.length+prev.length)*0.5}); })
    .filter(c=>c.usable);
}
function pickKey(stats){
  // priorité : clé unique dans les deux mois, puis taux de rapprochement le plus élevé ; le niveau client n'est retenu qu'en dernier recours
  const s=[...stats].sort((a,b)=>((a.dupC+a.dupP)>0)-((b.dupC+b.dupP)>0)||(a.id==='customer')-(b.id==='customer')||b.match-a.match);
  return s[0];
}

/* ---------- 3. table analytique de comparaison ---------- */
function buildModel(src){
  const {roles,log}=assignRoles(src.tables);
  const miss=['cur','prev'].filter(r=>!roles[r]);
  if(miss.length) throw new Error('Feuille introuvable : '+miss.map(r=>SPEC[r].label).join(', ')+'. Feuilles présentes : '+src.tables.map(t=>t.name).join(', '));
  const E={cur:extractRows(roles.cur,SPEC.cur), prev:extractRows(roles.prev,SPEC.prev), pf:roles.pf?extractPf(roles.pf):{rows:[],map:{}}};
  for(const r of ['cur','prev']){ const lack=SPEC[r].req.filter(k=>E[r].map[k]==null); if(lack.length) throw new Error('Colonne(s) obligatoire(s) absente(s) dans « '+roles[r].name+' » : '+lack.join(', ')); }
  const KS=keyStats(E.cur.rows,E.prev.rows), K=pickKey(KS);
  if(!K) throw new Error('Aucune clé de rapprochement exploitable (CONTRACT_ID / ACCOUNT_NO / CUSTOMER_NO).');
  // agrégation éventuelle des doublons de clé (sommes ; stage le plus dégradé) — aucune ligne n'est écartée
  const agg=(rows,tag)=>{ const M=new Map(); let dup=0;
    for(const r of rows){ const k=K.f(r)||('∅'+tag+r.i); let o=M.get(k);
      if(!o){ M.set(k,Object.assign({},r,{k,lines:1})); continue; }
      dup++; o.lines++; o.out=(o.out||0)+(r.out||0); o.imp=(o.imp||0)+(r.imp||0); if(r.impModel!=null) o.impModel=(o.impModel||0)+r.impModel;
      o.stage=Math.max(o.stage||0,r.stage||0)||null; }
    return {M,dup}; };
  const AC=agg(E.cur.rows,'c'), AP=agg(E.prev.rows,'p');
  // portefeuille : jointure sur la colonne (contrat ou compte) qui rapproche le mieux
  const pfMap=new Map(); let pfDup=0; E.pf.rows.forEach(p=>{ if(!p.key) return; if(pfMap.has(p.key)) pfDup++; else pfMap.set(p.key,p); });
  const jc=sum(E.cur.rows,r=>pfMap.has(r.contract)?1:0), ja=sum(E.cur.rows,r=>pfMap.has(r.account)?1:0);
  const pfJoin=ja>jc?'account':'contract';
  // référentiel client (nom, groupe, gestionnaire le plus fréquent) pour enrichir aussi les comptes sortis
  const CU=new Map(); E.pf.rows.forEach(p=>{ if(!p.cust) return; let o=CU.get(p.cust); if(!o){ o={name:p.name,group:p.group,off:new Map(),seg:p.bseg}; CU.set(p.cust,o); }
    if(p.officer) o.off.set(p.officer,(o.off.get(p.officer)||0)+1); if(!o.name&&p.name) o.name=p.name; });
  CU.forEach(o=>{ let b='', n=-1; o.off.forEach((v,k)=>{ if(v>n){ n=v; b=k; } }); o.officer=b; });

  const keys=new Set([...AC.M.keys(),...AP.M.keys()]); const R=[];
  for(const k of keys){ const c=AC.M.get(k), p=AP.M.get(k), b=c||p;
    const pf=c?pfMap.get(c[pfJoin]):(p?pfMap.get(p[pfJoin]):null); const cu=CU.get(b.customer)||null;
    const r={k, ct:b.contract, ac:b.account, cu:b.customer||(pf&&pf.cust)||'',
      nm:(pf&&pf.name)||(cu&&cu.name)||'', gp:(pf&&pf.group)||(cu&&cu.group)||'',
      sg:(c&&c.segment)||(p&&p.segment)||(pf&&pf.bseg)||'', pr:(c&&c.product)||(p&&p.product)||'', sc:(c&&c.sector)||(p&&p.sector)||'',
      of:(pf&&pf.officer)||(cu&&cu.officer)||'', ofSrc:pf&&pf.officer?'pf':cu&&cu.officer?'client':'nd',
      cy:(pf&&pf.ccy)||(c?'':'N/D (contrat sorti)'), cl:(pf&&pf.cls)||(c?'':'N/D (contrat sorti)'), fr:(pf&&pf.frr)||'', pc:(pf&&pf.pcode)||'', stt:(pf&&pf.status)||'', pdo:pf?pf.pdo:null, dpdo:pf?pf.dpdo:null,
      ot:pf?pf.ototal:null, col:pf?pf.coll:null, prog:(pf&&pf.prog)||'', desc:(pf&&pf.desc)||'', mat:pf?pf.mat:null, inPf:!!pf, sP:pf?pf.stage:null,
      sA:p?p.stage:null, sS:c?c.stage:null, sO:c?c.stageOv:null,
      oA:p?(p.out||0):0, oS:c?(c.out||0):0, pA:p?(p.imp||0):0, pS:c?(c.imp||0):0, pAm:p?p.impModel:null,
      nullA:p?{o:p.out==null,p:p.imp==null,s:p.stage==null}:null, nullS:c?{o:c.out==null,p:c.imp==null,s:c.stage==null}:null,
      lines:(c?c.lines:0)+(p?p.lines:0), t:c&&p?'C':c?'N':'X'};
    r.dO=r.oS-r.oA; r.dP=r.pS-r.pA; r.sR=r.sS!=null?r.sS:r.sA;
    if(r.t==='C'){ if(r.sA&&r.sS){ r.mg=r.sA+'>'+r.sS; r.dir=r.sS>r.sA?'D':r.sS<r.sA?'I':'S'; } else { r.mg='?'; r.dir='U'; }
      // décomposition exacte volume / taux de couverture : ΔP = ΔO × cov(N-1) + O(N) × Δcov
      if(r.oA>0){ const cA=r.pA/r.oA; r.vol=r.dO*cA; r.rate=r.dP-r.vol; } else { r.vol=0; r.rate=r.dP; } }
    else { r.mg=r.t==='N'?'N>'+(r.sS||'?'):(r.sA||'?')+'>X'; r.dir=r.t; r.vol=0; r.rate=0; }
    R.push(r); }

  const rptDates=[...new Set(E.cur.rows.map(r=>r.rpt&&+r.rpt).filter(Boolean))].map(t=>new Date(t)).sort((a,b)=>a-b);
  const pfDates=[...new Set(E.pf.rows.map(r=>r.rdate&&+r.rdate).filter(Boolean))].map(t=>new Date(t));
  const dN=rptDates[rptDates.length-1]||pfDates[0]||null; const dP=dN?new Date(dN.getFullYear(),dN.getMonth(),0):null;
  const lab=d=>d?MOIS[d.getMonth()]+' '+d.getFullYear():'';
  const P={N:dN?lab(dN):'MOIS N',P:dP?lab(dP):'MOIS N-1',n:dN?MOISc[dN.getMonth()]+' '+dN.getFullYear():'N',p:dP?MOISc[dP.getMonth()]+' '+dP.getFullYear():'N-1',dN,dP};
  const M={src,roles,log,E,KS,K,AC:{dup:AC.dup},AP:{dup:AP.dup},pfMap,pfDup,pfJoin,CU,R,rptDates,P};
  M.DQ=dataQuality(M);
  return M;
}

/* ---------- 4. agrégats (recalculés à chaque filtre) ---------- */
function grp(R,f){ const M=new Map();
  for(const r of R){ const k=f(r)||'(non renseigné)'; let o=M.get(k);
    if(!o){ o={k,nA:0,nS:0,oA:0,oS:0,pA:0,pS:0,d:0,det:0,imp:0,news:0,exits:0,st:{1:{o:0,p:0,n:0},2:{o:0,p:0,n:0},3:{o:0,p:0,n:0}},stA:{1:{o:0,p:0},2:{o:0,p:0},3:{o:0,p:0}},dS2:0}; M.set(k,o); }
    if(r.t!=='N'){ o.nA++; o.oA+=r.oA; o.pA+=r.pA; if(r.sA) { o.stA[r.sA].o+=r.oA; o.stA[r.sA].p+=r.pA; } }
    if(r.t!=='X'){ o.nS++; o.oS+=r.oS; o.pS+=r.pS; if(r.sS){ o.st[r.sS].o+=r.oS; o.st[r.sS].p+=r.pS; o.st[r.sS].n++; } }
    o.d+=r.dP; if(r.dir==='D') o.det++; if(r.dir==='I') o.imp++; if(r.t==='N') o.news++; if(r.t==='X') o.exits++; }
  return [...M.values()].map(o=>Object.assign(o,{dO:o.oS-o.oA,cA:ratio(o.pA,o.oA),cS:ratio(o.pS,o.oS)})); }

function clientsOf(R){ const M=new Map();
  for(const r of R){ const k=r.cu||('∅'+r.k); let o=M.get(k);
    if(!o){ o={cu:r.cu,nm:r.nm,gp:r.gp,sg:r.sg,of:r.of,n:0,nA:0,nS:0,oA:0,oS:0,pA:0,pS:0,dP:0,dO:0,sAx:null,sSx:null,det:0,imp:0,news:0,exits:0,rows:[]}; M.set(k,o); }
    o.rows.push(r); if(!o.nm&&r.nm) o.nm=r.nm; o.n++; if(r.t!=='N') o.nA++; if(r.t!=='X') o.nS++;
    o.oA+=r.oA; o.oS+=r.oS; o.pA+=r.pA; o.pS+=r.pS; o.dP+=r.dP; o.dO+=r.dO;
    if(r.sA) o.sAx=Math.max(o.sAx||0,r.sA); if(r.sS) o.sSx=Math.max(o.sSx||0,r.sS);
    if(r.dir==='D') o.det++; if(r.dir==='I') o.imp++; if(r.t==='N') o.news++; if(r.t==='X') o.exits++; }
  return [...M.values()]; }

function compute(R){
  const A={R,n:R.length};
  const RA=R.filter(r=>r.t!=='N'), RS=R.filter(r=>r.t!=='X'), RC=R.filter(r=>r.t==='C');
  A.nA=RA.length; A.nS=RS.length; A.pA=sum(RA,r=>r.pA); A.pS=sum(RS,r=>r.pS); A.oA=sum(RA,r=>r.oA); A.oS=sum(RS,r=>r.oS);
  A.dP=A.pS-A.pA; A.dO=A.oS-A.oA; A.cA=ratio(A.pA,A.oA); A.cS=ratio(A.pS,A.oS); A.avgA=ratio(A.pA,A.nA); A.avgS=ratio(A.pS,A.nS);
  A.st={}; for(const s of [1,2,3]){ const a=RA.filter(r=>r.sA===s), b=RS.filter(r=>r.sS===s);
    A.st[s]={nA:a.length,nS:b.length,oA:sum(a,r=>r.oA),oS:sum(b,r=>r.oS),pA:sum(a,r=>r.pA),pS:sum(b,r=>r.pS)};
    const o=A.st[s]; o.cA=ratio(o.pA,o.oA); o.cS=ratio(o.pS,o.oS); o.dP=o.pS-o.pA; o.dO=o.oS-o.oA; }
  // bridge (décomposition additive exacte, contrat par contrat)
  const by=f=>sum(R.filter(f),r=>r.dP);
  const exits=R.filter(r=>r.t==='X'), news=R.filter(r=>r.t==='N'), stab=RC.filter(r=>r.dir==='S'), det=RC.filter(r=>r.dir==='D'), imp=RC.filter(r=>r.dir==='I'), unk=RC.filter(r=>r.dir==='U');
  const B=[
    {id:'exit',lib:'Sorties du portefeuille',v:-sum(exits,r=>r.pA),n:exits.length,how:'− Σ provision N-1 des contrats absents en N'},
    {id:'new',lib:'Nouvelles entrées',v:sum(news,r=>r.pS),n:news.length,how:'+ Σ provision N des contrats absents en N-1'},
    {id:'vol',lib:'Effet volume (Outstanding) — stage inchangé',v:sum(stab,r=>r.vol),n:stab.length,how:'Σ (Outstanding N − Outstanding N-1) × couverture N-1'},
    {id:'rate',lib:'Effet couverture / paramètres ECL — stage inchangé',v:sum(stab,r=>r.rate),n:stab.length,how:'Σ Outstanding N × (couverture N − couverture N-1)'},
    {id:'det',lib:'Migrations — détérioration (S1→S2, S1→S3, S2→S3)',v:sum(det,r=>r.dP),n:det.length,how:'Σ Δ provision des contrats dont le stage s\'est dégradé'},
    {id:'imp',lib:'Migrations — amélioration (S2→S1, S3→S1, S3→S2)',v:sum(imp,r=>r.dP),n:imp.length,how:'Σ Δ provision des contrats dont le stage s\'est amélioré'}];
  if(unk.length) B.push({id:'unk',lib:'Contrats sans stage exploitable',v:sum(unk,r=>r.dP),n:unk.length,how:'Δ provision des contrats rapprochés dont le stage N ou N-1 est manquant'});
  A.B=B; A.bSum=sum(B,b=>b.v); A.bRes=A.dP-A.bSum;
  A.migSub={}; for(const m of ['1>2','1>3','2>3','2>1','3>1','3>2','1>1','2>2','3>3']){ const x=RC.filter(r=>r.mg===m); A.migSub[m]={n:x.length,oA:sum(x,r=>r.oA),oS:sum(x,r=>r.oS),pA:sum(x,r=>r.pA),pS:sum(x,r=>r.pS),d:sum(x,r=>r.dP),vol:sum(x,r=>r.vol),rate:sum(x,r=>r.rate)}; }
  // matrice de migration (lignes N-1 + NEW ; colonnes N + EXIT)
  const MX={}; for(const r of R){ const a=r.t==='N'?'N':(r.sA||'?'), b=r.t==='X'?'X':(r.sS||'?'), k=a+'>'+b; let o=MX[k]; if(!o) o=MX[k]={n:0,oA:0,oS:0,pA:0,pS:0,d:0}; o.n++; o.oA+=r.oA; o.oS+=r.oS; o.pA+=r.pA; o.pS+=r.pS; o.d+=r.dP; }
  A.MX=MX;
  const agg=x=>({n:x.length,oA:sum(x,r=>r.oA),oS:sum(x,r=>r.oS),pA:sum(x,r=>r.pA),pS:sum(x,r=>r.pS),d:sum(x,r=>r.dP)});
  A.det=agg(det); A.imp=agg(imp); A.stab=agg(stab); A.news=agg(news); A.exits=agg(exits);
  A.notch=sum(RC,r=>r.sA&&r.sS?r.sS-r.sA:0); A.netMig=A.det.n-A.imp.n; A.netMigO=A.det.oS-A.imp.oS; A.netMigP=A.det.d+A.imp.d;
  A.verdict=A.det.n===0&&A.imp.n===0?'stable':A.netMigO>0?'détérioration':'amélioration';
  // quadrants Outstanding / provision (contrats rapprochés)
  const Q={uu:[],ud:[],du:[],dd:[],fl:[]}; RC.forEach(r=>{ const o=Math.abs(r.dO)<1?0:Math.sign(r.dO), p=Math.abs(r.dP)<1?0:Math.sign(r.dP);
    if(o>0&&p>0) Q.uu.push(r); else if(o>0&&p<0) Q.ud.push(r); else if(o<0&&p>0) Q.du.push(r); else if(o<0&&p<0) Q.dd.push(r); else Q.fl.push(r); });
  A.Q={}; for(const k in Q) A.Q[k]=Object.assign(agg(Q[k]),{dO:sum(Q[k],r=>r.dO)});
  // contributions
  A.incTot=sum(R,r=>r.dP>0?r.dP:0); A.decTot=sum(R,r=>r.dP<0?r.dP:0);
  A.top=[...R].filter(r=>r.dP>0).sort((a,b)=>b.dP-a.dP); A.bot=[...R].filter(r=>r.dP<0).sort((a,b)=>a.dP-b.dP);
  A.top10Share=ratio(sum(A.top.slice(0,10),r=>r.dP),A.incTot); A.bot10Share=ratio(sum(A.bot.slice(0,10),r=>r.dP),A.decTot);
  A.CL=clientsOf(R); A.clTop=A.CL.filter(c=>c.dP>0).sort((a,b)=>b.dP-a.dP); A.clBot=A.CL.filter(c=>c.dP<0).sort((a,b)=>a.dP-b.dP);
  A.clTop10Share=ratio(sum(A.clTop.slice(0,10),c=>c.dP),A.incTot); A.clBot10Share=ratio(sum(A.clBot.slice(0,10),c=>c.dP),A.decTot);
  // concentration clients
  const byP=[...A.CL].sort((a,b)=>b.pS-a.pS), byAbs=[...A.CL].sort((a,b)=>Math.abs(b.dP)-Math.abs(a.dP)), gross=sum(A.CL,c=>Math.abs(c.dP));
  A.conc=[10,20,50].map(n=>{ const t=byP.slice(0,n), u=byAbs.slice(0,n), w=A.clTop.slice(0,n);
    return {n,oS:ratio(sum(t,c=>c.oS),A.oS),pS:ratio(sum(t,c=>c.pS),A.pS),dAbs:ratio(sum(u,c=>Math.abs(c.dP)),gross),dInc:ratio(sum(w,c=>c.dP),A.incTot),net:ratio(sum(u,c=>c.dP),A.dP)}; });
  A.hhi=A.pS?sum(A.CL,c=>Math.pow(c.pS/A.pS,2)):null; A.nClients=A.CL.filter(c=>c.nS>0).length; A.nClientsA=A.CL.filter(c=>c.nA>0).length;
  A.byStageD={1:A.st[1].dP,2:A.st[2].dP,3:A.st[3].dP};
  A.WL=watchlist(R);
  return A;
}

/* ---------- 5. watchlist IFRS9 ---------- */
const SEVO={CRITICAL:0,HIGH:1,MEDIUM:2,LOW:3};
function watchlist(R){ const W=[]; const add=(r,rule,sev,why,owner)=>W.push({r,rule,sev,why,owner});
  for(const r of R){
    if(r.mg==='1>3') add(r,'S1 → S3','CRITICAL','Passage direct en défaut — Δ provision '+fS(r.dP),'Credit Risk · Collection');
    if(r.mg==='1>2') add(r,'S1 → S2',r.dP>=T.migMat?'HIGH':'MEDIUM','Dégradation significative du risque (SICR) — Δ provision '+fS(r.dP),'Credit Risk');
    if(r.mg==='2>3') add(r,'S2 → S3',r.dP>=T.s23Crit?'CRITICAL':'HIGH','Bascule en défaut depuis la watch-list — Δ provision '+fS(r.dP),'Credit Risk · Collection');
    if(r.t==='C'&&r.dP>=T.provHi[2]) add(r,'Forte hausse de provision',r.dP>=T.provHi[0]?'CRITICAL':r.dP>=T.provHi[1]?'HIGH':'MEDIUM',fS(r.dP)+' ('+(r.pA>=T.pctFloor?fSP(r.dP/r.pA,0):'FROM ZERO')+')','Credit Risk · Finance');
    if(r.t==='C'&&r.dP<=-T.provLo[1]) add(r,'Forte baisse de provision',r.dP<=-T.provLo[0]?'HIGH':'MEDIUM',fS(r.dP)+' — reprise à justifier (remboursement, garantie, override ?)','Finance · Credit Risk');
    if(r.t==='C'&&r.dO>=T.outHi[1]) add(r,'Forte hausse d\'Outstanding',r.dO>=T.outHi[0]?'HIGH':'MEDIUM','Outstanding '+fS(r.dO)+' — provision '+fS(r.dP),'Credit Risk');
    if(r.t==='C'&&r.dO<=-T.outLo[1]) add(r,'Forte baisse d\'Outstanding',r.dO<=-T.outLo[0]?'MEDIUM':'LOW','Outstanding '+fS(r.dO)+' — provision '+fS(r.dP),'Finance');
    if(r.t==='C'&&r.dP>0&&r.oA>0&&r.dO<=-T.divAbs&&r.dO/r.oA<=-T.divPct) add(r,'Provision ↑ / Outstanding ↓','HIGH','Outstanding '+fSP(r.dO/r.oA,0)+' mais provision '+fS(r.dP),'Credit Risk');
    if(r.t==='C'&&r.dP<0&&r.oA>0&&r.dO>=T.divAbs&&r.dO/r.oA>=T.divPct) add(r,'Provision ↓ / Outstanding ↑','HIGH','Outstanding '+fSP(r.dO/r.oA,0)+' mais provision '+fS(r.dP)+' — risque de sous-provisionnement','Credit Risk · Finance');
    if(r.t==='N'&&r.pS>=T.newProv[1]) add(r,'Nouveau compte à forte provision',r.pS>=T.newProv[0]?'CRITICAL':'HIGH','Entrée en '+(r.sS?'S'+r.sS:'stage ?')+' avec '+fM(r.pS)+' de provision','Credit Risk');
    if(r.t==='X'&&r.pA>=T.exitProv[1]) add(r,'Sortie avec forte provision N-1',r.pA>=T.exitProv[0]?'HIGH':'MEDIUM','Provision N-1 '+fM(r.pA)+' libérée — vérifier : radiation, cession, recouvrement ?','Finance · Collection');
    const dq=[]; if(r.nullS&&r.nullS.s) dq.push('stage N manquant'); if(r.nullS&&r.nullS.o) dq.push('Outstanding N manquant'); if(r.nullS&&r.nullS.p) dq.push('provision N manquante');
    if(r.nullA&&r.nullA.s) dq.push('stage N-1 manquant'); if(r.nullA&&(r.nullA.o||r.nullA.p)) dq.push('montant N-1 manquant');
    if(r.pS>r.oS+1&&r.t!=='X') dq.push('provision > Outstanding'); if(r.oS<0||r.pS<0) dq.push('montant négatif');
    if(r.t!=='X'&&r.sS===3&&r.oS>0&&r.pS===0) dq.push('Stage 3 sans provision');
    if(r.t!=='X'&&!r.inPf) dq.push('absent du portefeuille');
    if(r.t!=='X'&&r.sO!=null&&r.sS!=null&&r.sO!==r.sS) add(r,'Stage modèle ≠ Stage override',r.pS>=T.migMat?'HIGH':r.pS>=1e6?'MEDIUM':'LOW','STAGE (base Impairment-pre) = S'+r.sS+' ; STAGE_OVERRIDE = S'+r.sO+(r.sP?' ; portefeuille = S'+r.sP:'')+' — provision '+fM(r.pS),'Credit Risk · Gouvernance');
    if(dq.length) add(r,'Donnée incohérente / manquante',dq.some(x=>/provision > |Stage 3 sans/.test(x))?'MEDIUM':'LOW',dq.join(' · '),'Finance · Data');
  }
  return W.sort((a,b)=>SEVO[a.sev]-SEVO[b.sev]||Math.abs(b.r.dP)-Math.abs(a.r.dP)); }

/* ---------- 6. qualité des données (sur l'ensemble, hors filtres) ---------- */
function dataQuality(M){
  const {E,R,K,roles}=M, cur=E.cur.rows, prev=E.prev.rows, pf=E.pf.rows;
  const cnt=(a,f)=>a.reduce((s,x)=>s+(f(x)?1:0),0);
  const miss=(a,k)=>cnt(a,x=>x[k]==null||x[k]==='');
  const totA=sum(prev,r=>r.imp), totS=sum(cur,r=>r.imp), outA=sum(prev,r=>r.out), outS=sum(cur,r=>r.out);
  const dIndiv=sum(R,r=>r.dP), res=(totS-totA)-dIndiv;
  const D={sheets:[
      {role:'N',name:roles.cur.name,rows:roles.cur.n,hdr:roles.cur.headerRow,cols:roles.cur.header.length,blank:roles.cur.blank},
      {role:'N-1',name:roles.prev.name,rows:roles.prev.n,hdr:roles.prev.headerRow,cols:roles.prev.header.length,blank:roles.prev.blank},
      roles.pf?{role:'Portefeuille',name:roles.pf.name,rows:roles.pf.n,hdr:roles.pf.headerRow,cols:roles.pf.header.length,blank:roles.pf.blank}:null].filter(Boolean),
    totA,totS,outA,outS,dTot:totS-totA,dIndiv,res,
    nCurCli:new Set(cur.map(r=>r.customer).filter(Boolean)).size, nPrevCli:new Set(prev.map(r=>r.customer).filter(Boolean)).size,
    nCurAcc:new Set(cur.map(r=>r.account).filter(Boolean)).size, nPrevAcc:new Set(prev.map(r=>r.account).filter(Boolean)).size,
    dupC:M.AC.dup, dupP:M.AP.dup, pfDup:M.pfDup,
    nullC:{stage:miss(cur,'stage'),out:miss(cur,'out'),imp:miss(cur,'imp'),cust:miss(cur,'customer'),seg:miss(cur,'segment'),prod:miss(cur,'product')},
    nullP:{stage:miss(prev,'stage'),out:miss(prev,'out'),imp:miss(prev,'imp'),cust:miss(prev,'customer'),seg:miss(prev,'segment'),prod:miss(prev,'product')},
    news:cnt(R,r=>r.t==='N'), exits:cnt(R,r=>r.t==='X'), matched:cnt(R,r=>r.t==='C'),
    cliNew:0, cliExit:0,
    curNotPf:cnt(cur,r=>!M.pfMap.has(r[M.pfJoin])), pfNotCur:0, pfNotCurOut:0,
    impGtOut:cnt(cur,r=>r.imp!=null&&r.out!=null&&r.imp>r.out+1), neg:cnt(cur,r=>(r.imp||0)<0||(r.out||0)<0)+cnt(prev,r=>(r.imp||0)<0||(r.out||0)<0),
    zeroOut:cnt(cur,r=>r.out===0), s3NoProv:cnt(cur,r=>r.stage===3&&(r.out||0)>0&&!r.imp),
    ovDiff:cnt(cur,r=>r.stageOv!=null&&r.stage!=null&&r.stageOv!==r.stage), hasOv:E.cur.map.stageOv!=null,
    modelVsOvP:E.prev.map.impModel!=null?sum(prev,r=>Math.abs((r.impModel||0)-(r.imp||0))):null,
    officerND:cnt(R,r=>!r.of), officerViaClient:cnt(R,r=>r.ofSrc==='client'),
    attrChg:{seg:0,prod:0,cust:0}};
  const cc=new Set(cur.map(r=>r.customer).filter(Boolean)), pc=new Set(prev.map(r=>r.customer).filter(Boolean));
  D.cliNew=[...cc].filter(c=>!pc.has(c)).length; D.cliExit=[...pc].filter(c=>!cc.has(c)).length;
  const curKeys=new Set(cur.map(r=>r[M.pfJoin])); pf.forEach(p=>{ if(p.key&&!curKeys.has(p.key)){ D.pfNotCur++; D.pfNotCurOut+=p.ototal||0; } });
  // divergence Stage modèle (STAGE) vs override / portefeuille
  const ovRows=cur.filter(r=>r.stageOv!=null&&r.stage!=null&&r.stageOv!==r.stage);
  D.ov={n:ovRows.length,out:sum(ovRows,r=>r.out),imp:sum(ovRows,r=>r.imp),pairs:{}};
  ovRows.forEach(r=>{ const k='S'+r.stage+'→S'+r.stageOv; const o=D.ov.pairs[k]||(D.ov.pairs[k]={n:0,out:0,imp:0}); o.n++; o.out+=r.out||0; o.imp+=r.imp||0; });
  // Outstanding IFRS9 vs Ototal portefeuille
  let oe=0, on=0, od=0; cur.forEach(r=>{ const p=M.pfMap.get(r[M.pfJoin]); if(!p||p.ototal==null||r.out==null) return; on++; if(Math.abs(p.ototal-r.out)<=1) oe++; else od+=r.out-p.ototal; });
  D.otEq=on?oe/on:null; D.otN=on; D.otDiff=od;
  // attributs qui changent d'un mois à l'autre sur un même contrat
  const pm=new Map(prev.map(r=>[K.f(r),r])); cur.forEach(r=>{ const p=pm.get(K.f(r)); if(!p) return; if(p.segment!==r.segment) D.attrChg.seg++; if(p.product!==r.product) D.attrChg.prod++; if(p.customer!==r.customer) D.attrChg.cust++; });
  // score /100 — pénalités pondérées (formule affichée dans l'application)
  const N=cur.length+prev.length;
  const P=[
    ['Unicité de la clé',20,(D.dupC+D.dupP)/Math.max(1,N)],
    ['Complétude des champs critiques (stage, Outstanding, provision)',25,(D.nullC.stage+D.nullC.out+D.nullC.imp+D.nullP.stage+D.nullP.out+D.nullP.imp)/Math.max(1,N*3)*5],
    ['Rapprochement des totaux (Σ variations individuelles = variation totale)',20,Math.abs(res)>1?1:0],
    ['Cohérence Stage modèle vs override / portefeuille (taux × 3)',10,D.hasOv?3*D.ovDiff/Math.max(1,cur.length):0],
    ['Couverture IFRS9 ↔ portefeuille (taux × 3)',10,roles.pf?3*(D.curNotPf/Math.max(1,cur.length)+D.pfNotCur/Math.max(1,pf.length)):0.5],
    ['Cohérence Outstanding IFRS9 vs Ototal portefeuille (taux × 3)',10,D.otEq==null?0.5:3*(1-D.otEq)],
    ['Montants aberrants (provision > Outstanding, négatifs, S3 sans provision)',5,(D.impGtOut+D.neg+D.s3NoProv)/Math.max(1,cur.length)*10]];
  D.pen=P.map(([lib,w,x])=>({lib,w,x:Math.min(1,x),pts:w*Math.min(1,x)}));
  D.score=Math.max(0,Math.round(100-sum(D.pen,p=>p.pts)));
  return D;
}

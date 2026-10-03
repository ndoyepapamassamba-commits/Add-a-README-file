/* =====================================================================
   ECOBANK CREDIT RISK INTELLIGENCE — moteur d'export Excel premium
   · Source analytique canonique unique (riModel) : écran, Excel et PDF
     lisent les mêmes chiffres, issus des instantanés APEX (hsPack).
   · Identité ECOBANK BLUE PREMIUM, composition « application web » :
     HEADER → HERO → KPI → ANALYTICS → VISUALISATIONS → INSIGHTS →
     WATCHLIST → ACTION PLAN.
   · Exports : Executive, Risk, Watchlist, Action plan, Audit, Data, Complet.
   ===================================================================== */
const RI_V='RI 1.0';
const RP={eb:'003DA5',deep:'001B4D',corp:'002B73',bright:'2563EB',cyan:'06B6D4',gold:'C8A951',white:'FFFFFF',off:'F8FAFC',light:'EAF2FF',pale:'F2F7FF',
  ok:'16A34A',warn:'F59E0B',alert:'F97316',crit:'DC2626',neu:'64748B',ink:'0F172A',ink2:'334155',line:'DBE6F7',soft:'F1F5F9'};
const RI_NFM='[>=1000000000]#,##0.00,,," Md";[>=1000000]#,##0.0,," M";#,##0';
const RI_BK=['Sain','1-30 j','31-60 j','61-90 j','> 90 j / S3'];
const RI_LVL={CRITICAL:{c:RP.crit,t:'CRITICAL',fr:'Critique'},HIGH:{c:RP.alert,t:'HIGH',fr:'Priorité haute'},WATCH:{c:RP.warn,t:'WATCH',fr:'Surveillance'},CURED:{c:RP.ok,t:'CURED',fr:'Régularisé'}};

/* ---------- formats ---------- */
const riMd=v=>{ if(!isFinite(v)) return '—'; const a=Math.abs(v), s=v<0?'−':''; return a>=1e9?s+(a/1e9).toFixed(2).replace('.',',')+' Md':a>=1e6?s+(a/1e6).toFixed(1).replace('.',',')+' M':s+Math.round(a).toLocaleString('fr-FR').replace(/ | /g,' '); };
const riPct=(v,d=1)=>!isFinite(v)?'—':(v*100).toFixed(d).replace('.',',')+' %';
const riSg=(v,f)=>(v>0?'+':v<0?'−':'')+f(Math.abs(v));

/* ---------- source canonique ---------- */
function riBucket(o){ return (o.npl||o.stage===3)?4:(o.pdo>0?(o.dj<=30?1:o.dj<=60?2:o.dj<=90?3:4):0); }
function riKpi(cli){ const k={enc:0,pdo:0,b2:0,b3:0,b4:0,s2:0,s3:0,ecl:0,n:cli.length,nArr:0,nb:[0,0,0,0,0],eb:[0,0,0,0,0]};
  cli.forEach(o=>{ k.enc+=o.enc; k.pdo+=o.pdo; k.ecl+=o.ecl; if(o.stage===2) k.s2+=o.enc; if(o.stage===3||o.npl) k.s3+=o.enc; const b=riBucket(o); k.nb[b]++; k.eb[b]+=o.enc; if(o.pdo>0) k.nArr++;
    if(b===2) k.b2+=o.enc; if(b===3) k.b3+=o.enc; if(b===4) k.b4+=o.enc; }); return k; }
async function riModel(){
  if(!S.agg||!S.rows) throw new Error('aucun arrêté chargé dans APEX');
  const cur=hsFromAgg(S.agg,(S.meta&&S.meta.file)||''), curD=new Date(cur.date), toO=r=>{ const o=hsRow(r); o.stage=+o.stage||1; o.enc=+o.enc||0; o.pdo=+o.pdo||0; o.ecl=+o.ecl||0; o.dj=+o.dj||0; o.npl=!!+o.npl; return o; };
  // historique : dernier instantané de chaque mois antérieur (voyage dans le temps : bornée à l'arrêté affiché)
  const byM=new Map(); (S.hist||[]).filter(h=>h.date<+curD-86400000).forEach(h=>{ const d=new Date(h.date), k=d.getFullYear()*100+d.getMonth(); if(k===curD.getFullYear()*100+curD.getMonth()) return; const o=byM.get(k); if(!o||h.date>o.date) byM.set(k,h); });
  const metas=[...byM.values()].sort((a,b)=>a.date-b.date).slice(-11), months=[];
  for(const m of metas){ const f=await hsGetFull(m.key); if(f&&f.cli) months.push({date:new Date(f.date),label:f.label,file:f.file,cli:f.cli.map(toO),eclOk:f.eclBasis==='IFRS9'}); }
  months.push({date:curD,label:fmtDate(curD),file:cur.file,cli:cur.cli.map(toO),eclOk:true});
  months.forEach(m=>{ m.k=riKpi(m.cli); if(!m.eclOk) m.k.ecl=null; /* ancien instantané : provision locale, non comparable à l'ECL IFRS 9 */ });
  const M=months[months.length-1], P=months.length>1?months[months.length-2]:null, K=M.k, KP=P?P.k:null;
  // plan d'actions APEX (criticité, plan, échéances) et retours TypeSafe
  let CR=[]; try{ const C=crmInit(); if(!C.rows.length) crmFromActe7(); CR=C.rows.filter(r=>r.t); }catch(e){}
  const crBy=new Map(); CR.forEach(r=>{ const k=String(r.clc||'').trim(), o=crBy.get(k); const rk={CRITIQUE:4,'ÉLEVÉE':3,MOYENNE:2,FAIBLE:1}; if(!o||(rk[r.t.crit]||0)>(rk[o.t.crit]||0)) crBy.set(k,r); });
  const acc=new Map(); S.rows.forEach(x=>{ const o=acc.get(x.clc); if(!o||x.ototal>o.ototal) acc.set(x.clc,{account:x.account,ototal:x.ototal,prod:x.prod}); });
  const prodAgg=new Map(); S.rows.forEach(x=>{ if(x.excl) return; const o=prodAgg.get(x.prod)||{k:x.prod,enc:0,pdo:0,n:0}; o.enc+=x.ototal||0; o.pdo+=x.pdo||0; o.n++; prodAgg.set(x.prod,o); });
  const prev=new Map(P?P.cli.map(o=>[o.clc,o]):[]), hist=new Map(); months.forEach((m,i)=>m.cli.forEach(o=>{ (hist.get(o.clc)||hist.set(o.clc,new Array(months.length).fill(null)).get(o.clc))[i]=o.pdo; }));
  // clients enrichis
  const cl=M.cli.map(o=>{ const p=prev.get(o.clc), b=riBucket(o), pb=p?riBucket(p):null, cr=crBy.get(String(o.clc).trim()), ts=cr&&typeof TSX!=='undefined'?TSX.byRef[String(cr.ref).trim()]:null;
    const dPdo=p?o.pdo-p.pdo:o.pdo, dEnc=p?o.enc-p.enc:null, mig=p&&b>pb;
    let lvl=null; const crit=cr&&cr.t.crit;
    if(p&&p.pdo>0&&o.pdo===0&&!o.npl) lvl='CURED';
    else if(crit==='CRITIQUE'||(mig&&b===4)||(o.dj>75&&o.dj<=90&&o.pdo>0)) lvl='CRITICAL';
    else if(crit==='ÉLEVÉE'||b===3||(mig&&b>=2)) lvl='HIGH';
    else if(o.stage===2||b===2||b===1&&o.pdo>0&&dPdo>0||crit) lvl='WATCH';
    const st=ts&&ts.statut||(cr&&cr.t.status==='Régularisé'?'Fait':cr?'À faire':''), prog={'À faire':0,'Revue analyste':.25,'En cours':.5,'Promesse de règlement':.6,'Restructuration':.6,'Régularisé (à vérifier)':.9,'Fait':1,'Régularisé':1}[st]??(lvl==='CURED'?1:0);
    return Object.assign({},o,{b,pb,p,dPdo,dEnc,mig,lvl,crit,cr,ts,acc:(acc.get(o.clc)||{}).account||'',statut:st||(lvl==='CURED'?'Régularisé':'À faire'),prog,
      action:cr?(cr.t.short||cr.t.planText||cr.t.text||'').toString().split(/\n/)[0].slice(0,140):lvl==='CURED'?'Clôturer le suivi, confirmer l\'encaissement':o.stage===2?'Revue SICR et plan de régularisation':'Surveillance renforcée',
      cible:cr&&(cr.t.dRegul||cr.t.actionDate||cr.t.d90)?new Date(cr.t.dRegul||cr.t.actionDate||cr.t.d90):null,impact:cr?Math.round(cr.t.impactEcl||0):0,trend:hist.get(o.clc)||[]}); });
  const watch=cl.filter(o=>o.lvl&&o.lvl!=='CURED').sort((a,b)=>({CRITICAL:0,HIGH:1,WATCH:2}[a.lvl]-{CRITICAL:0,HIGH:1,WATCH:2}[b.lvl])||b.enc-a.enc);
  const cured=cl.filter(o=>o.lvl==='CURED').sort((a,b)=>(b.p?b.p.pdo:0)-(a.p?a.p.pdo:0));
  // mouvements des impayés (pont N-1 → N), au client
  const wf={open:KP?KP.pdo:0,nouv:0,det:0,cure:0,pay:0,sortie:0,entree:0,close:K.pdo}; const lostCli=[];
  if(P){ cl.forEach(o=>{ const p=o.p; if(!p){ wf.entree+=o.pdo; return; } if(p.pdo===0&&o.pdo>0) wf.nouv+=o.pdo; else if(p.pdo>0&&o.pdo===0) wf.cure-=p.pdo; else if(o.pdo>p.pdo) wf.det+=o.pdo-p.pdo; else if(o.pdo<p.pdo) wf.pay-=p.pdo-o.pdo; });
    const now=new Set(M.cli.map(o=>o.clc)); P.cli.forEach(p=>{ if(!now.has(p.clc)){ wf.sortie-=p.pdo; if(p.pdo>0) lostCli.push(p); } }); }
  wf.check=Math.round(wf.open+wf.nouv+wf.entree+wf.det+wf.cure+wf.pay+wf.sortie-wf.close);
  // migrations entre tranches (nombre et encours)
  const mx=[0,1,2,3,4].map(()=>[0,0,0,0,0].map(()=>({n:0,enc:0}))); if(P) cl.forEach(o=>{ if(o.pb!=null){ const c=mx[o.pb][o.b]; c.n++; c.enc+=o.enc; } });
  const nPrev=P?cl.filter(o=>o.pb!=null).length:0, up=cl.filter(o=>o.mig).length, down=cl.filter(o=>o.pb!=null&&o.b<o.pb).length;
  const flow={open:{n:KP?KP.nArr:0,enc:KP?KP.pdo:0},nouv:{n:cl.filter(o=>o.p&&o.p.pdo===0&&o.pdo>0).length,enc:wf.nouv},
    to2:{n:cl.filter(o=>o.b===2&&o.pb!=null&&o.pb<2).length,enc:cl.filter(o=>o.b===2&&o.pb!=null&&o.pb<2).reduce((s,o)=>s+o.enc,0)},
    to3:{n:cl.filter(o=>o.b===3&&o.pb!=null&&o.pb<3).length,enc:cl.filter(o=>o.b===3&&o.pb!=null&&o.pb<3).reduce((s,o)=>s+o.enc,0)},
    to4:{n:cl.filter(o=>o.b===4&&o.pb!=null&&o.pb<4).length,enc:cl.filter(o=>o.b===4&&o.pb!=null&&o.pb<4).reduce((s,o)=>s+o.enc,0)},
    s3:{n:cl.filter(o=>(o.stage===3||o.npl)&&o.p&&!(o.p.stage===3||o.p.npl)).length,enc:cl.filter(o=>(o.stage===3||o.npl)&&o.p&&!(o.p.stage===3||o.p.npl)).reduce((s,o)=>s+o.enc,0)},
    cure:{n:cured.length,enc:-wf.cure},close:{n:K.nArr,enc:K.pdo}};
  // concentration
  const by=(f)=>{ const m=new Map(); cl.forEach(o=>{ const k=f(o)||'—', x=m.get(k)||{k,enc:0,pdo:0,n:0,s2:0,s3:0,ecl:0}; x.enc+=o.enc; x.pdo+=o.pdo; x.n++; if(o.stage===2) x.s2+=o.enc; if(o.stage===3||o.npl) x.s3+=o.enc; x.ecl+=o.ecl; m.set(k,x); }); return [...m.values()].sort((a,b)=>b.enc-a.enc); };
  const seg=by(o=>o.bseg), off=by(o=>o.off), sec=by(o=>o.sector), prod=[...prodAgg.values()].sort((a,b)=>b.enc-a.enc);
  const top=[...cl].sort((a,b)=>b.enc-a.enc), top10=top.slice(0,10), t10=top10.reduce((s,o)=>s+o.enc,0), hhi=cl.reduce((s,o)=>s+Math.pow(o.enc/(K.enc||1),2),0);
  const risky=[...cl].filter(o=>o.lvl&&o.lvl!=='CURED').sort((a,b)=>({CRITICAL:0,HIGH:1,WATCH:2}[a.lvl]-{CRITICAL:0,HIGH:1,WATCH:2}[b.lvl])||(b.pdo-a.pdo)||(b.enc-a.enc));
  const drivers=P?[...cl].filter(o=>o.dPdo).sort((a,b)=>Math.abs(b.dPdo)-Math.abs(a.dPdo)).slice(0,8):[];
  // matrice risque × exposition
  const expC=v=>v>=1e9?2:v>=1e8?1:0, rskC=o=>(o.b>=3||o.stage===3||o.npl)?2:(o.b===2||o.stage===2||o.b===1)?1:0;
  const rm=[0,1,2].map(()=>[0,1,2].map(()=>({n:0,enc:0,pdo:0}))); cl.forEach(o=>{ const c=rm[rskC(o)][expC(o.enc)]; c.n++; c.enc+=o.enc; c.pdo+=o.pdo; });
  // contrôles de cohérence (source unique)
  const ctl=[];
  const eq=(l,a,b,tol)=>ctl.push({l,ok:Math.abs(a-b)<=(tol||1),a,b});
  eq('Encours : somme des clients = agrégat APEX',K.enc,cur.agg.enc,Math.max(1,cur.agg.enc*1e-9));
  eq('Impayés : somme des clients = agrégat APEX',K.pdo,cur.agg.pdo,Math.max(1,cur.agg.pdo*1e-9));
  eq('Pont des impayés : ouverture + mouvements = clôture',wf.check,0,2);
  eq('Tranches : somme des encours par tranche = encours total',K.eb.reduce((a,b)=>a+b,0),K.enc,2);
  eq('Watchlist : encours ≤ encours total',Math.min(watch.reduce((s,o)=>s+o.enc,0),K.enc),watch.reduce((s,o)=>s+o.enc,0),1);
  ctl.push({l:'Clients en double',ok:new Set(cl.map(o=>o.clc)).size===cl.length,a:cl.length,b:new Set(cl.map(o=>o.clc)).size});
  ctl.push({l:'Valeurs non numériques (NaN / Infini)',ok:cl.every(o=>[o.enc,o.pdo,o.ecl,o.dj].every(isFinite)),a:0,b:0});
  ctl.push({l:'Provisions de l\'historique sur base IFRS 9 (comparables)',ok:months.every(x=>x.eclOk),a:months.filter(x=>x.eclOk).length,b:months.length});
  ctl.push({l:'JEV : PD avec provenance pour chaque client de la watchlist',ok:true,a:0,b:0,jev:1});
  ctl.push({l:'Historique disponible pour les tendances',ok:months.length>=2,a:months.length,b:2});
  // JEV : calibré sur l'archive des arrêtés s'il n'a pas encore tourné ; PD par client avec provenance
  let J=(typeof JEV!=='undefined'&&JEV.res)?JEV.res:null;
  if(!J&&typeof jevHistorique==='function'){ try{ const hh=await jevHistorique(+curD,()=>{}); if(hh.H.length){ J=jevRun(hh.H); JEV.res=J; } }catch(e){ console.warn('RI/JEV',e); } }
  if(J){ const byRef=new Map(J.cps.map(c=>[String(c.ref).trim(),c]));
    cl.forEach(o=>{ const cp=o.cr?byRef.get(String(o.cr.ref).trim()):null; const e=jevEtat(o.dj,o.npl||o.stage===3);
      if(cp){ o.pd12=cp.pd[12].v; o.pdSrc=cp.pd[12].prov.source; o.pdConf=cp.pd[12].prov.confiance; o.pdAct=cp.act[0]||null; o.pdSig=cp.sig.map(w=>w[2]); }
      else if(e<JEV_D){ const b=jevPdMarkov(J.C,J.C.M[o.bseg]?o.bseg:null,e,12); o.pd12=b.v; o.pdSrc='MARKOV'; o.pdConf=b.prov.confiance; o.pdAct=null; o.pdSig=[]; }
      else { o.pd12=1; o.pdSrc='OBSERVED'; o.pdConf='élevée'; o.pdAct=null; o.pdSig=[]; } }); }
  const top5=top.slice(0,5).reduce((s,o)=>s+o.enc,0)/(K.enc||1), top5P=P?[...P.cli].sort((a,b)=>b.enc-a.enc).slice(0,5).reduce((s,o)=>s+o.enc,0)/(KP.enc||1):null;
  const tsL=(typeof TSX!=='undefined'&&TSX.n)?Object.values(TSX.byRef):[];
  { const c=ctl.find(x=>x.jev); const nw=watch.filter(o=>o.pd12!=null).length; c.ok=!J||nw===watch.length; c.a=nw; c.b=watch.length; if(!J){ c.l='JEV : non calibré (aucune archive d\'arrêtés)'; } }
  const ins=riInsights({K,KP,wf,flow,t10,cl,up,nPrev,watch,cured,seg,off,risky,M,P,top10,J,tsL});
  return {date:curD,label:fmtDate(curD),prevLabel:P?P.label:null,file:cur.file,months,M,P,K,KP,cl,watch,cured,risky,drivers,wf,mx,flow,up,down,nPrev,seg,off,sec,prod,top10,t10,top5,top5P,hhi,rm,ctl,ins,lostCli,tsL,
    jev:J,ts:(typeof TSX!=='undefined')?TSX:null,perimetre:'Portefeuille Ecobank Sénégal · '+fmtN(cl.length)+' clients · '+fmtN(S.rows.length)+' lignes ACTE 7'}; }

/* ---------- insights calculés (aucune phrase générique) ---------- */
function riInsights(m){ const I=[], K=m.K, KP=m.KP;
  if(KP){ const d=K.pdo-KP.pdo, tot=m.wf.nouv+m.wf.det+m.wf.entree;
    I.push({n:'01',t:d>=0?'IMPAYÉS EN HAUSSE':'IMPAYÉS EN BAISSE',big:riSg(d,riMd)+' XOF',c:d>0?RP.crit:RP.ok,
      p:`Les impayés passent de ${riMd(KP.pdo)} à ${riMd(K.pdo)} XOF depuis le ${m.P.label}. Nouveaux impayés : ${riMd(m.wf.nouv)} (${tot>0?riPct(m.wf.nouv/tot,0):'—'} des hausses) ; régularisations : ${riMd(-m.wf.cure)} ; remboursements partiels : ${riMd(-m.wf.pay)}.`}); }
  else I.push({n:'01',t:'IMPAYÉS',big:riMd(K.pdo)+' XOF',c:RP.eb,p:`${fmtN(K.nArr)} clients en impayé. Aucun arrêté antérieur en mémoire : la variation sera calculée dès le prochain chargement.`});
  I.push({n:'02',t:'CONCENTRATION',big:'TOP 10 = '+riPct(m.t10/(K.enc||1),1),c:RP.gold,p:`Les 10 premiers clients portent ${riMd(m.t10)} XOF sur ${riMd(K.enc)}. Premier client : ${m.top10[0]?m.top10[0].rel:'—'} (${m.top10[0]?riPct(m.top10[0].enc/(K.enc||1)):'—'}). Premier segment : ${m.seg[0]?m.seg[0].k+' ('+riPct(m.seg[0].enc/(K.enc||1),0)+')':'—'}.`});
  I.push({n:'03',t:'MIGRATION',big:fmtN(m.up)+' dossiers',c:m.up?RP.alert:RP.ok,p:m.P?`${fmtN(m.up)} clients ont migré vers une tranche d'impayé plus dégradée (${riPct(m.up/(m.nPrev||1))} des clients suivis), dont ${fmtN(m.flow.to4.n)} au-delà de 90 jours ou en Stage 3 pour ${riMd(m.flow.to4.enc)} XOF d'encours.`:'Les migrations seront mesurées dès qu\'un arrêté antérieur sera en mémoire.'});
  const crit=m.watch.filter(o=>o.lvl==='CRITICAL'), hi=m.watch.filter(o=>o.lvl==='HIGH');
  I.push({n:'04',t:'ACTION',big:fmtN(crit.length+hi.length)+' dossiers',c:RP.crit,p:`${fmtN(crit.length)} dossiers critiques (${riMd(crit.reduce((s,o)=>s+o.enc,0))} XOF) et ${fmtN(hi.length)} en priorité haute nécessitent une intervention. ${crit[0]?'Premier dossier : '+crit[0].rel+' ('+riMd(crit[0].enc)+', '+crit[0].dj+' j).':''}`});
  I.push({n:'05',t:'STAGE 2 & 3',big:riMd(K.s2+K.s3)+' XOF',c:RP.warn,p:`Stage 2 : ${riMd(K.s2)} (${riPct(K.s2/(K.enc||1))} de l'encours)${KP?' ; '+riSg(K.s2-KP.s2,riMd)+' sur le mois':''}. Stage 3 : ${riMd(K.s3)} (${riPct(K.s3/(K.enc||1))})${KP?' ; '+riSg(K.s3-KP.s3,riMd):''}. Provisions : ${riMd(K.ecl)} XOF.`});
  I.push({n:'06',t:'RÉGULARISATIONS',big:fmtN(m.cured.length)+' dossiers',c:RP.ok,p:m.P?`${fmtN(m.cured.length)} clients en impayé au ${m.P.label} sont revenus à jour, soit ${riMd(-m.wf.cure)} XOF d'impayés résorbés.`:'Les régularisations seront mesurées dès qu\'un arrêté antérieur sera en mémoire.'});
  if(m.J){ const p=m.J.ptf.pd[12], sv=m.J.scen[2];
    I.push({n:'07',t:'PROSPECTIF · JEV',big:'PD 12M = '+riPct(p.v),c:RP.bright,p:`Probabilité qu'un client sain aujourd'hui devienne douteux sous 12 mois (${p.prov.source}, N = ${fmtN(p.prov.n)}, ${p.prov.periodes} mois, confiance ${p.prov.confiance}). Scénario sévère : ${riMd(sv.esp)} XOF d'entrées en douteux attendues (SIMULATED).${p.prov.avertissement?' Estimation indicative : historique insuffisant pour une calibration robuste.':''}`}); }
  if(m.tsL&&m.tsL.length){ const T=m.tsL, rv=T.filter(t=>t.statut==='Revue analyste').length, ac=T.filter(t=>t.revue&&t.revue.some(x=>/auto-coh/.test(x))).length, tard=T.filter(t=>t.position==='Après la bascule').length;
    I.push({n:'08',t:'TYPESAFE · RETOURS',big:fmtN(T.length)+' commentaires lus',c:RP.cyan,p:`${fmtN(rv)} dossiers en revue analyste (confiance faible ou incohérence), dont ${fmtN(ac)} par contrôle d'auto-cohérence ; ${fmtN(tard)} promesses tombent après la date de bascule. TypeSafe ne produit aucun chiffre.`}); }
  return I; }

/* =====================================================================
   COMPOSANTS VISUELS
   ===================================================================== */
const RI_F=(o)=>Object.assign({name:'Segoe UI'},o);
const RI_SHEETS={exec:'EXECUTIVE',risk:'RISK',mov:'MOVEMENT',conc:'CONCENTRATION',watch:'WATCHLIST',act:'ACTIONS',ins:'INSIGHTS',det:'DETAIL',aud:'AUDIT',data:'DATA'};
const RI_ICO={exec:'◆',risk:'▲',mov:'⇅',conc:'◎',watch:'◉',act:'✓',ins:'✦',det:'☰',aud:'§',data:'☰'};
const RI_MOIS=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
function riHeader(sh,m,key,nav,W,title,sub){ const L=W-1; sh._sec=0;
  sh.h(0,18).box(0,0,0,L-6,{rich:[['◆ ',RI_F({sz:8,color:RP.gold})],['ECOBANK SÉNÉGAL',RI_F({b:1,sz:8.5,color:RP.gold})],['   ·   CREDIT RISK INTELLIGENCE   ·   ',RI_F({sz:8,color:'9DB4E0'})],[RI_SHEETS[key],RI_F({b:1,sz:8,color:RP.white})]]},{fill:{c:RP.deep},al:{h:'left',indent:1}});
  sh.box(0,L-5,0,L,{rich:[['INTERNAL USE ONLY  ·  ',RI_F({sz:7.5,color:'8EA6D6'})],[RI_V,RI_F({sz:7.5,color:RP.gold,b:1})]]},{fill:{c:RP.deep},al:{h:'right'}});
  const split=Math.round(W*0.64), d=m.date, long=d.getDate()+' '+RI_MOIS[d.getMonth()]+' '+d.getFullYear();
  sh.h(1,10).h(2,16).h(3,38).h(4,20).h(5,15);
  sh.box(1,0,5,split-1,{rich:[['E C O B A N K   S É N É G A L\n',RI_F({b:1,sz:8.5,color:RP.gold})],[(title||'CREDIT RISK INTELLIGENCE')+'\n',RI_F({b:1,sz:26,color:RP.white})],[(sub||'Portfolio Monitoring & Early Warning'),RI_F({sz:10.5,color:'C7D7F5'})]]},{fill:{g:[RP.deep,RP.eb],deg:0},al:{h:'left',v:'center',wrap:1,indent:2}});
  const hr={fill:{g:[RP.eb,RP.bright],deg:0}};
  sh.box(1,split,1,L,'',hr); sh.box(2,split,2,L,'REPORTING DATE',Object.assign({},hr,{font:RI_F({b:1,sz:7.5,color:RP.gold}),al:{h:'left',v:'bottom',indent:2}}));
  sh.box(3,split,3,L,long,Object.assign({},hr,{font:RI_F({b:1,sz:18,color:RP.white}),al:{h:'left',v:'center',indent:2}}));
  sh.box(4,split,4,L,'PORTFOLIO MONITORING',Object.assign({},hr,{font:RI_F({b:1,sz:8.5,color:'E0EAFF'}),al:{h:'left',v:'center',indent:2}}));
  sh.box(5,split,5,L,m.perimetre,Object.assign({},hr,{font:RI_F({sz:7.5,color:'BFD3FF'}),al:{h:'left',v:'top',indent:2}}));
  sh.h(6,2.5).blk(6,0,6,L,{fill:{g:[RP.gold,'F3E7BF'],deg:0}});
  // navigation applicative (icône + nom, onglet actif en surbrillance)
  sh.h(7,23); const edges=nav.map((_,i)=>Math.round(i*W/nav.length)).concat([W]); nav.forEach((k,i)=>{ const c0=edges[i], c1=Math.max(c0,edges[i+1]-1), on=k===key, name=RI_SHEETS[k], fs=nav.length>6?7:8.5;
    sh.box(7,c0,7,c1,{rich:[[RI_ICO[k]+'  ',RI_F({sz:fs,color:on?RP.gold:'7C93C9'})],[name,RI_F({b:1,sz:fs,color:on?RP.white:RP.eb})]]},on?{fill:{g:[RP.eb,RP.bright],deg:90},al:{h:'center'},bd:{bottom:['thick',RP.gold],right:['thin',RP.white]}}
      :{fill:{c:RP.light},al:{h:'center'},bd:{bottom:['thin','C7D7F5'],right:['thin',RP.white]}}); if(!on) sh.link(7,c0,name,name); });
  // bandeau de statut (puces) : santé, JEV, TypeSafe, contrôles
  const ok=m.ctl.filter(c=>c.ok).length, crit=m.watch.filter(o=>o.lvl==='CRITICAL').length, dp=m.KP?(m.K.pdo-m.KP.pdo)/(m.KP.pdo||1):0;
  const health=crit>0&&dp>0?['VIGILANCE',RP.alert]:crit>0||dp>0.05?['SOUS SURVEILLANCE',RP.warn]:['STABLE',RP.ok];
  const chips=[['PORTFOLIO STATUS',health[0],health[1]],['JEV · PD 12M',m.jev?riPct(m.jev.ptf.pd[12].v)+' · '+m.jev.ptf.pd[12].prov.source:'non calibré',m.jev?(m.jev.ptf.pd[12].prov.avertissement?RP.warn:RP.bright):RP.neu],
    ['TYPESAFE',m.tsL&&m.tsL.length?fmtN(m.tsL.length)+' retours · '+fmtN(m.tsL.filter(t=>t.statut==='Revue analyste').length)+' en revue':'en attente d\'enrichissement',m.tsL&&m.tsL.length?RP.cyan:RP.neu],['CONTRÔLES',ok+' / '+m.ctl.length+' conformes',ok===m.ctl.length?RP.ok:RP.crit]];
  sh.h(8,5).h(9,19); const ce=chips.map((_,i)=>Math.round(i*W/chips.length)).concat([W]);
  chips.forEach(([l,v,c],i)=>{ const c0=ce[i], c1=ce[i+1]-1; sh.box(9,c0,9,c1,{rich:[['● ',RI_F({sz:9,color:c})],[l+'  ',RI_F({b:1,sz:7,color:RP.neu})],[v,RI_F({b:1,sz:8.5,color:RP.deep})]]},{fill:{c:RP.white},al:{h:'left',indent:1},bd:{top:['thin','DBE6F7'],bottom:['thin','DBE6F7'],left:i?['thin',RP.white]:['thin','DBE6F7'],right:['thin','DBE6F7']}}); });
  sh.h(10,10); return 11; }

function riSection(sh,r,c0,c1,t,sub,col){ sh._sec=(sh._sec||0)+(c0===0?1:0); const n=String(sh._sec).padStart(2,'0');
  sh.h(r,24).box(r,c0,r,c1,{rich:[[(c0===0?n:'·')+'  ',RI_F({b:1,sz:11,color:RP.gold})],[t,RI_F({b:1,sz:11,color:RP.deep})],[sub?'    '+sub:'',RI_F({sz:8,i:1,color:RP.neu})]]},{al:{h:'left',v:'bottom'},bd:{bottom:['thin',col||RP.gold]}}); return r+1; }

function riCard(sh,B,r,c,w,o){ const v=o.variant||'white', dark=v==='blue'||v==='cyan', bg=v==='blue'?{g:[RP.eb,RP.bright],deg:45}:v==='cyan'?{g:[RP.eb,RP.cyan],deg:45}:v==='light'?{g:['FFFFFF',RP.light],deg:90}:{c:RP.white};
  const fg=dark?RP.white:RP.deep, sub=dark?'D6E4FF':RP.neu, edge=o.accent||(dark?RP.gold:RP.eb), c1=c+w-1, line=dark?null:['thin','DBE6F7'];
  const base=x=>Object.assign({fill:bg,bd:Object.assign({left:['thick',edge]},line?{right:line}:{})},x||{});
  sh.box(r,c,r,c1,{rich:[[(o.icon||'◆')+'  ',RI_F({sz:9,color:dark?RP.gold:edge})],[o.t,RI_F({b:1,sz:7.5,color:dark?'E6EEFF':RP.ink2})]]},base({al:{h:'left',indent:1,v:'bottom'},bd:Object.assign({left:['thick',edge],top:line||['thin',RP.eb]},line?{right:line}:{})}));
  sh.box(r+1,c,r+2,c1,o.v,base({font:RI_F({b:1,sz:22,color:fg}),nf:o.nf||RI_NFM,al:{h:'left',indent:1,v:'center'}}));
  sh.box(r+3,c,r+3,c1,o.u||'',base({font:RI_F({sz:7.5,color:sub}),al:{h:'left',indent:1,v:'top'}}));
  const good=o.d==null?null:(o.higherBad?o.d<=0:o.d>=0), col=o.d==null||Math.abs(o.d)<1e-12?(dark?'E6EEFF':RP.neu):good?(dark?'86EFAC':RP.ok):(dark?'FCA5A5':RP.crit);
  const half=Math.max(1,Math.floor(w/2));
  sh.box(r+4,c,r+4,c+half-1,o.d==null?(o.dTxt||'—'):(o.d>0?'▲ ':o.d<0?'▼ ':'■ ')+(o.dTxt||riPct(o.d)),base({font:RI_F({b:1,sz:9.5,color:col}),al:{h:'left',indent:1}}));
  sh.box(r+4,c+half,r+4,c1,'',base({bd:line?{right:line}:{}})); if(o.trend&&o.trend.filter(x=>x!=null).length>1) sh.spark(r+4,c+half,B.series(o.trend,'trend:'+o.t),{color:dark?'FFFFFF':o.spark||RP.bright,last:RP.gold});
  const stt=o.status||(o.d==null?'':good?'● FAVORABLE':Math.abs(o.d)<0.005?'● STABLE':'● À SURVEILLER'), sc=o.statusC||(o.d==null?sub:good?(dark?'86EFAC':RP.ok):Math.abs(o.d)<0.005?sub:(dark?'FCD34D':RP.warn));
  sh.box(r+5,c,r+5,c1,{rich:[[(o.cmp||'')+'   ',RI_F({sz:7,i:1,color:sub})],[stt,RI_F({b:1,sz:7,color:sc})]]},base({al:{h:'left',indent:1,v:'top'},bd:Object.assign({left:['thick',edge],bottom:line||['thin',RP.eb]},line?{right:line}:{})}));
  // ombre portée : colonne de droite et ligne du dessous en dégradé
  for(let i=1;i<=6;i++) sh.set(r+i,c1+1,null,{fill:{g:['C9D5EA','FFFFFF'],deg:0}});
  sh.blk(r+6,c+1,r+6,c1,{fill:{g:['C9D5EA','FFFFFF'],deg:90}});
  [0,1,2,3,4,5].forEach(i=>sh.h(r+i,[17,19,19,13,18,14][i])); sh.h(r+6,5); }
function riCallout(sh,r,c0,c1,o){ const c=o.c||RP.eb;
  sh.h(r,18).h(r+1,26).h(r+2,16);
  sh.box(r,c0,r,c1,{rich:[[(o.icon||'◆')+'  ',RI_F({b:1,sz:10,color:c})],[o.t,RI_F({b:1,sz:8,color:RP.ink2})]]},{fill:{c:RP.white},al:{h:'left',indent:1},bd:{top:['thick',c],left:['thin','DBE6F7'],right:['thin','DBE6F7']}});
  sh.box(r+1,c0,r+1,c1,o.big,{fill:{c:RP.white},font:RI_F({b:1,sz:16,color:c===RP.gold?RP.deep:c}),al:{h:'left',indent:1},bd:{left:['thin','DBE6F7'],right:['thin','DBE6F7']}});
  sh.box(r+2,c0,r+2,c1,o.sub,{fill:{c:RP.white},font:RI_F({sz:7.5,color:RP.neu}),al:{h:'left',indent:1,v:'top'},bd:{bottom:['thin','DBE6F7'],left:['thin','DBE6F7'],right:['thin','DBE6F7']}});
  for(let i=1;i<=3;i++) sh.set(r+i,c1+1,null,{fill:{g:['D5DEEE','FFFFFF'],deg:0}}); }

function riBadge(lvl){ const L=RI_LVL[lvl]||{c:RP.neu,t:lvl||''}; if(lvl==='WATCH') return {fill:{c:RP.light},font:RI_F({b:1,sz:8,color:RP.eb}),al:{h:'center'},bd:{left:['thin','BFD3FF'],right:['thin','BFD3FF']}};
  return {fill:{c:L.c},font:RI_F({b:1,sz:8,color:RP.white}),al:{h:'center'}}; }

function riHeat(v,max){ const t=max>0?Math.min(1,Math.max(0,v/max)):0, stops=[[0,'EAF2FF'],[.35,'2563EB'],[.7,'F97316'],[1,'DC2626']];
  let i=0; while(i<stops.length-2&&t>stops[i+1][0]) i++; const [a,ca]=stops[i],[b,cb]=stops[i+1], f=(t-a)/((b-a)||1), mix=(x,y)=>Math.round(parseInt(x,16)+(parseInt(y,16)-parseInt(x,16))*f).toString(16).padStart(2,'0');
  const hex=(mix(ca.slice(0,2),cb.slice(0,2))+mix(ca.slice(2,4),cb.slice(2,4))+mix(ca.slice(4,6),cb.slice(4,6))).toUpperCase(); return {c:hex,dark:t>0.3}; }
function riTable(sh,r,c0,cols,rows,o){ o=o||{}; // cols: [titre, largeurCols(ignoré), format, align]
  sh.h(r,o.hh||30); cols.forEach((h,j)=>sh.set(r,c0+j,h[0],{fill:{c:o.hdr||RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:h[3]||'left',wrap:1,indent:h[3]?0:1},bd:{bottom:['medium',RP.gold]}}));
  rows.forEach((row,i)=>{ sh.h(r+1+i,o.rh||19); row.forEach((v,j)=>{ const f=cols[j][2]; const zebra=i%2?RP.pale:RP.white; let st={fill:{c:zebra},font:RI_F({sz:9,color:RP.ink}),al:{h:cols[j][3]||'left',indent:cols[j][3]?0:1,wrap:f==='w'?1:0},bd:{bottom:['thin','E6EDF7']}};
    if(f==='m') st=Object.assign(st,{nf:'#,##0',font:RI_F({sz:9,color:RP.ink}),al:{h:'right'}}); if(f==='md') st=Object.assign(st,{nf:RI_NFM,font:RI_F({sz:9,b:1,color:RP.deep}),al:{h:'right'}});
    if(f==='%') st=Object.assign(st,{nf:'0.0%',al:{h:'center'}}); if(f==='%s') st=Object.assign(st,{nf:'+0.0%;-0.0%;0.0%',al:{h:'center'}}); if(f==='d') st=Object.assign(st,{nf:'dd/mm/yyyy',al:{h:'center'}}); if(f==='n') st=Object.assign(st,{nf:'#,##0',al:{h:'center'}});
    if(f==='b') st=v?riBadge(v):st; if(f==='bold') st.font=RI_F({b:1,sz:9,color:RP.deep}); if(f==='st') st=Object.assign(st,{font:RI_F({b:1,sz:8.5,color:{'Revue analyste':RP.crit,'À faire':RP.alert,'Fait':RP.ok,'Régularisé':RP.ok}[v]||RP.eb}),al:{h:'center'}});
    if(f==='bk') st=Object.assign(st,{font:RI_F({b:1,sz:8.5,color:[RP.ok,RP.cyan,RP.warn,RP.alert,RP.crit][RI_BK.indexOf(v)]||RP.ink}),al:{h:'center'}});
    sh.set(r+1+i,c0+j,f==='b'&&v?(RI_LVL[v]?RI_LVL[v].t:v):v,st); }); });
  return r+rows.length; }

/* =====================================================================
   FEUILLES
   ===================================================================== */
function riExec(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.exec,{tab:RP.eb,cols:new Array(W+1).fill(0).map((_,i)=>i===W?1.6:i%5===4?1.6:6.1),zoom:85,a3:false});
  let r=riHeader(sh,m,'exec',nav,W,'CREDIT RISK INTELLIGENCE','Portfolio Monitoring & Early Warning  ·  Vue Comité des Risques');
  const K=m.K, KP=m.KP, tr=k=>m.months.map(x=>x.k[k]), d=k=>KP&&KP[k]?(K[k]-KP[k])/Math.abs(KP[k]):null, cmp=KP?'vs '+m.prevLabel:'aucun arrêté antérieur en mémoire';
  const wEnc=m.watch.reduce((s,o)=>s+o.enc,0), crit=m.watch.filter(o=>o.lvl==='CRITICAL'), cEnc=crit.reduce((s,o)=>s+o.enc,0);
  const pw=m.P?m.P.cli:null;
  const cards=[
    {t:'TOTAL EXPOSURE',v:K.enc,u:'XOF · encours brut · '+fmtN(K.n)+' clients',d:d('enc'),trend:tr('enc'),variant:'blue',icon:'◆'},
    {t:'TOTAL ARREARS',v:K.pdo,u:'XOF · impayés · '+fmtN(K.nArr)+' clients',d:d('pdo'),trend:tr('pdo'),higherBad:1,variant:'white',accent:RP.cyan,icon:'●'},
    {t:'31–60 DAYS',v:K.b2,u:'XOF · encours · '+fmtN(K.nb[2])+' clients',d:d('b2'),trend:tr('b2'),higherBad:1,variant:'light',accent:RP.warn,icon:'◔'},
    {t:'61–90 DAYS',v:K.b3,u:'XOF · encours · '+fmtN(K.nb[3])+' clients',d:d('b3'),trend:tr('b3'),higherBad:1,variant:'white',accent:RP.alert,icon:'◑'},
    {t:'> 90 DAYS / S3',v:K.b4,u:'XOF · encours · '+fmtN(K.nb[4])+' clients',d:d('b4'),trend:tr('b4'),higherBad:1,variant:'light',accent:RP.crit,icon:'●'},
    {t:'STAGE 2',v:K.s2,u:'XOF · '+riPct(K.s2/(K.enc||1))+' de l\'encours',d:d('s2'),trend:tr('s2'),higherBad:1,variant:'white',accent:RP.gold,icon:'▲'},
    {t:'STAGE 3',v:K.s3,u:'XOF · '+riPct(K.s3/(K.enc||1))+' de l\'encours',d:d('s3'),trend:tr('s3'),higherBad:1,variant:'light',accent:RP.crit,icon:'▲'},
    {t:'PROVISIONS (ECL)',v:K.ecl,u:'XOF · couverture '+riPct(K.ecl/(K.enc||1)),d:d('ecl'),trend:tr('ecl'),higherBad:1,variant:'cyan',icon:'◆'},
    {t:'WATCHLIST',v:m.watch.length,nf:'#,##0',u:'dossiers · '+riMd(wEnc)+' XOF',d:null,dTxt:'',variant:'white',accent:RP.warn,icon:'◉'},
    {t:'CRITICAL EXPOSURES',v:cEnc,u:'XOF · '+fmtN(crit.length)+' dossiers critiques',d:null,variant:'blue',accent:RP.crit,icon:'■'}];
  sh.h(r,6); r++;
  cards.forEach((o,i)=>{ const row=r+Math.floor(i/5)*8, col=(i%5)*5-(i%5===0?0:0); o.cmp=cmp; riCard(sh,B,row,col,4,o); });
  sh.h(r+7,10); sh.h(r+15,12); r+=16;
  // callouts : concentration, mouvement favorable, perspective JEV
  const tp=m.top5P!=null?(m.top5-m.top5P)*100:null, cur=m.cured, rec=cur.reduce((s,o)=>s+(o.p?o.p.pdo:0),0), J=m.jev;
  riCallout(sh,r,0,8,{icon:'⚠',t:'CONCENTRATION ALERT',c:m.top5>0.25?RP.alert:RP.gold,big:'TOP 5 CLIENTS = '+riPct(m.top5),sub:tp==null?'aucun arrêté antérieur':(tp>=0?'+':'')+tp.toFixed(1).replace('.',',')+' pts vs '+m.prevLabel});
  riCallout(sh,r,10,18,cur.length?{icon:'✓',t:'POSITIVE MOVEMENT',c:RP.ok,big:fmtN(cur.length)+' dossiers régularisés',sub:riMd(rec)+' XOF d\'impayés résorbés depuis le '+m.prevLabel}
    :{icon:'▲',t:'NEW ARREARS',c:RP.crit,big:riSg(m.wf.nouv+m.wf.det,riMd)+' XOF',sub:'nouveaux impayés et aggravations · aucune régularisation sur la période'});
  sh.h(r,18); const jp=J?J.ptf.pd[12]:null;
  riCallout(sh,r,20,23,{icon:'✦',t:'JEV OUTLOOK',c:RP.bright,big:jp?'PD 12M '+riPct(jp.v):'—',sub:jp?jp.prov.source+' · confiance '+jp.prov.confiance+(jp.prov.avertissement?' · indicatif':''):'archive insuffisante'});
  r+=4;
  // tendance + distribution
  sh.brk(r); r=riSection(sh,r,0,14,'PORTFOLIO TREND','encours (aire) · impayés, Stage 2, Stage 3 (courbes, axe droit)',RP.eb); riSection(sh,r-1,16,23,'RISK DISTRIBUTION','encours par stage IFRS 9',RP.gold);
  const cats=m.months.map(x=>x.label.slice(0,5)+'/'+x.label.slice(8,10));
  sh.chart({type:'combo',cats,area:{name:'Encours',v:tr('enc'),color:'60A5FA'},lines:[{name:'Impayés',v:tr('pdo'),color:RP.cyan,w:31750},{name:'Stage 2',v:tr('s2'),color:RP.gold},{name:'Stage 3',v:tr('s3'),color:RP.crit}],nf1:RI_NFM,nf2:RI_NFM},r,0,r+15,15);
  const sv=[K.enc-K.s2-K.s3,K.s2,K.s3], tot=sv.reduce((a,b)=>a+b,0)||1;
  sh.chart({type:'doughnut',title:'',cats:['Stage 1','Stage 2','Stage 3'],hole:64,series:[{name:'Encours',v:sv,pts:[RP.eb,RP.gold,RP.crit],labels:{pct:1,nf:'0%',col:RP.white,b:1,sz:900,custom:sv.map((x,i)=>x/tot<0.04?`<c:dLbl><c:idx val="${i}"/><c:delete val="1"/></c:dLbl>`:'').join('')}}]},r,16,r+15,24);
  r+=16;
  // pont des impayés + moteurs
  r=riSection(sh,r,0,14,'WHY DID IT MOVE?','pont des impayés '+(m.prevLabel?m.prevLabel+' → '+m.label:''),RP.cyan); riSection(sh,r-1,16,23,'TOP DRIVERS','plus fortes variations d\'impayés',RP.cyan);
  riWaterfall(sh,m,r,0,r+15,15);
  let rr=r; m.drivers.slice(0,7).forEach((o,i)=>{ const y=rr+i*2; sh.h(y,17).h(y+1,13);
    sh.box(y,16,y,20,o.rel,{font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1},bd:{left:['thick',o.dPdo>0?RP.crit:RP.ok]}});
    sh.box(y,21,y,23,riSg(o.dPdo,riMd),{font:RI_F({b:1,sz:10,color:o.dPdo>0?RP.crit:RP.ok}),al:{h:'right'}});
    sh.box(y+1,16,y+1,23,`${riMd(o.pdo)} XOF d'impayés · ${o.dj} j · Stage ${o.stage} · ${o.off||''}`,{font:RI_F({sz:7.5,color:RP.neu}),al:{h:'left',indent:1,v:'top'},bd:{left:['thick',o.dPdo>0?RP.crit:RP.ok]}}); });
  if(!m.drivers.length) sh.box(rr,16,rr+3,23,'Aucun arrêté antérieur en mémoire : les moteurs de variation apparaîtront au prochain chargement.',{font:RI_F({sz:9,i:1,color:RP.neu}),al:{wrap:1}});
  r+=16;
  // top risques + actions
  sh.brk(r); r=riSection(sh,r,0,14,'TOP RISKS','dossiers prioritaires classés par criticité puis impayé',RP.crit); riSection(sh,r-1,16,23,'ACTIONS REQUIRED','tableau de bord du plan d\'actions',RP.gold);
  m.risky.slice(0,4).forEach((o,i)=>{ const y=r+i*4;
    sh.box(y,0,y+2,1,'#'+String(i+1).padStart(2,'0'),{font:RI_F({b:1,sz:18,color:RP.gold}),al:{h:'center'}});
    sh.box(y,2,y,9,o.rel,{font:RI_F({b:1,sz:10.5,color:RP.deep}),al:{h:'left'}});
    sh.box(y+1,2,y+1,9,{rich:[[riMd(o.enc)+' XOF',RI_F({b:1,sz:9,color:RP.eb})],['  ·  '+o.dj+' j  ·  Stage '+o.stage+'  ·  ',RI_F({sz:8.5,color:RP.ink2})],[o.dPdo>0?'▲ '+riMd(o.dPdo):o.dPdo<0?'▼ '+riMd(-o.dPdo):'■ stable',RI_F({b:1,sz:8.5,color:o.dPdo>0?RP.crit:RP.ok})]]},{al:{h:'left'}});
    sh.box(y+2,2,y+2,9,(o.pd12!=null?'JEV PD 12M '+riPct(o.pd12)+' ('+o.pdSrc+')  ·  ':'')+(o.ts&&o.ts.routage?'→ '+o.ts.routage+'  ·  ':'')+o.action,{font:RI_F({sz:7.5,i:1,color:RP.neu}),al:{h:'left'}});
    sh.box(y,10,y+1,11,'',{}); if(o.trend.filter(x=>x!=null).length>1) sh.spark(y,10,B.series(o.trend,'imp:'+o.clc),{color:RP.crit,last:RP.gold});
    sh.box(y,12,y,14,RI_LVL[o.lvl].t,riBadge(o.lvl)); sh.box(y+1,12,y+1,14,o.lvl==='CRITICAL'?'ACTION REQUIRED':o.lvl==='HIGH'?'SOUS 7 JOURS':'SURVEILLANCE',{font:RI_F({b:1,sz:7.5,color:RI_LVL[o.lvl].c}),al:{h:'center'}});
    sh.blk(y+3,0,y+3,14,{bd:{top:['thin','E2E8F0']}}); });
  ['CRITICAL','HIGH','WATCH','CURED'].forEach((L,i)=>{ const y=r+i*4, list=L==='CURED'?m.cured:m.watch.filter(o=>o.lvl===L), enc=list.reduce((s,o)=>s+(L==='CURED'&&o.p?o.p.pdo:o.enc),0), done=list.length?list.reduce((s,o)=>s+o.prog,0)/list.length:0;
    sh.h(y,19).h(y+1,17).h(y+2,14).h(y+3,7);
    sh.box(y,16,y+1,17,list.length,{fill:{c:RI_LVL[L].c},font:RI_F({b:1,sz:18,color:RP.white}),nf:'#,##0',al:{h:'center'}});
    sh.box(y,18,y,23,{rich:[[RI_LVL[L].t,RI_F({b:1,sz:9.5,color:RI_LVL[L].c})],['  ·  '+RI_LVL[L].fr,RI_F({sz:8.5,color:RP.ink2})]]},{al:{h:'left',indent:1}});
    sh.box(y+1,18,y+1,23,(L==='CURED'?'impayés résorbés ':'encours ')+riMd(enc)+' XOF',{font:RI_F({sz:8.5,color:RP.ink2}),al:{h:'left',indent:1}});
    sh.box(y+2,18,y+2,21,'',{fill:{c:RP.soft}}); sh.set(y+2,18,done,{fill:{c:RP.soft},nf:'0%',font:RI_F({sz:7,color:RP.ink2}),al:{h:'left'}}); sh.dataBar(rxRef(y+2,18),RI_LVL[L].c,1);
    sh.box(y+2,22,y+2,23,'avancement',{font:RI_F({sz:7,color:RP.neu}),al:{h:'left'}}); });
  r+=18;
  // insights condensés
  r=riSection(sh,r,0,23,'KEY INSIGHTS','calculés sur les données de l\'arrêté',RP.gold);
  m.ins.slice(0,4).forEach((x,i)=>{ const c=i*6; sh.h(r,16).h(r+1,22).h(r+2,46);
    sh.box(r,c,r,c+5,{rich:[[x.n+'  ',RI_F({b:1,sz:12,color:RP.gold})],[x.t,RI_F({b:1,sz:8.5,color:RP.ink2})]]},{al:{h:'left',indent:1},bd:{top:['thick',x.c]}});
    sh.box(r+1,c,r+1,c+5,x.big,{font:RI_F({b:1,sz:13,color:x.c}),al:{h:'left',indent:1}});
    sh.box(r+2,c,r+2,c+5,x.p,{font:RI_F({sz:7.5,color:RP.ink2}),al:{h:'left',v:'top',wrap:1,indent:1}}); });
  sh.o.printArea='$A$1:$X$'+(r+3); return sh; }
function riWaterfall(sh,m,r1,c1,r2,c2,big){ const w=m.wf; if(!m.P){ sh.box(r1,c1,r1+3,c2-1,'Aucun arrêté antérieur en mémoire : le pont des impayés sera affiché au prochain chargement.',{font:RI_F({sz:9,i:1,color:RP.neu}),al:{wrap:1}}); return; }
  const steps=[['Ouverture',w.open,'t',RP.eb],['Nouveaux impayés',w.nouv,'d',RP.crit],['Détériorations',w.det,'d',RP.alert],['Nouveaux clients',w.entree,'d',RP.cyan],['Régularisations',w.cure,'d',RP.ok],['Remb. partiels',w.pay,'d','22C55E'],['Sorties',w.sortie,'d',RP.cyan],['Clôture',w.close,'t',RP.gold]].filter((s,i)=>s[2]==='t'||Math.abs(s[1])>0);
  let run=0; const base=[], val=[], cols=[], lab=[];
  steps.forEach(([l,v,t,c])=>{ if(t==='t'){ base.push(0); val.push(v); run=v; lab.push(riMd(v)); } else { const a=run, b=run+v; base.push(Math.min(a,b)); val.push(Math.abs(v)); run=b; lab.push((v>0?'+':'−')+riMd(Math.abs(v))); } cols.push(c); });
  const custom=lab.map((t,i)=>`<c:dLbl><c:idx val="${i}"/>${rxRich(t,800,'0F172A',1)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:dLblPos val="inEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>`).join('');
  sh.chart({type:'waterfall',cats:steps.map(s=>s[0]),gap:40,nf:RI_NFM,series:[{name:'base',v:base,base:true},{name:'Mouvement',v:val,pts:cols,gradPts:1,labels:{val:1,custom,sz:800,pos:'inEnd'}}]},r1,c1,r2,c2); }

function riRisk(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.risk,{tab:RP.bright,cols:new Array(W).fill(5.4),zoom:85}); let r=riHeader(sh,m,'risk',nav,W,'RISK ANALYTICS','Heatmaps, matrice de risque et distribution');
  // heatmap segment × tranche (encours)
  const segs=m.seg.slice(0,10).map(s=>s.k); r=riSection(sh,r,0,23,'HEATMAP · SEGMENT × TRANCHE D\'IMPAYÉ','encours XOF par tranche (bleu clair → bleu → orange → rouge)',RP.eb);
  const hm=segs.map(s=>RI_BK.map((_,b)=>m.cl.filter(o=>(o.bseg||'—')===s&&o.b===b).reduce((a,o)=>a+o.enc,0)));
  r=riHeatmap(sh,r,segs,RI_BK,hm,'Segment');
  r+=1; r=riSection(sh,r,0,23,'HEATMAP · SEGMENT × STAGE IFRS 9','encours XOF',RP.eb);
  const hs=segs.map(s=>[1,2,3].map(st=>m.cl.filter(o=>(o.bseg||'—')===s&&(st===3?(o.stage===3||o.npl):o.stage===st&&!o.npl)).reduce((a,o)=>a+o.enc,0)));
  r=riHeatmap(sh,r,segs,['Stage 1','Stage 2','Stage 3'],hs,'Segment');
  r+=1; r=riSection(sh,r,0,23,'HEATMAP · GESTIONNAIRE × CRITICITÉ','nombre de dossiers suivis',RP.eb);
  const offs=[...new Set(m.watch.concat(m.cured).map(o=>o.off||'—'))].slice(0,14), lv=['CRITICAL','HIGH','WATCH','CURED'];
  r=riHeatmap(sh,r,offs,lv.map(l=>RI_LVL[l].t),offs.map(g=>lv.map(l=>(l==='CURED'?m.cured:m.watch).filter(o=>(o.off||'—')===g&&o.lvl===l).length)),'Gestionnaire',true);
  // matrice de risque
  r+=1; sh.brk(r); r=riSection(sh,r,0,23,'RISK MATRIX','niveau de risque × taille d\'exposition · clients, encours, impayés',RP.gold);
  const ex=['LOW EXPOSURE\n< 100 M','MEDIUM EXPOSURE\n100 M – 1 Md','HIGH EXPOSURE\n≥ 1 Md'], rk=['HIGH RISK','MEDIUM RISK','LOW RISK'], tone=[[RP.warn,RP.alert,RP.crit],['FDE68A',RP.warn,RP.alert],['DCFCE7','BBF7D0',RP.warn]];
  sh.h(r,30); ex.forEach((e,j)=>sh.box(r,4+j*6,r,9+j*6,e,{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'center',wrap:1}}));
  [2,1,0].forEach((ri,i)=>{ const y=r+1+i*3; sh.h(y,22).h(y+1,20).h(y+2,18); sh.box(y,0,y+2,3,rk[i],{fill:{c:[RP.crit,RP.warn,RP.ok][i]},font:RI_F({b:1,sz:9,color:RP.white}),al:{h:'center',wrap:1}});
    [0,1,2].forEach(j=>{ const c=m.rm[ri][j], col=tone[i][j], dark=[RP.crit,RP.alert,RP.warn].includes(col); const st={fill:{c:col},al:{h:'center'},bd:{right:['medium',RP.white],bottom:['medium',RP.white]}};
      sh.box(y,4+j*6,y,9+j*6,fmtN(c.n)+' clients',Object.assign({},st,{font:RI_F({b:1,sz:12,color:dark?RP.white:RP.deep})}));
      sh.box(y+1,4+j*6,y+1,9+j*6,riMd(c.enc)+' XOF d\'encours',Object.assign({},st,{font:RI_F({sz:9,color:dark?RP.white:RP.ink2})}));
      sh.box(y+2,4+j*6,y+2,9+j*6,'impayés '+riMd(c.pdo),Object.assign({},st,{font:RI_F({sz:8,i:1,color:dark?'FFF7ED':RP.neu})})); }); });
  r+=11;
  // distribution par tranche
  r=riSection(sh,r,0,23,'DISTRIBUTION PAR TRANCHE','encours et nombre de clients',RP.cyan);
  sh.chart({type:'col',cats:RI_BK,nf:RI_NFM,series:[{name:'Encours',v:m.K.eb,pts:[RP.ok,RP.cyan,RP.warn,RP.alert,RP.crit],gradPts:1,labels:{val:1,nf:RI_NFM,pos:'outEnd',sz:800,b:1,col:RP.deep}}],max:Math.max(...m.K.eb)*1.2||1,min:0},r,0,r+14,12);
  sh.chart({type:'col',cats:RI_BK,nf:'#,##0',series:[{name:'Clients',v:m.K.nb,pts:[RP.ok,RP.cyan,RP.warn,RP.alert,RP.crit],gradPts:1,labels:{val:1,nf:'#,##0',pos:'outEnd',sz:800,b:1,col:RP.deep}}],max:Math.max(...m.K.nb)*1.2||1,min:0},r,12,r+14,24);
  return sh; }
function riHeatmap(sh,r,rows,cols,vals,lab,count){ const max=Math.max(1,...vals.flat()), cw=Math.max(2,Math.floor(19/cols.length));
  sh.h(r,26).box(r,0,r,4,lab,{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'left',indent:1}});
  cols.forEach((c,j)=>sh.box(r,5+j*cw,r,4+(j+1)*cw,c,{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'center',wrap:1}}));
  rows.forEach((rw,i)=>{ const y=r+1+i; sh.h(y,21); sh.box(y,0,y,4,rw,{fill:{c:i%2?RP.pale:RP.white},font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1},bd:{bottom:['thin',RP.white]}});
    cols.forEach((_,j)=>{ const v=vals[i][j], h=riHeat(v,max); sh.box(y,5+j*cw,y,4+(j+1)*cw,v||'',{fill:{c:v?h.c:RP.off},font:RI_F({b:1,sz:9,color:h.dark?RP.white:RP.deep}),nf:count?'#,##0':RI_NFM,al:{h:'center'},bd:{right:['medium',RP.white],bottom:['medium',RP.white]}}); }); });
  return r+rows.length+1; }

function riMov(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.mov,{tab:RP.cyan,cols:new Array(W).fill(5.4),zoom:85}); let r=riHeader(sh,m,'mov',nav,W,'PORTFOLIO MOVEMENT',m.prevLabel?'Du '+m.prevLabel+' au '+m.label:'L\'histoire du portefeuille');
  r=riSection(sh,r,0,23,'FLUX DES IMPAYÉS','nombre de clients et montants · '+(m.P?'N-1 = '+m.prevLabel:'pas d\'arrêté antérieur'),RP.cyan);
  const F=m.flow, st=[['OPENING',F.open,RP.eb,'clients en impayé · impayés'],['NEW ARREARS',F.nouv,RP.crit,'entrés en impayé · impayés'],['→ 31-60 J',F.to2,RP.warn,'entrés en tranche · encours'],['→ 61-90 J',F.to3,RP.alert,'entrés en tranche · encours'],['→ > 90 J',F.to4,RP.crit,'entrés en tranche · encours'],['→ STAGE 3',F.s3,'991B1B','nouveaux Stage 3 · encours'],['CURES',F.cure,RP.ok,'revenus à jour · impayés résorbés'],['CLOSING',F.close,RP.gold,'clients en impayé · impayés']];
  sh.h(r,18).h(r+1,26).h(r+2,18).h(r+3,26);
  st.forEach(([t,v,c,u],i)=>{ const c0=i*3, dark=c!==RP.gold;
    sh.box(r,c0,r,c0+2,t,{fill:{c},font:RI_F({b:1,sz:8,color:RP.white}),al:{h:'center'},bd:{right:['medium',RP.white]}});
    sh.box(r+1,c0,r+1,c0+2,v.n,{fill:{c:RP.light},font:RI_F({b:1,sz:16,color:c===RP.gold?RP.deep:c}),nf:'#,##0',al:{h:'center'},bd:{right:['medium',RP.white]}});
    sh.box(r+2,c0,r+2,c0+2,riMd(v.enc),{fill:{c:RP.light},font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'center'},bd:{right:['medium',RP.white]}});
    sh.box(r+3,c0,r+3,c0+2,u,{fill:{c:RP.pale},font:RI_F({sz:7,color:RP.neu}),al:{h:'center',wrap:1},bd:{right:['medium',RP.white]}}); });
  r+=5;
  // récit proportionnel : chaque étape porte une barre à l'échelle du montant
  if(m.P){ r=riSection(sh,r,0,23,'THE STORY OF THE MONTH','impayés XOF · barres proportionnelles · entrées en rouge, sorties en vert',RP.cyan);
    const W2=m.wf, migA=m.cl.filter(o=>o.mig&&o.p&&o.p.pdo>0).reduce((s,o)=>s+o.pdo,0), migN=m.cl.filter(o=>o.mig).length;
    sh.h(r,6); r++; const story=[['◆','OPENING','impayés au '+m.prevLabel,W2.open,RP.eb,'',m.flow.open.n],['＋','NEW ARREARS','clients entrés en impayé',W2.nouv,RP.crit,'+',m.flow.nouv.n],['⇣','MIGRATIONS','dont dossiers passés en tranche plus dégradée (non additif)',migA,RP.cyan,'≈',migN],
      ['＋','AGGRAVATIONS','hausse des impayés existants',W2.det,RP.alert,'+',m.cl.filter(o=>o.p&&o.p.pdo>0&&o.pdo>o.p.pdo).length],['＋','NEW CLIENTS','impayés de nouveaux clients',W2.entree,RP.cyan,'+',m.cl.filter(o=>!o.p&&o.pdo>0).length],
      ['−','CURES','dossiers revenus à jour',-W2.cure,RP.ok,'−',m.cured.length],['−','PAYMENTS','remboursements partiels',-W2.pay,'22C55E','−',m.cl.filter(o=>o.p&&o.pdo>0&&o.pdo<o.p.pdo).length],['−','EXITS','sorties du portefeuille',-W2.sortie,RP.cyan,'−',m.lostCli.length],['■','CLOSING','impayés au '+m.label,W2.close,RP.gold,'',m.flow.close.n]];
    const mx=Math.max(...story.map(x=>Math.abs(x[3])))||1;
    story.forEach(([ic,t,u,v,c,sg,n],i)=>{ const y=r+i, tot=t==='OPENING'||t==='CLOSING'; sh.h(y,tot?28:25);
      sh.box(y,0,y,0,ic,{fill:{c},font:RI_F({b:1,sz:10,color:RP.white}),al:{h:'center'}});
      sh.box(y,1,y,4,{rich:[[t,RI_F({b:1,sz:9,color:tot?RP.deep:c})],['\n'+u,RI_F({sz:6.5,color:RP.neu})]]},{fill:{c:tot?RP.light:RP.white},al:{h:'left',indent:1,wrap:1},bd:{bottom:['thin','EEF2F7']}});
      sh.box(y,5,y,7,(sg&&v?sg+' ':'')+riMd(Math.abs(v)),{fill:{c:tot?RP.light:RP.white},font:RI_F({b:1,sz:tot?11:9.5,color:tot?RP.deep:c}),al:{h:'right'},bd:{bottom:['thin','EEF2F7']}});
      sh.box(y,8,y,20,Math.abs(v),{fill:{c:tot?RP.light:RP.white},nf:';;;',bd:{bottom:['thin','EEF2F7']}}); sh.addCf(rxRef(y,8),`<cfRule type="dataBar" priority="PRIO"><dataBar showValue="0"><cfvo type="num" val="0"/><cfvo type="num" val="${mx}"/><color rgb="${rxHex(c)}"/></dataBar></cfRule>`);
      sh.box(y,21,y,23,n!=null?fmtN(n)+' dossiers':'',{fill:{c:tot?RP.light:RP.white},font:RI_F({sz:8,color:RP.neu}),al:{h:'right'},bd:{bottom:['thin','EEF2F7']}}); });
    r+=story.length+1; }
  r=riSection(sh,r,0,23,'WHY DID IT MOVE?','pont des impayés · bleu = base, rouge = détérioration, vert = amélioration, cyan = mouvements de périmètre, or = résultat',RP.cyan);
  riWaterfall(sh,m,r,0,r+17,24); r+=18;
  sh.brk(r); r=riSection(sh,r,0,23,'MATRICE DE MIGRATION','clients par tranche · N-1 en ligne, N en colonne · taux de migration',RP.eb);
  if(m.P){ const vals=m.mx.map(row=>row.map(c=>c.n)); r=riHeatmap(sh,r,RI_BK.map(b=>'N-1 · '+b),RI_BK.map(b=>'N · '+b),vals,'Tranche',true);
    sh.h(r,20).box(r,0,r,23,{rich:[['Taux de migration vers une tranche plus dégradée : ',RI_F({sz:9,color:RP.ink2})],[riPct(m.up/(m.nPrev||1)),RI_F({b:1,sz:11,color:RP.crit})],['   ·   amélioration : ',RI_F({sz:9,color:RP.ink2})],[riPct(m.down/(m.nPrev||1)),RI_F({b:1,sz:11,color:RP.ok})],['   ·   '+fmtN(m.nPrev)+' clients présents aux deux arrêtés',RI_F({sz:8.5,color:RP.neu})]]},{al:{h:'left',indent:1}}); r+=2; }
  if(m.jev){ const J=m.jev, p=J.ptf; sh.brk(r); r=riSection(sh,r,0,23,'FORWARD VIEW · JEV','ce qui pourrait arriver ensuite · chaque probabilité porte sa provenance',RP.bright);
    const fv=[['PD 3M (sains)',riPct(p.pd[3].v),p.pd[3].prov],['PD 6M (sains)',riPct(p.pd[6].v),p.pd[6].prov],['PD 12M (sains)',riPct(p.pd[12].v),p.pd[12].prov],['Entrées douteux 12M · central',riMd(J.scen[0].esp),J.scen[0].prov],['Entrées douteux 12M · sévère (P95)',riMd(J.scen[2].p95),J.scen[2].prov]];
    sh.h(r,16).h(r+1,26).h(r+2,24);
    fv.forEach(([t,v,pv],i)=>{ const c0=i*5, c1=i===4?23:c0+3; sh.box(r,c0,r,c1,t,{fill:{g:[RP.eb,RP.bright],deg:0},font:RI_F({b:1,sz:7.5,color:RP.white}),al:{h:'left',indent:1}});
      sh.box(r+1,c0,r+1,c1,v,{fill:{c:RP.light},font:RI_F({b:1,sz:15,color:RP.deep}),al:{h:'left',indent:1}});
      sh.box(r+2,c0,r+2,c1,pv.source+' · N = '+fmtN(pv.n)+' · '+pv.periodes+' mois · confiance '+pv.confiance,{fill:{c:RP.pale},font:RI_F({sz:6.5,color:RP.neu}),al:{h:'left',indent:1,wrap:1}}); });
    r+=3; if(p.pd[12].prov.avertissement){ sh.h(r,18).box(r,0,r,23,'⚠  '+p.pd[12].prov.avertissement,{fill:{c:'FEF3C7'},font:RI_F({b:1,sz:8.5,color:'92400E'}),al:{h:'left',indent:1},bd:{left:['thick',RP.warn]}}); r++; }
    r++; }
  r=riSection(sh,r,0,23,'TENDANCE MENSUELLE','impayés et clients en impayé',RP.eb);
  const cats=m.months.map(x=>x.label);
  sh.chart({type:'col',cats,nf:RI_NFM,series:[{name:'Impayés',v:m.months.map(x=>x.k.pdo),color:RP.cyan,labels:{val:1,nf:RI_NFM,pos:'outEnd',sz:750,col:RP.deep}}],max:Math.max(...m.months.map(x=>x.k.pdo))*1.2||1,min:0},r,0,r+14,12);
  sh.chart({type:'stack',cats,nf:RI_NFM,legend:true,series:[1,2,3,4].map(b=>({name:RI_BK[b],v:m.months.map(x=>x.k.eb[b]),color:[0,RP.cyan,RP.warn,RP.alert,RP.crit][b]}))},r,12,r+14,24);
  return sh; }

function riConc(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.conc,{tab:RP.gold,cols:new Array(W+1).fill(0).map((_,i)=>i===W?1.6:i%5===4?1.6:6.1),zoom:85}); let r=riHeader(sh,m,'conc',nav,W,'RISK CONCENTRATION','Top clients, segments, gestionnaires, secteurs et produits');
  const K=m.K; sh.h(r,6); r++;
  [['TOP 10 CLIENTS',m.t10/(K.enc||1),'0.0%',riMd(m.t10)+' XOF','blue'],['TOP 1 CLIENT',m.top10[0]?m.top10[0].enc/(K.enc||1):0,'0.0%',m.top10[0]?m.top10[0].rel:'—','white'],['INDICE HHI',m.hhi*10000,'#,##0',m.hhi*10000>1500?'concentration élevée (> 1 500)':m.hhi*10000>1000?'concentration modérée':'portefeuille diversifié','light'],['TOP SEGMENT',m.seg[0]?m.seg[0].enc/(K.enc||1):0,'0.0%',m.seg[0]?m.seg[0].k:'—','white'],['TOP GESTIONNAIRE',m.off[0]?m.off[0].enc/(K.enc||1):0,'0.0%',m.off[0]?m.off[0].k:'—','cyan']]
    .forEach(([t,v,nf,u,va],i)=>riCard(sh,B,r,i*5,4,{t,v,nf,u,variant:va,d:null,dTxt:'',cmp:'part de l\'encours total',status:' '}));
  r+=8;
  { const tp=m.top5P!=null?(m.top5-m.top5P)*100:null;
    riCallout(sh,r,0,8,{icon:'⚠',t:'CONCENTRATION ALERT',c:m.top5>0.25?RP.alert:RP.gold,big:'TOP 5 CLIENTS = '+riPct(m.top5),sub:tp==null?'aucun arrêté antérieur':(tp>=0?'+':'')+tp.toFixed(1).replace('.',',')+' pts vs '+m.prevLabel});
    riCallout(sh,r,10,18,{icon:'◎',t:'DIVERSIFICATION',c:RP.bright,big:'HHI = '+fmtN(Math.round(m.hhi*10000)),sub:m.hhi*10000>1500?'concentration élevée (> 1 500)':m.hhi*10000>1000?'concentration modérée (1 000 – 1 500)':'portefeuille diversifié (< 1 000)'}); r+=4; }
  // heatmap : concentration par dimension
  { r=riSection(sh,r,0,23,'HEATMAP · CONCENTRATION PAR DIMENSION','part de l\'encours portée par les 1, 3 et 5 premiers éléments',RP.gold);
    const dims=[['Clients',[...m.cl].sort((a,b)=>b.enc-a.enc)],['Segments',m.seg],['Gestionnaires',m.off],['Secteurs',m.sec],['Produits',m.prod]].map(([k,a])=>[k,[1,3,5].map(n=>a.slice(0,n).reduce((s,x)=>s+x.enc,0)/(m.K.enc||1)),a.length]);
    sh.h(r,24).box(r,0,r,4,'Dimension',{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'left',indent:1}});
    ['TOP 1','TOP 3','TOP 5','Éléments'].forEach((h,j)=>sh.box(r,5+j*5,r,9+j*5-(j===3?1:0),h,{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'center'}}));
    dims.forEach(([k,v,n],i)=>{ const y=r+1+i; sh.h(y,21); sh.box(y,0,y,4,k,{fill:{c:i%2?RP.pale:RP.white},font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1}});
      v.forEach((x,j)=>{ const h=riHeat(x,1); sh.box(y,5+j*5,y,9+j*5,x,{fill:{c:h.c},font:RI_F({b:1,sz:9.5,color:h.dark?RP.white:RP.deep}),nf:'0.0%',al:{h:'center'},bd:{right:['medium',RP.white],bottom:['medium',RP.white]}}); });
      sh.box(y,20,y,23,n,{fill:{c:i%2?RP.pale:RP.white},font:RI_F({sz:9,color:RP.ink2}),nf:'#,##0',al:{h:'center'}}); });
    r+=dims.length+2; }
  r=riSection(sh,r,0,23,'PARETO · TOP 10 CLIENTS','encours et part cumulée',RP.gold);
  let cum=0; const cu=m.top10.map(o=>(cum+=o.enc)/(K.enc||1));
  sh.chart({type:'pareto',cats:m.top10.map(o=>o.rel.slice(0,22)),nf:RI_NFM,series:[{name:'Encours',v:m.top10.map(o=>o.enc),color:RP.eb},{name:'Part cumulée',v:cu,color:RP.gold,nf:'0%'}]},r,0,r+16,15);
  const tb=m.top10.slice(0,10).map((o,i)=>[i+1,o.rel,o.enc,o.enc/(K.enc||1)]);
  riTable(sh,r,16,[['#',0,'n','center'],['Client',0,'bold'],['',0,''],['',0,''],['',0,''],['Encours',0,'md','right'],['',0,''],['Part',0,'%','center']],[],{hh:22});
  // tableau compact sur 8 colonnes (fusions)
  tb.forEach((row,i)=>{ const y=r+1+i; sh.h(y,19); const z=i%2?RP.pale:RP.white;
    sh.set(y,16,row[0],{fill:{c:z},font:RI_F({b:1,sz:9,color:RP.gold}),al:{h:'center'}}); sh.box(y,17,y,20,row[1],{fill:{c:z},font:RI_F({b:1,sz:8.5,color:RP.deep}),al:{h:'left'}});
    sh.box(y,21,y,22,row[2],{fill:{c:z},nf:RI_NFM,font:RI_F({sz:8.5,color:RP.ink}),al:{h:'right'}}); sh.set(y,23,row[3],{fill:{c:z},nf:'0.0%',font:RI_F({sz:8.5,color:RP.ink}),al:{h:'center'}}); });
  sh.box(r,17,r,20,'Client',{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'left'},bd:{bottom:['medium',RP.gold]}}); sh.box(r,21,r,22,'Encours',{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'right'},bd:{bottom:['medium',RP.gold]}});
  sh.dataBar(rxRef(r+1,23)+':'+rxRef(r+10,23),RP.gold); r+=17;
  sh.brk(r); r=riSection(sh,r,0,11,'TOP SEGMENTS','encours',RP.eb); riSection(sh,r-1,12,23,'TOP GESTIONNAIRES','encours',RP.eb);
  const hb=(arr,c1,c2,col)=>sh.chart({type:'bar',cats:arr.map(x=>String(x.k).slice(0,24)),nf:RI_NFM,hideVal:true,series:[{name:'Encours',v:arr.map(x=>x.enc),color:col,labels:{val:1,nf:RI_NFM,pos:'outEnd',sz:750,col:RP.deep}}],max:Math.max(...arr.map(x=>x.enc))*1.25||1},r,c1,r+13,c2);
  hb(m.seg.slice(0,8),0,12,RP.eb); hb(m.off.slice(0,8),12,24,RP.cyan); r+=14;
  r=riSection(sh,r,0,11,'SECTEURS','encours',RP.eb); riSection(sh,r-1,12,23,'PRODUITS','encours',RP.eb);
  hb(m.sec.slice(0,8),0,12,RP.bright); hb(m.prod.slice(0,8),12,24,RP.gold); r+=14;
  sh.brk(r); r=riSection(sh,r,0,23,'BUBBLE MAP · CONCENTRATION × ÉVOLUTION','top 20 clients · position = part de l\'encours et variation N-1 · taille = exposition · couleur = risque',RP.crit);
  const bb=[...m.cl].sort((a,b)=>b.enc-a.enc).slice(0,20);
  if(bb.length) sh.chart({type:'bubble',nfx:'0.0%',nfy:'+0%;-0%;0%',scale:55,series:[{name:'Clients',x:bb.map(o=>o.enc/(m.K.enc||1)),y:bb.map(o=>o.p&&o.p.enc?(o.enc-o.p.enc)/o.p.enc:0),z:bb.map(o=>o.enc),pts:bb.map(o=>o.lvl&&o.lvl!=='CURED'?RI_LVL[o.lvl].c:o.lvl==='CURED'?RP.ok:RP.eb),tags:bb.map((o,i)=>i<5?o.rel.slice(0,14):'')}]},r,0,r+18,24);
  sh.h(r+19,16).box(r+19,0,r+19,23,{rich:[['●',RI_F({sz:10,color:RP.crit})],[' CRITICAL   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.alert})],[' HIGH   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.warn})],[' WATCH   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.ok})],[' CURED   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.eb})],[' sans alerte',RI_F({sz:8,color:RP.ink2})]]},{al:{h:'center'}});
  return sh; }

function riWatch(B,m,nav){ const cols=[['#','center'],['Client'],['Code client'],['Compte'],['Segment'],['Gestionnaire'],['Encours XOF','right'],['Impayé XOF','right'],['Jours','center'],['Stage','center'],['Classe','center'],['Tranche','center'],['Évol. impayé','center'],['Tendance','center'],['Criticité','center'],['JEV PD 12M','center'],['Prov.','center'],['Orientation TypeSafe','left'],['Action'],['Responsable'],['Date cible','center'],['Statut','center']];
  const wd=[5,30,12,13,13,16,15,14,7,6,6,11,9,11,11,9,9,18,40,16,11,13];
  const sh=B.sheet(RI_SHEETS.watch,{tab:RP.crit,cols:wd,zoom:85,a3:true}); let r=riHeader(sh,m,'watch',nav,wd.length,'RISK WATCHLIST','Risk Intelligence Table  ·  '+fmtN(m.watch.length)+' dossiers  ·  '+riMd(m.watch.reduce((s,o)=>s+o.enc,0))+' XOF');
  const cnt=L=>m.watch.filter(o=>o.lvl===L).length; sh.h(r,18).box(r,0,r,wd.length-1,{rich:[['■ ',RI_F({sz:9,color:RP.crit})],['CRITICAL '+fmtN(cnt('CRITICAL'))+'    ',RI_F({b:1,sz:8,color:RP.ink2})],['■ ',RI_F({sz:9,color:RP.alert})],['HIGH '+fmtN(cnt('HIGH'))+'    ',RI_F({b:1,sz:8,color:RP.ink2})],['■ ',RI_F({sz:9,color:'BFD3FF'})],['WATCH '+fmtN(cnt('WATCH'))+'    ',RI_F({b:1,sz:8,color:RP.ink2})],['   barres : encours (bleu) · impayé (rouge) · PD JEV (or)   ·   flèches : évolution de l\'impayé   ·   filtres actifs sur l\'en-tête',RI_F({sz:7.5,i:1,color:RP.neu})]]},{al:{h:'left',indent:1}}); r+=2;
  const H=r; sh.h(H,34); cols.forEach((c,j)=>sh.set(H,j,c[0],{fill:{g:[RP.deep,RP.corp],deg:90},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:c[1]||'left',wrap:1,indent:c[1]?0:1},bd:{bottom:['medium',RP.gold]}}));
  m.watch.forEach((o,i)=>{ const y=H+1+i, crit=o.lvl==='CRITICAL', z=crit?'FFF5F5':i%2?RP.pale:RP.white, base=(x)=>Object.assign({fill:{c:z},font:RI_F({sz:9,color:RP.ink}),bd:{bottom:['thin','E6EDF7']}},x||{}); sh.h(y,20);
    const ev=o.p&&o.p.pdo>0?(o.pdo-o.p.pdo)/o.p.pdo:(o.pdo>0&&o.p?1:0);
    const row=[[i+1,base({font:RI_F({b:1,sz:9,color:crit?RP.crit:RP.gold}),al:{h:'center'},bd:{left:['thick',crit?RP.crit:o.lvl==='HIGH'?RP.alert:'BFD3FF'],bottom:['thin','E6EDF7']}})],[o.rel,base({font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1}})],[o.clc,base({font:RI_F({sz:8.5,color:RP.ink2})})],[o.acc,base({font:RI_F({sz:8.5,color:RP.ink2})})],[o.bseg,base({font:RI_F({sz:8.5,color:RP.ink2})})],[o.off,base({font:RI_F({sz:8.5,color:RP.ink2})})],
      [o.enc,base({nf:'#,##0',al:{h:'right'}})],[o.pdo,base({nf:'#,##0',al:{h:'right'},font:RI_F({b:1,sz:9,color:RP.deep})})],[o.dj,base({nf:'0',al:{h:'center'},font:RI_F({b:1,sz:9,color:o.dj>75?RP.crit:o.dj>45?RP.alert:RP.ink})})],
      ['S'+o.stage,base({al:{h:'center'},font:RI_F({b:1,sz:9,color:[0,RP.eb,'B45309',RP.crit][o.stage]||RP.ink})})],[o.cls,base({al:{h:'center'}})],[RI_BK[o.b],base({al:{h:'center'},font:RI_F({b:1,sz:8.5,color:[RP.ok,RP.cyan,'B45309',RP.alert,RP.crit][o.b]})})],
      [ev,base({nf:'+0%;-0%;0%',al:{h:'center'}})],['',base()],[RI_LVL[o.lvl].t,riBadge(o.lvl)],[o.pd12!=null?o.pd12:'',base({nf:'0.0%',al:{h:'center'},font:RI_F({b:1,sz:8.5,color:RP.deep})})],[o.pdSrc||'',base({al:{h:'center'},font:RI_F({b:1,sz:7,color:o.pdSrc==='HYBRID'?'B45309':RP.eb})})],
      [o.ts&&o.ts.routage?o.ts.routage:o.ts&&o.ts.enAttente===false?'—':'',base({font:RI_F({sz:8,color:RP.cyan==='06B6D4'?'0E7490':RP.ink})})],[o.action,base({al:{h:'left',indent:1},font:RI_F({sz:8.5,color:RP.ink})})],[o.off,base({font:RI_F({sz:8.5,color:RP.ink2})})],[o.cible,base({nf:'dd/mm/yyyy',al:{h:'center'}})],[o.statut,base({al:{h:'center'},font:RI_F({b:1,sz:8.5,color:{'Revue analyste':RP.crit,'À faire':'B45309','Fait':RP.ok}[o.statut]||RP.eb})})]];
    row.forEach(([v,s],j)=>sh.set(y,j,v,s)); if(o.trend.filter(x=>x!=null).length>1) sh.spark(y,13,B.series(o.trend,'w:'+o.clc),{color:crit?RP.crit:RP.bright,last:RP.gold,type:'column'}); });
  const L=H+Math.max(1,m.watch.length); if(m.watch.length){ sh.dataBar(`G${H+2}:G${L+1}`,RP.bright); sh.dataBar(`H${H+2}:H${L+1}`,RP.crit); sh.arrows(`M${H+2}:M${L+1}`); sh.dataBar(`P${H+2}:P${L+1}`,RP.gold,1); }
  else sh.box(H+1,0,H+2,cols.length-1,'Aucun dossier en surveillance à cet arrêté.',{font:RI_F({i:1,sz:10,color:RP.neu}),al:{h:'center'}});
  sh.o.filter=`A${H+1}:${rxCol(cols.length-1)}${L+1}`; sh.o.freeze={r:H+1,c:2}; sh.o.printTitles=`$${H+1}:$${H+1}`; return sh; }

function riAct(B,m,nav){ const wd=[30,34,15,40,16,12,14,12,15,13,16]; const sh=B.sheet(RI_SHEETS.act,{tab:RP.ok,cols:wd,zoom:85,a3:true}); let r=riHeader(sh,m,'act',nav,wd.length,'RISK ACTION CENTER','Pilotage opérationnel du plan d\'actions  ·  statut, responsable, échéance, impact, progression');
  const head=[['Client'],['Problème'],['Exposition XOF','right'],['Action'],['Responsable'],['Date cible','center'],['Statut','center'],['Avancement','center'],['Impact provisions XOF','right'],['JEV PD 12M → après action','center'],['Orientation TypeSafe']];
  const lanes=[['CRITICAL','Actions immédiates',m.watch.filter(o=>o.lvl==='CRITICAL'),'⚠'],['HIGH','Actions sous 7 jours',m.watch.filter(o=>o.lvl==='HIGH'),'▲'],['WATCH','Surveillance renforcée',m.watch.filter(o=>o.lvl==='WATCH'),'◉'],['CURED','Dossiers régularisés',m.cured,'✓']];
  // tableau de bord des couloirs
  sh.h(r,16).h(r+1,26).h(r+2,14);
  lanes.forEach(([L,lib,list,ic],i)=>{ const c=RI_LVL[L].c, enc=list.reduce((s,o)=>s+(L==='CURED'&&o.p?o.p.pdo:o.enc),0), done=list.length?list.reduce((s,o)=>s+o.prog,0)/list.length:0, late=list.filter(o=>o.cible&&o.cible<m.date&&o.prog<1).length;
    const c0=[0,1,3,5][i]*1, c1=[0,2,4,10][i]; const cc=i===0?[0,0]:i===1?[1,2]:i===2?[3,5]:[6,10];
    sh.box(r,cc[0],r,cc[1],{rich:[[ic+'  ',RI_F({b:1,sz:9,color:RP.white})],[RI_LVL[L].t,RI_F({b:1,sz:8.5,color:RP.white})]]},{fill:{g:[c,rxTint(c,.3)],deg:0},al:{h:'left',indent:1}});
    sh.box(r+1,cc[0],r+1,cc[1],{rich:[[fmtN(list.length),RI_F({b:1,sz:16,color:L==='WATCH'?RP.eb:c})],['  dossiers · '+riMd(enc)+' XOF',RI_F({sz:8,color:RP.ink2})]]},{fill:{c:RP.white},al:{h:'left',indent:1},bd:{left:['thin','DBE6F7'],right:['thin','DBE6F7']}});
    sh.box(r+2,cc[0],r+2,cc[1],(late?'⏱ '+late+' en retard · ':'')+'avancement '+riPct(done,0),{fill:{c:RP.pale},font:RI_F({sz:7.5,color:late?RP.crit:RP.neu}),al:{h:'left',indent:1},bd:{bottom:['thin','DBE6F7'],left:['thin','DBE6F7'],right:['thin','DBE6F7']}}); });
  r+=4;
  lanes.forEach(([L,lib,list,ic])=>{ const c=RI_LVL[L].c; sh.h(r,26).box(r,0,r,wd.length-1,{rich:[[ic+'  '+RI_LVL[L].t+'   ',RI_F({b:1,sz:12,color:RP.white})],[lib+'  ·  '+fmtN(list.length)+' dossiers  ·  '+riMd(list.reduce((s,o)=>s+(L==='CURED'&&o.p?o.p.pdo:o.enc),0))+' XOF',RI_F({sz:9,color:'FFF7ED'})]]},{fill:{g:[c,rxTint(c,.35)],deg:0},al:{h:'left',indent:1}});
    r++; sh.h(r,28); head.forEach((h,j)=>sh.set(r,j,h[0],{fill:{c:RP.light},font:RI_F({b:1,sz:8,color:RP.deep}),al:{h:h[1]||'left',wrap:1,indent:h[1]?0:1},bd:{bottom:['medium',c]}})); const h0=r;
    list.slice(0,L==='WATCH'?40:60).forEach((o,i)=>{ r++; sh.h(r,30); const z=i%2?RP.pale:RP.white, b=(x)=>Object.assign({fill:{c:z},font:RI_F({sz:9,color:RP.ink}),al:{wrap:1,v:'center'},bd:{bottom:['thin','E6EDF7']}},x||{});
      const pb=L==='CURED'?`Impayé de ${riMd(o.p?o.p.pdo:0)} régularisé`:`${o.dj} j d'impayé · ${RI_BK[o.b]} · Stage ${o.stage}${o.mig?' · migration ▲':''}${o.ts&&o.ts.motif&&typeof TS_MOTIF!=='undefined'?' · '+TS_MOTIF[o.ts.motif]:''}`;
      const jv=o.pd12!=null?riPct(o.pd12)+(o.pdAct?' → '+riPct(o.pdAct.p):''):'';
      [[o.rel,b({font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1,wrap:1},bd:{left:['thick',c],bottom:['thin','E6EDF7']}})],[pb,b({al:{h:'left',indent:1,wrap:1},font:RI_F({sz:8.5,color:RP.ink2})})],[L==='CURED'&&o.p?o.p.pdo:o.enc,b({nf:'#,##0',al:{h:'right'}})],[o.action,b({al:{h:'left',indent:1,wrap:1},font:RI_F({sz:8.5,color:RP.ink})})],[o.off,b()],[o.cible,b({nf:'dd/mm/yyyy',al:{h:'center'},font:RI_F({sz:9,color:o.cible&&o.cible<m.date&&o.prog<1?RP.crit:RP.ink})})],
       [o.statut,b({al:{h:'center'},font:RI_F({b:1,sz:8.5,color:{'Revue analyste':RP.crit,'À faire':'B45309','Fait':RP.ok,'Régularisé':RP.ok}[o.statut]||RP.eb})})],[o.prog,b({nf:'0%',al:{h:'center'}})],[o.impact||'',b({nf:'#,##0',al:{h:'right'}})],[jv,b({al:{h:'center'},font:RI_F({b:1,sz:8.5,color:RP.deep})})],[o.ts&&o.ts.routage||'',b({font:RI_F({sz:8.5,color:'0E7490'})})]].forEach(([v,s],j)=>sh.set(r,j,v,s)); });
    if(list.length){ sh.dataBar(`H${h0+2}:H${r+1}`,c==='F59E0B'?RP.bright:c,1); sh.dataBar(`C${h0+2}:C${r+1}`,RP.bright); } else { r++; sh.box(r,0,r,wd.length-1,'Aucun dossier dans cette catégorie.',{font:RI_F({i:1,sz:9,color:RP.neu}),al:{h:'left',indent:1}}); }
    if(L==='WATCH'&&list.length>40){ r++; sh.box(r,0,r,wd.length-1,'… '+(list.length-40)+' autres dossiers en surveillance : voir la feuille WATCHLIST.',{font:RI_F({i:1,sz:8.5,color:RP.neu}),al:{h:'left',indent:1}}); }
    r+=2; });
  return sh; }

function riIns(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.ins,{tab:RP.gold,cols:new Array(W+1).fill(5.4).map((x,i)=>i===11||i===W?1.6:x),zoom:85,portrait:false}); let r=riHeader(sh,m,'ins',nav,W,'INSIGHTS','Lecture éditoriale de l\'arrêté · chaque chiffre est calculé sur les données');
  m.ins.forEach((x,i)=>{ const c=(i%2)*12, y=r+Math.floor(i/2)*7, c1=c+10, fr={fill:{c:RP.white}}; if(i===4) sh.brk(y); sh.h(y,8).h(y+1,30).h(y+2,26).h(y+3,44).h(y+4,8).h(y+5,8);
    sh.blk(y,c,y,c1,{fill:{g:[x.c,rxTint(x.c,.55)],deg:0}});
    sh.box(y+1,c,y+2,c+2,x.n,{fill:{c:RP.white},font:RI_F({b:1,sz:30,color:RP.gold}),al:{h:'center'},bd:{left:['thin','DBE6F7']}});
    sh.box(y+1,c+3,y+1,c1,x.t,{fill:{c:RP.white},font:RI_F({b:1,sz:9.5,color:RP.ink2}),al:{h:'left',v:'bottom'},bd:{right:['thin','DBE6F7']}});
    sh.box(y+2,c+3,y+2,c1,x.big,{fill:{c:RP.white},font:RI_F({b:1,sz:18,color:x.c===RP.gold?RP.deep:x.c}),al:{h:'left'},bd:{right:['thin','DBE6F7']}});
    sh.box(y+3,c,y+3,c+2,'',{fill:{c:RP.white},bd:{left:['thin','DBE6F7']}}); sh.box(y+3,c+3,y+3,c1,x.p,{fill:{c:RP.white},font:RI_F({sz:8.5,color:RP.ink2}),al:{h:'left',v:'top',wrap:1},bd:{right:['thin','DBE6F7']}});
    sh.blk(y+4,c,y+4,c1,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7']}}); sh.blk(y+4,c,y+4,c,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7'],left:['thin','DBE6F7']}}); sh.blk(y+4,c1,y+4,c1,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7'],right:['thin','DBE6F7']}});
    for(let k=1;k<=5;k++) sh.set(y+k,c1+1,null,{fill:{g:['C9D5EA','FFFFFF'],deg:0}}); sh.blk(y+5,c+1,y+5,c1,{fill:{g:['C9D5EA','FFFFFF'],deg:90}}); });
  r+=Math.ceil(m.ins.length/2)*7+1;
  if(false&&m.jev){ const J=m.jev, p=J.ptf.pd[12]; r=riSection(sh,r,0,23,'JEV · RISQUE PROSPECTIF','probabilités du moteur JEV, avec provenance',RP.eb);
    sh.h(r,22).box(r,0,r,23,{rich:[['PD 12M portefeuille sain : ',RI_F({sz:10,color:RP.ink2})],[riPct(p.v),RI_F({b:1,sz:12,color:RP.eb})],['   '+jevLbl(p.prov),RI_F({sz:8,color:RP.neu})]]},{al:{h:'left',indent:1}});
    if(p.prov.avertissement){ r++; sh.h(r,20).box(r,0,r,23,'⚠ '+p.prov.avertissement,{fill:{c:'FEF3C7'},font:RI_F({b:1,sz:9,color:'92400E'}),al:{h:'left',indent:1},bd:{left:['thick',RP.warn]}}); } r+=2; }
  if(m.ts&&m.ts.n){ const T=Object.values(m.ts.byRef); r=riSection(sh,r,0,23,'TYPESAFE · RETOURS GESTIONNAIRES','jugements jev-latest sur les commentaires (aucun chiffre produit par TypeSafe)',RP.cyan);
    sh.h(r,22).box(r,0,r,23,`${fmtN(T.length)} retours lus · ${fmtN(T.filter(t=>t.statut==='Revue analyste').length)} en revue analyste · ${fmtN(T.filter(t=>t.position==='Après la bascule').length)} promesses après la date de bascule · ${fmtN(T.filter(t=>!t.commentaire).length)} sans commentaire`,{font:RI_F({sz:9.5,color:RP.ink2}),al:{h:'left',indent:1}}); }
  return sh; }

function riDetail(B,m,nav,key){ const cols=['Code client','Client','Compte principal','Segment','Secteur','Gestionnaire','Encours XOF','Impayé XOF','Provision XOF','Jours','Stage','Classe','Tranche','Douteux','Encours N-1 XOF','Impayé N-1 XOF','Variation impayé XOF','Migration','Criticité','Statut du suivi'];
  const fm=['s','s','s','s','s','s','m','m','m','n','n','s','s','s','m','m','m','s','s','s'], wd=[12,32,14,14,22,18,16,15,15,7,7,7,11,8,16,15,15,9,11,16];
  const sh=B.sheet(RI_SHEETS[key||'det'],{tab:RP.neu,cols:wd,zoom:90}); let r=key==='data'?0:riHeader(sh,m,key||'det',nav,wd.length,key==='data'?'DATA EXPORT':'DETAIL','Données propres et réutilisables · une ligne par client · source canonique');
  if(key==='data'){ sh.h(0,22).box(0,0,0,cols.length-1,'ECOBANK SÉNÉGAL · CREDIT RISK INTELLIGENCE · DATA EXPORT · arrêté '+m.label+' · source : '+m.file,{fill:{c:RP.deep},font:RI_F({b:1,sz:9,color:RP.white}),al:{h:'left',indent:1}}); r=1; }
  const H=r; sh.h(H,30); cols.forEach((c,j)=>sh.set(H,j,c,{fill:{c:RP.eb},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:fm[j]==='s'?'left':'center',wrap:1,indent:fm[j]==='s'?1:0},bd:{bottom:['medium',RP.gold]}}));
  const sm=Object.fromEntries(['s','m','n'].map(f=>[f,B.style(Object.assign({font:RI_F({sz:9,color:RP.ink}),bd:{bottom:['thin','EEF2F7']}},f==='m'?{nf:'#,##0',al:{h:'right'}}:f==='n'?{al:{h:'center'}}:{al:{h:'left',indent:1}}))]));
  [...m.cl].sort((a,b)=>b.enc-a.enc).forEach((o,i)=>{ const y=H+1+i; [o.clc,o.rel,o.acc,o.bseg,o.sector,o.off,o.enc,o.pdo,o.ecl,o.dj,o.stage,o.cls,RI_BK[o.b],o.npl?'Oui':'Non',o.p?o.p.enc:null,o.p?o.p.pdo:null,o.p?o.dPdo:null,o.mig?'▲':o.p&&o.b<o.pb?'▼':'',o.lvl?RI_LVL[o.lvl].t:'',o.lvl?o.statut:''].forEach((v,j)=>sh.set(y,j,v,sm[fm[j]])); });
  const L=H+m.cl.length; sh.o.filter=`A${H+1}:${rxCol(cols.length-1)}${L+1}`; sh.o.freeze={r:H+1,c:2}; sh.o.printTitles=`$${H+1}:$${H+1}`; return sh; }

function riAudit(B,m,nav){ const wd=[40,24,20,34,7,7,7,7,7]; const sh=B.sheet(RI_SHEETS.aud,{tab:RP.deep,cols:wd,zoom:90,a3:true}); let r=riHeader(sh,m,'aud',nav,wd.length,'AUDIT REPORT','Traçabilité, contrôles automatiques et provenance');
  r=riSection(sh,r,0,8,'SOURCES','arrêtés utilisés · source canonique unique',RP.eb);
  r=riTable(sh,r,0,[['Arrêté'],['Fichier'],['Clients','center'],['Usage']],m.months.map((x,i)=>[x.label,x.file||'',fmtN(x.cli.length),i===m.months.length-1?'Arrêté de référence (N)':i===m.months.length-2?'Comparaison (N-1), pont et migrations':'Tendances et sparklines']))+2;
  r=riSection(sh,r,0,8,'CONTRÔLES AUTOMATIQUES','vérifiés à la génération',RP.ok);
  r=riTable(sh,r,0,[['Contrôle'],['Valeur','right'],['Référence','right'],['Résultat','center']],m.ctl.map(c=>[c.l,typeof c.a==='number'?Math.round(c.a).toLocaleString('fr-FR'):c.a,typeof c.b==='number'?Math.round(c.b).toLocaleString('fr-FR'):c.b,c.ok?'✔ CONFORME':'✖ ÉCART']));
  m.ctl.forEach((c,i)=>sh.set(r-m.ctl.length+1+i,3,c.ok?'✔ CONFORME':'✖ ÉCART',{fill:{c:c.ok?'DCFCE7':'FEE2E2'},font:RI_F({b:1,sz:9,color:c.ok?RP.ok:RP.crit}),al:{h:'center'}})); r+=2;
  r=riSection(sh,r,0,8,'RÈGLES DE CALCUL','identiques à l\'écran, au PDF et à toutes les feuilles',RP.gold);
  r=riTable(sh,r,0,[['Indicateur'],['Règle'],[''],['']],[
    ['Tranches d\'impayé','Sain · 1-30 j · 31-60 j · 61-90 j · > 90 j / S3 (Stage 3, classe III/IV/V ou GL 292)','',''],
    ['Criticité','CRITICAL : criticité APEX « CRITIQUE », migration vers > 90 j / S3, ou 76-90 j · HIGH : « ÉLEVÉE », tranche 61-90 j ou migration · WATCH : Stage 2, 31-60 j, impayé en hausse · CURED : impayé N-1 régularisé','',''],
    ['Pont des impayés','Ouverture (N-1) + nouveaux impayés + détériorations + nouveaux clients + régularisations + remboursements partiels + sorties = clôture (N)','',''],
    ['Provisions','ECL réel de l\'ACTE 7, sinon modélisé par stage (1 % / 25 % / 100 %) — règle APEX','',''],
    ['Concentration','Top 10 clients, part du premier client, HHI (somme des parts au carré × 10 000)','',''],
    ['Classes et stages','BCEAO, IFRS 9 et ACTE 7 calculés par APEX ; ce moteur ne les modifie pas','',''],
    ['TypeSafe','Jugements uniquement (motif, crédibilité, incohérence) ; aucun chiffre ; revue analyste si confiance faible','',''],
    ['JEV','Probabilités avec provenance obligatoire (OBSERVED, EMPIRICAL, MARKOV, EXPERT, STRESS, SIMULATED, HYBRID)','','']]);
  for(let y=r-7;y<=r;y++){ sh.merges.push(rxRef(y,1)+':'+rxRef(y,8)); sh.h(y,32); const c=sh.cells.get(y*16384+1); if(c) sh.set(y,1,c.v,{fill:{c:(y-r)%2?RP.pale:RP.white},font:RI_F({sz:8.5,color:RP.ink}),al:{h:'left',wrap:1,indent:1}}); }
  r+=2; r=riSection(sh,r,0,8,'COUVERTURE JEV & TYPESAFE','tout ce qui peut relever d\'un jugement ou d\'une probabilité',RP.bright);
  const T=m.tsL||[], J=m.jev, adv=T.filter(t=>t.urg!=null).length;
  r=riTable(sh,r,0,[['Domaine'],['Contrôle'],['Couverture','center'],['Détail']],[
    ['Probabilité de dégradation (PD 3/6/12M)','JEV · MARKOV / HYBRID',J?'✔ actif':'—',J?'calibré sur '+J.per+' arrêtés · '+jevLbl(J.ptf.pd[12].prov):'aucune archive'],
    ['Taux observé (cohortes)','JEV · EMPIRICAL',J?'✔ actif':'—',J&&J.ptf.emp12.v!=null?riPct(J.ptf.emp12.v)+' (IC '+riPct(J.ptf.emp12.lo)+' – '+riPct(J.ptf.emp12.hi)+')':'pas de cohorte complète à 12 mois'],
    ['Stress et scénarios','JEV · STRESS / SIMULATED',J?'✔ actif':'—',J?'×1,5 et ×2,0 · Monte Carlo':''],
    ['PD par dossier de la watchlist','JEV · HYBRID (Markov + EWS + expert)',J?'✔ '+m.watch.filter(o=>o.pd12!=null).length+' / '+m.watch.length:'—','signaux TypeSafe et APEX en multiplicateurs EXPERT affichés'],
    ['Effet des actions sur la PD','JEV · recalcul par le code',J?'✔ actif':'—','régularisation, règlement partiel, levée des signaux'],
    ['Motif, crédibilité, incohérence, statut','TypeSafe · Choice / Score / Noul',T.length?'✔ '+T.length+' dossiers':'en attente','commentaires gestionnaires (feuille _TYPESAFE)'],
    ['Nature de l\'entité, intra-groupe, segment','TypeSafe · Choice / Noul',T.length?'✔ actif':'en attente','noms de clients'],
    ['Urgence et orientation (re-classement, routage)','TypeSafe · Score / Choice',adv?'✔ '+adv+' dossiers':'en attente','capacités avancées'],
    ['Auto-cohérence et cohérence du plan','TypeSafe · Noul + Choice croisés',adv?'✔ actif':'en attente','divergence → revue analyste'],
    ['Montants, ratios, classes BCEAO / IFRS 9 / ACTE 7','Code APEX uniquement','✔ code','jamais confiés à TypeSafe ni à JEV']]);
  r+=2; sh.box(r,0,r,8,'Généré le '+new Date().toLocaleString('fr-FR')+' · '+RI_V+' · APEX Credit Risk OS · source : '+m.file,{font:RI_F({sz:8,i:1,color:RP.neu}),al:{h:'left'}});
  return sh; }

/* =====================================================================
   EXPORTS MULTIPLES
   ===================================================================== */
const RI_VARIANTS={
  full:{lib:'Risk Intelligence — complet',file:'Credit_Risk_Intelligence',nav:['exec','risk','mov','conc','watch','act','ins','det','aud']},
  exec:{lib:'Executive report (Comité)',file:'Executive_Report',nav:['exec','ins','aud']},
  risk:{lib:'Risk report (analyse approfondie)',file:'Risk_Report',nav:['exec','risk','mov','conc','ins','aud']},
  watch:{lib:'Watchlist',file:'Watchlist',nav:['watch','act','aud']},
  act:{lib:'Action plan',file:'Action_Plan',nav:['act','watch','aud']},
  aud:{lib:'Audit report',file:'Audit_Report',nav:['aud','det']},
  data:{lib:'Data export',file:'Data_Export',nav:['data']}};
async function riBuild(variant,model){ const V=RI_VARIANTS[variant]||RI_VARIANTS.full, m=model||await riModel();
  const B=rxBook({title:'Ecobank Sénégal · Credit Risk Intelligence · '+V.lib,subject:'Arrêté '+m.label,date:'Arrêté '+m.label}); const nav=V.nav;
  const mk={exec:riExec,risk:riRisk,mov:riMov,conc:riConc,watch:riWatch,act:riAct,ins:riIns,det:(B,m,n)=>riDetail(B,m,n,'det'),aud:riAudit,data:(B,m,n)=>riDetail(B,m,n,'data')};
  nav.forEach(k=>mk[k](B,m,nav));
  const u8=await B.zip(); return {u8,name:'ECOBANK_'+V.file+'_'+dcStamp()+'.xlsx',model:m}; }
async function riExport(variant){ try{ toast('⏳ Credit Risk Intelligence : génération…',2500); const r=await riBuild(variant);
    dcDl(new Blob([r.u8],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),r.name);
    const bad=r.model.ctl.filter(c=>!c.ok); toast((bad.length?'⚠ ':'✅ ')+r.name+' · '+(bad.length?bad.length+' contrôle(s) en écart (voir AUDIT)':'contrôles conformes'),4500); return r; }
  catch(e){ console.warn('RI',e); toast('❌ Export impossible : '+e.message,5000); } }
function riMenu(btn){ let m=document.getElementById('riMenu'); if(m){ m.remove(); return; }
  m=document.createElement('div'); m.id='riMenu'; const b=btn.getBoundingClientRect();
  m.style.cssText=`position:fixed;top:${b.bottom+6}px;left:${Math.max(8,Math.min(b.left,innerWidth-300))}px;z-index:400;background:#fff;border:1px solid #DBE6F7;border-radius:14px;box-shadow:0 18px 40px -12px rgba(0,27,77,.35);padding:8px;width:290px;font:13px 'Segoe UI',system-ui`;
  m.innerHTML=`<div style="padding:8px 10px 10px;border-bottom:2px solid #C8A951;margin-bottom:6px"><b style="color:#001B4D;letter-spacing:.06em">CREDIT RISK INTELLIGENCE</b><div style="font-size:11px;color:#64748B">Exports Excel premium · source canonique unique</div></div>`
    +Object.entries(RI_VARIANTS).map(([k,v])=>`<button data-k="${k}" style="display:block;width:100%;text-align:left;border:0;background:${k==='full'?'linear-gradient(90deg,#003DA5,#2563EB)':'#F2F7FF'};color:${k==='full'?'#fff':'#003DA5'};border-radius:10px;padding:9px 12px;margin:4px 0;font-weight:600;cursor:pointer">${v.lib}</button>`).join('');
  document.body.appendChild(m); m.querySelectorAll('button').forEach(x=>x.onclick=()=>{ m.remove(); riExport(x.dataset.k); });
  setTimeout(()=>document.addEventListener('click',function f(e){ if(!m.contains(e.target)&&e.target!==btn){ m.remove(); document.removeEventListener('click',f); } }),0); }
if(document.getElementById('btnRi')) document.getElementById('btnRi').onclick=function(){ riMenu(this); };

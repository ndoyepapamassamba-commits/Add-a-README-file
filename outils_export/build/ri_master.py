# Visual mastering du moteur Credit Risk Intelligence + JEV / TypeSafe dans chaque feuille
import re
p='ri_engine.js'; s=open('ri_engine_v1.js',encoding='utf-8').read()
def rep(a,b,n=1):
    global s
    c=s.count(a); assert c==n,(c,a[:90]); s=s.replace(a,b)
def fn(name,new):
    global s
    i=s.index('function '+name+'(')
    if s[i-6:i]=='async ': i-=6
    j=s.index('\nfunction ',i+10); k=s.find('\nasync function ',i+10)
    if k!=-1 and k<j: j=k
    s=s[:i]+new.strip('\n')+'\n'+s[j:]

# ---------- modèle : JEV et TypeSafe branchés sur chaque client ----------
rep("  const ins=riInsights({K,KP,wf,flow,t10,cl,up,nPrev,watch,cured,seg,off,risky,M,P,top10});",
"""  // JEV : calibré sur l'archive des arrêtés s'il n'a pas encore tourné ; PD par client avec provenance
  let J=(typeof JEV!=='undefined'&&JEV.res)?JEV.res:null;
  if(!J&&typeof jevHistorique==='function'){ try{ const hh=await jevHistorique(+curD,()=>{}); if(hh.H.length){ J=jevRun(hh.H); JEV.res=J; } }catch(e){ console.warn('RI/JEV',e); } }
  if(J){ const byRef=new Map(J.cps.map(c=>[String(c.ref).trim(),c]));
    cl.forEach(o=>{ const cp=o.cr?byRef.get(String(o.cr.ref).trim()):null; const e=jevEtat(o.dj,o.npl||o.stage===3);
      if(cp){ o.pd12=cp.pd[12].v; o.pdSrc=cp.pd[12].prov.source; o.pdConf=cp.pd[12].prov.confiance; o.pdAct=cp.act[0]||null; o.pdSig=cp.sig.map(w=>w[2]); }
      else if(e<JEV_D){ const b=jevPdMarkov(J.C,J.C.M[o.bseg]?o.bseg:null,e,12); o.pd12=b.v; o.pdSrc='MARKOV'; o.pdConf=b.prov.confiance; o.pdAct=null; o.pdSig=[]; }
      else { o.pd12=1; o.pdSrc='OBSERVED'; o.pdConf='élevée'; o.pdAct=null; o.pdSig=[]; } }); }
  const top5=top.slice(0,5).reduce((s,o)=>s+o.enc,0)/(K.enc||1), top5P=P?[...P.cli].sort((a,b)=>b.enc-a.enc).slice(0,5).reduce((s,o)=>s+o.enc,0)/(KP.enc||1):null;
  const tsL=(typeof TSX!=='undefined'&&TSX.n)?Object.values(TSX.byRef):[];
  const ins=riInsights({K,KP,wf,flow,t10,cl,up,nPrev,watch,cured,seg,off,risky,M,P,top10,J,tsL});""")
rep("  return {date:curD,label:fmtDate(curD),prevLabel:P?P.label:null,file:cur.file,months,M,P,K,KP,cl,watch,cured,risky,drivers,wf,mx,flow,up,down,nPrev,seg,off,sec,prod,top10,t10,hhi,rm,ctl,ins,lostCli,\n    jev:(typeof JEV!=='undefined'&&JEV.res)?JEV.res:null,",
    "  return {date:curD,label:fmtDate(curD),prevLabel:P?P.label:null,file:cur.file,months,M,P,K,KP,cl,watch,cured,risky,drivers,wf,mx,flow,up,down,nPrev,seg,off,sec,prod,top10,t10,top5,top5P,hhi,rm,ctl,ins,lostCli,tsL,\n    jev:J,")
# contrôle de couverture JEV
rep("  ctl.push({l:'Historique disponible pour les tendances'","  ctl.push({l:'JEV : PD avec provenance pour chaque client de la watchlist',ok:true,a:0,b:0,jev:1});\n  ctl.push({l:'Historique disponible pour les tendances'")
rep("  const ins=riInsights(","  { const c=ctl.find(x=>x.jev); const nw=watch.filter(o=>o.pd12!=null).length; c.ok=!J||nw===watch.length; c.a=nw; c.b=watch.length; if(!J){ c.l='JEV : non calibré (aucune archive d\\'arrêtés)'; } }\n  const ins=riInsights(")

# insights : JEV et TypeSafe
rep("  return I; }","""  if(m.J){ const p=m.J.ptf.pd[12], sv=m.J.scen[2];
    I.push({n:'07',t:'PROSPECTIF · JEV',big:'PD 12M = '+riPct(p.v),c:RP.bright,p:`Probabilité qu'un client sain aujourd'hui devienne douteux sous 12 mois (${p.prov.source}, N = ${fmtN(p.prov.n)}, ${p.prov.periodes} mois, confiance ${p.prov.confiance}). Scénario sévère : ${riMd(sv.esp)} XOF d'entrées en douteux attendues (SIMULATED).${p.prov.avertissement?' Estimation indicative : historique insuffisant pour une calibration robuste.':''}`}); }
  if(m.tsL&&m.tsL.length){ const T=m.tsL, rv=T.filter(t=>t.statut==='Revue analyste').length, ac=T.filter(t=>t.revue&&t.revue.some(x=>/auto-coh/.test(x))).length, tard=T.filter(t=>t.position==='Après la bascule').length;
    I.push({n:'08',t:'TYPESAFE · RETOURS',big:fmtN(T.length)+' commentaires lus',c:RP.cyan,p:`${fmtN(rv)} dossiers en revue analyste (confiance faible ou incohérence), dont ${fmtN(ac)} par contrôle d'auto-cohérence ; ${fmtN(tard)} promesses tombent après la date de bascule. TypeSafe ne produit aucun chiffre.`}); }
  return I; }""")

# ---------- composants ----------
fn('riHeader',r"""
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
""")
fn('riSection',r"""
function riSection(sh,r,c0,c1,t,sub,col){ sh._sec=(sh._sec||0)+(c0===0?1:0); const n=String(sh._sec).padStart(2,'0');
  sh.h(r,24).box(r,c0,r,c1,{rich:[[(c0===0?n:'·')+'  ',RI_F({b:1,sz:11,color:RP.gold})],[t,RI_F({b:1,sz:11,color:RP.deep})],[sub?'    '+sub:'',RI_F({sz:8,i:1,color:RP.neu})]]},{al:{h:'left',v:'bottom'},bd:{bottom:['thin',col||RP.gold]}}); return r+1; }
""")
fn('riCard',r"""
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
""")
fn('riBadge',r"""
function riBadge(lvl){ const L=RI_LVL[lvl]||{c:RP.neu,t:lvl||''}; if(lvl==='WATCH') return {fill:{c:RP.light},font:RI_F({b:1,sz:8,color:RP.eb}),al:{h:'center'},bd:{left:['thin','BFD3FF'],right:['thin','BFD3FF']}};
  return {fill:{c:L.c},font:RI_F({b:1,sz:8,color:RP.white}),al:{h:'center'}}; }
""")
# ---------- graphiques intégrés au design : pas de cadre ----------
w=open('ri_writer.js',encoding='utf-8').read()
a='<c:spPr><a:solidFill><a:srgbClr val="${sp.bg||\'FFFFFF\'}"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="DBE6F7"/></a:solidFill></a:ln></c:spPr>'
if a in w: w=w.replace(a,'<c:spPr><a:solidFill><a:srgbClr val="${sp.bg||\'FFFFFF\'}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>')
open('ri_writer.js','w',encoding='utf-8').write(w)

# ---------- EXECUTIVE ----------
rep("function riExec(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.exec,{tab:RP.eb,cols:new Array(W).fill(5.4),zoom:85,printArea:'$A$1:$X$86',a3:false});",
    "function riExec(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.exec,{tab:RP.eb,cols:new Array(W+1).fill(0).map((_,i)=>i===W?1.6:i%5===4?1.6:6.1),zoom:85,a3:false});")
rep("let r=riHeader(sh,m,'exec',nav,W,'CREDIT RISK INTELLIGENCE','Portfolio Monitoring & Early Warning · Vue Comité des Risques');",
    "let r=riHeader(sh,m,'exec',nav,W,'CREDIT RISK INTELLIGENCE','Portfolio Monitoring & Early Warning  ·  Vue Comité des Risques');")
rep("  for(const rr of [r+6,r+14]) sh.h(rr,8); sh.h(r+7,10); r+=16;",
"""  sh.h(r+7,10); sh.h(r+15,12); r+=16;
  // callouts : concentration, mouvement favorable, perspective JEV
  const tp=m.top5P!=null?(m.top5-m.top5P)*100:null, cur=m.cured, rec=cur.reduce((s,o)=>s+(o.p?o.p.pdo:0),0), J=m.jev;
  riCallout(sh,r,0,8,{icon:'⚠',t:'CONCENTRATION ALERT',c:m.top5>0.25?RP.alert:RP.gold,big:'TOP 5 CLIENTS = '+riPct(m.top5),sub:tp==null?'aucun arrêté antérieur':(tp>=0?'+':'')+tp.toFixed(1).replace('.',',')+' pts vs '+m.prevLabel});
  riCallout(sh,r,10,18,cur.length?{icon:'✓',t:'POSITIVE MOVEMENT',c:RP.ok,big:fmtN(cur.length)+' dossiers régularisés',sub:riMd(rec)+' XOF d\\'impayés résorbés depuis le '+m.prevLabel}
    :{icon:'▲',t:'NEW ARREARS',c:RP.crit,big:riSg(m.wf.nouv+m.wf.det,riMd)+' XOF',sub:'nouveaux impayés et aggravations · aucune régularisation sur la période'});
  sh.h(r,18); const jp=J?J.ptf.pd[12]:null;
  riCallout(sh,r,20,23,{icon:'✦',t:'JEV OUTLOOK',c:RP.bright,big:jp?'PD 12M '+riPct(jp.v):'—',sub:jp?jp.prov.source+' · confiance '+jp.prov.confiance+(jp.prov.avertissement?' · indicatif':''):'archive insuffisante'});
  r+=4;""")
rep("  sh.chart({type:'combo',cats,area:{name:'Encours',v:tr('enc'),color:'3B82F6'}","  sh.chart({type:'combo',cats,area:{name:'Encours',v:tr('enc'),color:'60A5FA'}")
# TOP RISKS : PD JEV et motif TypeSafe dans la ligne de détail
rep("    sh.box(y+2,2,y+2,9,o.action+' · '+(o.off||''),{font:RI_F({sz:7.5,i:1,color:RP.neu}),al:{h:'left'}});",
    "    sh.box(y+2,2,y+2,9,(o.pd12!=null?'JEV PD 12M '+riPct(o.pd12)+' ('+o.pdSrc+')  ·  ':'')+(o.ts&&o.ts.routage?'→ '+o.ts.routage+'  ·  ':'')+o.action,{font:RI_F({sz:7.5,i:1,color:RP.neu}),al:{h:'left'}});")

# ---------- MOVEMENT : la donnée devient une histoire ----------
rep("  r=riSection(sh,r,0,23,'WHY DID IT MOVE?','pont des impayés · bleu = base, rouge = détérioration, vert = amélioration, cyan = mouvements de périmètre, or = résultat',RP.cyan);",
"""  // récit proportionnel : chaque étape porte une barre à l'échelle du montant
  if(m.P){ r=riSection(sh,r,0,23,'THE STORY OF THE MONTH','impayés XOF · barres proportionnelles · entrées en rouge, sorties en vert',RP.cyan);
    const W2=m.wf, migA=m.cl.filter(o=>o.mig&&o.p&&o.p.pdo>0).reduce((s,o)=>s+o.pdo,0), migN=m.cl.filter(o=>o.mig).length;
    sh.h(r,6); r++; const story=[['◆','OPENING','impayés au '+m.prevLabel,W2.open,RP.eb,'',m.flow.open.n],['＋','NEW ARREARS','clients entrés en impayé',W2.nouv,RP.crit,'+',m.flow.nouv.n],['⇣','MIGRATIONS','dont dossiers passés en tranche plus dégradée (non additif)',migA,RP.cyan,'≈',migN],
      ['＋','AGGRAVATIONS','hausse des impayés existants',W2.det,RP.alert,'+',m.cl.filter(o=>o.p&&o.p.pdo>0&&o.pdo>o.p.pdo).length],['＋','NEW CLIENTS','impayés de nouveaux clients',W2.entree,RP.cyan,'+',m.cl.filter(o=>!o.p&&o.pdo>0).length],
      ['−','CURES','dossiers revenus à jour',-W2.cure,RP.ok,'−',m.cured.length],['−','PAYMENTS','remboursements partiels',-W2.pay,'22C55E','−',m.cl.filter(o=>o.p&&o.pdo>0&&o.pdo<o.p.pdo).length],['−','EXITS','sorties du portefeuille',-W2.sortie,RP.cyan,'−',m.lostCli.length],['■','CLOSING','impayés au '+m.label,W2.close,RP.gold,'',m.flow.close.n]];
    const mx=Math.max(...story.map(x=>Math.abs(x[3])))||1;
    story.forEach(([ic,t,u,v,c,sg,n],i)=>{ const y=r+i, tot=t==='OPENING'||t==='CLOSING'; sh.h(y,tot?28:25);
      sh.box(y,0,y,0,ic,{fill:{c},font:RI_F({b:1,sz:10,color:RP.white}),al:{h:'center'}});
      sh.box(y,1,y,4,{rich:[[t,RI_F({b:1,sz:9,color:tot?RP.deep:c})],['\\n'+u,RI_F({sz:6.5,color:RP.neu})]]},{fill:{c:tot?RP.light:RP.white},al:{h:'left',indent:1,wrap:1},bd:{bottom:['thin','EEF2F7']}});
      sh.box(y,5,y,7,(sg&&v?sg+' ':'')+riMd(Math.abs(v)),{fill:{c:tot?RP.light:RP.white},font:RI_F({b:1,sz:tot?11:9.5,color:tot?RP.deep:c}),al:{h:'right'},bd:{bottom:['thin','EEF2F7']}});
      sh.box(y,8,y,20,Math.abs(v),{fill:{c:tot?RP.light:RP.white},nf:';;;',bd:{bottom:['thin','EEF2F7']}}); sh.addCf(rxRef(y,8),`<cfRule type="dataBar" priority="PRIO"><dataBar showValue="0"><cfvo type="num" val="0"/><cfvo type="num" val="${mx}"/><color rgb="${rxHex(c)}"/></dataBar></cfRule>`);
      sh.box(y,21,y,23,n!=null?fmtN(n)+' dossiers':'',{fill:{c:tot?RP.light:RP.white},font:RI_F({sz:8,color:RP.neu}),al:{h:'right'},bd:{bottom:['thin','EEF2F7']}}); });
    r+=story.length+1; }
  r=riSection(sh,r,0,23,'WHY DID IT MOVE?','pont des impayés · bleu = base, rouge = détérioration, vert = amélioration, cyan = mouvements de périmètre, or = résultat',RP.cyan);""")
rep("  r=riSection(sh,r,0,23,'TENDANCE MENSUELLE','impayés et clients en impayé',RP.eb);",
"""  if(m.jev){ const J=m.jev, p=J.ptf; sh.brk(r); r=riSection(sh,r,0,23,'FORWARD VIEW · JEV','ce qui pourrait arriver ensuite · chaque probabilité porte sa provenance',RP.bright);
    const fv=[['PD 3M (sains)',riPct(p.pd[3].v),p.pd[3].prov],['PD 6M (sains)',riPct(p.pd[6].v),p.pd[6].prov],['PD 12M (sains)',riPct(p.pd[12].v),p.pd[12].prov],['Entrées douteux 12M · central',riMd(J.scen[0].esp),J.scen[0].prov],['Entrées douteux 12M · sévère (P95)',riMd(J.scen[2].p95),J.scen[2].prov]];
    sh.h(r,16).h(r+1,26).h(r+2,24);
    fv.forEach(([t,v,pv],i)=>{ const c0=i*5, c1=i===4?23:c0+3; sh.box(r,c0,r,c1,t,{fill:{g:[RP.eb,RP.bright],deg:0},font:RI_F({b:1,sz:7.5,color:RP.white}),al:{h:'left',indent:1}});
      sh.box(r+1,c0,r+1,c1,v,{fill:{c:RP.light},font:RI_F({b:1,sz:15,color:RP.deep}),al:{h:'left',indent:1}});
      sh.box(r+2,c0,r+2,c1,pv.source+' · N = '+fmtN(pv.n)+' · '+pv.periodes+' mois · confiance '+pv.confiance,{fill:{c:RP.pale},font:RI_F({sz:6.5,color:RP.neu}),al:{h:'left',indent:1,wrap:1}}); });
    r+=3; if(p.pd[12].prov.avertissement){ sh.h(r,18).box(r,0,r,23,'⚠  '+p.pd[12].prov.avertissement,{fill:{c:'FEF3C7'},font:RI_F({b:1,sz:8.5,color:'92400E'}),al:{h:'left',indent:1},bd:{left:['thick',RP.warn]}}); r++; }
    r++; }
  r=riSection(sh,r,0,23,'TENDANCE MENSUELLE','impayés et clients en impayé',RP.eb);""")

# ---------- CONCENTRATION : data art ----------
rep("  r=riSection(sh,r,0,23,'PARETO · TOP 10 CLIENTS','encours et part cumulée',RP.gold);",
"""  { const tp=m.top5P!=null?(m.top5-m.top5P)*100:null;
    riCallout(sh,r,0,8,{icon:'⚠',t:'CONCENTRATION ALERT',c:m.top5>0.25?RP.alert:RP.gold,big:'TOP 5 CLIENTS = '+riPct(m.top5),sub:tp==null?'aucun arrêté antérieur':(tp>=0?'+':'')+tp.toFixed(1).replace('.',',')+' pts vs '+m.prevLabel});
    riCallout(sh,r,10,18,{icon:'◎',t:'DIVERSIFICATION',c:RP.bright,big:'HHI = '+fmtN(Math.round(m.hhi*10000)),sub:m.hhi*10000>1500?'concentration élevée (> 1 500)':m.hhi*10000>1000?'concentration modérée (1 000 – 1 500)':'portefeuille diversifié (< 1 000)'}); r+=4; }
  // heatmap : concentration par dimension
  { r=riSection(sh,r,0,23,'HEATMAP · CONCENTRATION PAR DIMENSION','part de l\\'encours portée par les 1, 3 et 5 premiers éléments',RP.gold);
    const dims=[['Clients',[...m.cl].sort((a,b)=>b.enc-a.enc)],['Segments',m.seg],['Gestionnaires',m.off],['Secteurs',m.sec],['Produits',m.prod]].map(([k,a])=>[k,[1,3,5].map(n=>a.slice(0,n).reduce((s,x)=>s+x.enc,0)/(m.K.enc||1)),a.length]);
    sh.h(r,24).box(r,0,r,4,'Dimension',{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'left',indent:1}});
    ['TOP 1','TOP 3','TOP 5','Éléments'].forEach((h,j)=>sh.box(r,5+j*5,r,9+j*5-(j===3?1:0),h,{fill:{c:RP.deep},font:RI_F({b:1,sz:8.5,color:RP.white}),al:{h:'center'}}));
    dims.forEach(([k,v,n],i)=>{ const y=r+1+i; sh.h(y,21); sh.box(y,0,y,4,k,{fill:{c:i%2?RP.pale:RP.white},font:RI_F({b:1,sz:9,color:RP.deep}),al:{h:'left',indent:1}});
      v.forEach((x,j)=>{ const h=riHeat(x,1); sh.box(y,5+j*5,y,9+j*5,x,{fill:{c:h.c},font:RI_F({b:1,sz:9.5,color:h.dark?RP.white:RP.deep}),nf:'0.0%',al:{h:'center'},bd:{right:['medium',RP.white],bottom:['medium',RP.white]}}); });
      sh.box(y,20,y,23,n,{fill:{c:i%2?RP.pale:RP.white},font:RI_F({sz:9,color:RP.ink2}),nf:'#,##0',al:{h:'center'}}); });
    r+=dims.length+2; }
  r=riSection(sh,r,0,23,'PARETO · TOP 10 CLIENTS','encours et part cumulée',RP.gold);""")
rep("""  sh.brk(r); r=riSection(sh,r,0,23,'BUBBLE MAP · EXPOSITION × ANCIENNETÉ','top 15 clients en impayé · taille = impayés · couleur = criticité',RP.crit);
  const bb=[...m.cl].filter(o=>o.pdo>0).sort((a,b)=>b.enc-a.enc).slice(0,15);
  if(bb.length) sh.chart({type:'bubble',nfx:RI_NFM,nfy:'0" j"',miny:0,series:[{name:'Clients',x:bb.map(o=>o.enc),y:bb.map(o=>o.dj),z:bb.map(o=>Math.max(1,o.pdo)),pts:bb.map(o=>RI_LVL[o.lvl]?RI_LVL[o.lvl].c:RP.eb),tags:bb.map((o,i)=>i<8?o.rel.slice(0,14):'')}]},r,0,r+18,24);""",
"""  sh.brk(r); r=riSection(sh,r,0,23,'BUBBLE MAP · CONCENTRATION × ÉVOLUTION','top 20 clients · position = part de l\\'encours et variation N-1 · taille = exposition · couleur = risque',RP.crit);
  const bb=[...m.cl].sort((a,b)=>b.enc-a.enc).slice(0,20);
  if(bb.length) sh.chart({type:'bubble',nfx:'0.0%',nfy:'+0%;-0%;0%',scale:55,series:[{name:'Clients',x:bb.map(o=>o.enc/(m.K.enc||1)),y:bb.map(o=>o.p&&o.p.enc?(o.enc-o.p.enc)/o.p.enc:0),z:bb.map(o=>o.enc),pts:bb.map(o=>o.lvl&&o.lvl!=='CURED'?RI_LVL[o.lvl].c:o.lvl==='CURED'?RP.ok:RP.eb),tags:bb.map((o,i)=>i<5?o.rel.slice(0,14):'')}]},r,0,r+18,24);
  sh.h(r+19,16).box(r+19,0,r+19,23,{rich:[['●',RI_F({sz:10,color:RP.crit})],[' CRITICAL   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.alert})],[' HIGH   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.warn})],[' WATCH   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.ok})],[' CURED   ',RI_F({sz:8,color:RP.ink2})],['●',RI_F({sz:10,color:RP.eb})],[' sans alerte',RI_F({sz:8,color:RP.ink2})]]},{al:{h:'center'}});""")

# ---------- WATCHLIST : Risk Intelligence Table ----------
fn('riWatch',r"""
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
""")

# ---------- ACTIONS : Risk Action Center ----------
fn('riAct',r"""
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
""")

# ---------- INSIGHTS : cartes éditoriales en composants ----------
rep("""  m.ins.forEach((x,i)=>{ const c=(i%2)*12, y=r+Math.floor(i/2)*7; sh.h(y,12).h(y+1,30).h(y+2,26).h(y+3,40).h(y+4,8).h(y+5,6);
    sh.box(y+1,c,y+2,c+2,x.n,{font:RI_F({b:1,sz:30,color:RP.gold}),al:{h:'center'},bd:{left:['thick',x.c]}});
    sh.box(y+1,c+3,y+1,c+10,x.t,{font:RI_F({b:1,sz:10,color:RP.ink2}),al:{h:'left',v:'bottom'}});
    sh.box(y+2,c+3,y+2,c+10,x.big,{font:RI_F({b:1,sz:18,color:x.c}),al:{h:'left'}});
    sh.box(y+3,c+3,y+3,c+10,x.p,{font:RI_F({sz:9,color:RP.ink2}),al:{h:'left',v:'top',wrap:1}});
    sh.blk(y+4,c,y+4,c+10,{bd:{bottom:['thin','E2E8F0']}}); });""",
"""  m.ins.forEach((x,i)=>{ const c=(i%2)*12, y=r+Math.floor(i/2)*7, c1=c+10, fr={fill:{c:RP.white}}; sh.h(y,8).h(y+1,30).h(y+2,26).h(y+3,44).h(y+4,8).h(y+5,8);
    sh.blk(y,c,y,c1,{fill:{g:[x.c,rxTint(x.c,.55)],deg:0}});
    sh.box(y+1,c,y+2,c+2,x.n,{fill:{c:RP.white},font:RI_F({b:1,sz:30,color:RP.gold}),al:{h:'center'},bd:{left:['thin','DBE6F7']}});
    sh.box(y+1,c+3,y+1,c1,x.t,{fill:{c:RP.white},font:RI_F({b:1,sz:9.5,color:RP.ink2}),al:{h:'left',v:'bottom'},bd:{right:['thin','DBE6F7']}});
    sh.box(y+2,c+3,y+2,c1,x.big,{fill:{c:RP.white},font:RI_F({b:1,sz:18,color:x.c===RP.gold?RP.deep:x.c}),al:{h:'left'},bd:{right:['thin','DBE6F7']}});
    sh.box(y+3,c,y+3,c+2,'',{fill:{c:RP.white},bd:{left:['thin','DBE6F7']}}); sh.box(y+3,c+3,y+3,c1,x.p,{fill:{c:RP.white},font:RI_F({sz:8.5,color:RP.ink2}),al:{h:'left',v:'top',wrap:1},bd:{right:['thin','DBE6F7']}});
    sh.blk(y+4,c,y+4,c1,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7']}}); sh.blk(y+4,c,y+4,c,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7'],left:['thin','DBE6F7']}}); sh.blk(y+4,c1,y+4,c1,{fill:{c:RP.white},bd:{bottom:['thin','DBE6F7'],right:['thin','DBE6F7']}});
    for(let k=1;k<=5;k++) sh.set(y+k,c1+1,null,{fill:{g:['C9D5EA','FFFFFF'],deg:0}}); sh.blk(y+5,c+1,y+5,c1,{fill:{g:['C9D5EA','FFFFFF'],deg:90}}); });""")
rep("function riIns(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.ins,{tab:RP.gold,cols:new Array(W).fill(5.4),zoom:85,portrait:false});",
    "function riIns(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.ins,{tab:RP.gold,cols:new Array(W+1).fill(5.4).map((x,i)=>i===11||i===W?1.6:x),zoom:85,portrait:false});")
rep("  r+=Math.ceil(m.ins.length/2)*7+1;\n  if(m.jev){","  r+=Math.ceil(m.ins.length/2)*7+1;\n  if(false&&m.jev){")

# ---------- AUDIT : couverture JEV / TypeSafe ----------
rep("""  r+=2; sh.box(r,0,r,8,'Généré le '""","""  r+=2; r=riSection(sh,r,0,8,'COUVERTURE JEV & TYPESAFE','tout ce qui peut relever d\\'un jugement ou d\\'une probabilité',RP.bright);
  const T=m.tsL||[], J=m.jev, adv=T.filter(t=>t.urg!=null).length;
  r=riTable(sh,r,0,[['Domaine'],['Contrôle'],['Couverture','center'],['Détail']],[
    ['Probabilité de dégradation (PD 3/6/12M)','JEV · MARKOV / HYBRID',J?'✔ actif':'—',J?'calibré sur '+J.per+' arrêtés · '+jevLbl(J.ptf.pd[12].prov):'aucune archive'],
    ['Taux observé (cohortes)','JEV · EMPIRICAL',J?'✔ actif':'—',J&&J.ptf.emp12.v!=null?riPct(J.ptf.emp12.v)+' (IC '+riPct(J.ptf.emp12.lo)+' – '+riPct(J.ptf.emp12.hi)+')':'pas de cohorte complète à 12 mois'],
    ['Stress et scénarios','JEV · STRESS / SIMULATED',J?'✔ actif':'—',J?'×1,5 et ×2,0 · Monte Carlo':''],
    ['PD par dossier de la watchlist','JEV · HYBRID (Markov + EWS + expert)',J?'✔ '+m.watch.filter(o=>o.pd12!=null).length+' / '+m.watch.length:'—','signaux TypeSafe et APEX en multiplicateurs EXPERT affichés'],
    ['Effet des actions sur la PD','JEV · recalcul par le code',J?'✔ actif':'—','régularisation, règlement partiel, levée des signaux'],
    ['Motif, crédibilité, incohérence, statut','TypeSafe · Choice / Score / Noul',T.length?'✔ '+T.length+' dossiers':'en attente','commentaires gestionnaires (feuille _TYPESAFE)'],
    ['Nature de l\\'entité, intra-groupe, segment','TypeSafe · Choice / Noul',T.length?'✔ actif':'en attente','noms de clients'],
    ['Urgence et orientation (re-classement, routage)','TypeSafe · Score / Choice',adv?'✔ '+adv+' dossiers':'en attente','capacités avancées'],
    ['Auto-cohérence et cohérence du plan','TypeSafe · Noul + Choice croisés',adv?'✔ actif':'en attente','divergence → revue analyste'],
    ['Montants, ratios, classes BCEAO / IFRS 9 / ACTE 7','Code APEX uniquement','✔ code','jamais confiés à TypeSafe ni à JEV']]);
  r+=2; sh.box(r,0,r,8,'Généré le '""")
rep("function riConc(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.conc,{tab:RP.gold,cols:new Array(W).fill(5.4),zoom:85});","function riConc(B,m,nav){ const W=24, sh=B.sheet(RI_SHEETS.conc,{tab:RP.gold,cols:new Array(W+1).fill(0).map((_,i)=>i===W?1.6:i%5===4?1.6:6.1),zoom:85});")
rep("    .forEach(([t,v,nf,u,va],i)=>riCard(sh,B,r,i*5,4,{t,v,nf,u,variant:va,d:null,dTxt:'',cmp:'part de l\\'encours total'}));\n  r+=8;","    .forEach(([t,v,nf,u,va],i)=>riCard(sh,B,r,i*5,4,{t,v,nf,u,variant:va,d:null,dTxt:'',cmp:'part de l\\'encours total',status:' '}));\n  r+=8;")
rep("function riAudit(B,m,nav){ const wd=[42,24,22,34,9,9,9,9,9]; const sh=B.sheet(RI_SHEETS.aud,{tab:RP.deep,cols:wd,zoom:90});","function riAudit(B,m,nav){ const wd=[40,24,20,34,7,7,7,7,7]; const sh=B.sheet(RI_SHEETS.aud,{tab:RP.deep,cols:wd,zoom:90,a3:true});")
rep("  m.ins.forEach((x,i)=>{ const c=(i%2)*12, y=r+Math.floor(i/2)*7, c1=c+10, fr={fill:{c:RP.white}};","  m.ins.forEach((x,i)=>{ const c=(i%2)*12, y=r+Math.floor(i/2)*7, c1=c+10, fr={fill:{c:RP.white}}; if(i===4) sh.brk(y);")
open(p,'w',encoding='utf-8').write(s)
print('ok')

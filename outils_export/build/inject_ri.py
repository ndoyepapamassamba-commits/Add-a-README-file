import os
s=open('apex35.html',encoding='utf-8').read()
def rep(a,b):
    global s
    assert s.count(a)==1,a[:80]; s=s.replace(a,b)
rep("if(z.file('xl/worksheets/sheetApex1.xml')) return null; const stF=z.file('xl/styles.xml');",
    "if(z.file('xl/worksheets/sheetApex1.xml')) return null; if(z.file('docProps/core.xml')&&/APEX-RI/.test(await z.file('docProps/core.xml').async('string'))) return null; /* Credit Risk Intelligence : déjà au format premium natif */ const stF=z.file('xl/styles.xml');")
btn='<button class="btn sm" id="btnRi" style="background:linear-gradient(90deg,#003DA5,#2563EB);color:#fff;border-color:#C8A951" title="Credit Risk Intelligence — exports Excel premium : Executive, Risk, Watchlist, Action plan, Audit, Data"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 15l3-3 3 2 4-5"/></svg> Risk Intelligence</button>\n  '
rep('<button class="btn sm" id="btnJev"',btn+'<button class="btn sm" id="btnJev"')
js=open('ri_writer.js').read()+'\n'+open('ri_engine.js').read(); assert '</script' not in js
i=s.index("document.getElementById('btnJev').onclick=jevOpen;"); j=s.index('</script>',i)+len('</script>')
s=s[:j]+"\n<script>\n"+js+"\n</script>"+s[j:]
# provisions de l'historique alignées sur la règle IFRS 9 d'APEX (ECL réel, sinon modélisé par stage)
rep("prov:['Cprov In Local Currency',","prov:['Cprovisions IFRS9 In Local Currency','Cprov In Local Currency',")
rep("c.enc+=enc; c.pdo+=pdo; c.ecl+=toNum(v(row,'prov'));","c.enc+=enc; c.pdo+=pdo; { const pv=toNum(v(row,'prov')); c.ecl+=pv>0?pv:enc*(ECL_RATE[st]||0.01); }")
rep("return hsPack(cli,new Date(rep),fname,src,facs);","return Object.assign(hsPack(cli,new Date(rep),fname,src,facs),{eclBasis:'IFRS9'});")
rep("return hsPack(cli,d,fname||(S.meta&&S.meta.file)||'PDO','ACTE7',fac);","return Object.assign(hsPack(cli,d,fname||(S.meta&&S.meta.file)||'PDO','ACTE7',fac),{eclBasis:'IFRS9'});")
# TypeSafe : urgence, orientation, auto-cohérence, cohérence du plan (capacités avancées)
rep("    o.enAttente=!A.motif; o.statut=o.enAttente?(statFic||'À faire'):o.revue.length?'Revue analyste':o.statutTs; }",
    "    if(A.urgence){ o.urg=Math.round(+A.urgence.rep); o.cUrg=A.urgence.conf; }\n    if(A.routage){ o.routage=({gestionnaire:'Gestionnaire',recouvrement_amiable:'Recouvrement amiable',restructuration_credit:'Restructuration (crédit)',juridique_contentieux:'Juridique / contentieux',analyste_risque:'Analyste risque'})[A.routage.rep]||A.routage.rep; o.cRoute=A.routage.conf; if(o.cRoute!=null&&o.cRoute<TS_CONF) o.revue.push('orientation incertaine'); }\n    if(A.motif_durable&&A.motif){ const pd=+A.motif_durable.rep, dc=['perte_revenus','fraude_detournement','litige_juridique','client_injoignable'].includes(A.motif.rep); o.pDurable=pd; if((pd>=TS_SEUIL)!==dc&&Math.abs(pd-0.5)>0.15) o.revue.push('auto-cohérence : motif et durabilité divergent'); }\n    if(A.coherence_plan){ o.pPlan=+A.coherence_plan.rep; if(o.pPlan<1-TS_SEUIL) o.qc.push('Plan d\\'action APEX sans rapport avec la cause décrite'); }\n    o.enAttente=!A.motif; o.statut=o.enAttente?(statFic||'À faire'):o.revue.length?'Revue analyste':o.statutTs; }")
rep("commentaire:t?t.commentaire:'',statut_fichier:t?t.statutFichier:'À faire'}; })};","commentaire:t?t.commentaire:'',statut_fichier:t?t.statutFichier:'À faire',plan:String(r.t.planText||r.t.text||'').slice(0,600)}; })};")
# couche commune : Blue Premium + TypeSafe sur tous les exports Excel
rep("const buf=await blob.arrayBuffer(); return k==='x'?pmXlsx(buf,name):k==='w'?pmDocx(buf,name):pmPptx(buf,name); }",
    "const buf=await blob.arrayBuffer(); if(k==='x'){ const o=await pmXlsx(buf,name); const b=await pmBlue(o||new Blob([buf]),name); return b||o; } return k==='w'?pmDocx(buf,name):pmPptx(buf,name); }")
i=s.index('async function pmFinish'); s=s[:i]+open('pm_blue.js',encoding='utf-8').read()+'\n'+s[i:]
# --- APEX 38 : documents Word / PPT / PDF, agent EXPORT, JEV automatique, nettoyage des noms ---
i=s.index('async function pmFinish'); s=s[:i]+open('ri_docs.js',encoding='utf-8').read()+'\n'+s[i:]
rep("const buf=await blob.arrayBuffer(); if(k==='x'){ const o=await pmXlsx(buf,name); const b=await pmBlue(o||new Blob([buf]),name); return b||o; } return k==='w'?pmDocx(buf,name):pmPptx(buf,name); }",
 "const t0=Date.now(), buf=await blob.arrayBuffer(); let out=null, steps=[]; if(k==='x'){ const o=await pmXlsx(buf,name); if(o) steps.push('finition premium'); const b=await pmBlue(o||new Blob([buf]),name); if(b) steps.push('Blue Premium + couche sémantique'); out=b||o; } else { const o=await (k==='w'?pmDocx(buf,name):pmPptx(buf,name)); if(o) steps.push('finition premium'); const b=await pmBlueOffice(o||new Blob([buf]),name); if(b) steps.push('Blue Premium + couche sémantique'); out=b||o; }\n  const sc=await expScrub(out||new Blob([buf]),name); if(sc){ out=sc; steps.push('noms internes masqués'); } if(out&&!out.pmName&&k==='h') out.pmName=name; const fin=out||new Blob([buf]); EXPORT_AGENT.note(({x:'Excel',w:'Word',p:'PowerPoint'})[k],name,{size:fin.size,ms:Date.now()-t0,steps,warn:await EXPORT_AGENT.inspect(fin,name)}); return out; }")
# Word-HTML : la conversion .doc → .docx passe aussi par la couche commune
rep("const nn=name.replace(/\\.doc$/i,'.docx'), ab=await pmHtmlToDocx(txt), out=await pmDocx(ab,nn); if(out) out.pmName=nn; return out; }",
 "const nn=name.replace(/\\.doc$/i,'.docx'), ab=await pmHtmlToDocx(txt); let out=await pmDocx(ab,nn); const b=await pmBlueOffice(out||new Blob([ab]),nn); out=b||out; const sc=await expScrub(out||new Blob([ab]),nn); out=sc||out; if(out){ out.pmName=nn; EXPORT_AGENT.note('Word',nn,{size:out.size,steps:['HTML → docx','Blue Premium + couche sémantique','noms internes masqués'],warn:await EXPORT_AGENT.inspect(out,nn)}); } return out; }")
# JEV : recalibrage automatique à chaque chargement d'arrêté
rep("S.meta={file:fname, sheet:m.name, nLines:rows.length};\n  bootApp();","S.meta={file:fname, sheet:m.name, nLines:rows.length};\n  bootApp(); if(typeof jevAuto==='function') jevAuto();")
# import : accepte la feuille renommée
rep("const tsn=wb.SheetNames.find(n=>/^_?typesafe$/i.test(n));","const tsn=wb.SheetNames.find(n=>/^_?(typesafe|semantique|sémantique)$/i.test(n));")
# kit g3 (visuels en relief des exports) en Blue Premium
rep("const G3={navy:'#00415e',navy2:'#00344b',blue:'#005c83',sky:'#2b9ad6',lime:'#8cc63f',lime2:'#a6d867',\n  ink:'#12333f',mut:'#3e5c6b',line:'#cfe0e7',bg:'#ffffff',s1:'#6ba23a',s2:'#d4a13a',s3:'#c0392b',\n  pal:['#00415e','#005c83','#8cc63f','#2b9ad6','#d4a13a','#6ba23a','#c0392b','#1a6fb5','#a6d867','#3e5c6b']};",
 "const G3={navy:'#001b4d',navy2:'#002b73',blue:'#003da5',sky:'#2563eb',lime:'#c8a951',lime2:'#e2cf8f',\n  ink:'#0f172a',mut:'#334155',line:'#dbe6f7',bg:'#ffffff',s1:'#16a34a',s2:'#f59e0b',s3:'#dc2626',\n  pal:['#001b4d','#003da5','#c8a951','#2563eb','#06b6d4','#16a34a','#dc2626','#f59e0b','#e2cf8f','#334155']};")
rep("bg.addColorStop(0,'#eef4f7'); bg.addColorStop(1,'#dfe9f2');","bg.addColorStop(0,'#f5f9ff'); bg.addColorStop(1,'#e3ecfa');")
# moteur commun des salles : graphiques 3D (barres 3D natives, biseau et ombre)
_FX='<a:effectLst><a:outerShdw blurRad="50800" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="001B4D"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="38100" h="25400"/></a:sp3d>'
_i=s.index('function pmChartXml'); _k=s.index('function pmNameMap',_i); blk=s[_i:_k]
def rb(x,y):
    global blk
    assert blk.count(x)==1,x[:60]; blk=blk.replace(x,y)
rb("</a:ln></c:spPr></c:dPt>`","</a:ln>"+_FX+"</c:spPr></c:dPt>`")
rb("`<c:barChart><c:barDir","`<c:bar3DChart><c:barDir")
rb('<c:axId val="5001"/><c:axId val="5002"/></c:barChart>`','<c:gapDepth val="90"/><c:shape val="box"/><c:axId val="5001"/><c:axId val="5002"/></c:bar3DChart>`')
rb('<c:dLblPos val="outEnd"/>','')
rb("<c:autoTitleDeleted val=\"0\"/><c:plotArea>","<c:autoTitleDeleted val=\"0\"/>${kind==='pie'?'':'<c:view3D><c:rotX val=\"12\"/><c:rotY val=\"16\"/><c:rAngAx val=\"1\"/></c:view3D>'}<c:plotArea>")
s=s[:_i]+blk+s[_k:]
rep("return {C,H,ptf,segs,scen,cps,per,calib:C.calib,date:H.length?H[H.length-1].date:null}; }","const _o={C,H,ptf,segs,scen,cps,per,calib:C.calib,date:H.length?H[H.length-1].date:null}; try{ _o.adv=jevAdvanced(_o); }catch(e){ console.warn('JEV avancé',e); } return _o; }")
rep("['prov','Provenance & limites']]","['adv','Analyses avancées'],['prov','Provenance & limites']]")
rep("  if(tab==='prov'){",r"""  if(tab==='adv'&&R.adv){ const A=R.adv, mxT=Math.max(...A.term);
    h+=jevWarn(A.termProv)+`<div class="jev-grid4">${[['Temps moyen avant défaut (Sain)',A.ttd?A.ttd[0].toFixed(0)+' mois':'—',A.ttdProv],['Guérison depuis 31-60 j',jevPct(A.cure[0]),A.cureProv],['Guérison depuis 61-90 j',jevPct(A.cure[1]),A.cureProv],['PD 12M · IC 90 %',jevPct(A.boot.lo)+' – '+jevPct(A.boot.hi),A.bootProv]].map(([t,v,p])=>`<div class="jev-card"><h4>${jevE(t)}</h4><div class="jev-pb big"><b>${v}</b>${jevChip(p)}<small>${jevE(p.methode)}</small></div></div>`).join('')}</div>
      <div class="jev-grid2"><div class="jev-card"><h4>Structure par terme de la PD (sains) — 1 à 24 mois</h4>${jevSvgLines([{n:'PD cumulée',v:A.term.slice(0,12)}],['#003DA5'])}<table class="jev-t"><tr><th>Horizon</th>${[3,6,12,18,24].map(k=>'<th>'+k+' m</th>').join('')}</tr><tr><td>Cumulée</td>${[3,6,12,18,24].map(k=>'<td>'+jevPct(A.term[k-1])+'</td>').join('')}</tr><tr><td>Marginale</td>${[3,6,12,18,24].map(k=>'<td>'+jevPct(A.marg[k-1])+'</td>').join('')}</tr></table></div>
      <div class="jev-card"><h4>Backtest, stress inverse et sensibilité</h4>${A.back?`<p><b>Backtest hors échantillon</b> ${jevChip(A.backProv)} : ${A.back.exp.toFixed(1)} entrées en douteux prévues, ${A.back.obs} observées (ratio ${A.back.ratio!=null?A.back.ratio.toFixed(2):'—'}), score de Brier ${A.back.brier!=null?A.back.brier.toFixed(4):'—'} sur ${fmtN(A.back.n)} contreparties.</p>`:'<p>Backtest : au moins 3 arrêtés nécessaires.</p>'}
      <p><b>Stress inverse</b> ${jevChip(A.revProv)} : un facteur <b>×${A.rev.factor.toFixed(2)}</b> sur les probabilités de dégradation double la PD 12M des sains (${jevPct(A.rev.target)}).</p>
      <table class="jev-t"><tr><th>Transition</th><th>Probabilité mensuelle</th><th>Effet de +10 % sur la PD 12M</th></tr>${A.sens.map(x=>`<tr><td>${x.de} → ${x.vers}</td><td>${jevPct(x.p)}</td><td><b>+${(100*x.d).toFixed(2)} pt</b>${jevBar(x.d,A.sens[0].d||1,'#DC2626')}</td></tr>`).join('')}</table><small>${jevChip(A.sensProv)} ${jevE(A.sensProv.methode)}</small></div></div>`; }
  if(tab==='prov'){""")
i=s.index('async function pmFinish'); s=s[:i]+open('jev_adv.js',encoding='utf-8').read()+'\n'+s[i:]
# visuels Blender (exports + application) et couche ULTRA 3D de l'interface
import base64, json as _json
_art={k:'data:image/jpeg;base64,'+base64.b64encode(open(os.path.join(os.environ.get('ART','../typesafe-reporting/sortie'),'art_'+k+'.jpg'),'rb').read()).decode() for k in ['hero','banner','emblem','tile']}
_artjs='const RI_ART='+_json.dumps(_art)+';\n(function(){ try{ const r=document.documentElement.style; r.setProperty("--art-banner",`url("${RI_ART.banner}")`); r.setProperty("--art-emblem",`url("${RI_ART.emblem}")`); }catch(e){} })();\n'
_k=s.index("document.getElementById('btnJev').onclick=jevOpen;"); _k=s.index('<script>',_k); s=s[:_k]+'<script>\n'+_artjs+'</script>\n'+s[_k:]
_HD='\n</head>\n<body>\n<!-- TOPBAR -->'; assert s.count(_HD)==1, 'head'; _h=s.index(_HD)+1
s=s[:_h]+'<style id="ultra3d">\n'+open('app3d.css',encoding='utf-8').read()+'\n</style>\n'+s[_h:]
import ts_apex
_box=[s]
def _rep(a,b):
    assert _box[0].count(a)==1,a[:80]; _box[0]=_box[0].replace(a,b)
ts_apex.apply(_box,_rep); s=_box[0]
open('apex36.html','w',encoding='utf-8').write(s)

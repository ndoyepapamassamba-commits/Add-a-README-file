# Relief 3D : graphiques natifs 3D, ombres, biseaux, cellules en relief (writer + engine) — idempotent
w=open('ri_writer.js',encoding='utf-8').read()
if 'RX_FX3D' not in w:
    def rp(a,b):
        global w
        assert w.count(a)==1,a[:70]; w=w.replace(a,b)
    rp("const rxSp=(fill,line,w)=>","const RX_FX3D='<a:effectLst><a:outerShdw blurRad=\"50800\" dist=\"25400\" dir=\"5400000\" algn=\"t\" rotWithShape=\"0\"><a:srgbClr val=\"001B4D\"><a:alpha val=\"38000\"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst=\"orthographicFront\"/><a:lightRig rig=\"threePt\" dir=\"t\"/></a:scene3d><a:sp3d><a:bevelT w=\"38100\" h=\"25400\"/></a:sp3d>', RX_SHD='<a:effectLst><a:outerShdw blurRad=\"38100\" dist=\"25400\" dir=\"5400000\" algn=\"t\" rotWithShape=\"0\"><a:srgbClr val=\"001B4D\"><a:alpha val=\"35000\"/></a:srgbClr></a:outerShdw></a:effectLst>';\nconst rxSp=(fill,line,w)=>")
    rp("<a:round/></a:ln>`:''}</c:spPr>`;","<a:round/></a:ln>`:''}${fill&&fill!=='none'?RX_FX3D:(line&&line!=='none'?RX_SHD:'')}</c:spPr>`;")
    rp("plot=`<c:barChart><c:barDir val=\"${H?'bar':'col'}\"/>","v3d='<c:view3D><c:rotX val=\"12\"/><c:rotY val=\"16\"/><c:rAngAx val=\"1\"/></c:view3D>'; plot=`<c:bar3DChart><c:barDir val=\"${H?'bar':'col'}\"/>")
    rp("<c:gapWidth val=\"${sp.gap||55}\"/>${grp==='stacked'?'<c:overlap val=\"100\"/>':''}<c:axId val=\"201\"/><c:axId val=\"202\"/></c:barChart>`","<c:gapWidth val=\"${sp.gap||55}\"/><c:gapDepth val=\"90\"/><c:shape val=\"box\"/><c:axId val=\"201\"/><c:axId val=\"202\"/></c:bar3DChart>`.replace(/<c:dLblPos val=\"(outEnd|inEnd|inBase)\"\\/>/g,'')")
    rp("<c:invertIfNegative val=\"0\"/><c:bubble3D val=\"0\"/>${rxSp({g:[rxTint(c,.45),c]","<c:invertIfNegative val=\"0\"/><c:bubble3D val=\"1\"/>${rxSp({g:[rxTint(c,.45),c]")
    rp("<c:bubble3D val=\"0\"/></c:ser>","<c:bubble3D val=\"1\"/></c:ser>")
    rp("<c:chart>${title}<c:plotArea>","<c:chart>${title}${v3d}<c:plotArea>")
    import re
    m=re.search(r"function rxChartXml\(B,sp\)\{ const cats=sp\.cats\|\|\[\], cr=B\.series\(cats,'cat:'\+\(sp\.title\|\|''\)\)\.ref; let plot=''",w)
    assert m; w=w[:m.end()]+", v3d=''"+w[m.end():]
    rp("`<font>${f.b?'<b/>':''}${f.i?'<i/>':''}${f.u?'<u/>':''}","`<font>${f.b?'<b/>':''}${f.i?'<i/>':''}${f.sh?'<shadow/>':''}${f.u?'<u/>':''}")
    open('ri_writer.js','w',encoding='utf-8').write(w)
e=open('ri_engine.js',encoding='utf-8').read()
def re_(a,b):
    global e
    assert e.count(a)>=1,a[:70]; e=e.replace(a,b)
re_("line=dark?null:['thin','DBE6F7'];","line=dark?null:['medium','BCCBE3'];")
re_("o.v,base({font:RI_F({b:1,sz:22,color:fg}),","o.v,base({font:RI_F({b:1,sz:22,color:fg,sh:1}),")
re_("[(title||'CREDIT RISK INTELLIGENCE')+'\\n',RI_F({b:1,sz:26,color:RP.white})]","[(title||'CREDIT RISK INTELLIGENCE')+'\\n',RI_F({b:1,sz:26,color:RP.white,sh:1})]")
re_("  return {fill:{c:L.c},font:RI_F({b:1,sz:8,color:RP.white}),al:{h:'center'}}; }","  return {fill:{g:[rxTint(L.c,.18),L.c],deg:90},font:RI_F({b:1,sz:8,color:RP.white,sh:1}),al:{h:'center'},bd:{bottom:['medium',{CRITICAL:'991B1B',HIGH:'C2410C',CURED:'15803D'}[lvl]||'334155'],top:['thin',rxTint(L.c,.5)]}}; }")
re_("{fill:{c:RP.white},al:{h:'left',indent:1},bd:{top:['thin','DBE6F7'],bottom:['thin','DBE6F7'],","{fill:{g:['FFFFFF',RP.pale],deg:90},al:{h:'left',indent:1},bd:{top:['thin','FFFFFF'],bottom:['medium','BCCBE3'],")
open('ri_engine.js','w',encoding='utf-8').write(e)
re_("Valeurs non numériques (NaN / Infini)","Valeurs non numériques (non-nombres, infinis)")
re_("    r++; }\n  r=riSection(sh,r,0,23,'TENDANCE MENSUELLE'","""    if(J.adv){ const A=J.adv, cards=[['TEMPS MOYEN AVANT DÉFAUT · SAIN',A.ttd?A.ttd[0].toFixed(0)+' mois':'—',A.ttdProv],['GUÉRISON DEPUIS 31-60 J',riPct(A.cure[0]),A.cureProv],['GUÉRISON DEPUIS 61-90 J',riPct(A.cure[1]),A.cureProv],['PD 12M · IC 90 % (BOOTSTRAP)',riPct(A.boot.lo)+' – '+riPct(A.boot.hi),A.bootProv],['STRESS INVERSE · PD × 2',A.rev?'×'+A.rev.factor.toFixed(2).replace('.',','):'—',A.revProv]];
      sh.h(r,16).h(r+1,26).h(r+2,24);
      cards.forEach(([t2,v,pv],i)=>{ const c0=i*5, c1=i===4?23:c0+3; sh.box(r,c0,r,c1,t2,{fill:{g:[RP.deep,RP.corp],deg:0},font:RI_F({b:1,sz:7,color:RP.gold}),al:{h:'left',indent:1}});
        sh.box(r+1,c0,r+1,c1,v,{fill:{g:['FFFFFF',RP.light],deg:90},font:RI_F({b:1,sz:14,color:RP.deep,sh:1}),al:{h:'left',indent:1},bd:{bottom:['medium','BCCBE3'],right:['medium','BCCBE3']}});
        sh.box(r+2,c0,r+2,c1,pv.source+' · '+pv.methode,{fill:{c:RP.pale},font:RI_F({sz:6,color:RP.neu}),al:{h:'left',indent:1,wrap:1}}); });
      r+=3; if(A.back){ sh.h(r,18).box(r,0,r,23,{rich:[['BACKTEST HORS ÉCHANTILLON   ',RI_F({b:1,sz:8,color:RP.gold})],['entrées en douteux prévues '+A.back.exp.toFixed(1).replace('.',',')+' · observées '+A.back.obs+' · ratio '+(A.back.ratio!=null?A.back.ratio.toFixed(2).replace('.',','):'—')+' · score de Brier '+(A.back.brier!=null?A.back.brier.toFixed(4).replace('.',','):'—')+'   ('+A.backProv.source+', N = '+fmtN(A.back.n)+')',RI_F({sz:8.5,color:RP.ink2})]]},{fill:{c:RP.light},al:{h:'left',indent:1},bd:{left:['thick',RP.bright]}}); r++; }
      if(A.sens.length){ sh.h(r,18).box(r,0,r,23,{rich:[['SENSIBILITÉ   ',RI_F({b:1,sz:8,color:RP.gold})],[A.sens.slice(0,3).map(x=>x.de+' → '+x.vers+' : +'+(100*x.d).toFixed(2).replace('.',',')+' pt de PD 12M pour +10 %').join('   ·   '),RI_F({sz:8.5,color:RP.ink2})]]},{fill:{c:RP.pale},al:{h:'left',indent:1},bd:{left:['thick',RP.cyan]}}); r++; } }
    r++; }
  r=riSection(sh,r,0,23,'TENDANCE MENSUELLE'""")
re_("    ['Effet des actions sur la PD','JEV · recalcul par le code',J?'✔ actif':'—','régularisation, règlement partiel, levée des signaux'],","    ['Effet des actions sur la PD','JEV · recalcul par le code',J?'✔ actif':'—','régularisation, règlement partiel, levée des signaux'],\n    ['Analyses avancées','JEV · MARKOV / SIMULATED / EMPIRICAL / STRESS',J&&J.adv?'✔ actif':'—','structure par terme, temps avant défaut, guérison, IC bootstrap, backtest, stress inverse, sensibilité'],")
open('ri_engine.js','w',encoding='utf-8').write(e)
print('3d ok')

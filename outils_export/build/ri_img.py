# Visuels Blender dans les exports : images natives (une seule fois dans le fichier) — idempotent
w=open('ri_writer.js',encoding='utf-8').read()
if 'S.image=' not in w:
    def rp(a,b):
        global w
        assert w.count(a)==1,a[:80]; w=w.replace(a,b)
    rp("  S.chart=(spec,r1,c1,r2,c2)=>{ S.charts.push({spec,r1,c1,r2,c2,id:++B.charts}); return S; };",
       "  S.chart=(spec,r1,c1,r2,c2)=>{ S.charts.push({spec,r1,c1,r2,c2,id:++B.charts}); return S; };\n  S.imgs=[]; S.image=(key,r1,c1,r2,c2,o)=>{ if(B.media[key]) S.imgs.push({key,r1,c1,r2,c2,o:o||{}}); return S; };")
    rp("  B.zip=async()=>rxZip(B);","  B.media={}; B.addMedia=(key,u8,ext)=>{ if(u8&&u8.length) B.media[key]={u8,ext:ext||'jpeg',n:Object.keys(B.media).length+1}; return B; };\n  B.zip=async()=>rxZip(B);")
    rp("    if(S.charts.length){ const rels=[]; const anchors=S.charts.map((ch,k)=>{","    if(S.charts.length||S.imgs.length){ const rels=[]; const anchors=S.charts.map((ch,k)=>{")
    rp("      z.file(`xl/drawings/drawing${n}.xml`,`<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><xdr:wsDr xmlns:xdr=\"${RX_XDR}\" xmlns:a=\"${RX_A}\" xmlns:r=\"${RX_R}\">${anchors.join('')}</xdr:wsDr>`);",
       """      S.imgs.forEach((im,k)=>{ const md=B.media[im.key], id=S.charts.length+k+2, c=im.o.crop||{}; rels.push(`<Relationship Id="rIdI${k+1}" Type="${RX_R}/image" Target="../media/image${md.n}.${md.ext}"/>`);
        anchors.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${im.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${im.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${rxX(im.o.name||'Visuel 3D')}" descr="${rxX(im.o.alt||'Visuel 3D ECOBANK')}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${k+1}"/><a:srcRect${c.l?` l="${c.l}"`:''}${c.t?` t="${c.t}"`:''}${c.r?` r="${c.r}"`:''}${c.b?` b="${c.b}"`:''}/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${im.o.frame?`<a:ln w="12700"><a:solidFill><a:srgbClr val="${im.o.frame}"/></a:solidFill></a:ln>`:''}</xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`); });
      z.file(`xl/drawings/drawing${n}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${RX_XDR}" xmlns:a="${RX_A}" xmlns:r="${RX_R}">${anchors.join('')}</xdr:wsDr>`);""")
    rp("(S.charts.length?'<drawing r:id=\"rId1\"/>':'')","(S.charts.length||S.imgs.length?'<drawing r:id=\"rId1\"/>':'')")
    rp("  const nS=B.sheets.length;","  Object.values(B.media).forEach(md=>z.file(`xl/media/image${md.n}.${md.ext}`,md.u8));\n  const nS=B.sheets.length;")
    rp('<Default Extension="xml" ContentType="application/xml"/>','<Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/>')
    open('ri_writer.js','w',encoding='utf-8').write(w)

e=open('ri_engine.js',encoding='utf-8').read()
def re_(a,b):
    global e
    assert e.count(a)==1,a[:80]; e=e.replace(a,b)
# hero : texte à gauche (date intégrée), rendu Blender à droite
re_("[(sub||'Portfolio Monitoring & Early Warning'),RI_F({sz:10.5,color:'C7D7F5'})]]}",
    "[(sub||'Portfolio Monitoring & Early Warning'),RI_F({sz:10.5,color:'C7D7F5'})],['\\n'+long+'   ·   PORTFOLIO MONITORING',RI_F({b:1,sz:9,color:RP.gold})],['\\n'+m.perimetre,RI_F({sz:7.5,color:'BFD3FF'})]]}")
re_("  sh.h(6,2.5).blk(6,0,6,L,{fill:{g:[RP.gold,'F3E7BF'],deg:0}});",
    """  if(sh.B.media.tile){ const px=c=>Math.round(((sh.cols[c]||8.43)*7)+5), wpx=[...Array(W-split)].reduce((a,_,i)=>a+px(split+i),0), hpx=[1,2,3,4,5].reduce((a,r)=>a+(sh.rows.get(r)||15)*96/72,0), A=wpx/hpx, I=3;
    const crop=A>I?{t:Math.round((1-I/A)/2*100000),b:Math.round((1-I/A)/2*100000)}:{l:Math.round((1-A/I)/2*100000),r:Math.round((1-A/I)/2*100000)};
    sh.image('tile',1,split,6,W,{crop,name:'Visuel 3D ECOBANK',alt:'Skyline de données en verre bleu et anneau or (rendu Blender)'}); }
  sh.h(6,2.5).blk(6,0,6,L,{fill:{g:[RP.gold,'F3E7BF'],deg:0}});""")
re_("  const B=rxBook({title:'Ecobank Sénégal · Credit Risk Intelligence · '+V.lib,subject:'Arrêté '+m.label,date:'Arrêté '+m.label}); const nav=V.nav;",
    "  const B=rxBook({title:'Ecobank Sénégal · Credit Risk Intelligence · '+V.lib,subject:'Arrêté '+m.label,date:'Arrêté '+m.label}); const nav=V.nav;\n  try{ if(typeof RI_ART!=='undefined'&&RI_ART.tile){ const s64=atob(RI_ART.tile.split(',')[1]), u=new Uint8Array(s64.length); for(let i=0;i<s64.length;i++) u[i]=s64.charCodeAt(i); B.addMedia('tile',u,'jpeg'); } }catch(err){ console.warn('visuel 3D',err); }")
open('ri_engine.js','w',encoding='utf-8').write(e)

d=open('ri_docs.js',encoding='utf-8').read()
def rd(a,b):
    global d
    if b in d: return
    assert d.count(a)==1,a[:80]; d=d.replace(a,b)
# PDF : héro sur rendu Blender ; Word : bandeau Blender en tête
rd("`<div class=\"hero\"><div><div class=\"k\">","`<div class=\"hero\" style=\"background:#001B4D url('${typeof RI_ART!=='undefined'?RI_ART.hero:''}') right center/cover\"><div><div class=\"k\">")
rd(".hero>div:first-child{background:linear-gradient(90deg,#001B4D,#003DA5);",".hero>div:first-child{background:linear-gradient(90deg,rgba(0,27,77,.97),rgba(0,40,120,.72));")
rd(".hr{background:linear-gradient(90deg,#003DA5,#2563EB);",".hr{background:linear-gradient(90deg,rgba(0,27,77,.45),rgba(0,61,165,.05));")
rd("  const hero=forWord?`<table style=\"width:100%;border-collapse:collapse\">","  const hero=forWord?`${typeof RI_ART!=='undefined'?`<img src=\"${RI_ART.banner}\" width=\"640\" alt=\"Visuel 3D ECOBANK\"/>`:''}<table style=\"width:100%;border-collapse:collapse\">")
# PowerPoint : couverture sur rendu Blender, bandeaux de titre en image
rd("  let s=P.addSlide(); s.background={color:RIX.deep}; s.addShape(P.ShapeType.rect,{x:0,y:0,w:W*0.64,h:H,fill:{color:RIX.deep}}); s.addShape(P.ShapeType.rect,{x:W*0.64,y:0,w:W*0.36,h:H,fill:{color:RIX.eb}});",
   "  let s=P.addSlide(); s.background={color:RIX.deep}; const ART=typeof RI_ART!=='undefined'?RI_ART:null; if(ART&&ART.hero) s.addImage({data:ART.hero,x:0,y:0,w:W,h:H}); s.addShape(P.ShapeType.rect,{x:0,y:0,w:W*0.6,h:H,fill:{color:RIX.deep,transparency:ART?18:0},line:{color:RIX.deep,transparency:100}}); if(!ART) s.addShape(P.ShapeType.rect,{x:W*0.64,y:0,w:W*0.36,h:H,fill:{color:RIX.eb}});")
rd("  const head=(s,t,sub)=>{ s.background={color:'FFFFFF'}; s.addShape(P.ShapeType.rect,{x:0,y:0,w:W,h:0.9,fill:{color:RIX.deep}});",
   "  const head=(s,t,sub)=>{ s.background={color:'FFFFFF'}; if(typeof RI_ART!=='undefined'&&RI_ART.banner){ s.addImage({data:RI_ART.banner,x:0,y:0,w:W,h:W*560/2400,sizing:{type:'cover',w:W,h:0.9}}); s.addShape(P.ShapeType.rect,{x:0,y:0,w:W*0.7,h:0.9,fill:{color:RIX.deep,transparency:15},line:{color:RIX.deep,transparency:100}}); } else s.addShape(P.ShapeType.rect,{x:0,y:0,w:W,h:0.9,fill:{color:RIX.deep}});")
rd("{text:t,options:{color:'FFFFFF',bold:true,fontSize:20}}],{x:0.4,y:0.12,w:9.5,h:0.66,fontFace:F,margin:0});","{text:t,options:{color:'FFFFFF',bold:true,fontSize:20}}],{x:0.4,y:0.12,w:9.5,h:0.66,fontFace:F,margin:0,shadow:{type:'outer',blur:4,offset:2,angle:90,color:'000000',opacity:0.5}});")
# Word : texte en relief (ombre w14) sur les titres et grands chiffres
rd("        d=d.replace(/(<w:sectPr[\\s\\S]*?<\\/w:sectPr>\\s*<\\/w:body>)/,xml+'$1'); df&&z.file('word/document.xml',d); } }",
   """        d=d.replace(/(<w:sectPr[\\s\\S]*?<\\/w:sectPr>\\s*<\\/w:body>)/,xml+'$1'); }
      // texte en relief : ombre portée Word 2010 sur les titres et les grands chiffres (gras ≥ 13 pt)
      const W14='http://schemas.microsoft.com/office/word/2010/wordml', MC='http://schemas.openxmlformats.org/markup-compatibility/2006';
      if(!/xmlns:w14=/.test(d.slice(0,3000))) d=d.replace('<w:document ','<w:document xmlns:w14="'+W14+'" ');
      if(!/xmlns:mc=/.test(d.slice(0,3000))) d=d.replace('<w:document ','<w:document xmlns:mc="'+MC+'" ');
      if(/mc:Ignorable="/.test(d.slice(0,3000))){ if(!/mc:Ignorable="[^"]*\\bw14\\b/.test(d.slice(0,3000))) d=d.replace(/mc:Ignorable="/,'mc:Ignorable="w14 '); } else d=d.replace('<w:document ','<w:document mc:Ignorable="w14" ');
      const SHD='<w14:shadow w14:blurRad="38100" w14:dist="19050" w14:dir="5400000" w14:sx="100000" w14:sy="100000" w14:kx="0" w14:ky="0" w14:algn="tl"><w14:srgbClr w14:val="001B4D"><w14:alpha w14:val="62000"/></w14:srgbClr></w14:shadow>';
      d=d.replace(/<w:rPr>((?:(?!<\\/w:rPr>)[\\s\\S])*?<w:b\\/>(?:(?!<\\/w:rPr>)[\\s\\S])*?<w:sz w:val="(\\d+)"\\/>(?:(?!<\\/w:rPr>)[\\s\\S])*?)<\\/w:rPr>/g,(m0,inner,sz)=>+sz>=26&&!/w14:shadow/.test(inner)?'<w:rPr>'+inner+SHD+'</w:rPr>':m0);
      df&&z.file('word/document.xml',d); }""")
open('ri_docs.js','w',encoding='utf-8').write(d)
print('img ok')

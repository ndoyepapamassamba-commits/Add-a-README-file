/* =====================================================================
   RX — générateur Open XML (xlsx) natif du moteur Credit Risk Intelligence
   · styles mutualisés (registre), dégradés de cellule, fusions
   · graphiques natifs (aire+courbes, barres, cascade, anneau, bulles, Pareto)
   · sparklines, barres de données, échelles de couleur, jeux d'icônes
   · navigation par liens internes, impression A4/A3 paysage, titres répétés
   Aucune image, aucune forme : fichier léger, 100 % natif.
   ===================================================================== */
const RX_NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main', RX_R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  RX_C='http://schemas.openxmlformats.org/drawingml/2006/chart', RX_A='http://schemas.openxmlformats.org/drawingml/2006/main', RX_XDR='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  RX_X14='http://schemas.microsoft.com/office/spreadsheetml/2009/9/main', RX_XM='http://schemas.microsoft.com/office/excel/2006/main';
const rxX=s=>String(s==null?'':s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const rxCol=c=>{ let s=''; c++; while(c>0){ const m=(c-1)%26; s=String.fromCharCode(65+m)+s; c=Math.floor((c-1)/26); } return s; };
const rxRef=(r,c)=>rxCol(c)+(r+1), rxAbs=(r,c)=>'$'+rxCol(c)+'$'+(r+1);
const rxQ=n=>"'"+String(n).replace(/'/g,"''")+"'";
const rxN=v=>typeof v==='number'&&isFinite(v);
const rxHex=c=>'FF'+String(c||'000000').replace('#','').toUpperCase();

function rxBook(meta){
  const B={meta:meta||{},sheets:[],fonts:['<font><sz val="10"/><color rgb="FF0F172A"/><name val="Segoe UI"/><family val="2"/></font>'],fills:['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>'],
    borders:['<border><left/><right/><top/><bottom/><diagonal/></border>'],numFmts:[],xfs:['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'],dxfs:[],cache:new Map(),fk:new Map(),flk:new Map(),bk:new Map(),nk:new Map(),charts:0,data:null,dataRow:0};
  const idx=(arr,map,xml)=>{ if(map.has(xml)) return map.get(xml); arr.push(xml); map.set(xml,arr.length-1); return arr.length-1; };
  B.font=f=>idx(B.fonts,B.fk,`<font>${f.b?'<b/>':''}${f.i?'<i/>':''}${f.sh?'<shadow/>':''}${f.u?'<u/>':''}<sz val="${f.sz||10}"/><color rgb="${rxHex(f.color||'0F172A')}"/><name val="${rxX(f.name||'Segoe UI')}"/><family val="2"/></font>`);
  B.fill=f=>{ if(!f) return 0; const x=f.g?`<fill><gradientFill degree="${f.deg||0}"><stop position="0"><color rgb="${rxHex(f.g[0])}"/></stop><stop position="1"><color rgb="${rxHex(f.g[1])}"/></stop></gradientFill></fill>`
      :`<fill><patternFill patternType="solid"><fgColor rgb="${rxHex(f.c)}"/><bgColor indexed="64"/></patternFill></fill>`; return idx(B.fills,B.flk,x); };
  B.border=b=>{ if(!b) return 0; const e=k=>b[k]?`<${k} style="${b[k][0]}"><color rgb="${rxHex(b[k][1])}"/></${k}>`:`<${k}/>`; return idx(B.borders,B.bk,`<border>${e('left')}${e('right')}${e('top')}${e('bottom')}<diagonal/></border>`); };
  B.numFmt=f=>{ if(!f) return 0; const builtin={'0':1,'0.00':2,'#,##0':3,'#,##0.00':4,'0%':9,'0.00%':10,'dd/mm/yyyy':14}; if(builtin[f]!=null&&f!=='dd/mm/yyyy') return builtin[f];
    if(B.nk.has(f)) return B.nk.get(f); const id=164+B.numFmts.length; B.numFmts.push(`<numFmt numFmtId="${id}" formatCode="${rxX(f)}"/>`); B.nk.set(f,id); return id; };
  /* style : {font:{sz,b,i,color,name}, fill:{c}|{g:[c1,c2],deg}, al:{h,v,wrap,indent,rot}, bd:{left:[style,color],…}, nf} */
  B.style=s=>{ if(!s) return 0; const k=JSON.stringify(s); if(B.cache.has(k)) return B.cache.get(k);
    const fo=B.font(s.font||{}), fi=B.fill(s.fill), bo=B.border(s.bd), nf=B.numFmt(s.nf), al=s.al||{};
    const alx=(al.h||al.v||al.wrap||al.indent||al.rot)?`<alignment${al.h?` horizontal="${al.h}"`:''}${al.v?` vertical="${al.v}"`:' vertical="center"'}${al.wrap?' wrapText="1"':''}${al.indent?` indent="${al.indent}"`:''}${al.rot?` textRotation="${al.rot}"`:''}/>`:'<alignment vertical="center"/>';
    B.xfs.push(`<xf numFmtId="${nf}" fontId="${fo}" fillId="${fi}" borderId="${bo}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${alx}</xf>`);
    const id=B.xfs.length-1; B.cache.set(k,id); return id; };
  B.dxf=d=>{ B.dxfs.push(`<dxf>${d.font?`<font>${d.font.b?'<b/>':''}<color rgb="${rxHex(d.font.color)}"/></font>`:''}${d.fill?`<fill><patternFill patternType="solid"><fgColor rgb="${rxHex(d.fill)}"/><bgColor rgb="${rxHex(d.fill)}"/></patternFill></fill>`:''}</dxf>`); return B.dxfs.length-1; };
  /* données agrégées des graphiques et sparklines : une seule feuille masquée, compacte */
  B.series=(vals,label)=>{ if(!B.data){ B.data=B.sheet('_data',{hidden:true}); }
    const r=B.dataRow++; B.data.set(r,0,label||''); vals.forEach((v,i)=>B.data.set(r,1+i,rxN(v)?v:(v==null?null:v)));
    return {ref:`${rxQ('_data')}!${rxAbs(r,1)}:${rxAbs(r,Math.max(1,vals.length))}`,lab:`${rxQ('_data')}!${rxAbs(r,0)}`,row:r,n:vals.length}; };
  B.sheet=(name,o)=>{ const S=rxSheet(B,name,o||{}); if(name==='_data') B.sheets.push(S); else { const i=B.sheets.findIndex(x=>x.name==='_data'); if(i>=0) B.sheets.splice(i,0,S); else B.sheets.push(S); } return S; };
  B.media={}; B.addMedia=(key,u8,ext)=>{ if(u8&&u8.length) B.media[key]={u8,ext:ext||'jpeg',n:Object.keys(B.media).length+1}; return B; };
  B.zip=async()=>rxZip(B);
  return B; }

function rxSheet(B,name,o){
  const S={B,name,o,cells:new Map(),rows:new Map(),cols:o.cols||[],merges:[],cf:[],links:[],sparks:[],charts:[],prio:1,brks:[]};
  S.brk=r=>{ if(r>0&&!S.brks.includes(r)) S.brks.push(r); return S; };
  S.set=(r,c,v,st)=>{ const k=r*16384+c; const prev=S.cells.get(k)||{}; S.cells.set(k,{r,c,v:v===undefined?prev.v:v,s:st!==undefined?(typeof st==='number'?st:B.style(st)):prev.s}); return S; };
  S.blk=(r1,c1,r2,c2,st)=>{ const s=B.style(st); for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++){ const k=r*16384+c, p=S.cells.get(k); S.cells.set(k,{r,c,v:p?p.v:null,s}); } return S; };
  S.box=(r1,c1,r2,c2,v,st)=>{ S.blk(r1,c1,r2,c2,st); S.set(r1,c1,v,st); if(r2>r1||c2>c1) S.merges.push(rxRef(r1,c1)+':'+rxRef(r2,c2)); return S; };
  S.h=(r,pt)=>{ S.rows.set(r,pt); return S; };
  S.link=(r,c,sheet,disp)=>{ S.links.push(`<hyperlink ref="${rxRef(r,c)}" location="${rxX(rxQ(sheet)+'!A1')}" display="${rxX(disp||sheet)}"/>`); return S; };
  S.addCf=(ref,rule)=>{ S.cf.push(`<conditionalFormatting sqref="${ref}">${rule.replace('PRIO',S.prio++)}</conditionalFormatting>`); return S; };
  S.dataBar=(ref,color,max)=>S.addCf(ref,`<cfRule type="dataBar" priority="PRIO"><dataBar><cfvo type="num" val="0"/>${max!=null?`<cfvo type="num" val="${max}"/>`:'<cfvo type="max"/>'}<color rgb="${rxHex(color)}"/></dataBar></cfRule>`);
  S.scale=(ref,cols)=>S.addCf(ref,`<cfRule type="colorScale" priority="PRIO"><colorScale><cfvo type="min"/>${cols.length===3?'<cfvo type="percentile" val="50"/>':''}<cfvo type="max"/>${cols.map(c=>`<color rgb="${rxHex(c)}"/>`).join('')}</colorScale></cfRule>`);
  S.arrows=(ref)=>S.addCf(ref,`<cfRule type="iconSet" priority="PRIO"><iconSet iconSet="3Arrows" reverse="1"><cfvo type="percent" val="0"/><cfvo type="num" val="-0.0001"/><cfvo type="num" val="0.0001"/></iconSet></cfRule>`);
  S.expr=(ref,formula,dxf)=>S.addCf(ref,`<cfRule type="expression" dxfId="${dxf}" priority="PRIO"><formula>${rxX(formula)}</formula></cfRule>`);
  S.spark=(r,c,ser,o2)=>{ S.sparks.push({loc:rxRef(r,c),f:ser.ref.replace(/\$/g,''),o:o2||{}}); return S; };
  S.chart=(spec,r1,c1,r2,c2)=>{ S.charts.push({spec,r1,c1,r2,c2,id:++B.charts}); return S; };
  S.imgs=[]; S.image=(key,r1,c1,r2,c2,o)=>{ if(B.media[key]) S.imgs.push({key,r1,c1,r2,c2,o:o||{}}); return S; };
  return S; }

function rxSheetXml(S,si){
  const o=S.o, B=S.B; let maxR=0,maxC=0; S.cells.forEach(x=>{ if(x.r>maxR) maxR=x.r; if(x.c>maxC) maxC=x.c; });
  const byR=new Map(); S.cells.forEach(x=>{ (byR.get(x.r)||byR.set(x.r,[]).get(x.r)).push(x); }); S.rows.forEach((_,r)=>{ if(!byR.has(r)) byR.set(r,[]); });
  const rows=[...byR.keys()].sort((a,b)=>a-b).map(r=>{ const cs=byR.get(r).sort((a,b)=>a.c-b.c).map(x=>{ const a=rxRef(x.r,x.c), s=x.s?` s="${x.s}"`:''; const v=x.v;
      if(v==null||v==='') return `<c r="${a}"${s}/>`;
      if(typeof v==='object'&&v.rich) return `<c r="${a}"${s} t="inlineStr"><is>${v.rich.map(([t,f])=>{ f=f||{}; return `<r><rPr><rFont val="${rxX(f.name||'Segoe UI')}"/>${f.b?'<b/>':''}${f.i?'<i/>':''}<color rgb="${rxHex(f.color||'0F172A')}"/><sz val="${f.sz||10}"/></rPr><t xml:space="preserve">${rxX(t)}</t></r>`; }).join('')}</is></c>`;
      if(typeof v==='object'&&v.f!=null) return `<c r="${a}"${s}${typeof v.v==='string'?' t="str"':''}><f>${rxX(v.f)}</f>${v.v!=null?`<v>${rxX(v.v)}</v>`:''}</c>`;
      if(v instanceof Date) return isNaN(v)?`<c r="${a}"${s}/>`:`<c r="${a}"${s}><v>${(+v-Date.UTC(1899,11,30)-v.getTimezoneOffset()*60000)/86400000}</v></c>`;
      if(typeof v==='number') return rxN(v)?`<c r="${a}"${s}><v>${v}</v></c>`:`<c r="${a}"${s}/>`;
      if(typeof v==='boolean') return `<c r="${a}"${s} t="b"><v>${v?1:0}</v></c>`;
      return `<c r="${a}"${s} t="inlineStr"><is><t xml:space="preserve">${rxX(v)}</t></is></c>`; }).join('');
    const ht=S.rows.get(r); return `<row r="${r+1}"${ht?` ht="${ht}" customHeight="1"`:''}>${cs}</row>`; }).join('');
  const cols=S.cols.length?`<cols>${S.cols.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols>`:'';
  const fz=o.freeze?`<pane${o.freeze.c?` xSplit="${o.freeze.c}"`:''}${o.freeze.r?` ySplit="${o.freeze.r}"`:''} topLeftCell="${rxRef(o.freeze.r||0,o.freeze.c||0)}" activePane="${o.freeze.r&&o.freeze.c?'bottomRight':o.freeze.r?'bottomLeft':'topRight'}" state="frozen"/>`:'';
  const ext=S.sparks.length?`<extLst><ext uri="{05C60535-1F16-4fd2-B633-F4F36F0B64E0}" xmlns:x14="${RX_X14}"><x14:sparklineGroups xmlns:xm="${RX_XM}">${S.sparks.map(sp=>{ const c=sp.o.color||'003DA5';
      return `<x14:sparklineGroup${sp.o.type==='column'?' type="column"':''} displayEmptyCellsAs="gap"${sp.o.type==='column'?'':' markers="0"'} high="1" last="1" lineWeight="1.5"><x14:colorSeries rgb="${rxHex(c)}"/><x14:colorNegative rgb="${rxHex('DC2626')}"/><x14:colorAxis rgb="${rxHex('64748B')}"/><x14:colorMarkers rgb="${rxHex(c)}"/><x14:colorFirst rgb="${rxHex(c)}"/><x14:colorLast rgb="${rxHex(sp.o.last||'C8A951')}"/><x14:colorHigh rgb="${rxHex(sp.o.high||'06B6D4')}"/><x14:colorLow rgb="${rxHex(c)}"/><x14:sparklines><x14:sparkline><xm:f>${rxX(sp.f)}</xm:f><xm:sqref>${sp.loc}</xm:sqref></x14:sparkline></x14:sparklines></x14:sparklineGroup>`; }).join('')}</x14:sparklineGroups></ext></extLst>`:'';
  const pg=o.hidden?'':`<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.5" header="0.2" footer="0.25"/><pageSetup paperSize="${o.a3?8:9}" orientation="${o.portrait?'portrait':'landscape'}" fitToWidth="1" fitToHeight="${o.fitH||0}"/><headerFooter><oddHeader>${rxX('&L&8&K003DA5ECOBANK SÉNÉGAL · CREDIT RISK INTELLIGENCE&R&8&K64748B'+(B.meta.date||''))}</oddHeader><oddFooter>${rxX('&L&8&K64748B'+S.name+' · INTERNAL USE ONLY&R&8&K64748BPage &P / &N')}</oddFooter></headerFooter>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${RX_NS}" xmlns:r="${RX_R}"><sheetPr>${o.tab?`<tabColor rgb="${rxHex(o.tab)}"/>`:''}<pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:${rxRef(Math.max(0,maxR),Math.max(0,maxC))}"/>`
    +`<sheetViews><sheetView${o.grid?'':' showGridLines="0"'}${si===0?' tabSelected="1"':''} zoomScale="${o.zoom||90}" zoomScaleNormal="${o.zoom||90}" workbookViewId="0">${fz}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15" x14ac:dyDescent="0.25" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"/>`.replace(' x14ac:dyDescent="0.25" xmlns:x14ac="http://schemas.microsoft.com/office/spreadsheetml/2009/9/ac"','')
    +cols+`<sheetData>${rows}</sheetData>`+(o.filter?`<autoFilter ref="${o.filter}"/>`:'')+(S.merges.length?`<mergeCells count="${S.merges.length}">${S.merges.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>`:'')
    +S.cf.join('')+(S.links.length?`<hyperlinks>${S.links.join('')}</hyperlinks>`:'')+pg+(S.brks.length&&!o.hidden?`<rowBreaks count="${S.brks.length}" manualBreakCount="${S.brks.length}">${S.brks.sort((a,b)=>a-b).map(r=>`<brk id="${r}" max="16383" man="1"/>`).join('')}</rowBreaks>`:'')+(S.charts.length||S.imgs.length?'<drawing r:id="rId1"/>':'')+ext+'</worksheet>'; }

/* ---------------- graphiques ---------------- */
const rxTx=(sz,col,b)=>`<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b?1:0}"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr>`;
const rxRich=(t,sz,col,b)=>`<c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${b?1:0}"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="${sz}" b="${b?1:0}"><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:latin typeface="Segoe UI"/></a:rPr><a:t>${rxX(t)}</a:t></a:r></a:p></c:rich></c:tx>`;
const RX_FX3D='<a:effectLst><a:outerShdw blurRad="50800" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="001B4D"><a:alpha val="38000"/></a:srgbClr></a:outerShdw></a:effectLst><a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="38100" h="25400"/></a:sp3d>', RX_SHD='<a:effectLst><a:outerShdw blurRad="38100" dist="25400" dir="5400000" algn="t" rotWithShape="0"><a:srgbClr val="001B4D"><a:alpha val="35000"/></a:srgbClr></a:outerShdw></a:effectLst>';
const rxSp=(fill,line,w)=>`<c:spPr>${fill==='none'?'<a:noFill/>':fill&&fill.g?`<a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${fill.g[0]}"><a:alpha val="${fill.a0||100000}"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="${fill.g[1]}"><a:alpha val="${fill.a1||100000}"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="${fill.ang||5400000}" scaled="0"/></a:gradFill>`:fill?`<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>`:''}${line==='none'?'<a:ln><a:noFill/></a:ln>':line?`<a:ln w="${w||19050}" cap="rnd"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill><a:round/></a:ln>`:''}${fill&&fill!=='none'?RX_FX3D:(line&&line!=='none'?RX_SHD:'')}</c:spPr>`;
function rxStrCache(a){ return `<c:strCache><c:ptCount val="${a.length}"/>${a.map((v,i)=>`<c:pt idx="${i}"><c:v>${rxX(v)}</c:v></c:pt>`).join('')}</c:strCache>`; }
function rxNumCache(a,f){ return `<c:numCache><c:formatCode>${rxX(f||'General')}</c:formatCode><c:ptCount val="${a.length}"/>${a.map((v,i)=>rxN(v)?`<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`:'').join('')}</c:numCache>`; }
const rxAx=(id,cross,pos,o)=>{ o=o||{}; const val=o.val; const tag=val?'c:valAx':'c:catAx';
  return `<${tag}><c:axId val="${id}"/><c:scaling><c:orientation val="${o.rev?'maxMin':'minMax'}"/>${o.max!=null?`<c:max val="${o.max}"/>`:''}${o.min!=null?`<c:min val="${o.min}"/>`:''}</c:scaling><c:delete val="${o.del?1:0}"/><c:axPos val="${pos}"/>`
   +(val&&o.grid?`<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill><a:prstDash val="dash"/></a:ln></c:spPr></c:majorGridlines>`:'')
   +`<c:numFmt formatCode="${rxX(o.nf||'General')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="${o.lblPos||'nextTo'}"/><c:spPr><a:noFill/><a:ln w="6350">${o.line?`<a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill>`:'<a:noFill/>'}</a:ln></c:spPr>${rxTx(800,'64748B')}<c:crossAx val="${cross}"/>`
   +(o.crossMax?'<c:crosses val="max"/>':'<c:crosses val="autoZero"/>')+(val?`<c:crossBetween val="${o.mid?'midCat':'between'}"/>`:'<c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/>')+`</${tag}>`; };
const rxLbls=(o)=>`<c:dLbls>${o.custom||''}<c:numFmt formatCode="${rxX(o.nf||'General')}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${rxTx(o.sz||800,o.col||'0F172A',o.b)}${o.pos?`<c:dLblPos val="${o.pos}"/>`:''}<c:showLegendKey val="0"/><c:showVal val="${o.val?1:0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${o.pct?1:0}"/><c:showBubbleSize val="0"/>${o.leader!=null?`<c:showLeaderLines val="${o.leader?1:0}"/>`:''}</c:dLbls>`;
function rxSer(B,i,s,cats,catRef){ const d=B.series(s.v,s.name); const nf=s.nf||'#,##0';
  const pts=(s.pts||[]).map((c,k)=>c?`<c:dPt><c:idx val="${k}"/>${s.kind==='bar'?'<c:invertIfNegative val="0"/>':''}<c:bubble3D val="0"/>${rxSp(c==='none'?'none':s.gradPts?{g:[rxTint(c,.25),c],ang:s.horiz?0:5400000}:c,s.kind==='pie'?'FFFFFF':'none',s.kind==='pie'?25400:0)}</c:dPt>`:'').join('');
  const lbl=s.labels?rxLbls(s.labels):(s.kind==='line'||s.kind==='area'||s.kind==='bar')?'':'';
  return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${rxX(d.lab)}</c:f>${rxStrCache([s.name])}</c:strRef></c:tx>${s.sp||''}${s.kind==='bar'?'<c:invertIfNegative val="0"/>':''}${s.kind==='line'?`<c:marker><c:symbol val="${s.marker?'circle':'none'}"/>${s.marker?`<c:size val="5"/>${rxSp('FFFFFF',s.color,15875)}`:''}</c:marker>`:''}${pts}${lbl}`
    +`<c:cat><c:strRef><c:f>${rxX(catRef)}</c:f>${rxStrCache(cats)}</c:strRef></c:cat><c:val><c:numRef><c:f>${rxX(d.ref)}</c:f>${rxNumCache(s.v,nf)}</c:numRef></c:val>${s.kind==='line'?`<c:smooth val="${s.smooth?1:0}"/>`:''}</c:ser>`; }
function rxTint(hex,f){ const n=parseInt(hex,16), r=n>>16, g=n>>8&255, b=n&255, t=x=>Math.round(x+(255-x)*f).toString(16).padStart(2,'0'); return (t(r)+t(g)+t(b)).toUpperCase(); }
function rxChartXml(B,sp){ const cats=sp.cats||[], cr=B.series(cats,'cat:'+(sp.title||'')).ref; let plot='', v3d='', legend=sp.legend!==false;
  if(sp.type==='combo'){ // aire (axe principal) + courbes (axe secondaire)
    const a=sp.area, L=sp.lines;
    plot=`<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${rxSer(B,0,Object.assign({kind:'area',sp:rxSp({g:[a.color,a.color],a0:55000,a1:8000},a.color,22225)},a),cats,cr)}<c:axId val="101"/><c:axId val="102"/></c:areaChart>`
      +`<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${L.map((s,i)=>rxSer(B,i+1,Object.assign({kind:'line',marker:true,sp:rxSp(null,s.color,s.w||28575)},s),cats,cr)).join('')}<c:marker val="1"/><c:axId val="103"/><c:axId val="104"/></c:lineChart>`
      +rxAx(101,102,'b',{line:true})+rxAx(102,101,'l',{val:true,grid:true,nf:sp.nf1||'#,##0'})+rxAx(103,104,'b',{del:true})+rxAx(104,103,'r',{val:true,crossMax:true,nf:sp.nf2||'#,##0'}); }
  else if(sp.type==='bar'||sp.type==='col'||sp.type==='waterfall'||sp.type==='stack'){ const H=sp.type==='bar';
    const grp=sp.type==='waterfall'||sp.type==='stack'?'stacked':'clustered';
    v3d='<c:view3D><c:rotX val="12"/><c:rotY val="16"/><c:rAngAx val="1"/></c:view3D>'; plot=`<c:bar3DChart><c:barDir val="${H?'bar':'col'}"/><c:grouping val="${grp}"/><c:varyColors val="0"/>${sp.series.map((s,i)=>rxSer(B,i,Object.assign({kind:'bar',horiz:H,sp:s.base?rxSp('none','none'):rxSp(s.color?{g:[rxTint(s.color,.3),s.color],ang:H?0:5400000}:null,'none')},s),cats,cr)).join('')}<c:gapWidth val="${sp.gap||55}"/><c:gapDepth val="90"/><c:shape val="box"/><c:axId val="201"/><c:axId val="202"/></c:bar3DChart>`.replace(/<c:dLblPos val="(outEnd|inEnd|inBase)"\/>/g,'')
      +rxAx(201,202,H?'l':'b',{rev:H,line:true})+rxAx(202,201,H?'b':'l',{val:true,grid:!H,del:!!sp.hideVal,nf:sp.nf||'#,##0',max:sp.max,min:sp.min}); legend=sp.legend===true; }
  else if(sp.type==='pareto'){ const s0=sp.series[0], s1=sp.series[1];
    plot=`<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${rxSer(B,0,Object.assign({kind:'bar',sp:rxSp({g:[rxTint(s0.color,.3),s0.color]},'none')},s0),cats,cr)}<c:gapWidth val="40"/><c:axId val="301"/><c:axId val="302"/></c:barChart>`
      +`<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${rxSer(B,1,Object.assign({kind:'line',marker:true,sp:rxSp(null,s1.color,28575)},s1),cats,cr)}<c:marker val="1"/><c:axId val="303"/><c:axId val="304"/></c:lineChart>`
      +rxAx(301,302,'b',{line:true})+rxAx(302,301,'l',{val:true,grid:true,nf:sp.nf||'#,##0'})+rxAx(303,304,'b',{del:true})+rxAx(304,303,'r',{val:true,crossMax:true,nf:'0%',max:1,min:0}); }
  else if(sp.type==='doughnut'){ const s=sp.series[0];
    plot=`<c:doughnutChart><c:varyColors val="1"/>${rxSer(B,0,Object.assign({kind:'pie'},s),cats,cr)}<c:firstSliceAng val="0"/><c:holeSize val="${sp.hole||62}"/></c:doughnutChart>`; }
  else if(sp.type==='bubble'){ const s=sp.series[0], dx=B.series(s.x,'x'), dy=B.series(s.y,'y'), dz=B.series(s.z,'z');
    const pts=(s.pts||[]).map((c,k)=>`<c:dPt><c:idx val="${k}"/><c:invertIfNegative val="0"/><c:bubble3D val="1"/>${rxSp({g:[rxTint(c,.45),c],a0:85000,a1:85000},'FFFFFF',9525)}</c:dPt>`).join('');
    const custom=(s.tags||[]).map((t,k)=>t?`<c:dLbl><c:idx val="${k}"/>${rxRich(t,700,'0F172A',0)}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:dLblPos val="ctr"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbl>`:`<c:dLbl><c:idx val="${k}"/><c:delete val="1"/></c:dLbl>`).join('');
    plot=`<c:bubbleChart><c:varyColors val="0"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${rxX(s.name)}</c:v></c:tx>${rxSp({g:['60A5FA','003DA5']},'FFFFFF',9525)}<c:invertIfNegative val="0"/>${pts}<c:dLbls>${custom}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${rxTx(700,'0F172A')}<c:dLblPos val="ctr"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
      +`<c:xVal><c:numRef><c:f>${rxX(dx.ref)}</c:f>${rxNumCache(s.x)}</c:numRef></c:xVal><c:yVal><c:numRef><c:f>${rxX(dy.ref)}</c:f>${rxNumCache(s.y)}</c:numRef></c:yVal><c:bubbleSize><c:numRef><c:f>${rxX(dz.ref)}</c:f>${rxNumCache(s.z)}</c:numRef></c:bubbleSize><c:bubble3D val="1"/></c:ser><c:bubbleScale val="${sp.scale||70}"/><c:showNegBubbles val="0"/><c:axId val="401"/><c:axId val="402"/></c:bubbleChart>`
      +rxAx(401,402,'b',{val:true,line:true,nf:sp.nfx||'#,##0',min:sp.minx,max:sp.maxx})+rxAx(402,401,'l',{val:true,grid:true,nf:sp.nfy||'#,##0',min:sp.miny,max:sp.maxy}); legend=false; }
  const title=sp.title?`<c:title>${rxRich(sp.title,1050,'001B4D',1)}<c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>`:'<c:autoTitleDeleted val="1"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${RX_C}" xmlns:a="${RX_A}" xmlns:r="${RX_R}"><c:roundedCorners val="0"/><c:chart>${title}${v3d}<c:plotArea><c:layout/>${plot}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>`
    +(legend?`<c:legend><c:legendPos val="${sp.legendPos||'b'}"/><c:overlay val="0"/>${rxTx(800,'334155')}</c:legend>`:'')+`<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    +`<c:spPr><a:solidFill><a:srgbClr val="${sp.bg||'FFFFFF'}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Segoe UI"/></a:defRPr></a:pPr><a:endParaRPr lang="fr-FR"/></a:p></c:txPr></c:chartSpace>`; }

/* ---------------- assemblage du paquet ---------------- */
async function rxZip(B){ const z=new JSZip(), ct=[], wbRels=[], sheetsXml=[], dn=[];
  B.sheets.forEach((S,i)=>{ const n=i+1; let drawing=null;
    if(S.charts.length||S.imgs.length){ const rels=[]; const anchors=S.charts.map((ch,k)=>{ z.file(`xl/charts/chart${ch.id}.xml`,rxChartXml(B,ch.spec)); ct.push(`<Override PartName="/xl/charts/chart${ch.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        rels.push(`<Relationship Id="rIdC${k+1}" Type="${RX_R}/chart" Target="../charts/chart${ch.id}.xml"/>`);
        return `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${ch.c1}</xdr:col><xdr:colOff>${ch.spec.dx||38100}</xdr:colOff><xdr:row>${ch.r1}</xdr:row><xdr:rowOff>${ch.spec.dy||38100}</xdr:rowOff></xdr:from><xdr:to><xdr:col>${ch.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${ch.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k+2}" name="${rxX(ch.spec.title||'Graphique '+(k+1))}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${RX_C}"><c:chart xmlns:c="${RX_C}" r:id="rIdC${k+1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`; });
      S.imgs.forEach((im,k)=>{ const md=B.media[im.key], id=S.charts.length+k+2, c=im.o.crop||{}; rels.push(`<Relationship Id="rIdI${k+1}" Type="${RX_R}/image" Target="../media/image${md.n}.${md.ext}"/>`);
        anchors.push(`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${im.c1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.r1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${im.c2}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.r2}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id}" name="${rxX(im.o.name||'Visuel 3D')}" descr="${rxX(im.o.alt||'Visuel 3D ECOBANK')}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${k+1}"/><a:srcRect${c.l?` l="${c.l}"`:''}${c.t?` t="${c.t}"`:''}${c.r?` r="${c.r}"`:''}${c.b?` b="${c.b}"`:''}/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${im.o.frame?`<a:ln w="12700"><a:solidFill><a:srgbClr val="${im.o.frame}"/></a:solidFill></a:ln>`:''}</xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`); });
      z.file(`xl/drawings/drawing${n}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${RX_XDR}" xmlns:a="${RX_A}" xmlns:r="${RX_R}">${anchors.join('')}</xdr:wsDr>`);
      z.file(`xl/drawings/_rels/drawing${n}.xml.rels`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
      ct.push(`<Override PartName="/xl/drawings/drawing${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      z.file(`xl/worksheets/_rels/sheet${n}.xml.rels`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RX_R}/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`); }
  });
  // les graphiques ajoutent des séries dans _data : on sérialise les feuilles après
  B.sheets.forEach((S,i)=>{ const n=i+1; z.file(`xl/worksheets/sheet${n}.xml`,rxSheetXml(S,i)); ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    wbRels.push(`<Relationship Id="rId${n}" Type="${RX_R}/worksheet" Target="worksheets/sheet${n}.xml"/>`);
    sheetsXml.push(`<sheet name="${rxX(S.name)}" sheetId="${n}"${S.o.hidden?' state="hidden"':''} r:id="rId${n}"/>`);
    if(S.o.printTitles) dn.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">${rxX(rxQ(S.name)+'!'+S.o.printTitles)}</definedName>`);
    if(S.o.filter) dn.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${rxX(rxQ(S.name)+'!'+S.o.filter.replace(/([A-Z]+)(\d+)/g,'$$$1$$$2'))}</definedName>`);
    if(S.o.printArea) dn.push(`<definedName name="_xlnm.Print_Area" localSheetId="${i}">${rxX(rxQ(S.name)+'!'+S.o.printArea)}</definedName>`); });
  Object.values(B.media).forEach(md=>z.file(`xl/media/image${md.n}.${md.ext}`,md.u8));
  const nS=B.sheets.length;
  wbRels.push(`<Relationship Id="rId${nS+1}" Type="${RX_R}/styles" Target="styles.xml"/>`);
  z.file('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${RX_NS}" xmlns:r="${RX_R}"><workbookPr/><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="15600" tabRatio="850" activeTab="0"/></bookViews><sheets>${sheetsXml.join('')}</sheets>${dn.length?`<definedNames>${dn.join('')}</definedNames>`:''}<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  z.file('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wbRels.join('')}</Relationships>`);
  z.file('xl/styles.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${RX_NS}">${B.numFmts.length?`<numFmts count="${B.numFmts.length}">${B.numFmts.join('')}</numFmts>`:''}<fonts count="${B.fonts.length}">${B.fonts.join('')}</fonts><fills count="${B.fills.length}">${B.fills.join('')}</fills><borders count="${B.borders.length}">${B.borders.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${B.xfs.length}">${B.xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles><dxfs count="${B.dxfs.length}">${B.dxfs.join('')}</dxfs><tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/></styleSheet>`);
  const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
  z.file('docProps/core.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${rxX(B.meta.title||'Credit Risk Intelligence')}</dc:title><dc:subject>${rxX(B.meta.subject||'')}</dc:subject><dc:creator>Ecobank Sénégal · Credit Risk</dc:creator><cp:keywords>APEX-RI</cp:keywords><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  z.file('docProps/app.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application><Company>Ecobank Sénégal</Company></Properties>`);
  z.file('_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RX_R}/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${RX_R}/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${ct.join('')}</Types>`);
  return z.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}}); }

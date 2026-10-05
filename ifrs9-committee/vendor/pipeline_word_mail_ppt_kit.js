/* =====================================================================
   ECOBANK GOD 3D EXPORT KIT — compléments génériques
   (réutilisables dans toute app HTML offline BLUE ECOBANK)
   ===================================================================== */
const G3S = 2;
const LOGO_SRC = 'data:image/png;base64,' + LOGO_B64;
function LOGO_U8(){ return g3Bytes(LOGO_SRC); }
function dl(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },1500); }
const MIME={xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',eml:'message/rfc822',html:'text/html;charset=utf-8'};

/* ---------- chevrons 3D d'un flux (pipeline, workflow, étapes) ----------
   o = {title, sub, steps:[{lib, n, v, col}], w, h}                       */
function g3Pipeline(o){
  const st=o.steps, n=st.length, g=g3Canvas(o.w||1000,o.h||430); if(!g||!n) return null; const x=g.x;
  g3Title(g,o.title,o.sub);
  const left=26, right=g.w-26, W=right-left, cw=W/n, chevY=g.h-118, chevH=58, tip=22, top=86, barMax=chevY-top-60;
  const mx=Math.max(...st.map(s=>s.v),1), d=12;
  // barres 3D de volume au-dessus de chaque étape
  st.forEach((s,i)=>{ const cx=left+cw*i+cw/2-tip/4, bw=Math.min(62,cw*0.42), h=Math.max(s.v>0?4:0,s.v/mx*barMax), x0=cx-bw/2, y0=chevY-18-h, col=s.col;
    if(h>0){
      const sg=x.createRadialGradient(cx+d/2,chevY-18,2,cx+d/2,chevY-18,bw); sg.addColorStop(0,'rgba(0,52,75,.28)'); sg.addColorStop(1,'rgba(0,52,75,0)'); x.fillStyle=sg; x.beginPath(); x.ellipse(cx+d*0.6,chevY-20,bw*0.85,d*0.5,0,0,7); x.fill();
      const gr=x.createLinearGradient(x0,0,x0+bw,0); gr.addColorStop(0,g3Shade(col,0.2)); gr.addColorStop(1,g3Shade(col,-0.14));
      x.save(); x.shadowColor='rgba(0,40,80,.3)'; x.shadowBlur=10; x.shadowOffsetX=6; x.shadowOffsetY=4; x.fillStyle=gr; x.fillRect(x0,y0,bw,h); x.restore();
      const sp=x.createLinearGradient(x0,0,x0+bw*0.5,0); sp.addColorStop(0,'rgba(255,255,255,0)'); sp.addColorStop(0.55,'rgba(255,255,255,.36)'); sp.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=sp; x.fillRect(x0+bw*0.08,y0+2,bw*0.4,Math.max(0,h-4));
      x.fillStyle=g3Shade(col,-0.34); x.beginPath(); x.moveTo(x0+bw,y0); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw+d,y0+h-d*0.6); x.lineTo(x0+bw,y0+h); x.fill();
      x.fillStyle=g3Shade(col,0.36); x.beginPath(); x.moveTo(x0,y0); x.lineTo(x0+d,y0-d*0.6); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw,y0); x.fill(); }
    x.fillStyle=G3.ink; x.font='700 12px Consolas,monospace'; x.textAlign='center'; x.fillText(g3Md(s.v),cx+d/2,y0-d-6); });
  // chevrons en relief
  st.forEach((s,i)=>{ const x0=left+cw*i, x1=x0+cw-4, y=chevY, col=s.col;
    const path=(dx,dy)=>{ x.beginPath(); x.moveTo(x0+dx,y+dy); x.lineTo(x1-tip+dx,y+dy); x.lineTo(x1+dx,y+chevH/2+dy); x.lineTo(x1-tip+dx,y+chevH+dy); x.lineTo(x0+dx,y+chevH+dy); if(i>0) x.lineTo(x0+tip+dx,y+chevH/2+dy); x.closePath(); };
    x.fillStyle=g3Shade(col,-0.45); path(4,6); x.fill();
    const gr=x.createLinearGradient(0,y,0,y+chevH); gr.addColorStop(0,g3Shade(col,0.28)); gr.addColorStop(0.5,col); gr.addColorStop(1,g3Shade(col,-0.2)); x.fillStyle=gr; path(0,0); x.fill();
    x.save(); path(0,0); x.clip(); const hl=x.createLinearGradient(0,y,0,y+chevH*0.5); hl.addColorStop(0,'rgba(255,255,255,.35)'); hl.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=hl; x.fillRect(x0,y,cw,chevH*0.5); x.restore();
    const tx=x0+(i>0?tip:0)+(cw-(i>0?tip:0)-tip)/2;
    x.fillStyle='#fff'; x.font='700 13px "Segoe UI",Arial'; x.textAlign='center'; x.fillText(String(s.lib).slice(0,16),tx,y+25);
    x.font='600 11px "Segoe UI",Arial'; x.fillStyle='rgba(255,255,255,.88)'; x.fillText(s.n+' dossier'+(s.n>1?'s':''),tx,y+43);
    x.fillStyle=G3.mut; x.font='11px "Segoe UI",Arial'; x.fillText(o.foot?o.foot(s):'',tx,y+chevH+24); });
  return g3Out(g); }

function dxRich(html,o){ const parts=String(html).replace(/<(?!\/?b>)[^>]+>/g,'').split(/(<b>.*?<\/b>)/g).filter(Boolean);
  return dxP(parts.map(p=>/^<b>/.test(p)?dxRun(p.replace(/<\/?b>/g,''),{b:true,color:'00415E'}):dxRun(p)),o); }
/* ---------- tableau Word simple, en-tête marine, zébrures, colonnes numériques à droite ---------- */
function dxTableS(head,rows,widths,right,pills){
  right=right||[]; const tw=widths.reduce((a,b)=>a+b,0);
  const bd='<w:tblBorders><w:top w:val="single" w:sz="4" w:color="CFE0E7"/><w:bottom w:val="single" w:sz="8" w:color="8CC63F"/><w:insideH w:val="single" w:sz="4" w:color="E7F0F4"/></w:tblBorders>';
  let x=`<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/>${bd}<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  x+='<w:tr><w:trPr><w:tblHeader/></w:trPr>'+head.map((h,i)=>dxCell(dxP(dxRun(h,{b:true,color:'FFFFFF',sz:16}),{after:0,align:right.includes(i)?'right':'left'}),{w:widths[i],fill:'00415E'})).join('')+'</w:tr>';
  rows.forEach((r,ri)=>{ const total=r.__total; x+='<w:tr>'+r.map((c,i)=>{ const pill=pills&&pills(ri,i,c);
    if(pill) return dxCell(dxP(dxRun(String(c),{sz:15,b:true,color:'FFFFFF'}),{after:0,align:'center'}),{w:widths[i],fill:pill});
    return dxCell(dxP(dxRun(String(c==null?'':c),{sz:16,b:total,font:right.includes(i)?'Consolas':null,color:total?'00415E':null}),{after:0,align:right.includes(i)?'right':'left'}),{w:widths[i],fill:total?'E6F2D0':(ri%2?'F4F9FB':'FFFFFF')}); }).join('')+'</w:tr>'; });
  return x+'</w:tbl>'+dxP('',{after:120}); }

/* ---------- assemblage d'un .docx (A4, pied de page Ecobank) ---------- */
async function docxBuild(body,media,footerText){
  const NS='xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const doc=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}<w:sectPr><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="12333F"/><w:lang w:val="fr-FR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Titre1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="8CC63F"/></w:pBdr><w:spacing w:before="320" w:after="140"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="00415E"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Titre2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="005C83"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`;
  const footer=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="8CC63F"/></w:pBdr><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="3E5C6B"/></w:rPr><w:t xml:space="preserve">${xEsc(footerText)} · page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:sz w:val="15"/><w:color w:val="3E5C6B"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdSty" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdFtr" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media.map((_,i)=>`<Relationship Id="rIdImg${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image${i+1}.png"/>`).join('')}</Relationships>`;
  const z=new JSZip();
  z.file('[Content_Types].xml','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>');
  z.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  z.file('word/document.xml',doc); z.file('word/styles.xml',styles); z.file('word/footer1.xml',footer); z.file('word/_rels/document.xml.rels',rels);
  media.forEach((u8,i)=>z.file('word/media/image'+(i+1)+'.png',u8));
  return z.generateAsync({type:'uint8array'}); }

/* ---------- e-mail couleur (660 px, tables, compatible Outlook) ---------- */
const MC={ navy:'#00415e', blue:'#005c83', lime:'#8cc63f', lime2:'#6ba23a', ink:'#12333f', mut:'#3e5c6b', bg:'#eef4f7', card:'#ffffff', line:'#cfe0e7', rose:'#c0392b', amber:'#b67d1c', emerald:'#4e8a2e' };
function mEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const MTD='font-family:Segoe UI,Arial,sans-serif;';
function mailShell(o){ // {title, sub, right, body, foot, logo}
  return `<div style="margin:0;padding:0;background:${MC.bg};${MTD}color:${MC.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MC.bg};padding:14px 0"><tr><td align="center">
  <table role="presentation" width="680" cellpadding="0" cellspacing="0" style="width:680px;max-width:680px;background:${MC.card};border:1px solid ${MC.line};border-radius:10px;overflow:hidden">
    <tr><td style="background:${MC.navy};padding:16px 22px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${o.logo}" alt="Ecobank" height="40" style="height:40px;display:block;border-radius:4px"></td>
        <td align="right" style="vertical-align:middle;color:#cfe0ee;font-size:11px;${MTD}">${o.right||''}</td>
      </tr></table>
      <div style="height:3px;background:${MC.lime};margin-top:12px;border-radius:2px;line-height:3px;font-size:1px">&nbsp;</div>
      <div style="color:#fff;font-size:18px;font-weight:700;margin-top:12px;line-height:1.3;${MTD}">${mEsc(o.title)}</div>
      ${o.sub?`<div style="color:#bcd3e6;font-size:12px;margin-top:3px;${MTD}">${mEsc(o.sub)}</div>`:''}
    </td></tr>
    <tr><td style="padding:18px 22px">${o.body}</td></tr>
    <tr><td style="background:${MC.bg};border-top:1px solid ${MC.line};padding:12px 22px;color:${MC.mut};font-size:10.5px;${MTD}">${o.foot||''}</td></tr>
  </table></td></tr></table></div>`; }
function mH(t,col){ return `<div style="${MTD}font-size:13px;font-weight:700;color:${col||MC.navy};border-bottom:2px solid ${MC.lime};padding-bottom:4px;margin:20px 0 10px">${mEsc(t)}</div>`; }
function mP(html){ return `<div style="${MTD}font-size:13px;line-height:1.6;color:${MC.ink};margin:0 0 10px">${html}</div>`; }
function mKpis(arr){ return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${arr.map(k=>`<td width="${Math.floor(100/arr.length)}%" style="padding:4px;vertical-align:top"><table width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f7;border-radius:8px;border-left:4px solid ${k.c||MC.blue}"><tr><td style="padding:10px 11px;${MTD}">
  <div style="font-size:9.5px;color:#3e5c6b;text-transform:uppercase;letter-spacing:.05em;font-weight:700">${mEsc(k.l)}</div><div style="font-size:17px;font-weight:800;color:${k.c||MC.navy};font-family:Consolas,monospace;margin-top:3px;white-space:nowrap">${mEsc(k.v)}</div><div style="font-size:10.5px;color:#3e5c6b">${mEsc(k.s||'')}</div></td></tr></table></td>`).join('')}</tr></table>`; }
function mImg(src,alt){ return `<img src="${src}" alt="${mEsc(alt||'')}" width="636" style="width:636px;max-width:100%;display:block;margin:6px 0 4px;border:0">`; }
function mCallout(html,col){ return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 12px"><tr><td style="border-left:4px solid ${col||MC.blue};background:#eef4f7;padding:12px 14px;${MTD}font-size:12.5px;line-height:1.6;color:${MC.ink}">${html}</td></tr></table>`; }
/* .eml multipart/related : images embarquées par Content-ID, s'ouvre en brouillon Outlook couleur */
function emlBuild(html,images,to,subject){ // images : [[cid, dataURL]]
  const bd='=_ecobank_'+Date.now().toString(36); const subj='=?UTF-8?B?'+utf8B64(subject)+'?=';
  let e=`To: ${to||''}\r\nSubject: ${subj}\r\nX-Unsent: 1\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${bd}"; type="text/html"\r\n\r\n`;
  e+=`--${bd}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64Wrap(utf8B64(html))}\r\n`;
  images.forEach(([k,u])=>{ if(!u) return; e+=`--${bd}\r\nContent-Type: image/png; name="${k}.png"\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <${k}>\r\nContent-Disposition: inline; filename="${k}.png"\r\n\r\n${b64Wrap(g3B64(u))}\r\n`; });
  return e+`--${bd}--\r\n`; }

/* ---------- PowerPoint : bandeau marine + filet lime + badge logo ---------- */
const PX={NV:'00415E',BL:'005C83',LM:'8CC63F',L2:'A6D867',MU:'3E5C6B',SF:'EEF4F7',INK:'12333F',RK:'C0392B',AM:'B67D1C',GR:'4E8A2E'};
function pptBand(pp,s,t,st,foot,num,badge){ s.background={color:'FFFFFF'};
  s.addShape(pp.ShapeType.rect,{x:0,y:0,w:13.33,h:1.0,fill:{color:PX.NV}});
  s.addShape(pp.ShapeType.rect,{x:0,y:1.0,w:13.33,h:0.06,fill:{color:PX.LM}});
  s.addShape(pp.ShapeType.ellipse,{x:11.9,y:-0.9,w:2.2,h:2.2,fill:{color:PX.LM,transparency:82},line:{color:PX.LM,transparency:100}});
  s.addText(t,{x:0.5,y:0.13,w:10.4,h:0.5,fontSize:22,bold:true,color:'FFFFFF',fontFace:'Segoe UI'});
  if(st) s.addText(st,{x:0.5,y:0.58,w:10.4,h:0.32,fontSize:11.5,color:PX.L2,fontFace:'Segoe UI'});
  if(badge) s.addImage({data:badge,x:11.1,y:0.12,w:2.05,h:0.75}); else s.addImage({data:LOGO_SRC,x:11.45,y:0.2,w:1.5,h:0.62});
  s.addShape(pp.ShapeType.rect,{x:0,y:7.2,w:13.33,h:0.3,fill:{color:PX.SF}});
  s.addText(foot||'',{x:0.5,y:7.2,w:10.5,h:0.3,fontSize:8.5,color:PX.MU,valign:'middle',fontFace:'Segoe UI'});
  if(num) s.addText(String(num),{x:12.3,y:7.2,w:0.6,h:0.3,fontSize:9,bold:true,color:PX.NV,align:'right',valign:'middle'}); }
function pptKpis(pp,s,arr,y){ arr.forEach((k,i)=>{ const w=12.3/arr.length, x=0.5+i*w;
  s.addShape(pp.ShapeType.roundRect,{x,y,w:w-0.15,h:1.12,fill:{color:'FFFFFF'},line:{color:'CFE0E7',width:1},rectRadius:0.1,shadow:{type:'outer',blur:3,offset:1.5,angle:90,color:'00415E',opacity:0.12}});
  s.addShape(pp.ShapeType.rect,{x,y:y+0.12,w:0.07,h:0.88,fill:{color:k[2]||PX.BL}});
  s.addText(String(k[0]).toUpperCase(),{x:x+0.2,y:y+0.08,w:w-0.45,h:0.26,fontSize:8.5,bold:true,color:PX.MU,fontFace:'Segoe UI'});
  s.addText(String(k[1]),{x:x+0.2,y:y+0.34,w:w-0.3,h:0.46,fontSize:String(k[1]).length>13?13:17,bold:true,color:k[2]||PX.NV,fontFace:'Consolas',fit:'shrink'});
  if(k[3]) s.addText(k[3],{x:x+0.2,y:y+0.8,w:w-0.45,h:0.26,fontSize:8.5,color:PX.MU,fontFace:'Segoe UI'}); }); }
function pptTable(s,head,rows,o){ o=o||{}; const right=o.right||[];
  const H=head.map((h,i)=>({text:h,options:{bold:true,color:'FFFFFF',fill:{color:PX.NV},fontSize:10,align:right.includes(i)?'right':'left',fontFace:'Segoe UI'}}));
  const R=rows.map((r,ri)=>r.map((c,i)=>{ const pill=o.pills&&o.pills(ri,i,c); const tot=r.__total;
    return {text:String(c==null?'':c),options:{fontSize:o.fs||9.5,color:pill?'FFFFFF':(tot?PX.NV:PX.INK),bold:!!pill||tot,fill:{color:pill||(tot?'E6F2D0':(ri%2?'F4F9FB':'FFFFFF'))},align:pill?'center':(right.includes(i)?'right':'left'),fontFace:right.includes(i)?'Consolas':'Segoe UI'}}; }));
  s.addTable([H,...R],{x:o.x||0.5,y:o.y||1.35,w:o.w||12.33,colW:o.colW,border:{type:'solid',pt:0.5,color:'CFE0E7'},rowH:o.rowH||0.3,autoPage:false}); }

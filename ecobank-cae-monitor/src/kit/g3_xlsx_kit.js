const G3={navy:'#00415e',navy2:'#00344b',blue:'#005c83',sky:'#2b9ad6',lime:'#8cc63f',lime2:'#a6d867',
  ink:'#12333f',mut:'#3e5c6b',line:'#cfe0e7',bg:'#ffffff',s1:'#6ba23a',s2:'#d4a13a',s3:'#c0392b',
  pal:['#00415e','#005c83','#8cc63f','#2b9ad6','#d4a13a','#6ba23a','#c0392b','#1a6fb5','#a6d867','#3e5c6b']};
function g3Md(v){ const a=Math.abs(v); if(a>=1e9) return (v/1e9).toLocaleString('fr-FR',{maximumFractionDigits:a>=1e11?0:1})+' Mds';
  if(a>=1e6) return (v/1e6).toLocaleString('fr-FR',{maximumFractionDigits:0})+' M'; return Math.round(v).toLocaleString('fr-FR'); }
function g3Shade(hex,f){ const n=parseInt(hex.slice(1),16); let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  const t=f<0?0:255, p=Math.abs(f); r=Math.round((t-r)*p+r); g=Math.round((t-g)*p+g); b=Math.round((t-b)*p+b);
  return '#'+((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1); }
function g3Canvas(w,h){ const k=(typeof G3S!=='undefined'?G3S:2); const c=document.createElement('canvas'); c.width=Math.round(w*k); c.height=Math.round(h*k); const x=c.getContext&&c.getContext('2d');
  if(!x) return null; x.scale(k,k); x.fillStyle='#fff'; x.fillRect(0,0,w,h); return {c,x,w,h}; }
function g3Title(g,t,sub){ const x=g.x; x.fillStyle=G3.navy; x.font='700 15px "Segoe UI",Arial'; x.textAlign='left'; x.fillText(t,18,26);
  if(sub){ x.fillStyle=G3.mut; x.font='12px "Segoe UI",Arial'; x.fillText(sub,18,44); }
  x.fillStyle=G3.lime; x.fillRect(18,52,46,3); }
function g3Out(g,opt){ if(!g) return null; if(opt&&opt.raw) return g.c.toDataURL('image/png');
  try{ const W=g.c.width, H=g.c.height, k=W/g.w, c=document.createElement('canvas'); c.width=W; c.height=H; const x=c.getContext('2d');
    const m=10*k, R=14*k, rr=(X,Y,w,h,r)=>{ x.beginPath(); x.moveTo(X+r,Y); x.arcTo(X+w,Y,X+w,Y+h,r); x.arcTo(X+w,Y+h,X,Y+h,r); x.arcTo(X,Y+h,X,Y,r); x.arcTo(X,Y,X+w,Y,r); x.closePath(); };
    const bg=x.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#eef4f7'); bg.addColorStop(1,'#dfe9f2'); x.fillStyle=bg; x.fillRect(0,0,W,H);
    const cw=W-2*m-4*k, ch=H-2*m-4*k;
    // ombre portée en deux couches (profondeur)
    x.save(); x.shadowColor='rgba(0,52,75,.30)'; x.shadowBlur=18*k; x.shadowOffsetX=6*k; x.shadowOffsetY=8*k; rr(m,m,cw,ch,R); x.fillStyle='#ffffff'; x.fill(); x.restore();
    x.save(); x.shadowColor='rgba(0,52,75,.18)'; x.shadowBlur=4*k; x.shadowOffsetX=2*k; x.shadowOffsetY=2*k; rr(m,m,cw,ch,R); x.fillStyle='#ffffff'; x.fill(); x.restore();
    // tranche du socle (épaisseur)
    x.save(); rr(m+3*k,m+4*k,cw,ch,R); x.fillStyle='#b9c9d8'; x.globalCompositeOperation='destination-over'; x.fill(); x.restore();
    // contenu, mis à l'échelle sans déformation
    const s=Math.min((cw-8*k)/W,(ch-8*k)/H), dw=W*s, dh=H*s, ox=m+(cw-dw)/2, oy=m+(ch-dh)/2;
    x.save(); rr(m,m,cw,ch,R); x.clip(); x.drawImage(g.c,ox,oy,dw,dh);
    // reflet satiné sur le haut de la carte
    const gl=x.createLinearGradient(0,m,0,m+ch*0.12); gl.addColorStop(0,'rgba(255,255,255,.35)'); gl.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=gl; x.fillRect(m,m,cw,ch*0.12);
    // liseré lime latéral
    const lg=x.createLinearGradient(0,m,0,m+ch); lg.addColorStop(0,G3.lime2); lg.addColorStop(1,G3.lime); x.fillStyle=lg; x.fillRect(m,m,5*k,ch); x.restore();
    // biseau : arête claire en haut à gauche, arête sombre en bas à droite
    x.lineWidth=2*k; x.strokeStyle='rgba(255,255,255,.95)'; x.beginPath(); x.moveTo(m+R,m+1*k); x.lineTo(m+cw-R,m+1*k); x.moveTo(m+1*k,m+R); x.lineTo(m+1*k,m+ch-R); x.stroke();
    x.strokeStyle='rgba(0,65,94,.28)'; x.beginPath(); x.moveTo(m+R,m+ch-1*k); x.lineTo(m+cw-R,m+ch-1*k); x.moveTo(m+cw-1*k,m+R); x.lineTo(m+cw-1*k,m+ch-R); x.stroke();
    x.lineWidth=1*k; x.strokeStyle='rgba(0,65,94,.14)'; rr(m,m,cw,ch,R); x.stroke();
    return c.toDataURL('image/png'); }catch(e){ return g.c.toDataURL('image/png'); } }
function g3Bars(o){ const g=g3Canvas(o.w||760,o.h||380); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const L=o.labels, V=o.values, n=L.length; if(!n) return g3Out(g);
  const top=74, bot=g.h-54, left=70, right=g.w-24, H=bot-top, W=right-left, d=Math.min(28,W/n*0.3);
  const mx=Math.max(...V.map(v=>Math.max(0,v)),1)*1.12;
  x.strokeStyle='#eef2f5'; x.fillStyle=G3.mut; x.font='11px Consolas,monospace'; x.textAlign='right';
  for(let i=0;i<=4;i++){ const y=bot-H*i/4; x.beginPath(); x.moveTo(left,y); x.lineTo(right,y); x.stroke(); x.fillText(g3Md(mx*i/4),left-8,y+4); }
  const bw=W/n*0.56;
  V.forEach((v,i)=>{ const cx=left+W*(i+0.5)/n, h=Math.max(0,v)/mx*H, x0=cx-bw/2, y0=bot-h;
    const col=(o.colors&&o.colors[i])||o.color||G3.blue;
    const gr=x.createLinearGradient(x0,0,x0+bw,0); gr.addColorStop(0,g3Shade(col,0.18)); gr.addColorStop(1,g3Shade(col,-0.12));
    x.save(); const sg=x.createRadialGradient(cx+d/2,bot,2,cx+d/2,bot,bw); sg.addColorStop(0,'rgba(0,52,75,.30)'); sg.addColorStop(1,'rgba(0,52,75,0)'); x.fillStyle=sg; x.beginPath(); x.ellipse(cx+d*0.6,bot-d*0.1,bw*0.85,d*0.55,0,0,7); x.fill(); x.restore();
    x.save(); x.shadowColor='rgba(0,40,80,.32)'; x.shadowBlur=12; x.shadowOffsetX=7; x.shadowOffsetY=5; x.fillStyle=gr; x.fillRect(x0,y0,bw,h); x.restore();
    if(h>6){ const sp=x.createLinearGradient(x0,0,x0+bw*0.45,0); sp.addColorStop(0,'rgba(255,255,255,0)'); sp.addColorStop(0.55,'rgba(255,255,255,.38)'); sp.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=sp; x.fillRect(x0+bw*0.08,y0+2,bw*0.4,h-4); }
    x.fillStyle=g3Shade(col,-0.32); x.beginPath(); x.moveTo(x0+bw,y0); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw+d,bot-d*0.6); x.lineTo(x0+bw,bot); x.fill();
    x.fillStyle=g3Shade(col,0.35); x.beginPath(); x.moveTo(x0,y0); x.lineTo(x0+d,y0-d*0.6); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw,y0); x.fill();
    x.fillStyle=G3.ink; x.font='700 11px Consolas,monospace'; x.textAlign='center'; x.fillText(o.fmt?o.fmt(v):g3Md(v),cx+d/2,y0-d-6);
    x.fillStyle=G3.mut; x.font='11px "Segoe UI",Arial'; const lb=String(L[i]); x.fillText(lb.length>14?lb.slice(0,13)+'…':lb,cx,bot+18); });
  x.strokeStyle=G3.mut; x.beginPath(); x.moveTo(left,bot); x.lineTo(right,bot); x.stroke();
  return g3Out(g); }
function g3HBars(o){ const n=o.labels.length; const g=g3Canvas(o.w||760,o.h||Math.max(240,90+n*34)); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const top=72, left=o.left||250, right=g.w-110, W=right-left, rh=Math.min(30,(g.h-top-20)/Math.max(1,n));
  const mx=Math.max(...o.values.map(v=>Math.abs(v)),1), d=13;
  o.labels.forEach((lb,i)=>{ const v=o.values[i], y=top+i*rh+4, w=Math.abs(v)/mx*W, h=rh*0.62; const col=(o.colors&&o.colors[i])||o.color||G3.blue;
    x.fillStyle=G3.ink; x.font='12px "Segoe UI",Arial'; x.textAlign='right'; const t=String(lb); x.fillText(t.length>34?t.slice(0,33)+'…':t,left-10,y+h/2+4);
    const gr=x.createLinearGradient(0,y,0,y+h); gr.addColorStop(0,g3Shade(col,0.2)); gr.addColorStop(1,g3Shade(col,-0.15)); x.save(); x.shadowColor='rgba(0,40,80,.25)'; x.shadowBlur=8; x.shadowOffsetX=5; x.shadowOffsetY=4; x.fillStyle=gr; x.fillRect(left,y,w,h); x.restore();
    if(w>6){ const sp=x.createLinearGradient(0,y,0,y+h*0.5); sp.addColorStop(0,'rgba(255,255,255,.42)'); sp.addColorStop(1,'rgba(255,255,255,0)'); x.fillStyle=sp; x.fillRect(left+2,y+1,w-4,h*0.45); }
    x.fillStyle=g3Shade(col,0.4); x.beginPath(); x.moveTo(left,y); x.lineTo(left+d,y-d*0.6); x.lineTo(left+w+d,y-d*0.6); x.lineTo(left+w,y); x.fill();
    x.fillStyle=g3Shade(col,-0.35); x.beginPath(); x.moveTo(left+w,y); x.lineTo(left+w+d,y-d*0.6); x.lineTo(left+w+d,y+h-d*0.6); x.lineTo(left+w,y+h); x.fill();
    x.fillStyle=G3.ink; x.font='700 11.5px Consolas,monospace'; x.textAlign='left'; x.fillText(o.fmt?o.fmt(v):g3Md(v),left+w+d+8,y+h/2+4); });
  return g3Out(g); }
function g3Donut(o){ const g=g3Canvas(o.w||760,o.h||380); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const tot=o.values.reduce((a,b)=>a+Math.max(0,b),0)||1;
  const cx=210, cy=o.h?o.h/2+26:216, R=150, ry=0.56, depth=36, rin=0.52;
  const slices=[]; let a=-Math.PI/2; o.values.forEach((v,i)=>{ const f=Math.max(0,v)/tot; slices.push({a0:a,a1:a+f*2*Math.PI,col:(o.colors&&o.colors[i])||G3.pal[i%G3.pal.length]}); a+=f*2*Math.PI; });
  for(let dz=depth;dz>0;dz-=1){ slices.forEach(s=>{ x.beginPath(); x.fillStyle=g3Shade(s.col,-0.38);
    x.ellipse(cx,cy+dz,R,R*ry,0,s.a0,s.a1); x.ellipse(cx,cy+dz,R*rin,R*rin*ry,0,s.a1,s.a0,true); x.fill(); }); }
  slices.forEach(s=>{ const gr=x.createRadialGradient(cx,cy-30,20,cx,cy,R); gr.addColorStop(0,g3Shade(s.col,0.3)); gr.addColorStop(1,s.col);
    x.beginPath(); x.fillStyle=gr; x.ellipse(cx,cy,R,R*ry,0,s.a0,s.a1); x.ellipse(cx,cy,R*rin,R*rin*ry,0,s.a1,s.a0,true); x.fill();
    x.strokeStyle='#fff'; x.lineWidth=1.5; x.stroke();
    x.save(); x.beginPath(); x.ellipse(cx,cy,R-2,R*ry-2,0,Math.max(s.a0,Math.PI),Math.max(s.a0,Math.min(s.a1,2*Math.PI))); x.strokeStyle='rgba(255,255,255,.55)'; x.lineWidth=2.5; x.stroke(); x.restore(); });
  x.fillStyle=G3.navy; x.font='800 18px Consolas,monospace'; x.textAlign='center'; x.fillText(o.center||g3Md(tot),cx,cy+6);
  let ly=86; o.labels.forEach((lb,i)=>{ if(i>8) return; const v=o.values[i]; x.fillStyle=(o.colors&&o.colors[i])||G3.pal[i%G3.pal.length]; x.fillRect(420,ly-10,14,14);
    x.fillStyle=G3.ink; x.font='12.5px "Segoe UI",Arial'; x.textAlign='left'; const t=String(lb); x.fillText(t.length>26?t.slice(0,25)+'…':t,442,ly+1);
    x.font='700 12px Consolas,monospace'; x.textAlign='right'; x.fillText((v/tot*100).toFixed(1).replace('.',',')+' %',g.w-22,ly+1); ly+=30; });
  return g3Out(g); }
function g3Lines(o){ const g=g3Canvas(o.w||760,o.h||360); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const L=o.labels, n=L.length; if(n<2) return g3Out(g);
  const top=78, bot=g.h-58, left=62, right=g.w-24, H=bot-top, W=right-left;
  const all=o.series.flatMap(s=>s.values); const mx=Math.max(...all,0.0001)*1.15, mn=Math.min(0,...all);
  const Y=v=>bot-(v-mn)/(mx-mn)*H, X=i=>left+W*i/(n-1);
  x.strokeStyle='#eef2f5'; x.fillStyle=G3.mut; x.font='11px Consolas,monospace'; x.textAlign='right';
  for(let i=0;i<=4;i++){ const v=mn+(mx-mn)*i/4, y=Y(v); x.beginPath(); x.moveTo(left,y); x.lineTo(right,y); x.stroke(); x.fillText((o.fmt?o.fmt(v):v.toFixed(1)),left-8,y+4); }
  o.series.forEach((s,k)=>{ const col=s.color||G3.pal[k];
    const gr=x.createLinearGradient(0,top,0,bot); gr.addColorStop(0,col+'55'); gr.addColorStop(1,col+'05');
    x.beginPath(); s.values.forEach((v,i)=>i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v))); x.lineTo(X(n-1),bot); x.lineTo(X(0),bot); x.closePath(); x.fillStyle=gr; x.fill();
    x.beginPath(); s.values.forEach((v,i)=>i?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v))); x.strokeStyle=col; x.lineWidth=2.6; x.stroke();
    s.values.forEach((v,i)=>{ if(n>18&&i%Math.ceil(n/12)&&i!==n-1) return; x.beginPath(); x.arc(X(i),Y(v),3.2,0,7); x.fillStyle='#fff'; x.fill(); x.strokeStyle=col; x.lineWidth=2; x.stroke(); });
    const lv=s.values[n-1]; x.fillStyle=col; x.font='700 11.5px Consolas,monospace'; x.textAlign='left'; x.fillText(o.fmt?o.fmt(lv):lv.toFixed(2),Math.min(X(n-1)+6,g.w-60),Y(lv)-6); });
  x.fillStyle=G3.mut; x.font='10.5px "Segoe UI",Arial'; x.textAlign='center';
  L.forEach((lb,i)=>{ if(n>10&&i%Math.ceil(n/10)&&i!==n-1) return; x.fillText(String(lb).slice(0,10),X(i),bot+18); });
  let lx=left; o.series.forEach((s,k)=>{ x.fillStyle=s.color||G3.pal[k]; x.fillRect(lx,g.h-26,14,4); x.fillStyle=G3.ink; x.font='12px "Segoe UI",Arial'; x.textAlign='left'; x.fillText(s.name,lx+20,g.h-21); lx+=x.measureText(s.name).width+50; });
  return g3Out(g); }
function g3Heat(o){ const g=g3Canvas(o.w||760,o.h||360); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const R=o.rows, C=o.cols, M=o.m; const top=84, left=110, cw=(g.w-left-24)/C.length, rh=(g.h-top-24)/R.length;
  x.font='600 12px "Segoe UI",Arial'; x.fillStyle=G3.navy; x.textAlign='center'; C.forEach((c,j)=>x.fillText(c,left+cw*(j+0.5),top-10));
  R.forEach((r,i)=>{ x.textAlign='right'; x.fillStyle=G3.navy; x.fillText(r,left-12,top+rh*(i+0.5)+4);
    C.forEach((_,j)=>{ const v=M[i][j]; const diag=i===j, up=j>i;
      const base=diag?'6,115,162':up?'198,40,40':'46,158,79'; const a=diag?0.12+v*0.55:0.08+Math.min(1,v*5)*0.7;
      x.fillStyle=`rgba(${base},${a.toFixed(2)})`; x.fillRect(left+cw*j+2,top+rh*i+2,cw-4,rh-4);
      x.fillStyle=a>0.5?'#fff':G3.ink; x.font=(diag?'700 ':'')+'12px Consolas,monospace'; x.textAlign='center';
      x.fillText(v?(v*100).toFixed(v<0.01?2:1).replace('.',',')+' %':'·',left+cw*(j+0.5),top+rh*(i+0.5)+4); }); });
  return g3Out(g); }
function g3Gauge(o){ const g=g3Canvas(o.w||620,o.h||380); if(!g) return null; const x=g.x;
  g3Title(g,o.title,o.sub); const cx=g.w/2, cy=g.h-80, R=Math.min(210,g.w/2-40), th=34, dep=16, v=Math.max(0,Math.min(100,o.value));
  const zones=[[0,50,'#c0392b'],[50,75,'#d4a13a'],[75,100,'#6ba23a']], ang=p=>Math.PI+Math.PI*p/100;
  for(let dz=dep;dz>0;dz--) zones.forEach(([a,b,c])=>{ x.beginPath(); x.strokeStyle=g3Shade(c,-0.45); x.lineWidth=th; x.arc(cx,cy+dz*0.6,R,ang(a),ang(b)); x.stroke(); });
  zones.forEach(([a,b,c])=>{ const gr=x.createLinearGradient(cx-R,cy-R,cx+R,cy); gr.addColorStop(0,g3Shade(c,0.25)); gr.addColorStop(1,c); x.beginPath(); x.strokeStyle=gr; x.lineWidth=th; x.arc(cx,cy,R,ang(a),ang(b)); x.stroke(); });
  x.beginPath(); x.strokeStyle='rgba(255,255,255,.55)'; x.lineWidth=3; x.arc(cx,cy,R+th/2-3,Math.PI,2*Math.PI); x.stroke();
  x.fillStyle=G3.mut; x.font='11px Consolas,monospace'; x.textAlign='center'; [0,25,50,75,100].forEach(p=>{ const a=ang(p); x.fillText(p,cx+Math.cos(a)*(R+th),cy+Math.sin(a)*(R+th)+4); });
  const a=ang(v); x.save(); x.shadowColor='rgba(0,52,75,.4)'; x.shadowBlur=8; x.shadowOffsetX=4; x.shadowOffsetY=4;
  x.beginPath(); x.moveTo(cx+Math.cos(a+Math.PI/2)*9,cy+Math.sin(a+Math.PI/2)*9); x.lineTo(cx+Math.cos(a)*(R-4),cy+Math.sin(a)*(R-4)); x.lineTo(cx+Math.cos(a-Math.PI/2)*9,cy+Math.sin(a-Math.PI/2)*9); x.closePath();
  const ng=x.createLinearGradient(cx,cy-R,cx,cy); ng.addColorStop(0,G3.navy2); ng.addColorStop(1,G3.blue); x.fillStyle=ng; x.fill(); x.restore();
  const hg=x.createRadialGradient(cx-6,cy-6,2,cx,cy,22); hg.addColorStop(0,'#ffffff'); hg.addColorStop(1,G3.navy); x.beginPath(); x.arc(cx,cy,20,0,7); x.fillStyle=hg; x.fill();
  x.fillStyle=o.color||G3.navy; x.font='800 44px Consolas,monospace'; x.fillText(Math.round(v)+'',cx,cy+62); x.font='12px "Segoe UI",Arial'; x.fillStyle=G3.mut; x.fillText(o.label||'/ 100',cx,cy+78);
  return g3Out(g); }
function g3Card(o){
  const W=o.w||900, pad=26, lh=19; const tmp=g3Canvas(10,10); if(!tmp) return null;
  const mctx=tmp.x; mctx.font='13px "Segoe UI",Arial';
  const wrap=(t,max)=>{ const words=String(t).replace(/<[^>]+>/g,'').split(' '); const L=[]; let cur='';
    words.forEach(w=>{ const tt=cur?cur+' '+w:w; if(mctx.measureText(tt).width>max&&cur){ L.push(cur); cur=w; } else cur=tt; }); if(cur) L.push(cur); return L; };
  const blocks=(o.blocks||[]).map(b=>({h:b.h,col:b.col||G3.navy,lines:(b.items||[]).flatMap(t=>wrap(t,W-pad*2-40).map((x,i)=>({x,first:i===0})))}));
  const H=78+blocks.reduce((s,b)=>s+30+b.lines.length*lh+10,0)+18;
  const g=g3Canvas(W+14,H+14); const x=g.x; x.fillStyle='#ffffff'; x.fillRect(0,0,W+14,H+14);
  // relief : tranche décalée + ombre portée
  x.fillStyle='rgba(0,65,94,.10)'; x.beginPath(); x.roundRect?x.roundRect(12,12,W,H,16):x.rect(12,12,W,H); x.fill();
  x.fillStyle=g3Shade(G3.navy,0.62); x.beginPath(); x.roundRect?x.roundRect(6,6,W,H,16):x.rect(6,6,W,H); x.fill();
  const bg=x.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#ffffff'); bg.addColorStop(1,'#f3f8fb');
  x.fillStyle=bg; x.beginPath(); x.roundRect?x.roundRect(0,0,W,H,16):x.rect(0,0,W,H); x.fill(); x.strokeStyle='#cfe0e7'; x.lineWidth=1; x.stroke();
  const hd=x.createLinearGradient(0,0,W,0); hd.addColorStop(0,G3.navy2); hd.addColorStop(1,G3.blue);
  x.fillStyle=hd; x.beginPath(); x.roundRect?x.roundRect(0,0,W,54,[16,16,0,0]):x.rect(0,0,W,54); x.fill();
  x.fillStyle=G3.lime; x.fillRect(0,54,W,4);
  x.fillStyle='#fff'; x.font='700 17px "Segoe UI",Arial'; x.fillText(String(o.title||'').slice(0,80),pad,34);
  if(o.tag){ x.font='600 11px "Segoe UI",Arial'; x.fillStyle=G3.lime2; x.textAlign='right'; x.fillText(o.tag,W-pad,34); x.textAlign='left'; }
  let y=84;
  blocks.forEach(b=>{ x.fillStyle=b.col; x.fillRect(pad,y-12,4,16); x.font='700 12px "Segoe UI",Arial'; x.fillText(b.h.toUpperCase(),pad+12,y+1); y+=22;
    x.font='13px "Segoe UI",Arial'; b.lines.forEach(ln=>{ x.fillStyle=G3.ink; if(ln.first){ x.fillStyle=b.col; x.fillText('▸',pad+6,y); x.fillStyle=G3.ink; } x.fillText(ln.x,pad+24,y); y+=lh; }); y+=12; });
  return g3Out(g,{raw:true});
}
function g3B64(url){ return url?url.split(',')[1]:null; }
function g3Bytes(url){ const b=atob(g3B64(url)); const u=new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i]=b.charCodeAt(i); return u; }
function xEsc(t){ return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function pngSize(u8){ const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); try{ return {w:dv.getUint32(16),h:dv.getUint32(20)}; }catch(e){ return {w:1600,h:800}; } }
function dxRun(t,o){ o=o||{}; return `<w:r><w:rPr>${o.font?`<w:rFonts w:ascii="${o.font}" w:hAnsi="${o.font}"/>`:''}${o.b?'<w:b/>':''}${o.i?'<w:i/>':''}${o.color?`<w:color w:val="${o.color}"/>`:''}${o.sz?`<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>`:''}</w:rPr><w:t xml:space="preserve">${xEsc(t)}</w:t></w:r>`; }
function dxP(runs,o){ o=o||{}; return `<w:p><w:pPr>${o.style?`<w:pStyle w:val="${o.style}"/>`:''}${o.keep?'<w:keepNext/>':''}${o.shade?`<w:shd w:val="clear" w:color="auto" w:fill="${o.shade}"/>`:''}${o.border?`<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${o.border}"/></w:pBdr>`:''}<w:spacing w:before="${o.before||0}" w:after="${o.after==null?100:o.after}"/>${o.ind?`<w:ind w:left="${o.ind}"/>`:''}${o.align?`<w:jc w:val="${o.align}"/>`:''}</w:pPr>${Array.isArray(runs)?runs.join(''):runs}</w:p>`; }
function dxImg(rid,id,u8,wcm){ const s=pngSize(u8); const cx=Math.round(wcm*360000), cy=Math.round(cx*s.h/s.w);
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Image ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="img${id}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; }
function dxCell(inner,o){ o=o||{}; return `<w:tc><w:tcPr><w:tcW w:w="${o.w||2000}" w:type="dxa"/>${o.fill?`<w:shd w:val="clear" w:color="auto" w:fill="${o.fill}"/>`:''}<w:vAlign w:val="${o.va||'center'}"/>${o.span?`<w:gridSpan w:val="${o.span}"/>`:''}</w:tcPr>${inner||'<w:p/>'}</w:tc>`; }
function dxKpis(items){ const w=Math.floor(9638/items.length);
  return `<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="FFFFFF"/><w:left w:val="single" w:sz="18" w:color="8CC63F"/><w:bottom w:val="single" w:sz="18" w:color="9FB6C8"/><w:insideV w:val="single" w:sz="18" w:color="FFFFFF"/></w:tblBorders></w:tblPr><w:tblGrid>${items.map(()=>`<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid><w:tr>`+
    items.map(k=>dxCell(dxP(dxRun(k[0].toUpperCase(),{sz:14,color:'3E5C6B',b:true}),{after:40})+dxP(dxRun(k[1],{sz:String(k[1]).length>12?19:24,b:true,color:k[2]||'00415E',font:'Consolas'}),{after:20})+(k[3]?dxP(dxRun(k[3],{sz:14,color:'3E5C6B'}),{after:0}):''),{w,fill:'EEF4F7'})).join('')+'</w:tr></w:tbl>'+dxP('',{after:160}); }
function b64Wrap(s){ return s.replace(/(.{76})/g,'$1\r\n'); }
function utf8B64(str){ const u=new TextEncoder().encode(str); let b=''; for(let i=0;i<u.length;i+=0x8000) b+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(b); }
function xlsxInsertCF(sx,rules){
  let p=1; const xml=rules.map(r=>{ const pr=p++;
    if(r.type==='dataBar') return `<conditionalFormatting sqref="${r.ref}"><cfRule type="dataBar" priority="${pr}"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF${r.color||'005C83'}"/></dataBar></cfRule></conditionalFormatting>`;
    if(r.type==='colorScale'){ const c=r.colors||['63BE7B','FFEB84','F8696B']; return `<conditionalFormatting sqref="${r.ref}"><cfRule type="colorScale" priority="${pr}"><colorScale><cfvo type="min"/>${c.length===3?'<cfvo type="percentile" val="50"/>':''}<cfvo type="max"/>${c.map(x=>`<color rgb="FF${x}"/>`).join('')}</colorScale></cfRule></conditionalFormatting>`; }
    if(r.type==='iconSet'){ const cv=r.nums?`<cfvo type="num" val="0"/><cfvo type="num" val="${r.nums[0]}"/><cfvo type="num" val="${r.nums[1]}"/>`:'<cfvo type="percent" val="0"/><cfvo type="percent" val="33"/><cfvo type="percent" val="67"/>'; return `<conditionalFormatting sqref="${r.ref}"><cfRule type="iconSet" priority="${pr}"><iconSet iconSet="${r.set||'3TrafficLights1'}"${r.reverse?' reverse="1"':''}>${cv}</iconSet></cfRule></conditionalFormatting>`; }
    return ''; }).join('');
  return wsInsert(sx,'conditionalFormatting',xml);
}
function x3Shade(hex,f){ return g3Shade('#'+hex,f).slice(1).toUpperCase(); }
async function xlsxAttach(b64,attach,opts){
  opts=opts||{}; const z=await JSZip.loadAsync(b64,{base64:true}); let ct=await z.file('[Content_Types].xml').async('string'); let n=0;
  if(!/Extension="png"/.test(ct)) ct=ct.replace('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="png" ContentType="image/png"/>');
  const colIdx=L=>L.split('').reduce((s,ch)=>s*26+ch.charCodeAt(0)-64,0)-1;
  const sheets=Object.keys(z.files).map(k=>(k.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)||[])[1]).filter(Boolean).map(Number).sort((a,b)=>a-b);
  const by=new Map(); attach.forEach(a=>{ const o=by.get(a.sheet)||{imgs:[],cf:[],dv:[]}; o.imgs.push(...(a.imgs||[]).filter(i=>i&&i.png)); o.cf.push(...(a.cf||[])); o.dv.push(...(a.dv||[])); by.set(a.sheet,o); });
  if(opts.logo) z.file('xl/media/logo3d.png',g3Bytes(opts.logo));
  let SST=null; if(opts.logo&&z.file('xl/sharedStrings.xml')){ const sst=await z.file('xl/sharedStrings.xml').async('string'); SST=(sst.match(/<si>[\s\S]*?<\/si>/g)||[]).map(x=>(x.match(/<t[^>]*>([\s\S]*?)<\/t>/g)||[]).map(t=>t.replace(/<[^>]+>/g,'')).join('')); }
  for(const si of sheets){ const a=by.get(si)||{imgs:[],cf:[],dv:[]}; const sp='xl/worksheets/sheet'+si+'.xml'; let sx=await z.file(sp).async('string');
    try{ sx=xlsxPolish(sx,si); }catch(e){ console.warn('finition feuille',e); }
    if(a.cf.length) sx=xlsxInsertCF(sx,a.cf);
    if(a.dv.length) sx=xlsxInsertDV(sx,a.dv);
    // badge logo + drapeau, en haut à droite du bandeau de titre
    let logo='';
    if(opts.logo){
      // ligne de titre à hauteur fixe ; le badge tient exactement dans cette ligne
      const TH=46, CY=Math.round((TH-6)*12700), CX=Math.round(CY*466/166), BPX=CX/9525;
      if(/<row r="1"[^>]*>/.test(sx)) sx=sx.replace(/<row r="1"([^>]*)>/,(m,a)=>'<row r="1"'+a.replace(/\s(ht|customHeight)="[^"]*"/g,'')+' ht="'+TH+'" customHeight="1">');
      // largeurs réelles des colonnes (px) et longueur du titre
      const W=[]; (sx.match(/<col [^>]*\/>/g)||[]).forEach(c=>{ const mn=+c.match(/min="(\d+)"/)[1], mx=+c.match(/max="(\d+)"/)[1], w=+((c.match(/width="([\d.]+)"/)||[0,8.43])[1]); for(let k=mn;k<=mx;k++) W[k-1]=Math.round(w*7+5); });
      const wpx=k=>W[k]||64;
      const m=sx.match(/<mergeCell ref="[A-Z]+1:([A-Z]+)1"\/>/); const last=m?colIdx(m[1]):8;
      let bandPx=0; for(let k=0;k<=last;k++) bandPx+=wpx(k);
      const c1=(sx.match(/<c r="A1"[^>]*>[\s\S]*?<\/c>/)||[''])[0]; let title='';
      if(/t="s"/.test(c1)){ const v=c1.match(/<v>(\d+)<\/v>/); title=v&&SST?SST[+v[1]]||'':''; } else { const v=c1.match(/<(?:v|t)[^>]*>([\s\S]*?)<\/(?:v|t)>/); title=v?v[1]:''; }
      const textPx=title.length*11+24;
      let col, off;
      if(textPx+BPX+24<=bandPx){ // à droite dans le bandeau, sans recouvrir le titre
        let need=BPX+10, k=last; while(k>0&&need>wpx(k)){ need-=wpx(k); k--; } col=k; off=Math.max(0,Math.round((wpx(k)-need)*9525)); }
      else { col=last+1; off=Math.round(6*9525); }   // titre long : juste après le bandeau, dans une zone vide
      logo=`<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${off}</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="${CX}" cy="${CY}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Logo Ecobank"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`; }
    const imgs=a.imgs; if(!imgs.length&&!logo){ z.file(sp,sx); continue; } n++;
    let anchors=''; imgs.forEach((im,i)=>{ const nm='s'+si+'_'+(i+1)+'.png'; z.file('xl/media/'+nm,g3Bytes(im.png));
      anchors+=`<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${im.col+im.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${im.row+im.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i+2}" name="Visuel ${i+1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdI${i+1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr>${XL3D_PIC}</xdr:spPr></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`; });
    const dn='drawing'+si+'.xml';
    z.file('xl/drawings/'+dn,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}${logo}</xdr:wsDr>`);
    z.file('xl/drawings/_rels/'+dn+'.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${imgs.map((_,i)=>`<Relationship Id="rIdI${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/s${si}_${i+1}.png"/>`).join('')}${logo?'<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo3d.png"/>':''}</Relationships>`);
    const rp='xl/worksheets/_rels/sheet'+si+'.xml.rels'; let rel=z.file(rp)?await z.file(rp).async('string'):'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    rel=rel.replace('</Relationships>',`<Relationship Id="rIdDrw${si}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/${dn}"/></Relationships>`); z.file(rp,rel);
    if(!/xmlns:r=/.test(sx)) sx=sx.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
    sx=wsInsert(sx,'drawing',`<drawing r:id="rIdDrw${si}"/>`); z.file(sp,sx);
    ct=ct.replace('</Types>',`<Override PartName="/xl/drawings/${dn}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`); }
  z.file('[Content_Types].xml',ct);
  try{ await xlsxProps(z); }catch(e){}
  if(opts.gradient){ const st=await z.file('xl/styles.xml').async('string'); z.file('xl/styles.xml',xlsxGradients(st)); }
  return {u8:await z.generateAsync({type:'uint8array'}),n};
}
function g3LoadLogo(){ if(__LOGO_IMG) return Promise.resolve(__LOGO_IMG);
  return new Promise(res=>{ try{ const im=new Image(); im.onload=()=>{ __LOGO_IMG=im; res(im); }; im.onerror=()=>res(null); im.src=LOGO_SRC; setTimeout(()=>res(__LOGO_IMG),2500); }catch(e){ res(null); } }); }
function g3DrawFlag(x,X,Y,W,H){
  const cols=['#00853F','#FDEF42','#E31B23'];
  x.save(); x.fillStyle='rgba(0,20,40,.35)'; x.beginPath(); x.roundRect?x.roundRect(X+4,Y+5,W,H,5):x.rect(X+4,Y+5,W,H); x.fill();
  x.beginPath(); x.roundRect?x.roundRect(X,Y,W,H,5):x.rect(X,Y,W,H); x.clip();
  cols.forEach((c,i)=>{ x.fillStyle=c; x.fillRect(X+i*W/3,Y,W/3+1,H); });
  // étoile verte à cinq branches au centre de la bande jaune
  const cx=X+W/2, cy=Y+H/2, R=H*0.2, r=R*0.4; x.fillStyle='#00853F'; x.beginPath();
  for(let k=0;k<10;k++){ const a=-Math.PI/2+k*Math.PI/5, rr=k%2?r:R; x.lineTo(cx+rr*Math.cos(a),cy+rr*Math.sin(a)); } x.closePath(); x.fill();
  // ondulation et relief : bandes d'ombre et de lumière
  const g=x.createLinearGradient(X,0,X+W,0); g.addColorStop(0,'rgba(255,255,255,.28)'); g.addColorStop(0.25,'rgba(0,0,0,.10)'); g.addColorStop(0.5,'rgba(255,255,255,.22)'); g.addColorStop(0.75,'rgba(0,0,0,.14)'); g.addColorStop(1,'rgba(255,255,255,.18)');
  x.fillStyle=g; x.fillRect(X,Y,W,H);
  const v=x.createLinearGradient(0,Y,0,Y+H); v.addColorStop(0,'rgba(255,255,255,.35)'); v.addColorStop(0.45,'rgba(255,255,255,0)'); v.addColorStop(1,'rgba(0,0,0,.25)'); x.fillStyle=v; x.fillRect(X,Y,W,H);
  x.restore(); x.strokeStyle='rgba(255,255,255,.7)'; x.lineWidth=1.2; x.beginPath(); x.roundRect?x.roundRect(X+0.5,Y+0.5,W-1,H-1,5):x.rect(X,Y,W,H); x.stroke();
}
async function g3LogoBadge(){
  if(__BADGE) return __BADGE; const im=await g3LoadLogo();
  const W=450, H=150, g=g3Canvas(W+16,H+16); if(!g) return null; const x=g.x; x.clearRect(0,0,W+16,H+16);
  // tranche et ombre portée
  x.fillStyle='rgba(0,30,60,.30)'; x.beginPath(); x.roundRect?x.roundRect(10,12,W,H,18):x.rect(10,12,W,H); x.fill();
  x.fillStyle='#002444'; x.beginPath(); x.roundRect?x.roundRect(5,7,W,H,18):x.rect(5,7,W,H); x.fill();
  const bg=x.createLinearGradient(0,0,0,H); bg.addColorStop(0,'#1c6f9e'); bg.addColorStop(0.5,'#0a5680'); bg.addColorStop(1,'#063f60');
  x.fillStyle=bg; x.beginPath(); x.roundRect?x.roundRect(0,0,W,H,18):x.rect(0,0,W,H); x.fill();
  const hl=x.createLinearGradient(0,0,0,H*0.55); hl.addColorStop(0,'rgba(255,255,255,.32)'); hl.addColorStop(1,'rgba(255,255,255,0)');
  x.fillStyle=hl; x.beginPath(); x.roundRect?x.roundRect(3,3,W-6,H*0.5,[16,16,40,40]):x.rect(3,3,W-6,H*0.5); x.fill();
  x.strokeStyle='rgba(255,255,255,.45)'; x.lineWidth=1.5; x.beginPath(); x.roundRect?x.roundRect(1,1,W-2,H-2,17):x.rect(1,1,W-2,H-2); x.stroke();
  if(im){ const lh=H-26, lw=lh*im.width/im.height, lx=16, ly=13;   // proportions conservées
    x.save(); x.shadowColor='rgba(0,0,0,.45)'; x.shadowBlur=10; x.shadowOffsetX=3; x.shadowOffsetY=4; x.fillStyle='#0a4f76'; x.beginPath(); x.roundRect?x.roundRect(lx,ly,lw,lh,12):x.rect(lx,ly,lw,lh); x.fill(); x.restore();
    x.save(); x.beginPath(); x.roundRect?x.roundRect(lx,ly,lw,lh,12):x.rect(lx,ly,lw,lh); x.clip(); x.drawImage(im,lx,ly,lw,lh);
    const gl=x.createLinearGradient(0,ly,0,ly+lh); gl.addColorStop(0,'rgba(255,255,255,.22)'); gl.addColorStop(0.45,'rgba(255,255,255,.04)'); gl.addColorStop(0.5,'rgba(0,0,0,0)'); gl.addColorStop(1,'rgba(0,0,0,.18)'); x.fillStyle=gl; x.fillRect(lx,ly,lw,lh); x.restore();
    x.strokeStyle='rgba(255,255,255,.55)'; x.lineWidth=1.5; x.beginPath(); x.roundRect?x.roundRect(lx+0.5,ly+0.5,lw-1,lh-1,12):x.rect(lx,ly,lw,lh); x.stroke(); }
  else { x.fillStyle='#fff'; x.font='italic 700 58px "Segoe UI",Arial'; x.fillText('Ecobank',30,76); x.fillStyle=G3.lime; x.fillRect(30,90,330,3); x.fillStyle='#fff'; x.font='italic 24px "Segoe UI",Arial'; x.fillText('The Pan African Bank',30,124); }
  g3DrawFlag(x,W-138,34,118,82);
  __BADGE=g3Out(g,{raw:true}); return __BADGE;
}
function xlsxGradients(styles){
  const lum=h=>{ const n=parseInt(h,16); return (0.299*((n>>16)&255)+0.587*((n>>8)&255)+0.114*(n&255))/255; };
  return styles.replace(/<fill><patternFill patternType="solid"><fgColor rgb="FF([0-9A-F]{6})"\/><bgColor\/><\/patternFill><\/fill>/g,(m,h)=>{
    if(lum(h)>0.72){ // cellules claires : dégradé subtil, clair en haut et ombré en bas (relief de chaque cellule)
      const top=h==='FFFFFF'?'FFFFFF':x3Shade(h,0.55), bot=x3Shade(h,h==='FFFFFF'?-0.05:-0.07);
      return `<fill><gradientFill degree="90"><stop position="0"><color rgb="FF${top}"/></stop><stop position="0.6"><color rgb="FF${h}"/></stop><stop position="1"><color rgb="FF${bot}"/></stop></gradientFill></fill>`; }
    const top=x3Shade(h,0.38), bot=x3Shade(h,-0.30);
    return `<fill><gradientFill degree="90"><stop position="0"><color rgb="FF${top}"/></stop><stop position="0.5"><color rgb="FF${h}"/></stop><stop position="1"><color rgb="FF${bot}"/></stop></gradientFill></fill>`; });
}
function xlsxInsertDV(sx,dvs){
  const xml=`<dataValidations count="${dvs.length}">`+dvs.map(d=>`<dataValidation type="list" allowBlank="1" showErrorMessage="1" sqref="${d.ref}"><formula1>"${d.list.join(',')}"</formula1></dataValidation>`).join('')+'</dataValidations>';
  return wsInsert(sx,'dataValidations',xml);
}
function xlsxPolish(sx,si){
  const titled=/<mergeCell ref="A1:[A-Z]+1"\/>/.test(sx);
  // vue : grille masquée, zoom 90 %, titre figé
  const pane=titled?'<pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/>':'';
  if(/<sheetView\b/.test(sx)){
    sx=sx.replace(/<sheetView\b([^>]*?)(\/?)>/,(m,attrs,selfc)=>{ let a=attrs.replace(/\s(showGridLines|zoomScale|zoomScaleNormal)="[^"]*"/g,'');
      a=' showGridLines="0" zoomScale="90" zoomScaleNormal="90"'+a; return selfc?'<sheetView'+a+'>'+pane+'</sheetView>':'<sheetView'+a+'>'+(/<pane\b/.test(sx)?'':pane); });
  } else sx=wsInsert(sx,'sheetViews','<sheetViews><sheetView showGridLines="0" zoomScale="90" zoomScaleNormal="90" workbookViewId="0">'+pane+'</sheetView></sheetViews>');
  // onglet coloré + ajustement à la largeur à l'impression
  const tab='<tabColor rgb="FF'+XL_TABS[(si-1)%XL_TABS.length]+'"/>';
  if(/<sheetPr\b[^>]*\/>/.test(sx)) sx=sx.replace(/<sheetPr\b([^>]*)\/>/,'<sheetPr$1>'+tab+'<pageSetUpPr fitToPage="1"/></sheetPr>');
  else if(/<sheetPr\b/.test(sx)) sx=sx.replace(/<sheetPr\b([^>]*)>/,'<sheetPr$1>'+tab).replace(/<\/sheetPr>/,(/<pageSetUpPr/.test(sx)?'':'<pageSetUpPr fitToPage="1"/>')+'</sheetPr>');
  else sx=wsInsert(sx,'sheetPr','<sheetPr>'+tab+'<pageSetUpPr fitToPage="1"/></sheetPr>');
  // impression : paysage A4, une page de large, pied de page Ecobank
  sx=sx.replace(/<printOptions\b[^>]*\/>/g,'').replace(/<pageMargins\b[^>]*\/>/g,'').replace(/<pageSetup\b[^>]*\/>/g,'').replace(/<headerFooter\b[\s\S]*?<\/headerFooter>/g,'');
  sx=wsInsert(sx,'printOptions','<printOptions horizontalCentered="1"/>');
  sx=wsInsert(sx,'pageMargins','<pageMargins left="0.3" right="0.3" top="0.45" bottom="0.55" header="0.2" footer="0.25"/>');
  sx=wsInsert(sx,'pageSetup','<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>');
  sx=wsInsert(sx,'headerFooter','<headerFooter><oddFooter>&amp;L&amp;"Segoe UI,Regular"&amp;8&amp;K00305A'+xEsc(KIT.footer)+'&amp;C&amp;"Segoe UI,Bold"&amp;8&amp;K0673A2&amp;A&amp;R&amp;"Segoe UI,Regular"&amp;8&amp;K54708APage &amp;P / &amp;N</oddFooter></headerFooter>');
  return sx; }
async function xlsxProps(z){ const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');
  const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xEsc(KIT.docTitle)}</dc:title><dc:subject>${xEsc(KIT.docSubject)}</dc:subject><dc:creator>${xEsc(KIT.org)} · ${xEsc(KIT.unit)}</dc:creator><cp:keywords>${xEsc(KIT.keywords)}</cp:keywords><cp:lastModifiedBy>${xEsc(KIT.app)}</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
  z.file('docProps/core.xml',core);
  let ct=await z.file('[Content_Types].xml').async('string');
  if(!/PartName="\/docProps\/core.xml"/.test(ct)){ ct=ct.replace('</Types>','<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>'); z.file('[Content_Types].xml',ct); }
  let rels=await z.file('_rels/.rels').async('string');
  if(!/docProps\/core.xml/.test(rels)){ rels=rels.replace('</Relationships>','<Relationship Id="rIdCore" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'); z.file('_rels/.rels',rels); }
  if(z.file('docProps/app.xml')){ let app=await z.file('docProps/app.xml').async('string'); if(!/<Company>/.test(app)) app=app.replace('</Properties>','<Company>Ecobank Sénégal</Company></Properties>'); z.file('docProps/app.xml',app); } }
function wsInsert(sx,tag,xml){
  const after=WS_ORDER.slice(WS_ORDER.indexOf(tag)+1);
  let pos=-1; for(const t of after){ const m=sx.search(new RegExp('<'+t+'[ >/]')); if(m>=0&&(pos<0||m<pos)) pos=m; }
  if(pos<0) pos=sx.search(/<\/worksheet>\s*$/);
  return sx.slice(0,pos)+xml+sx.slice(pos);
}
async function copyRich(html, plain){
  plain=plain||htmlToText(html);
  try{
    if(navigator.clipboard && window.ClipboardItem){
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([html],{type:'text/html'}),
        'text/plain': new Blob([plain],{type:'text/plain'}) })]);
      toast('✅ Copié avec mise en forme — collez dans Outlook / Word'); return;
    }
  }catch(e){}
  // fallback : sélection DOM + execCommand
  try{ const d=document.createElement('div'); d.setAttribute('contenteditable','true');
    d.style.cssText='position:fixed;left:-9999px;top:0;opacity:0'; d.innerHTML=html; document.body.appendChild(d);
    const r=document.createRange(); r.selectNodeContents(d); const sel=getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('copy'); sel.removeAllRanges(); d.remove(); toast('✅ Copié avec mise en forme');
  }catch(e){ try{ await navigator.clipboard.writeText(plain); toast('📋 Copié (texte)'); }catch(_){ toast('Copie impossible'); } }
}
function htmlToText(h){ return h.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<br\s*\/?>/gi,'\n')
  .replace(/<\/(div|tr|p|td|table|th)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;|&#160;/g,' ')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim(); }
function colL(i){ let s=''; i++; while(i>0){ const m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
const X3={
  hdr:()=>({fill:{patternType:'solid',fgColor:{rgb:'00415E'}},font:{name:'Segoe UI',bold:true,sz:10,color:{rgb:'FFFFFF'}},alignment:{vertical:'center',horizontal:'center',wrapText:true},
    border:{top:{style:'thin',color:{rgb:'3F8FB5'}},left:{style:'thin',color:{rgb:'3F8FB5'}},bottom:{style:'medium',color:{rgb:'8CC63F'}},right:{style:'thin',color:{rgb:'00344B'}}}}),
  cell:(i,o)=>Object.assign({fill:{patternType:'solid',fgColor:{rgb:i%2?'EEF4F7':'FFFFFF'}},font:{name:'Segoe UI',sz:9.5,color:{rgb:'12333F'}},alignment:{vertical:'top'},
    border:{top:{style:'thin',color:{rgb:'FFFFFF'}},left:{style:'thin',color:{rgb:'FFFFFF'}},bottom:{style:'medium',color:{rgb:'B7CDD8'}},right:{style:'thin',color:{rgb:'B7CDD8'}}}},o||{}),
  pill:(hex)=>({fill:{patternType:'solid',fgColor:{rgb:hex}},font:{name:'Segoe UI',sz:9.5,bold:true,color:{rgb:'FFFFFF'}},alignment:{horizontal:'center',vertical:'center'},
    border:{top:{style:'thin',color:{rgb:x3Shade(hex,0.45)}},left:{style:'thin',color:{rgb:x3Shade(hex,0.45)}},bottom:{style:'medium',color:{rgb:x3Shade(hex,-0.45)}},right:{style:'medium',color:{rgb:x3Shade(hex,-0.35)}}}}),
  tile:(hex,big,sz)=>({fill:{patternType:'solid',fgColor:{rgb:hex}},font:{name:big?'Consolas':'Segoe UI',sz:big?(sz||16):9,bold:true,color:{rgb:big?'FFFFFF':'DCEBF1'}},alignment:{horizontal:'left',vertical:'center'},
    border:{top:{style:'thin',color:{rgb:x3Shade(hex,0.5)}},left:{style:'medium',color:{rgb:'8CC63F'}},bottom:{style:'thick',color:{rgb:x3Shade(hex,-0.5)}},right:{style:'medium',color:{rgb:x3Shade(hex,-0.4)}}}}),
  title:()=>({fill:{patternType:'solid',fgColor:{rgb:'00415E'}},font:{name:'Segoe UI',sz:15,bold:true,color:{rgb:'FFFFFF'}},alignment:{vertical:'center'},border:{bottom:{style:'thick',color:{rgb:'8CC63F'}}}}),
  sub:()=>({font:{name:'Segoe UI',italic:true,sz:10,color:{rgb:'3E5C6B'}},alignment:{wrapText:true,vertical:'top'}})
};

const WS_ORDER=['sheetPr','dimension','sheetViews','sheetFormatPr','cols','sheetData','sheetCalcPr','sheetProtection','protectedRanges','scenarios','autoFilter','sortState','dataConsolidate','customSheetViews','mergeCells','phoneticPr','conditionalFormatting','dataValidations','hyperlinks','printOptions','pageMargins','pageSetup','headerFooter','rowBreaks','colBreaks','customProperties','cellWatches','ignoredErrors','smartTags','drawing','legacyDrawing','legacyDrawingHF','picture','oleObjects','controls','webPublishItems','tableParts','extLst'];
const XL_TABS=['00415E','8CC63F','005C83','005C83','6BA23A','005C83'];
const XL3D_PIC='<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 3500"/></a:avLst></a:prstGeom>'+
  '<a:effectLst><a:outerShdw blurRad="114300" dist="57150" dir="2700000" algn="tl" rotWithShape="0"><a:srgbClr val="00344B"><a:alpha val="42000"/></a:srgbClr></a:outerShdw></a:effectLst>'+
  '<a:scene3d><a:camera prst="orthographicFront"/><a:lightRig rig="threePt" dir="t"/></a:scene3d><a:sp3d><a:bevelT w="44450" h="19050" prst="softRound"/></a:sp3d>';

let __LOGO_IMG=null, __BADGE=null;
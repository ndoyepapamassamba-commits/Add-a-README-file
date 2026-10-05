/* =====================================================================
   50 · exports Comité : classeur Excel (11 feuilles), PowerPoint, PDF
   Le périmètre filtré est rappelé dans chaque export.
   ===================================================================== */
function g3Waterfall(o){ const g=g3Canvas(o.w||900,o.h||420); if(!g) return null; const x=g.x; g3Title(g,o.title,o.sub);
  const it=o.items, n=it.length, top=86, bot=g.h-62, left=78, right=g.w-24, H=bot-top, W=right-left;
  let run=0; const seg=it.map(t=>{ if(t.tot){ run=t.v; return [0,t.v]; } const a=[run,run+t.v]; run+=t.v; return a; });
  const lo0=Math.min(...seg.filter((s,i)=>!it[i].tot).flat(),...it.filter(t=>t.tot).map(t=>t.v)); const p10=Math.pow(10,Math.floor(Math.log10(Math.max(1,lo0))));
  const mn=Math.max(0,Math.floor(lo0*0.8/p10)*p10), mx=Math.max(...seg.flat())*1.08, Y=v=>bot-(v-mn)/(mx-mn)*H;
  x.strokeStyle='#eef2f5'; x.fillStyle=G3.mut; x.font='11px Consolas,monospace'; x.textAlign='right';
  for(let i=0;i<=4;i++){ const v=mn+(mx-mn)*i/4, y=Y(v); x.beginPath(); x.moveTo(left,y); x.lineTo(right,y); x.stroke(); x.fillText(g3Md(v),left-8,y+4); }
  const bw=W/n*0.58, d=10;
  it.forEach((t,i)=>{ const cx=left+W*(i+0.5)/n, a=Y(Math.max(seg[i][0],mn)), b=Y(Math.max(seg[i][1],mn)), y0=Math.min(a,b), h=Math.max(2,Math.abs(a-b)), x0=cx-bw/2;
    const col=t.tot?(i?G3.blue:G3.navy):(t.v>=0?'#b3261e':'#1f7a5a');
    const gr=x.createLinearGradient(x0,0,x0+bw,0); gr.addColorStop(0,g3Shade(col,0.18)); gr.addColorStop(1,g3Shade(col,-0.12));
    x.save(); x.shadowColor='rgba(0,30,80,.28)'; x.shadowBlur=10; x.shadowOffsetX=5; x.shadowOffsetY=4; x.fillStyle=gr; x.fillRect(x0,y0,bw,h); x.restore();
    x.fillStyle=g3Shade(col,0.35); x.beginPath(); x.moveTo(x0,y0); x.lineTo(x0+d,y0-d*0.6); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw,y0); x.fill();
    x.fillStyle=g3Shade(col,-0.32); x.beginPath(); x.moveTo(x0+bw,y0); x.lineTo(x0+bw+d,y0-d*0.6); x.lineTo(x0+bw+d,y0+h-d*0.6); x.lineTo(x0+bw,y0+h); x.fill();
    if(i<n-1){ x.strokeStyle='rgba(0,27,77,.35)'; x.setLineDash([3,3]); x.beginPath(); const yy=Y(seg[i][t.tot?1:1]); x.moveTo(x0+bw,yy); x.lineTo(left+W*(i+1.5)/n-bw/2,yy); x.stroke(); x.setLineDash([]); }
    x.fillStyle=G3.ink; x.font='700 11.5px Consolas,monospace'; x.textAlign='center'; x.fillText(t.tot?g3Md(t.v):(t.v>=0?'+':'−')+g3Md(Math.abs(t.v)),cx+d/2,y0-d-6);
    x.fillStyle=G3.mut; x.font='600 10.5px "Segoe UI",Arial'; String(t.lib).split('\n').forEach((ln,k)=>x.fillText(ln,cx,bot+16+k*13)); });
  return g3Out(g); }

function exportVisuals(A,M,big){ const h=big?520:400, P=M.P;
  const wfItems=[{lib:'Provision\n'+P.p,v:A.pA,tot:true},...A.B.map(b=>({lib:{exit:'Sorties',new:'Nouvelles\nentrées',vol:'Effet\nvolume',rate:'Effet\ncouverture',det:'Migrations\ndétérioration',imp:'Migrations\namélioration',unk:'Sans\nstage'}[b.id]||b.lib,v:b.v})),{lib:'Provision\n'+P.n,v:A.pS,tot:true}];
  const V={};
  V.wf=g3Waterfall({title:'IFRS9 Bridge — provision '+P.p+' → '+P.n,sub:'Décomposition exacte contrat par contrat (XOF)',items:wfItems,w:960,h:big?540:440});
  V.st=g3Bars({title:'Provision par stage — '+P.n,sub:P.p+' : S1 '+g3Md(A.st[1].pA)+' · S2 '+g3Md(A.st[2].pA)+' · S3 '+g3Md(A.st[3].pA),labels:['Stage 1','Stage 2','Stage 3'],values:[1,2,3].map(s=>A.st[s].pS),colors:[C.s1,C.s2,C.s3],h});
  const rowsN=[1,2,3].map(a=>{ const t=[1,2,3].reduce((s,b)=>s+((A.MX[a+'>'+b]||{}).n||0),0)||1; return [1,2,3].map(b=>((A.MX[a+'>'+b]||{}).n||0)/t); });
  V.heat=g3Heat({title:'Matrice de migration (en % des contrats rapprochés)',sub:'Lignes : stage '+P.p+' · colonnes : stage '+P.n,rows:['S1 '+P.p,'S2 '+P.p,'S3 '+P.p],cols:['S1 '+P.n,'S2 '+P.n,'S3 '+P.n],m:rowsN,h});
  const F=['1>2','1>3','2>3','2>1','3>1','3>2','1>1','2>2','3>3'];
  V.flux=g3HBars({title:'Δ provision par flux de stage',sub:'Contrats rapprochés',labels:F.map(m=>'S'+m[0]+' → S'+m[2]+(+m[2]>+m[0]?'  (détérioration)':+m[2]<+m[0]?'  (amélioration)':'')),values:F.map(m=>A.migSub[m].d),colors:F.map(m=>+m[2]>+m[0]?C.up:+m[2]<+m[0]?C.dn:C.sky),fmt:v=>(v>=0?'+':'−')+g3Md(Math.abs(v)),left:230});
  const ti=A.top.slice(0,12), td=A.bot.slice(0,12);
  V.inc=g3HBars({title:'Top 12 hausses de provision',sub:'Δ provision par contrat',labels:ti.map(r=>(r.nm||r.cu).slice(0,30)),values:ti.map(r=>r.dP),color:C.up,fmt:v=>'+'+g3Md(v),left:260});
  V.dec=g3HBars({title:'Top 12 baisses de provision',sub:'Δ provision par contrat',labels:td.map(r=>(r.nm||r.cu).slice(0,30)),values:td.map(r=>r.dP),color:C.dn,fmt:v=>'−'+g3Md(Math.abs(v)),left:260});
  const sg=grp(A.R,r=>r.sg).sort((a,b)=>b.d-a.d);
  V.seg=g3HBars({title:'Δ provision par segment',sub:'Contribution à la variation nette',labels:sg.map(g=>g.k),values:sg.map(g=>g.d),colors:sg.map(g=>g.d>=0?C.up:C.dn),fmt:v=>(v>=0?'+':'−')+g3Md(Math.abs(v)),left:200});
  const of=grp(A.R,r=>r.of).sort((a,b)=>Math.abs(b.d)-Math.abs(a.d)).slice(0,12);
  V.agc=g3HBars({title:'Gestionnaires — plus forts mouvements',sub:'Δ provision (Account Officer)',labels:of.map(g=>g.k),values:of.map(g=>g.d),colors:of.map(g=>g.d>=0?C.up:C.dn),fmt:v=>(v>=0?'+':'−')+g3Md(Math.abs(v)),left:260});
  const so=[1,2,3].map(s=>A.st[s]);
  V.out=g3Bars({title:'Outstanding par stage — '+P.n,sub:'Variation : '+so.map((o,i)=>'S'+(i+1)+' '+(o.dO>=0?'+':'−')+g3Md(Math.abs(o.dO))).join(' · '),labels:['Stage 1','Stage 2','Stage 3'],values:so.map(o=>o.oS),colors:[C.s1,C.s2,C.s3],h});
  const W=A.WL; V.wl=g3Bars({title:'Watchlist IFRS9',sub:'Nombre d\'alertes par niveau',labels:['CRITICAL','HIGH','MEDIUM','LOW'],values:['CRITICAL','HIGH','MEDIUM','LOW'].map(s=>W.filter(w=>w.sev===s).length),colors:[C.crit,C.high,C.med,C.low],fmt:v=>fN(v),h});
  V.card=g3Card({title:'Key Committee Messages',tag:P.N,w:960,blocks:[{h:'Constats',items:keyMessages(A,M).slice(0,6).map(t=>t.replace(/<[^>]+>/g,''))},{h:'Actions',col:'#b3261e',items:committeeQA(A,M)[6][2].map(t=>t.replace(/<[^>]+>/g,''))}]});
  return V; }

/* ============================ EXCEL ============================ */
async function exportXlsx(){ if(!S.M) return; busy(true,'Construction du classeur Comité…'); await tick();
  try{ const A=S.A, M=S.M, P=M.P, D=M.DQ, V=exportVisuals(A,M), wb=XLSX.utils.book_new(), CFS={}, scope=filterLabel()||'Périmètre banque (aucun filtre)';
    const sub0=`${P.P} → ${P.N} · ${scope} · source : ${M.src.source} · clé : ${M.K.lib} · généré le ${fD(new Date())}`;
    const numS=(i,pct)=>X3.cell(i,{numFmt:pct?'0.00%':'#,##0',font:{name:'Consolas',sz:9.5,color:{rgb:'0F1E3D'}},alignment:{horizontal:'right'}});
    const sheet=(name,title,comment,blocks,widths)=>{ // blocks : [{head,rows,fmts,pill,cf}] empilés
      const aoa=[[title],[comment]]; const meta=[]; blocks.forEach(b=>{ aoa.push([]); if(b.cap) aoa.push([b.cap]); const hr=aoa.length; aoa.push(b.head); const r0=aoa.length; b.rows.forEach(r=>aoa.push(r)); meta.push({b,hr,r0,cap:b.cap?hr-1:null}); });
      const w=XLSX.utils.aoa_to_sheet(aoa); const ncol=Math.max(...blocks.map(b=>b.head.length),6);
      w['A1'].s=X3.title(); w['A2'].s=X3.sub(); for(let c=1;c<ncol;c++){ w[XLSX.utils.encode_cell({r:0,c})]={t:'s',v:'',s:X3.title()}; }
      const light=blocks.reduce((s,b)=>s+b.rows.length,0)>3000; const rules=[];
      meta.forEach(({b,hr,r0,cap})=>{ if(cap!=null){ const a=XLSX.utils.encode_cell({r:cap,c:0}); w[a].s={font:{name:'Segoe UI',bold:true,sz:11,color:{rgb:'001B4D'}},border:{bottom:{style:'medium',color:{rgb:'C8A951'}}}}; }
        b.head.forEach((_,c)=>{ const a=XLSX.utils.encode_cell({r:hr,c}); if(w[a]) w[a].s=X3.hdr(); });
        b.rows.forEach((r,i)=>r.forEach((v,c)=>{ const a=XLSX.utils.encode_cell({r:r0+i,c}); if(!w[a]) return; const f=b.fmts[c]; const pc=b.pill&&b.pill(i,c,v);
          if(light){ if(f==='n') w[a].z='#,##0'; else if(f==='p') w[a].z='0.00%'; if(i===0||pc) w[a].s=pc?X3.pill(pc):undefined; return; }
          w[a].s=pc?X3.pill(pc):f==='n'?numS(i):f==='p'?numS(i,true):f==='d'?X3.cell(i,{numFmt:'dd/mm/yyyy',alignment:{horizontal:'center'}}):X3.cell(i,{alignment:{wrapText:!!b.wrap,vertical:'top'}});
          if(r.__tot) w[a].s=Object.assign({},w[a].s,{font:{name:f==='n'||f==='p'?'Consolas':'Segoe UI',bold:true,sz:10,color:{rgb:'001B4D'}},fill:{patternType:'solid',fgColor:{rgb:'F4EEDC'}}}); }));
        if(b.cf&&b.rows.length>1) b.cf.forEach(([c,color])=>rules.push({type:'dataBar',ref:colL(c)+(r0+1)+':'+colL(c)+(r0+b.rows.length),color})); });
      w['!cols']=widths.map(x=>({wch:x})); w['!merges']=[{s:{r:0,c:0},e:{r:0,c:ncol-1}},{s:{r:1,c:0},e:{r:1,c:ncol-1}}]; w['!rows']=[{hpt:30},{hpt:34}];
      const m0=meta[0]; if(blocks.length===1&&blocks[0].rows.length) w['!autofilter']={ref:'A'+(m0.hr+1)+':'+colL(blocks[0].head.length-1)+(m0.hr+1+blocks[0].rows.length)};
      CFS[name]=rules; XLSX.utils.book_append_sheet(wb,w,name); return ncol; };
    const stp=s=>s==null?'':s==='N'?'NEW':s==='X'?'EXIT':'S'+s; const stCol=v=>({S1:'2F6FD6',S2:'D18B1F',S3:'B3261E',NEW:'001B4D',EXIT:'9AA3B5'})[v]||null;
    const sevCol={CRITICAL:'8E1B14',HIGH:'C2410C',MEDIUM:'B7860B',LOW:'4B6A9B'};
    const pctN=r=>r.t==='N'?'NEW':r.t==='X'?'EXIT':r.pA<T.pctFloor?(r.dP>0?'FROM ZERO':'n.s.'):r.dP/r.pA;
    // 01
    const kp=(l,a,b,pct)=>[l,a,b,b-a,pct?null:pctCh(b,a)];
    const krows=[kp('Provision IFRS9 (XOF)',A.pA,A.pS),kp('Outstanding (XOF)',A.oA,A.oS),[ 'Coverage ratio',A.cA,A.cS,A.cS-A.cA,null],kp('Nombre d\'expositions',A.nA,A.nS),
      ...[1,2,3].flatMap(s=>[kp('Stage '+s+' — Outstanding',A.st[s].oA,A.st[s].oS),kp('Stage '+s+' — Provision',A.st[s].pA,A.st[s].pS),['Stage '+s+' — Coverage',A.st[s].cA,A.st[s].cS,(A.st[s].cS||0)-(A.st[s].cA||0),null]]),
      kp('ECL moyen par exposition',A.avgA,A.avgS)];
    const pctRow=i=>[2,6,9,12].includes(i);
    sheet('01_EXECUTIVE_SUMMARY','ECOBANK SÉNÉGAL — IFRS9 COMMITTEE INTELLIGENCE — '+P.N,sub0,[
      {cap:'Indicateurs clés',head:['Indicateur',P.P,P.N,'Δ absolu','Δ %'],rows:krows.map((r,i)=>pctRow(i)?[r[0],r[1]||0,r[2]||0,r[3]||0,null]:[r[0],Math.round(r[1]||0),Math.round(r[2]||0),Math.round(r[3]||0),r[4]]),fmts:['s','n','n','n','p']},
      {cap:'Key Committee Messages',head:['#','Message'],rows:keyMessages(A,M).map((m,i)=>[i+1,m.replace(/<[^>]+>/g,'')]),fmts:['s','s'],wrap:true},
      {cap:'Insights',head:['Constat','Détail','Donnée'],rows:insights(A,M).map(x=>[x.title,x.text.replace(/<[^>]+>/g,''),x.ev]),fmts:['s','s','s'],wrap:true}],[34,20,20,18,60]);
    { const ws=wb.Sheets['01_EXECUTIVE_SUMMARY']; krows.forEach((_,i)=>{ if(!pctRow(i)) return; for(let c=1;c<=3;c++){ const cl=ws[XLSX.utils.encode_cell({r:5+i,c})]; if(cl) cl.s=numS(i,true); } }); }
    // 02
    const brows=[['Provision '+P.P,A.nA,Math.round(A.pA),null,'Σ Impairment (Manual Overrides)'],...A.B.map(b=>[b.lib,b.n,Math.round(b.v),A.dP?b.v/A.dP:null,b.how]),['Provision '+P.N,A.nS,Math.round(A.pS),null,'Σ Impairment-pre'],['Contrôle — écart non rapproché','',Math.round(A.bRes),null,'Σ composantes − variation totale']];
    brows[0].__tot=brows[brows.length-2].__tot=true;
    sheet('02_IFRS9_BRIDGE','IFRS9 BRIDGE — '+P.P+' → '+P.N,'Décomposition additive exacte : chaque contrat est affecté à une seule composante. '+scope,[
      {cap:'Composantes',head:['Composante','Contrats','Montant (XOF)','% du net','Mode de calcul'],rows:brows,fmts:['s','n','n','p','s'],wrap:true},
      {cap:'Composantes non déterminables à partir des données disponibles',head:['Composante','Statut','Raison'],rows:[['Effet overrides / ajustements manuels '+P.N,'Non déterminable','Provision post-override N non fournie'],['Ventilation PD / LGD / EAD / scénarios','Non déterminable','Paramètres de risque absents du fichier'],['Motif des sorties','Non déterminable','Aucune colonne de motif'],['Effet change','Non déterminable','Cours de change non fournis']],fmts:['s','s','s'],wrap:true},
      {cap:'Détail des flux de stage',head:['Flux','Nature','Contrats','Outst. N-1','Outst. N','Prov. N-1','Prov. N','Δ provision','dont volume','dont couverture'],rows:['1>1','2>2','3>3','1>2','1>3','2>3','2>1','3>1','3>2'].map(m=>{ const o=A.migSub[m]; return ['S'+m[0]+' → S'+m[2],+m[2]>+m[0]?'Détérioration':+m[2]<+m[0]?'Amélioration':'Stable',o.n,Math.round(o.oA),Math.round(o.oS),Math.round(o.pA),Math.round(o.pS),Math.round(o.d),Math.round(o.vol),Math.round(o.rate)]; }),fmts:['s','s','n','n','n','n','n','n','n','n'],cf:[[7,'B3261E']]}],[46,16,18,18,18,18,18,18,16,18]);
    // 03
    const mxB=(lib,f,fmt)=>({cap:lib,head:['Stage '+P.P+' \\ '+P.N,'S1','S2','S3','SORTIE','Total'],rows:['1','2','3','N'].map(a=>{ const v=['1','2','3','X'].map(b=>a==='N'&&b==='X'?0:Math.round(f(A.MX[a+'>'+b]||{n:0,oA:0,oS:0,pA:0,pS:0,d:0}))); return [a==='N'?'NOUVEAU':'S'+a,...v,v.reduce((s,x)=>s+x,0)]; }),fmts:['s','n','n','n','n','n'],pill:(i,c)=>c===0?['2F6FD6','D18B1F','B3261E','001B4D'][i]:null});
    sheet('03_STAGE_MIGRATION','STAGE MIGRATION — '+P.P+' → '+P.N,'Net Stage Migration : '+A.verdict.toUpperCase()+' — '+A.det.n+' dégradations ('+fS(A.det.d)+') vs '+A.imp.n+' améliorations ('+fS(A.imp.d)+'). '+scope,[
      mxB('Nombre de comptes',o=>o.n),mxB('Outstanding N (sorties : Outstanding N-1)',o=>o.oS||o.oA),mxB('Provision N-1',o=>o.pA),mxB('Provision N',o=>o.pS),mxB('Δ provision',o=>o.d),
      {cap:'Gouvernance : STAGE (modèle) vs STAGE_OVERRIDE',head:['STAGE','STAGE_OVERRIDE','Contrats','Outstanding N','Provision N (Impairment-pre)'],rows:Object.entries(A.R.filter(r=>r.t!=='X'&&r.sO!=null&&r.sS!=null).reduce((o,r)=>{ const k='S'+r.sS+'|S'+r.sO; const x=o[k]||(o[k]={n:0,o:0,p:0}); x.n++; x.o+=r.oS; x.p+=r.pS; return o; },{})).sort().map(([k,x])=>[...k.split('|'),x.n,Math.round(x.o),Math.round(x.p)]),fmts:['s','s','n','n','n'],pill:(i,c,v)=>c<2?stCol(v):null}],[30,18,18,18,18,20]);
    // 04 / 05
    const topB=(L,tot)=>({head:['Rang','Client','Code client','Compte','Contrat','Stage N-1','Stage N','Outst. N-1','Outst. N','Prov. N-1','Prov. N','Δ provision','Δ %','Part brute','Contrib. Δ net','Segment','Gestionnaire'],
      rows:L.map((r,i)=>[i+1,r.nm,r.cu,r.ac,r.ct,stp(r.t==='N'?'N':r.sA),stp(r.t==='X'?'X':r.sS),Math.round(r.oA),Math.round(r.oS),Math.round(r.pA),Math.round(r.pS),Math.round(r.dP),pctN(r),tot?r.dP/tot:null,A.dP?r.dP/A.dP:null,r.sg,r.of]),
      fmts:['n','s','s','s','s','s','s','n','n','n','n','n','p','p','p','s','s'],pill:(i,c,v)=>c===5||c===6?stCol(v):null,cf:[[11,'B3261E']]});
    const pcB=inc=>{ const L=A.R.filter(r=>r.t==='C'&&r.pA>=T.pctFloor&&(inc?r.dP>0:r.dP<0)).sort((a,b)=>inc?b.dP/b.pA-a.dP/a.pA:a.dP/a.pA-b.dP/b.pA).slice(0,10);
      return {cap:'Top 10 '+(inc?'hausses':'baisses')+' en % (provision N-1 ≥ '+fX(T.pctFloor)+' XOF)',head:['Client','Code client','Contrat','Stage N-1','Stage N','Prov. N-1','Prov. N','Δ','Δ %'],rows:L.map(r=>[r.nm,r.cu,r.ct,stp(r.sA),stp(r.sS),Math.round(r.pA),Math.round(r.pS),Math.round(r.dP),r.dP/r.pA]),fmts:['s','s','s','s','s','n','n','n','p'],pill:(i,c,v)=>c===3||c===4?stCol(v):null}; };
    const cliB=(L,tot)=>({cap:'Top 20 clients',head:['Rang','Client','Code client','Contrats','Stage N-1 (max)','Stage N (max)','Outst. N-1','Outst. N','Prov. N-1','Prov. N','Δ provision','Part brute'],rows:L.slice(0,20).map((c,i)=>[i+1,c.nm,c.cu,c.n,stp(c.sAx),stp(c.sSx),Math.round(c.oA),Math.round(c.oS),Math.round(c.pA),Math.round(c.pS),Math.round(c.dP),tot?c.dP/tot:null]),fmts:['n','s','s','n','s','s','n','n','n','n','n','p'],pill:(i,c,v)=>c===4||c===5?stCol(v):null});
    const tb=topB(A.top.slice(0,50),A.incTot); tb.cap='Top 50 hausses (contrats)';
    sheet('04_TOP_INCREASES','TOP INCREASES — HAUSSES DE PROVISION','Les 10 principales hausses représentent '+fP(A.top10Share,1)+' de la hausse brute ('+fM(A.incTot)+'). Top 10 clients : '+fP(A.clTop10Share,1)+'. '+scope,[tb,cliB(A.clTop,A.incTot),pcB(true)],[7,34,13,15,17,10,10,16,16,16,16,16,11,10,11,13,24]);
    const bb=topB(A.bot.slice(0,50),A.decTot); bb.cap='Top 50 baisses (contrats)'; bb.cf=[[11,'1F7A5A']];
    sheet('05_TOP_DECREASES','TOP DECREASES — BAISSES DE PROVISION','Les 10 principales baisses représentent '+fP(A.bot10Share,1)+' de la baisse brute ('+fM(Math.abs(A.decTot))+'). Top 10 clients : '+fP(A.clBot10Share,1)+'. '+scope,[bb,cliB(A.clBot,A.decTot),pcB(false)],[7,34,13,15,17,10,10,16,16,16,16,16,11,10,11,13,24]);
    // 06
    const RC=A.R.filter(r=>r.t==='C'); const oB=(L,cap)=>({cap,head:['Rang','Client','Code client','Contrat','Stage N-1','Stage N','Outst. N-1','Outst. N','Δ Outstanding','Δ %','Δ provision'],rows:L.map((r,i)=>[i+1,r.nm,r.cu,r.ct,stp(r.sA),stp(r.sS),Math.round(r.oA),Math.round(r.oS),Math.round(r.dO),pctCh(r.oS,r.oA),Math.round(r.dP)]),fmts:['n','s','s','s','s','s','n','n','n','p','n'],pill:(i,c,v)=>c===4||c===5?stCol(v):null});
    const dimB=(k)=>({cap:'Par '+DIMS[k][0].toLowerCase(),head:[DIMS[k][0],'Outst. N-1','Outst. N','Δ Outstanding','Δ %','Δ provision','Couv. N-1','Couv. N'],rows:grp(A.R,DIMS[k][1]).sort((a,b)=>b.oS-a.oS).slice(0,40).map(g=>[g.k,Math.round(g.oA),Math.round(g.oS),Math.round(g.dO),pctCh(g.oS,g.oA),Math.round(g.d),g.cA,g.cS]),fmts:['s','n','n','n','p','n','p','p']});
    const QL={uu:'Outstanding ↑ · Provision ↑',ud:'Outstanding ↑ · Provision ↓ (atypique)',du:'Outstanding ↓ · Provision ↑ (atypique)',dd:'Outstanding ↓ · Provision ↓',fl:'Sans mouvement significatif'};
    sheet('06_OUTSTANDING','OUTSTANDING — ÉVOLUTION DE L\'EXPOSITION',`Outstanding ${P.P} ${fM(A.oA)} → ${P.N} ${fM(A.oS)} (${fSP(pctCh(A.oS,A.oA))}). ${scope}`,[
      {cap:'Quadrants (contrats rapprochés)',head:['Quadrant','Contrats','Δ Outstanding','Δ provision'],rows:Object.keys(QL).map(k=>[QL[k],A.Q[k].n,Math.round(A.Q[k].dO),Math.round(A.Q[k].d)]),fmts:['s','n','n','n']},
      dimB('st'),dimB('sg'),dimB('pr'),dimB('cy'),
      oB([...RC].sort((a,b)=>b.dO-a.dO).slice(0,20).filter(r=>r.dO>0),'Top 20 augmentations d\'Outstanding'),oB([...RC].sort((a,b)=>a.dO-b.dO).slice(0,20).filter(r=>r.dO<0),'Top 20 diminutions d\'Outstanding')],[38,18,18,18,12,16,16,16,16,10,16]);
    // 07
    const sgB=(k)=>({cap:'Par '+DIMS[k][0].toLowerCase(),head:[DIMS[k][0],'Nb N','Outst. N-1','Outst. N','Prov. N-1','Prov. N','Couv. N-1','Couv. N','% Outst. S1','% Outst. S2','% Outst. S3','Δ provision','Contrib. Δ','Dégradations'],
      rows:grp(A.R,DIMS[k][1]).sort((a,b)=>b.d-a.d).slice(0,60).map(g=>[g.k,g.nS,Math.round(g.oA),Math.round(g.oS),Math.round(g.pA),Math.round(g.pS),g.cA,g.cS,ratio(g.st[1].o,g.oS),ratio(g.st[2].o,g.oS),ratio(g.st[3].o,g.oS),Math.round(g.d),A.dP?g.d/A.dP:null,g.det]),fmts:['s','n','n','n','n','n','p','p','p','p','p','n','p','n'],cf:[[11,'B3261E']]});
    sheet('07_SEGMENTS','SEGMENTS — OUTSTANDING, PROVISION, COUVERTURE, STAGE MIX',scope,[sgB('sg'),sgB('pr'),sgB('sc'),sgB('cl')],[30,9,17,17,16,16,10,10,10,10,10,16,10,11]);
    // 08
    sheet('08_AGENCIES','AGENCIES — GESTIONNAIRES (ACCOUNT OFFICER)','Pas de colonne « Agence » dans le fichier : dimension = Account Officer du portefeuille (déduit du client pour les contrats sortis). '+scope,[
      {head:['Gestionnaire','Nb N-1','Nb N','Outst. N-1','Outst. N','Δ Outstanding','Prov. N-1','Prov. N','Δ provision','Contrib. Δ','Δ prov. S1','Δ prov. S2','Δ prov. S3','Dégradations','Améliorations','Entrées','Sorties','Couv. N'],
       rows:grp(A.R,r=>r.of).sort((a,b)=>b.d-a.d).map(g=>[g.k,g.nA,g.nS,Math.round(g.oA),Math.round(g.oS),Math.round(g.dO),Math.round(g.pA),Math.round(g.pS),Math.round(g.d),A.dP?g.d/A.dP:null,Math.round(g.st[1].p-g.stA[1].p),Math.round(g.st[2].p-g.stA[2].p),Math.round(g.st[3].p-g.stA[3].p),g.det,g.imp,g.news,g.exits,g.cS]),
       fmts:['s','n','n','n','n','n','n','n','n','p','n','n','n','n','n','n','n','p'],cf:[[8,'B3261E'],[13,'D18B1F']]}],[32,8,8,17,17,16,16,16,16,10,14,14,14,11,11,9,9,9]);
    // 09
    const WL=A.WL;
    sheet('09_WATCHLIST','IFRS9 WATCHLIST — '+WL.length+' ALERTES',['CRITICAL','HIGH','MEDIUM','LOW'].map(s=>s+' '+WL.filter(w=>w.sev===s).length).join(' · ')+' — colonne « Statut du suivi » à renseigner. '+scope,[
      {head:['Niveau','Règle','Client','Code client','Contrat','Stage N-1','Stage N','Outst. N','Prov. N-1','Prov. N','Δ provision','Constat','Responsable','Statut du suivi','Commentaire'],
       rows:WL.map(w=>[w.sev,w.rule,w.r.nm,w.r.cu,w.r.ct,stp(w.r.t==='N'?'N':w.r.sA),stp(w.r.t==='X'?'X':w.r.sS),Math.round(w.r.oS),Math.round(w.r.pA),Math.round(w.r.pS),Math.round(w.r.dP),w.why,w.owner,'À analyser','']),
       fmts:['s','s','s','s','s','s','s','n','n','n','n','s','s','s','s'],pill:(i,c,v)=>c===0?sevCol[v]:(c===5||c===6)?stCol(v):null}],[11,30,32,13,17,9,9,16,16,16,16,60,22,14,30]);
    // 10
    sheet('10_CLIENT_DETAIL','TABLE ANALYTIQUE DE COMPARAISON — '+A.R.length+' EXPOSITIONS','Une ligne par contrat (clé '+M.K.lib+'). Statut : C = rapproché, N = nouveau, X = sorti. Les données sources ne sont pas modifiées. '+scope,[
      {head:['Client','Code client','Compte','Contrat','Groupe','Segment','Produit','Secteur','Gestionnaire','Devise','Classification','FRR','Statut','Stage N-1','Stage N','STAGE_OVERRIDE N','Migration','Outst. N-1','Outst. N','Δ Outstanding','Prov. N-1','Prov. N','Δ provision','Δ %','Contrib. Δ net','Effet volume','Effet couverture'],
       rows:A.R.map(r=>[r.nm,r.cu,r.ac,r.ct,r.gp,r.sg,r.pr,r.sc,r.of,r.cy,r.cl,r.fr,r.t,stp(r.sA),stp(r.sS),stp(r.sO),r.dir==='D'?'Détérioration':r.dir==='I'?'Amélioration':r.dir==='S'?'Stable':r.t==='N'?'Nouveau':r.t==='X'?'Sorti':'Indéterminé',
         Math.round(r.oA),Math.round(r.oS),Math.round(r.dO),Math.round(r.pA),Math.round(r.pS),Math.round(r.dP),typeof pctN(r)==='number'?pctN(r):pctN(r),A.dP?r.dP/A.dP:null,Math.round(r.vol||0),Math.round(r.rate||0)]),
       fmts:['s','s','s','s','s','s','s','s','s','s','s','s','s','s','s','s','s','n','n','n','n','n','n','p','p','n','n']}],[32,12,15,17,24,12,14,18,22,7,9,6,6,8,8,9,13,16,16,16,15,15,15,10,10,14,14]);
    // 11
    const dqr=[['Lignes lues',D.sheets[0].rows,D.sheets[1].rows],['Clients distincts',D.nCurCli,D.nPrevCli],['Comptes distincts',D.nCurAcc,D.nPrevAcc],['Doublons (clé retenue)',D.dupC,D.dupP],['Stage manquant',D.nullC.stage,D.nullP.stage],['Outstanding manquant',D.nullC.out,D.nullP.out],['Provision manquante',D.nullC.imp,D.nullP.imp],['Code client manquant',D.nullC.cust,D.nullP.cust],
      ['Comptes nouveaux / sortis',D.news,D.exits],['Clients nouveaux / sortis',D.cliNew,D.cliExit],['Contrats IFRS9 absents du portefeuille',D.curNotPf,''],['Lignes portefeuille absentes de la base IFRS9',D.pfNotCur,''],['STAGE ≠ STAGE_OVERRIDE',D.ovDiff,''],['Provision > Outstanding',D.impGtOut,''],['Montants négatifs',D.neg,''],['Stage 3 sans provision',D.s3NoProv,'']];
    sheet('11_DATA_QUALITY','DATA QUALITY — SCORE '+D.score+' / 100','Contrôles sur l\'ensemble du fichier (hors filtres). Clé retenue : '+M.K.lib+'. '+M.log.join(' · '),[
      {cap:'Contrôle de cohérence des totaux',head:['Contrôle','Valeur (XOF)'],rows:[['Total provision '+P.P+' (Σ Impairment (Manual Overrides))',Math.round(D.totA)],['Total provision '+P.N+' (Σ Impairment-pre)',Math.round(D.totS)],['Variation totale',Math.round(D.dTot)],['Σ variations individuelles',Math.round(D.dIndiv)],['Écart non rapproché',Math.round(D.res)],['Outstanding '+P.P,Math.round(D.outA)],['Outstanding '+P.N,Math.round(D.outS)]],fmts:['s','n']},
      {cap:'Contrôles',head:['Contrôle',P.N,P.P],rows:dqr,fmts:['s','n','n']},
      {cap:'Score /100',head:['Critère','Poids','Taux','Pénalité'],rows:D.pen.map(x=>[x.lib,x.w,x.x,Math.round(x.pts*10)/10]),fmts:['s','n','p','s']},
      {cap:'Sélection de la clé de rapprochement',head:['Clé','Uniques N','Doublons N','Uniques N-1','Doublons N-1','Rapprochés','Retenue'],rows:M.KS.map(k=>[k.lib,k.uniqC,k.dupC,k.uniqP,k.dupP,k.match,k.id===M.K.id?'OUI':'']),fmts:['s','n','n','n','n','n','s']},
      {cap:'Traçabilité des colonnes',head:['Feuille','Champ','Colonne source'],rows:['cur','prev','pf'].filter(r=>M.roles[r]).flatMap(r=>{ const m=r==='pf'?M.E.pf.map:M.E[r].map; return Object.keys(SPEC[r].cols).map(k=>[M.roles[r].name,k,m[k]!=null?M.roles[r].header[m[k]]:'(non trouvée)']); }),fmts:['s','s','s']}],[58,18,18,14,14,14,10]);
    const raw=XLSX.write(wb,{bookType:'xlsx',type:'base64',compression:true}); const idx=n=>wb.SheetNames.indexOf(n)+1; const at=[];
    const side=(n,imgs,col)=>at.push({sheet:idx(n),cf:CFS[n]||[],imgs:imgs.filter(Boolean).map((p,i)=>({png:p,col:col,row:3+i*22,cols:9,rows:21}))});
    side('01_EXECUTIVE_SUMMARY',[V.wf,V.st,V.card],6); side('02_IFRS9_BRIDGE',[V.wf,V.flux],11); side('03_STAGE_MIGRATION',[V.heat,V.flux],7);
    side('04_TOP_INCREASES',[V.inc],18); side('05_TOP_DECREASES',[V.dec],18); side('06_OUTSTANDING',[V.out],12); side('07_SEGMENTS',[V.seg],15); side('08_AGENCIES',[V.agc],19);
    side('09_WATCHLIST',[V.wl],16); at.push({sheet:idx('09_WATCHLIST'),dv:[{ref:'N5:N'+(4+WL.length),list:['À analyser','En cours','Justifié','Escaladé','Clos']}]}); side('11_DATA_QUALITY',[],8);
    const res=await xlsxAttach(raw,at,{logo:await g3LogoBadge(),gradient:true});
    const name='ECOBANK_IFRS9_Committee_'+(P.dN?P.dN.getFullYear()+String(P.dN.getMonth()+1).padStart(2,'0'):'')+'_'+stamp()+'.xlsx';
    const zz=await JSZip.loadAsync(res.u8); const u8=await zz.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
    dl(new Blob([u8],{type:MIME.xlsx}),name); window.__lastExport=name;
    toast('✔ Classeur Comité exporté — '+wb.SheetNames.length+' feuilles');
  }catch(e){ console.error(e); toast('⚠ Export Excel : '+e.message,7000); }
  busy(false); }

/* ============================ POWERPOINT ============================ */
async function exportPptx(){ const PP=window.PptxGenJS; if(!PP||!S.M){ toast('Moteur PowerPoint indisponible'); return; }
  busy(true,'Construction de la présentation Comité…'); await tick();
  try{ const A=S.A, M=S.M, P=M.P, V=exportVisuals(A,M,true), badge=await g3LogoBadge(), pp=new PP(); pp.layout='LAYOUT_WIDE'; pp.title='IFRS9 Committee Pack — '+P.N; pp.company='Ecobank Sénégal';
    const scope=filterLabel(); const foot='ECOBANK SÉNÉGAL · IFRS9 Committee Intelligence · '+P.P+' → '+P.N+(scope?' · '+scope:'')+' · INTERNAL USE ONLY'; let n=0, s;
    const bullets=(arr,o)=>s.addText(arr.map(t=>({text:String(t).replace(/<[^>]+>/g,''),options:{bullet:{code:'25B8'},color:PX.INK,paraSpaceAfter:5}})),Object.assign({x:8.9,y:1.35,w:4,h:5.6,fontSize:10.5,fontFace:'Segoe UI',valign:'top'},o||{}));
    // couverture
    s=pp.addSlide(); s.background={color:PX.NV};
    s.addShape(pp.ShapeType.ellipse,{x:8.6,y:-2.2,w:7,h:7,fill:{color:PX.LM,transparency:86},line:{color:PX.LM,transparency:100}});
    s.addShape(pp.ShapeType.ellipse,{x:10.4,y:3.6,w:4.6,h:4.6,fill:{color:'2F6FD6',transparency:78},line:{color:'2F6FD6',transparency:100}});
    if(badge) s.addImage({data:badge,x:0.7,y:0.7,w:3.1,h:1.13});
    s.addText('IFRS9 Committee Intelligence',{x:0.7,y:2.45,w:11,h:0.9,fontSize:38,bold:true,color:'FFFFFF',fontFace:'Segoe UI'});
    s.addShape(pp.ShapeType.rect,{x:0.72,y:3.4,w:1.4,h:0.07,fill:{color:PX.LM}});
    s.addText('Pourquoi la provision IFRS9 de '+P.N.toLowerCase()+' diffère-t-elle de celle de '+P.P.toLowerCase()+' ?',{x:0.7,y:3.6,w:11,h:0.5,fontSize:18,color:PX.L2,fontFace:'Segoe UI'});
    s.addText('Provision '+P.n+' : '+fM(A.pS)+' XOF · '+fS(A.dP)+' ('+fSP(pctCh(A.pS,A.pA))+') vs '+P.p,{x:0.7,y:4.25,w:11,h:0.5,fontSize:16,color:'DCE6F7',fontFace:'Segoe UI'});
    s.addText('Ecobank Sénégal · Comité IFRS9'+(scope?' · '+scope:' · périmètre banque')+' · '+fD(new Date()),{x:0.7,y:6.6,w:11.5,h:0.4,fontSize:11,color:'AFC0E3',fontFace:'Segoe UI'});
    // 1 synthèse
    s=pp.addSlide(); pptBand(pp,s,'Executive Summary','quoi, combien, pourquoi',foot,++n,badge);
    pptKpis(pp,s,[['Provision '+P.n,fM(A.pS),PX.NV,P.p+' : '+fM(A.pA)],['Variation',fS(A.dP),'B3261E',fSP(pctCh(A.pS,A.pA))+' MoM'],['Outstanding',fM(A.oS),PX.BL,fS(A.dO)+' ('+fSP(pctCh(A.oS,A.oA))+')'],['Coverage',fP(A.cS,2),PX.LM,fBp(A.cS-A.cA)+' vs '+fP(A.cA,2)],['Expositions',fN(A.nS),PX.MU,fSN(A.nS-A.nA)+' vs '+P.p]],1.3);
    if(V.wf) s.addImage({data:V.wf,x:0.45,y:2.6,w:8.2,h:3.76}); bullets(keyMessages(A,M).slice(0,5),{y:2.6,h:4.4,fontSize:9.5});
    // 2 bridge
    s=pp.addSlide(); pptBand(pp,s,'IFRS9 Bridge','de la provision '+P.p+' à la provision '+P.n+' — décomposition exacte',foot,++n,badge);
    if(V.wf) s.addImage({data:V.wf,x:0.45,y:1.3,w:7.4,h:3.39});
    const br=[['Provision '+P.p,fN(A.nA),fM(A.pA),''],...A.B.map(b=>[b.lib,fN(b.n),fS(b.v),A.dP?fP(b.v/A.dP,0):'']),['Provision '+P.n,fN(A.nS),fM(A.pS),'']]; br[br.length-1].__total=true;
    pptTable(s,['Composante','Contrats','Montant','% net'],br,{x:8.05,y:1.3,w:4.8,colW:[2.65,0.7,0.85,0.6],right:[1,2,3],fs:8.5,rowH:0.34});
    s.addText('Non déterminable à partir des données disponibles : effet des overrides '+P.n+', ventilation PD / LGD / scénarios, motif des sorties, effet change. Écart de rapprochement : '+fX(A.bRes)+' XOF.',{x:0.5,y:4.9,w:7.3,h:0.9,fontSize:10,color:PX.MU,fontFace:'Segoe UI',italic:true});
    // 3 stages
    s=pp.addSlide(); pptBand(pp,s,'Vue par stage','la hausse vient-elle du Stage 2 / 3 ?',foot,++n,badge);
    pptTable(s,['Stage','Nb N-1','Nb N','Outst. N-1','Outst. N','Prov. N-1','Prov. N','Couv. N-1','Couv. N','Δ prov.','Part Δ'],[...[1,2,3].map(k=>{ const o=A.st[k]; return ['S'+k,fN(o.nA),fN(o.nS),fM(o.oA),fM(o.oS),fM(o.pA),fM(o.pS),fP(o.cA,2),fP(o.cS,2),fS(o.dP),fP(A.dP?o.dP/A.dP:null,0)]; }),Object.assign(['Total',fN(A.nA),fN(A.nS),fM(A.oA),fM(A.oS),fM(A.pA),fM(A.pS),fP(A.cA,2),fP(A.cS,2),fS(A.dP),'100 %'],{__total:true})],
      {y:1.3,right:[1,2,3,4,5,6,7,8,9,10],fs:10,rowH:0.36,pills:(ri,ci)=>ci===0&&ri<3?['2F6FD6','D18B1F','B3261E'][ri]:null});
    if(V.st) s.addImage({data:V.st,x:0.45,y:3.25,w:5.6,h:2.95}); if(V.out) s.addImage({data:V.out,x:6.3,y:3.25,w:5.6,h:2.95});
    // 4 migration
    s=pp.addSlide(); pptBand(pp,s,'Stage Migration','Net Stage Migration : '+A.verdict.toUpperCase()+' — '+fN(A.det.n)+' dégradations vs '+fN(A.imp.n)+' améliorations',foot,++n,badge);
    if(V.heat) s.addImage({data:V.heat,x:0.45,y:1.3,w:6.1,h:3.21}); if(V.flux) s.addImage({data:V.flux,x:6.75,y:1.3,w:6.1,h:3.5});
    pptTable(s,['Flux','Comptes','Outst. N','Prov. N-1','Prov. N','Δ prov.'],['1>2','1>3','2>3','2>1','3>1','3>2'].map(m=>{ const o=A.migSub[m]; return ['S'+m[0]+' → S'+m[2],fN(o.n),fM(o.oS),fM(o.pA),fM(o.pS),fS(o.d)]; }),{x:0.5,y:4.7,w:6.05,colW:[1.2,0.9,1,1,1,0.95],right:[1,2,3,4,5],fs:9,rowH:0.3,pills:(ri,ci)=>ci===0?(ri<3?'B3261E':'1F7A5A'):null});
    const ov=ovStats(A.R); if(ov.n) s.addText('Gouvernance : '+fN(ov.n)+' contrats ont un STAGE différent de STAGE_OVERRIDE (dont '+fN(ov.n21)+' S2 modèle / S1 override, '+fM(ov.p21)+' de provision Impairment-pre). Impact d\'application des overrides : non déterminable.',{x:6.8,y:5.0,w:6,h:1.2,fontSize:10,color:'7A5A00',fontFace:'Segoe UI',fill:{color:'FFF8E6'}});
    // 5-6 top
    const topSlide=(inc)=>{ const L=(inc?A.top:A.bot).slice(0,14); s=pp.addSlide(); pptBand(pp,s,inc?'Top Increases':'Top Decreases','Les 10 principales '+(inc?'hausses':'baisses')+' représentent '+fP(inc?A.top10Share:A.bot10Share,0)+' de la '+(inc?'hausse':'baisse')+' brute ('+fM(Math.abs(inc?A.incTot:A.decTot))+')',foot,++n,badge);
      pptTable(s,['#','Client','Contrat','Stages','Prov. N-1','Prov. N','Δ prov.','Δ %'],L.map((r,i)=>[i+1,(r.nm||r.cu).slice(0,26),r.ct,(r.t==='N'?'NEW':'S'+r.sA)+'→'+(r.t==='X'?'EXIT':'S'+r.sS),fM(r.pA),fM(r.pS),fS(r.dP),r.t==='N'?'NEW':r.t==='X'?'EXIT':r.pA<T.pctFloor?'FROM ZERO':fSP(r.dP/r.pA,0)]),{x:0.5,y:1.3,w:7.6,colW:[0.35,2.2,1.45,0.85,0.75,0.75,0.75,0.5],right:[4,5,6,7],fs:8.5,rowH:0.33});
      const im=inc?V.inc:V.dec; if(im) s.addImage({data:im,x:8.3,y:1.3,w:4.6,h:Math.min(5.6,4.6*0.75)}); };
    topSlide(true); topSlide(false);
    // 7 segments / gestionnaires
    s=pp.addSlide(); pptBand(pp,s,'Où ? Segments et gestionnaires','contribution à la variation de provision',foot,++n,badge);
    if(V.seg) s.addImage({data:V.seg,x:0.45,y:1.35,w:6.1,h:3.4}); if(V.agc) s.addImage({data:V.agc,x:6.75,y:1.35,w:6.1,h:5.2});
    const sg=grp(A.R,r=>r.sg).sort((a,b)=>b.d-a.d);
    pptTable(s,['Segment','Outst. N','Prov. N','Couv. N','Δ prov.'],sg.map(g=>[g.k,fM(g.oS),fM(g.pS),fP(g.cS,2),fS(g.d)]),{x:0.5,y:4.95,w:6.05,colW:[1.85,1.1,1.1,0.9,1.1],right:[1,2,3,4],fs:9.5,rowH:0.3});
    // 8 watchlist
    const W=A.WL, WC=W.filter(w=>w.sev==='CRITICAL'||w.sev==='HIGH').sort((a,b)=>SEVO[a.sev]-SEVO[b.sev]||Math.abs(b.r.dP)-Math.abs(a.r.dP)).slice(0,13);
    s=pp.addSlide(); pptBand(pp,s,'Risk Watchlist','mouvements nécessitant une attention particulière',foot,++n,badge);
    pptKpis(pp,s,['CRITICAL','HIGH','MEDIUM','LOW'].map(v=>[v,fN(W.filter(w=>w.sev===v).length),{CRITICAL:'8E1B14',HIGH:'C2410C',MEDIUM:'B7860B',LOW:'4B6A9B'}[v],'alertes']),1.3);
    pptTable(s,['Niveau','Règle','Client','Contrat','Δ prov.','Responsable'],WC.map(w=>[w.sev,w.rule,(w.r.nm||w.r.cu).slice(0,26),w.r.ct,fS(w.r.dP),w.owner]),{y:2.6,colW:[1.1,2.6,3.2,1.9,1.2,2.33],right:[4],fs:8.5,rowH:0.31,pills:(ri,ci)=>ci===0?{CRITICAL:'8E1B14',HIGH:'C2410C'}[WC[ri].sev]:null});
    // 9 messages + actions
    s=pp.addSlide(); pptBand(pp,s,'Key Committee Messages & Actions','générés à partir des données',foot,++n,badge);
    if(V.card) s.addImage({data:V.card,x:1.4,y:1.25,w:10.5,h:Math.min(5.85,10.5*0.6)});
    // 10 data quality
    const D=M.DQ; s=pp.addSlide(); pptBand(pp,s,'Data Quality','score '+D.score+' / 100 — traçabilité et contrôle des totaux',foot,++n,badge);
    pptKpis(pp,s,[['Score qualité',D.score+' / 100',PX.NV,'voir calcul'],['Provision '+P.p,fM(D.totA),PX.BL,'Σ Manual Overrides'],['Provision '+P.n,fM(D.totS),PX.BL,'Σ Impairment-pre'],['Écart non rapproché',fX(D.res)+' XOF',PX.GR,'Σ individuel = total'],['Clé',M.K.lib,PX.MU,fN(M.K.match)+' rapprochés']],1.3);
    pptTable(s,['Contrôle','Valeur'],[['Doublons (clé)',fN(D.dupC+D.dupP)],['Stage / Outstanding / provision manquants',fN(D.nullC.stage+D.nullC.out+D.nullC.imp+D.nullP.stage+D.nullP.out+D.nullP.imp)],['Comptes nouveaux / sortis',fN(D.news)+' / '+fN(D.exits)],['Clients nouveaux / sortis',fN(D.cliNew)+' / '+fN(D.cliExit)],['STAGE ≠ STAGE_OVERRIDE',fN(D.ovDiff)],['Lignes portefeuille hors base IFRS9',fN(D.pfNotCur)+' ('+fM(D.pfNotCurOut)+')'],['Outstanding IFRS9 = Ototal portefeuille',fP(D.otEq,1)],['Provision > Outstanding',fN(D.impGtOut)]],{y:2.6,w:8,colW:[5.2,2.8],right:[1],fs:10,rowH:0.38});
    // clôture
    s=pp.addSlide(); s.background={color:PX.NV}; if(badge) s.addImage({data:badge,x:5.1,y:2.2,w:3.1,h:1.13}); s.addText('IFRS9 Committee Intelligence · Ecobank Sénégal',{x:0,y:3.8,w:13.33,h:0.5,fontSize:16,color:'DCE6F7',align:'center',fontFace:'Segoe UI'});
    const name='ECOBANK_IFRS9_Committee_Pack_'+stamp()+'.pptx'; await pp.writeFile({fileName:name}); window.__lastExport=name; toast('✔ Présentation exportée — '+(n+2)+' diapositives');
  }catch(e){ console.error(e); toast('⚠ Export PowerPoint : '+e.message,7000); }
  busy(false); }

/* ============================ PDF (impression) ============================ */
async function buildPrint(){ if(!S.M) return; const pa=$('#printArea'); pa.innerHTML=''; S.printing=true;
  Object.assign(pa.style,{display:'block',position:'absolute',left:'-12000px',top:'0',width:'1400px'}); const anim=Chart.defaults.animation; Chart.defaults.animation=false;
  const keep=S.charts; S.charts=[];
  const parts=[['exec','Executive Summary'],['bridge','IFRS9 Bridge'],['mig','Stage Migration'],['inc','Top Increases'],['dec','Top Decreases'],['wl','Risk Watchlist'],['pack','Key Messages & Actions']];
  const opt=Object.assign({},S.opt); S.opt.tm='ct'; S.opt.wsev=''; S.opt.wru='';
  for(const [k,t] of parts){ const pg=document.createElement('div'); pg.className='pg'; pg.innerHTML=`<div class="phead"><img src="${LOGO_SRC}"><span class="tt">ECOBANK SÉNÉGAL · IFRS9 COMMITTEE — ${t.toUpperCase()}</span><span class="ss">${S.M.P.P} → ${S.M.P.N}${filterLabel()?' · '+esc(filterLabel()):''}</span></div>`;
    const body=document.createElement('div'); pg.appendChild(body); pa.appendChild(pg); PG[k](body,'p_'+k+'_');
    body.querySelectorAll('.toolbar .seg,button').forEach(b=>b.remove()); body.querySelectorAll('.tw').forEach(t=>{ t.style.maxHeight='none'; });
    if(k==='wl') body.querySelectorAll('tbody').forEach(tb=>{ if(tb.rows.length>40) [...tb.rows].slice(40).forEach(r=>r.remove()); }); }
  await new Promise(r=>setTimeout(r,60));
  S.charts.forEach(c=>{ try{ const im=new Image(); im.src=c.toBase64Image(); im.style.width='100%'; im.style.height='100%'; const box=c.canvas.parentNode; c.destroy(); box.innerHTML=''; box.appendChild(im); }catch(e){} });
  S.charts=keep; S.opt=opt; Chart.defaults.animation=anim; S.printing=false; Object.assign(pa.style,{display:'',position:'',left:'',top:'',width:''}); }
async function printPack(){ busy(true,'Préparation du PDF Comité…'); await tick(); try{ await buildPrint(); }catch(e){ console.error(e); } busy(false); setTimeout(()=>window.print(),80); }

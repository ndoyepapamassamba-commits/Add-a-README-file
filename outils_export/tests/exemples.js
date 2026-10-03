// Génère le jeu d'exemples : 7 variantes Excel Risk Intelligence, Word, PowerPoint et PDF (même source riModel).
// Usage : APP=… FIXDIR=… FIX=N_ OUT=exemples_risk_intelligence node outils_export/tests/exemples.js <retour_semantique.xlsx>
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright'); const fs=require('fs'); const D=__dirname; const OUT=require('path').resolve(process.env.OUT||'exemples'); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1600,height:1000},acceptDownloads:true}); const p=await ctx.newPage();
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await require('./tload.js')(p,fs,D,'apex36.html'); await p.waitForTimeout(3000);
 if(process.argv[2]){ const ts=fs.readFileSync(process.argv[2]).toString('base64');
   await p.evaluate(async b64=>{ const s=atob(b64),u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); await tsImport(new File([u],'retour.xlsx')); },ts); }
 const dl=async(fn,arg)=>{ const [d]=await Promise.all([p.waitForEvent('download',{timeout:240000}),p.evaluate(fn,arg)]); const n=OUT+'/'+d.suggestedFilename(); await d.saveAs(n); console.log('DL',d.suggestedFilename(),fs.statSync(n).size); };
 for(const v of ['full','exec','risk','watch','act','aud','data']) await dl(v=>riExport(v),v);
 await dl(()=>riDoc('ppt')); await dl(()=>riDoc('doc'));
 const html=await p.evaluate(async()=>{ const m=await riModel(); return expScrubTxt(riHtml(m,false)); });
 const q=await ctx.newPage(); await q.setContent(html,{waitUntil:'load'}); const stamp=await p.evaluate(()=>dcStamp());
 await q.pdf({path:OUT+'/ECOBANK_Credit_Risk_Intelligence_'+stamp+'.pdf',format:'A4',landscape:true,printBackground:true}); console.log('PDF ok');
 console.log('Agent :',await p.evaluate(()=>EXPORT_AGENT.log.slice(-9).filter(e=>e.warn.length).map(e=>e.name+' : '+e.warn.join('; ')).join('\n')||'tous conformes'));
 await b.close(); })();

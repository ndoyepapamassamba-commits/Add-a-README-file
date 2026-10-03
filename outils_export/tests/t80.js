// export du lot enrichi depuis APEX (async tsLot) sur les arrêtés de démonstration
const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright'); const fs=require('fs'); const D=__dirname; const OUT=require('path').resolve(process.env.OUT||'jx2'); fs.mkdirSync(OUT,{recursive:true});
(async()=>{ const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:1600,height:1000},acceptDownloads:true}); const p=await ctx.newPage();
 p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await require('./tload.js')(p,fs,D,'apex36.html'); await p.waitForTimeout(3000);
 console.log('JEV auto:',await p.evaluate(()=>JEV.res?('ok '+JEV.res.per+' arrêtés'):'absent'));
 const [d]=await Promise.all([p.waitForEvent('download',{timeout:240000}),p.evaluate(()=>tsLot())]);
 const n=OUT+'/'+d.suggestedFilename(); await d.saveAs(n); console.log('DL',d.suggestedFilename(),fs.statSync(n).size);
 await b.close(); })();

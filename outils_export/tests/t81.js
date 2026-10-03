const {chromium}=require(process.env.PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright'); const fs=require('fs'); const D=__dirname;
(async()=>{ const b=await chromium.launch(); const p=await (await b.newContext({acceptDownloads:true})).newPage(); p.on('pageerror',e=>console.log('ERR',e.message.slice(0,300)));
 await require('./tload.js')(p,fs,D,'apex36.html'); await p.waitForTimeout(2000);
 const ts=fs.readFileSync(process.argv[2]).toString('base64');
 await p.evaluate(async b64=>{ const s=atob(b64),u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); await tsImport(new File([u],'retour.xlsx')); },ts);
 console.log(await p.evaluate(async()=>{ const m=await riModel(); const pf=TSX.pf||{}; return JSON.stringify({pl:pf.phrase_lecture,lecture:m.lecture,ins:m.ins.map(x=>[x.n,typeof x.n,x.imp,x.lecture]),scen:(m.scen||[]).map(x=>[x.l,x.n,Math.round(x.enc/1e6),Math.round(x.base/1e6),Math.round(x.str/1e6)]),paires:m.paires.map(x=>[x.a,x.score,x.pNom,Math.round(x.enc/1e6)]),ts:Object.values(TSX.byRef).slice(0,3).map(o=>[o.ref,o.action,o.famille,JSON.stringify(o.scen)])}); }));
 await b.close(); })();

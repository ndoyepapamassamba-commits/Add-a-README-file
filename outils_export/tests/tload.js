// chargement commun : 9 arrêtés archivés + le dernier affiché
// APP = chemin de l'application, FIXDIR = dossier des arrêtés de test, FIX = préfixe (M_ synthétiques, N_ noms de groupe fictifs)
module.exports=async function(p,fs,D,file){
 const FD=process.env.FIXDIR||D;
 await p.goto('file://'+require('path').resolve(process.env.APP||(D+'/'+(file||'apex36.html')))); await p.waitForTimeout(2500);
 for(const f of [1,2,3,4,5,6,7,8,9].map(m=>(process.env.FIX||'M_')+'0'+m+'.xlsx')){ const b64=fs.readFileSync(FD+'/'+f).toString('base64'); await p.evaluate(async([b64,f])=>{ const s=atob(b64),u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); const wb=XLSX.read(u,{type:'array',cellDates:true}); const snap=hsFromWorkbook(wb,f); await hsPut(snap); await arSave(snap,{name:f,buf:u.buffer}); },[b64,f]); }
 await p.evaluate(()=>hsRefresh&&hsRefresh());
 const b64=fs.readFileSync(FD+'/'+(process.env.FIX||'M_')+'09.xlsx').toString('base64'); await p.evaluate(([b64,f])=>{ const s=atob(b64),u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); readWorkbook(new File([u],f),true); },[b64,(process.env.FIX||'M_')+'09.xlsx']); await p.waitForTimeout(12000);
};

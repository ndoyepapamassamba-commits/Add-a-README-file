/* =====================================================================
   90 · démarrage : données préchargées ou dépôt d'un classeur
   ===================================================================== */
async function loadSource(src){
  busy(true,'Rapprochement '+'N / N-1 et calcul des indicateurs…'); await tick();
  try{ const M=buildModel(src); S.M=M; S.f={}; S.opt={}; M.Afull=compute(M.R);
    const P=M.P; $('#perLine').innerHTML=P.P+' → <b>'+P.N+'</b>'; $('#brandPer').textContent=P.P+' → '+P.N;
    $('#srcName').textContent=src.source; $('#srcInfo').innerHTML=`${fN(M.roles.cur.n)} lignes N · ${fN(M.roles.prev.n)} lignes N-1${M.roles.pf?' · '+fN(M.roles.pf.n)+' portefeuille':''}<br>Clé : ${esc(M.K.lib)} · DQ ${M.DQ.score}/100`;
    document.title='Ecobank Sénégal — IFRS9 Committee Intelligence — '+P.N;
    buildFilters(); $('#drop').hidden=true; const h=(location.hash||'').slice(1); if(PAGES.some(p=>p[0]===h)) S.page=h;
    refresh(); toast('✔ '+fN(M.R.length)+' expositions rapprochées — écart de rapprochement '+fX(M.DQ.res)+' XOF');
  }catch(e){ console.error(e); $('#drop').hidden=false; $('#dropMsg').textContent='⚠ '+e.message; toast('⚠ '+e.message,7000); }
  busy(false); }
function initDrop(){ const z=$('#zone'), f=$('#file');
  z.onclick=()=>f.click(); $('#btnLoad').onclick=()=>f.click();
  f.onchange=async()=>{ if(!f.files[0]) return; busy(true,'Lecture du classeur…'); await tick(); try{ const src=await readWorkbookFile(f.files[0]); await loadSource(src); }catch(e){ busy(false); toast('⚠ '+e.message,7000); } f.value=''; };
  ['dragover','dragenter'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); z.classList.add('hv'); }));
  ['dragleave','drop'].forEach(ev=>document.addEventListener(ev,e=>{ e.preventDefault(); z.classList.remove('hv'); }));
  document.addEventListener('drop',async e=>{ const file=e.dataTransfer&&e.dataTransfer.files[0]; if(!file) return; busy(true,'Lecture du classeur…'); await tick(); try{ await loadSource(await readWorkbookFile(file)); }catch(err){ busy(false); toast('⚠ '+err.message,7000); } }); }
async function boot(){
  $('#logoImg').src=LOGO_SRC; $('#logoImg2').src=LOGO_SRC; buildNav(); initDrop();
  $('#dClose').onclick=closeDrawer; $('#veil').onclick=closeDrawer; document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
  $('#btnMethod').onclick=()=>{ if(S.M) openDrawer('MÉTHODOLOGIE','Calculation Methodology','Règles de calcul de chaque indicateur',methodology()); };
  $('#btnXlsx').onclick=()=>exportXlsx(); $('#btnPpt').onclick=()=>exportPptx(); $('#btnPdf').onclick=()=>printPack();
  let src=null; try{ src=await readEmbedded(); }catch(e){ console.error(e); }
  if(src) await loadSource(src); else $('#drop').hidden=false;
}
window.addEventListener('DOMContentLoaded',boot);

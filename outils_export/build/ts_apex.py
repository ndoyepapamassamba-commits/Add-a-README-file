# Intégration APEX des capacités avancées (lecture, lot enrichi) — appelé par inject_ri.py
def apply(s, rep):
    # 1 · lecture des lignes : libellé (colonne 7) et lignes portefeuille séparées
    rep("(raw[ref]=raw[ref]||{c:'',s:'',a:{}}).a[q]={rep,conf:r[4]===''?null:+r[4],type:r[2]};",
        "(raw[ref]=raw[ref]||{c:'',s:'',a:{}}).a[q]={rep,conf:r[4]===''?null:+r[4],type:r[2],lib:r[6]||'',probs:r[5]||''};")
    rep("  Object.entries(raw).forEach(([ref,v])=>{ TSX.byRef[ref]=tsAnalyse(ref,v.c,v.s,v.a,by[ref]); }); TSX.n=Object.keys(TSX.byRef).length; }",
        "  TSX.pf=null; Object.entries(raw).forEach(([ref,v])=>{ if(ref==='__PORTEFEUILLE__'){ TSX.pf=v.a; return; } TSX.byRef[ref]=tsAnalyse(ref,v.c,v.s,v.a,by[ref]); }); TSX.n=Object.keys(TSX.byRef).length; }")
    # 2 · analyse : famille avec repli, action, données sensibles, contrôle d'ordre, stabilité, scénarios, date par composants
    rep("    o.enAttente=!A.motif; o.statut=o.enAttente?",
        r"""    if(A.famille_motif){ o.famille=({capacite:'Capacité de remboursement',volonte:'Volonté de payer',technique:'Incident technique',externe:'Événement externe',indetermine:'Indéterminé'})[A.famille_motif.rep]||A.famille_motif.rep;
      if(o.cMotif!=null&&o.cMotif<TS_CONF&&A.famille_motif.conf>=0.9&&A.famille_motif.rep!=='indetermine'){ o.motifFamille=true; o.revue=o.revue.filter(x=>!/^motif incertain/.test(x)); } }
    if(A.action_recommandee){ o.action=({verification_reglement:'Vérifier le règlement annoncé',relance_gestionnaire:'Relance du gestionnaire',visite_terrain:'Visite terrain',mise_en_demeure:'Mise en demeure',etude_restructuration:'Étude de restructuration',realisation_garantie:'Réalisation de la garantie',transfert_contentieux:'Transfert au contentieux',surveillance_simple:'Surveillance simple'})[A.action_recommandee.rep]||A.action_recommandee.rep; o.cAction=A.action_recommandee.conf; }
    if(A.donnees_sensibles){ o.pSensible=+A.donnees_sensibles.rep; if(o.pSensible>=TS_SEUIL) o.qc.push('Donnée personnelle sensible : à anonymiser avant diffusion'); }
    if(A.motif_inv&&A.motif&&A.motif_inv.rep!==A.motif.rep) o.revue.push('contrôle d\'ordre : le motif change quand les options sont inversées');
    if(A.routage_inv&&A.routage&&A.routage_inv.rep!==A.routage.rep) o.revue.push('contrôle d\'ordre : l\'orientation change quand les options sont inversées');
    if(A.stabilite){ o.stabilite=A.stabilite.conf; o.stable=A.stabilite.rep==='stable'; if(!o.stable) o.revue.push('instabilité : le jugement change d\'un tirage à l\'autre'); }
    o.scen={}; Object.keys(A).filter(k=>/^scen_/.test(k)).forEach(k=>{ o.scen[k.slice(5)]=+A[k].rep; });
    if(!o.date&&A.date_jour&&A.date_jour.rep!=='non_precise'&&(A.date_jour.conf||0)>=0.6){ const MO=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'], j=+String(A.date_jour.rep).slice(1), mm=A.date_mois;
      let y=ar.getFullYear(), mo=ar.getMonth(); if(mm&&MO.includes(mm.rep)&&(mm.conf||0)>=0.6){ mo=MO.indexOf(mm.rep); if(mo<ar.getMonth()) y++; } else if(mm&&mm.rep==='mois_prochain'&&(mm.conf||0)>=0.6){ mo++; } else if(j<=ar.getDate()) mo++;
      const dc=new Date(y,mo,j); if(dc.getDate()===j){ o.date=dc; o.dateSource='composants'; o.ecart=bas?Math.round((+dc-+bas)/DAY):null; o.position=bas&&dc>bas?'Après la bascule':'Avant la bascule'; o.qc=o.qc.filter(x=>!/date illisible/.test(x)); if(o.position==='Après la bascule') o.qc.push('Date promise '+o.ecart+' j après la bascule en douteux'); } }
    o.enAttente=!A.motif; o.statut=o.enAttente?""")
    # 3 · lot enrichi : état riche (libellés calculés par le code) + appel portefeuille
    i=s[0].index('function tsLot('); j=s[0].index('/* feuilles TypeSafe ajoutées',i)
    s[0]=s[0][:i]+r"""async function tsLot(){ let R=[]; try{ const C=crmInit(); if(!C.rows.length) crmFromActe7(); R=C.rows.filter(r=>r.t); }catch(e){}
  let m=null; try{ m=await riModel(); }catch(e){ console.warn('lot',e); }
  const byC=new Map(m?m.cl.map(o=>[String(o.clc),o]):[]);
  const traj=o=>{ if(!o||!o.trend) return 'non renseignée'; const t=o.trend.filter(v=>v!=null); if(t.length<2) return 'historique insuffisant'; const a=t[t.length-1], b=t[t.length-2], c=t[Math.max(0,t.length-4)];
    if(b===0&&a>0) return 'entré en impayé ce mois-ci'; if(a>b*1.1&&a>c*1.1) return 'impayés en hausse depuis plusieurs mois'; if(a>b*1.1) return 'impayés en hausse ce mois-ci'; if(a<b*0.9) return 'impayés en baisse'; return 'impayés stables'; };
  const taille=e=>e>=1e9?'grande exposition (≥ 1 Md XOF)':e>=1e8?'exposition moyenne (100 M à 1 Md XOF)':'petite exposition (< 100 M XOF)';
  const gar=c=>{ const a=S.agg&&S.agg.clients&&S.agg.clients.get(c); if(!a) return 'non renseignée'; return a.enBlanc?'sans garantie réelle (en blanc)':(a.garCov||0)>=1?'garantie réelle couvrant l\'encours':'garantie réelle partielle'; };
  const dossiers=R.map(r=>{ const t=TSX.byRef[String(r.ref).trim()], o=byC.get(String(r.clc)); return {ref:r.ref,client:r.client,segment:r.seg,gestionnaire:r.off,encours:Math.round(o?o.enc:(r.montant||0)),impaye:Math.round(r.montant||0),jours:r.t.jours,
      bascule:r.t.d90?new Date(r.t.d90).toISOString().slice(0,10):null,commentaire:t?t.commentaire:'',statut_fichier:t?t.statutFichier:'À faire',plan:String(r.t.planText||r.t.text||'').slice(0,600),
      secteur:(o&&o.sector)||'',garantie:gar(r.clc),taille:taille(o?o.enc:(r.montant||0)),trajectoire:traj(o)}; });
  const ins=m?m.ins.map(x=>({id:x.n,titre:x.t,texte:x.big+' — '+x.p})):[];
  // noms cités dans les constats : masqués par l'enrichisseur en mode --anonymiser
  const noms=m?[...new Set(m.cl.map(o=>o.rel).concat(m.off.map(x=>x.k)).filter(n=>n&&String(n).length>2&&ins.some(x=>(x.titre+' '+x.texte).includes(n))))]:[];
  const GEN=/^(SOCIETE|STE|SARL|SUARL|SAS|GIE|ETABLISSEMENTS|ETS|GROUPE|COMPAGNIE|ENTREPRISE|AFRICAINE|SENEGAL|SENEGALAISE|INTERNATIONAL|SERVICES|INDUSTRIES|TRADING|HOLDING|COMMUNE|MINISTERE|AGENCE|OFFICE|NATIONALE|NATIONAL|REGIONAL|CENTRE)$/;
  const tok=n=>String(n||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/[^A-Z0-9]+/).filter(w=>w.length>=4&&!GEN.test(w)&&!/^\d+$/.test(w));
  const top=m?[...m.cl].sort((a,b)=>b.enc-a.enc).slice(0,60):[], paires=[];
  for(let a=0;a<top.length&&paires.length<24;a++){ const A=new Set(tok(top[a].rel)); for(let b=a+1;b<top.length&&paires.length<24;b++){ if(tok(top[b].rel).some(w=>A.has(w))) paires.push({id:'p'+(paires.length+1),a:top[a].rel,b:top[b].rel}); } }
  const lot={app:'APEX Impayés 30-90j',arrete:S.arrete?S.arrete.toISOString().slice(0,10):null,genere:new Date().toISOString(),
    avertissement:'Données clients : envoi à l\'API seulement après validation Conformité, sinon anonymiser (option --anonymiser).',dossiers,portefeuille:{insights:ins,paires,noms}};
  dcDl(new Blob([JSON.stringify(lot,null,1)],{type:'application/json'}),'Lot_TypeSafe_Impayes_'+dcStamp()+'.json');
  toast('Lot exporté : '+dossiers.length+' dossiers, '+ins.length+' constats, '+paires.length+' paires à vérifier — à enrichir sur le poste connecté',5000); }

"""+s[0][j:]
    # 5 · export Impayés : colonnes avancées et feuille « Stress narratif » (montants calculés par le code)
    rep("/* feuilles TypeSafe ajoutées à l'export Impayés (crmExportExcel) */\n",
        "/* feuilles TypeSafe ajoutées à l'export Impayés (crmExportExcel) */\nconst TS_SCEN={retard_paiements_etat:'Paiements de l\\'État',campagne_agricole:'Campagne agricole',choc_hydrocarbures:'Hydrocarbures',hausse_taux:'Taux BCEAO',choc_sanitaire:'Crise sanitaire',perte_donneur_ordre:'Perte d\\'un donneur d\\'ordre',prix_importation:'Prix à l\\'importation',gouvernance_fraude:'Gouvernance / fraude'};\n")
    rep("'Incohérence (proba.)','Statut proposé','Statut retenu','Revue analyste'];",
        "'Incohérence (proba.)','Statut proposé','Statut retenu','Famille de motif','Action recommandée','Stabilité','Scénarios exposés (≥ 0,6)','Revue analyste'];")
    rep("t.pInc,t.statutTs||'',t.statut,t.revue.join(' ; ')]);",
        "t.pInc,t.statutTs||'',t.statut,t.famille||'',t.action||'',t.stabilite!=null?t.stabilite:'',Object.entries(t.scen||{}).filter(([k,v])=>v>=0.6).sort((a,b)=>b[1]-a[1]).map(([k,v])=>(TS_SCEN[k]||k)+' '+Math.round(100*v)+' %').join(' ; '),t.revue.join(' ; ')]);")
    rep("  let L=tbl(ws,3,h,rows,['s','w','s','w','s','%','%','s','%','%','s','p','w']); ws['!rows']=[{hpt:30},{hpt:30},{hpt:6},{hpt:36},...rows.map(()=>({hpt:42}))]; finish(ws,'Retours gestionnaires',L,h.length-1,[16,26,18,54,20,10,11,11,11,11,18,18,34]);",
        """  let L=tbl(ws,3,h,rows,['s','w','s','w','s','%','%','s','%','%','s','p','s','s','%','w','w']); ws['!rows']=[{hpt:30},{hpt:30},{hpt:6},{hpt:36},...rows.map(()=>({hpt:42}))]; finish(ws,'Retours gestionnaires',L,h.length-1,[16,26,18,54,20,10,11,11,11,11,18,18,20,24,10,34,34]);
  { const SC={}; T.forEach(({r,t})=>Object.entries(t.scen||{}).forEach(([k,v])=>{ if(v>=0.6) (SC[k]=SC[k]||[]).push({r,t,v}); })); const imp=k=>SC[k].reduce((a,x)=>a+(x.r.montant||0),0);
    const ks=Object.keys(SC).sort((a,b)=>imp(b)-imp(a));
    if(ks.length){ const h2=['Scénario macro','Dossiers exposés','Impayés exposés XOF (code)','Dossiers (probabilité d\\'exposition jugée)'];
      const ws2=frame('Stress narratif','STRESS NARRATIF — DOSSIERS EXPOSÉS AUX SCÉNARIOS MACRO','Exposition jugée par l\\'analyse sémantique (probabilité ≥ 0,60 que le scénario touche directement les revenus du client) ; montants calculés par le code',h2.length);
      const rows2=ks.map(k=>[TS_SCEN[k]||k,SC[k].length,Math.round(imp(k)),SC[k].sort((a,b)=>b.v-a.v).map(x=>x.r.ref+' '+x.r.client+' ('+Math.round(100*x.v)+' %)').join(' ; ')]);
      const L2=tbl(ws2,3,h2,rows2,['s','n','n','w']); ws2['!rows']=[{hpt:30},{hpt:30},{hpt:6},{hpt:36},...rows2.map(()=>({hpt:54}))]; finish(ws2,'Stress narratif',L2,h2.length-1,[30,14,24,96]); } }""")
    # 6 · PowerPoint de toutes les salles : XML remis en conformité après la finition
    rep("const b=await pmBlueOffice(o||new Blob([buf]),name); if(b) steps.push('Blue Premium + couche sémantique'); out=b||o; }",
        "const b=await pmBlueOffice(o||new Blob([buf]),name); if(b) steps.push('Blue Premium + couche sémantique'); out=b||o; if(k==='p'&&typeof pptxFix==='function'){ const fx=await pptxFix(out||new Blob([buf])); if(fx){ out=fx; steps.push('XML PowerPoint conforme'); } } }")
    # 4 · export de la salle JEV : feuille « Analyses avancées »
    rep("  if(TSX.n){ let R2=[]; try{ R2=crmInit().rows.filter(r=>r.t); }catch(e){}",
        r"""  if(R.adv){ const A=R.adv; h=['Analyse','Résultat','Provenance','Méthode','N','Historique (mois)'];
    rows=[['PD cumulée 3 / 6 / 12 / 24 mois (sains)',[3,6,12,24].map(k=>jevPct(A.term[k-1])).join(' · '),A.termProv.source,A.termProv.methode,A.termProv.n,A.termProv.periodes],
      ['Temps moyen avant défaut (Sain · 31-60 j · 61-90 j)',A.ttd?A.ttd.map(v=>v.toFixed(1)+' mois').join(' · '):'—',A.ttdProv.source,A.ttdProv.methode,A.ttdProv.n,A.ttdProv.periodes],
      ['Probabilité de guérison (31-60 j · 61-90 j)',A.cure.map(v=>jevPct(v)).join(' · '),A.cureProv.source,A.cureProv.methode,A.cureProv.n,A.cureProv.periodes],
      ['PD 12M · intervalle de confiance 90 %',jevPct(A.boot.lo)+' – '+jevPct(A.boot.hi)+' (médiane '+jevPct(A.boot.med)+')',A.bootProv.source,A.bootProv.methode,A.bootProv.n,A.bootProv.periodes],
      ['Backtest hors échantillon (dernier mois)',A.back?A.back.exp.toFixed(1)+' prévues · '+A.back.obs+' observées · Brier '+(A.back.brier!=null?A.back.brier.toFixed(4):'—'):'au moins 3 arrêtés nécessaires',A.back?A.backProv.source:'',A.back?A.backProv.methode:'',A.back?A.back.n:'',A.back?A.backProv.periodes:''],
      ['Stress inverse (PD 12M × 2)','facteur ×'+A.rev.factor.toFixed(2),A.revProv.source,A.revProv.methode,A.revProv.n,A.revProv.periodes]].concat(A.sens.map(x=>['Sensibilité '+x.de+' → '+x.vers,'+'+(100*x.d).toFixed(2)+' pt de PD 12M pour +10 %',A.sensProv.source,A.sensProv.methode,A.sensProv.n,A.sensProv.periodes]));
    ws=frame('JEV — ANALYSES AVANCÉES','Structure par terme, temps avant défaut, guérison, intervalle bootstrap, backtest, stress inverse, sensibilité'+av,h.length);
    L=tbl(ws,3,h,rows,['w','w','p','w','n','s']); fin(ws,'Analyses avancées',L,h.length-1,[40,40,12,60,10,10]); ws['!rows']=ws['!rows'].concat(rows.map(()=>({hpt:30}))); }
  if(TSX.n){ let R2=[]; try{ R2=crmInit().rows.filter(r=>r.t); }catch(e){}""")

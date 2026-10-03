/* =====================================================================
   RISK OUTLOOK (JEV) — ANALYSES AVANCÉES
   Toutes calculées par le code sur les matrices de l'archive APEX ;
   chaque résultat porte sa provenance.
   ===================================================================== */
function jevInv3(M){ const [a,b,c]=M[0],[d,e,f]=M[1],[g,h,i]=M[2], A=e*i-f*h, B=-(d*i-f*g), C=d*h-e*g, det=a*A+b*B+c*C; if(Math.abs(det)<1e-12) return null;
  return [[A/det,-(b*i-c*h)/det,(b*f-c*e)/det],[B/det,(a*i-c*g)/det,-(a*f-c*d)/det],[C/det,-(a*h-b*g)/det,(a*e-b*d)/det]]; }
function jevGamma(k,rnd){ if(k<1){ return jevGamma(k+1,rnd)*Math.pow(rnd(),1/k); } const d=k-1/3, c=1/Math.sqrt(9*d); for(;;){ let x,v; do{ const u1=rnd(),u2=rnd(); x=Math.sqrt(-2*Math.log(u1||1e-12))*Math.cos(2*Math.PI*u2); v=1+c*x; }while(v<=0); v=v*v*v; const u=rnd(); if(u<1-0.0331*x*x*x*x||Math.log(u)<0.5*x*x+d*(1-v+Math.log(v))) return d*v; } }
function jevAdvanced(R){ const C=R.C, P=C.P0, per=R.per, cal=R.calib, n0=C.n0, A={};
  // 1 · structure par terme : PD cumulée et marginale, 1 à 24 mois (MARKOV)
  A.term=[...Array(24)].map((_,h)=>jevPow(P,h+1)[0][JEV_D]); A.marg=A.term.map((v,i)=>v-(i?A.term[i-1]:0));
  A.termProv=jevProv('MARKOV','PD cumulée et marginale 1-24 mois (puissances de la matrice)',n0,per,cal,24);
  // 2 · temps moyen avant défaut (matrice fondamentale N=(I-Q)^-1 des états transitoires)
  const Q=[0,1,2].map(i=>[0,1,2].map(j=>P[i][j])), N=jevInv3(Q.map((r,i)=>r.map((v,j)=>(i===j?1:0)-v)));
  A.ttd=N?[0,1,2].map(i=>N[i].reduce((a,b)=>a+b,0)):null; A.ttdProv=jevProv('MARKOV','Matrice fondamentale (I − Q)⁻¹ : nombre moyen de mois avant absorption en douteux',n0,per,cal,0);
  // 3 · probabilité de guérison : atteindre « Sain » avant « Douteux » depuis 31-60 j et 61-90 j
  const T=P.map((r,i)=>i===0?[1,0,0,0]:r.slice()); let X=[0,1,2,3].map(i=>[0,1,2,3].map(j=>+(i===j))); for(let k=0;k<240;k++) X=jevMul(X,T);
  A.cure=[1,2].map(i=>X[i][0]); A.cureProv=jevProv('MARKOV','Absorption à deux états (Sain / Douteux), horizon 20 ans',n0,per,cal,240);
  // 4 · intervalle de confiance de la PD 12M par bootstrap bayésien (Dirichlet sur les comptages)
  const cnt=jevCompter(R.H,()=>true); let seed=20260930; const rnd=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296)||1e-9; const sims=[];
  for(let s=0;s<300;s++){ const Pb=cnt.map((row,e)=>{ if(e===JEV_D) return [0,0,0,1]; const g=row.map(c=>jevGamma(c+0.5,rnd)), t=g.reduce((a,b)=>a+b,0)||1; return g.map(v=>v/t); }); sims.push(jevPow(Pb,12)[0][JEV_D]); }
  sims.sort((a,b)=>a-b); A.boot={lo:sims[Math.floor(0.05*sims.length)],med:sims[Math.floor(0.5*sims.length)],hi:sims[Math.floor(0.95*sims.length)]};
  A.bootProv=jevProv('SIMULATED','Bootstrap bayésien : 300 tirages Dirichlet(N + ½) des lignes de la matrice, IC 90 %',n0,per,cal,12);
  // 5 · backtest : matrice calibrée sans le dernier mois, comparée aux transitions observées du dernier mois
  if(R.H.length>=3){ const Hb=R.H.slice(0,-1), Pb=jevNorm(jevCompter(Hb,()=>true)).P, a=R.H[R.H.length-2].lignes, b=R.H[R.H.length-1].lignes; let exp=0,obs=0,br=0,n=0;
    for(const k in a){ const e=a[k][1]; if(e===JEV_D||!b[k]) continue; const p=Pb[e][JEV_D], y=b[k][1]===JEV_D?1:0; exp+=p; obs+=y; br+=(p-y)*(p-y); n++; }
    A.back={exp,obs,n,brier:n?br/n:null,ratio:exp?obs/exp:null}; A.backProv=jevProv('EMPIRICAL','Backtest hors échantillon : matrice sans le dernier mois vs entrées observées en douteux',n,per-1,R.H[R.H.length-2].date?fmtDate(R.H[R.H.length-2].date):cal,1); }
  // 6 · stress inverse : facteur de dégradation qui double la PD 12M des sains
  const base=A.term[11], f=x=>jevPow(jevStress(P,x),12)[0][JEV_D]; let lo=1,hi=1; while(f(hi)<2*base&&hi<64) hi*=2; for(let k=0;k<40;k++){ const mid=(lo+hi)/2; if(f(mid)<2*base) lo=mid; else hi=mid; }
  A.rev={factor:hi,target:2*base}; A.revProv=jevProv('STRESS','Stress inverse : recherche par dichotomie du facteur ×f qui double la PD 12M',n0,per,cal,12);
  // 7 · sensibilité : effet sur la PD 12M d'une hausse de 10 % de chaque probabilité de dégradation
  A.sens=[]; for(let i=0;i<3;i++) for(let j=i+1;j<4;j++){ if(P[i][j]<=0) continue; const Pp=P.map(r=>r.slice()); const add=P[i][j]*0.10; Pp[i][j]+=add; const keep=Pp[i][i]; Pp[i][i]=Math.max(0,keep-add);
    A.sens.push({de:JEV_ETATS[i],vers:JEV_ETATS[j],p:P[i][j],d:jevPow(Pp,12)[0][JEV_D]-base}); }
  A.sens.sort((x,y)=>y.d-x.d); A.sensProv=jevProv('MARKOV','Différences finies : +10 % relatif sur chaque transition de dégradation (compensé sur la diagonale)',n0,per,cal,12);
  return A; }

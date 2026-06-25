import React, { useState, useMemo, useRef, useEffect } from "react";
import { WC, CHAMPIONS } from "./data.js";

/* =================================================================
   SETTE A ZERO — build · spin · 7–0
   Slot (anno × nazione) → ruba un giocatore → completa l'XI →
   torneo a eliminazione LIVE minuto per minuto → statistiche finali.
   ================================================================= */

const YEARS = Object.keys(WC).sort();
const ENTRIES = [];
for (const y of YEARS) for (const [team, players] of Object.entries(WC[y]))
  if (players.length >= 11) ENTRIES.push({ year: y, team, players });

const ALL_TEAMS = [...new Set(ENTRIES.map(e => e.team))].sort();

const isChampion = (year, team) => CHAMPIONS[year] === team;

const FORMATIONS = {
  "4-3-3": [["GK",50,92],["DF",16,74],["DF",38,78],["DF",62,78],["DF",84,74],["MF",30,52],["MF",50,56],["MF",70,52],["FW",22,24],["FW",50,18],["FW",78,24]],
  "4-4-2": [["GK",50,92],["DF",16,74],["DF",38,78],["DF",62,78],["DF",84,74],["MF",16,50],["MF",38,54],["MF",62,54],["MF",84,50],["FW",38,22],["FW",62,22]],
  "3-5-2": [["GK",50,92],["DF",28,78],["DF",50,80],["DF",72,78],["MF",12,56],["MF",34,52],["MF",50,58],["MF",66,52],["MF",88,56],["FW",38,22],["FW",62,22]],
  "4-2-3-1": [["GK",50,92],["DF",16,74],["DF",38,78],["DF",62,78],["DF",84,74],["MF",38,58],["MF",62,58],["MF",22,38],["MF",50,40],["MF",78,38],["FW",50,18]],
  "3-4-3": [["GK",50,92],["DF",28,78],["DF",50,80],["DF",72,78],["MF",16,54],["MF",40,56],["MF",60,56],["MF",84,54],["FW",24,24],["FW",50,20],["FW",76,24]],
  "5-3-2": [["GK",50,92],["DF",10,72],["DF",30,78],["DF",50,80],["DF",70,78],["DF",90,72],["MF",30,52],["MF",50,56],["MF",70,52],["FW",38,22],["FW",62,22]],
  "4-5-1": [["GK",50,92],["DF",16,74],["DF",38,78],["DF",62,78],["DF",84,74],["MF",12,52],["MF",32,54],["MF",50,56],["MF",68,54],["MF",88,52],["FW",50,20]],
  "4-1-2-1-2": [["GK",50,92],["DF",16,74],["DF",38,78],["DF",62,78],["DF",84,74],["MF",50,62],["MF",26,48],["MF",74,48],["MF",50,34],["FW",38,18],["FW",62,18]],
  "3-4-2-1": [["GK",50,92],["DF",28,78],["DF",50,80],["DF",72,78],["MF",16,56],["MF",40,58],["MF",60,58],["MF",84,56],["FW",34,30],["FW",66,30],["FW",50,16]],
};
// rigidità totale: ogni slot accetta solo il proprio ruolo
const ACCEPTS = { GK:["GK"], DF:["DF"], MF:["MF"], FW:["FW"] };
const DIFFICULTY = {
  classic:{label:"Classic",hide:false,sub:"rating visibili"},
  memory:{label:"Memory",hide:true,sub:"rating nascosti"},
};
const REROLLS = {
  hardcore:{label:"Hardcore",rerolls:0,sub:"0 reroll"},
  standard:{label:"Standard",rerolls:3,sub:"3 reroll"},
  free:{label:"Libera",rerolls:Infinity,sub:"reroll infiniti"},
};

function teamHue(name){let h=0;for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))%360;return h;}
function pick(arr,rng=Math.random){return arr[Math.floor(rng()*arr.length)];}
function mulberry(seed){let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}

// ---- forza squadra ---------------------------------------------------
function squadStrength(squad){
  const f=squad.filter(Boolean); if(!f.length)return 0;
  const avg=a=>a.length?a.reduce((s,p)=>s+p.player.r,0)/a.length:70;
  const att=f.filter(p=>p.slot==="FW"),mid=f.filter(p=>p.slot==="MF"),def=f.filter(p=>p.slot==="DF"||p.slot==="GK");
  return Math.round(avg(att)*0.34+avg(mid)*0.33+avg(def)*0.33);
}
function bestXIfor(entry,formation){
  const byPos={GK:[],DF:[],MF:[],FW:[]};
  for(const p of entry.players)(byPos[p.p]||(byPos[p.p]=[])).push(p);
  for(const k in byPos)byPos[k].sort((a,b)=>b.r-a.r);
  const used=new Set(),out=[];
  for(const [role] of formation){
    const pool=[]; for(const acc of ACCEPTS[role])for(const pl of(byPos[acc]||[]))pool.push(pl);
    pool.sort((a,b)=>b.r-a.r);
    const ch=pool.find(p=>!used.has(p))||pool[0]; if(ch)used.add(ch);
    out.push({slot:role,player:ch||{n:"—",p:role,r:60}});
  }
  return out;
}

// =====================================================================
// SIMULAZIONE LIVE: genera eventi minuto-per-minuto per ogni partita.
// Ogni gol è attribuito a un giocatore (marcatore + eventuale assist).
// =====================================================================
function genMatchEvents(myXI, oppXI, myName, oppName, myStr, oppStr, rng){
  const diff=myStr-oppStr;
  // mappatura piu' morbida: diff/9 invece di diff/6, e clamp piu' stretto.
  // cosi' una differenza di 10 punti sposta l'xG di ~1.1, non di 1.6.
  const adj=Math.max(-1.3,Math.min(1.8,diff/9));
  const myXG=Math.max(.35,1.25+adj);
  const opXG=Math.max(.35,1.25-adj);
  const attackers=side=> side.filter(p=>p.slot==="FW").concat(side.filter(p=>p.slot==="MF"));
  const myAtt=attackers(myXI), opAtt=attackers(oppXI);
  const weighted=pool=>{ // scegli marcatore pesato sul rating
    const tot=pool.reduce((s,p)=>s+p.player.r,0); let x=rng()*tot;
    for(const p of pool){x-=p.player.r; if(x<=0)return p;} return pool[pool.length-1];
  };
  const events=[]; let gf=0,ga=0;
  // numero gol via poisson
  const pois=(L)=>{let k=0,p=1,e=Math.exp(-L);do{k++;p*=rng();}while(p>e&&k<12);return k-1;};
  let myGoals=Math.min(7,pois(myXG)), opGoals=Math.min(7,pois(opXG));
  // distribuisci i minuti
  const mk=(count,pool,team)=>{
    const mins=Array.from({length:count},()=>1+Math.floor(rng()*90)).sort((a,b)=>a-b);
    return mins.map(m=>{
      const scorer=weighted(pool);
      let assist=null;
      if(rng()<0.62){ const cand=pool.filter(p=>p!==scorer); if(cand.length)assist=weighted(cand); }
      return {minute:m,team,scorer:scorer.player,assist:assist?assist.player:null};
    });
  };
  const all=[...mk(myGoals,myAtt,"me"),...mk(opGoals,opAtt,"opp")].sort((a,b)=>a.minute-b.minute);
  for(const e of all){ if(e.team==="me")gf++;else ga++; e.gf=gf;e.ga=ga; }
  let pens=null,won;
  if(gf===ga){ const pf=rng(),pa=rng(); won=pf>=pa; pens=won?"5-4":"4-5"; }
  else won=gf>ga;
  return {gf,ga,won,pens,events,timeline:all,myGoals:gf,opGoals:ga};
}

function buildTournament(squad,formation,seed){
  const rng=mulberry(seed);
  const myStr=squadStrength(squad);
  // l'avversario usa l'XI ottimale della sua rosa: lo smorziamo perche' altrimenti
  // e' strutturalmente piu' forte dell'XI che il giocatore assembla pescando alla slot.
  const OPP_DAMPEN=0.94;
  // 3 partite gironi + 4 eliminazione = 7 partite
  const groupRounds=["Girone · G1","Girone · G2","Girone · G3"];
  const koRounds=["Ottavi","Quarti","Semifinale","Finale"];
  const pool=[...ENTRIES].sort(()=>rng()-0.5);
  const ties=[]; let oi=0; let eliminated=false;
  // ---- fase a gironi: si gioca SEMPRE tutte e 3, raccogli punti
  let pts=0,gfTot=0,gaTot=0;
  for(const round of groupRounds){
    const opp=pool[oi++%pool.length];
    const oppXI=bestXIfor(opp,formation);
    const oppStr=Math.round(squadStrength(oppXI)*OPP_DAMPEN);
    const m=genMatchEvents(squad,oppXI,"Tu",opp.team,myStr,oppStr,rng);
    const res=m.gf>m.ga?"W":m.gf<m.ga?"L":"D";
    pts+=res==="W"?3:res==="D"?1:0; gfTot+=m.gf; gaTot+=m.ga;
    ties.push({round,phase:"group",opp:opp.team,year:opp.year,oppStr,result:res,...m});
  }
  // qualificazione: bastano 3 punti (1 vittoria o 3 pareggi). Soglia morbida.
  const qualified=pts>=3;
  // ---- fase eliminazione (solo se qualificato)
  if(qualified){
    for(const round of koRounds){
      const opp=pool[oi++%pool.length];
      const oppXI=bestXIfor(opp,formation);
      const oppStr=Math.round(squadStrength(oppXI)*OPP_DAMPEN);
      const m=genMatchEvents(squad,oppXI,"Tu",opp.team,myStr,oppStr,rng);
      ties.push({round,phase:"ko",opp:opp.team,year:opp.year,oppStr,...m});
      if(!m.won){eliminated=true;break;}
    }
  }
  const koPlayed=ties.filter(t=>t.phase==="ko");
  const champion=qualified&&koPlayed.length===koRounds.length&&koPlayed.every(t=>t.won);
  const fin=ties[ties.length-1];
  const sevenZero=champion&&fin.gf>=7&&fin.ga===0;
  const stats={}; squad.forEach(s=>{stats[s.player.n]={player:s.player,team:s.team,year:s.year,slot:s.slot,goals:0,assists:0};});
  for(const t of ties)for(const e of t.timeline)if(e.team==="me"){
    if(stats[e.scorer.n])stats[e.scorer.n].goals++;
    if(e.assist&&stats[e.assist.n])stats[e.assist.n].assists++;
  }
  return {ties,champion,sevenZero,qualified,groupPts:pts,myStr,stats:Object.values(stats)};
}

// =====================================================================
// CONDIVISIONE: genera immagine 1080x1350 (post IG) e usa Web Share API
// =====================================================================
async function shareResult({squad,formation,sim,headline,topScorers}){
  const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H;
  const x=cv.getContext("2d");
  // sfondo
  const g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,"#15402a");g.addColorStop(.55,"#0a2418");g.addColorStop(1,"#07160e");
  x.fillStyle=g;x.fillRect(0,0,W,H);
  const brass="#f2cd6b";
  // header
  x.textAlign="left";
  x.fillStyle=brass;x.font="900 120px Arial";x.fillText("7",70,160);
  x.fillStyle="#cfe3d6";x.fillText("–",150,160);
  x.fillStyle=brass;x.fillText("0",230,160);
  x.fillStyle="#eaf4ec";x.font="900 46px Arial";x.fillText("SETTE A ZERO",330,120);
  x.fillStyle="#9fc4ad";x.font="400 26px Arial";x.fillText("build · spin · 7–0",330,158);
  // headline
  x.textAlign="center";
  const hlColor=sim.sevenZero||sim.champion?brass:"#cfd9d1";
  x.fillStyle=hlColor;x.font="900 76px Arial";
  wrapText(x,headline.toUpperCase(),W/2,270,W-120,80);
  // campo
  const fx=90,fy=330,fw=W-180,fh=560;
  drawPitch(x,fx,fy,fw,fh,squad,formation);
  // cammino sintetico
  let cy=940;
  x.textAlign="left";x.fillStyle="#9fc4ad";x.font="700 24px Arial";
  x.fillText("CAMMINO",90,cy);cy+=14;
  x.font="400 27px Arial";x.fillStyle="#eaf4ec";
  const koLine=sim.ties.filter(t=>t.phase==="ko").map(m=>`${m.round[0]}${m.round==="Finale"?"":""}: ${m.gf}-${m.ga}`);
  const grp=sim.ties.filter(t=>t.phase==="group");
  const gW=grp.filter(t=>t.result==="W").length,gD=grp.filter(t=>t.result==="D").length,gL=grp.filter(t=>t.result==="L").length;
  let line=`Gironi ${gW}V ${gD}N ${gL}P (${sim.groupPts} pti)`;
  if(sim.ties.some(t=>t.phase==="ko")){
    line+="  ·  "+sim.ties.filter(t=>t.phase==="ko").map(m=>`${m.round}: ${m.gf}-${m.ga}`).join("  ");
  }
  cy+=44;wrapText(x,line,90,cy,W-180,40,"left");
  // MVP box
  const mvp=topScorers[0];
  const by=1080;
  x.fillStyle="rgba(242,205,107,.12)";roundRect(x,90,by,W-180,150,18);x.fill();
  x.strokeStyle=brass;x.lineWidth=2;roundRect(x,90,by,W-180,150,18);x.stroke();
  x.fillStyle=brass;x.font="700 24px Arial";x.fillText("⭐ MIGLIORE IN CAMPO",120,by+46);
  x.fillStyle="#eaf4ec";x.font="900 44px Arial";x.fillText(mvp.player.n,120,by+98);
  x.fillStyle="#9fc4ad";x.font="400 26px Arial";
  x.fillText(`${mvp.team} '${mvp.year.slice(2)} · ${mvp.slot} · ${mvp.goals} gol, ${mvp.assists} assist`,120,by+132);
  // forza XI a destra del box
  x.textAlign="right";x.fillStyle=brass;x.font="900 70px Arial";x.fillText(String(sim.myStr),W-120,by+105);
  x.fillStyle="#9fc4ad";x.font="400 22px Arial";x.fillText("FORZA XI",W-120,by+135);
  // footer
  x.textAlign="center";x.fillStyle="#7fa890";x.font="700 28px Arial";
  x.fillText("universosportivo.com",W/2,H-50);

  const blob=await new Promise(r=>cv.toBlob(r,"image/png"));
  const file=new File([blob],"sette-a-zero.png",{type:"image/png"});
  const shareData={files:[file],title:"Sette a Zero",text:`${headline} — il mio undici dei Mondiali. Forza XI ${sim.myStr}. Gioca su universosportivo.com`};
  if(navigator.canShare&&navigator.canShare(shareData)){
    await navigator.share(shareData);
  }else{
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="sette-a-zero.png";a.click();URL.revokeObjectURL(url);
  }
}
function roundRect(x,X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
function wrapText(x,text,cx,cy,maxW,lh,align="center"){
  const words=text.split(" ");let line="",y=cy;const lines=[];
  for(const w of words){const t=line?line+" "+w:w;if(x.measureText(t).width>maxW&&line){lines.push(line);line=w;}else line=t;}
  if(line)lines.push(line);
  const prev=x.textAlign;x.textAlign=align;
  for(const l of lines){x.fillText(l,cx,y);y+=lh;}
  x.textAlign=prev; return y;
}
function drawPitch(x,X,Y,w,h,squad,formation){
  // erba a strisce
  const stripes=10;for(let i=0;i<stripes;i++){x.fillStyle=i%2?"#075a30":"#0b6b3a";x.fillRect(X,Y+i*(h/stripes),w,h/stripes);}
  x.strokeStyle="rgba(255,255,255,.4)";x.lineWidth=3;
  roundRect(x,X+12,Y+12,w-24,h-24,8);x.stroke();
  x.beginPath();x.moveTo(X+12,Y+h/2);x.lineTo(X+w-12,Y+h/2);x.stroke();
  x.beginPath();x.arc(X+w/2,Y+h/2,46,0,7);x.stroke();
  // giocatori
  formation.forEach(([role,px,py],i)=>{
    const f=squad[i];if(!f)return;
    const cx=X+(px/100)*w,cy=Y+(py/100)*h;
    x.fillStyle="rgba(8,24,16,.92)";x.strokeStyle="#d9a441";x.lineWidth=2;
    const bw=Math.min(150,w/4.4),bh=52;
    roundRect(x,cx-bw/2,cy-bh/2,bw,bh,8);x.fill();x.stroke();
    x.fillStyle="#eaf4ec";x.font="700 19px Arial";x.textAlign="center";
    const nm=f.player.n.length>16?f.player.n.split(" ").pop():f.player.n;
    x.fillText(nm,cx,cy-2,bw-12);
    x.fillStyle="#9fc4ad";x.font="400 14px Arial";
    x.fillText(`${f.year} · ${f.player.r}`,cx,cy+18,bw-12);
  });
}



function Brass({children,onClick,disabled,big}){
  return <button onClick={onClick} disabled={disabled} className="wc-brass" data-big={big?"1":undefined}>{children}</button>;
}

function Reel({spinning,value,pool,wide,jackpot}){
  const [disp,setDisp]=useState(value||pool[0]); const t=useRef();
  useEffect(()=>{
    if(spinning){let i=0;const tick=()=>{setDisp(pool[i%pool.length]);i++;t.current=setTimeout(tick,55+i*4);};tick();return()=>clearTimeout(t.current);}
    else if(value)setDisp(value);
  },[spinning,value]);
  return <div className={`reel${wide?" reel-wide":""}${jackpot&&!spinning?" jackpot":""}`}><span className={spinning?"reel-blur":""}>{disp}</span></div>;
}

function SlotMachine({spinning,result,onSpin,canSpin,roundLabel,locked,rerollsLeft,canReroll}){
  const ry=useRef([]),rt=useRef([]);
  if(!ry.current.length){ry.current=Array.from({length:24},()=>pick(YEARS));rt.current=Array.from({length:24},()=>pick(ENTRIES).team);}
  const jackpot=result&&isChampion(result.year,result.team);
  return(
    <div className="slot-wrap">
      <div className={`slot-frame${jackpot?" frame-jackpot":""}`}>
        {jackpot&&<div className="jackpot-tag">★ CAMPIONE DEL MONDO ★</div>}
        <div className="slot-window">
          <Reel spinning={spinning} value={result?result.year:null} pool={ry.current} jackpot={jackpot}/>
          <div className="slot-x">×</div>
          <Reel spinning={spinning} value={result?result.team:null} pool={rt.current} wide jackpot={jackpot}/>
        </div>
        <div className="slot-caption">{locked?`Solo ${locked}`:roundLabel}</div>
      </div>
      <Brass onClick={()=>onSpin(false)} disabled={!canSpin||spinning||!!result} big>
        {spinning?"…gira…":"TIRA LA LEVA"}
      </Brass>
      {result&&!spinning&&canReroll&&(
        <button className="reroll-btn" onClick={()=>onSpin(true)} disabled={rerollsLeft<=0}>
          ↻ Rigira {rerollsLeft===Infinity?"(∞)":`(${rerollsLeft} rimasti)`}
        </button>
      )}
    </div>
  );
}

function Pitch({formation,squad,hide,compact}){
  return(
    <div className={`pitch${compact?" compact":""}`}>
      <div className="pitch-lines"/>
      {formation.map(([role,x,y],i)=>{
        const f=squad[i];
        return(
          <div key={i} className={`slot-dot${f?" filled":""}`} style={{left:`${x}%`,top:`${y}%`}}>
            {f?(<>
              <div className="slot-name">{f.player.n}</div>
              <div className="slot-meta">
                <span className="slot-flag" style={{background:`hsl(${teamHue(f.team)} 60% 45%)`}}/>
                {f.year}{!hide&&<b> {f.player.r}</b>}
              </div>
            </>):<div className="slot-role">{role}</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function App(){
  const [phase,setPhase]=useState("setup");
  const [formationKey,setFormationKey]=useState("4-3-3");
  const [difficulty,setDifficulty]=useState("classic");
  const [rerollMode,setRerollMode]=useState("standard");
  const [nationLock,setNationLock]=useState(""); // "" = tutte
  const formation=FORMATIONS[formationKey];
  const hide=DIFFICULTY[difficulty].hide;
  const maxRerolls=REROLLS[rerollMode].rerolls;

  const [squad,setSquad]=useState([]);
  const [spinning,setSpinning]=useState(false);
  const [current,setCurrent]=useState(null);
  const [rerollsUsed,setRerollsUsed]=useState(0);
  const [seed]=useState(()=>(Math.random()*1e9)|0);
  const [sim,setSim]=useState(null);

  const totalSlots=formation.length;
  const round=squad.filter(Boolean).length;

  // pool ristretto se nazione bloccata
  const entryPool=useMemo(()=> nationLock?ENTRIES.filter(e=>e.team===nationLock):ENTRIES,[nationLock]);

  const start=()=>{ setSquad(new Array(totalSlots).fill(null)); setCurrent(null); setRerollsUsed(0); setSim(null); setPhase("draft"); };

  const doSpin=(isReroll)=>{
    if(spinning)return;
    if(isReroll){ if(rerollsUsed>=maxRerolls)return; setRerollsUsed(n=>n+1); }
    setSpinning(true); setCurrent(null);
    const dur=1400+Math.random()*700;
    setTimeout(()=>{ setCurrent(pick(entryPool)); setSpinning(false); },dur);
  };

  const openSlots=(dbPos)=>{const o=[];formation.forEach(([role],i)=>{if(!squad[i]&&ACCEPTS[role].includes(dbPos))o.push(i);});return o;};

  const choose=(player,slotIdx)=>{
    const next=[...squad];
    next[slotIdx]={slot:formation[slotIdx][0],player,team:current.team,year:current.year};
    setSquad(next); setCurrent(null);
    if(next.filter(Boolean).length===totalSlots){
      setSim(buildTournament(next,formation,seed));
      setTimeout(()=>setPhase("playing"),300);
    }
  };

  return(
    <div className="wc-app">
      <style>{CSS}</style>
      <Header/>
      {phase==="setup"&&<Setup {...{formationKey,setFormationKey,difficulty,setDifficulty,rerollMode,setRerollMode,nationLock,setNationLock,start}}/>}
      {phase==="draft"&&<Draft {...{formation,squad,hide,round,totalSlots,spinning,current,doSpin,openSlots,choose,nationLock,rerollsUsed,maxRerolls}}/>}
      {phase==="playing"&&sim&&<LiveTournament {...{sim,squad,formation,hide,onDone:()=>setPhase("result")}}/>}
      {phase==="result"&&sim&&<Result {...{squad,formation,hide,sim,onRestart:()=>setPhase("setup"),onRebuild:start}}/>}
      <footer className="wc-foot">12.211 giocatori · 23 Mondiali · 1930–2026 · rating assoluto · universosportivo.com</footer>
    </div>
  );
}

function Header(){
  return(
    <header className="wc-head">
      <div className="wc-score">7<span>–</span>0</div>
      <div className="wc-titles">
        <h1>SETTE A ZERO</h1>
        <p>Gira la slot, pesca una nazionale da un Mondiale, ruba il fuoriclasse. Costruisci l'undici e vinci il torneo.</p>
      </div>
    </header>
  );
}

function Setup({formationKey,setFormationKey,difficulty,setDifficulty,rerollMode,setRerollMode,nationLock,setNationLock,start}){
  const [showNations,setShowNations]=useState(false);
  // formazioni incompatibili se nazione bloccata (rosa senza abbastanza giocatori per ruolo)
  const incompat=useMemo(()=>{
    if(!nationLock)return new Set();
    const ents=ENTRIES.filter(e=>e.team===nationLock);
    const bad=new Set();
    for(const k of Object.keys(FORMATIONS)){
      const need={GK:0,DF:0,MF:0,FW:0}; for(const[r] of FORMATIONS[k])need[r]++;
      // la nazione deve avere ALMENO una rosa che soddisfa il modulo
      const ok=ents.some(e=>{const c={GK:0,DF:0,MF:0,FW:0};for(const p of e.players)c[p.p]++;return c.GK>=need.GK&&c.DF>=need.DF&&c.MF>=need.MF&&c.FW>=need.FW;});
      if(!ok)bad.add(k);
    }
    return bad;
  },[nationLock]);
  // se il modulo scelto diventa incompatibile, sposta su uno valido
  useEffect(()=>{
    if(incompat.has(formationKey)){
      const ok=Object.keys(FORMATIONS).find(k=>!incompat.has(k));
      if(ok)setFormationKey(ok);
    }
  },[incompat]);
  return(
    <div className="panel">
      <div className="field-block">
        <label className="eyebrow">Modulo</label>
        <div className="chips">{Object.keys(FORMATIONS).map(k=>(
          <button key={k} className={`chip${formationKey===k?" on":""}`} disabled={incompat.has(k)}
            onClick={()=>setFormationKey(k)}>{k}{incompat.has(k)&&<small>rosa insuff.</small>}</button>))}
        </div>
      </div>
      <div className="field-block">
        <label className="eyebrow">Difficoltà</label>
        <div className="chips">{Object.keys(DIFFICULTY).map(k=>(
          <button key={k} className={`chip${difficulty===k?" on":""}`} onClick={()=>setDifficulty(k)}>
            {DIFFICULTY[k].label}<small>{DIFFICULTY[k].sub}</small></button>))}
        </div>
      </div>
      <div className="field-block">
        <label className="eyebrow">Reroll</label>
        <div className="chips">{Object.keys(REROLLS).map(k=>(
          <button key={k} className={`chip${rerollMode===k?" on":""}`} onClick={()=>setRerollMode(k)}>
            {REROLLS[k].label}<small>{REROLLS[k].sub}</small></button>))}
        </div>
      </div>
      <div className="field-block">
        <label className="eyebrow">Vincolo nazione (opzionale)</label>
        <div className="chips">
          <button className={`chip${!nationLock?" on":""}`} onClick={()=>setNationLock("")}>Tutte le nazioni<small>pesca libera</small></button>
          <button className={`chip${nationLock?" on":""}`} onClick={()=>setShowNations(s=>!s)}>
            {nationLock||"Scegli una nazione"}<small>{nationLock?"solo questa":"tutte le sue edizioni"}</small></button>
        </div>
        {showNations&&(
          <div className="nation-grid">
            {ALL_TEAMS.map(t=>(
              <button key={t} className={`nation-pill${nationLock===t?" on":""}`}
                onClick={()=>{setNationLock(t);setShowNations(false);}}>{t}</button>))}
          </div>
        )}
      </div>
      <div className="rules">
        <p><b>Come si gioca.</b> Tiri la leva: la slot abbina un <b>anno di Mondiale</b> a una <b>nazionale</b>. Se esce una <b>campione del mondo</b>, la slot lampeggia. Da quella rosa scegli <b>un solo giocatore</b> per uno slot libero compatibile. Completi l'undici e parte il <b>torneo live</b>, minuto per minuto, fino alla finale: riesci a chiudere sul <b>7–0</b>? A fine torneo vedi le statistiche dei tuoi giocatori.</p>
      </div>
      <Brass onClick={start} big>Inserisci il gettone</Brass>
    </div>
  );
}

function Draft({formation,squad,hide,round,totalSlots,spinning,current,doSpin,openSlots,choose,nationLock,rerollsUsed,maxRerolls}){
  const [pending,setPending]=useState(null);
  useEffect(()=>{setPending(null);},[current]);
  const rerollsLeft=maxRerolls===Infinity?Infinity:Math.max(0,maxRerolls-rerollsUsed);
  return(
    <div className="draft">
      <div className="draft-left">
        <SlotMachine spinning={spinning} result={current} onSpin={doSpin} canSpin={round<totalSlots}
          roundLabel={`Scelta ${round+1} di ${totalSlots}`} locked={nationLock}
          rerollsLeft={rerollsLeft} canReroll={maxRerolls>0}/>
        <div className="progress">{formation.map((_,i)=><span key={i} className={squad[i]?"on":""}/>)}</div>
      </div>
      <div className="draft-mid"><Pitch formation={formation} squad={squad} hide={hide}/></div>
      <div className="draft-right">
        {current?(
          <div className="roster">
            <div className="roster-head">
              <span className="roster-flag" style={{background:`hsl(${teamHue(current.team)} 60% 45%)`}}/>
              <div><b>{current.team}{isChampion(current.year,current.team)&&<span className="champ-star"> ★</span>}</b>
                <small>Mondiale {current.year} · {current.players.length} convocati</small></div>
            </div>
            {pending?(
              <div className="slot-choose">
                <p>Dove gioca <b>{pending.n}</b> <span className="tag">{pending.p}</span>?</p>
                <div className="slot-opts">{openSlots(pending.p).map(i=>(
                  <button key={i} className="slot-opt" onClick={()=>choose(pending,i)}>{formation[i][0]} <small>slot {i+1}</small></button>))}
                </div>
                <button className="link" onClick={()=>setPending(null)}>← un altro giocatore</button>
              </div>
            ):(
              <ul className="roster-list">{[...current.players].sort((a,b)=>b.r-a.r).map((p,i)=>{
                const slots=openSlots(p.p),dis=slots.length===0;
                return(<li key={i}><button disabled={dis} onClick={()=>{slots.length===1?choose(p,slots[0]):setPending(p);}}>
                  <span className="pos-tag">{p.p}</span><span className="pl-name">{p.n}</span>
                  {!hide&&<span className="pl-rt">{p.r}</span>}{dis&&<span className="full">pieno</span>}
                </button></li>);})}
              </ul>
            )}
          </div>
        ):<div className="roster empty"><p>{round===0?"Tira la leva per pescare la prima nazionale.":"Tira ancora per la prossima scelta."}</p></div>}
      </div>
    </div>
  );
}

// ---- TORNEO LIVE -----------------------------------------------------
function LiveTournament({sim,squad,formation,hide,onDone}){
  const [tieIdx,setTieIdx]=useState(0);
  const [minute,setMinute]=useState(0);
  const [shown,setShown]=useState([]); // eventi mostrati della partita corrente
  const tie=sim.ties[tieIdx];
  const SPEED=28; // ms per minuto simulato

  useEffect(()=>{ setMinute(0); setShown([]); },[tieIdx]);

  useEffect(()=>{
    if(minute>=90){
      const t=setTimeout(()=>{
        // sim.ties contiene esattamente le partite da giocare (gironi sempre 3, KO fin quando si vince)
        if(tieIdx<sim.ties.length-1) setTieIdx(tieIdx+1);
        else setTimeout(onDone,1100);
      },1300);
      return()=>clearTimeout(t);
    }
    const t=setTimeout(()=>{
      const nm=minute+1;
      const ev=tie.timeline.filter(e=>e.minute===nm);
      if(ev.length)setShown(s=>[...s,...ev]);
      setMinute(nm);
    },SPEED);
    return()=>clearTimeout(t);
  },[minute,tieIdx]);

  const gf=shown.filter(e=>e.team==="me").length;
  const ga=shown.filter(e=>e.team==="opp").length;

  return(
    <div className="live">
      <div className="live-scoreboard">
        <div className="live-round">{tie.round} · partita {tieIdx+1} di {sim.ties.length}</div>
        <div className="live-teams">
          <span className="lt me">La tua selezione</span>
          <span className="live-score">{gf}<em>–</em>{ga}</span>
          <span className="lt opp"><span className="roster-flag" style={{background:`hsl(${teamHue(tie.opp)} 60% 45%)`}}/>{tie.opp} <small>'{tie.year.slice(2)}</small></span>
        </div>
        <div className="live-clock">{Math.min(90,minute)}'</div>
        <div className="live-bar"><span style={{width:`${Math.min(100,minute/90*100)}%`}}/></div>
      </div>
      <div className="live-grid">
        <Pitch formation={formation} squad={squad} hide={hide} compact/>
        <div className="live-feed">
          {shown.length===0&&minute<90&&<div className="feed-wait">Calcio d'inizio…</div>}
          {shown.map((e,i)=>(
            <div key={i} className={`feed-ev ${e.team}`}>
              <span className="ev-min">{e.minute}'</span>
              <span className="ev-icon">⚽</span>
              <span className="ev-txt">
                <b>{e.scorer.n}</b>{e.assist&&<small> (assist {e.assist.n})</small>}
                <i>{e.team==="me"?"La tua selezione":tie.opp} · {e.gf}-{e.ga}</i>
              </span>
            </div>
          ))}
          {minute>=90&&(()=>{
            const isGroup=tie.phase==="group";
            const outcome=isGroup
              ? (tie.result==="W"?"vittoria":tie.result==="D"?"pareggio":"sconfitta")
              : (tie.won?"passi il turno":"eliminato");
            const cls=isGroup?(tie.result==="W"?"won":tie.result==="D"?"draw":"lost"):(tie.won?"won":"lost");
            return <div className={`feed-final ${cls}`}>Fine. {gf}–{ga}{tie.pens&&` · rigori ${tie.pens}`} — {outcome}</div>;
          })()}
        </div>
      </div>
      <button className="link skip" onClick={onDone}>salta al risultato →</button>
    </div>
  );
}

function Result({squad,formation,hide,sim,onRestart,onRebuild}){
  const last=sim.ties[sim.ties.length-1];
  const headline=sim.sevenZero?"SETTE A ZERO!":sim.champion?"CAMPIONI DEL MONDO":!sim.qualified?"Fuori ai gironi":"Eliminati";
  const sub=sim.sevenZero?"Hai chiuso la finale 7–0. Impresa leggendaria."
    :sim.champion?"Coppa alzata — ma non è finita 7–0. Riprova."
    :!sim.qualified?`Eliminato nella fase a gironi con ${sim.groupPts} punti.`
    :`Fuori ai ${last.round}.`;
  const topScorers=[...sim.stats].sort((a,b)=>(b.goals*2+b.assists)-(a.goals*2+a.assists));
  const totGoals=sim.stats.reduce((s,p)=>s+p.goals,0);
  const totAssists=sim.stats.reduce((s,p)=>s+p.assists,0);
  const [sharing,setSharing]=useState(false);
  const doShare=async()=>{
    setSharing(true);
    try{ await shareResult({squad,formation,sim,headline,topScorers}); }
    catch(e){ console.error(e); }
    setSharing(false);
  };
  const groupTies=sim.ties.filter(t=>t.phase==="group");
  const koTies=sim.ties.filter(t=>t.phase==="ko");

  return(
    <div className="result">
      <div className={`verdict${sim.sevenZero?" win7":sim.champion?" win":""}`}>
        <h2>{headline}</h2><p>{sub}</p>
        <div className="strength">Forza dell'undici <b>{sim.myStr}</b> · {totGoals} gol · {totAssists} assist nel torneo</div>
      </div>
      <div className="result-grid">
        <div>
          <h3 className="sec">La rosa</h3>
          <Pitch formation={formation} squad={squad} hide={hide}/>
        </div>
        <div>
          <h3 className="sec">Fase a gironi</h3>
          <div className="bracket">{groupTies.map((m,i)=>(
            <div key={i} className={`tie ${m.result==="W"?"won":m.result==="D"?"draw":"lost"}`}>
              <span className="tie-round">{m.round.replace("Girone · ","")}</span>
              <span className="tie-opp"><span className="roster-flag sm" style={{background:`hsl(${teamHue(m.opp)} 60% 45%)`}}/>{m.opp} <small>'{m.year.slice(2)}</small></span>
              <span className="tie-score">{m.gf}–{m.ga}</span>
            </div>))}
            <div className="group-pts">Punti girone: <b>{sim.groupPts}</b> — {sim.qualified?"qualificato":"non qualificato"}</div>
          </div>
          {koTies.length>0&&<>
            <h3 className="sec">Eliminazione diretta</h3>
            <div className="bracket">{koTies.map((m,i)=>(
              <div key={i} className={`tie${m.won?" won":" lost"}`}>
                <span className="tie-round">{m.round}</span>
                <span className="tie-opp"><span className="roster-flag sm" style={{background:`hsl(${teamHue(m.opp)} 60% 45%)`}}/>{m.opp} <small>'{m.year.slice(2)}</small></span>
                <span className="tie-score">{m.gf}–{m.ga}{m.pens&&<em> r{m.pens}</em>}</span>
              </div>))}
            </div>
          </>}
          <h3 className="sec">Statistiche giocatori</h3>
          <table className="stats">
            <thead><tr><th>Giocatore</th><th>Ruolo</th><th>G</th><th>A</th></tr></thead>
            <tbody>{topScorers.map((p,i)=>(
              <tr key={i} className={i===0?"mvp":undefined}>
                <td>{p.player.n} {i===0&&<span className="mvp-tag">MVP</span>}<small> · {p.team} '{p.year.slice(2)}</small></td>
                <td>{p.slot}</td><td className="num">{p.goals||"–"}</td><td className="num">{p.assists||"–"}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="result-actions">
        <Brass onClick={doShare} disabled={sharing}>{sharing?"Genero…":"📲 Condividi"}</Brass>
        <Brass onClick={onRebuild}>Nuovo undici</Brass>
        <button className="link" onClick={onRestart}>Cambia impostazioni</button>
      </div>
    </div>
  );
}

const C={field:"#0b6b3a",fieldDark:"#075a30",brass:"#d9a441",brassHi:"#f2cd6b",card:"#0f2418"};
const CSS=`
:root{--field:${C.field};--field-dark:${C.fieldDark};--brass:${C.brass};--brass-hi:${C.brassHi};--card:${C.card};}
*{box-sizing:border-box}
.wc-app{min-height:100vh;margin:0;color:#eaf4ec;background:radial-gradient(120% 80% at 50% -10%,#15402a 0%,#0a2418 55%,#07160e 100%);font-family:'Inter','Helvetica Neue',system-ui,sans-serif;padding:clamp(16px,3vw,40px);display:flex;flex-direction:column;gap:26px}
.wc-head{display:flex;align-items:center;gap:24px;border-bottom:1px solid #1d4a31;padding-bottom:20px}
.wc-score{font-family:'Archivo Black','Arial Black',sans-serif;font-size:clamp(46px,9vw,90px);line-height:.8;letter-spacing:-2px;color:var(--brass-hi);text-shadow:0 2px 0 #8a5e16,0 0 26px rgba(242,205,107,.25)}
.wc-score span{color:#eaf4ec;opacity:.5;margin:0 -.06em}
.wc-titles h1{font-family:'Archivo Black',sans-serif;margin:0;font-size:clamp(20px,3.4vw,34px);letter-spacing:3px}
.wc-titles p{margin:6px 0 0;max-width:52ch;opacity:.75;font-size:14px;line-height:1.5}
.eyebrow{font-size:11px;letter-spacing:3px;text-transform:uppercase;opacity:.6;display:block;margin-bottom:10px}
.panel{max-width:760px;display:flex;flex-direction:column;gap:24px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{background:var(--card);border:1px solid #235139;color:#dfeee4;cursor:pointer;padding:12px 18px;border-radius:10px;font-size:15px;font-weight:600;display:flex;flex-direction:column;gap:2px;transition:.15s}
.chip small{font-weight:400;opacity:.55;font-size:11px}
.chip:hover{border-color:var(--brass)}
.chip.on{background:linear-gradient(180deg,#1b6b41,#125632);border-color:var(--brass-hi);box-shadow:0 0 0 1px var(--brass-hi) inset}
.nation-grid{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;max-height:240px;overflow:auto;padding:10px;background:rgba(0,0,0,.2);border-radius:10px}
.nation-pill{background:#143726;border:1px solid #235139;color:#dfeee4;font-size:12px;padding:6px 10px;border-radius:14px;cursor:pointer}
.nation-pill:hover{border-color:var(--brass)}
.nation-pill.on{background:var(--brass);color:#3a2406;border-color:var(--brass-hi);font-weight:700}
.rules{background:rgba(0,0,0,.22);border-left:3px solid var(--brass);padding:16px 18px;border-radius:0 10px 10px 0;font-size:14px;line-height:1.6;opacity:.92}
.rules b{color:var(--brass-hi)}
.wc-brass{align-self:flex-start;cursor:pointer;border:none;font-family:'Archivo Black',sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#3a2406;font-size:14px;padding:14px 24px;border-radius:12px;background:linear-gradient(180deg,var(--brass-hi),var(--brass) 60%,#a9761f);box-shadow:0 4px 0 #7c5413,0 8px 18px rgba(0,0,0,.4);transition:.1s}
.wc-brass[data-big]{font-size:17px;padding:18px 34px}
.wc-brass:hover{filter:brightness(1.06)}
.wc-brass:active{transform:translateY(3px);box-shadow:0 1px 0 #7c5413}
.wc-brass:disabled{opacity:.45;cursor:not-allowed;transform:none;box-shadow:0 4px 0 #7c5413}
.draft{display:grid;grid-template-columns:300px 1fr 320px;gap:24px;align-items:start}
@media(max-width:1080px){.draft{grid-template-columns:1fr}}
.draft-left{display:flex;flex-direction:column;gap:16px;align-items:center}
.slot-wrap{display:flex;flex-direction:column;gap:16px;align-items:center;width:100%}
.slot-frame{position:relative;width:100%;background:linear-gradient(180deg,#2a1c0a,#160f06);border:3px solid var(--brass);border-radius:18px;padding:18px;box-shadow:0 0 0 4px #3a2406,inset 0 2px 10px rgba(0,0,0,.6)}
.frame-jackpot{animation:jackpotframe .5s ease-in-out infinite alternate}
@keyframes jackpotframe{from{box-shadow:0 0 0 4px #3a2406,inset 0 2px 10px rgba(0,0,0,.6),0 0 8px var(--brass)}to{box-shadow:0 0 0 4px var(--brass-hi),inset 0 2px 10px rgba(0,0,0,.6),0 0 34px var(--brass-hi)}}
.jackpot-tag{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:var(--brass-hi);color:#3a2406;font-family:'Archivo Black',sans-serif;font-size:10px;letter-spacing:1px;padding:3px 12px;border-radius:20px;white-space:nowrap;animation:blink .6s steps(2) infinite}
@keyframes blink{50%{opacity:.45}}
.slot-window{display:flex;align-items:center;justify-content:center;gap:8px;background:#05140c;border-radius:10px;padding:18px 10px;min-height:96px;border:2px solid #0c2e1d}
.slot-x{font-size:26px;color:var(--brass);opacity:.7}
.reel{min-width:74px;text-align:center;font-family:'Archivo Black',sans-serif;font-size:25px;color:var(--brass-hi);overflow:hidden;white-space:nowrap}
.reel-wide{min-width:150px;font-size:18px;line-height:1.1;white-space:normal}
.reel.jackpot{animation:reelglow .5s ease infinite alternate}
@keyframes reelglow{to{text-shadow:0 0 16px var(--brass-hi)}}
.reel-blur{filter:blur(1.4px);opacity:.85;display:inline-block;animation:flick .08s infinite}
@keyframes flick{50%{opacity:.55}}
.slot-caption{text-align:center;margin-top:12px;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.6}
.progress{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.progress span{width:14px;height:14px;border-radius:50%;background:#143726;border:1px solid #23583c}
.progress span.on{background:var(--brass-hi);border-color:var(--brass-hi)}
.pitch{position:relative;aspect-ratio:7/10;width:100%;max-width:520px;margin:0 auto;background:repeating-linear-gradient(0deg,var(--field) 0 9%,var(--field-dark) 9% 18%);border:3px solid #2f7d52;border-radius:14px;overflow:hidden}
.pitch.compact{max-width:380px}
.pitch-lines{position:absolute;inset:14px;border:2px solid rgba(255,255,255,.35);border-radius:6px}
.pitch-lines:before{content:"";position:absolute;left:0;right:0;top:50%;border-top:2px solid rgba(255,255,255,.35)}
.pitch-lines:after{content:"";position:absolute;left:50%;top:50%;width:64px;height:64px;transform:translate(-50%,-50%);border:2px solid rgba(255,255,255,.35);border-radius:50%}
.slot-dot{position:absolute;transform:translate(-50%,-50%);width:84px;text-align:center}
.slot-dot .slot-role{width:36px;height:36px;line-height:34px;margin:0 auto;border-radius:50%;border:2px dashed rgba(255,255,255,.5);font-size:12px;font-weight:700;opacity:.85}
.slot-dot.filled .slot-name{background:#0a1f14ee;border:1px solid var(--brass);border-radius:8px;padding:4px 6px;font-size:11px;font-weight:700;line-height:1.15;box-shadow:0 2px 8px rgba(0,0,0,.5)}
.slot-meta{font-size:10px;margin-top:3px;opacity:.85;display:flex;gap:4px;align-items:center;justify-content:center}
.slot-meta b{color:var(--brass-hi)}
.slot-flag{width:10px;height:7px;border-radius:1px;display:inline-block}
.slot-flag.sm{width:12px;height:8px}
.roster{background:var(--card);border:1px solid #235139;border-radius:14px;overflow:hidden;max-height:560px;display:flex;flex-direction:column}
.roster.empty{padding:28px;opacity:.6;text-align:center;font-size:14px}
.roster-head{display:flex;gap:12px;align-items:center;padding:14px 16px;background:#0a1f14;border-bottom:1px solid #235139}
.roster-flag{width:26px;height:18px;border-radius:3px;flex:none}
.roster-head small{display:block;opacity:.6;font-size:11px;margin-top:2px}
.champ-star{color:var(--brass-hi)}
.roster-list{list-style:none;margin:0;padding:6px;overflow:auto}
.roster-list button{width:100%;display:flex;align-items:center;gap:10px;background:none;border:none;color:#eaf4ec;padding:9px 10px;border-radius:8px;cursor:pointer;text-align:left;font-size:14px}
.roster-list button:hover:not(:disabled){background:#143726}
.roster-list button:disabled{opacity:.32;cursor:not-allowed}
.pos-tag{font-size:10px;font-weight:700;background:#235139;padding:2px 6px;border-radius:4px;min-width:30px;text-align:center}
.pl-name{flex:1}.pl-rt{font-family:'Archivo Black',sans-serif;color:var(--brass-hi);font-size:13px}.full{font-size:10px;opacity:.6}
.slot-choose{padding:18px}.slot-choose .tag{font-size:11px;background:#235139;padding:2px 6px;border-radius:4px}
.slot-opts{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}
.slot-opt{background:#143726;border:1px solid var(--brass);color:#eaf4ec;padding:10px 14px;border-radius:8px;cursor:pointer;font-weight:600}
.slot-opt small{display:block;opacity:.55;font-weight:400;font-size:10px}.slot-opt:hover{background:#1b6b41}
.link{background:none;border:none;color:var(--brass-hi);cursor:pointer;text-decoration:underline;font-size:13px;padding:0}
/* live */
.live{display:flex;flex-direction:column;gap:18px}
.live-scoreboard{background:linear-gradient(180deg,#0a1f14,#06140d);border:2px solid var(--brass);border-radius:16px;padding:18px 20px}
.live-round{font-size:12px;letter-spacing:3px;text-transform:uppercase;opacity:.6;text-align:center}
.live-teams{display:flex;align-items:center;justify-content:center;gap:18px;margin:10px 0}
.lt{font-weight:600;font-size:15px;display:flex;align-items:center;gap:6px}.lt small{opacity:.5}
.lt.me{color:var(--brass-hi)}
.live-score{font-family:'Archivo Black',sans-serif;font-size:44px;color:#fff}.live-score em{font-style:normal;opacity:.4;margin:0 6px}
.live-clock{text-align:center;font-family:'Archivo Black',sans-serif;color:var(--brass-hi);font-size:14px}
.live-bar{height:5px;background:#0c2e1d;border-radius:3px;margin-top:8px;overflow:hidden}
.live-bar span{display:block;height:100%;background:var(--brass-hi);transition:width .1s linear}
.live-grid{display:grid;grid-template-columns:380px 1fr;gap:24px;align-items:start}
@media(max-width:860px){.live-grid{grid-template-columns:1fr}}
.live-feed{background:var(--card);border:1px solid #235139;border-radius:14px;padding:10px;min-height:300px;display:flex;flex-direction:column;gap:6px}
.feed-wait{opacity:.5;text-align:center;padding:30px;font-size:14px}
.feed-ev{display:flex;gap:10px;align-items:flex-start;padding:9px 10px;border-radius:8px;background:#0a1f14;animation:pop .25s ease}
.feed-ev.opp{opacity:.72;background:#1a1410}
@keyframes pop{from{transform:translateY(-6px);opacity:0}}
.ev-min{font-family:'Archivo Black',sans-serif;color:var(--brass-hi);font-size:13px;min-width:30px}
.ev-icon{font-size:14px}
.ev-txt{font-size:14px;line-height:1.3}.ev-txt small{opacity:.6}.ev-txt i{display:block;font-style:normal;opacity:.5;font-size:11px;margin-top:2px}
.feed-final{margin-top:auto;text-align:center;font-weight:700;padding:12px;border-radius:8px}
.feed-final.won{background:#13502f;color:var(--brass-hi)}.feed-final.lost{background:#4a1c18}
.skip{align-self:center}
/* result */
.result{display:flex;flex-direction:column;gap:22px}
.verdict{text-align:center;padding:26px;border-radius:16px;background:var(--card);border:1px solid #235139}
.verdict h2{font-family:'Archivo Black',sans-serif;font-size:clamp(28px,6vw,56px);margin:0;letter-spacing:1px;color:#cdd9d1}
.verdict.win h2{color:var(--brass-hi)}
.verdict.win7 h2{color:var(--brass-hi);text-shadow:0 0 30px rgba(242,205,107,.45);animation:pulse 1.2s ease infinite}
@keyframes pulse{50%{transform:scale(1.03)}}
.verdict p{opacity:.8;margin:10px 0 0}
.strength{margin-top:14px;font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.7}.strength b{color:var(--brass-hi);font-size:18px}
.sec{font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:.6;margin:0 0 12px}
.result-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
@media(max-width:860px){.result-grid{grid-template-columns:1fr}}
.bracket{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}
.tie{display:grid;grid-template-columns:90px 1fr auto;gap:10px;align-items:center;background:var(--card);border:1px solid #235139;border-left-width:4px;padding:12px 14px;border-radius:10px}
.tie.won{border-left-color:#3fa46a}.tie.lost{border-left-color:#b5443a;opacity:.85}
.tie-round{font-size:11px;letter-spacing:1px;text-transform:uppercase;opacity:.6}
.tie-opp{display:flex;align-items:center;gap:8px;font-weight:600}.tie-opp small{opacity:.5}
.tie-score{font-family:'Archivo Black',sans-serif;color:var(--brass-hi)}.tie-score em{font-style:normal;font-size:11px;opacity:.7;color:#eaf4ec}
.stats{width:100%;border-collapse:collapse;font-size:13px}
.stats th{text-align:left;font-size:10px;letter-spacing:1px;text-transform:uppercase;opacity:.5;padding:6px 8px;border-bottom:1px solid #235139}
.stats td{padding:8px;border-bottom:1px solid #163524}.stats td small{opacity:.5}
.stats td.num{text-align:center;font-family:'Archivo Black',sans-serif;color:var(--brass-hi)}
.stats tr.mvp{background:rgba(242,205,107,.08)}
.mvp-tag{font-size:9px;background:var(--brass-hi);color:#3a2406;padding:1px 6px;border-radius:10px;font-weight:700;margin-left:6px;vertical-align:middle}
.result-actions{display:flex;flex-wrap:wrap;gap:14px;align-items:center}
.wc-foot{margin-top:auto;padding-top:18px;border-top:1px solid #1d4a31;font-size:11px;letter-spacing:1px;opacity:.45;text-transform:uppercase}
.chip:disabled{opacity:.35;cursor:not-allowed;border-color:#235139}
.chip:disabled small{color:#c98}
.reroll-btn{background:#143726;border:1px solid var(--brass);color:var(--brass-hi);padding:10px 18px;border-radius:10px;cursor:pointer;font-weight:700;font-size:14px}
.reroll-btn:hover:not(:disabled){background:#1b6b41}
.reroll-btn:disabled{opacity:.35;cursor:not-allowed}
.tie.draw{border-left-color:#c9a23a}
.feed-final.draw{background:#3a3413;color:var(--brass-hi)}
.group-pts{font-size:13px;opacity:.8;padding:6px 4px}.group-pts b{color:var(--brass-hi)}
@media(prefers-reduced-motion:reduce){.reel-blur,.verdict.win7 h2,.frame-jackpot,.jackpot-tag,.reel.jackpot{animation:none}}
`;

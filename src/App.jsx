import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { WC } from "./data.js";

/* =================================================================
   SETTE A ZERO — Costruisci l'XI dei tuoi sogni dai Mondiali 1930-2026
   Gira la slot → ottieni Nazione + Mondiale → scegli UN giocatore per
   uno slot della formazione. Completa l'XI e gioca il torneo: arrivi al 7-0?
   ================================================================= */

// ---- dataset helpers -------------------------------------------------
const YEARS = Object.keys(WC).sort();
const ENTRIES = []; // [{year, team, players}]
for (const y of YEARS) {
  for (const [team, players] of Object.entries(WC[y])) {
    if (players.length >= 11) ENTRIES.push({ year: y, team, players });
  }
}

const POS_GROUP = { GK: "GK", DF: "DF", MF: "MF", FW: "FW" };

// formazioni: slot con ruolo richiesto + posizione su campo (x,y in %)
const FORMATIONS = {
  "4-3-3": [
    ["GK", 50, 92],
    ["DF", 16, 74], ["DF", 38, 78], ["DF", 62, 78], ["DF", 84, 74],
    ["MF", 30, 52], ["MF", 50, 56], ["MF", 70, 52],
    ["FW", 22, 24], ["FW", 50, 18], ["FW", 78, 24],
  ],
  "4-4-2": [
    ["GK", 50, 92],
    ["DF", 16, 74], ["DF", 38, 78], ["DF", 62, 78], ["DF", 84, 74],
    ["MF", 16, 50], ["MF", 38, 54], ["MF", 62, 54], ["MF", 84, 50],
    ["FW", 38, 22], ["FW", 62, 22],
  ],
  "3-5-2": [
    ["GK", 50, 92],
    ["DF", 28, 78], ["DF", 50, 80], ["DF", 72, 78],
    ["MF", 12, 56], ["MF", 34, 52], ["MF", 50, 58], ["MF", 66, 52], ["MF", 88, 56],
    ["FW", 38, 22], ["FW", 62, 22],
  ],
  "4-2-3-1": [
    ["GK", 50, 92],
    ["DF", 16, 74], ["DF", 38, 78], ["DF", 62, 78], ["DF", 84, 74],
    ["MF", 38, 58], ["MF", 62, 58],
    ["MF", 22, 38], ["MF", 50, 40], ["MF", 78, 38],
    ["FW", 50, 18],
  ],
};

// quali ruoli del DB sono accettati in uno slot
const ACCEPTS = {
  GK: ["GK"],
  DF: ["DF"],
  MF: ["MF", "DF", "FW"], // i centrocampi storici sono spesso ibridi
  FW: ["FW", "MF"],
};

const DIFFICULTY = {
  classic: { label: "Classic", hide: false, sub: "rating visibili" },
  memory: { label: "Memory", hide: true, sub: "rating nascosti" },
};

// ---- nazioni colori bandiera (accento per i token) -------------------
function teamHue(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

// ---- rng -------------------------------------------------------------
function pick(arr, rng = Math.random) { return arr[Math.floor(rng() * arr.length)]; }

// =====================================================================
// SIMULAZIONE TORNEO
// Forza XI = media rating pesata leggermente sul reparto offensivo.
// Avversari = XI storici generati pescando da ENTRIES (rosa intera di una nazione).
// Punteggio gol basato su differenza forza, con cap a 7.
// =====================================================================
function squadStrength(squad) {
  const filled = squad.filter(Boolean);
  if (!filled.length) return 0;
  const att = filled.filter(p => p.slot === "FW");
  const mid = filled.filter(p => p.slot === "MF");
  const def = filled.filter(p => p.slot === "DF" || p.slot === "GK");
  const avg = a => a.length ? a.reduce((s, p) => s + p.player.r, 0) / a.length : 70;
  return Math.round(avg(att) * 0.34 + avg(mid) * 0.33 + avg(def) * 0.33);
}

function bestXIfor(entry, formation) {
  // costruisce un XI plausibile per un avversario storico
  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  for (const p of entry.players) (byPos[p.p] || (byPos[p.p] = [])).push(p);
  for (const k in byPos) byPos[k].sort((a, b) => b.r - a.r);
  const used = new Set();
  const out = [];
  for (const [role] of formation) {
    const pool = [];
    for (const acc of ACCEPTS[role]) for (const pl of (byPos[acc] || [])) pool.push(pl);
    pool.sort((a, b) => b.r - a.r);
    const chosen = pool.find(p => !used.has(p)) || pool[0];
    if (chosen) used.add(chosen);
    out.push({ slot: role, player: chosen || { n: "—", p: role, r: 60 } });
  }
  return out;
}

function scoreFromDiff(diff, rng) {
  // diff = forza propria - avversario. mappa su gol attesi.
  const base = 1.1 + Math.max(-1, Math.min(2.4, diff / 6));
  let goals = 0;
  // poisson approssimato
  const L = Math.exp(-Math.max(0.05, base));
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L && k < 12);
  goals = k - 1;
  return Math.max(0, Math.min(7, goals));
}

function simulateTournament(squad, formation, seed) {
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const myStr = squadStrength(squad);
  const rounds = ["Ottavi", "Quarti", "Semifinale", "Finale"];
  // pool avversari: nazioni forti casuali
  const oppPool = [...ENTRIES].sort(() => rng() - 0.5);
  const matches = [];
  let oi = 0;
  let alive = true;
  for (const round of rounds) {
    const opp = oppPool[oi++ % oppPool.length];
    const oppXI = bestXIfor(opp, formation);
    const oppStr = squadStrength(oppXI);
    const diff = myStr - oppStr;
    let gf = scoreFromDiff(diff, rng);
    let ga = scoreFromDiff(-diff, rng);
    // niente pareggi nei ko: spareggio rigori
    let pens = null;
    if (gf === ga) {
      const pf = rng(), pa = rng();
      if (Math.abs(pf - pa) < 0.05) { gf += pf >= pa ? 1 : 0; }
      pens = pf >= pa ? "5-4" : "4-5";
      if (pf < pa) { /* eliminato ai rigori */ }
    }
    const won = pens ? (pens === "5-4") : gf > ga;
    matches.push({ round, opp: opp.team, year: opp.year, gf, ga, pens, won });
    if (!won) { alive = false; break; }
  }
  const champion = alive && matches.length === rounds.length && matches.every(m => m.won);
  const final = matches[matches.length - 1];
  const sevenZero = champion && final.gf >= 7 && final.ga === 0;
  return { matches, champion, sevenZero, myStr };
}

// =====================================================================
// UI PRIMITIVES
// =====================================================================
const FIELD = "#0b6b3a";
const FIELD_DARK = "#075a30";
const BRASS = "#d9a441";
const BRASS_HI = "#f2cd6b";
const INK = "#0a1410";
const CARD = "#0f2418";

function Brass({ children, onClick, disabled, big }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="wc-brass" data-big={big ? "1" : undefined}>
      {children}
    </button>
  );
}

// =====================================================================
// SLOT REEL
// =====================================================================
function SlotMachine({ spinning, result, onSpin, canSpin, roundLabel }) {
  // result = {year, team} | null
  const reelYears = useRef([]);
  const reelTeams = useRef([]);
  if (!reelYears.current.length) {
    reelYears.current = Array.from({ length: 24 }, () => pick(YEARS));
    reelTeams.current = Array.from({ length: 24 }, () => pick(ENTRIES).team);
  }
  const hue = result ? teamHue(result.team) : 200;
  return (
    <div className="slot-wrap">
      <div className="slot-frame">
        <div className="slot-window">
          <Reel spinning={spinning} value={result ? result.year : null} pool={reelYears.current} />
          <div className="slot-x">×</div>
          <Reel spinning={spinning} value={result ? result.team : null} pool={reelTeams.current} wide
            color={`hsl(${hue} 70% 60%)`} />
        </div>
        <div className="slot-caption">{roundLabel}</div>
      </div>
      <Brass onClick={onSpin} disabled={!canSpin || spinning} big>
        {spinning ? "…gira…" : result ? "Gira di nuovo" : "TIRA LA LEVA"}
      </Brass>
    </div>
  );
}

function Reel({ spinning, value, pool, wide, color }) {
  const [display, setDisplay] = useState(value || pool[0]);
  const raf = useRef();
  useEffect(() => {
    if (spinning) {
      let i = 0;
      const tick = () => {
        setDisplay(pool[i % pool.length]);
        i++;
        raf.current = setTimeout(tick, 60 + i * 4);
      };
      tick();
      return () => clearTimeout(raf.current);
    } else if (value) {
      setDisplay(value);
    }
  }, [spinning, value]);
  return (
    <div className={`reel${wide ? " reel-wide" : ""}`} style={color && !spinning ? { color } : undefined}>
      <span className={spinning ? "reel-blur" : ""}>{display}</span>
    </div>
  );
}

// =====================================================================
// PITCH
// =====================================================================
function Pitch({ formation, squad, activeIdx, hide }) {
  return (
    <div className="pitch">
      <div className="pitch-lines" />
      {formation.map(([role, x, y], i) => {
        const filled = squad[i];
        const active = i === activeIdx;
        return (
          <div key={i} className={`slot-dot${filled ? " filled" : ""}${active ? " active" : ""}`}
            style={{ left: `${x}%`, top: `${y}%` }}>
            {filled ? (
              <>
                <div className="slot-name">{filled.player.n}</div>
                <div className="slot-meta">
                  <span className="slot-flag" style={{ background: `hsl(${teamHue(filled.team)} 60% 45%)` }} />
                  {filled.year}{!hide && <b> {filled.player.r}</b>}
                </div>
              </>
            ) : (
              <div className="slot-role">{role}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// APP
// =====================================================================
export default function App() {
  const [phase, setPhase] = useState("setup"); // setup | draft | result
  const [formationKey, setFormationKey] = useState("4-3-3");
  const [difficulty, setDifficulty] = useState("classic");
  const formation = FORMATIONS[formationKey];
  const hide = DIFFICULTY[difficulty].hide;

  const [squad, setSquad] = useState([]); // array allineato a formation, {slot, player, team, year}
  const [spinning, setSpinning] = useState(false);
  const [current, setCurrent] = useState(null); // {year, team, players}
  const [seed] = useState(() => (Math.random() * 1e9) | 0);
  const [sim, setSim] = useState(null);

  const round = squad.filter(Boolean).length;
  const totalSlots = formation.length;
  // primo slot libero che accetta un ruolo presente nella rosa pescata
  const start = () => {
    setSquad(new Array(totalSlots).fill(null));
    setCurrent(null); setSim(null); setPhase("draft");
  };

  const doSpin = () => {
    if (spinning) return;
    setSpinning(true);
    setCurrent(null);
    const dur = 1500 + Math.random() * 700;
    setTimeout(() => {
      setCurrent(pick(ENTRIES));
      setSpinning(false);
    }, dur);
  };

  // slot disponibili per un dato ruolo-DB
  const openSlotsForPlayer = (dbPos) => {
    const out = [];
    formation.forEach(([role], i) => {
      if (squad[i]) return;
      if (ACCEPTS[role].includes(dbPos)) out.push(i);
    });
    return out;
  };

  const choosePlayer = (player, slotIdx) => {
    const next = [...squad];
    next[slotIdx] = { slot: formation[slotIdx][0], player, team: current.team, year: current.year };
    setSquad(next);
    setCurrent(null);
    if (next.filter(Boolean).length === totalSlots) {
      const r = simulateTournament(next, formation, seed);
      setSim(r);
      setTimeout(() => setPhase("result"), 400);
    }
  };

  // ----- RENDER --------------------------------------------------------
  return (
    <div className="wc-app">
      <style>{CSS}</style>
      <Header />
      {phase === "setup" && (
        <Setup {...{ formationKey, setFormationKey, difficulty, setDifficulty, start }} />
      )}
      {phase === "draft" && (
        <Draft {...{
          formation, formationKey, squad, hide, round, totalSlots,
          spinning, current, doSpin, openSlotsForPlayer, choosePlayer,
        }} />
      )}
      {phase === "result" && sim && (
        <Result {...{ squad, formation, formationKey, hide, sim, onRestart: () => setPhase("setup"), onRebuild: start }} />
      )}
      <footer className="wc-foot">11.475 giocatori · 23 Mondiali · 1930–2026 · universosportivo.com</footer>
    </div>
  );
}

function Header() {
  return (
    <header className="wc-head">
      <div className="wc-score">7<span>–</span>0</div>
      <div className="wc-titles">
        <h1>SETTE A ZERO</h1>
        <p>Gira la slot, pesca una nazionale da un Mondiale, ruba il fuoriclasse. Costruisci l'undici e vinci il torneo.</p>
      </div>
    </header>
  );
}

function Setup({ formationKey, setFormationKey, difficulty, setDifficulty, start }) {
  return (
    <div className="panel">
      <div className="field-block">
        <label className="eyebrow">Modulo</label>
        <div className="chips">
          {Object.keys(FORMATIONS).map(k => (
            <button key={k} className={`chip${formationKey === k ? " on" : ""}`}
              onClick={() => setFormationKey(k)}>{k}</button>
          ))}
        </div>
      </div>
      <div className="field-block">
        <label className="eyebrow">Difficoltà</label>
        <div className="chips">
          {Object.keys(DIFFICULTY).map(k => (
            <button key={k} className={`chip${difficulty === k ? " on" : ""}`}
              onClick={() => setDifficulty(k)}>
              {DIFFICULTY[k].label}<small>{DIFFICULTY[k].sub}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="rules">
        <p><b>Come si gioca.</b> Tiri la leva: la slot abbina un <b>anno di Mondiale</b> a una <b>nazionale</b> di quel torneo. Da quella rosa scegli <b>un solo giocatore</b> e lo piazzi in uno slot libero compatibile. Ripeti finché l'undici è completo, poi parte il torneo a eliminazione contro undici storici. L'obiettivo: alzare la coppa e, se ci riesci, chiudere la finale sul <b>7–0</b>.</p>
      </div>
      <Brass onClick={start} big>Inserisci il gettone</Brass>
    </div>
  );
}

function Draft({ formation, formationKey, squad, hide, round, totalSlots,
  spinning, current, doSpin, openSlotsForPlayer, choosePlayer }) {
  const [pending, setPending] = useState(null); // player in attesa di slot
  useEffect(() => { setPending(null); }, [current]);

  const roundLabel = `Scelta ${round + 1} di ${totalSlots}`;
  return (
    <div className="draft">
      <div className="draft-left">
        <SlotMachine spinning={spinning} result={current}
          onSpin={doSpin} canSpin={round < totalSlots} roundLabel={roundLabel} />
        <div className="progress">
          {formation.map((_, i) => <span key={i} className={squad[i] ? "on" : ""} />)}
        </div>
      </div>

      <div className="draft-mid">
        <Pitch formation={formation} squad={squad} hide={hide} activeIdx={-1} />
      </div>

      <div className="draft-right">
        {current ? (
          <div className="roster">
            <div className="roster-head">
              <span className="roster-flag" style={{ background: `hsl(${teamHue(current.team)} 60% 45%)` }} />
              <div>
                <b>{current.team}</b>
                <small>Mondiale {current.year} · {current.players.length} convocati</small>
              </div>
            </div>
            {pending ? (
              <div className="slot-choose">
                <p>Dove gioca <b>{pending.n}</b> <span className="tag">{pending.p}</span>?</p>
                <div className="slot-opts">
                  {openSlotsForPlayer(pending.p).map(i => (
                    <button key={i} className="slot-opt" onClick={() => choosePlayer(pending, i)}>
                      {formation[i][0]} <small>slot {i + 1}</small>
                    </button>
                  ))}
                </div>
                <button className="link" onClick={() => setPending(null)}>← un altro giocatore</button>
              </div>
            ) : (
              <ul className="roster-list">
                {[...current.players].sort((a, b) => b.r - a.r).map((p, i) => {
                  const slots = openSlotsForPlayer(p.p);
                  const dis = slots.length === 0;
                  return (
                    <li key={i}>
                      <button disabled={dis} onClick={() => {
                        if (slots.length === 1) choosePlayer(p, slots[0]);
                        else setPending(p);
                      }}>
                        <span className="pos-tag">{p.p}</span>
                        <span className="pl-name">{p.n}</span>
                        {!hide && <span className="pl-rt">{p.r}</span>}
                        {dis && <span className="full">pieno</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="roster empty">
            <p>{round === 0 ? "Tira la leva per pescare la prima nazionale." : "Tira ancora per la prossima scelta."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Result({ squad, formation, formationKey, hide, sim, onRestart, onRebuild }) {
  const headline = sim.sevenZero ? "SETTE A ZERO!" : sim.champion ? "CAMPIONI DEL MONDO" : "Eliminati";
  const sub = sim.sevenZero
    ? "Hai chiuso la finale 7–0. Impresa leggendaria."
    : sim.champion
      ? "Coppa alzata — ma la finale non è finita 7–0. Riprova."
      : `Fuori ai ${sim.matches[sim.matches.length - 1].round}. Forza squadra: ${sim.myStr}.`;

  const [copied, setCopied] = useState(false);
  const shareText = useMemo(() => {
    const line = sim.matches.map(m => `${m.round}: ${m.gf}-${m.ga}${m.pens ? ` (rig ${m.pens})` : ""}`).join(" · ");
    return `Sette a Zero ⚽ ${headline}\n${line}\nForza XI ${sim.myStr} — gioca su universosportivo.com`;
  }, [sim, headline]);

  return (
    <div className="result">
      <div className={`verdict${sim.sevenZero ? " win7" : sim.champion ? " win" : ""}`}>
        <h2>{headline}</h2>
        <p>{sub}</p>
        <div className="strength">Forza dell'undici <b>{sim.myStr}</b></div>
      </div>

      <div className="result-grid">
        <div>
          <Pitch formation={formation} squad={squad} hide={hide} activeIdx={-1} />
        </div>
        <div className="bracket">
          {sim.matches.map((m, i) => (
            <div key={i} className={`tie${m.won ? " won" : " lost"}`}>
              <span className="tie-round">{m.round}</span>
              <span className="tie-opp">
                <span className="roster-flag sm" style={{ background: `hsl(${teamHue(m.opp)} 60% 45%)` }} />
                {m.opp} <small>'{m.year.slice(2)}</small>
              </span>
              <span className="tie-score">{m.gf}–{m.ga}{m.pens && <em> r{m.pens}</em>}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="result-actions">
        <Brass onClick={() => { navigator.clipboard?.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
          {copied ? "Copiato!" : "Copia risultato"}
        </Brass>
        <Brass onClick={onRebuild}>Nuovo undici</Brass>
        <button className="link" onClick={onRestart}>Cambia modulo / difficoltà</button>
      </div>
    </div>
  );
}

// =====================================================================
// CSS
// =====================================================================
const CSS = `
:root{
  --field:${FIELD}; --field-dark:${FIELD_DARK}; --brass:${BRASS};
  --brass-hi:${BRASS_HI}; --ink:${INK}; --card:${CARD};
}
*{box-sizing:border-box}
.wc-app{
  min-height:100vh; margin:0; color:#eaf4ec;
  background:
    radial-gradient(120% 80% at 50% -10%, #15402a 0%, #0a2418 55%, #07160e 100%);
  font-family:'Inter','Helvetica Neue',system-ui,sans-serif;
  padding:clamp(16px,3vw,40px); display:flex; flex-direction:column; gap:28px;
}
.wc-head{display:flex; align-items:center; gap:24px; border-bottom:1px solid #1d4a31; padding-bottom:20px}
.wc-score{
  font-family:'Archivo Black','Arial Black',sans-serif; font-size:clamp(48px,9vw,92px);
  line-height:.8; letter-spacing:-2px; color:var(--brass-hi);
  text-shadow:0 2px 0 #8a5e16, 0 0 26px rgba(242,205,107,.25);
}
.wc-score span{color:#eaf4ec; opacity:.5; margin:0 -.06em}
.wc-titles h1{
  font-family:'Archivo Black','Arial Black',sans-serif; margin:0; font-size:clamp(20px,3.4vw,34px);
  letter-spacing:3px;
}
.wc-titles p{margin:6px 0 0; max-width:52ch; opacity:.75; font-size:14px; line-height:1.5}

.eyebrow{font-size:11px; letter-spacing:3px; text-transform:uppercase; opacity:.6; display:block; margin-bottom:10px}
.panel{max-width:720px; display:flex; flex-direction:column; gap:26px}
.field-block{}
.chips{display:flex; flex-wrap:wrap; gap:10px}
.chip{
  background:var(--card); border:1px solid #235139; color:#dfeee4; cursor:pointer;
  padding:12px 18px; border-radius:10px; font-size:15px; font-weight:600;
  display:flex; flex-direction:column; gap:2px; transition:.15s;
}
.chip small{font-weight:400; opacity:.55; font-size:11px}
.chip:hover{border-color:var(--brass)}
.chip.on{background:linear-gradient(180deg,#1b6b41,#125632); border-color:var(--brass-hi); box-shadow:0 0 0 1px var(--brass-hi) inset}
.rules{background:rgba(0,0,0,.22); border-left:3px solid var(--brass); padding:16px 18px; border-radius:0 10px 10px 0; font-size:14px; line-height:1.6; opacity:.92}
.rules b{color:var(--brass-hi)}

.wc-brass{
  align-self:flex-start; cursor:pointer; border:none;
  font-family:'Archivo Black',sans-serif; letter-spacing:1.5px; text-transform:uppercase;
  color:#3a2406; font-size:14px; padding:14px 24px; border-radius:12px;
  background:linear-gradient(180deg,var(--brass-hi),var(--brass) 60%,#a9761f);
  box-shadow:0 4px 0 #7c5413, 0 8px 18px rgba(0,0,0,.4); transition:.1s;
}
.wc-brass[data-big]{font-size:17px; padding:18px 34px}
.wc-brass:hover{filter:brightness(1.06)}
.wc-brass:active{transform:translateY(3px); box-shadow:0 1px 0 #7c5413}
.wc-brass:disabled{opacity:.45; cursor:not-allowed; transform:none; box-shadow:0 4px 0 #7c5413}

/* draft layout */
.draft{display:grid; grid-template-columns:300px 1fr 320px; gap:24px; align-items:start}
@media(max-width:1080px){.draft{grid-template-columns:1fr; }}
.draft-left{display:flex; flex-direction:column; gap:16px; align-items:center}

/* slot machine */
.slot-wrap{display:flex; flex-direction:column; gap:16px; align-items:center; width:100%}
.slot-frame{
  width:100%; background:linear-gradient(180deg,#2a1c0a,#160f06);
  border:3px solid var(--brass); border-radius:18px; padding:18px;
  box-shadow:0 0 0 4px #3a2406, inset 0 2px 10px rgba(0,0,0,.6);
}
.slot-window{
  display:flex; align-items:center; justify-content:center; gap:8px;
  background:#05140c; border-radius:10px; padding:18px 10px; min-height:96px;
  border:2px solid #0c2e1d;
}
.slot-x{font-size:26px; color:var(--brass); opacity:.7}
.reel{
  min-width:74px; text-align:center; font-family:'Archivo Black',sans-serif;
  font-size:26px; color:var(--brass-hi); overflow:hidden; white-space:nowrap;
}
.reel-wide{min-width:150px; font-size:18px; line-height:1.1; white-space:normal}
.reel-blur{filter:blur(1.4px); opacity:.85; display:inline-block; animation:flick .08s infinite}
@keyframes flick{50%{opacity:.55}}
.slot-caption{text-align:center; margin-top:12px; font-size:12px; letter-spacing:2px; text-transform:uppercase; opacity:.6}

.progress{display:flex; flex-wrap:wrap; gap:6px; justify-content:center}
.progress span{width:14px; height:14px; border-radius:50%; background:#143726; border:1px solid #23583c}
.progress span.on{background:var(--brass-hi); border-color:var(--brass-hi)}

/* pitch */
.pitch{
  position:relative; aspect-ratio:7/10; width:100%; max-width:520px; margin:0 auto;
  background:repeating-linear-gradient(0deg,var(--field) 0 9%, var(--field-dark) 9% 18%);
  border:3px solid #2f7d52; border-radius:14px; overflow:hidden;
}
.pitch-lines{position:absolute; inset:14px; border:2px solid rgba(255,255,255,.35); border-radius:6px}
.pitch-lines:before{content:""; position:absolute; left:0; right:0; top:50%; border-top:2px solid rgba(255,255,255,.35)}
.pitch-lines:after{content:""; position:absolute; left:50%; top:50%; width:64px; height:64px; transform:translate(-50%,-50%); border:2px solid rgba(255,255,255,.35); border-radius:50%}
.slot-dot{
  position:absolute; transform:translate(-50%,-50%); width:84px; text-align:center;
}
.slot-dot .slot-role{
  width:36px; height:36px; line-height:34px; margin:0 auto; border-radius:50%;
  border:2px dashed rgba(255,255,255,.5); font-size:12px; font-weight:700; opacity:.85;
}
.slot-dot.filled .slot-name{
  background:#0a1f14ee; border:1px solid var(--brass); border-radius:8px; padding:4px 6px;
  font-size:11px; font-weight:700; line-height:1.15; box-shadow:0 2px 8px rgba(0,0,0,.5);
}
.slot-meta{font-size:10px; margin-top:3px; opacity:.85; display:flex; gap:4px; align-items:center; justify-content:center}
.slot-meta b{color:var(--brass-hi)}
.slot-flag{width:10px; height:7px; border-radius:1px; display:inline-block}
.slot-flag.sm{width:12px;height:8px}
.slot-dot.active .slot-role{border-color:var(--brass-hi); color:var(--brass-hi)}

/* roster */
.roster{background:var(--card); border:1px solid #235139; border-radius:14px; overflow:hidden; max-height:560px; display:flex; flex-direction:column}
.roster.empty{padding:28px; opacity:.6; text-align:center; font-size:14px}
.roster-head{display:flex; gap:12px; align-items:center; padding:14px 16px; background:#0a1f14; border-bottom:1px solid #235139}
.roster-flag{width:26px; height:18px; border-radius:3px; flex:none}
.roster-head small{display:block; opacity:.6; font-size:11px; margin-top:2px}
.roster-list{list-style:none; margin:0; padding:6px; overflow:auto}
.roster-list button{
  width:100%; display:flex; align-items:center; gap:10px; background:none; border:none;
  color:#eaf4ec; padding:9px 10px; border-radius:8px; cursor:pointer; text-align:left; font-size:14px;
}
.roster-list button:hover:not(:disabled){background:#143726}
.roster-list button:disabled{opacity:.32; cursor:not-allowed}
.pos-tag{font-size:10px; font-weight:700; background:#235139; padding:2px 6px; border-radius:4px; min-width:30px; text-align:center}
.pl-name{flex:1}
.pl-rt{font-family:'Archivo Black',sans-serif; color:var(--brass-hi); font-size:13px}
.full{font-size:10px; opacity:.6}
.slot-choose{padding:18px}
.slot-choose .tag{font-size:11px; background:#235139; padding:2px 6px; border-radius:4px}
.slot-opts{display:flex; flex-wrap:wrap; gap:8px; margin:14px 0}
.slot-opt{background:#143726; border:1px solid var(--brass); color:#eaf4ec; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:600}
.slot-opt small{display:block; opacity:.55; font-weight:400; font-size:10px}
.slot-opt:hover{background:#1b6b41}
.link{background:none; border:none; color:var(--brass-hi); cursor:pointer; text-decoration:underline; font-size:13px; padding:0}

/* result */
.result{display:flex; flex-direction:column; gap:24px}
.verdict{text-align:center; padding:26px; border-radius:16px; background:var(--card); border:1px solid #235139}
.verdict h2{font-family:'Archivo Black',sans-serif; font-size:clamp(28px,6vw,56px); margin:0; letter-spacing:1px; color:#cdd9d1}
.verdict.win h2{color:var(--brass-hi)}
.verdict.win7 h2{color:var(--brass-hi); text-shadow:0 0 30px rgba(242,205,107,.45); animation:pulse 1.2s ease infinite}
@keyframes pulse{50%{transform:scale(1.03)}}
.verdict p{opacity:.8; margin:10px 0 0}
.strength{margin-top:14px; font-size:13px; letter-spacing:1px; text-transform:uppercase; opacity:.7}
.strength b{color:var(--brass-hi); font-size:18px}
.result-grid{display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:start}
@media(max-width:860px){.result-grid{grid-template-columns:1fr}}
.bracket{display:flex; flex-direction:column; gap:10px}
.tie{display:grid; grid-template-columns:90px 1fr auto; gap:10px; align-items:center;
  background:var(--card); border:1px solid #235139; border-left-width:4px; padding:12px 14px; border-radius:10px}
.tie.won{border-left-color:#3fa46a}
.tie.lost{border-left-color:#b5443a; opacity:.85}
.tie-round{font-size:11px; letter-spacing:1px; text-transform:uppercase; opacity:.6}
.tie-opp{display:flex; align-items:center; gap:8px; font-weight:600}
.tie-opp small{opacity:.5}
.tie-score{font-family:'Archivo Black',sans-serif; color:var(--brass-hi)}
.tie-score em{font-style:normal; font-size:11px; opacity:.7; color:#eaf4ec}
.result-actions{display:flex; flex-wrap:wrap; gap:14px; align-items:center}

.wc-foot{margin-top:auto; padding-top:18px; border-top:1px solid #1d4a31; font-size:11px; letter-spacing:1px; opacity:.45; text-transform:uppercase}
@media (prefers-reduced-motion: reduce){ .reel-blur,.verdict.win7 h2{animation:none} }
`;

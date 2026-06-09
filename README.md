# Sette a Zero ⚽

Gira la slot, pesca una nazionale da un Mondiale (1930–2026), ruba un giocatore dalla sua rosa e costruisci l'undici dei sogni. Completa la formazione e gioca il torneo a eliminazione: riesci a chiudere la finale sul **7–0**?

Ispirato a 7a0 (sete a zero), costruito sull'architettura del 38-0.

## Dataset
- 11.475 giocatori reali, 505 rose, 23 edizioni del Mondiale (1930–2026)
- Rating effettivo per ogni giocatore (fonte: Database Rose Mondiali RATED)
- `src/data.js` generato dall'export Excel

## Stack
React 18 + Vite. File singolo `src/App.jsx`, nessuna dipendenza UI esterna.

## Sviluppo
```bash
npm install
npm run dev
```

## Deploy su Vercel
1. Push del repo su GitHub
2. Su Vercel: **New Project → importa il repo**
3. Framework rilevato automaticamente (Vite). Build `npm run build`, output `dist`
4. Deploy

## Modalità
- **Classic** — rating visibili durante il draft
- **Memory** — rating nascosti, devi riconoscere i campioni a memoria

Moduli: 4-3-3, 4-4-2, 3-5-2, 4-2-3-1.

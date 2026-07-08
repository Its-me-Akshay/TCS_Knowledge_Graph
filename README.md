# Sector Exposure Explorer

An interactive knowledge graph that lets you explore commercial lending concentration
patterns across industry sectors, lenders, and loan outcomes — three-hop traversals,
visualized live, with plain-English synthesized answers instead of raw tables.

**Live app:** https://tcs-knowledge-graph.vercel.app/

> ⚠️ **Data note:** This build runs on a synthetic, illustrative dataset (350 loans)
> structurally modeled on the real SBA 7(a) FOIA public dataset schema. No row
> represents a real loan, borrower, or institution. See [DATA_METHODOLOGY.md](./DATA_METHODOLOGY.md)
> for the full explanation and how to swap in real data.

## What this is

Pick a sector, a lender, or "Charged Off" status, and the app performs a real
multi-hop graph traversal (Sector → Borrowers → Loans → Lenders, or the reverse)
and returns a synthesized, plain-language answer — visualized as an animated,
color-and-shape-coded network graph.

## Tech stack

- **Next.js (App Router)** + React
- **Tailwind CSS**
- **react-force-graph-2d** for the interactive network visualization
- **Static `public/data.json`** — no backend, no database, no live API calls
- Deployed on **Vercel**

See [TECH_STACK.md](./TECH_STACK.md) for the full reasoning behind each choice.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Regenerating the dataset

```bash
cd scripts
node gen_data.js
```

This writes `public/data.json`. See `gen_data.js` for the generation logic and
`DATA_METHODOLOGY.md` for the sampling/labeling rules it follows.

## Project structure

```
app/
  page.js         -- main UI + query logic
  layout.js        -- root layout, error-safe script guard
  providers.js      -- app-level providers (if any)
  globals.css       -- theme + animations
lib/
  graphUtils.js      -- fuzzy match, graph builders, formatting helpers
public/
  data.json        -- the dataset (generated, do not hand-edit)
scripts/
  gen_data.js       -- deterministic dataset generator
```

## Documents in this repo

- [CITATION_LEDGER.md](./CITATION_LEDGER.md) — every factual/structural claim, sourced
- [DATA_METHODOLOGY.md](./DATA_METHODOLOGY.md) — dataset provenance and sampling rules
- [ONE_PAGER.md](./ONE_PAGER.md) — plain-language business summary
- [WHAT_I_CUT.md](./WHAT_I_CUT.md) — scope decisions and why

# Tech Stack — What Was Used and Why

## Frontend Framework: React (via Next.js App Router)
Component-based state management maps cleanly onto the query/search/animation
state this app needs. Next.js was chosen over plain Vite+React for this
deployment because it's zero-config on Vercel and handles static asset serving
(`public/data.json`) natively.

## Styling: Tailwind CSS
Utility classes let the two-pane responsive layout (`flex-col md:flex-row`) be
built directly in JSX without separate stylesheet files — fast to iterate on
within a short build window.

## Graph Visualization: react-force-graph-2d
Purpose-built physics-based network rendering as a drop-in React component.
Supports custom canvas node rendering (used here for shape-based accessibility
encoding — square/triangle/circle, not color alone), click/drag/zoom out of the
box, and sequenced highlight animation for proving multi-hop traversal visually.
**2D, not 3D** — `ForceGraph2D` renders on standard HTML5 Canvas (not WebGL),
which is faster, more mobile-friendly, and avoids WebGL-support edge cases
entirely.

## Data Layer: Static `data.json` — no database
The dataset is small and fixed (350 loans, 5 entity types) — a database adds
connection/auth/cold-start risk with no benefit at this scale. The file ships
inside the deployed bundle and loads with no live dependency.

**Considered and rejected: Neo4j (live).** Real graph-database experience
informed the entity/relationship modeling, but a live Neo4j connection
reintroduces exactly the deployment fragility (auth, cold starts, network
dependency) a fixed 350-row dataset doesn't need. See `WHAT_I_CUT.md`.

## Data Source: SBA 7(a) FOIA schema (synthetic instance data)
Modeled on the real, public SBA 7(a) FOIA loan dataset schema and the NAICS
industry classification standard. The specific loan/lender/borrower data in
this build is synthetic — see `DATA_METHODOLOGY.md` for the full disclosure
and the real-data swap path (`scripts/build_real_dataset.py`).

## Hosting: Vercel
Zero-config deployment from GitHub, free tier, no server management. Since the
app is fully static/client-side, Vercel only serves files — no "cold backend"
risk.

## Search/Input: Custom logic, no external library
- **Autocomplete**: populated dynamically from `data.json` at runtime, so it
  can never drift out of sync with the actual dataset.
- **Fuzzy match**: a true Levenshtein-distance implementation (not a
  substring-only check, which fails on transpositions/missing letters), with
  a fast substring-match path tried first.
- **No library (e.g. Fuse.js)**: the search space is a few dozen known values —
  a full fuzzy-search library would be disproportionate for this scope.

## Reliability Layer
- **React Error Boundary** — catches unexpected JS errors (e.g. a malformed
  data row) with a friendly fallback instead of a blank crashed screen.
- **Debounced search input** (200ms) and an **animation lock** (`isAnimating`)
  that disables query buttons mid-traversal, preventing overlapping/duplicate
  renders from rapid clicks.

## The throughline
Minimize live dependencies (no backend, no live database, no external API
calls at runtime) while maximizing perceived interactivity through client-side
techniques — animation sequencing, physics-based rendering, instant static
data access. This is the same trade-off documented in `WHAT_I_CUT.md`.

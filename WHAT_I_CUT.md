# What I Cut and Why

To ship a finished, reliable tool within the time budget, I made these deliberate
scope cuts:

1. **Real-time SBA data ingestion, in favor of a static synthetic dataset.**
   The real SBA 7(a) FOIA file is a 143.8 MB bulk CSV with no filtered API access.
   Building a live ingestion pipeline (or a live database) would have introduced
   real deployment risk — connection timeouts, cold starts, external service
   outages — during evaluation. Instead, I built the data as a static JSON file
   with structure identical to the real schema, and wrote a separate,
   ready-to-run script (`build_real_dataset.py`) that produces a real-data version
   from the actual downloaded file with no frontend changes required. This
   eliminates external points of failure and keeps the deployed app's response
   near-instant, with no live-service dependency.

2. **External database (e.g. Neo4j), in favor of client-side JSON traversal.**
   I have prior Neo4j experience and considered it for the added credibility of a
   "real" graph database, but a live database connection reintroduces the exact
   failure modes (auth, cold starts, network dependency) that a 350-row, fixed
   dataset doesn't need. The schema and query logic were still designed the way a
   graph database would model them (see the entity/relationship structure in
   DATA_METHODOLOGY.md); they're just executed as plain JS traversals here.

3. **Free-text open-ended search, in favor of a bounded autocomplete + fuzzy-match input.**
   An open text box inviting any query would require handling arbitrary
   natural-language input reliably, which is disproportionate for a fixed, known
   set of sectors and lenders. Instead, the input is autocomplete-first with a
   true Levenshtein-distance fallback for typos — this keeps failure modes
   predictable and testable.

4. **A 4th query type (lender-vs-lender comparison).**
   Three query types (sector traversal, lender drill-down, status isolation) meet
   the brief's requirement and each demonstrates a genuinely different traversal
   pattern. A comparison view was scoped out to protect finishing quality on the
   three that shipped, rather than risk an unfinished fourth.

# Sector Exposure Explorer — One-Pager

### What This Is
The Sector Exposure Explorer is an interactive graph analytics tool that helps
identify localized credit risk concentration within commercial lending portfolios.
It turns a flat loan spreadsheet into a traversable network, connecting industries,
borrowers, loans, and lenders so a concentration pattern is visible in three clicks
instead of a manual spreadsheet cross-reference. This build runs on a synthetic,
illustrative dataset structurally modeled on the real SBA 7(a) FOIA schema.

### The Specific Problem It Addresses
Loan portfolio data is usually reviewed in silos — by borrower, by lender, or by
sector — which makes it slow and easy to miss when a single lender has become
heavily concentrated in one volatile industry. Spotting that pattern normally means
manually cross-referencing separate borrower, loan, and lender records. This tool
performs that cross-reference instantly as a graph traversal and states the result
in plain language.

### Who Cares and Why
Credit analysts, portfolio risk managers, and small-business lending researchers
would care about a tool like this because it turns a multi-step manual lookup into
a single click, and answers the specific question ("is this lender over-exposed to
one industry?") directly, rather than requiring the analyst to build that answer
themselves from raw rows.

### One Thing I'd Build Next
With another week, the priority would be replacing the synthetic dataset with a
real, filtered slice of the actual SBA 7(a) FOIA data (the pipeline for this,
`build_real_dataset.py`, already exists) and adding a fourth query type comparing
two lenders side-by-side.

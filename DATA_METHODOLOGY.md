# Dataset Provenance and Sampling Methodology

## Summary

The data powering this visualization is **synthetic**. It is structurally modeled
on the real, publicly disclosed US Small Business Administration (SBA) 7(a) FOIA
loan dataset schema, but no row represents a real loan, a real borrower, or a real
lending institution.

## Why synthetic, not real, for this build

The real SBA 7(a) FOIA dataset (https://data.sba.gov/en/dataset/7-a-504-foia) is a
143.8 MB bulk CSV covering all disclosed loans nationally since FY2020. Within this
project's time and infrastructure constraints, a synthetic dataset with the same
field structure was used to unblock frontend development. `scripts/build_real_dataset.py`
(a separate script, not part of the deployed app) contains a complete, ready-to-run
pipeline for producing a real-data version of `data.json` from the actual downloaded
CSV — see "Swapping in real data" below.

## Schema (mirrors real SBA 7(a) fields)

| Entity | Real-world field it's modeled on | Real field name |
|---|---|---|
| Borrower | Business receiving the loan | `BorrName` |
| Lender | Bank issuing the loan | `BankName` |
| Loan | Individual loan record | `GrossApproval`, `ApprovalDate`, `LoanStatus` |
| Sector | Industry classification | `NaicsCode` (2-digit prefix) |
| Status | Loan outcome | `LoanStatus` (Active / Charged Off / Other) |

## Sector → NAICS mapping used

| Sector (this project) | NAICS 2-digit codes |
|---|---|
| Manufacturing | 31, 32, 33 |
| Retail | 44, 45 |
| Technology | 51–54 (modeled range) |
| Healthcare | 62 |

## Sampling parameters

- **State:** Texas (TX) — chosen as a single, named, realistic regional scope
- **Fiscal year:** 2023
- **Sample size:** 350 loans, purposively distributed across 4 sectors
  (Manufacturing 42, Retail 108, Technology 90, Healthcare 110) to guarantee
  visible, demonstrable cross-entity overlap for all three query types
- **Generation method:** deterministic PRNG (fixed seed) in `scripts/gen_data.js` —
  reproducible, not a live random draw, and not claimed to be a statistically
  representative sample of real SBA lending activity
- **Lender names:** entirely fictional; checked against real U.S. financial
  institutions to avoid naming collisions (4 originally-drafted names were found
  to match or closely resemble real banks and were replaced before this version)
- **Individual/sole-proprietor exclusion:** not applicable to this synthetic set,
  since no row is a real disclosure — but the real-data pipeline
  (`build_real_dataset.py`) enforces this exclusion via SBA's own `BusinessType`
  field, for privacy, before any real data would be loaded

## Swapping in real data

1. Download the real file: https://data.sba.gov/en/dataset/7-a-504-foia
2. Run `build_real_dataset.py` (see its header comments for exact steps)
3. Replace `public/data.json` with its output
4. No frontend code changes are required — the schema is identical

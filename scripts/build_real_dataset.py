"""
build_real_dataset.py

Builds data.json (the knowledge-graph dataset for the Sector Exposure Explorer)
from the REAL, official SBA 7(a) FOIA loan dataset.

WHY THIS SCRIPT EXISTS
-----------------------
The real SBA 7(a) FOIA file is a 143.8 MB CSV hosted on data.sba.gov. It's too
large and on a domain that can't be fetched automatically in this pipeline, so
this script is designed for YOU to run locally after downloading the real file.
This keeps every number in your Citation Ledger 100% traceable to a real,
verifiable public record -- nothing in data.json is invented.

STEP 1 - Download the real files
----------------------------------
1. Loan data (FY2020-Present CSV, ~144MB):
   https://data.sba.gov/en/dataset/7-a-504-foia
   -> click "FOIA - 7(a) (FY2020-Present)" -> Download

2. Official data dictionary (defines every column below):
   https://www.sba.gov/sites/default/files/2018-08/7a_504_FOIA%20Data%20Dictionary.xlsx

Place the downloaded CSV in this same folder and update RAW_CSV_PATH below.

⚠️  FILE SIZE WARNING -- READ BEFORE RUNNING
------------------------------------------------
The raw CSV is ~140MB+. GitHub hard-blocks any single file over 100MB.
NEVER run `git add` on the raw CSV -- .gitignore in this repo already
excludes *.csv for exactly this reason. Only commit the OUTPUT data.json,
which will be small (tens to a few hundred KB) regardless of how large the
raw file is, because TARGET_SAMPLE_SIZE below caps the output row count
before anything is written. You do not need to filter to an unusually
narrow county/date range to control output size -- the row cap already
does that. Just make sure the raw CSV itself stays out of git.

STEP 2 - Install dependencies
--------------------------------
pip install pandas

STEP 3 - Run
--------------
python build_real_dataset.py

Output: data.json + validation_report.txt in this folder.

REAL COLUMN NAMES USED (verified against the official SBA FOIA schema)
-------------------------------------------------------------------------
BorrName, BorrCity, BorrState, BankName, GrossApproval, ApprovalDate,
ApprovalFiscalYear, NaicsCode, NaicsDescription, BusinessType, LoanStatus,
ChargeOffDate, GrossChargeOffAmount, ProjectState, ProjectCounty, JobsSupported
"""

import pandas as pd
import json
import hashlib
import sys
from pathlib import Path

# ----------------------------------------------------------------------------
# CONFIG - adjust these to change scope (state, year, sectors, sample size)
# ----------------------------------------------------------------------------
RAW_CSV_PATH = "foia-7a-fy2020-present.csv"   # <- update to your downloaded filename
TARGET_STATE = "TX"
TARGET_FISCAL_YEAR = 2023
TARGET_SAMPLE_SIZE = 350
RANDOM_SEED = 42  # fixed seed -> reproducible selection, defensible in methodology doc

# NAICS 2-digit prefix -> Sector name (cite: census.gov/naics)
SECTOR_MAP = {
    "31": "Manufacturing", "32": "Manufacturing", "33": "Manufacturing",
    "44": "Retail Trade", "45": "Retail Trade",
    "51": "Information/Technology",
    "62": "Healthcare and Social Assistance",
}

REQUIRED_COLUMNS = [
    "BorrName", "BorrCity", "BorrState", "BankName", "GrossApproval",
    "ApprovalDate", "ApprovalFiscalYear", "NaicsCode", "NaicsDescription",
    "BusinessType", "LoanStatus", "ProjectState", "ProjectCounty",
]


def load_and_filter(csv_path: str) -> pd.DataFrame:
    """Load only the columns we need (memory-safe for a 140MB+ file) and filter
    to the target state + fiscal year, dropping rows with missing critical fields."""
    print(f"Reading {csv_path} (columns limited to reduce memory footprint)...")

    usecols = REQUIRED_COLUMNS + ["ChargeOffDate", "GrossChargeOffAmount", "JobsSupported"]

    chunks = []
    for chunk in pd.read_csv(csv_path, usecols=lambda c: c in usecols,
                              dtype=str, chunksize=200_000, low_memory=False):
        # Filter early, per chunk, to keep memory low
        chunk = chunk[chunk["ProjectState"].fillna("").str.strip() == TARGET_STATE]
        chunk = chunk[chunk["ApprovalFiscalYear"].fillna("").str.strip() == str(TARGET_FISCAL_YEAR)]
        chunks.append(chunk)

    df = pd.concat(chunks, ignore_index=True)
    print(f"Rows after state/year filter: {len(df)}")

    # Drop rows missing any field the graph depends on
    before = len(df)
    df = df.dropna(subset=["BorrName", "BankName", "NaicsCode", "GrossApproval", "LoanStatus"])
    df = df[df["BorrName"].str.strip() != ""]
    df = df[df["BankName"].str.strip() != ""]
    print(f"Dropped {before - len(df)} rows with missing critical fields.")

    return df


def remove_individual_filers(df: pd.DataFrame) -> pd.DataFrame:
    """Privacy rule: exclude sole proprietors / individual-name borrowers.
    SBA's own BusinessType field marks these -- no name-guessing heuristics needed."""
    before = len(df)
    df = df[~df["BusinessType"].fillna("").str.upper().str.contains("INDIVIDUAL")]
    print(f"Removed {before - len(df)} individual/sole-proprietor rows (privacy rule).")
    return df


def map_sector(naics_code: str) -> str | None:
    if not naics_code or not naics_code[:2].isdigit():
        return None
    return SECTOR_MAP.get(naics_code[:2])


def select_sample(df: pd.DataFrame, n: int, seed: int) -> pd.DataFrame:
    """Purposive selection (NOT claimed as random): prioritizes rows that create
    real cross-entity overlap (repeat lenders across sectors), so the graph has
    visible, demonstrable traversal patterns rather than a sparse/disconnected sample."""
    df = df.copy()
    df["sector"] = df["NaicsCode"].apply(map_sector)
    df = df.dropna(subset=["sector"])
    print(f"Rows after sector mapping: {len(df)}")

    # Prioritize lenders that appear multiple times (creates meaningful traversal)
    lender_counts = df["BankName"].value_counts()
    df["lender_frequency"] = df["BankName"].map(lender_counts)
    df = df.sort_values("lender_frequency", ascending=False)

    if len(df) > n:
        # take a mix: top-frequency rows + a random tail for variety, fixed seed
        top_half = df.head(n // 2)
        rest = df.iloc[n // 2:].sample(n=min(n - n // 2, len(df) - n // 2),
                                        random_state=seed)
        df = pd.concat([top_half, rest])
    return df.reset_index(drop=True)


def build_graph(df: pd.DataFrame) -> dict:
    nodes = []
    links = []
    seen_node_ids = set()

    def add_node(node_id, node_type, label, **attrs):
        if node_id not in seen_node_ids:
            nodes.append({"id": node_id, "type": node_type, "label": label, **attrs})
            seen_node_ids.add(node_id)

    # Sector nodes (fixed set, always present even if a sector ends up with 0 loans
    # after sampling -- this keeps dropdowns and the "no results" edge case honest)
    sector_naics = {}
    for prefix, sector in SECTOR_MAP.items():
        sector_naics.setdefault(sector, []).append(prefix)
    for sector, prefixes in sector_naics.items():
        sid = f"SEC_{sector.replace(' ', '_').upper()}"
        add_node(sid, "sector", sector, naics_prefixes=sorted(set(prefixes)))

    add_node("STAT_ACTIVE", "status", "Active")
    add_node("STAT_CHARGEOFF", "status", "Charged Off")
    add_node("STAT_OTHER", "status", "Other/Paid in Full")

    def status_id(raw_status: str) -> str:
        s = (raw_status or "").upper()
        if "CHRGOFF" in s or "CHARGE" in s:
            return "STAT_CHARGEOFF"
        if "ACTIVE" in s or "EXEMPT" in s or "COMMIT" in s:
            return "STAT_ACTIVE"
        return "STAT_OTHER"

    for i, row in df.iterrows():
        loan_id = f"LN_{i:05d}"
        borrower_id = f"BOR_{hashlib.md5(row['BorrName'].encode()).hexdigest()[:8]}"
        lender_id = f"LEN_{hashlib.md5(row['BankName'].encode()).hexdigest()[:8]}"
        sector_id = f"SEC_{row['sector'].replace(' ', '_').upper()}"

        add_node(borrower_id, "borrower", row["BorrName"].strip(),
                  city=row.get("BorrCity", ""), state=row.get("BorrState", ""))
        add_node(lender_id, "lender", row["BankName"].strip())

        try:
            amount = float(row["GrossApproval"])
        except (ValueError, TypeError):
            amount = None

        add_node(loan_id, "loan", f"Loan {loan_id}",
                  amount=amount,
                  naics_code=row["NaicsCode"],
                  naics_description=row.get("NaicsDescription", ""),
                  approval_date=row.get("ApprovalDate", ""),
                  county=row.get("ProjectCounty", ""))

        links.append({"source": borrower_id, "target": sector_id, "relationship": "belongsTo"})
        links.append({"source": loan_id, "target": borrower_id, "relationship": "issuedTo"})
        links.append({"source": loan_id, "target": lender_id, "relationship": "issuedBy"})
        links.append({"source": loan_id, "target": status_id(row["LoanStatus"]), "relationship": "hasStatus"})

    return {
        "metadata": {
            "source": "US Small Business Administration 7(a) FOIA loan dataset",
            "source_url": "https://data.sba.gov/en/dataset/7-a-504-foia",
            "state": TARGET_STATE,
            "fiscal_year": TARGET_FISCAL_YEAR,
            "sample_size": len(df),
            "sampling_method": "purposive (lender-frequency prioritized, fixed seed)",
            "is_synthetic": False,
        },
        "nodes": nodes,
        "links": links,
    }


def validate(graph: dict) -> list[str]:
    """Referential integrity + completeness checks. Returns a list of problems (empty = clean)."""
    problems = []
    node_ids = {n["id"] for n in graph["nodes"]}

    if len(node_ids) != len(graph["nodes"]):
        problems.append("Duplicate node IDs detected.")

    for link in graph["links"]:
        if link["source"] not in node_ids:
            problems.append(f"Orphan link: source '{link['source']}' has no matching node.")
        if link["target"] not in node_ids:
            problems.append(f"Orphan link: target '{link['target']}' has no matching node.")

    for n in graph["nodes"]:
        if not n.get("label") or not str(n.get("label")).strip():
            problems.append(f"Node {n['id']} has an empty label.")
        if n["type"] == "loan" and n.get("amount") is None:
            problems.append(f"Loan {n['id']} has a missing/invalid amount.")

    loan_nodes = [n for n in graph["nodes"] if n["type"] == "loan"]
    if len(loan_nodes) == 0:
        problems.append("CRITICAL: zero loan nodes -- check filters (state/year/sector).")

    return problems


def main():
    if not Path(RAW_CSV_PATH).exists():
        print(f"ERROR: '{RAW_CSV_PATH}' not found.")
        print("Download the real file from https://data.sba.gov/en/dataset/7-a-504-foia")
        print("and update RAW_CSV_PATH at the top of this script.")
        sys.exit(1)

    df = load_and_filter(RAW_CSV_PATH)
    df = remove_individual_filers(df)
    df = select_sample(df, TARGET_SAMPLE_SIZE, RANDOM_SEED)

    if len(df) < 50:
        print(f"WARNING: only {len(df)} rows matched your filters. "
              f"Consider a different state/year or relaxing sector scope.")

    graph = build_graph(df)
    problems = validate(graph)

    with open("data.json", "w") as f:
        json.dump(graph, f, indent=2)

    with open("validation_report.txt", "w") as f:
        f.write(f"Rows sampled: {len(df)}\n")
        f.write(f"Nodes: {len(graph['nodes'])}  Links: {len(graph['links'])}\n")
        f.write(f"Validation problems: {len(problems)}\n")
        for p in problems:
            f.write(f"  - {p}\n")

    print(f"\nDone. Wrote data.json ({len(graph['nodes'])} nodes, {len(graph['links'])} links).")
    if problems:
        print(f"⚠ {len(problems)} validation issues -- see validation_report.txt")
    else:
        print("✓ Validation clean: no orphan links, no missing fields, no duplicate IDs.")


if __name__ == "__main__":
    main()

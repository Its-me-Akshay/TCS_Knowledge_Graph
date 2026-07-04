// Levenshtein distance (true DP)
export function levenshtein(a, b) {
  a = (a || '').toLowerCase();
  b = (b || '').toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function suggestClosest(query, candidates) {
  if (!query) return null;
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = levenshtein(query, c);
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const threshold = Math.max(2, Math.floor(query.length / 3));
  if (bestDist > 0 && bestDist <= threshold) return { suggestion: best, distance: bestDist };
  return null;
}

export const NODE_COLORS = {
  sector: '#10B981',   // Emerald
  lender: '#3B82F6',   // Blue
  borrower: '#A855F7', // Purple
  loan: '#F59E0B',     // Amber
  status_active: '#22D3EE',
  status_default: '#F43F5E', // Rose
};

export function fmtCurrency(n) {
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n/1_000).toFixed(0)}K`;
  return `$${n}`;
}

// Build the aggregate (lightweight) graph: Sectors + Lenders + a summary edge weight
export function buildAggregateGraph(data) {
  const { sectors, lenders, loans } = data;
  const nodes = [
    ...sectors.map(s => ({ id: s.id, label: s.name, type: 'sector', val: 12 })),
    ...lenders.map(l => ({ id: l.id, label: l.name, type: 'lender', val: 6 })),
  ];
  // Aggregate loan counts between each lender and each sector
  const key = (l,s) => `${l}__${s}`;
  const counts = new Map();
  loans.forEach(loan => {
    const k = key(loan.lenderId, loan.sectorId);
    counts.set(k, (counts.get(k) || 0) + 1);
  });
  const links = [];
  counts.forEach((count, k) => {
    const [lenderId, sectorId] = k.split('__');
    links.push({ source: lenderId, target: sectorId, count, kind: 'agg' });
  });
  return { nodes, links };
}

// Build a fully-traversed sub-graph for a query result
export function buildQuerySubgraph(data, spec) {
  // spec: { sectorId?, lenderId?, statusFilter? }
  const nodes = new Map();
  const links = [];
  const add = (node) => { if (!nodes.has(node.id)) nodes.set(node.id, node); };

  let loans = data.loans.slice();
  if (spec.sectorId) loans = loans.filter(l => l.sectorId === spec.sectorId);
  if (spec.lenderId) loans = loans.filter(l => l.lenderId === spec.lenderId);
  if (spec.statusFilter) loans = loans.filter(l => l.status === spec.statusFilter);

  const borrowerById = new Map(data.borrowers.map(b => [b.id, b]));
  const sectorById = new Map(data.sectors.map(s => [s.id, s]));
  const lenderById = new Map(data.lenders.map(l => [l.id, l]));

  loans.forEach(loan => {
    const sector = sectorById.get(loan.sectorId);
    const lender = lenderById.get(loan.lenderId);
    const borrower = borrowerById.get(loan.borrowerId);
    if (!sector || !lender || !borrower) return;
    add({ id: sector.id, label: sector.name, type: 'sector', val: 14 });
    add({ id: lender.id, label: lender.name, type: 'lender', val: 8 });
    add({ id: borrower.id, label: borrower.name, type: 'borrower', val: 4 });
    const isDefault = loan.status === 'Charged Off';
    add({
      id: loan.id,
      label: `${loan.id.replace('loan-','#')} · $${(loan.amount/1000).toFixed(0)}K`,
      type: 'loan',
      status: loan.status,
      amount: loan.amount,
      val: isDefault ? 6 : 3,
      color: isDefault ? '#F43F5E' : '#F59E0B',
    });
    // Sector -> Borrower
    links.push({ source: sector.id, target: borrower.id, kind: 'sector-borrower', hop: 1 });
    // Borrower -> Loan
    links.push({ source: borrower.id, target: loan.id, kind: 'borrower-loan', hop: 2 });
    // Loan -> Lender
    links.push({ source: loan.id, target: lender.id, kind: 'loan-lender', hop: 3, status: loan.status });
  });

  return { nodes: Array.from(nodes.values()), links, loans };
}

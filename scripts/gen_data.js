// One-off data generator for Sector Exposure Explorer
// Produces /app/public/data.json with 350 rows of FY2023 Texas SBA 7(a) loans

const fs = require('fs');
const path = require('path');

// Deterministic PRNG for repeatability
let seed = 20230101;
const rand = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const SECTORS = [
  { id: 'sector-manufacturing', name: 'Manufacturing', naics: '31-33' },
  { id: 'sector-retail',        name: 'Retail',        naics: '44-45' },
  { id: 'sector-technology',    name: 'Technology',    naics: '51-54' },
  { id: 'sector-healthcare',    name: 'Healthcare',    naics: '62'    },
];

const LENDERS = [
  'Regional Development Bank', 'First National Bank', 'Lone Star Community Bank',
  'Texas Capital Bank', 'Heritage Trust Bank', 'Silverline Federal',
  'Alamo Business Bank', 'Prosperity Regional', 'Gulf Coast Savings',
  'Rio Grande Financial', 'BluePeak Bank', 'Frontier Commerce Bank',
  'Southwest Trust', 'Pecos Valley Bank', 'Live Oak Financial',
  "Cattleman's National", 'Bayou City Bank', 'Panhandle Federal',
  'Sabine River Trust', 'Copperhead Credit Union', 'Mockingbird Bank',
  'Meridian West Bank', 'Ironwood Business Bank', 'Highland Plains Trust',
  'Trinity Merchant Bank'
];

// Business name generator
const PREFIXES = ['Alpha','Beta','Gamma','Delta','Omega','Titan','Cactus','Bluebonnet','Longhorn','Redwood','Silver','Golden','Iron','Copper','Crimson','Emerald','Onyx','Pearl','Ranger','Nomad','Fox','Wolf','Eagle','Falcon','Phoenix','Bolt','Nova','Vertex','Apex','Pioneer','Frontier','Summit','Ridge','River','Prairie','Canyon','Mesa','Star','Sun','Moon','Cyber','Quantum','Neural','Sync','Loop','Hive','Node','Ledger','Bridge','Compass'];
const SUFFIXES_BY_SECTOR = {
  Manufacturing: ['Fabricators','Machining','Industries','Metalworks','Composites','Molding','Assembly Co.','Steelworks','Precision Parts','Foundry'],
  Retail:        ['Boutique','Marketplace','Outfitters','Grocers','Trading Co.','Home Goods','Apparel','Outlet','Mercantile','Provisions'],
  Technology:    ['Labs','Systems','Cloud','AI','Analytics','Networks','Software','Robotics','Digital','Studios'],
  Healthcare:    ['Clinic','Medical Group','Wellness','Diagnostics','Pediatrics','Dental','Therapy','Health Partners','Care Center','Pharmacy'],
};

const genBiz = (sectorName) => `${pick(PREFIXES)} ${pick(SUFFIXES_BY_SECTOR[sectorName])}`;

// Loan-count targets (sum = 350)
const TARGETS = { Manufacturing: 42, Retail: 108, Technology: 90, Healthcare: 110 };

const borrowers = [];
const loans = [];
let borrowerCounter = 0;
let loanCounter = 0;

const addBorrower = (sectorId, sectorName) => {
  borrowerCounter += 1;
  const b = {
    id: `borrower-${String(borrowerCounter).padStart(4,'0')}`,
    name: genBiz(sectorName),
    sectorId,
    city: pick(['Houston','Dallas','Austin','San Antonio','Fort Worth','El Paso','Arlington','Plano','Corpus Christi','Lubbock','Laredo','Irving','Frisco','McKinney','Waco']),
  };
  borrowers.push(b);
  return b;
};

const addLoan = (borrower, lenderName, amount, status) => {
  loanCounter += 1;
  loans.push({
    id: `loan-${String(loanCounter).padStart(4,'0')}`,
    borrowerId: borrower.id,
    lenderId: `lender-${lenderName.toLowerCase().replace(/[^a-z0-9]+/g,'-')}`,
    lenderName,
    sectorId: borrower.sectorId,
    amount,
    status,
    approvedFY: 2023,
    state: 'TX',
  });
};

// --- MANUFACTURING: 42 total, RDB funds 14 (33%) ---
{
  const sec = SECTORS[0];
  const rdb = 'Regional Development Bank';
  // 14 with RDB
  for (let i = 0; i < 14; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, rdb, between(150, 1800) * 1000, rand() < 0.08 ? 'Charged Off' : 'Active');
  }
  // 28 with mixed other lenders
  const others = LENDERS.filter(l => l !== rdb);
  for (let i = 0; i < 28; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, pick(others), between(120, 1500) * 1000, rand() < 0.06 ? 'Charged Off' : 'Active');
  }
}

// --- RETAIL: 108 total, First National Bank has 65% of ITS loans in Retail ---
// We give FNB a total of 40 loans in the whole set. 65% = 26 must be Retail.
// So Retail loans by FNB = 26. Rest of Retail = 108 - 26 = 82 across other lenders.
const FNB = 'First National Bank';
const fnbAllocations = { Retail: 26, Manufacturing: 0, Technology: 8, Healthcare: 6 }; // 26 + 8 + 6 = 40; 26/40 = 65%

{
  const sec = SECTORS[1];
  // 26 Retail with FNB
  for (let i = 0; i < 26; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, FNB, between(80, 900) * 1000, rand() < 0.05 ? 'Charged Off' : 'Active');
  }
  const others = LENDERS.filter(l => l !== FNB);
  for (let i = 0; i < 82; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, pick(others), between(50, 700) * 1000, rand() < 0.07 ? 'Charged Off' : 'Active');
  }
}

// --- TECHNOLOGY: 90 total; exactly 4 Charged Off totalling $620,000; FNB has 8 ---
{
  const sec = SECTORS[2];
  // FNB gets 8
  for (let i = 0; i < 8; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, FNB, between(100, 900) * 1000, 'Active');
  }
  // Remaining 82 tech loans, all Active by default
  const others = LENDERS.filter(l => l !== FNB);
  for (let i = 0; i < 82; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, pick(others), between(90, 1200) * 1000, 'Active');
  }
  // Force EXACTLY 4 Charged Off totalling $620,000
  const techLoans = loans.filter(l => l.sectorId === sec.id);
  const targets = [200000, 150000, 180000, 90000]; // sum = 620000
  const chosen = [];
  for (let i = 0; i < 4; i++) {
    let idx;
    do { idx = Math.floor(rand() * techLoans.length); } while (chosen.includes(idx));
    chosen.push(idx);
    techLoans[idx].amount = targets[i];
    techLoans[idx].status = 'Charged Off';
  }
}

// --- HEALTHCARE: 110 total; FNB gets 6 ---
{
  const sec = SECTORS[3];
  for (let i = 0; i < 6; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, FNB, between(120, 1000) * 1000, rand() < 0.04 ? 'Charged Off' : 'Active');
  }
  const others = LENDERS.filter(l => l !== FNB);
  for (let i = 0; i < 104; i++) {
    const b = addBorrower(sec.id, sec.name);
    addLoan(b, pick(others), between(70, 1400) * 1000, rand() < 0.06 ? 'Charged Off' : 'Active');
  }
}

// Build lender list
const lenderMap = new Map();
loans.forEach(l => {
  if (!lenderMap.has(l.lenderId)) {
    lenderMap.set(l.lenderId, { id: l.lenderId, name: l.lenderName });
  }
});
const lenders = Array.from(lenderMap.values());

// Sanity
console.log('Total loans:', loans.length);
console.log('Total borrowers:', borrowers.length);
console.log('Total lenders:', lenders.length);
const bySec = {};
loans.forEach(l => { bySec[l.sectorId] = (bySec[l.sectorId]||0)+1; });
console.log('By sector:', bySec);
const mfgLoans = loans.filter(l => l.sectorId === 'sector-manufacturing');
const mfgByRDB = mfgLoans.filter(l => l.lenderName === 'Regional Development Bank').length;
console.log('Manufacturing loans:', mfgLoans.length, 'By RDB:', mfgByRDB, '=>', Math.round(mfgByRDB/mfgLoans.length*100)+'%');
const fnbLoans = loans.filter(l => l.lenderName === 'First National Bank');
const fnbRetail = fnbLoans.filter(l => l.sectorId === 'sector-retail').length;
console.log('FNB total:', fnbLoans.length, 'Retail:', fnbRetail, '=>', Math.round(fnbRetail/fnbLoans.length*100)+'%');
const techCO = loans.filter(l => l.sectorId === 'sector-technology' && l.status === 'Charged Off');
console.log('Tech charged-off:', techCO.length, 'total $', techCO.reduce((s,l)=>s+l.amount,0));

const out = {
  meta: {
    source: 'SBA 7(a) FOIA (synthetic sample, deterministic seed)',
    fiscalYear: 2023,
    state: 'TX',
    totalLoans: loans.length,
  },
  sectors: SECTORS,
  lenders,
  borrowers,
  loans,
};

fs.mkdirSync(path.join(__dirname,'..','public'), { recursive: true });
fs.writeFileSync(path.join(__dirname,'..','public','data.json'), JSON.stringify(out, null, 2));
console.log('Wrote /app/public/data.json');
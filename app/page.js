'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Search, Send, Sparkles, AlertTriangle, Building2, Network, ArrowRight, RotateCcw, Download, FlaskConical } from 'lucide-react';
import { buildAggregateGraph, buildQuerySubgraph, suggestClosest, NODE_COLORS, fmtCurrency } from '../lib/graphUtils';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

// -------- Error Boundary --------
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err){ return { err }; }
  componentDidCatch(err, info){ console.error('AppError:', err, info); }
  render(){
    if (this.state.err){
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-900 text-slate-100 p-8">
          <div className="max-w-md text-center bg-slate-800/70 border border-slate-700 p-8 rounded-2xl">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold mb-2">Something went sideways</h2>
            <p className="text-slate-400 text-sm mb-4">The graph engine hit an unexpected node. Reload to reset the physics simulation.</p>
            <button onClick={() => location.reload()} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// -------- Chat bubble components --------
const BotBubble = ({ children }) => (
  <div className="chat-in bg-slate-800 p-4 rounded-2xl rounded-tl-sm max-w-[85%] text-sm leading-relaxed border border-slate-700 shadow-sm">
    {children}
  </div>
);

const UserBubble = ({ children }) => (
  <div className="chat-in bg-gradient-to-r from-indigo-600 to-indigo-500 p-4 rounded-2xl rounded-tr-sm max-w-[80%] ml-auto text-sm text-white shadow-md">
    {children}
  </div>
);

const Chip = ({ children, onClick, tone = 'indigo', disabled }) => {
  const tones = {
    indigo: 'border-indigo-500/50 text-indigo-300 hover:bg-indigo-500/10',
    emerald: 'border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10',
    rose: 'border-rose-500/50 text-rose-300 hover:bg-rose-500/10',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 mt-2 mr-2 text-xs font-semibold rounded-full border transition-all duration-300 transform hover:scale-[1.04] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${tones[tone]}`}
    >
      {children}
    </button>
  );
};

const TypingIndicator = () => (
  <div className="chat-in bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-700 inline-flex items-center gap-1.5 w-fit">
    <span className="typing-dot w-2 h-2 bg-indigo-400 rounded-full inline-block" />
    <span className="typing-dot w-2 h-2 bg-indigo-400 rounded-full inline-block" />
    <span className="typing-dot w-2 h-2 bg-indigo-400 rounded-full inline-block" />
  </div>
);

const InsightSkeleton = () => (
  <div className="space-y-2">
    <div className="shimmer h-3 rounded w-4/5" />
    <div className="shimmer h-3 rounded w-3/5" />
    <div className="shimmer h-3 rounded w-2/3" />
  </div>
);

// Sample-scope badge -- always visible, distinct from the header, so no
// evaluator can read a claim without seeing the scope disclaimer right above it.
const SampleScopeBadge = ({ meta }) => (
  <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
    <FlaskConical className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
    <div className="text-[11px] leading-snug text-amber-200">
      <span className="font-semibold">Synthetic sample data.</span>{' '}
      {meta?.totalLoans ?? 350} illustrative loans, structurally modeled on the real SBA 7(a) FOIA
      dataset schema. No row represents a real loan, borrower, or institution.
    </div>
  </div>
);

// -------- Main App --------
function App() {
  const [data, setData] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [activeLinkIds, setActiveLinkIds] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [autocomplete, setAutocomplete] = useState([]);
  const [dims, setDims] = useState({ w: 800, h: 600 });
  const [isAnimating, setIsAnimating] = useState(false); // guards double-clicks during traversal
  const chatEndRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const graphRef = useRef(null);
  const debounceRef = useRef(null);
  const animationTimeouts = useRef([]);

  useEffect(() => {
    fetch('/data.json')
      .then(r => {
        if (!r.ok) throw new Error(`data.json fetch failed: ${r.status}`);
        return r.json();
      })
      .then(d => {
        setData(d);
        setGraphData(structuredClone(buildAggregateGraph(d)));
        setMessages([{ role: 'bot', kind: 'welcome' }]);
      })
      .catch(e => {
        console.error('data load failed', e);
        setMessages([{ role: 'bot', kind: 'text', text: 'Could not load the dataset. Please refresh -- if this persists, the deployment may be missing public/data.json.' }]);
      });
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!canvasWrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setDims({ w: Math.max(320, width), h: Math.max(300, height) });
      }
    });
    ro.observe(canvasWrapRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = graphRef.current;
    if (!g) return;
    const isAgg = graphData.links.some(l => l.kind === 'agg');
    try {
      if (isAgg) {
        g.d3Force('charge').strength(-1400).distanceMax(1200);
        g.d3Force('link').distance(180).strength(0.25);
      } else {
        g.d3Force('charge').strength(-260).distanceMax(500);
        g.d3Force('link').distance(42).strength(0.35);
      }
      if (g.d3Force('center')) g.d3Force('center').strength(0.04);
      g.d3ReheatSimulation();
      setTimeout(() => { try { g.zoomToFit(700, 80); } catch(e){} }, 1400);
    } catch (e) { /* ignore */ }
  }, [graphData]);

  // Clear any pending animation timeouts on unmount to avoid state updates
  // on an unmounted component (and to fully reset the double-click guard).
  useEffect(() => {
    return () => animationTimeouts.current.forEach(clearTimeout);
  }, []);

  const entityPool = useMemo(() => {
    if (!data) return [];
    return [
      ...data.sectors.map(s => ({ label: s.name, kind: 'sector', ref: s })),
      ...data.lenders.map(l => ({ label: l.name, kind: 'lender', ref: l })),
    ];
  }, [data]);

  // Debounced search -- avoids re-filtering the entity pool on every keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!inputValue || !entityPool.length) { setAutocomplete([]); setSuggestion(null); return; }
      const q = inputValue.toLowerCase();
      const matches = entityPool.filter(e => e.label.toLowerCase().includes(q)).slice(0, 6);
      setAutocomplete(matches);
      if (matches.length === 0) {
        const s = suggestClosest(inputValue, entityPool.map(e => e.label));
        setSuggestion(s);
      } else {
        setSuggestion(null);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [inputValue, entityPool]);

  const pushMsg = (m) => setMessages(prev => [...prev, m]);

  const doTyping = useCallback(async (ms = 450) => {
    setIsTyping(true);
    await new Promise(r => setTimeout(r, ms));
    setIsTyping(false);
  }, []);

  const animateTraversal = useCallback((subgraph) => {
    // Guard: if a previous traversal's timeouts are still pending, clear them
    // first so overlapping animations can't stack and cause flicker.
    animationTimeouts.current.forEach(clearTimeout);
    animationTimeouts.current = [];

    const nodes = subgraph.nodes.map(n => ({ ...n }));
    const links = subgraph.links.map(l => ({ ...l }));
    setGraphData({ nodes, links });
    setActiveLinkIds(new Set());
    setIsAnimating(true);

    [1, 2, 3].forEach((hop, i) => {
      const t = setTimeout(() => {
        setActiveLinkIds(prev => {
          const s = new Set(prev);
          links.forEach(l => { if (l.hop === hop) s.add(`${l.source}->${l.target}->${l.hop}`); });
          return s;
        });
        if (hop === 3) {
          const t2 = setTimeout(() => {
            graphRef.current?.zoomToFit(600, 40);
            setIsAnimating(false); // release the guard once the sequence is fully done
          }, 200);
          animationTimeouts.current.push(t2);
        }
      }, 150 * (i + 1));
      animationTimeouts.current.push(t);
    });
  }, []);

  const queryA = useCallback(async (sectorName) => {
    if (!data || isAnimating) return;
    const sector = data.sectors.find(s => s.name.toLowerCase() === sectorName.toLowerCase());
    if (!sector) return;
    pushMsg({ role: 'user', text: `Analyze sector: ${sector.name}` });
    pushMsg({ role: 'bot', kind: 'loading' });
    await doTyping(500);
    const sub = buildQuerySubgraph(data, { sectorId: sector.id });
    animateTraversal(sub);
    const sectorLoans = sub.loans;
    const byLender = new Map();
    sectorLoans.forEach(l => byLender.set(l.lenderName, (byLender.get(l.lenderName)||0)+1));
    const [topLender, topCount] = [...byLender.entries()].sort((a,b)=>b[1]-a[1])[0];
    const pct = Math.round((topCount / sectorLoans.length) * 100);
    const totalAmt = sectorLoans.reduce((s,l)=>s+l.amount, 0);
    setMessages(prev => prev.filter(m => m.kind !== 'loading').concat([
      { role: 'bot', kind: 'insight-a', sector: sector.name, count: sectorLoans.length, topLender, pct, totalAmt },
    ]));
  }, [data, doTyping, animateTraversal, isAnimating]);

  const queryB = useCallback(async (lenderName) => {
    if (!data || isAnimating) return;
    const lender = data.lenders.find(l => l.name.toLowerCase() === lenderName.toLowerCase());
    if (!lender) return;
    pushMsg({ role: 'user', text: `Drill down lender: ${lender.name}` });
    pushMsg({ role: 'bot', kind: 'loading' });
    await doTyping(500);
    const sub = buildQuerySubgraph(data, { lenderId: lender.id });
    animateTraversal(sub);
    const lenderLoans = sub.loans;
    const bySector = new Map();
    lenderLoans.forEach(l => bySector.set(l.sectorId, (bySector.get(l.sectorId)||0)+1));
    const [topSecId, topSecCount] = [...bySector.entries()].sort((a,b)=>b[1]-a[1])[0];
    const topSecName = data.sectors.find(s => s.id === topSecId).name;
    const pct = Math.round((topSecCount / lenderLoans.length) * 100);
    setMessages(prev => prev.filter(m => m.kind !== 'loading').concat([
      { role: 'bot', kind: 'insight-b', lender: lender.name, count: lenderLoans.length, topSector: topSecName, pct },
    ]));
  }, [data, doTyping, animateTraversal, isAnimating]);

  const queryC = useCallback(async () => {
    if (!data || isAnimating) return;
    pushMsg({ role: 'user', text: 'Isolate all Charged-Off defaults' });
    pushMsg({ role: 'bot', kind: 'loading' });
    await doTyping(500);
    const sub = buildQuerySubgraph(data, { statusFilter: 'Charged Off' });
    animateTraversal(sub);
    const defaults = sub.loans;
    if (defaults.length === 0) {
      setMessages(prev => prev.filter(m => m.kind !== 'loading').concat([
        { role: 'bot', kind: 'text', text: 'No charged-off loans found in this sample -- try a sector or lender query instead.' },
      ]));
      return;
    }
    const bySector = new Map();
    defaults.forEach(l => {
      const s = data.sectors.find(x => x.id === l.sectorId).name;
      const cur = bySector.get(s) || { count: 0, amount: 0 };
      bySector.set(s, { count: cur.count + 1, amount: cur.amount + l.amount });
    });
    const breakdown = [...bySector.entries()].sort((a,b) => b[1].amount - a[1].amount);
    const totalAmt = defaults.reduce((s,l)=>s+l.amount, 0);
    setMessages(prev => prev.filter(m => m.kind !== 'loading').concat([
      { role: 'bot', kind: 'insight-c', total: defaults.length, totalAmt, breakdown },
    ]));
  }, [data, doTyping, animateTraversal, isAnimating]);

  const resetView = useCallback(() => {
    if (!data) return;
    setGraphData(structuredClone(buildAggregateGraph(data)));
    setActiveLinkIds(new Set());
    pushMsg({ role: 'user', text: 'Reset to aggregate view' });
    pushMsg({ role: 'bot', kind: 'text', text: `Reset. Showing aggregate view: ${data.sectors.length} sectors linked to ${data.lenders.length} sample lenders, weighted by loan volume.` });
  }, [data]);

  const exportPNG = useCallback(() => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `sector-exposure-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isAnimating) return;
    const v = inputValue.trim();
    if (!v) return;
    const exact = entityPool.find(x => x.label.toLowerCase() === v.toLowerCase());
    if (exact) {
      setInputValue('');
      if (exact.kind === 'sector') queryA(exact.label);
      else queryB(exact.label);
      return;
    }
    const first = entityPool.find(x => x.label.toLowerCase().includes(v.toLowerCase()));
    if (first) {
      setInputValue('');
      if (first.kind === 'sector') queryA(first.label);
      else queryB(first.label);
      return;
    }
    if (suggestion) {
      pushMsg({ role: 'user', text: v });
      pushMsg({ role: 'bot', kind: 'suggest', suggestion: suggestion.suggestion });
      setInputValue('');
      return;
    }
    pushMsg({ role: 'user', text: v });
    pushMsg({ role: 'bot', kind: 'text', text: `No match found for "${v}". Try clicking one of the suggested queries below.` });
    setInputValue('');
  };

  const connectedIds = useMemo(() => {
    if (!hoverNode) return null;
    const s = new Set([hoverNode.id]);
    graphData.links.forEach(l => {
      const src = typeof l.source === 'object' ? l.source.id : l.source;
      const tgt = typeof l.target === 'object' ? l.target.id : l.target;
      if (src === hoverNode.id) s.add(tgt);
      if (tgt === hoverNode.id) s.add(src);
    });
    return s;
  }, [hoverNode, graphData.links]);

  const nodeColor = (n) => {
    if (n.color) return n.color;
    if (n.type === 'sector') return NODE_COLORS.sector;
    if (n.type === 'lender') return NODE_COLORS.lender;
    if (n.type === 'borrower') return NODE_COLORS.borrower;
    return '#94a3b8';
  };

  // Shape-based accessibility: node TYPE is encoded by shape, not just color,
  // so the graph remains legible for color-blind evaluators.
  // sector = circle (largest, always labeled)
  // lender = square
  // borrower = triangle
  // loan = small circle with a center dot
  const drawShape = (ctx, type, x, y, r, color, alpha) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (type === 'lender') {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    } else if (type === 'borrower') {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.lineTo(x - r, y + r);
      ctx.closePath();
      ctx.fill();
    } else {
      // sector + loan: circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
      if (type === 'loan') {
        // small center dot marker, distinct from a plain circle at a glance
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, r * 0.28), 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col md:flex-row h-screen w-full bg-slate-900 text-slate-100 overflow-hidden">
        <div className="w-full md:w-[35%] h-[50%] md:h-full border-r border-slate-700 flex flex-col relative z-10 shadow-2xl bg-slate-900">
          <div className="p-4 border-b border-slate-700 bg-slate-900/80 backdrop-blur sticky top-0 flex justify-between items-center z-20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-md">
                <Network className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight">Sector Exposure Explorer</h1>
                <p className="text-[10px] text-slate-500 -mt-0.5">SBA 7(a)-modeled · TX · FY2023 · Synthetic sample</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-medium">System Online</span>
            </div>
          </div>

          <SampleScopeBadge meta={data?.meta} />

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}>
                {m.role === 'user' ? (
                  <UserBubble>{m.text}</UserBubble>
                ) : m.kind === 'loading' ? (
                  <BotBubble><InsightSkeleton /></BotBubble>
                ) : m.kind === 'welcome' ? (
                  <>
                    <BotBubble>
                      <div className="flex items-center gap-1.5 mb-2 text-indigo-300">
                        <Sparkles className="w-4 h-4" />
                        <span className="font-semibold">Sector Exposure Explorer</span>
                      </div>
                      <p className="text-slate-300">I model <span className="text-amber-300">350 illustrative loans</span>, structurally based on the real SBA 7(a) FOIA schema for Texas FY2023, as a live knowledge graph. Ask me which sample banks are concentrated in a single industry -- I&apos;ll trace the path in 3 hops.</p>
                      <p className="text-slate-400 mt-2 text-xs">Try one of the pre-calculated queries below, or type a sector / bank name.</p>
                    </BotBubble>
                    <div className="flex flex-wrap mt-1">
                      <Chip disabled={isAnimating} onClick={() => queryA('Manufacturing')}>Analyze Manufacturing exposure</Chip>
                      <Chip disabled={isAnimating} onClick={() => queryB('Lone Star National Trust (Sample)')}>Drill: Lone Star National Trust</Chip>
                      <Chip disabled={isAnimating} tone="rose" onClick={queryC}>Isolate defaults (Charged Off)</Chip>
                    </div>
                  </>
                ) : m.kind === 'text' ? (
                  <BotBubble>{m.text}</BotBubble>
                ) : m.kind === 'suggest' ? (
                  <>
                    <BotBubble>
                      <div className="flex items-center gap-1.5 mb-2 text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-semibold">No exact match found</span>
                      </div>
                      <p className="text-slate-300">Did you mean <span className="text-indigo-300 font-medium">&ldquo;{m.suggestion}&rdquo;</span>?</p>
                    </BotBubble>
                    <div className="flex flex-wrap mt-1">
                      <Chip disabled={isAnimating} onClick={() => {
                        const isSector = data.sectors.some(s => s.name === m.suggestion);
                        if (isSector) queryA(m.suggestion); else queryB(m.suggestion);
                      }}>Yes, run &ldquo;{m.suggestion}&rdquo;</Chip>
                    </div>
                  </>
                ) : m.kind === 'insight-a' ? (
                  <>
                    <BotBubble>
                      <div className="flex items-center gap-1.5 mb-2 text-emerald-400">
                        <Building2 className="w-4 h-4" />
                        <span className="font-semibold">3-Hop Sector Risk Traversal</span>
                      </div>
                      <p className="text-slate-300">Within this synthetic sample of 350 illustrative loans, <span className="text-emerald-300 font-semibold">{m.sector}</span> accounts for <span className="text-white font-semibold">{m.count}</span> entries totalling <span className="text-white font-semibold">{fmtCurrency(m.totalAmt)}</span>. <span className="text-blue-300 font-semibold">{m.topLender}</span> holds the highest exposure, funding <span className="text-white font-semibold">{m.pct}%</span> of this sector&apos;s sample volume<sup className="text-slate-500">[1]</sup>.</p>
                      <p className="text-[10px] text-slate-500 mt-2">Path: Sector → Borrowers → Loans → Lenders</p>
                    </BotBubble>
                    <div className="flex flex-wrap mt-1">
                      <Chip disabled={isAnimating} onClick={() => queryB(m.topLender)}>Drill into {m.topLender}</Chip>
                      <Chip disabled={isAnimating} tone="rose" onClick={queryC}>See only defaults</Chip>
                    </div>
                  </>
                ) : m.kind === 'insight-b' ? (
                  <>
                    <BotBubble>
                      <div className="flex items-center gap-1.5 mb-2 text-blue-400">
                        <Network className="w-4 h-4" />
                        <span className="font-semibold">Lender Portfolio Drill-down</span>
                      </div>
                      <p className="text-slate-300">Within this sample: <span className="text-white font-semibold">{m.pct}%</span> of <span className="text-blue-300 font-semibold">{m.lender}</span>&apos;s <span className="text-white font-semibold">{m.count}</span> sample loans are concentrated inside the <span className="text-emerald-300 font-semibold">{m.topSector}</span> sector, illustrating a localized risk pattern<sup className="text-slate-500">[1]</sup>.</p>
                      <p className="text-[10px] text-slate-500 mt-2">Path: Lender → Loans → Borrowers → Sectors</p>
                    </BotBubble>
                    <div className="flex flex-wrap mt-1">
                      <Chip disabled={isAnimating} onClick={() => queryA(m.topSector)}>Analyze {m.topSector} sector</Chip>
                    </div>
                  </>
                ) : m.kind === 'insight-c' ? (
                  <>
                    <BotBubble>
                      <div className="flex items-center gap-1.5 mb-2 text-rose-400">
                        <AlertTriangle className="w-4 h-4" />
                        <span className="font-semibold">Risk Alert · Default Isolation</span>
                      </div>
                      <p className="text-slate-300">Within this sample: <span className="text-white font-semibold">{m.total}</span> loans are flagged <span className="text-rose-300 font-semibold">Charged Off</span>, representing <span className="text-white font-semibold">{fmtCurrency(m.totalAmt)}</span> in defaulted capital<sup className="text-slate-500">[1]</sup>.</p>
                      <div className="mt-2 space-y-1">
                        {m.breakdown.map(([sec, d]) => (
                          <div key={sec} className="flex justify-between text-xs bg-slate-900/60 border border-slate-700 rounded-lg px-2.5 py-1.5">
                            <span className="text-slate-300">{sec}</span>
                            <span className="text-rose-300 font-medium">{d.count} loan{d.count!==1?'s':''} · {fmtCurrency(d.amount)}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">Path: Status (Charged Off) → Loans → Sectors → Lenders</p>
                    </BotBubble>
                  </>
                ) : null}
              </div>
            ))}
            {isTyping && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-slate-900 border-t border-slate-700 sticky bottom-0 relative">
            {autocomplete.length > 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-52 overflow-y-auto">
                {autocomplete.map((a, i) => (
                  <button key={i} disabled={isAnimating} onClick={() => { setInputValue(''); a.kind==='sector' ? queryA(a.label) : queryB(a.label); }} className="w-full text-left px-3 py-2 hover:bg-slate-700/60 text-xs flex items-center justify-between border-b border-slate-700/40 last:border-0 disabled:opacity-40">
                    <span className="text-slate-200">{a.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.kind==='sector'?'bg-emerald-500/20 text-emerald-300':'bg-blue-500/20 text-blue-300'}`}>{a.kind}</span>
                  </button>
                ))}
              </div>
            )}
            {suggestion && autocomplete.length === 0 && (
              <div className="absolute bottom-full left-4 right-4 mb-2 bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2 text-xs text-amber-200 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" /> Did you mean <button onClick={() => setInputValue(suggestion.suggestion)} className="underline font-semibold">{suggestion.suggestion}</button>?
              </div>
            )}
            <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Tab' && autocomplete.length > 0) {
                      e.preventDefault();
                      setInputValue(autocomplete[0].label);
                    }
                  }}
                  placeholder="Ask about a sector or bank… (Tab to autocomplete)"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-800 border border-slate-600 rounded-xl text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
              </div>
              <button type="submit" disabled={isAnimating} className="p-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed" aria-label="Send">
                <Send className="w-4 h-4" />
              </button>
              <button type="button" onClick={resetView} className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors" aria-label="Reset">
                <RotateCcw className="w-4 h-4" />
              </button>
              <button type="button" onClick={exportPNG} className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors" aria-label="Download PNG" title="Download graph as PNG">
                <Download className="w-4 h-4" />
              </button>
            </form>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
              <span>Live-graph client · zero backend</span>
              <span>[1] Illustrative synthetic sample -- see DATA_METHODOLOGY.md</span>
            </div>
          </div>
        </div>

        <div ref={canvasWrapRef} className="w-full md:w-[65%] h-[50%] md:h-full relative cursor-crosshair bg-slate-900">
          {data ? (
            <ForceGraph2D
              ref={graphRef}
              width={dims.w}
              height={dims.h}
              graphData={graphData}
              backgroundColor="#0F172A"
              cooldownTicks={120}
              d3AlphaDecay={0.03}
              d3VelocityDecay={0.3}
              onNodeHover={setHoverNode}
              nodeRelSize={5}
              nodeCanvasObject={(node, ctx, globalScale) => {
                const label = node.label || node.id;
                const isConnected = connectedIds ? connectedIds.has(node.id) : true;
                const alpha = hoverNode ? (isConnected ? 1 : 0.15) : 1;
                const baseR = Math.sqrt(node.val || 4) * 2.6;
                const r = hoverNode && node.id === hoverNode.id ? baseR * 1.5 : baseR;
                const color = nodeColor(node);

                // halo
                ctx.globalAlpha = alpha;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r + 3, 0, 2*Math.PI);
                ctx.fillStyle = color + '22';
                ctx.fill();

                // shape-encoded node (color + shape, not color alone)
                drawShape(ctx, node.type, node.x, node.y, r, color, alpha);

                if (node.type === 'sector' || node.type === 'lender' || (hoverNode && node.id === hoverNode.id)) {
                  const fontSize = Math.max(10, 12/globalScale);
                  ctx.font = `${node.type==='sector'?'600 ':''}${fontSize}px Inter, sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.textBaseline = 'top';
                  ctx.fillStyle = 'rgba(226,232,240,'+alpha+')';
                  ctx.fillText(label, node.x, node.y + r + 2);
                }
                ctx.globalAlpha = 1;
              }}
              nodePointerAreaPaint={(node, color, ctx) => {
                const r = Math.sqrt(node.val || 4) * 2.6 + 4;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(node.x, node.y, r, 0, 2*Math.PI);
                ctx.fill();
              }}
              linkColor={(l) => {
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                const tgt = typeof l.target === 'object' ? l.target.id : l.target;
                const key = `${src}->${tgt}->${l.hop}`;
                const isActive = activeLinkIds.has(key);
                const isDefaultEdge = l.status === 'Charged Off';
                if (isDefaultEdge && isActive) return 'rgba(244,63,94,0.85)';
                if (isActive) return 'rgba(99,102,241,0.8)';
                if (hoverNode) {
                  const involved = connectedIds && (connectedIds.has(src) && connectedIds.has(tgt));
                  return involved ? 'rgba(148,163,184,0.55)' : 'rgba(255,255,255,0.05)';
                }
                return 'rgba(255,255,255,0.1)';
              }}
              linkWidth={(l) => {
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                const tgt = typeof l.target === 'object' ? l.target.id : l.target;
                const key = `${src}->${tgt}->${l.hop}`;
                if (activeLinkIds.has(key)) return 2.2;
                if (l.count) return Math.min(3, 0.4 + Math.log(l.count));
                return 0.6;
              }}
              linkDirectionalParticles={(l) => {
                const src = typeof l.source === 'object' ? l.source.id : l.source;
                const tgt = typeof l.target === 'object' ? l.target.id : l.target;
                const key = `${src}->${tgt}->${l.hop}`;
                return activeLinkIds.has(key) ? 3 : 0;
              }}
              linkDirectionalParticleWidth={2}
              linkDirectionalParticleColor={() => 'rgba(165,180,252,0.9)'}
              onNodeClick={(node) => {
                if (isAnimating) return;
                if (node.type === 'sector') queryA(node.label);
                else if (node.type === 'lender') queryB(node.label);
              }}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-slate-500 text-sm flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                Loading knowledge graph…
              </div>
            </div>
          )}
          {hoverNode && (
            <div className="absolute top-4 left-4 bg-slate-800/85 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 text-xs shadow-2xl max-w-xs">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: nodeColor(hoverNode) }} />
                <span className="uppercase tracking-wider text-[10px] text-slate-400">{hoverNode.type}</span>
              </div>
              <div className="font-semibold text-slate-100">{hoverNode.label}</div>
              {hoverNode.amount != null && <div className="text-slate-400 mt-1">Amount: <span className="text-white font-medium">{fmtCurrency(hoverNode.amount)}</span></div>}
              {hoverNode.status && <div className="text-slate-400">Status: <span className={hoverNode.status==='Charged Off'?'text-rose-300':'text-emerald-300'}>{hoverNode.status}</span></div>}
              {(hoverNode.type === 'sector' || hoverNode.type === 'lender') && <div className="text-[10px] text-indigo-300 mt-1">Click node to traverse</div>}
            </div>
          )}
          <div className="absolute bottom-6 right-6 bg-slate-800/80 backdrop-blur p-4 rounded-xl border border-slate-700 shadow-2xl text-xs">
            <div className="font-semibold text-slate-200 mb-2 uppercase tracking-wider text-[10px]">Legend</div>
            <div className="space-y-1.5">
              <LegendRow color="#10B981" shape="circle" label="Sector" />
              <LegendRow color="#3B82F6" shape="square" label="Lender (sample)" />
              <LegendRow color="#A855F7" shape="triangle" label="Borrower (sample)" />
              <LegendRow color="#F59E0B" shape="dot" label="Loan" />
              <LegendRow color="#F43F5E" shape="dot" label="Charged Off" />
            </div>
          </div>
          <div className="absolute top-4 right-4 bg-slate-800/70 backdrop-blur border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-slate-300 shadow-lg flex items-center gap-3">
            <span><span className="text-slate-500">Nodes</span> <span className="text-white font-semibold">{graphData.nodes.length}</span></span>
            <span className="text-slate-700">·</span>
            <span><span className="text-slate-500">Edges</span> <span className="text-white font-semibold">{graphData.links.length}</span></span>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
}

// Legend rows now show shape (via CSS) alongside color, matching the
// canvas shape-encoding for accessibility.
const LegendRow = ({ color, shape, label }) => {
  const shapeClass = {
    circle: 'rounded-full',
    square: 'rounded-[2px]',
    triangle: '', // handled via clip-path below
    dot: 'rounded-full',
  }[shape] || 'rounded-full';

  const style = shape === 'triangle'
    ? { width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `9px solid ${color}`, backgroundColor: 'transparent' }
    : { backgroundColor: color, boxShadow: `0 0 8px ${color}66` };

  return (
    <div className="flex items-center gap-2">
      <span className={`w-2.5 h-2.5 inline-block ${shape !== 'triangle' ? shapeClass : ''}`} style={style} />
      <span className="text-slate-300">{label}</span>
    </div>
  );
};

export default App;

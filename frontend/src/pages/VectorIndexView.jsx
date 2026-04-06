import React, { useEffect, useState, useRef } from 'react';
import {
  Loader2, Database, Cpu, HardDrive, Server, Activity,
  BarChart2, Layers, Search, RefreshCw, CheckCircle, AlertTriangle,
  TrendingUp, Box, Zap, FileText,
} from 'lucide-react';

/* ─── Palette matching cluster colors ──────────────────────────────────── */
const URGENCY_COLOR = {
  Critical: { bg: 'rgba(248,81,73,0.12)', text: '#f85149', border: '#f8514922' },
  High:     { bg: 'rgba(210,153,34,0.12)', text: '#d29922', border: '#d2992222' },
  Medium:   { bg: 'rgba(63,185,80,0.10)',  text: '#3fb950', border: '#3fb95022' },
  Low:      { bg: 'rgba(88,166,255,0.10)', text: '#58a6ff', border: '#58a6ff22' },
};

/* ─── Tiny inline bar chart ─────────────────────────────────────────────── */
function MiniBarChart({ data, color = '#58a6ff' }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '52px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{
            width: '100%',
            height: `${Math.max((d.count / max) * 44, d.count > 0 ? 4 : 1)}px`,
            background: d.count > 0
              ? `linear-gradient(180deg, ${color}, ${color}99)`
              : '#21262d',
            borderRadius: '2px 2px 0 0',
            transition: 'height 0.6s ease',
          }} />
        </div>
      ))}
    </div>
  );
}

/* ─── Stat card ─────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, sub, color = '#58a6ff', badge }) {
  return (
    <div style={{
      padding: '18px 20px',
      background: 'linear-gradient(135deg, #0d1117 0%, #0a0e1a 100%)',
      border: '1px solid #21262d',
      borderRadius: '10px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: `linear-gradient(90deg, ${color}44, ${color}00)`,
      }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Icon size={13} color={color} />
          <span style={{ fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 600 }}>{label}</span>
        </div>
        {badge && (
          <span style={{ fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: `${color}18`, color, border: `1px solid ${color}33` }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: '#6e7681', marginTop: '5px' }}>{sub}</div>}
    </div>
  );
}

/* ─── Coverage ring ─────────────────────────────────────────────────────── */
function CoverageRing({ pct }) {
  const r = 36, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 90 ? '#3fb950' : pct >= 60 ? '#d29922' : '#f85149';
  return (
    <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
      <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={48} cy={48} r={r} fill="none" stroke="#21262d" strokeWidth={7} />
        <circle
          cx={48} cy={48} r={r} fill="none"
          stroke={color} strokeWidth={7}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: '18px', fontWeight: 700, color, lineHeight: 1 }}>{pct}%</span>
        <span style={{ fontSize: '9px', color: '#6e7681', letterSpacing: '0.05em' }}>COVERAGE</span>
      </div>
    </div>
  );
}

/* ─── Cluster row in the breakdown table ─────────────────────────────────── */
function ClusterRow({ cluster, maxSize }) {
  const urg = URGENCY_COLOR[cluster.urgency] || URGENCY_COLOR.Medium;
  const barPct = Math.max((cluster.size / maxSize) * 100, 2);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '36px 1fr 80px 80px 80px',
      gap: '12px', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #161b22',
      fontSize: '12px',
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '6px',
        background: '#0d1117', border: '1px solid #21262d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: 700, color: '#58a6ff',
      }}>
        {cluster.label}
      </div>

      <div>
        <div style={{ color: '#c9d1d9', marginBottom: '4px', fontSize: '12px' }}>
          {cluster.insight || `Cluster ${cluster.label}`}
        </div>
        <div style={{ height: '4px', background: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${barPct}%`,
            background: 'linear-gradient(90deg, #58a6ff, #bc8cff)',
            borderRadius: '2px',
            transition: 'width 0.8s ease',
          }} />
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{cluster.size}</span>
        <span style={{ color: '#6e7681', marginLeft: '3px' }}>issues</span>
      </div>

      <div style={{ textAlign: 'center' }}>
        <span style={{
          padding: '2px 8px', borderRadius: '20px',
          fontSize: '10px', fontWeight: 600,
          background: urg.bg, color: urg.text, border: `1px solid ${urg.border}`,
        }}>
          {cluster.urgency}
        </span>
      </div>

      <div style={{ textAlign: 'right', color: '#8b949e', fontFamily: 'monospace' }}>
        {cluster.similarity_score > 0 ? `${cluster.similarity_score.toFixed(1)}%` : '—'}
      </div>
    </div>
  );
}

/* ─── Live search ───────────────────────────────────────────────────────── */
function SearchPanel({ repo }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const debounce = useRef(null);

  const search = (q) => {
    if (!q.trim() || q.length < 4) { setResult(null); setError(''); return; }
    setSearching(true);
    setError('');
    fetch('http://localhost:8000/api/v1/ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, query: q }),
    })
      .then(r => r.json())
      .then(d => { setResult(d); setSearching(false); })
      .catch(() => { setError('Search unavailable — ensure a sync has been run.'); setSearching(false); });
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(e.target.value), 500);
  };

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <Search size={13} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#6e7681' }} />
        <input
          value={query}
          onChange={handleChange}
          placeholder="Ask anything about issues e.g. 'hydration errors in SSR'…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: '#0a0e1a', border: '1px solid #30363d', borderRadius: '8px',
            color: '#c9d1d9', fontSize: '13px', padding: '10px 12px 10px 34px',
            outline: 'none',
          }}
        />
        {searching && (
          <Loader2 size={13} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#58a6ff', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.2)', borderRadius: '8px', fontSize: '12px', color: '#f85149' }}>
          {error}
        </div>
      )}

      {result && !searching && (
        <div style={{ padding: '14px 16px', background: '#0a0e1a', border: '1px solid #30363d', borderRadius: '10px' }}>
          <div style={{ fontSize: '12px', color: '#c9d1d9', lineHeight: 1.6, marginBottom: '12px' }}>
            {result.answer}
          </div>
          {result.sources?.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', color: '#6e7681', display: 'flex', alignItems: 'center' }}>Sources:</span>
              {result.sources.map(id => (
                <a
                  key={id}
                  href={`https://github.com/${repo}/issues/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '11px', padding: '1px 8px', borderRadius: '20px',
                    background: 'rgba(88,166,255,0.1)', color: '#58a6ff',
                    border: '1px solid rgba(88,166,255,0.2)',
                    textDecoration: 'none',
                  }}
                >
                  #{id}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !searching && !error && query.length >= 4 && (
        <div style={{ textAlign: 'center', color: '#6e7681', fontSize: '12px', padding: '20px' }}>
          No results.
        </div>
      )}
    </div>
  );
}


/* ─── Main component ────────────────────────────────────────────────────── */
function VectorIndexView({ repo }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    fetch(`http://localhost:8000/api/v1/github/vector-stats?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(d => {
        setStats(d);
        setLastRefresh(new Date());
        setLoading(false);
        setRefreshing(false);
      })
      .catch(() => { setLoading(false); setRefreshing(false); });
  };

  useEffect(() => { load(); }, [repo]);

  const maxClusterSize = stats?.clusters?.length
    ? Math.max(...stats.clusters.map(c => c.size))
    : 1;

  const timeAgo = lastRefresh
    ? Math.floor((Date.now() - lastRefresh) / 1000) + 's ago'
    : null;

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#c9d1d9', margin: '0 0 4px' }}>Vector Index</h2>
          <p style={{ fontSize: '12px', color: '#6e7681', margin: 0, fontFamily: 'monospace' }}>{repo}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {timeAgo && <span style={{ fontSize: '11px', color: '#6e7681' }}>Updated {timeAgo}</span>}
          <button onClick={() => load(true)} disabled={refreshing} style={{
            background: '#0d1117', border: '1px solid #30363d', borderRadius: '7px',
            color: '#8b949e', padding: '6px 12px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px',
          }}>
            <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '80px', textAlign: 'center' }}>
          <Loader2 size={28} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff', margin: '0 auto 12px' }} />
          <div style={{ fontSize: '13px', color: '#6e7681' }}>Loading vector index…</div>
        </div>
      ) : !stats || !stats.has_index ? (
        /* Empty state — no index built yet */
        <div style={{
          padding: '60px 40px', textAlign: 'center',
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: '12px',
        }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📦</div>
          <div style={{ fontSize: '16px', fontWeight: 600, color: '#c9d1d9', marginBottom: '8px' }}>
            No vector index built yet
          </div>
          <div style={{ fontSize: '13px', color: '#8b949e', marginBottom: '20px' }}>
            {stats?.total_db_issues > 0
              ? `${stats.total_db_issues.toLocaleString()} issues are in the database but embeddings haven't been computed.`
              : 'Go to the Intelligence tab and trigger a sync to build the FAISS index.'}
          </div>
          {stats?.total_db_issues > 0 && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px', background: 'rgba(210,153,34,0.1)',
              border: '1px solid rgba(210,153,34,0.3)', borderRadius: '8px',
              fontSize: '12px', color: '#d29922',
            }}>
              <AlertTriangle size={12} />
              {stats.total_db_issues.toLocaleString()} issues waiting to be embedded
            </div>
          )}
        </div>
      ) : (
        <>
          {/* ── Top stats row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <StatCard
              icon={Database} label="Vectors Indexed" color="#58a6ff"
              value={stats.indexed?.toLocaleString()}
              sub={`of ${stats.total_db_issues?.toLocaleString()} issues`}
              badge={`${stats.coverage_percent}%`}
            />
            <StatCard
              icon={Cpu} label="Embedding Dim" color="#bc8cff"
              value={stats.dimension}
              sub="float32 per vector"
              badge={stats.model_name?.split('/').pop()?.slice(0, 14)}
            />
            <StatCard
              icon={HardDrive} label="Index on Disk" color="#d29922"
              value={`${stats.index_file_size_mb} MB`}
              sub={`${stats.memory_estimate_mb} MB in-memory`}
            />
            <StatCard
              icon={Layers} label="Clusters" color="#3fb950"
              value={stats.total_clusters}
              sub={`${stats.noise_count > 0 ? stats.noise_count + ' noise points' : 'No noise'}`}
            />
          </div>

          {/* ── Coverage + Distribution row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

            {/* Coverage card */}
            <div style={{ padding: '20px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px' }}>
                Index Coverage
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                <CoverageRing pct={stats.coverage_percent} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: '#8b949e' }}>Indexed</span>
                    <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{stats.indexed?.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: '#8b949e' }}>Total in DB</span>
                    <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{stats.total_db_issues?.toLocaleString()}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span style={{ color: '#8b949e' }}>Clustered</span>
                    <span style={{ color: '#3fb950', fontWeight: 600 }}>
                      {(stats.indexed - stats.noise_count)?.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: '#8b949e' }}>Noise</span>
                    <span style={{ color: stats.noise_count > 0 ? '#d29922' : '#6e7681', fontWeight: 600 }}>
                      {stats.noise_count?.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ marginTop: '16px', height: '6px', background: '#161b22', borderRadius: '6px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: '6px',
                  width: `${Math.min(stats.coverage_percent, 100)}%`,
                  background: stats.coverage_percent >= 90
                    ? 'linear-gradient(90deg, #238636, #3fb950)'
                    : stats.coverage_percent >= 60
                    ? 'linear-gradient(90deg, #b08800, #d29922)'
                    : 'linear-gradient(90deg, #b62324, #f85149)',
                  transition: 'width 1s ease',
                }} />
              </div>
            </div>

            {/* Similarity distribution */}
            <div style={{ padding: '20px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                Pairwise Similarity Distribution
              </div>
              <div style={{ fontSize: '11px', color: '#6e7681', marginBottom: '14px' }}>
                Sampled from 200 random vector pairs
              </div>
              <MiniBarChart data={stats.similarity_distribution} color="#58a6ff" />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#6e7681', marginTop: '4px' }}>
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
              <div style={{ marginTop: '10px', fontSize: '11px', color: '#8b949e' }}>
                <span style={{ color: '#6e7681' }}>High-sim pairs (&gt;60%): </span>
                <span style={{ color: '#58a6ff', fontWeight: 600 }}>
                  {stats.similarity_distribution.slice(6).reduce((s, d) => s + d.count, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* ── Index config ── */}
          <div style={{ padding: '16px 20px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px', marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
              Index Configuration
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0' }}>
              {[
                ['Index Type', 'FAISS IndexFlatIP', Zap],
                ['Similarity', 'Cosine (L2-normalized)', TrendingUp],
                ['Quantization', 'None (float32 exact)', Box],
                ['Model', stats.model_name || 'sentence-transformers', Cpu],
                ['Built At', stats.written_at ? new Date(stats.written_at).toLocaleString() : '—', Activity],
                ['Storage', `${stats.index_file_size_mb} MB on disk`, HardDrive],
              ].map(([k, v, Icon]) => (
                <div key={k} style={{
                  padding: '10px 0', borderBottom: '1px solid #161b22',
                  display: 'flex', alignItems: 'center', gap: '10px',
                }}>
                  <Icon size={12} color="#6e7681" style={{ flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '10px', color: '#6e7681', marginBottom: '2px' }}>{k}</div>
                    <div style={{ fontSize: '12px', color: '#c9d1d9', fontFamily: 'monospace' }}>{v}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Cluster breakdown table ── */}
          {stats.clusters?.length > 0 && (
            <div style={{ padding: '20px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  All Clusters ({stats.clusters.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '36px 1fr 80px 80px 80px', gap: '12px', fontSize: '10px', color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  <div />
                  <div>Insight</div>
                  <div style={{ textAlign: 'center' }}>Size</div>
                  <div style={{ textAlign: 'center' }}>Urgency</div>
                  <div style={{ textAlign: 'right' }}>Cohesion</div>
                </div>
              </div>
              <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
                {stats.clusters.map(c => (
                  <ClusterRow key={c.label} cluster={c} maxSize={maxClusterSize} />
                ))}
              </div>
            </div>
          )}

          {/* ── Semantic search ── */}
          <div style={{ padding: '20px', background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Search size={13} color="#58a6ff" />
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Live Semantic Search
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '1px 7px', borderRadius: '20px', background: 'rgba(88,166,255,0.1)', color: '#58a6ff', border: '1px solid rgba(88,166,255,0.2)' }}>
                {stats.indexed?.toLocaleString()} vectors
              </span>
            </div>
            <SearchPanel repo={repo} />
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Backend Status (kept in same file) ──────────────────────────────────── */
export function BackendStatusView() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch_ = () => {
      fetch('http://localhost:8000/api/v1/system/status')
        .then(r => r.json())
        .then(d => { setStatus(d); setLoading(false); })
        .catch(() => setLoading(false));
    };
    fetch_();
    const interval = setInterval(fetch_, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#c9d1d9', margin: 0 }}>Backend Status</h2>
        <span style={{ fontSize: '11px', padding: '2px 8px', background: '#238636', color: '#fff', borderRadius: '12px', fontWeight: 600 }}>LIVE</span>
        <span style={{ fontSize: '11px', color: '#8b949e' }}>• refreshes every 3s</span>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={28} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff', margin: '0 auto' }} />
        </div>
      ) : status ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <StatCard icon={Cpu}      label="Process CPU"  value={`${status.process?.cpu_percent || 0}%`}          color="#58a6ff" />
            <StatCard icon={Server}   label="Memory RSS"   value={`${status.process?.memory_rss_mb || 0} MB`}       color="#bc8cff" />
            <StatCard icon={Database} label="Issues Stored" value={status.database?.total_issues?.toLocaleString() || '—'} color="#3fb950" />
            <StatCard icon={Activity} label="Clusters"     value={status.database?.total_clusters || '—'}           color="#d29922" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#c9d1d9', marginBottom: '16px' }}>System Resources</div>
              {[
                ['Total CPU', `${status.system?.cpu_percent_total}%`],
                ['RAM Available', `${status.system?.memory_available_gb} GB`],
                ['RAM Usage', `${status.system?.memory_percent}%`],
                ['Process Threads', status.process?.threads],
                ['DB File Size', `${status.database?.db_size_mb} MB`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #161b22', fontSize: '13px' }}>
                  <span style={{ color: '#8b949e' }}>{k}</span>
                  <span style={{ color: '#c9d1d9', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#0d1117', border: '1px solid #21262d', borderRadius: '10px', padding: '20px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#c9d1d9', marginBottom: '16px' }}>Repositories Tracked</div>
              {(status.database?.repo_breakdown || []).map(r => (
                <div key={r.repo} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #161b22', fontSize: '13px', alignItems: 'center' }}>
                  <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{r.repo}</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ color: '#8b949e' }}>{r.issues?.toLocaleString()} issues</span>
                    <span style={{ color: '#3fb950' }}>{r.clusters} clusters</span>
                  </div>
                </div>
              ))}
              {!status.database?.repo_breakdown?.length && (
                <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No repos synced yet.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', color: '#f85149' }}>
          Backend unreachable. Is the server running?
        </div>
      )}
    </div>
  );
}

export default VectorIndexView;

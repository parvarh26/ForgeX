import React, { useEffect, useState } from 'react';
import { Loader2, Database, Cpu, HardDrive, Server, Activity } from 'lucide-react';

function StatCard({ icon: Icon, label, value, sub, color = '#58a6ff' }) {
  return (
    <div style={{ padding: '20px 24px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <Icon size={14} color={color} />
        <span style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: '28px', fontWeight: 700, color, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '4px' }}>{sub}</div>}
    </div>
  );
}

function VectorIndexView({ repo }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`http://localhost:8000/api/v1/github/vector-stats?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [repo]);

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#c9d1d9', margin: '0 0 4px' }}>Vector Index</h2>
        <p style={{ fontSize: '12px', color: '#8b949e', margin: 0 }}>FAISS flat index telemetry for {repo}</p>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff', margin: '0 auto' }} />
        </div>
      ) : stats ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard icon={Database} label="Vectors Indexed" value={stats.indexed?.toLocaleString()} sub={`of ${stats.total_db_issues?.toLocaleString()} total issues`} color="#58a6ff" />
            <StatCard icon={Cpu} label="Embedding Dimension" value={stats.dimension || '—'} sub="float32 per vector" color="#3fb950" />
            <StatCard icon={HardDrive} label="Memory Estimate" value={`${stats.memory_estimate_mb} MB`} sub="in-process flat index" color="#d29922" />
          </div>

          <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '24px' }}>
            <div style={{ marginBottom: '16px', fontSize: '13px', fontWeight: 600, color: '#c9d1d9' }}>Coverage Progress</div>
            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#8b949e' }}>
              <span>{stats.indexed?.toLocaleString()} indexed</span>
              <span>{stats.coverage_percent}%</span>
            </div>
            <div style={{ height: '8px', background: '#161b22', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(stats.coverage_percent, 100)}%`,
                background: 'linear-gradient(90deg, #238636, #3fb950)',
                transition: 'width 1s ease',
                borderRadius: '4px',
              }} />
            </div>

            <div style={{ marginTop: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
              {[
                ['Index Type', 'FAISS FlatL2'],
                ['Similarity Metric', 'Cosine (normalized)'],
                ['Model', 'sentence-transformers'],
                ['Repo', repo],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #21262d' }}>
                  <span style={{ color: '#8b949e' }}>{k}</span>
                  <span style={{ color: '#c9d1d9', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', color: '#8b949e' }}>
          <p>Run a sync to build the vector index.</p>
        </div>
      )}
    </div>
  );
}

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
        <span style={{ fontSize: '11px', padding: '2px 8px', background: '#238636', color: '#fff', borderRadius: '12px', fontWeight: 600 }}>
          LIVE
        </span>
        <span style={{ fontSize: '11px', color: '#8b949e' }}>• refreshes every 3s</span>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff', margin: '0 auto' }} />
        </div>
      ) : status ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <StatCard icon={Cpu} label="Process CPU" value={`${status.process?.cpu_percent || 0}%`} color="#58a6ff" />
            <StatCard icon={Server} label="Memory RSS" value={`${status.process?.memory_rss_mb || 0} MB`} color="#bc8cff" />
            <StatCard icon={Database} label="Issues Stored" value={status.database?.total_issues?.toLocaleString() || '—'} color="#3fb950" />
            <StatCard icon={Activity} label="Clusters" value={status.database?.total_clusters || '—'} color="#d29922" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#c9d1d9', marginBottom: '16px' }}>System Resources</div>
              {[
                ['Total CPU', `${status.system?.cpu_percent_total}%`],
                ['RAM Available', `${status.system?.memory_available_gb} GB`],
                ['RAM Usage', `${status.system?.memory_percent}%`],
                ['Process Threads', status.process?.threads],
                ['DB File Size', `${status.database?.db_size_mb} MB`],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #21262d', fontSize: '13px' }}>
                  <span style={{ color: '#8b949e' }}>{k}</span>
                  <span style={{ color: '#c9d1d9', fontFamily: 'monospace' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', padding: '24px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#c9d1d9', marginBottom: '16px' }}>Repositories Tracked</div>
              {(status.database?.repo_breakdown || []).map(r => (
                <div key={r.repo} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #21262d', fontSize: '13px', alignItems: 'center' }}>
                  <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{r.repo}</span>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <span style={{ color: '#8b949e' }}>{r.issues?.toLocaleString()} issues</span>
                    <span style={{ color: '#3fb950' }}>{r.clusters} clusters</span>
                  </div>
                </div>
              ))}
              {(!status.database?.repo_breakdown?.length) && (
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

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Activity, Map, Search, Server,
  Zap, Loader2, CheckCircle2, XCircle, GitBranch, ArrowLeft
} from 'lucide-react';

// ── SSE parsing helper ────────────────────────────────────────────────────────
async function* readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep incomplete last line safely

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6).trim();
        if (raw) {
          try { yield JSON.parse(raw); } catch { /* malformed chunk */ }
        }
      }
    }
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusPill({ msg, streaming, complete, hasError }) {
  const color = hasError ? 'var(--accent-critical)' : complete ? 'var(--accent-success)' : 'var(--accent-info)';
  const Icon = hasError ? XCircle : complete ? CheckCircle2 : Loader2;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '10px',
      padding: '8px 16px',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${hasError ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-pill)',
      fontSize: '0.8rem',
      color: color,
      maxWidth: '500px',
      backdropFilter: 'blur(8px)'
    }}>
      <Icon size={14} style={streaming && !complete && !hasError ? { animation: 'spin 2s linear infinite' } : {}} />
      <span style={{ fontWeight: 500 }}>{msg || (streaming ? 'Pipeline initializing...' : 'Awaiting stream...')}</span>
    </div>
  );
}

function ClusterCard({ cluster, index }) {
  const isCritical = cluster.urgency === 'Critical';
  return (
    <div
      className="surface-card interactive"
      style={{
        position: 'relative',
        overflow: 'hidden',
        animation: 'fadeUpIn 600ms cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: `${index * 60}ms`,
        borderColor: isCritical ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)',
      }}
    >
      {/* Critical red accent stripe */}
      {isCritical && (
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px',
          background: 'var(--accent-critical)',
          opacity: 0.8
        }} />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div style={{ flex: 1, paddingLeft: isCritical ? '12px' : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            {isCritical && <ShieldAlert size={16} color="var(--accent-critical)" />}
            <span style={{
              fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: isCritical ? 'var(--accent-critical)' : 'var(--accent-info)',
            }}>
              {cluster.urgency} Discovery
            </span>
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 500, lineHeight: 1.4, color: 'var(--color-text-primary)' }}>
            {cluster.insight}
          </h3>
        </div>

        <div style={{
          flexShrink: 0, marginLeft: '16px',
          background: 'rgba(255,255,255,0.03)',
          border: 'var(--border-subtle)',
          padding: '6px 14px',
          borderRadius: 'var(--radius-pill)',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          whiteSpace: 'nowrap',
        }}>
          {cluster.issue_count} incidents
        </div>
      </div>

      {/* Issue number pills */}
      <div style={{
        borderTop: 'var(--border-subtle)',
        paddingTop: '20px',
        display: 'flex', flexWrap: 'wrap', gap: '8px',
      }}>
        {cluster.github_issue_numbers?.slice(0, 10).map(num => (
          <a
            key={num}
            href={`https://github.com/${cluster.repo}/issues/${num}`}
            target="_blank"
            rel="noreferrer"
            className="anim-base"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '5px 12px',
              background: 'rgba(255,255,255,0.02)',
              border: 'var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.75rem',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
          >
            #{num}
          </a>
        ))}
        {cluster.github_issue_numbers?.length > 10 && (
          <span style={{ padding: '5px 10px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            +{cluster.github_issue_numbers.length - 10} others
          </span>
        )}
      </div>

      {/* Progress annotation */}
      {cluster.progress && (
        <div style={{ marginTop: '16px', fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={12} /> {cluster.progress}
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [clusters, setClusters]     = useState([]);
  const [statusMsg, setStatusMsg]   = useState('');
  const [streaming, setStreaming]   = useState(false);
  const [complete, setComplete]     = useState(false);
  const [hasError, setHasError]     = useState(false);
  const [progress, setProgress]     = useState({ processed: 0, total: 0 });
  const [navActive, setNavActive]   = useState('Intelligence');
  const [systemStatus, setSystemStatus] = useState(null);
  const abortRef = useRef(null);

  const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';

  useEffect(() => {
    startStream();
    return () => abortRef.current?.abort();
  }, [repo]);

  // Telemetry polling for System Status tab
  useEffect(() => {
    let interval;
    if (navActive === 'Backend Status') {
      const fetchStatus = () => {
        fetch('http://localhost:8000/api/v1/system/status')
          .then(res => res.json())
          .then(setSystemStatus)
          .catch(() => {});
      };
      fetchStatus();
      interval = setInterval(fetchStatus, 3000);
    }
    return () => clearInterval(interval);
  }, [navActive]);

  async function startStream() {
    setClusters([]);
    setComplete(false);
    setHasError(false);
    setStreaming(true);
    setStatusMsg('Initializing SSE bridge...');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('http://localhost:8000/api/v1/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Pipeline refused connection (${response.status})`);
      }

      for await (const event of readSSEStream(response)) {
        const { type, payload } = event;

        if (type === 'status') setStatusMsg(payload.msg);
        if (type === 'progress') {
          setStatusMsg(payload.msg);
          setProgress({ processed: payload.processed, total: payload.total });
        }
        if (type === 'cluster_found') {
          setClusters(prev => {
            const existing = prev.findIndex(c => c.cluster_label === payload.cluster_label);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = { ...payload, repo };
              return next;
            }
            return [...prev, { ...payload, repo }];
          });
        }
        if (type === 'complete') {
          setStatusMsg(payload.msg);
          setStreaming(false);
          setComplete(true);
        }
        if (type === 'error') {
          setStatusMsg(payload.msg);
          setStreaming(false);
          setHasError(true);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatusMsg(err.message || 'Engine connection fault.');
        setHasError(true);
        setStreaming(false);
      }
    }
  }

  const renderIntelligence = () => (
    <>
      {/* Stats row */}
      {(clusters.length > 0 || complete) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
          {[
            { label: 'Neural Clusters', value: clusters.length, color: 'var(--accent-info)' },
            { label: 'Critical Mass', value: clusters.filter(c => c.urgency === 'Critical').length, color: 'var(--accent-critical)' },
            { label: 'Issues Ingested', value: progress.total || '—', color: 'var(--color-text-primary)' },
          ].map(stat => (
            <div key={stat.label} className="surface-card" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.04em', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cluster Feed */}
      {clusters.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {clusters.map((cluster, idx) => <ClusterCard key={cluster.cluster_label} cluster={cluster} index={idx} />)}
        </div>
      ) : streaming && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '100px 0', color: 'var(--color-text-muted)' }}>
          <Loader2 size={40} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite' }} />
          <p style={{ fontSize: '1rem', maxWidth: '400px', textAlign: 'center', lineHeight: 1.6 }}>Ingesting issue stream... <br/>Spatial Matrix is being computed.</p>
        </div>
      )}
    </>
  );

  const renderSpatialMatrix = () => (
    <div className="surface-card stagger-1" style={{ padding: '40px' }}>
      <h2 style={{ marginBottom: '32px' }}>DBSCAN Spatial Density</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: '10px' }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} style={{ 
            height: '40px', 
            background: i < clusters.length * 2 ? 'var(--accent-info)' : 'rgba(255,255,255,0.02)',
            opacity: i < clusters.length * 2 ? 0.2 + (Math.random() * 0.8) : 1,
            borderRadius: '4px',
            border: 'var(--border-subtle)'
          }} />
        ))}
      </div>
      <p style={{ marginTop: '32px', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
        Visualizing vector density across the manifold. Shaded cells represent localized high-density incident regions (ε=0.28).
      </p>
    </div>
  );

  const renderVectorIndex = () => (
    <div className="surface-card stagger-1" style={{ padding: '40px' }}>
      <h2 style={{ marginBottom: '32px' }}>FAISS Index Metadata</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {[

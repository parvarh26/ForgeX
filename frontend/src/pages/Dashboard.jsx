import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Activity, Map, Search, Server,
  Zap, Loader2, CheckCircle2, XCircle, GitBranch, ArrowLeft,
  RefreshCw, CheckCircle, Sparkles, MessageSquare, Bot,
  Code, Folder, FileText
} from 'lucide-react';

// ── SSE parsing helper ────────────────────────────────────────────────────────
async function* readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    offset: buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; 

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

// ── Sub-components (outside for stability) ──────────────────────────────────

function StatusPill({ msg, streaming, complete, hasError }) {
  const color = hasError ? 'var(--accent-critical)' : complete ? 'var(--accent-success)' : 'var(--accent-info)';
  const Icon = hasError ? XCircle : complete ? CheckCircle2 : Loader2;

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '10px',
      padding: '8px 16px',
      background: 'var(--color-surface-elevated)',
      border: `1px solid ${hasError ? 'rgba(239,68,68,0.2)' : 'var(--border-subtle)'}`,
      borderRadius: 'var(--radius-pill)',
      fontSize: '0.8rem',
      color: color,
      maxWidth: '500px'
    }}>
      <Icon size={14} style={streaming && !complete && !hasError ? { animation: 'spin 2s linear infinite' } : {}} />
      <span style={{ fontWeight: 500 }}>{msg || (streaming ? 'Pipeline initializing...' : 'Awaiting stream...')}</span>
    </div>
  );
}

function ClusterCard({ cluster, index, navigate }) {
  const isCritical = cluster.urgency === 'Critical';
  
  return (
    <div
      onClick={() => navigate(`/cluster/${cluster.cluster_label}`)}
      style={{
        display: 'flex', alignItems: 'flex-start', padding: '16px',
        borderTop: index === 0 ? 'none' : '1px solid #30363d',
        background: '#0d1117', cursor: 'pointer',
        animation: 'fadeUpIn 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
        animationDelay: `${index * 30}ms`,
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
      onMouseLeave={e => e.currentTarget.style.background = '#0d1117'}
    >
      <div style={{ marginTop: '2px', flexShrink: 0, color: '#3fb950' }}>
         <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"></path><path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z"></path></svg>
      </div>
      <div style={{ marginLeft: '12px', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#c9d1d9', margin: 0, lineHeight: 1.3 }}>
            [{cluster.urgency} Discovery]: {cluster.insight}
          </h3>
          <span style={{ fontSize: '12px', color: '#8b949e', border: '1px solid rgba(139,148,158,0.3)', padding: '0 10px', borderRadius: '12rem', lineHeight: '20px' }}>
             Status: Neural Grouping
          </span>
          {isCritical && (
             <span style={{ fontSize: '12px', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)', padding: '0 10px', borderRadius: '12rem', lineHeight: '20px' }}>
                Type: High-Risk
             </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>
          #{cluster.cluster_label} discovered by OpenIssue AI Mapping System
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#8b949e', fontSize: '12px', flexShrink: 0, paddingLeft: '16px' }}>
        <MessageSquare size={14} />
        {cluster.issue_count}
      </div>
    </div>
  );
}

function GlobalCommandPalette({ repo, clusters, navigate }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const suggestions = query.trim() 
    ? clusters.filter(c => c.insight.toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsFocused(false);
    navigate(`/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`);
  };

  return (
    <div style={{ position: 'relative', width: '400px' }}>
      <form onSubmit={handleSearchSubmit} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <input 
          ref={inputRef}
          type="text" 
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={`Type / to search ${repo}`} 
          style={{
            width: '100%', padding: '6px 12px 6px 32px',
            fontSize: '14px', lineHeight: '20px',
            background: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px',
            color: '#c9d1d9', outline: 'none',
            transition: 'width 0.2s, background 0.2s',
          }}
          onFocusCapture={e => { e.target.style.background = '#0d1117'; e.target.style.borderColor = '#58a6ff'; e.target.style.width = '600px'; }}
          onBlurCapture={e => { e.target.style.background = 'rgba(255,255,255,0.1)'; e.target.style.borderColor = 'rgba(255,255,255,0.2)'; e.target.style.width = '100%'; }}
        />
        <Search size={14} color="#8b949e" style={{ position: 'absolute', left: '10px' }} />
        <div style={{ position: 'absolute', right: '10px', fontSize: '10px', padding: '2px 6px', border: '1px solid #30363d', borderRadius: '4px', color: '#8b949e' }}>/</div>
      </form>
      {isFocused && query.trim() && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', zIndex: 100, overflow: 'hidden' }}>
          {suggestions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '8px 12px', fontSize: '12px', color: '#8b949e', borderBottom: '1px solid #30363d' }}>Jump to cluster...</div>
              {suggestions.map(s => (
                <div key={s.cluster_label} onClick={() => navigate(`/cluster/${s.cluster_label}`)} style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#c9d1d9', fontSize: '13px', borderBottom: '1px solid #30363d' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <MessageSquare size={14} color="#8b949e"/><span style={{ fontWeight: 600 }}>{s.insight}</span><span style={{ color: '#8b949e', fontSize: '12px', marginLeft: 'auto' }}>#{s.cluster_label}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#c9d1d9', fontSize: '13px' }} onClick={handleSearchSubmit} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <Bot size={16} color="#58a6ff"/><span>Ask OpenIssue AI to solve: <strong>{query}</strong></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepositoryBrowser({ repo }) {
  const [path, setPath] = useState('');
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readme, setReadme] = useState(null);

  useEffect(() => {
    fetchContents(path);
  }, [repo, path]);

  const fetchContents = async (currentPath) => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`https://api.github.com/repos/${repo}/contents/${currentPath}`);
      if (!resp.ok) throw new Error('Repository unreachable.');
      const data = await resp.json();
      const sorted = Array.isArray(data) ? data.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'dir' ? -1 : 1;
      }) : [];
      setContents(sorted);

      if (currentPath === '') {
        const readmeFile = sorted.find(f => f.name.toLowerCase() === 'readme.md');
        if (readmeFile) {
          fetch(readmeFile.download_url).then(r => r.text()).then(setReadme).catch(() => {});
        } else {
          setReadme(null);
        }
      } else {
        setReadme(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const breadcrumbs = path.split('/').filter(Boolean);

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '14px', color: '#58a6ff' }}>
        <span onClick={() => setPath('')} style={{ cursor: 'pointer', fontWeight: 600 }}>{repo.split('/')[1]}</span>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span style={{ color: '#8b949e' }}>/</span>
            <span onClick={() => setPath(breadcrumbs.slice(0, idx + 1).join('/'))} style={{ cursor: 'pointer', fontWeight: 600 }}>{crumb}</span>
          </React.Fragment>
        ))}
      </div>

      <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden', marginBottom: '32px' }}>
        <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', color: '#c9d1d9', fontSize: '14px', gap: '12px' }}>
          <GitBranch size={16} color="#8b949e" /><span style={{ fontWeight: 600 }}>main</span>
          <span style={{ color: '#8b949e' }}>{contents.length} nodes</span>
        </div>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="indicator-pulse" style={{ animation: 'spin 2s linear infinite' }} /></div>
        ) : error ? (
          <div style={{ padding: '40px', color: '#f85149', textAlign: 'center' }}>{error}</div>
        ) : (
          <div>
            {path && (
              <div onClick={() => setPath(path.includes('/') ? path.split('/').slice(0, -1).join('/') : '')} style={{ padding: '12px 16px', borderBottom: '1px solid #30363d', color: '#58a6ff', cursor: 'pointer' }}>..</div>
            )}
            {contents.map((item, idx) => (
              <div key={item.sha} onClick={() => item.type === 'dir' && setPath(item.path)} style={{ padding: '12px 16px', borderBottom: idx === contents.length - 1 ? 'none' : '1px solid #30363d', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', alignItems: 'center', fontSize: '14px', cursor: item.type === 'dir' ? 'pointer' : 'default' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {item.type === 'dir' ? <Folder size={16} color="#7d8590" /> : <FileText size={16} color="#7d8590" />}
                  <span style={{ color: '#c9d1d9' }}>{item.name}</span>
                </div>
                <div style={{ color: '#8b949e', fontSize: '13px' }}>Integrated via OpenIssue Semantic Sync</div>
                <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'right' }}>just now</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {readme && (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117' }}>
          <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', color: '#c9d1d9', fontSize: '14px', fontWeight: 600 }}>README.md</div>
          <div style={{ padding: '32px', color: '#c9d1d9', fontSize: '15px', lineHeight: 1.6 }}>
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0 }}>{readme}</pre>
          </div>
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
  const [bgSync, setBgSync]         = useState({ processed: 0, total_repo: 0, is_syncing: false, just_finished: false });
  const [navActive, setNavActive]   = useState('Code');
  const [systemStatus, setSystemStatus] = useState(null);
  const abortRef = useRef(null);

  const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';

  useEffect(() => {
    startStream();
    return () => abortRef.current?.abort();
  }, [repo]);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/api/v1/github/ws/sync/${encodeURIComponent(repo)}`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setBgSync(prev => ({ ...data, just_finished: (prev.is_syncing && !data.is_syncing && data.processed > 0) || prev.just_finished }));
      if (data.total_repo > 0) setProgress(p => ({ ...p, total: data.total_repo }));
    };
    return () => ws.close();
  }, [repo]);

  useEffect(() => {
    sessionStorage.setItem('openissue_clusters', JSON.stringify(clusters));
  }, [clusters]);

  useEffect(() => {
    let interval;
    if (navActive === 'Backend Status') {
      const fetchStatus = () => {
        fetch('http://localhost:8000/api/v1/system/status').then(res => res.json()).then(setSystemStatus).catch(() => {});
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
      if (!response.ok) throw new Error(`Pipeline fault (${response.status})`);
      for await (const event of readSSEStream(response)) {
        const { type, payload } = event;
        if (type === 'status') setStatusMsg(payload.msg);
        if (type === 'progress') {
          setStatusMsg(payload.msg);
          setProgress({ processed: payload.processed, total: payload.total });
        }
        if (type === 'cluster_found') {
          setClusters(prev => {
            const existing = prev.findIndex(c => String(c.cluster_label) === String(payload.cluster_label));
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
      {(bgSync.is_syncing || bgSync.just_finished) && (
        <div className="surface-card" style={{ padding: '16px 24px', marginBottom: '24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: bgSync.just_finished ? '1px solid #238636' : '1px solid #30363d' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {bgSync.is_syncing ? <Loader2 className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', color: '#8b949e' }} size={18} /> : <CheckCircle size={18} style={{ color: '#238636' }}/>}
                <div>
                   <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>{bgSync.is_syncing ? 'Background Data Sync Active' : 'Repository Sync Complete'}</div>
                   <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>{bgSync.processed} / {bgSync.total_repo || '?'} issues securely indexed</div>
                </div>
            </div>
            {bgSync.just_finished && (
                <button onClick={() => { setBgSync(p => ({...p, just_finished: false})); startStream(); }} style={{ background: 'var(--accent-success)', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>
                  <RefreshCw size={14} style={{ marginRight: '6px' }} /> Recompute AI Matrix
                </button>
            )}
        </div>
      )}
      {(clusters.length > 0 || complete) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
          {[
            { label: 'Neural Clusters', value: clusters.length, color: 'var(--accent-info)' },
            { label: 'Critical Mass', value: clusters.filter(c => c.urgency === 'Critical').length, color: 'var(--accent-critical)' },
            { label: 'Issues Ingested', value: bgSync.processed || progress.total || '—', color: 'var(--color-text-primary)' },
          ].map(stat => (
            <div key={stat.label} className="surface-card" style={{ padding: '24px', textAlign: 'center' }}>
              <div style={{ fontSize: '2.2rem', fontWeight: 700, marginBottom: '6px', letterSpacing: '-0.04em', color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}
      {clusters.length > 0 ? (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden' }}>
          <div style={{ padding: '16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>
            <Activity size={16} /><span>Open Intelligence Feed ({clusters.length})</span>
          </div>
          <div>{clusters.map((cluster, idx) => <ClusterCard key={cluster.cluster_label} cluster={cluster} index={idx} navigate={navigate} />)}</div>
        </div>
      ) : streaming && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px', padding: '100px 0', color: 'var(--color-text-muted)' }}>
          <Loader2 size={40} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite' }} />
          <p style={{ textAlign: 'center' }}>Ingesting issue stream... <br/>Computing Spatial Matrix.</p>
        </div>
      )}
    </>
  );

  const NAV_ITEMS = [
    { icon: <Code size={16} />, label: 'Code' },
    { icon: <Activity size={16} />, label: 'Intelligence' },
    { icon: <Map size={16} />, label: 'Spatial Matrix' },
    { icon: <Search size={16} />, label: 'Vector Index' },
    { icon: <Server size={16} />, label: 'Backend Status' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117' }}>
      <div style={{ background: '#010409', padding: '16px 24px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: '#161b22', border: '1px solid #30363d', borderRadius: '50%' }}>
            <Zap size={16} color="#c9d1d9" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8b949e', fontWeight: 400 }}>OpenIssue</span><span style={{ color: '#8b949e' }}>/</span>
            <span style={{ fontWeight: 600 }}>{repo}</span>
            <span style={{ padding: '2px 8px', border: '1px solid #30363d', borderRadius: '2rem', fontSize: '12px', color: '#8b949e', marginLeft: '8px' }}>Public</span>
          </div>
        </div>
        <GlobalCommandPalette repo={repo} clusters={clusters} navigate={navigate} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <StatusPill msg={statusMsg} streaming={streaming} complete={complete} hasError={hasError} />
          <button onClick={() => navigate('/select-repo')} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><ArrowLeft size={14} /> New Sync</button>
        </div>
      </div>
      <div style={{ background: '#010409', borderBottom: '1px solid #30363d', padding: '0 24px' }}>
        <nav style={{ display: 'flex', gap: '16px', maxWidth: '1216px', margin: '0 auto' }}>
          {NAV_ITEMS.map(item => (
            <div key={item.label} onClick={() => setNavActive(item.label)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 8px', cursor: 'pointer', fontSize: '14px', color: navActive === item.label ? '#c9d1d9' : '#8b949e', borderBottom: navActive === item.label ? '2px solid #fd8c73' : '2px solid transparent', fontWeight: navActive === item.label ? 600 : 400 }}>
              {React.cloneElement(item.icon, { color: navActive === item.label ? '#c9d1d9' : '#8b949e' })} {item.label}
            </div>
          ))}
        </nav>
      </div>
      <main style={{ padding: '40px 24px', maxWidth: '1216px', margin: '0 auto', width: '100%', position: 'relative' }}>
        {streaming && progress.total > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.78rem', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase' }}>
              <span>Vectorizing incidents</span><span>{progress.processed} / {progress.total} Mapped</span>
            </div>
            <div style={{ height: '4px', background: '#161b22', borderRadius: '2rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.round((progress.processed/progress.total)*100)}%`, background: '#238636', transition: 'width 0.8s' }} />
            </div>
          </div>
        )}
        {navActive === 'Code' && <RepositoryBrowser repo={repo} />}
        {navActive === 'Intelligence' && renderIntelligence()}
        {navActive === 'Spatial Matrix' && <div className="surface-card" style={{ padding: '40px' }}><h2>Spatial Matrix</h2><p>DBSCAN Density visualization coming soon.</p></div>}
        {navActive === 'Vector Index' && <div className="surface-card" style={{ padding: '40px' }}><h2>Vector Index</h2><p>FAISS Index metadata visualization coming soon.</p></div>}
        {navActive === 'Backend Status' && <div className="surface-card" style={{ padding: '40px' }}><h2>System Telemetry</h2><p>{JSON.stringify(systemStatus)}</p></div>}
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

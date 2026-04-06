import React, { useState, useEffect, useRef, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Search, Server, Zap, Loader2, CheckCircle2,
  XCircle, ArrowLeft, RefreshCw, MessageSquare, Bot, Code,
  Folder, FileText, ChevronLeft, Bell, Eye, Map as TopologyMap
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import SpatialMatrixView from './SpatialMatrixView';
import VectorIndexView, { BackendStatusView } from './VectorIndexView';
import IssuePreviewModal from './IssuePreviewModal';

// ── Error Boundary — prevents full black screen on any crash ─────────────────
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0d1117', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
          <div style={{ maxWidth: '600px', padding: '32px', border: '1px solid rgba(248,81,73,0.3)', borderRadius: '8px', background: '#161b22' }}>
            <div style={{ color: '#f85149', fontWeight: 700, fontSize: '18px', marginBottom: '12px' }}>⚠ Dashboard error</div>
            <pre style={{ color: '#c9d1d9', fontSize: '12px', whiteSpace: 'pre-wrap', marginBottom: '20px' }}>
              {this.state.error?.message}
            </pre>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              style={{ background: '#238636', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── SSE reader ───────────────────────────────────────────────────────────────
async function* readSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('data: ')) {
        const raw = trimmed.slice(6).trim();
        if (raw) { try { yield JSON.parse(raw); } catch {} }
      }
    }
  }
}

// ── Stable sub-components (defined outside Dashboard to prevent remount) ─────

function StatusPill({ msg, streaming, complete, hasError }) {
  const color = hasError ? '#f85149' : complete ? '#3fb950' : '#58a6ff';
  const Icon = hasError ? XCircle : complete ? CheckCircle2 : Loader2;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasError ? 'rgba(248,81,73,0.3)' : '#30363d'}`, borderRadius: '6px', fontSize: '12px', color }}>
      <Icon size={12} style={streaming && !complete && !hasError ? { animation: 'spin 1.5s linear infinite' } : {}} />
      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px' }}>
        {msg || 'Initializing...'}
      </span>
    </div>
  );
}

function ClusterCard({ cluster, index, navigate, onPreview, repoOwner, repoName }) {
  const isCritical = cluster.urgency === 'Critical';
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderTop: index === 0 ? 'none' : '1px solid #30363d', background: '#0d1117' }}>
      <div style={{ color: '#3fb950', flexShrink: 0, marginTop: '1px' }}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /><path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" /></svg>
      </div>
      <div
        onClick={() => navigate(`/cluster/${repoOwner}/${repoName}/${cluster.cluster_label}`)}
        style={{ marginLeft: '12px', flex: 1, minWidth: 0, cursor: 'pointer', animation: 'fadeUpIn 300ms ease both', animationDelay: `${Math.min(index * 12, 250)}ms` }}
        onMouseEnter={e => e.currentTarget.parentElement.style.background = '#161b22'}
        onMouseLeave={e => e.currentTarget.parentElement.style.background = '#0d1117'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>[{cluster.urgency}]: {cluster.insight}</span>
          {isCritical && <span style={{ fontSize: '10px', color: '#f85149', border: '1px solid rgba(248,81,73,0.4)', padding: '0 6px', borderRadius: '12px', lineHeight: '18px', flexShrink: 0 }}>Critical</span>}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>Cluster #{cluster.cluster_label} · {cluster.issue_count} issues</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '12px', flexShrink: 0 }}>
        {typeof onPreview === 'function' && (
          <button
            onClick={(e) => { e.stopPropagation(); onPreview(cluster); }}
            title="Quick Preview"
            style={{ background: 'transparent', border: '1px solid #30363d', borderRadius: '5px', padding: '4px 8px', cursor: 'pointer', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#58a6ff'; e.currentTarget.style.color = '#58a6ff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; }}
          >
            <Eye size={12} /> Preview
          </button>
        )}
        <MessageSquare size={13} style={{ color: '#8b949e' }} />
        <span style={{ fontSize: '12px', color: '#8b949e' }}>{cluster.issue_count}</span>
      </div>
    </div>
  );
}

function CommandPalette({ repo, clusters, navigate }) {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault(); ref.current?.focus();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const suggestions = query.trim()
    ? clusters.filter(c => (c.insight || '').toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const submit = (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setFocused(false);
    navigate(`/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`);
  };

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
      <form onSubmit={submit} style={{ position: 'relative' }}>
        <Search size={13} color="#8b949e" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          ref={ref} type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={`Search ${repo}...`}
          style={{ width: '100%', padding: '6px 32px 6px 30px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d', borderRadius: '6px', color: '#c9d1d9', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
          onFocus={e => { setFocused(true); e.target.style.borderColor = '#58a6ff'; e.target.style.background = '#0d1117'; }}
          onBlur={e => { setTimeout(() => setFocused(false), 150); e.target.style.borderColor = '#30363d'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
        />

        <kbd style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', padding: '1px 5px', border: '1px solid #30363d', borderRadius: '4px', color: '#8b949e', background: 'transparent' }}>/</kbd>
      </form>
      {focused && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', zIndex: 1000, overflowY: 'auto', maxHeight: '280px', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
          {query.trim() ? (
            <>
              <div onClick={submit} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Bot size={14} color="#58a6ff" />
                <span style={{ fontSize: '13px', flex: 1 }}>AI Search: <b>{query}</b></span>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>↵</span>
              </div>
              {suggestions.map(s => (
                <div key={s.cluster_label} onClick={() => navigate(`/cluster/${s.cluster_label}`)}
                  style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderTop: '1px solid #21262d' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <MessageSquare size={13} color="#8b949e" />
                  <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.insight}</span>
                  <span style={{ fontSize: '11px', color: '#8b949e', flexShrink: 0 }}>#{s.cluster_label}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: '12px 14px', color: '#8b949e', fontSize: '13px' }}>Search clusters or press Enter for AI search</div>
          )}
        </div>
      )}
    </div>
  );
}

function RepoBrowser({ repo }) {
  const [path, setPath] = useState('');
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readme, setReadme] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => { fetchDir(path); }, [repo, path]);

  const fetchDir = async (p) => {
    setLoading(true); setError(''); setSelectedFile(null); setReadme(null);
    try {
      const resp = await fetch(`http://localhost:8000/api/v1/github/contents?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(p)}`);
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.detail || 'Unreachable'); }
      const data = await resp.json();
      if (!Array.isArray(data)) { setError('Not a directory.'); return; }
      const sorted = data.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1);
      setContents(sorted);
      if (p === '') {
        const rm = sorted.find(f => f.name.toLowerCase() === 'readme.md');
        if (rm?.download_url) {
          fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(rm.download_url)}`)
            .then(r => r.text()).then(setReadme).catch(() => {});
        }
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const openFile = async (file) => {
    if (!file.download_url) { setError('Cannot fetch this file type.'); return; }
    setSelectedFile(file); setFileLoading(true);
    try {
      const r = await fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(file.download_url)}`);
      setFileContent(r.ok ? await r.text() : 'Failed to load content.');
    } catch { setFileContent('Network error loading file.'); }
    finally { setFileLoading(false); }
  };

  const getLang = (name) => ({ js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', css: 'css', html: 'html', md: 'markdown', json: 'json', sh: 'bash', yml: 'yaml', yaml: 'yaml', go: 'go', rs: 'rust', java: 'java' })[name.split('.').pop()?.toLowerCase()] || 'text';
  const breadcrumbs = path.split('/').filter(Boolean);

  return (
    <div style={{ animation: 'fadeUpIn 300ms ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px', fontSize: '14px', color: '#58a6ff', flexWrap: 'wrap' }}>
        <span onClick={() => { setPath(''); setSelectedFile(null); }} style={{ cursor: 'pointer', fontWeight: 600 }}>{repo.split('/')[1]}</span>
        {breadcrumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span style={{ color: '#8b949e' }}>/</span>
            <span onClick={() => setPath(breadcrumbs.slice(0, i + 1).join('/'))} style={{ cursor: 'pointer' }}>{c}</span>
          </React.Fragment>
        ))}
        {selectedFile && <><span style={{ color: '#8b949e' }}>/</span><span style={{ color: '#c9d1d9' }}>{selectedFile.name}</span></>}
      </div>

      <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#c9d1d9' }}>
          {selectedFile ? (
            <>
              <ChevronLeft size={15} style={{ cursor: 'pointer' }} onClick={() => setSelectedFile(null)} />
              <FileText size={14} color="#8b949e" />
              <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
              {selectedFile.size > 0 && <span style={{ color: '#8b949e', fontSize: '11px' }}>({(selectedFile.size / 1024).toFixed(1)} KB)</span>}
            </>
          ) : (
            <><Code size={14} color="#8b949e" /><span style={{ fontWeight: 600 }}>{repo}</span><span style={{ color: '#8b949e' }}>/ {path || 'root'}</span></>
          )}
        </div>

        {selectedFile ? (
          fileLoading
            ? <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={22} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff' }} /></div>
            : <SyntaxHighlighter language={getLang(selectedFile.name)} style={vscDarkPlus} customStyle={{ margin: 0, padding: '20px', fontSize: '12px', background: '#010409' }} showLineNumbers>{fileContent}</SyntaxHighlighter>
        ) : loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={22} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff' }} /></div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#f85149', fontSize: '13px' }}>{error}</div>
        ) : (
          <>
            {path && <div onClick={() => setPath(breadcrumbs.slice(0, -1).join('/'))} style={{ padding: '10px 16px', borderBottom: '1px solid #30363d', color: '#58a6ff', cursor: 'pointer', fontSize: '13px' }}>..</div>}
            {contents.map((item, idx) => (
              <div key={item.sha || idx}
                onClick={() => item.type === 'dir' ? setPath(item.path) : openFile(item)}
                style={{ padding: '9px 16px', borderBottom: idx < contents.length - 1 ? '1px solid #30363d' : 'none', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer', background: '#0d1117' }}
                onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
                onMouseLeave={e => e.currentTarget.style.background = '#0d1117'}
              >
                {item.type === 'dir' ? <Folder size={15} color="#7d8590" /> : <FileText size={15} color="#7d8590" />}
                <span style={{ color: '#c9d1d9', flex: 1 }}>{item.name}</span>
                {item.size > 0 && <span style={{ color: '#8b949e', fontSize: '11px' }}>{(item.size / 1024).toFixed(1)} KB</span>}
              </div>
            ))}
          </>
        )}
      </div>

      {!selectedFile && readme && (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', fontSize: '13px', fontWeight: 600, color: '#c9d1d9' }}>README.md</div>
          <div className="markdown-body" style={{ padding: '28px', fontSize: '14px', lineHeight: 1.7, color: '#c9d1d9' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
function DashboardInner() {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState([]);
  const [statusMsg, setStatusMsg] = useState('Connecting...');
  const [streaming, setStreaming] = useState(false);
  const [complete, setComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [bgSync, setBgSync] = useState({ processed: 0, total_repo: 0, is_syncing: false });
  const [newActivity, setNewActivity] = useState(null);
  const [navActive, setNavActive] = useState('Intelligence');
  const [previewCluster, setPreviewCluster] = useState(null);

  const abortRef = useRef(null);
  const bufferRef = useRef([]);
  const throttleRef = useRef(null);
  const mountedRef = useRef(true);

  const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';
  const [owner, repoName] = repo.split('/');

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (throttleRef.current) clearInterval(throttleRef.current);
    };
  }, []);

  // Start stream on mount
  useEffect(() => {
    startStream();
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) { clearInterval(throttleRef.current); throttleRef.current = null; }
    };
  }, [repo]);

  // WebSocket — fixed: prevent reconnect after unmount
  useEffect(() => {
    let ws = null;
    let shouldReconnect = true;
    let retryTimeout = null;

    const connect = () => {
      if (!shouldReconnect) return;
      try {
        ws = new WebSocket(`ws://localhost:8000/api/v1/github/ws/sync/${repo}`);
        ws.onmessage = (e) => {
          if (!mountedRef.current) return;
          try {
            const data = JSON.parse(e.data);
            if (data && typeof data === 'object') {
              setBgSync(prev => ({ ...prev, ...data }));
              if (data.new_activity) setNewActivity({ count: data.new_event_count || 1 });
            }
          } catch {}
        };
        ws.onerror = () => {};
        ws.onclose = () => {
          if (shouldReconnect && mountedRef.current) {
            retryTimeout = setTimeout(connect, 4000);
          }
        };
      } catch {}
    };

    connect();
    return () => {
      shouldReconnect = false;
      clearTimeout(retryTimeout);
      try { ws?.close(); } catch {}
    };
  }, [repo]);

  const startStream = async () => {
    if (!mountedRef.current) return;
    setClusters([]);
    bufferRef.current = [];
    setComplete(false);
    setHasError(false);
    setStreaming(true);
    setStatusMsg('Connecting to intelligence pipeline...');

    // Clear old throttle
    if (throttleRef.current) { clearInterval(throttleRef.current); throttleRef.current = null; }

    // Batch UI updates every 400ms — prevents flooding React reconciler
    throttleRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current.splice(0, 50);
        setClusters(prev => {
          const map = new Map(prev.map(c => [String(c.cluster_label), c]));
          batch.forEach(c => map.set(String(c.cluster_label), { ...c, repo }));
          return Array.from(map.values());
        });
      }
    }, 400);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch('http://localhost:8000/api/v1/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(`Pipeline unavailable (${resp.status})`);

      for await (const { type, payload } of readSSEStream(resp)) {
        if (!mountedRef.current) break;
        if (type === 'status') setStatusMsg(payload?.msg || '');
        if (type === 'cluster_found') bufferRef.current.push(payload || {});
        if (type === 'complete') { setStreaming(false); setComplete(true); setStatusMsg(payload?.msg || 'Matrix ready.'); }
        if (type === 'error') { setStreaming(false); setHasError(true); setStatusMsg(payload?.msg || 'Pipeline error.'); }
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err.name !== 'AbortError') {
        setStreaming(false);
        setHasError(true);
        setStatusMsg(err.message || 'Connection failed.');
      }
    }
  };

  const renderIntelligence = () => (
    <>
      {newActivity && (
        <div style={{ padding: '10px 16px', marginBottom: '14px', background: 'rgba(88,166,255,0.06)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={13} color="#58a6ff" />
            <span style={{ fontSize: '13px', color: '#c9d1d9' }}><b>{newActivity.count}</b> new issue events detected on GitHub</span>
          </div>
          <button onClick={() => { setNewActivity(null); startStream(); }} style={{ background: '#238636', border: 'none', color: '#fff', padding: '4px 12px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <RefreshCw size={11} /> Re-sync
          </button>
        </div>
      )}

      {bgSync.is_syncing && (
        <div style={{ padding: '10px 16px', marginBottom: '14px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Loader2 size={13} style={{ animation: 'spin 1.5s linear infinite', color: '#8b949e', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#c9d1d9', fontWeight: 600 }}>Indexing {repo}</div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
              {(bgSync.processed || 0).toLocaleString()} / {bgSync.total_repo > 0 ? bgSync.total_repo.toLocaleString() : '—'} issues
            </div>
          </div>
          <div style={{ width: '100px', height: '3px', background: '#21262d', borderRadius: '2px', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{ width: `${bgSync.total_repo > 0 ? Math.min((bgSync.processed / bgSync.total_repo) * 100, 100) : 5}%`, height: '100%', background: '#238636', transition: 'width 0.8s ease' }} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Neural Clusters', value: clusters.length, color: '#58a6ff' },
          { label: 'High Priority', value: clusters.filter(c => c.urgency === 'Critical').length, color: '#f85149' },
          { label: 'Issues Indexed', value: (bgSync.processed > 0 ? bgSync.processed : clusters.reduce((s, c) => s + (Number(c.issue_count) || 0), 0)).toLocaleString(), color: '#3fb950' },
        ].map(s => (
          <div key={s.label} style={{ padding: '18px 20px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '28px', fontWeight: 700, color: s.color, marginBottom: '3px', letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {clusters.length > 0 ? (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#c9d1d9' }}>
            <Activity size={13} />
            <span>Semantic Matrix ({clusters.length} clusters)</span>
            {clusters.length > 100 && <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#8b949e', fontWeight: 400 }}>Showing top 100</span>}
          </div>
          {clusters.slice(0, 100).map((c, idx) => (
            <ClusterCard 
              key={c.cluster_label || idx} 
              cluster={c} 
              index={idx} 
              navigate={navigate} 
              onPreview={setPreviewCluster} 
              repoOwner={owner}
              repoName={repoName}
            />
          ))}
        </div>
      ) : streaming ? (
        <div style={{ padding: '80px 0', textAlign: 'center' }}>
          <Loader2 size={32} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff', display: 'block', margin: '0 auto 14px' }} />
          <div style={{ color: '#c9d1d9', fontSize: '14px', marginBottom: '4px' }}>Building intelligence matrix...</div>
          <div style={{ color: '#8b949e', fontSize: '12px' }}>{statusMsg}</div>
        </div>
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', border: '1px solid #30363d', borderRadius: '6px' }}>
          <div style={{ color: '#8b949e', fontSize: '14px', marginBottom: '12px' }}>
            {hasError ? `Pipeline error: ${statusMsg}` : 'No clusters yet.'}
          </div>
          <button onClick={startStream} style={{ background: '#238636', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} /> Start Sync
          </button>
        </div>
      )}
    </>
  );

  const TABS = [
    { icon: <Activity size={15} />, label: 'Intelligence' },
    { icon: <Code size={15} />, label: 'Code' },
    { icon: <TopologyMap size={15} />, label: 'Spatial Matrix' },
    { icon: <Search size={15} />, label: 'Vector Index' },
    { icon: <Server size={15} />, label: 'Backend Status' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif' }}>
      {/* Header */}
      <div style={{ background: '#010409', padding: '0 24px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '16px', height: '58px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <div style={{ width: '26px', height: '26px', background: '#161b22', border: '1px solid #30363d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={13} color="#c9d1d9" />
          </div>
          <span style={{ color: '#8b949e', fontSize: '14px' }}>OpenIssue</span>
          <span style={{ color: '#30363d' }}>/</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{repo}</span>
        </div>
        <CommandPalette repo={repo} clusters={clusters} navigate={navigate} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexShrink: 0 }}>
          <StatusPill msg={statusMsg} streaming={streaming} complete={complete} hasError={hasError} />
          <button onClick={startStream} title="Re-sync" style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 9px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <RefreshCw size={13} />
          </button>
          <button onClick={() => navigate('/select-repo')} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 10px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}>
            <ArrowLeft size={12} /> Repos
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: '#010409', borderBottom: '1px solid #30363d', padding: '0 24px' }}>
        <nav style={{ display: 'flex' }}>
          {TABS.map(tab => (
            <button key={tab.label} onClick={() => setNavActive(tab.label)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 14px', fontSize: '13px', background: 'none', border: 'none', borderBottom: navActive === tab.label ? '2px solid #fd8c73' : '2px solid transparent', color: navActive === tab.label ? '#c9d1d9' : '#8b949e', fontWeight: navActive === tab.label ? 600 : 400, cursor: 'pointer', transition: 'color 0.15s' }}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <main style={{ padding: '28px 24px', maxWidth: '1216px', margin: '0 auto' }}>
        {navActive === 'Intelligence' && renderIntelligence()}
        {navActive === 'Code' && <RepoBrowser repo={repo} />}
        {navActive === 'Spatial Matrix' && <SpatialMatrixView repo={repo} />}
        {navActive === 'Vector Index' && <VectorIndexView repo={repo} />}
        {navActive === 'Backend Status' && <BackendStatusView />}
      </main>

      {previewCluster && (
        <IssuePreviewModal cluster={previewCluster} repo={repo} onClose={() => setPreviewCluster(null)} />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUpIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .markdown-body h1,.markdown-body h2,.markdown-body h3 { color: #c9d1d9; border-bottom: 1px solid #30363d; padding-bottom: 6px; margin-top: 24px; }
        .markdown-body a { color: #58a6ff; text-decoration: none; }
        .markdown-body a:hover { text-decoration: underline; }
        .markdown-body code:not(pre code) { background: rgba(110,118,129,0.15); padding: 1px 5px; border-radius: 3px; font-size: 0.88em; }
        .markdown-body pre { background: #161b22; padding: 14px; border-radius: 6px; overflow-x: auto; border: 1px solid #30363d; }
        .markdown-body blockquote { border-left: 3px solid #30363d; padding-left: 14px; color: #8b949e; margin: 0 0 16px; }
        .markdown-body table { border-collapse: collapse; width: 100%; margin-bottom: 16px; }
        .markdown-body th,.markdown-body td { border: 1px solid #30363d; padding: 6px 12px; }
        .markdown-body th { background: #161b22; font-weight: 600; }
        .markdown-body img { max-width: 100%; border-radius: 6px; }
        .markdown-body ul,.markdown-body ol { padding-left: 24px; }
        .markdown-body li { margin-bottom: 4px; }
        button:focus-visible { outline: 2px solid #58a6ff; outline-offset: 2px; }
      `}</style>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardInner />
    </ErrorBoundary>
  );
}

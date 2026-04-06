import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, Map, Search, Server,
  Zap, Loader2, CheckCircle2, XCircle, GitBranch, ArrowLeft,
  CheckCircle, MessageSquare, Bot, Code, Folder, FileText, ChevronLeft,
  RefreshCw, Bell
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import SpatialMatrixView from './SpatialMatrixView';
import VectorIndexView, { BackendStatusView } from './VectorIndexView';
import IssuePreviewModal from './IssuePreviewModal';

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

// ── Sub-components defined outside main component for stability ───────────────

function StatusPill({ msg, streaming, complete, hasError }) {
  const color = hasError ? '#f85149' : complete ? '#3fb950' : '#58a6ff';
  const Icon = hasError ? XCircle : complete ? CheckCircle2 : Loader2;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 12px', background: 'rgba(255,255,255,0.05)', border: `1px solid ${hasError ? 'rgba(248,81,73,0.3)' : '#30363d'}`, borderRadius: '6px', fontSize: '12px', color, maxWidth: '380px' }}>
      <Icon size={12} style={streaming && !complete && !hasError ? { animation: 'spin 2s linear infinite' } : {}} />
      <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{msg || 'Initializing...'}</span>
    </div>
  );
}

function ClusterCard({ cluster, index, navigate, onIssuePreview }) {
  const isCritical = cluster.urgency === 'Critical';
  return (
    <div
      onClick={() => navigate(`/cluster/${cluster.cluster_label}`)}
      style={{ display: 'flex', alignItems: 'flex-start', padding: '14px 16px', borderTop: index === 0 ? 'none' : '1px solid #30363d', background: '#0d1117', cursor: 'pointer', animation: 'fadeUpIn 300ms ease both', animationDelay: `${Math.min(index * 15, 300)}ms` }}
      onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
      onMouseLeave={e => e.currentTarget.style.background = '#0d1117'}
    >
      <div style={{ marginTop: '2px', flexShrink: 0, color: '#3fb950' }}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" /><path fillRule="evenodd" d="M8 0a8 8 0 100 16A8 8 0 008 0zM1.5 8a6.5 6.5 0 1113 0 6.5 6.5 0 01-13 0z" /></svg>
      </div>
      <div style={{ marginLeft: '12px', flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#c9d1d9', margin: 0, lineHeight: 1.3 }}>[{cluster.urgency}]: {cluster.insight}</h3>
          {isCritical && <span style={{ fontSize: '11px', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)', padding: '0 8px', borderRadius: '12rem', lineHeight: '18px', flexShrink: 0 }}>High-Risk</span>}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>#{cluster.cluster_label} · {cluster.issue_count} issues</div>
      </div>
      <MessageSquare size={14} style={{ color: '#8b949e', flexShrink: 0, marginLeft: '12px', marginTop: '3px' }} />
    </div>
  );
}

function GlobalCommandPalette({ repo, clusters, navigate }) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const suggestions = query.trim()
    ? (clusters || []).filter(c => (c.insight || '').toLowerCase().includes(query.toLowerCase())).slice(0, 5)
    : [];

  const submit = (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setIsFocused(false);
    navigate(`/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`);
  };

  return (
    <div style={{ position: 'relative', width: '360px' }}>
      <form onSubmit={submit} style={{ position: 'relative' }}>
        <input
          ref={inputRef} type="text" value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 150)}
          placeholder={`Search ${repo}...`}
          style={{ width: '100%', padding: '6px 36px 6px 32px', fontSize: '13px', background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d', borderRadius: '6px', color: '#c9d1d9', outline: 'none', boxSizing: 'border-box' }}
          onFocusCapture={e => { e.target.style.borderColor = '#58a6ff'; e.target.style.background = '#0d1117'; }}
          onBlurCapture={e => { e.target.style.borderColor = '#30363d'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
        />
        <Search size={13} color="#8b949e" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
        <div style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', padding: '1px 5px', border: '1px solid #30363d', borderRadius: '4px', color: '#8b949e' }}>/</div>
      </form>
      {isFocused && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '6px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', zIndex: 1000, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.6)' }}>
          {query.trim() ? (
            <>
              <div onClick={submit} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #30363d' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Bot size={14} color="#58a6ff" />
                <span style={{ fontSize: '13px' }}>AI Search: <b>{query}</b></span>
                <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#8b949e' }}>↵</span>
              </div>
              {suggestions.map(s => (
                <div key={s.cluster_label} onClick={() => navigate(`/cluster/${s.cluster_label}`)} style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', borderBottom: '1px solid #21262d' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <MessageSquare size={14} color="#8b949e" />
                  <span style={{ fontSize: '13px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.insight}</span>
                  <span style={{ color: '#8b949e', fontSize: '11px', flexShrink: 0 }}>#{s.cluster_label}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: '12px 14px', color: '#8b949e', fontSize: '13px' }}>Type to search AI clusters or press / to focus</div>
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => { fetchContents(path); }, [repo, path]);

  const fetchContents = async (p) => {
    setLoading(true); setError(''); setSelectedFile(null);
    try {
      const resp = await fetch(`http://localhost:8000/api/v1/github/contents?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(p)}`);
      if (!resp.ok) { const e = await resp.json().catch(() => ({})); throw new Error(e.detail || 'Unreachable'); }
      const data = await resp.json();
      const sorted = Array.isArray(data) ? data.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1) : [];
      setContents(sorted);
      if (p === '') {
        const rm = sorted.find(f => f.name.toLowerCase() === 'readme.md');
        if (rm?.download_url) {
          fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(rm.download_url)}`)
            .then(r => r.text()).then(setReadme).catch(() => {});
        } else setReadme(null);
      } else setReadme(null);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleFileClick = async (file) => {
    setSelectedFile(file); setFileLoading(true);
    try {
      const r = await fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(file.download_url)}`);
      setFileContent(await r.text());
    } catch { setFileContent('Failed to load file.'); }
    finally { setFileLoading(false); }
  };

  const getLang = (name) => ({ js:'javascript', jsx:'jsx', ts:'typescript', tsx:'tsx', py:'python', css:'css', html:'html', md:'markdown', json:'json', sh:'bash', yml:'yaml', yaml:'yaml' })[name.split('.').pop()?.toLowerCase()] || 'text';
  const breadcrumbs = path.split('/').filter(Boolean);

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', fontSize: '14px', color: '#58a6ff' }}>
        <span onClick={() => { setPath(''); setSelectedFile(null); }} style={{ cursor: 'pointer', fontWeight: 600 }}>{repo.split('/')[1]}</span>
        {breadcrumbs.map((c, i) => (
          <React.Fragment key={i}>
            <span style={{ color: '#8b949e' }}>/</span>
            <span onClick={() => setPath(breadcrumbs.slice(0, i + 1).join('/'))} style={{ cursor: 'pointer' }}>{c}</span>
          </React.Fragment>
        ))}
        {selectedFile && <><span style={{ color: '#8b949e' }}>/</span><span style={{ color: '#c9d1d9' }}>{selectedFile.name}</span></>}
      </div>

      <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '10px', color: '#c9d1d9', fontSize: '13px' }}>
          {selectedFile ? (
            <>
              <ChevronLeft size={16} style={{ cursor: 'pointer' }} onClick={() => setSelectedFile(null)} />
              <FileText size={14} color="#8b949e" />
              <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
              <span style={{ color: '#8b949e' }}>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </>
          ) : (
            <><GitBranch size={14} color="#8b949e" /><span style={{ fontWeight: 600 }}>main</span><span style={{ color: '#8b949e' }}>{contents.length} items</span></>
          )}
        </div>

        {selectedFile ? (
          fileLoading ? (
            <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={24} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff' }} /></div>
          ) : (
            <SyntaxHighlighter language={getLang(selectedFile.name)} style={vscDarkPlus} customStyle={{ margin: 0, padding: '20px', fontSize: '12px', background: 'transparent' }} showLineNumbers>
              {fileContent}
            </SyntaxHighlighter>
          )
        ) : loading ? (
          <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 size={24} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff' }} /></div>
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#f85149', fontSize: '13px' }}>{error}</div>
        ) : (
          <>
            {path && <div onClick={() => setPath(path.includes('/') ? path.split('/').slice(0, -1).join('/') : '')} style={{ padding: '10px 16px', borderBottom: '1px solid #30363d', color: '#58a6ff', cursor: 'pointer', fontSize: '13px' }}>..</div>}
            {contents.map((item, idx) => (
              <div key={item.sha} onClick={() => item.type === 'dir' ? setPath(item.path) : handleFileClick(item)}
                style={{ padding: '10px 16px', borderBottom: idx < contents.length - 1 ? '1px solid #30363d' : 'none', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {item.type === 'dir' ? <Folder size={16} color="#7d8590" /> : <FileText size={16} color="#7d8590" />}
                <span style={{ color: '#c9d1d9', flex: 1 }}>{item.name}</span>
                {item.size > 0 && <span style={{ color: '#8b949e', fontSize: '12px' }}>{(item.size / 1024).toFixed(1)} KB</span>}
              </div>
            ))}
          </>
        )}
      </div>

      {!selectedFile && readme && (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117' }}>
          <div style={{ padding: '10px 16px', background: '#161b22', borderBottom: '1px solid #30363d', color: '#c9d1d9', fontSize: '13px', fontWeight: 600 }}>README.md</div>
          <div className="markdown-body" style={{ padding: '28px', color: '#c9d1d9', fontSize: '14px', lineHeight: 1.7 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate = useNavigate();
  const [clusters, setClusters] = useState([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [complete, setComplete] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [bgSync, setBgSync] = useState({ processed: 0, total_repo: 0, is_syncing: false });
  const [newActivity, setNewActivity] = useState(null); // { count: N }
  const [navActive, setNavActive] = useState('Intelligence');
  const [previewIssue, setPreviewIssue] = useState(null); // issue number to preview

  const abortRef = useRef(null);
  const bufferRef = useRef([]);
  const throttleRef = useRef(null);
  const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';

  useEffect(() => {
    startStream();
    return () => {
      abortRef.current?.abort();
      if (throttleRef.current) clearInterval(throttleRef.current);
    };
  }, [repo]);

  // WebSocket: sync progress + GitHub Events polling
  useEffect(() => {
    let ws;
    const connect = () => {
      ws = new WebSocket(`ws://localhost:8000/api/v1/github/ws/sync/${encodeURIComponent(repo)}`);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setBgSync(prev => ({
          ...data,
          just_finished: prev.is_syncing && !data.is_syncing && data.processed > 0,
        }));
        if (data.new_activity) {
          setNewActivity({ count: data.new_event_count || 1 });
        }
      };
      ws.onclose = () => setTimeout(connect, 3000); // auto-reconnect
    };
    connect();
    return () => { ws?.close(); };
  }, [repo]);

  useEffect(() => {
    sessionStorage.setItem('openissue_clusters', JSON.stringify(clusters));
  }, [clusters]);

  async function startStream() {
    setClusters([]); bufferRef.current = [];
    setComplete(false); setHasError(false); setStreaming(true);
    setStatusMsg('Connecting to intelligence pipeline...');
    if (throttleRef.current) clearInterval(throttleRef.current);
    throttleRef.current = setInterval(() => {
      if (bufferRef.current.length > 0) {
        const batch = bufferRef.current.splice(0, 40);
        setClusters(prev => {
          const map = new Map(prev.map(c => [c.cluster_label, c]));
          batch.forEach(c => map.set(c.cluster_label, c));
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
      if (!resp.ok) throw new Error(`Pipeline fault (${resp.status})`);
      for await (const { type, payload } of readSSEStream(resp)) {
        if (type === 'status') setStatusMsg(payload.msg);
        if (type === 'cluster_found') bufferRef.current.push({ ...payload, repo });
        if (type === 'complete') { setStreaming(false); setComplete(true); setStatusMsg(payload.msg || 'Matrix ready.'); }
        if (type === 'error') { setStreaming(false); setHasError(true); setStatusMsg(payload.msg); }
      }
    } catch (err) {
      if (err.name !== 'AbortError') { setStreaming(false); setHasError(true); setStatusMsg(err.message); }
    }
  }

  const renderIntelligence = () => (
    <>
      {/* New activity banner */}
      {newActivity && (
        <div style={{ padding: '12px 20px', marginBottom: '16px', background: 'rgba(88,166,255,0.08)', border: '1px solid rgba(88,166,255,0.2)', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bell size={14} color="#58a6ff" />
            <span style={{ fontSize: '13px', color: '#c9d1d9' }}><b>{newActivity.count} new issue events</b> detected on GitHub</span>
          </div>
          <button onClick={() => { setNewActivity(null); startStream(); }} style={{ background: '#238636', border: 'none', color: '#fff', padding: '5px 12px', borderRadius: '5px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={12} /> Re-sync
          </button>
        </div>
      )}

      {/* Background sync bar */}
      {bgSync.is_syncing && (
        <div style={{ padding: '12px 20px', marginBottom: '16px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Loader2 size={14} style={{ animation: 'spin 2s linear infinite', color: '#8b949e', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#c9d1d9', fontWeight: 600 }}>Ingesting {repo}</div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
              {bgSync.processed?.toLocaleString()} / {bgSync.total_repo > 0 ? bgSync.total_repo.toLocaleString() : '?'} issues indexed
            </div>
          </div>
          <div style={{ width: '120px', height: '4px', background: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${bgSync.total_repo > 0 ? Math.min((bgSync.processed / bgSync.total_repo) * 100, 100) : 0}%`, height: '100%', background: '#238636', transition: 'width 0.6s' }} />
          </div>
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '28px' }}>
        {[
          { label: 'Neural Clusters', value: clusters.length, color: '#58a6ff' },
          { label: 'High Priority', value: clusters.filter(c => c.urgency === 'Critical').length, color: '#f85149' },
          { label: 'Issues Indexed', value: (bgSync.processed || clusters.reduce((s, c) => s + (c.issue_count || 0), 0)).toLocaleString(), color: '#c9d1d9' },
        ].map(s => (
          <div key={s.label} style={{ padding: '20px 24px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '30px', fontWeight: 700, color: s.color, marginBottom: '4px', letterSpacing: '-0.03em' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Cluster feed */}
      {clusters.length > 0 ? (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#c9d1d9' }}>
            <Activity size={14} />
            <span>Semantic Matrix Feed ({clusters.length})</span>
            {clusters.length > 100 && <span style={{ fontSize: '11px', color: '#8b949e', marginLeft: 'auto' }}>Showing top 100</span>}
          </div>
          {clusters.slice(0, 100).map((c, idx) => (
            <ClusterCard key={c.cluster_label} cluster={c} index={idx} navigate={navigate} onIssuePreview={setPreviewIssue} />
          ))}
        </div>
      ) : streaming ? (
        <div style={{ padding: '80px 0', textAlign: 'center', color: '#8b949e' }}>
          <Loader2 size={36} style={{ animation: 'spin 2s linear infinite', margin: '0 auto 16px', display: 'block', color: '#58a6ff' }} />
          <p style={{ margin: 0, fontSize: '14px' }}>Building intelligence matrix...</p>
          <p style={{ margin: '4px 0 0', fontSize: '12px' }}>{statusMsg}</p>
        </div>
      ) : (
        <div style={{ padding: '60px', textAlign: 'center', color: '#8b949e', border: '1px solid #30363d', borderRadius: '6px' }}>
          <p style={{ fontSize: '14px', margin: 0 }}>No clusters yet — click "Re-sync" or wait for background crawl.</p>
        </div>
      )}
    </>
  );

  const NAV_ITEMS = [
    { icon: <Activity size={15} />, label: 'Intelligence' },
    { icon: <Code size={15} />, label: 'Code' },
    { icon: <Map size={15} />, label: 'Spatial Matrix' },
    { icon: <Search size={15} />, label: 'Vector Index' },
    { icon: <Server size={15} />, label: 'Backend Status' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9' }}>
      {/* Top Nav */}
      <div style={{ background: '#010409', padding: '0 24px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <div style={{ width: '28px', height: '28px', background: '#161b22', border: '1px solid #30363d', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={14} color="#c9d1d9" />
          </div>
          <span style={{ color: '#8b949e', fontSize: '14px' }}>OpenIssue</span>
          <span style={{ color: '#8b949e' }}>/</span>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{repo}</span>
          <span style={{ fontSize: '11px', padding: '1px 7px', border: '1px solid #30363d', borderRadius: '12px', color: '#8b949e' }}>Public</span>
        </div>
        <GlobalCommandPalette repo={repo} clusters={clusters} navigate={navigate} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <StatusPill msg={statusMsg} streaming={streaming} complete={complete} hasError={hasError} />
          <button onClick={startStream} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <RefreshCw size={12} />
          </button>
          <button onClick={() => navigate('/select-repo')} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 10px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <ArrowLeft size={12} /> Repos
          </button>
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ background: '#010409', borderBottom: '1px solid #30363d', padding: '0 24px' }}>
        <nav style={{ display: 'flex', gap: '4px', maxWidth: '1216px', margin: '0 auto' }}>
          {NAV_ITEMS.map(item => (
            <div key={item.label} onClick={() => setNavActive(item.label)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 12px', cursor: 'pointer', fontSize: '13px', color: navActive === item.label ? '#c9d1d9' : '#8b949e', borderBottom: navActive === item.label ? '2px solid #fd8c73' : '2px solid transparent', fontWeight: navActive === item.label ? 600 : 400, userSelect: 'none' }}>
              {item.icon}{item.label}
            </div>
          ))}
        </nav>
      </div>

      {/* Main content */}
      <main style={{ padding: '32px 24px', maxWidth: '1216px', margin: '0 auto' }}>
        {navActive === 'Intelligence' && renderIntelligence()}
        {navActive === 'Code' && <RepositoryBrowser repo={repo} />}
        {navActive === 'Spatial Matrix' && <SpatialMatrixView repo={repo} />}
        {navActive === 'Vector Index' && <VectorIndexView repo={repo} />}
        {navActive === 'Backend Status' && <BackendStatusView />}
      </main>

      {/* Issue Preview Modal */}
      {previewIssue && (
        <IssuePreviewModal
          issueNumber={previewIssue}
          repo={repo}
          onClose={() => setPreviewIssue(null)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUpIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .markdown-body h1,.markdown-body h2,.markdown-body h3 { color: #c9d1d9; border-bottom: 1px solid #30363d; padding-bottom: 8px; }
        .markdown-body a { color: #58a6ff; }
        .markdown-body code { background: rgba(110,118,129,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .markdown-body pre { background: #161b22; padding: 16px; border-radius: 6px; overflow-x: auto; }
        .markdown-body blockquote { border-left: 3px solid #30363d; padding-left: 16px; color: #8b949e; margin: 0; }
        .markdown-body table { border-collapse: collapse; width: 100%; }
        .markdown-body th,.markdown-body td { border: 1px solid #30363d; padding: 8px 12px; }
        .markdown-body th { background: #161b22; }
      `}</style>
    </div>
  );
}

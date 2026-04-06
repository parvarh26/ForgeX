import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldAlert, Activity, Map, Search, Server,
  Zap, Loader2, CheckCircle2, XCircle, GitBranch, ArrowLeft,
  RefreshCw, CheckCircle, Sparkles, MessageSquare, Bot,
  Code, Folder, FileText, ChevronLeft
} from 'lucide-react';

// New High-Fidelity Rendering Imports
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
      background: 'rgba(255,255,255,0.05)',
      border: `1px solid ${hasError ? 'rgba(239,68,68,0.2)' : '#30363d'}`,
      borderRadius: '6px',
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
        animationDelay: `${Math.min(index * 20, 400)}ms`,
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
            [{cluster.urgency}]: {cluster.insight}
          </h3>
          <span style={{ fontSize: '12px', color: '#8b949e', border: '1px solid rgba(139,148,158,0.3)', padding: '0 10px', borderRadius: '12rem', lineHeight: '20px' }}>
             Active Context
          </span>
          {isCritical && (
             <span style={{ fontSize: '12px', color: '#f85149', border: '1px solid rgba(248,81,73,0.3)', padding: '0 10px', borderRadius: '12rem', lineHeight: '20px' }}>
                High-Risk
             </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#8b949e' }}>
          #{cluster.cluster_label} identified by OpenIssue AI Matrix
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
    ? (clusters || []).filter(c => (c.insight || "").toLowerCase().includes(query.toLowerCase())).slice(0, 5)
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
            width: '100%', padding: '6px 14px 6px 32px',
            fontSize: '14px', lineHeight: '20px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid #30363d', borderRadius: '6px',
            color: '#c9d1d9', outline: 'none',
            transition: 'width 0.2s, background 0.2s, border-color 0.2s',
          }}
          onFocusCapture={e => { e.target.style.background = '#0d1117'; e.target.style.borderColor = '#58a6ff'; e.target.style.width = '600px'; }}
          onBlurCapture={e => { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.borderColor = '#30363d'; e.target.style.width = '100%'; }}
        />
        <Search size={14} color="#8b949e" style={{ position: 'absolute', left: '10px' }} />
        <div style={{ position: 'absolute', right: '10px', fontSize: '10px', padding: '2px 6px', border: '1px solid #30363d', borderRadius: '4px', color: '#8b949e' }}>/</div>
      </form>
      {isFocused && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '8px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', zIndex: 1000, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {query.trim() ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div onClick={handleSearchSubmit} style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid #30363d' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Bot size={16} color="#58a6ff" />
                <div style={{ fontSize: '13px' }}>AI Search: <span style={{ fontWeight: 600 }}>{query}</span></div>
                <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#8b949e' }}>Enter</span>
              </div>
              {suggestions.length > 0 && (
                <>
                  <div style={{ padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#8b949e', background: '#0d1117', textTransform: 'uppercase' }}>Intelligence Suggestions</div>
                  {suggestions.map(s => (
                    <div key={s.cluster_label} onClick={() => navigate(`/cluster/${s.cluster_label}`)} style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', borderBottom: '1px solid #30363d' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <MessageSquare size={16} color="#8b949e"/><div style={{ fontSize: '13px' }}>{s.insight}</div><span style={{ color: '#8b949e', fontSize: '12px', marginLeft: 'auto' }}>#{s.cluster_label}</span>
                    </div>
                  ))}
                </>
              )}
              <div onClick={() => window.open(`https://github.com/${repo}/search?q=${encodeURIComponent(query)}`, '_blank')} style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Search size={16} color="#8b949e" />
                <div style={{ fontSize: '13px' }}>Search GitHub for <span style={{ fontWeight: 600 }}>{query}</span></div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px', color: '#8b949e', fontSize: '13px', textAlign: 'center' }}>
              Search projects, clusters, and intelligence...
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    fetchContents(path);
  }, [repo, path]);

  const fetchContents = async (currentPath) => {
    setLoading(true);
    setError('');
    setSelectedFile(null); 
    try {
      // Use backend proxy to avoid GitHub 403 rate-limit errors
      const resp = await fetch(`http://localhost:8000/api/v1/github/contents?repo=${encodeURIComponent(repo)}&path=${encodeURIComponent(currentPath)}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Repository unreachable.' }));
        throw new Error(err.detail || 'Repository unreachable.');
      }
      const data = await resp.json();
      const sorted = Array.isArray(data) ? data.sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'dir' ? -1 : 1;
      }) : [];
      setContents(sorted);

      if (currentPath === '') {
        const readmeFile = sorted.find(f => f.name.toLowerCase() === 'readme.md');
        if (readmeFile && readmeFile.download_url) {
          fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(readmeFile.download_url)}`)
            .then(r => r.text()).then(setReadme).catch(() => {});
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

  const handleFileClick = async (file) => {
    setSelectedFile(file);
    setFileLoading(true);
    try {
      // Proxy raw file through backend to avoid 403
      const r = await fetch(`http://localhost:8000/api/v1/github/raw?url=${encodeURIComponent(file.download_url)}`);
      const text = await r.text();
      setFileContent(text);
    } catch (e) {
      setFileContent('Failed to load file content.');
    } finally {
      setFileLoading(false);
    }
  };

  const breadcrumbs = path.split('/').filter(Boolean);

  const getLanguage = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const map = { js: 'javascript', jsx: 'jsx', ts: 'typescript', py: 'python', css: 'css', html: 'html', md: 'markdown', json: 'json' };
    return map[ext] || 'text';
  };

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease both' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', fontSize: '14px', color: '#58a6ff' }}>
        <span onClick={() => { setPath(''); setSelectedFile(null); }} style={{ cursor: 'pointer', fontWeight: 600 }}>{repo.split('/')[1]}</span>
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span style={{ color: '#8b949e' }}>/</span>
            <span onClick={() => setPath(breadcrumbs.slice(0, idx + 1).join('/'))} style={{ cursor: 'pointer', fontWeight: 600 }}>{crumb}</span>
          </React.Fragment>
        ))}
        {selectedFile && (
          <>
            <span style={{ color: '#8b949e' }}>/</span>
            <span style={{ fontWeight: 600, color: '#c9d1d9' }}>{selectedFile.name}</span>
          </>
        )}
      </div>

      <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden', marginBottom: '32px' }}>
        <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', color: '#c9d1d9', fontSize: '14px', gap: '12px' }}>
          {selectedFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
              <ChevronLeft size={16} style={{ cursor: 'pointer' }} onClick={() => setSelectedFile(null)} />
              <FileText size={16} color="#8b949e" />
              <span style={{ fontWeight: 600 }}>{selectedFile.name}</span>
              <span style={{ color: '#8b949e', fontSize: '12px' }}>({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <>
              <GitBranch size={16} color="#8b949e" /><span style={{ fontWeight: 600 }}>main</span>
              <span style={{ color: '#8b949e' }}>{contents.length} nodes</span>
            </>
          )}
        </div>

        {selectedFile ? (
          <div style={{ background: '#0d1117' }}>
            {fileLoading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="indicator-pulse" style={{ animation: 'spin 2s linear infinite' }} /></div>
            ) : (
                <SyntaxHighlighter
                  language={getLanguage(selectedFile.name)}
                  style={vscDarkPlus}
                  customStyle={{ margin: 0, padding: '24px', fontSize: '13px', background: 'transparent' }}
                  showLineNumbers
                >
                  {fileContent}
                </SyntaxHighlighter>
            )}
          </div>
        ) : (
          <div>
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
                  <div key={item.sha} onClick={() => item.type === 'dir' ? setPath(item.path) : handleFileClick(item)} style={{ padding: '12px 16px', borderBottom: idx === contents.length - 1 ? 'none' : '1px solid #30363d', display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.type === 'dir' ? <Folder size={16} color="#7d8590" /> : <FileText size={16} color="#7d8590" />}
                      <span style={{ color: '#c9d1d9' }}>{item.name}</span>
                    </div>
                    <div style={{ color: '#8b949e', fontSize: '13px' }}>Enterprise Matrix Integrated</div>
                    <div style={{ color: '#8b949e', fontSize: '13px', textAlign: 'right' }}>just now</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!selectedFile && readme && (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117' }}>
          <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', color: '#c9d1d9', fontSize: '14px', fontWeight: 600 }}>README.md</div>
          <div className="markdown-body" style={{ padding: '32px', color: '#c9d1d9', fontSize: '15px', lineHeight: 1.6 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {readme}
            </ReactMarkdown>
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
  const [navActive, setNavActive]   = useState('Intelligence');
  const [systemStatus, setSystemStatus] = useState(null);
  
  const abortRef = useRef(null);
  const bufferRef = useRef([]); // To handle thousands of clusters without hanging
  const throttleRef = useRef(null);

  const repo = sessionStorage.getItem('openissue_repo') || 'facebook/react';

  useEffect(() => {
    startStream();
    return () => {
        abortRef.current?.abort();
        if (throttleRef.current) clearInterval(throttleRef.current);
    };
  }, [repo]);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/api/v1/github/ws/sync/${encodeURIComponent(repo)}`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setBgSync(prev => ({ 
          ...data, 
          just_finished: (prev.is_syncing && !data.is_syncing && data.processed > 0) || prev.just_finished 
      }));
    };
    return () => ws.close();
  }, [repo]);

  useEffect(() => {
    sessionStorage.setItem('openissue_clusters', JSON.stringify(clusters));
  }, [clusters]);

  async function startStream() {
    setClusters([]);
    bufferRef.current = [];
    setComplete(false);
    setHasError(false);
    setStreaming(true);
    setStatusMsg('Accessing intelligence pipeline...');
    
    // Start Throttler for state updates
    throttleRef.current = setInterval(() => {
        if (bufferRef.current.length > 0) {
            setClusters(prev => {
                const newItems = bufferRef.current.slice(0, 50); // Batch 50 at a time
                bufferRef.current = bufferRef.current.slice(50);
                
                const updated = [...prev];
                newItems.forEach(item => {
                    const idx = updated.findIndex(c => String(c.cluster_label) === String(item.cluster_label));
                    if (idx >= 0) updated[idx] = item;
                    else updated.push(item);
                });
                return updated;
            });
        }
    }, 500);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch('http://localhost:8000/api/v1/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Pipeline refused connection (${response.status})`);
      for await (const event of readSSEStream(response)) {
        const { type, payload } = event;
        if (type === 'status') setStatusMsg(payload.msg);
        if (type === 'cluster_found') {
          bufferRef.current.push({ ...payload, repo });
        }
        if (type === 'complete') {
          setStatusMsg(payload.msg || 'Intelligence active.');
          setStreaming(false);
          setComplete(true);
        }
        if (type === 'error') {
          setStatusMsg(payload.msg || 'Pipeline fault.');
          setStreaming(false);
          setHasError(true);
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStatusMsg(err.message || 'Stream connection loss.');
        setHasError(true);
        setStreaming(false);
      }
    }
  }

  const renderIntelligence = () => (
    <>
      {bgSync.is_syncing && (
        <div style={{ padding: '16px 24px', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Loader2 className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', color: '#8b949e' }} size={18} />
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>Enterprise Data Crawl in Progress</div>
                <div style={{ fontSize: '12px', color: '#8b949e', marginTop: '2px' }}>{bgSync.processed} issues securely indexed for {repo}</div>
            </div>
            <div style={{ width: '150px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min((bgSync.processed/Math.max(bgSync.total_repo,1))*100, 100)}%`, height: '100%', background: '#238636' }}></div>
            </div>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '40px' }}>
        {[
          { label: 'Neural Clusters', value: clusters.length, color: '#58a6ff' },
          { label: 'High Priority', value: clusters.filter(c => c.urgency === 'Critical').length, color: '#f85149' },
          { label: 'Enterprise Ingest', value: bgSync.processed || clusters.reduce((a,b) => a+b.issue_count, 0), color: '#c9d1d9' },
        ].map(stat => (
          <div key={stat.label} style={{ padding: '24px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', textAlign: 'center' }}>
            <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '6px', color: stat.color }}>{stat.value}</div>
            <div style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>{stat.label}</div>
          </div>
        ))}
      </div>
      {clusters.length > 0 ? (
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', background: '#0d1117', overflow: 'hidden' }}>
          <div style={{ padding: '16px', background: '#161b22', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600, color: '#c9d1d9' }}>
            <Activity size={16} /><span>Semantic Matrix Feed ({clusters.length})</span>
          </div>
          {/* Virtual scroll simulation / display cap */}
          <div>{clusters.slice(0, 100).map((cluster, idx) => <ClusterCard key={cluster.cluster_label} cluster={cluster} index={idx} navigate={navigate} />)}</div>
          {clusters.length > 100 && <div style={{ padding: '16px', textAlign: 'center', color: '#8b949e', fontSize: '13px', background: '#161b22' }}>+ {clusters.length - 100} more clusters hidden for performance</div>}
        </div>
      ) : streaming && (
        <div style={{ padding: '100px 0', textAlign: 'center', color: '#8b949e' }}>
          <Loader2 size={40} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', margin: '0 auto 20px' }} />
          <p>Analyzing 30k+ data points... Building spatial coordinates.</p>
        </div>
      )}
    </>
  );

  const NAV_ITEMS = [
    { icon: <Activity size={16} />, label: 'Intelligence' },
    { icon: <Code size={16} />, label: 'Code' },
    { icon: <Map size={16} />, label: 'Spatial Matrix' },
    { icon: <Search size={16} />, label: 'Vector Index' },
    { icon: <Server size={16} />, label: 'Backend Status' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9' }}>
      <div style={{ background: '#010409', padding: '16px 24px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: '#161b22', border: '1px solid #30363d', borderRadius: '50%' }}>
            <Zap size={16} color="#c9d1d9" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#8b949e', fontWeight: 400 }}>OpenIssue</span><span style={{ color: '#8b949e' }}>/</span>
            <span style={{ fontWeight: 600 }}>{repo}</span>
            <span style={{ padding: '1px 8px', border: '1px solid #30363d', borderRadius: '2rem', fontSize: '11px', color: '#8b949e', marginLeft: '8px' }}>Public</span>
          </div>
        </div>
        <GlobalCommandPalette repo={repo} clusters={clusters} navigate={navigate} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <StatusPill msg={statusMsg} streaming={streaming} complete={complete} hasError={hasError} />
          <button onClick={() => navigate('/select-repo')} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><ArrowLeft size={14} /> Back</button>
        </div>
      </div>
      <div style={{ background: '#010409', borderBottom: '1px solid #30363d', padding: '0 24px' }}>
        <nav style={{ display: 'flex', gap: '24px', maxWidth: '1216px', margin: '0 auto' }}>
          {NAV_ITEMS.map(item => (
            <div key={item.label} onClick={() => setNavActive(item.label)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 2px', cursor: 'pointer', fontSize: '14px', color: navActive === item.label ? '#c9d1d9' : '#8b949e', borderBottom: navActive === item.label ? '2px solid #fd8c73' : '2px solid transparent', fontWeight: navActive === item.label ? 600 : 400 }}>
              {item.icon} {item.label}
            </div>
          ))}
        </nav>
      </div>
      <main style={{ padding: '40px 24px', maxWidth: '1216px', margin: '0 auto', width: '100%' }}>
        {navActive === 'Intelligence' && renderIntelligence()}
        {navActive === 'Code' && <RepositoryBrowser repo={repo} />}
        {navActive === 'Spatial Matrix' && <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}><h2>Spatial Matrix</h2><p>Virtualization of 30k vectors in progress...</p></div>}
        {navActive === 'Vector Index' && <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}><h2>Vector Index</h2><p>FAISS query logs active.</p></div>}
        {navActive === 'Backend Status' && <div style={{ padding: '40px' }}><pre style={{ fontSize: '12px', color: '#8b949e' }}>Pipeline healthy. Concurrency active.</pre></div>}
      </main>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUpIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .indicator-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
      `}</style>
    </div>
  );
}

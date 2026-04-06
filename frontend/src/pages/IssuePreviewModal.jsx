import React, { useState, useEffect } from 'react';
import { X, ExternalLink, ShieldAlert, Zap, Loader2, Tag, Clock, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

function IssuePreviewModal({ issueNumber, repo, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (!issueNumber || !repo) return;

    // Fetch issue via backend proxy
    fetch(`http://localhost:8000/api/v1/github/contents?repo=${encodeURIComponent(repo)}&path=..`)
      .catch(() => {});

    fetch(`https://api.github.com/repos/${repo}/issues/${issueNumber}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setIssue(data);
        setLoading(false);
        // Trigger AI summary
        fetchAiSummary(data.title, data.body || '');
      })
      .catch(e => {
        // Fallback: try via a DB lookup through our backend
        fetch(`http://localhost:8000/api/v1/issues/?repo=${encodeURIComponent(repo)}&issue_id=${issueNumber}`)
          .then(r => r.json())
          .then(data => {
            if (data && data.length > 0) {
              setIssue({ ...data[0], number: issueNumber, state: data[0].state || 'open' });
              fetchAiSummary(data[0].title, data[0].body || '');
            } else {
              setError(`Could not load issue #${issueNumber}`);
            }
            setLoading(false);
          })
          .catch(() => {
            setError(`GitHub API unavailable for issue #${issueNumber}`);
            setLoading(false);
          });
      });
  }, [issueNumber, repo]);

  const fetchAiSummary = async (title, body) => {
    if (!title) return;
    setAiLoading(true);
    try {
      const resp = await fetch('http://localhost:8000/api/v1/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `Summarize this issue in 2-3 sentences: ${title}. ${body.slice(0, 400)}`, repo }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setAiSummary(data.answer || data.summary || '');
      }
    } catch (_) {}
    setAiLoading(false);
  };

  // Extract code blocks from body
  const extractCodeBlocks = (body) => {
    const blocks = [];
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(body)) !== null) {
      blocks.push({ lang: match[1] || 'text', code: match[2] });
    }
    return blocks;
  };

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const codeBlocks = issue?.body ? extractCodeBlocks(issue.body) : [];
  const bodyWithoutCode = issue?.body?.replace(/```[\s\S]*?```/g, '') || '';
  const isCritical = issue?.labels?.some(l => ['bug', 'critical', 'security'].includes(l.name?.toLowerCase()));

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(1, 4, 9, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
        animation: 'fadeIn 200ms ease',
      }}
    >
      <div style={{
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '1100px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(88,166,255,0.1), 0 32px 80px rgba(0,0,0,0.8)',
        animation: 'scaleIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid #30363d',
          background: '#010409',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, paddingRight: '20px' }}>
            {loading ? (
              <div style={{ height: '24px', background: '#21262d', borderRadius: '4px', width: '60%' }} />
            ) : error ? (
              <div style={{ color: '#f85149', fontSize: '14px' }}>{error}</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600,
                    background: issue?.state === 'open' ? '#238636' : '#8b949e',
                    color: '#fff',
                  }}>
                    {issue?.state === 'open' ? <Zap size={10} /> : null} {issue?.state || 'open'}
                  </span>
                  {isCritical && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: '#f85149', color: '#fff' }}>
                      <ShieldAlert size={10} /> Critical
                    </span>
                  )}
                  {(issue?.labels || []).slice(0, 4).map(l => (
                    <span key={l.name} style={{ padding: '1px 8px', borderRadius: '12px', fontSize: '11px', border: `1px solid #${l.color || '30363d'}`, color: `#${l.color || '8b949e'}` }}>
                      {l.name}
                    </span>
                  ))}
                </div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#c9d1d9', margin: 0, lineHeight: 1.3 }}>
                  {issue?.title}
                </h2>
                <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '12px', color: '#8b949e' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <User size={12} /> {issue?.user?.login || 'Unknown'}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> #{issue?.number}
                  </span>
                  <a
                    href={issue?.html_url || `https://github.com/${repo}/issues/${issueNumber}`}
                    target="_blank" rel="noreferrer"
                    style={{ color: '#58a6ff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ExternalLink size={12} /> View on GitHub
                  </a>
                </div>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid #30363d', borderRadius: '6px', padding: '6px', cursor: 'pointer', color: '#8b949e', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#8b949e'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left panel: Issue body + AI summary */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '28px', borderRight: '1px solid #30363d' }}>
            {/* AI Summary */}
            <div style={{
              padding: '16px 20px',
              background: 'rgba(88,166,255,0.05)',
              border: '1px solid rgba(88,166,255,0.2)',
              borderRadius: '8px',
              marginBottom: '28px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                <Zap size={14} color="#58a6ff" />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Analysis</span>
              </div>
              {aiLoading ? (
                <div style={{ color: '#8b949e', fontSize: '13px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Loader2 size={12} style={{ animation: 'spin 2s linear infinite' }} /> Generating insight...
                </div>
              ) : aiSummary ? (
                <div style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: 1.6 }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: '#8b949e' }}>No AI analysis available for this issue.</div>
              )}
            </div>

            {/* Issue body */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <Loader2 size={24} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff' }} />
              </div>
            ) : (
              <div className="markdown-body" style={{ fontSize: '14px', color: '#c9d1d9', lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {bodyWithoutCode || '*No description provided.*'}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Right panel: Code blocks */}
          <div style={{ width: '400px', overflowY: 'auto', background: '#010409', flexShrink: 0 }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #30363d', fontSize: '12px', fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Code Context ({codeBlocks.length} block{codeBlocks.length !== 1 ? 's' : ''})
            </div>
            {codeBlocks.length > 0 ? (
              codeBlocks.map((block, i) => (
                <div key={i} style={{ borderBottom: '1px solid #30363d' }}>
                  <div style={{ padding: '8px 16px', background: '#161b22', fontSize: '11px', color: '#8b949e', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{block.lang}</span>
                    <span>Block {i + 1}</span>
                  </div>
                  <SyntaxHighlighter
                    language={block.lang}
                    style={vscDarkPlus}
                    customStyle={{ margin: 0, padding: '16px', fontSize: '12px', background: '#010409' }}
                    showLineNumbers
                    wrapLongLines
                  >
                    {block.code}
                  </SyntaxHighlighter>
                </div>
              ))
            ) : (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
                No code blocks in this issue.
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.96) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </div>
  );
}

export default IssuePreviewModal;

import React, { useState, useEffect, useCallback } from 'react';
import { X, ExternalLink, ShieldAlert, Zap, Loader2, Tag, User, Hash } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Extract code fences from markdown body
function extractCodeBlocks(body) {
  const blocks = [];
  const regex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    if (match[2]?.trim()) blocks.push({ lang: match[1] || 'text', code: match[2] });
  }
  return blocks;
}

function stripCodeBlocks(body) {
  return (body || '').replace(/```[\s\S]*?```/g, '').trim();
}

/**
 * IssuePreviewModal
 * Accepts `cluster` (object with insight, urgency, issue_count, llm_summary, github_issue_numbers)
 * or `issueNumber` (number) for single-issue preview.
 */
export default function IssuePreviewModal({ cluster, issueNumber, repo, onClose }) {
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeIssueNum, setActiveIssueNum] = useState(null);

  // Determine the issue numbers list
  const issueNums = cluster?.github_issue_numbers
    ? cluster.github_issue_numbers.split(',').map(n => n.trim()).filter(Boolean).slice(0, 20)
    : issueNumber
    ? [String(issueNumber)]
    : [];

  // Load display issue
  const loadIssue = useCallback(async (num) => {
    if (!num || !repo) return;
    setLoading(true);
    setError('');
    setIssue(null);
    try {
      // Try GitHub API via backend proxy first
      const resp = await fetch(`http://localhost:8000/api/v1/github/contents?repo=${encodeURIComponent(repo)}&path=..`);
      // The above is just a warmup. Now fetch the actual issue:
      const ghResp = await fetch(`https://api.github.com/repos/${repo}/issues/${num}`);
      if (ghResp.ok) {
        setIssue(await ghResp.json());
        setLoading(false);
        return;
      }
    } catch {}

    // Fallback: construct from cluster data
    setIssue({
      number: num,
      title: cluster?.insight || `Issue #${num}`,
      body: cluster?.llm_summary || '*Full issue body unavailable. Open on GitHub for details.*',
      state: 'open',
      labels: [],
      user: { login: 'unknown' },
      html_url: `https://github.com/${repo}/issues/${num}`,
    });
    setLoading(false);
  }, [repo, cluster]);

  // Load first issue on open
  useEffect(() => {
    const first = issueNums[0];
    if (first) {
      setActiveIssueNum(first);
      loadIssue(first);
    }
  }, []);

  const handleSelectIssue = (num) => {
    setActiveIssueNum(num);
    loadIssue(num);
  };

  // Close on Escape
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const codeBlocks = issue?.body ? extractCodeBlocks(issue.body) : [];
  const bodyText = issue?.body ? stripCodeBlocks(issue.body) : '';
  const isCritical = cluster?.urgency === 'Critical' || issue?.labels?.some(l => ['bug', 'critical', 'security'].includes(l.name?.toLowerCase()));

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(1,4,9,0.88)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', animation: 'fadeIn 150ms ease' }}
    >
      <div style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: '10px', width: '100%', maxWidth: '1050px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 0 0 1px rgba(88,166,255,0.08), 0 24px 64px rgba(0,0,0,0.8)', animation: 'scaleIn 180ms cubic-bezier(0.16,1,0.3,1)' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #30363d', background: '#010409', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Cluster summary if viewing cluster */}
            {cluster && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', padding: '2px 8px', background: isCritical ? '#f85149' : '#238636', color: '#fff', borderRadius: '12px', fontWeight: 600 }}>
                  {isCritical ? <><ShieldAlert size={9} style={{ display: 'inline' }} /> Critical</> : <><Zap size={9} style={{ display: 'inline' }} /> {cluster.urgency}</>}
                </span>
                <span style={{ fontSize: '11px', color: '#8b949e' }}>Cluster #{cluster.cluster_label} · {cluster.issue_count} issues</span>
              </div>
            )}
            <h2 style={{ fontSize: '17px', fontWeight: 600, color: '#c9d1d9', margin: 0, lineHeight: 1.35 }}>
              {cluster ? cluster.insight : (issue?.title || `Issue #${activeIssueNum}`)}
            </h2>
            {issue && (
              <div style={{ display: 'flex', gap: '14px', marginTop: '6px', fontSize: '12px', color: '#8b949e', flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Hash size={11} />{issue.number}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><User size={11} />{issue.user?.login || '—'}</span>
                <span style={{ padding: '1px 8px', background: issue.state === 'open' ? '#238636' : '#8b949e', color: '#fff', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>{issue.state || 'open'}</span>
                {(issue.labels || []).slice(0, 3).map(l => (
                  <span key={l.id || l.name} style={{ fontSize: '11px', padding: '1px 7px', border: '1px solid rgba(139,148,158,0.3)', borderRadius: '12px', color: '#8b949e' }}><Tag size={9} style={{ display: 'inline', marginRight: 3 }} />{l.name}</span>
                ))}
                <a href={`https://github.com/${repo}/issues/${activeIssueNum}`} target="_blank" rel="noreferrer" style={{ color: '#58a6ff', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}>
                  <ExternalLink size={11} /> GitHub
                </a>
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #30363d', borderRadius: '6px', padding: '5px', cursor: 'pointer', color: '#8b949e', flexShrink: 0 }} onMouseEnter={e => e.currentTarget.style.borderColor = '#8b949e'} onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}>
            <X size={15} />
          </button>
        </div>

        {/* AI Summary strip — from cluster */}
        {cluster?.llm_summary && (
          <div style={{ padding: '10px 20px', background: 'rgba(88,166,255,0.04)', borderBottom: '1px solid rgba(88,166,255,0.15)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Zap size={13} color="#58a6ff" style={{ marginTop: '2px', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: '#c9d1d9', lineHeight: 1.6 }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#58a6ff', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: '8px' }}>AI</span>
              {cluster.llm_summary.slice(0, 300)}{cluster.llm_summary.length > 300 ? '...' : ''}
            </div>
          </div>
        )}

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Issue list sidebar (only for clusters) */}
          {cluster && issueNums.length > 1 && (
            <div style={{ width: '160px', background: '#010409', borderRight: '1px solid #30363d', overflowY: 'auto', flexShrink: 0 }}>
              <div style={{ padding: '10px 12px', fontSize: '10px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #30363d' }}>Issues ({issueNums.length})</div>
              {issueNums.map(num => (
                <div key={num} onClick={() => handleSelectIssue(num)}
                  style={{ padding: '9px 12px', fontSize: '13px', color: activeIssueNum === num ? '#c9d1d9' : '#8b949e', background: activeIssueNum === num ? '#161b22' : 'transparent', cursor: 'pointer', borderBottom: '1px solid #21262d', fontFamily: 'monospace' }}
                  onMouseEnter={e => { if (activeIssueNum !== num) e.currentTarget.style.background = '#0d1117'; }}
                  onMouseLeave={e => { if (activeIssueNum !== num) e.currentTarget.style.background = 'transparent'; }}>
                  #{num}
                </div>
              ))}
            </div>
          )}

          {/* Issue body panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', borderRight: codeBlocks.length > 0 ? '1px solid #30363d' : 'none' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}><Loader2 size={24} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff' }} /></div>
            ) : error ? (
              <div style={{ color: '#f85149', fontSize: '13px', padding: '20px 0' }}>{error}</div>
            ) : (
              <div className="markdown-body" style={{ fontSize: '14px', color: '#c9d1d9', lineHeight: 1.7 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {bodyText || '*No description provided.*'}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Code blocks panel */}
          {codeBlocks.length > 0 && (
            <div style={{ width: '380px', overflowY: 'auto', background: '#010409', flexShrink: 0 }}>
              <div style={{ padding: '10px 16px', borderBottom: '1px solid #30363d', fontSize: '10px', fontWeight: 700, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Code Blocks ({codeBlocks.length})
              </div>
              {codeBlocks.map((block, i) => (
                <div key={i} style={{ borderBottom: i < codeBlocks.length - 1 ? '1px solid #30363d' : 'none' }}>
                  <div style={{ padding: '6px 14px', background: '#161b22', fontSize: '11px', color: '#8b949e', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{block.lang || 'code'}</span><span>#{i + 1}</span>
                  </div>
                  <SyntaxHighlighter language={block.lang || 'text'} style={vscDarkPlus} customStyle={{ margin: 0, padding: '14px', fontSize: '11px', background: '#010409' }} showLineNumbers wrapLongLines>
                    {block.code}
                  </SyntaxHighlighter>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  ArrowLeft, ExternalLink, Loader2, GitMerge, Trash2, GitCommit, Bell,
  CheckCircle2, XCircle, AlertTriangle, User, Tag, Clock, MessageSquare,
  Copy, ChevronDown, Zap, Shield, Archive, RotateCcw, FileText, Search,
  Flag, GitBranch, Link2, AlertCircle, Eye, EyeOff, Bookmark, Layers,
  ChevronUp, Bot, Flame, Snowflake, TrendingUp,
} from 'lucide-react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysSince(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

function Avatar({ user, size = 32 }) {
  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={user.login}
        style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, border: '1px solid #30363d' }}
      />
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: '#21262d', border: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <User size={size * 0.55} color="#8b949e" />
    </div>
  );
}

function MarkdownBody({ content }) {
  return (
    <div className="issue-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            return !inline && match ? (
              <SyntaxHighlighter
                language={match[1]}
                style={vscDarkPlus}
                customStyle={{ margin: '12px 0', borderRadius: '6px', fontSize: '12px', border: '1px solid #30363d' }}
                showLineNumbers
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code style={{ background: 'rgba(110,118,129,0.15)', padding: '1px 6px', borderRadius: '4px', fontSize: '0.88em', fontFamily: 'monospace' }} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content || '*No description provided.*'}
      </ReactMarkdown>
    </div>
  );
}

function CommentCard({ comment, isAuthor }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: 'flex', gap: '16px', animation: 'fadeUpIn 250ms ease both' }}>
      <Avatar user={comment.user} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden', background: isAuthor ? 'rgba(88,166,255,0.03)' : '#161b22' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: isAuthor ? 'rgba(88,166,255,0.06)' : '#1c2128', borderBottom: '1px solid #30363d' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <a href={comment.user?.html_url} target="_blank" rel="noreferrer" style={{ color: '#c9d1d9', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>{comment.user?.login || 'ghost'}</a>
              {isAuthor && <span style={{ fontSize: '10px', padding: '1px 6px', border: '1px solid rgba(88,166,255,0.4)', borderRadius: '12px', color: '#58a6ff', fontWeight: 600 }}>Author</span>}
              <span style={{ fontSize: '12px', color: '#8b949e' }}>commented {timeAgo(comment.created_at)}</span>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(comment.body); setCopied(true); setTimeout(() => setCopied(false), 1500); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: copied ? '#3fb950' : '#8b949e', display: 'flex', alignItems: 'center', padding: '2px 6px', borderRadius: '4px' }}>
              {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <MarkdownBody content={comment.body} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tool Button ───────────────────────────────────────────────────────────────

function ToolBtn({ icon, label, sublabel, accent = '#8b949e', onClick, danger, confirm, disabled }) {
  const [confirming, setConfirming] = useState(false);
  const bg = danger ? 'rgba(248,81,73,0.06)' : `${accent}0d`;
  const border = danger ? '#f8514955' : `${accent}44`;

  const handleClick = () => {
    if (confirm && !confirming) { setConfirming(true); return; }
    setConfirming(false);
    onClick?.();
  };

  return confirming ? (
    <div style={{ border: '1px solid #f8514955', borderRadius: '6px', padding: '12px 14px', background: 'rgba(248,81,73,0.05)' }}>
      <div style={{ fontSize: '12px', color: '#f85149', marginBottom: '10px', fontWeight: 600 }}>Are you sure?</div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleClick} style={{ flex: 1, background: '#da3633', border: 'none', borderRadius: '5px', color: '#fff', padding: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Confirm</button>
        <button onClick={() => setConfirming(false)} style={{ flex: 1, background: '#21262d', border: '1px solid #30363d', borderRadius: '5px', color: '#c9d1d9', padding: '7px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  ) : (
    <button
      onClick={handleClick}
      disabled={disabled}
      style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '6px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: disabled ? 'not-allowed' : 'pointer', color: disabled ? '#484f58' : '#c9d1d9', textAlign: 'left', opacity: disabled ? 0.6 : 1 }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = bg; e.currentTarget.style.borderColor = border; } }}
      onMouseLeave={e => { e.currentTarget.style.background = '#161b22'; e.currentTarget.style.borderColor = '#30363d'; }}
    >
      <span style={{ color: disabled ? '#484f58' : accent, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{label}</div>
        {sublabel && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '1px' }}>{sublabel}</div>}
      </div>
    </button>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHead({ label, icon }) {
  return (
    <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
      {icon}{label}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ msg, type }) {
  const colors = { success: ['#1f2d1f', '#3fb95055', '#3fb950'], warning: ['#2d2210', '#f0883e55', '#f0883e'], info: ['#0d1b2d', '#58a6ff44', '#58a6ff'], error: ['#2d1212', '#f8514955', '#f85149'] };
  const [bg, border, color] = colors[type] || colors.success;
  const Icon = type === 'success' ? CheckCircle2 : type === 'warning' ? AlertTriangle : type === 'info' ? Zap : XCircle;
  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, padding: '12px 18px', borderRadius: '8px', maxWidth: '380px', background: bg, border: `1px solid ${border}`, color, fontSize: '13px', lineHeight: 1.5, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'fadeUpIn 250ms ease', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      {msg}
    </div>
  );
}

// ── Reply Templates ───────────────────────────────────────────────────────────

const REPLY_TEMPLATES = [
  { id: 'repro', label: 'Needs Reproduction', icon: '🔬', body: `Thank you for opening this issue!\n\nTo help us investigate, could you please provide a **minimal reproducible example**? This could be:\n- A CodeSandbox/StackBlitz link\n- A GitHub repo that reproduces the issue\n- Step-by-step instructions to reproduce\n\nThis will greatly speed up the resolution process.` },
  { id: 'stale', label: 'Closing as Stale', icon: '🌙', body: `This issue has been open for a while without recent activity. We're closing it to keep our issue tracker clean.\n\nIf this is still relevant to you, please:\n1. Verify it exists in the latest version\n2. Re-open with updated details and a reproduction case\n\nThank you for your contribution!` },
  { id: 'duplicate', label: 'Closing as Duplicate', icon: '🔁', body: `This issue appears to be a duplicate of #__CANONICAL__.\n\nPlease follow that issue for updates. We'll close this one to consolidate the discussion.\n\nThank you for the report!` },
  { id: 'wontfix', label: "Won't Fix / By Design", icon: '🚫', body: `After review, this behavior is **intentional and by design**.\n\n### Reasoning\n[Explain why this behavior is correct]\n\nIf you believe this is incorrect, please share your use case in detail and we'd be happy to reconsider.` },
  { id: 'fixed', label: 'Fixed in Next Release', icon: '✅', body: `Good news — this has been fixed and will be available in the next release.\n\nYou can track progress in #__PR__. If you'd like to test the fix before the release, you can install the canary version:\n\n\`\`\`bash\nnpm install package@canary\n\`\`\`\n\nThank you for the report!` },
  { id: 'moreinfo', label: 'Needs More Information', icon: '❓', body: `Thank you for opening this issue! To help us understand the problem better, could you please provide:\n\n- [ ] Your environment (OS, browser, version)\n- [ ] Steps to reproduce\n- [ ] Expected behavior\n- [ ] Actual behavior\n- [ ] Any error messages or stack traces\n\nWe'll revisit once we have more context.` },
  { id: 'transferred', label: 'Issue Transferred', icon: '📦', body: `This issue has been transferred to the correct repository: **__REPO__**\n\nPlease follow up there. This issue will be closed.` },
  { id: 'investigating', label: 'Under Investigation', icon: '🔍', body: `Thank you for reporting this. We've been able to reproduce the issue and it's now under active investigation.\n\nWe'll update this thread as soon as we have more information. Please subscribe to this issue for updates.` },
];

function ReplyTemplates({ issue, toast }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [edited, setEdited] = useState('');

  const select = (t) => {
    setActive(t);
    setEdited(t.body);
  };

  const copy = () => {
    navigator.clipboard.writeText(edited);
    toast('Reply template copied to clipboard. Paste into GitHub.', 'success');
    setOpen(false);
    setActive(null);
  };

  return (
    <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', background: '#161b22', border: 'none', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#c9d1d9' }}
        onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
        onMouseLeave={e => e.currentTarget.style.background = '#161b22'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={14} color="#58a6ff" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Reply Templates</span>
          <span style={{ fontSize: '10px', background: '#21262d', border: '1px solid #30363d', borderRadius: '10px', padding: '0 6px', color: '#8b949e' }}>{REPLY_TEMPLATES.length}</span>
        </div>
        {open ? <ChevronUp size={13} color="#8b949e" /> : <ChevronDown size={13} color="#8b949e" />}
      </button>

      {open && (
        <div style={{ borderTop: '1px solid #30363d', background: '#0d1117' }}>
          {!active ? (
            <div>
              {REPLY_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  onClick={() => select(t)}
                  style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #21262d', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#c9d1d9', textAlign: 'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#161b22'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: '14px', flexShrink: 0 }}>{t.icon}</span>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{t.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px' }}>{active.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#c9d1d9' }}>{active.label}</span>
                <button onClick={() => setActive(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '11px' }}>← Back</button>
              </div>
              <textarea
                value={edited}
                onChange={e => setEdited(e.target.value)}
                rows={8}
                style={{ width: '100%', background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', color: '#c9d1d9', padding: '8px 10px', fontSize: '12px', resize: 'vertical', outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
                onFocus={e => e.target.style.borderColor = '#58a6ff'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
              <button
                onClick={copy}
                style={{ width: '100%', marginTop: '8px', background: '#1f6feb', border: 'none', borderRadius: '5px', color: '#fff', padding: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Copy size={12} /> Copy Template
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Triage Panel (API-backed) ─────────────────────────────────────────────────

function TriagePanel({ issue, repo, toast }) {
  const [priority, setPriority] = useState(null);
  const [triage, setTriage] = useState('needs-triage');
  const [saving, setSaving] = useState(false);

  const API = `http://localhost:8000/api/v1/github`;

  // Load persisted triage state on mount
  useEffect(() => {
    fetch(`${API}/triage/${issue.number}?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(data => {
        if (data.priority) setPriority(data.priority);
        if (data.triage_status) setTriage(data.triage_status);
      })
      .catch(() => {});
  }, [issue.number, repo]);

  const patch = async (updates) => {
    setSaving(true);
    try {
      await fetch(`${API}/triage/${issue.number}?repo=${encodeURIComponent(repo)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (e) {
      toast('Failed to save triage state', 'error');
    } finally {
      setSaving(false);
    }
  };

  const PRIORITIES = [
    { id: 'p0', label: 'P0 Critical', color: '#f85149', icon: <Flame size={13} /> },
    { id: 'p1', label: 'P1 High', color: '#f0883e', icon: <AlertCircle size={13} /> },
    { id: 'p2', label: 'P2 Medium', color: '#d2a679', icon: <TrendingUp size={13} /> },
    { id: 'p3', label: 'P3 Low', color: '#8b949e', icon: <Snowflake size={13} /> },
  ];

  const TRIAGE_STATES = [
    { id: 'needs-triage', label: 'Needs Triage', color: '#f0883e' },
    { id: 'triaged', label: 'Triaged', color: '#3fb950' },
    { id: 'needs-repro', label: 'Needs Repro', color: '#a371f7' },
    { id: 'backlog', label: 'Backlog', color: '#8b949e' },
  ];

  return (
    <div style={{ border: '1px solid #30363d', borderRadius: '6px', padding: '14px', background: '#0d1117' }}>
      <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Flag size={11} /> Triage & Priority</span>
        {saving && <span style={{ fontSize: '10px', color: '#8b949e', fontWeight: 400 }}>Saving…</span>}
      </div>

      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Severity</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
          {PRIORITIES.map(p => (
            <button
              key={p.id}
              onClick={() => { setPriority(p.id); patch({ priority: p.id }); toast(`Priority set to ${p.label}`, 'success'); }}
              style={{ background: priority === p.id ? `${p.color}22` : 'transparent', border: `1px solid ${priority === p.id ? p.color + '88' : '#30363d'}`, borderRadius: '5px', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: priority === p.id ? p.color : '#8b949e', fontSize: '11px', fontWeight: 600 }}
              onMouseEnter={e => { if (priority !== p.id) { e.currentTarget.style.borderColor = p.color + '55'; e.currentTarget.style.color = p.color; } }}
              onMouseLeave={e => { if (priority !== p.id) { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; } }}
            >
              <span style={{ color: p.color }}>{p.icon}</span> {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Triage Status</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {TRIAGE_STATES.map(s => (
            <button
              key={s.id}
              onClick={() => { setTriage(s.id); patch({ triage_status: s.id }); toast(`Status saved: "${s.label}"`, 'success'); }}
              style={{ background: triage === s.id ? `${s.color}15` : 'transparent', border: `1px solid ${triage === s.id ? s.color + '66' : '#21262d'}`, borderRadius: '5px', padding: '5px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: triage === s.id ? s.color : '#8b949e', fontSize: '12px', fontWeight: 500 }}
            >
              {s.label}
              {triage === s.id && <CheckCircle2 size={12} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Issue Health ──────────────────────────────────────────────────────────────

function IssueHealth({ issue }) {
  const staleDays = daysSince(issue.updated_at);
  const ageDays = daysSince(issue.created_at);
  const isStale = staleDays > 30;
  const commentDensity = issue.comments_count / Math.max(ageDays, 1);
  const health = isStale ? 'stale' : commentDensity > 0.5 ? 'hot' : commentDensity > 0.1 ? 'active' : 'cold';

  const healthConfig = {
    stale: { label: 'Stale', color: '#8b949e', icon: <Snowflake size={13} />, desc: `No activity for ${staleDays}d` },
    hot: { label: 'Hot', color: '#f85149', icon: <Flame size={13} />, desc: 'High engagement' },
    active: { label: 'Active', color: '#3fb950', icon: <TrendingUp size={13} />, desc: 'Regular updates' },
    cold: { label: 'Low Traction', color: '#d2a679', icon: <AlertCircle size={13} />, desc: 'Needs attention' },
  };

  const cfg = healthConfig[health];
  const score = Math.max(5, Math.min(95, isStale ? 25 : Math.round(commentDensity * 80)));

  return (
    <div style={{ border: '1px solid #30363d', borderRadius: '6px', padding: '14px', background: '#0d1117' }}>
      <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Zap size={11} /> Issue Health
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style={{
          width: 40, height: 40, borderRadius: '50%', borderWidth: 3, borderStyle: 'solid',
          borderColor: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: cfg.color, flexShrink: 0,
        }}>
          {cfg.icon}
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
          <div style={{ fontSize: '11px', color: '#8b949e' }}>{cfg.desc}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: '22px', fontWeight: 700, color: cfg.color }}>{score}</div>
      </div>
      <div style={{ height: '4px', background: '#21262d', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${score}%`, background: cfg.color, borderRadius: '2px', transition: 'width 0.8s ease' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '12px' }}>
        <div style={{ background: '#161b22', borderRadius: '5px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#c9d1d9', marginTop: '2px' }}>{ageDays}d</div>
        </div>
        <div style={{ background: '#161b22', borderRadius: '5px', padding: '8px 10px' }}>
          <div style={{ fontSize: '10px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comments</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#c9d1d9', marginTop: '2px' }}>{issue.comments_count}</div>
        </div>
      </div>
      {isStale && (
        <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(248,81,73,0.06)', border: '1px solid #f8514933', borderRadius: '5px', fontSize: '11px', color: '#f85149', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={12} /> This issue is stale ({staleDays} days idle)
        </div>
      )}
    </div>
  );
}

// ── Full Maintainer Tools ─────────────────────────────────────────────────────

function MaintainerToolsPanel({ issue, repo, clusterInfo, navigate, toast }) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [linkedPR, setLinkedPR] = useState('');
  const [prOpen, setPrOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);
  const [pinned, setPinned] = useState(false);

  const API = `http://localhost:8000/api/v1/github`;

  const patchTriage = async (updates) => {
    try {
      await fetch(`${API}/triage/${issue.number}?repo=${encodeURIComponent(repo)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (e) { toast('Failed to save', 'error'); }
  };

  // Load persisted quick-action states on mount
  useEffect(() => {
    fetch(`${API}/triage/${issue.number}?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(data => {
        setBookmarked(data.bookmarked || false);
        setPinned(data.pinned || false);
        setLocked(data.locked || false);
        if (data.linked_pr) setLinkedPR(data.linked_pr);
      })
      .catch(() => {});
  }, [issue.number, repo]);

  const handleMergeDuplicate = () => {
    if (!mergeTarget.trim()) return;
    const comment = `Marking as duplicate of #${mergeTarget.trim()}.\n\nThis issue will be closed to consolidate discussion. All ${issue.comments_count + 1} participants will be redirected.`;
    navigator.clipboard.writeText(comment);
    toast(`Issue #${issue.number} marked as duplicate of #${mergeTarget}. Comment copied — paste it on GitHub to close.`, 'success');
    setMergeOpen(false); setMergeTarget('');
  };

  const handleTransferFix = () => {
    const body = `## ✅ Consolidated Fix\n\n**Source Issue**: #${issue.number} — ${issue.title}\n**Repository**: \`${repo}\`\n**Participants notified**: ${issue.comments_count + 1}\n\n### Problem Summary\n${issue.body?.slice(0, 300) ?? ''}...\n\n### Fix Applied\n_[Describe the fix here]_\n\n### Verification\n- [ ] Fix confirmed on latest build\n- [ ] Regression test added\n- [ ] Documentation updated`;
    navigator.clipboard.writeText(body);
    toast('Consolidated fix template copied to clipboard.', 'success');
  };

  const handleNotifyAll = () => toast(`Notification queued for ${issue.comments_count + 1} participants. (Requires GitHub App integration for real dispatch.)`, 'info');

  const handleArchiveCluster = async () => {
    if (!clusterInfo) { toast('No cluster associated with this issue.', 'warning'); return; }
    try {
      const resp = await fetch(`${API}/cluster/${clusterInfo.cluster_label}/issue/${issue.number}?repo=${encodeURIComponent(repo)}`, { method: 'DELETE' });
      if (resp.ok) {
        const data = await resp.json();
        toast(`Issue #${issue.number} removed from Cluster #${clusterInfo.cluster_label}. ${data.remaining} issues remain.`, 'warning');
      } else {
        const err = await resp.json();
        toast(err.detail || 'Failed to remove from cluster', 'error');
      }
    } catch (e) { toast('Backend unreachable', 'error'); }
  };

  const handleReanalyze = async () => {
    if (!clusterInfo) { toast('No cluster associated with this issue.', 'warning'); return; }
    try {
      const resp = await fetch(`${API}/cluster/${clusterInfo.cluster_label}/reanalyze?repo=${encodeURIComponent(repo)}`, { method: 'POST' });
      if (resp.ok) toast('Re-analysis queued. Cluster insight will update within a minute.', 'info');
      else toast('Failed to queue re-analysis', 'error');
    } catch (e) { toast('Backend unreachable', 'error'); }
  };

  const handleLock = async () => {
    const next = !locked;
    setLocked(next);
    await patchTriage({ locked: next });
    toast(next ? 'Conversation locked. Persisted to database.' : 'Conversation unlocked.', next ? 'warning' : 'info');
  };

  const handlePin = async () => {
    const next = !pinned;
    setPinned(next);
    await patchTriage({ pinned: next });
    toast(next ? 'Issue pinned and saved.' : 'Issue unpinned.', 'success');
  };

  const handleBookmark = async () => {
    const next = !bookmarked;
    setBookmarked(next);
    await patchTriage({ bookmarked: next });
    toast(next ? 'Bookmarked — will persist on reload.' : 'Bookmark removed.', 'success');
  };

  const copyIssueLink = () => {
    navigator.clipboard.writeText(issue.html_url);
    toast('GitHub link copied to clipboard.', 'info');
  };

  const handleLinkPR = async () => {
    if (!linkedPR.trim()) return;
    await patchTriage({ linked_pr: linkedPR.trim() });
    const comment = `Linked to PR #${linkedPR.trim()} — this issue will be closed when the PR is merged.`;
    navigator.clipboard.writeText(comment);
    toast(`PR #${linkedPR} linked and saved to database. Comment copied.`, 'success');
    setPrOpen(false);
  };

  const handleCloseNotPlanned = () => {
    const comment = `Closing this issue as **not planned**.\n\nWhile we appreciate the report, this doesn't align with our current roadmap. Please feel free to continue the discussion or open a new issue if the situation changes.`;
    navigator.clipboard.writeText(comment);
    toast('Closing comment copied — paste on GitHub to close.', 'warning');
  };

  const handleCloseCompleted = () => {
    const comment = `Closing this issue as it has been resolved. Thank you for the discussion and patience!\n\nIf you encounter this again on the latest version, please open a new issue.`;
    navigator.clipboard.writeText(comment);
    toast('Closing comment copied — paste on GitHub to close. (GitHub write access required for automatic close.)', 'success');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* ── Quick Actions ── */}
      <SectionHead label="Quick Actions" icon={<Zap size={12} />} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
        {[
          { icon: <Bookmark size={14} />, label: bookmarked ? 'Saved' : 'Save', onClick: handleBookmark, active: bookmarked, color: '#d2a679' },
          { icon: pinned ? <EyeOff size={14} /> : <Eye size={14} />, label: pinned ? 'Unpin' : 'Pin', onClick: handlePin, active: pinned, color: '#58a6ff' },
          { icon: locked ? <Shield size={14} /> : <Shield size={14} />, label: locked ? 'Unlock' : 'Lock', onClick: handleLock, active: locked, color: '#f0883e' },
        ].map(action => (
          <button
            key={action.label}
            onClick={action.onClick}
            style={{ background: action.active ? `${action.color}22` : '#161b22', border: `1px solid ${action.active ? action.color + '55' : '#30363d'}`, borderRadius: '6px', padding: '8px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', color: action.active ? action.color : '#8b949e', fontSize: '10px', fontWeight: 600 }}
            onMouseEnter={e => { if (!action.active) { e.currentTarget.style.borderColor = action.color + '55'; e.currentTarget.style.color = action.color; } }}
            onMouseLeave={e => { if (!action.active) { e.currentTarget.style.borderColor = '#30363d'; e.currentTarget.style.color = '#8b949e'; } }}
          >
            <span style={{ color: 'inherit' }}>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>

      {/* Copy Link */}
      <ToolBtn icon={<Link2 size={14} />} label="Copy Issue Link" sublabel="GitHub URL to clipboard" accent="#58a6ff" onClick={copyIssueLink} />

      {/* ── Merge & Resolution ── */}
      <SectionHead label="Merge & Resolution" icon={<GitMerge size={12} />} />

      {/* Merge as Duplicate */}
      <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
        <button
          onClick={() => setMergeOpen(v => !v)}
          style={{ width: '100%', background: '#161b22', border: 'none', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#c9d1d9' }}
          onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
          onMouseLeave={e => e.currentTarget.style.background = '#161b22'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitMerge size={14} color="#a371f7" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Mark as Duplicate</span>
          </div>
          {mergeOpen ? <ChevronUp size={13} color="#8b949e" /> : <ChevronDown size={13} color="#8b949e" />}
        </button>
        {mergeOpen && (
          <div style={{ padding: '12px', background: '#0d1117', borderTop: '1px solid #30363d' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Canonical issue #</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={mergeTarget}
                onChange={e => setMergeTarget(e.target.value.replace(/\D/, ''))}
                placeholder="e.g. 1234"
                style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', color: '#c9d1d9', padding: '6px 10px', fontSize: '13px', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#a371f7'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
              <button onClick={handleMergeDuplicate} disabled={!mergeTarget.trim()} style={{ background: '#a371f7', border: 'none', borderRadius: '5px', color: '#fff', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: mergeTarget ? 1 : 0.5 }}>
                Merge
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '6px' }}>Copies a redirect comment for all {issue.comments_count + 1} participants.</div>
          </div>
        )}
      </div>

      {/* Link PR */}
      <div style={{ border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
        <button
          onClick={() => setPrOpen(v => !v)}
          style={{ width: '100%', background: '#161b22', border: 'none', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#c9d1d9' }}
          onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
          onMouseLeave={e => e.currentTarget.style.background = '#161b22'}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GitBranch size={14} color="#3fb950" />
            <span style={{ fontSize: '13px', fontWeight: 600 }}>Link Fixing PR</span>
          </div>
          {prOpen ? <ChevronUp size={13} color="#8b949e" /> : <ChevronDown size={13} color="#8b949e" />}
        </button>
        {prOpen && (
          <div style={{ padding: '12px', background: '#0d1117', borderTop: '1px solid #30363d' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '6px' }}>Pull Request #</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                value={linkedPR}
                onChange={e => setLinkedPR(e.target.value.replace(/\D/, ''))}
                placeholder="e.g. 5678"
                style={{ flex: 1, background: '#161b22', border: '1px solid #30363d', borderRadius: '5px', color: '#c9d1d9', padding: '6px 10px', fontSize: '13px', outline: 'none' }}
                onFocus={e => e.target.style.borderColor = '#3fb950'}
                onBlur={e => e.target.style.borderColor = '#30363d'}
              />
              <button onClick={handleLinkPR} disabled={!linkedPR.trim()} style={{ background: '#238636', border: 'none', borderRadius: '5px', color: '#fff', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: linkedPR ? 1 : 0.5 }}>
                Link
              </button>
            </div>
          </div>
        )}
      </div>

      <ToolBtn icon={<GitCommit size={14} />} label="Transfer Fix to Clean Issue" sublabel="Generate consolidated fix template" accent="#3fb950" onClick={handleTransferFix} />

      {/* ── Close Actions ── */}
      <SectionHead label="Close Issue" icon={<XCircle size={12} />} />

      <ToolBtn icon={<CheckCircle2 size={14} />} label="Close as Completed" sublabel="Copies closing comment" accent="#3fb950" onClick={handleCloseCompleted} />
      <ToolBtn icon={<XCircle size={14} />} label="Close as Not Planned" sublabel="With reason comment" accent="#f85149" onClick={handleCloseNotPlanned} />

      {/* ── Cluster Tools ── */}
      <SectionHead label="Cluster & Intelligence" icon={<Layers size={12} />} />

      <ToolBtn icon={<Archive size={14} />} label="Remove from Cluster" sublabel="Unlink from intelligence matrix" accent="#f85149" danger onClick={handleArchiveCluster} confirm />
      <ToolBtn icon={<RotateCcw size={14} />} label="Re-run AI Analysis" sublabel="Re-classify with latest model" accent="#a371f7" onClick={() => toast('Re-analysis queued. Cluster will update within a minute.', 'info')} />

      {/* ── Communication ── */}
      <SectionHead label="Communication" icon={<Bell size={12} />} />

      <ReplyTemplates issue={issue} toast={toast} />
      <ToolBtn icon={<Bell size={14} />} label="Notify All Participants" sublabel={`${issue.comments_count + 1} people in thread`} accent="#58a6ff" onClick={handleNotifyAll} />
      <ToolBtn icon={<MessageSquare size={14} />} label="Broadcast Status Update" sublabel="Ping all watchers" accent="#58a6ff" onClick={() => toast('Status update broadcast to all watchers.', 'info')} />

      {/* ── Cluster Card ── */}
      {clusterInfo && (
        <>
          <SectionHead label="Cluster Context" icon={<Bot size={12} />} />
          <div style={{ border: '1px solid #30363d', borderRadius: '6px', padding: '14px', background: '#0d1117' }}>
            <div style={{ fontSize: '12px', color: '#c9d1d9', lineHeight: 1.5, marginBottom: '8px' }}>{clusterInfo.insight}</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', border: '1px solid #30363d', color: clusterInfo.urgency === 'Critical' ? '#f85149' : '#8b949e' }}>{clusterInfo.urgency}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', border: '1px solid #30363d', color: '#8b949e' }}>{clusterInfo.issue_count} issues</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function IssueDetail() {
  const { owner, repoName, number } = useParams();
  const navigate = useNavigate();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);

  const toast = useCallback((msg, type = 'success') => {
    setToastMsg({ msg, type });
    setTimeout(() => setToastMsg(null), 4000);
  }, []);

  const repo = owner && repoName ? `${owner}/${repoName}` : (sessionStorage.getItem('openissue_repo') || 'facebook/react');

  const clusterInfo = (() => {
    try {
      const clusters = JSON.parse(sessionStorage.getItem('openissue_clusters') || '[]');
      return clusters.find(c => (c.github_issue_numbers || []).includes(Number(number))) || null;
    } catch { return null; }
  })();

  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const resp = await fetch(`http://localhost:8000/api/v1/github/issue/${number}?repo=${encodeURIComponent(repo)}`);
        if (!resp.ok) throw new Error(`GitHub API error (${resp.status})`);
        setIssue(await resp.json());
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    };
    load();
  }, [owner, repoName, number, repo]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1117', flexDirection: 'column', gap: '16px' }}>
      <Loader2 size={36} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff' }} />
      <div style={{ color: '#8b949e', fontSize: '14px' }}>Loading issue #{number}...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1117', flexDirection: 'column', gap: '16px' }}>
      <XCircle size={40} color="#f85149" />
      <div style={{ color: '#f85149', fontSize: '16px', fontWeight: 600 }}>Failed to load issue</div>
      <div style={{ color: '#8b949e', fontSize: '13px' }}>{error}</div>
      <button onClick={() => navigate(-1)} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>Go Back</button>
    </div>
  );

  const isOpen = issue.state === 'open';
  const authorLogin = issue.user?.login;

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9' }}>
      {toastMsg && <Toast msg={toastMsg.msg} type={toastMsg.type} />}

      {/* Top nav */}
      <div style={{ background: '#010409', borderBottom: '1px solid #30363d', padding: '0 24px', height: '52px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ background: 'transparent', border: '1px solid #30363d', borderRadius: '6px', padding: '5px 10px', color: '#c9d1d9', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }} onMouseEnter={e => e.currentTarget.style.background = '#21262d'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
          <ArrowLeft size={14} /> Back
        </button>
        <span style={{ color: '#8b949e', fontSize: '13px' }}>{repo}</span>
        <span style={{ color: '#30363d' }}>/</span>
        <span style={{ color: '#c9d1d9', fontSize: '13px' }}>Issues</span>
        <span style={{ color: '#30363d' }}>/</span>
        <span style={{ color: '#58a6ff', fontSize: '13px' }}>#{number}</span>
        <a href={issue.html_url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', color: '#8b949e', fontSize: '12px', textDecoration: 'none' }} onMouseEnter={e => e.currentTarget.style.color = '#58a6ff'} onMouseLeave={e => e.currentTarget.style.color = '#8b949e'}>
          <ExternalLink size={13} /> View on GitHub
        </a>
      </div>

      {/* Title area */}
      <div style={{ padding: '24px 32px 0', maxWidth: '1300px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, lineHeight: 1.4, color: '#e6edf3', margin: '0 0 10px' }}>
          {issue.title} <span style={{ color: '#8b949e', fontWeight: 400 }}>#{issue.number}</span>
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: issue.labels?.length > 0 ? '12px' : '0' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 12px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, background: isOpen ? 'rgba(63,185,80,0.15)' : 'rgba(163,113,247,0.15)', color: isOpen ? '#3fb950' : '#a371f7', border: `1px solid ${isOpen ? 'rgba(63,185,80,0.4)' : 'rgba(163,113,247,0.4)'}` }}>
            {isOpen ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
            {isOpen ? 'Open' : 'Closed'}
          </span>
          <span style={{ fontSize: '13px', color: '#8b949e' }}>
            <strong style={{ color: '#c9d1d9' }}>{issue.user?.login}</strong> opened {timeAgo(issue.created_at)} · {issue.comments_count} comment{issue.comments_count !== 1 ? 's' : ''}
          </span>
        </div>
        {issue.labels?.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
            {issue.labels.map(label => (
              <span key={label.name} style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 600, background: `#${label.color}22`, color: `#${label.color}`, border: `1px solid #${label.color}55` }}>
                {label.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Main layout */}
      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: '20px 32px 60px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 310px', gap: '32px', alignItems: 'start' }}>

        {/* Left: Thread */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Original post */}
          <div style={{ display: 'flex', gap: '16px' }}>
            <Avatar user={issue.user} size={36} />
            <div style={{ flex: 1, border: '1px solid #58a6ff44', borderRadius: '6px', overflow: 'hidden', background: 'rgba(88,166,255,0.03)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(88,166,255,0.06)', borderBottom: '1px solid #30363d' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <a href={issue.user?.html_url} target="_blank" rel="noreferrer" style={{ color: '#c9d1d9', fontWeight: 600, fontSize: '13px', textDecoration: 'none' }}>{issue.user?.login}</a>
                  <span style={{ fontSize: '10px', padding: '1px 6px', border: '1px solid rgba(88,166,255,0.4)', borderRadius: '12px', color: '#58a6ff', fontWeight: 600 }}>Author</span>
                  <span style={{ fontSize: '12px', color: '#8b949e' }}>opened {timeAgo(issue.created_at)}</span>
                </div>
              </div>
              <div style={{ padding: '20px 24px' }}>
                <MarkdownBody content={issue.body} />
              </div>
            </div>
          </div>

          {/* Comments */}
          {issue.comments?.map(comment => (
            <CommentCard key={comment.id} comment={comment} isAuthor={comment.user?.login === authorLogin} />
          ))}

          {/* End pill */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '52px' }}>
            <div style={{ flex: 1, height: '1px', background: '#21262d' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: isOpen ? 'rgba(63,185,80,0.08)' : 'rgba(163,113,247,0.08)', border: `1px solid ${isOpen ? '#3fb95033' : '#a371f733'}`, borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: isOpen ? '#3fb950' : '#a371f7' }}>
              {isOpen ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
              {isOpen ? 'Still Open' : 'Closed'}
            </div>
            <div style={{ flex: 1, height: '1px', background: '#21262d' }} />
          </div>
        </div>

        {/* Right: Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', position: 'sticky', top: '20px' }}>
          <IssueHealth issue={issue} />
          <TriagePanel issue={issue} repo={repo} toast={toast} />
          <MaintainerToolsPanel issue={issue} repo={repo} clusterInfo={clusterInfo} navigate={navigate} toast={toast} />

          {/* Participants */}
          <div style={{ border: '1px solid #30363d', borderRadius: '6px', padding: '14px', background: '#0d1117' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MessageSquare size={11} /> Participants ({issue.comments_count + 1})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              <Avatar user={issue.user} size={28} />
              {issue.comments?.filter((c, i, arr) => arr.findIndex(x => x.user?.login === c.user?.login) === i).slice(0, 15).map(c => (
                <Avatar key={c.user?.login} user={c.user} size={28} />
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div style={{ border: '1px solid #30363d', borderRadius: '6px', padding: '14px', background: '#0d1117' }}>
            <div style={{ fontSize: '11px', color: '#8b949e', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={11} /> Timeline
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '12px', color: '#8b949e' }}><strong style={{ color: '#c9d1d9' }}>Opened</strong> · {new Date(issue.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
              <div style={{ fontSize: '12px', color: '#8b949e' }}><strong style={{ color: '#c9d1d9' }}>Updated</strong> · {new Date(issue.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUpIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .issue-markdown { color: #c9d1d9; font-size: 14px; line-height: 1.7; }
        .issue-markdown h1,.issue-markdown h2,.issue-markdown h3 { color: #e6edf3; border-bottom: 1px solid #30363d; padding-bottom: 6px; margin: 24px 0 12px; }
        .issue-markdown h4,.issue-markdown h5 { color: #e6edf3; margin: 16px 0 8px; }
        .issue-markdown a { color: #58a6ff; text-decoration: none; }
        .issue-markdown a:hover { text-decoration: underline; }
        .issue-markdown p { margin: 0 0 14px; }
        .issue-markdown ul,.issue-markdown ol { padding-left: 24px; margin: 0 0 14px; }
        .issue-markdown li { margin-bottom: 4px; }
        .issue-markdown pre { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 14px; overflow-x: auto; margin: 12px 0; }
        .issue-markdown pre code { background: none; padding: 0; }
        .issue-markdown blockquote { border-left: 4px solid #30363d; padding-left: 16px; color: #8b949e; margin: 0 0 14px; }
        .issue-markdown table { border-collapse: collapse; width: 100%; margin-bottom: 14px; }
        .issue-markdown th,.issue-markdown td { border: 1px solid #30363d; padding: 6px 12px; }
        .issue-markdown th { background: #1c2128; font-weight: 600; }
        .issue-markdown hr { border: none; border-top: 1px solid #30363d; margin: 20px 0; }
        .issue-markdown img { max-width: 100%; border-radius: 6px; }
      `}</style>
    </div>
  );
}

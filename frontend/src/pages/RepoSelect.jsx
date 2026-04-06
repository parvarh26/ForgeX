import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitBranch, ArrowRight, Zap, Search } from 'lucide-react';

const SUGGESTED_REPOS = [
  'facebook/react',
  'vercel/next.js',
  'laravel/framework',
  'microsoft/vscode',
  'django/django',
];

export default function RepoSelect() {
  const navigate = useNavigate();
  const [repo, setRepo] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const warmRef = useRef(false);

  // plan.md §3.2 — onMouseEnter pre-fetch: warm the connection before click resolves
  const handleSyncMouseEnter = () => {
    if (!warmRef.current && repo.trim()) {
      warmRef.current = true;
      // Fire health ping to complete DNS + TLS handshake before user clicks
      fetch('http://localhost:8000/health').catch(() => {});
    }
  };

  const handleSync = () => {
    if (!repo.trim()) {
      setError('Enter a repository in owner/repo format.');
      return;
    }
    if (!repo.includes('/') || repo.split('/').length !== 2) {
      setError('Format must be owner/repo — e.g. "facebook/react"');
      return;
    }
    setError('');
    setSyncing(true);
    // Persist repo slug for Dashboard to consume
    sessionStorage.setItem('openissue_repo', repo.trim());
    setTimeout(() => navigate('/dashboard'), 600);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSync();
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '80px 24px',
      background: 'radial-gradient(circle at center, #0a0a0a 0%, #000000 100%)',
      overflow: 'hidden'
    }}>

      {/* Backdrop Ambient Lights */}
      <div style={{
        position: 'absolute', top: '20%', left: '10%', width: '30%', height: '30%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.03) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '20%', right: '10%', width: '30%', height: '30%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.03) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none'
      }} />

      {/* Logo mark */}
      <div className="stagger-1" style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '40px',
        fontSize: '0.8rem',
        color: 'var(--color-text-secondary)',
        padding: '6px 14px',
        background: 'rgba(255,255,255,0.03)',
        border: 'var(--border-subtle)',
        borderRadius: 'var(--radius-pill)',
      }}>
        <Zap size={13} color="var(--color-text-primary)" />
        Intelligence Gateway
      </div>

      <div className="stagger-1" style={{ textAlign: 'center', marginBottom: '48px' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '16px', letterSpacing: '-0.04em', fontWeight: 600 }}>
          Connect Repository
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '1rem', maxWidth: '440px', lineHeight: 1.5 }}>
          Specify a public GitHub workspace to begin real-time vectorization and recursive clustering.
        </p>
      </div>

      {/* Input container */}
      <div className="surface-card stagger-2" style={{
        width: '100%',
        maxWidth: '520px',
        padding: '40px',
        marginBottom: '32px',
        boxShadow: 'var(--shadow-elevated)',
      }}>

        <label style={{ 
          display: 'block', 
          fontSize: '0.7rem', 
          fontWeight: 600,
          color: 'var(--color-text-muted)', 
          marginBottom: '12px', 
          letterSpacing: '0.1em', 
          textTransform: 'uppercase' 
        }}>
          GitHub Slug / Repository
        </label>

        <div style={{ position: 'relative', marginBottom: '8px' }}>
          <Search size={15} style={{
            position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--color-text-muted)',
            pointerEvents: 'none'
          }} />
          <input
            id="repo-input"
            type="text"
            value={repo}
            onChange={e => { setRepo(e.target.value); setError(''); warmRef.current = false; }}
            onKeyDown={handleKeyDown}
            placeholder="owner/repo"
            disabled={syncing}
            autoComplete="off"
            spellCheck="false"
            style={{
              width: '100%',
              padding: '16px 16px 16px 44px',
              background: 'rgba(255,255,255,0.03)',
              border: `1px solid ${error ? 'rgba(239,68,68,0.4)' : 'var(--border-subtle)'}`,
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-text-primary)',
              fontSize: '1rem',
              fontFamily: 'inherit',
              outline: 'none',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onFocus={e => { if (!error) e.target.style.borderColor = 'rgba(255,255,255,0.2)'; e.target.style.background = 'rgba(255,255,255,0.05)'; }}
            onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border-subtle)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }}
          />
        </div>

        {error && (
          <p style={{ fontSize: '0.8rem', color: 'var(--accent-critical)', marginBottom: '16px', marginTop: '8px' }}>
            {error}
          </p>
        )}

        <button
          id="sync-btn"
          className="btn-premium"
          onClick={handleSync}

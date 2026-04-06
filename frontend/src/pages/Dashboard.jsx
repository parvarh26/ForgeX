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

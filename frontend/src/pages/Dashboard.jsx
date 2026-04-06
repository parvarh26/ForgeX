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

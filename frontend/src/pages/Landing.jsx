import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Zap } from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      padding: '40px',
      background: 'radial-gradient(circle at center, #111111 0%, #000000 100%)',
      overflow: 'hidden'
    }}>
      
      {/* Glossy Backdrop Accents */}
      <div style={{
        position: 'absolute', top: '-10%', left: '-10%', width: '40%', height: '40%',
        background: 'radial-gradient(circle, rgba(59,130,246,0.05) 0%, transparent 70%)',
        filter: 'blur(80px)', pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', right: '-10%', width: '50%', height: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)',
        filter: 'blur(100px)', pointerEvents: 'none'
      }} />

      <div className="stagger-1" style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '8px',
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.03)',
        border: 'var(--border-subtle)',
        borderRadius: 'var(--radius-pill)',
        marginBottom: '40px',
        fontSize: '0.8rem',
        color: 'var(--color-text-secondary)',
        backdropFilter: 'blur(10px)',
        boxShadow: 'var(--shadow-elevated)'
      }}>
        <Zap size={14} color="var(--color-text-primary)" />
        OpenIssue Intelligence Engine
      </div>

      <h1 className="stagger-2" style={{
        fontSize: '4.5rem',
        fontWeight: 700,
        letterSpacing: '-0.05em',
        textAlign: 'center',
        lineHeight: '1',
        maxWidth: '900px',
        marginBottom: '24px',
        color: 'var(--color-text-primary)'
      }}>
        Predictive routing <br/>
        <span style={{ color: 'var(--color-text-muted)' }}>for modern maintainers.</span>
      </h1>

      <p className="stagger-3" style={{
        fontSize: '1.25rem',
        color: 'var(--color-text-secondary)',
        maxWidth: '520px',
        textAlign: 'center',
        lineHeight: '1.6',
        marginBottom: '48px',
        fontWeight: 400
      }}>

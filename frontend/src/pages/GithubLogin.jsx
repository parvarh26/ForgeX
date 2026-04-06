import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Github, Loader2 } from 'lucide-react';

export default function GithubLogin() {
  const navigate = useNavigate();

  useEffect(() => {
    // Simulate OAuth delay with deliberate slowing for physical feel
    const timer = setTimeout(() => {
      navigate('/select-repo');
    }, 2400);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at center, #0a0a0a 0%, #000000 100%)',
    }}>
      
      {/* Background radial soft light */}
      <div style={{
        position: 'absolute', width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)',
        zIndex: 0, pointerEvents: 'none'
      }} />

      <div className="surface-card stagger-1" style={{ 
        width: '420px', 
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '56px 40px',
        zIndex: 1,
        boxShadow: 'var(--shadow-hover)'
      }}>

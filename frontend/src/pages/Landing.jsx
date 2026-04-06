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

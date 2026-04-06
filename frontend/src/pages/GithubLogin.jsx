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

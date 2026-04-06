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

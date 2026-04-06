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

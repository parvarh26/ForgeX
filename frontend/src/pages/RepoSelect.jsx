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

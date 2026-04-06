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

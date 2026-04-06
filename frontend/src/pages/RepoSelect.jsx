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


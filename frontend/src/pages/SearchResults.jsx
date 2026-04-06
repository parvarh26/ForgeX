import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Bot, Loader2, Zap, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function SearchResults() {
  const [searchParams] = useSearchParams();
  const repo = searchParams.get('repo');
  const initialQuery = searchParams.get('q');

  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery || '');
  const [isSearching, setIsSearching] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (repo && initialQuery) {
      executeSearch(initialQuery);
    }
  }, [repo, initialQuery]);

  const executeSearch = async (searchQuery) => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setResult(null);
    setError('');

    try {
      const res = await fetch('http://localhost:8000/api/v1/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, query: searchQuery })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ detail: 'Search Engine Refused Connection' }));
        throw new Error(errData.detail || 'Search Engine Refused Connection');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    if (query !== initialQuery) {
      navigate(`/search?repo=${encodeURIComponent(repo)}&q=${encodeURIComponent(query)}`);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#c9d1d9' }}>
      {/* GitHub Global Top Nav */}
      <div style={{ background: '#010409', padding: '16px 24px', borderBottom: '1px solid #30363d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', background: '#161b22', border: '1px solid #30363d', borderRadius: '50%' }}>
            <Zap size={16} color="#c9d1d9" />
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#c9d1d9', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
            <span style={{ color: '#8b949e', fontWeight: 400 }}>OpenIssue</span>
            <span style={{ color: '#8b949e' }}>/</span>
            <span style={{ fontWeight: 600 }}>{repo}</span>
          </div>
        </div>

        {/* Header Search Bar */}
        <form onSubmit={handleSearchSubmit} style={{ position: 'relative', width: '400px', display: 'flex', alignItems: 'center' }}>
          <input 
            type="text" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${repo}`} 
            style={{
              width: '100%', padding: '6px 14px 6px 32px',
              fontSize: '14px', lineHeight: '20px',
              background: '#0d1117',
              border: '1px solid #30363d', borderRadius: '6px',
              color: '#c9d1d9', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => { e.target.style.borderColor = '#58a6ff'; }}
            onBlur={e => { e.target.style.borderColor = '#30363d'; }}
          />
          <Search size={14} color="#8b949e" style={{ position: 'absolute', left: '10px' }} />
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9', padding: '5px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowLeft size={14} /> Back to Code
          </button>
        </div>
      </div>

      <main style={{ padding: '40px 24px', maxWidth: '900px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
           <Search size={24} color="#8b949e" />
           <h1 style={{ fontSize: '24px', fontWeight: 400, color: '#c9d1d9', margin: 0 }}>
             Results for <span style={{ fontWeight: 600 }}>{initialQuery}</span>
           </h1>
        </div>

        {isSearching && (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeUpIn 400ms ease' }}>
             <div style={{ display: 'flex', gap: '16px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#161b22', border: '1px solid #30363d' }} />
                <div style={{ flex: 1, padding: '24px', borderRadius: '6px', background: '#0d1117', border: '1px solid #30363d' }}>
                   <Loader2 size={24} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', color: '#8b949e' }} />
                   <p style={{ marginTop: '16px', color: '#8b949e', fontSize: '14px' }}>AI is synthesizing an answer from the intelligence matrix...</p>
                </div>
             </div>
           </div>
        )}

        {/* GitHub Issue Comment Style Panel */}
        {!isSearching && (result || error) && (
          <div style={{ display: 'flex', gap: '16px', animation: 'fadeUpIn 400ms ease' }}>
            {/* Avatar Area */}
            <div style={{ flexShrink: 0, marginTop: '4px' }}>
               <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#238636', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(240,246,252,0.1)' }}>
                 <Bot size={22} color="#fff" />
               </div>
            </div>

            {/* Comment Box */}
            <div style={{ position: 'relative', flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}>
              {/* Left triangle pointer */}
              <div style={{ position: 'absolute', top: '15px', left: '-12px', width: '0', height: '0', border: '6px solid transparent', borderRightColor: '#30363d' }}></div>
              <div style={{ position: 'absolute', top: '15px', left: '-10px', width: '0', height: '0', border: '6px solid transparent', borderRightColor: '#0d1117' }}></div>

              {/* Header */}
              <div style={{ padding: '8px 16px', background: '#161b22', borderBottom: '1px solid #30363d', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                  <strong style={{ color: '#c9d1d9' }}>OpenIssue AI</strong>
                  <span style={{ color: '#8b949e', border: '1px solid #30363d', padding: '0 6px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>bot</span>
                  <span style={{ color: '#8b949e' }}>synthesized this result</span>
                </div>
                <div style={{ color: '#8b949e' }}><Zap size={14} /></div>
              </div>

              {/* Body */}
              <div style={{ padding: '24px 16px' }}>
                {error ? (
                   <p style={{ color: '#f85149', fontSize: '14px', margin: 0 }}>{error}</p>
                ) : (
                   <>
                     <div className="markdown-body" style={{ fontSize: '15px', lineHeight: 1.6, color: '#c9d1d9', marginBottom: '24px' }}>
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                         {result.answer}
                       </ReactMarkdown>
                     </div>
                     
                     {result.sources && result.sources.length > 0 && (
                       <div style={{ borderTop: '1px solid #30363d', paddingTop: '16px' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontSize: '13px', fontWeight: 600, color: '#8b949e' }}>
                           <MessageSquare size={14} /> Intelligence Sources:
                         </div>
                         <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {result.sources.map(num => (
                               <a 
                                  key={num}
                                  href={`https://github.com/${repo}/issues/${num}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                      display: 'inline-flex', alignItems: 'center',
                                      padding: '3px 12px', background: '#161b22', border: '1px solid #30363d',
                                      borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                                      color: '#58a6ff', textDecoration: 'none', transition: 'background-color 0.2s'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
                                  onMouseLeave={e => e.currentTarget.style.background = '#161b22'}
                               >
                                 Issue #{num}
                               </a>
                            ))}
                         </div>
                       </div>
                     )}
                   </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <style>{`
        @keyframes fadeUpIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .indicator-pulse {
          animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }
      `}</style>
    </div>
  );
}

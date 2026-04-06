import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Bot, Loader2, Zap } from 'lucide-react';

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
      if (!res.ok) throw new Error('Search Engine Refused Connection');
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
    <div style={{ minHeight: '100vh', background: '#0d1117' }}>
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
              width: '100%', padding: '6px 12px 6px 32px',
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

      <main style={{ padding: '40px 24px', maxWidth: '800px', margin: '0 auto', width: '100%' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#c9d1d9', paddingBottom: '16px', borderBottom: '1px solid #30363d', marginBottom: '32px' }}>
          Search Results
        </h1>

        {isSearching && (
           <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeUpIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
             <div style={{ display: 'flex', gap: '12px' }}>
               <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#161b22', border: '1px solid #30363d' }} />
               <div style={{ flex: 1, height: '120px', borderRadius: '6px', background: '#161b22', border: '1px solid #30363d' }} />
             </div>
           </div>
        )}

        {/* GitHub Issue Comment Style Panel */}
        {!isSearching && (result || error) && (
          <div style={{ display: 'flex', gap: '16px', animation: 'fadeUpIn 400ms cubic-bezier(0.16, 1, 0.3, 1)' }}>
            {/* Avatar Area */}
            <div style={{ flexShrink: 0, marginTop: '4px' }}>
               <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#30363d', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(240,246,252,0.1)' }}>
                 <Bot size={22} color="#c9d1d9" />
               </div>
            </div>

            {/* Comment Box */}
            <div style={{ position: 'relative', flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}>
              {/* Left triangle pointer */}
              <div style={{ position: 'absolute', top: '15px', left: '-12px', width: '0', height: '0', border: '6px solid transparent', borderRightColor: '#30363d' }}></div>
              <div style={{ position: 'absolute', top: '15px', left: '-10px', width: '0', height: '0', border: '6px solid transparent', borderRightColor: '#161b22' }}></div>

              {/* Header */}
              <div style={{ padding: '12px 16px', background: '#161b22', borderBottom: '1px solid #30363d', borderTopLeftRadius: '6px', borderTopRightRadius: '6px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <strong style={{ color: '#c9d1d9' }}>OpenIssue AI</strong>
                <span style={{ color: '#8b949e', border: '1px solid #30363d', padding: '1px 6px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>bot</span>
                <span style={{ color: '#8b949e' }}>answered your query</span>
              </div>

              {/* Body */}
              <div style={{ padding: '20px 16px' }}>
                {error ? (
                   <p style={{ color: '#f85149', fontSize: '14px', margin: 0 }}>{error}</p>
                ) : (
                   <>
                     <p style={{ fontSize: '14px', lineHeight: 1.6, color: '#c9d1d9', margin: '0 0 16px 0', whiteSpace: 'pre-wrap' }}>
                       {result.answer}
                     </p>
                     {result.sources && result.sources.length > 0 && (
                       <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', borderTop: '1px solid #30363d', paddingTop: '16px' }}>
                         <span style={{ fontSize: '12px', color: '#8b949e', marginRight: '8px' }}>Citations: </span>
                         {result.sources.map(num => (
                            <a 
                               key={num}
                               href={`https://github.com/${repo}/issues/${num}`}
                               target="_blank"
                               rel="noreferrer"
                               style={{
                                   display: 'inline-flex', alignItems: 'center',
                                   padding: '1px 8px', background: '#161b22', border: '1px solid #30363d',
                                   borderRadius: '2rem', fontSize: '12px', fontWeight: 600,
                                   color: '#58a6ff', textDecoration: 'none', transition: 'border-color 0.2s'
                               }}
                               onMouseEnter={e => e.currentTarget.style.borderColor = '#8b949e'}
                               onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                            >
                              Issue #{num}
                            </a>
                         ))}
                       </div>
                     )}
                   </>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ShieldAlert, Zap, Loader2, GitPullRequestDraft } from 'lucide-react';

export default function ClusterDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clusterInfo, setClusterInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('openissue_clusters');
      if (stored) {
        const clusters = JSON.parse(stored);
        const match = clusters.find(c => String(c.cluster_label) === String(id));
        
        if (match) {
          setClusterInfo({
            ...match,
            repo: sessionStorage.getItem('openissue_repo') || 'unknown/repo',
          });
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.error("Failed to decode cluster geometry", e);
    }

    // Fallback if accessed via direct URL without a hot cache
    setClusterInfo({
      cluster_label: id,
      insight: "Cluster Not Found or Session Expired",
      urgency: "Unknown",
      issue_count: 0,
      repo: sessionStorage.getItem('openissue_repo') || 'unknown/repo',
      github_issue_numbers: [],
      llm_summary: "Please return to the Dashboard and ensure the Intelligence Stream is active. The semantic matrix requires a warm cache to display cluster topologies.",
      similarity_score: "N/A",
    });
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--color-base)' }}>
        <Loader2 size={40} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', color: 'var(--accent-info)', marginBottom: '20px' }} />
        <h2 style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>Decrypting Dimensional Cluster {id}...</h2>
      </div>
    );
  }

  const isCritical = clusterInfo?.urgency === 'Critical';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-base)', padding: '40px 60px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Navigation & Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <button 
            onClick={() => navigate('/dashboard')}
            className="anim-base"
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              border: 'var(--border-subtle)', 
              padding: '10px', 
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ArrowLeft size={18} color="var(--color-text-secondary)" />
          </button>
          <div>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 600, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '12px' }}>
              Cluster Identity #{clusterInfo.cluster_label}
              <span style={{ 
                fontSize: '14px', 
                padding: '4px 10px', 
                background: '#238636', 
                borderRadius: '20px',
                color: '#fff',
                fontWeight: 600
              }}>
                Open
              </span>
              <span style={{ 
                fontSize: '12px', 
                padding: '3px 8px', 
                border: '1px solid #30363d',
                borderRadius: '20px',
                color: '#8b949e',
              }}>
                {clusterInfo.repo}
              </span>
            </h1>
          </div>
        </div>

        {/* Top Info Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 250px', gap: '24px', marginBottom: '24px' }}>
          <div className="surface-card stagger-1" style={{ padding: '32px', borderLeft: isCritical ? '4px solid #f85149' : '4px solid #58a6ff' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: isCritical ? '#f85149' : '#58a6ff', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase' }}>
               {isCritical ? <ShieldAlert size={16} /> : <Zap size={16} />}
               {clusterInfo.urgency} Discovery
             </div>
             <h2 style={{ fontSize: '20px', fontWeight: 500, lineHeight: 1.4, color: '#c9d1d9' }}>
               {clusterInfo.insight}
             </h2>
          </div>

          <div className="surface-card stagger-2" style={{ padding: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
              Issue Volume
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: isCritical ? '#f85149' : '#c9d1d9' }}>
              {clusterInfo.issue_count}
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitPullRequestDraft size={14} /> Similar tickets merged
            </div>
          </div>
        </div>

        {/* Detailed Insights & Issues */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px' }}>
          <div className="surface-card stagger-3" style={{ padding: '32px' }}>
            <h3 style={{ fontSize: '1.1rem', marginBottom: '24px', fontWeight: 600 }}>LLM Deep Analysis</h3>
            <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-secondary)' }}>
              {clusterInfo.llm_summary}
            </p>

            <h3 style={{ fontSize: '1.1rem', margin: '40px 0 24px 0', fontWeight: 600 }}>Affected Issues</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {clusterInfo.github_issue_numbers.map((num, idx) => (
                <a 
                  key={`${num}-${idx}`}
                  href={`https://github.com/${clusterInfo.repo}/issues/${num}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '16px', 
                    background: '#161b22', 
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: '#c9d1d9',
                    transition: 'border-color 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#8b949e'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
                >
                  <span style={{ fontWeight: 500 }}>Issue #{num}</span>
                  <ExternalLink size={16} color="#8b949e" />
                </a>
              ))}
            </div>
          </div>

          {/* Sidebar Metrics */}
          <div className="stagger-4" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
             <div className="surface-card" style={{ padding: '24px' }}>
               <h4 style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Core Metrics</h4>
               
               <div style={{ marginBottom: '16px' }}>
                 <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Internal Similarity</div>
                 <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--accent-info)' }}>{clusterInfo.similarity_score}</div>
               </div>

               <div>
                 <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>Resolution Priority</div>
                 <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>P-1</div>
               </div>
             </div>
          </div>
        </div>

      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

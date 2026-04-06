import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, ShieldAlert, Zap, Loader2, GitPullRequestDraft, MessageSquare } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
      llm_summary: "The semantic matrix requires a warm cache to display cluster topologies. Please return to the Dashboard.",
      similarity_score: "N/A",
    });
    setLoading(false);
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0d1117' }}>
        <Loader2 size={40} className="indicator-pulse" style={{ animation: 'spin 2s linear infinite', color: '#58a6ff', marginBottom: '20px' }} />
        <h2 style={{ color: '#8b949e', fontWeight: 500 }}>Decrypting Dimensional Cluster {id}...</h2>
      </div>
    );
  }

  const isCritical = clusterInfo?.urgency === 'Critical';

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', padding: '40px 60px', color: '#c9d1d9' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        
        {/* Navigation & Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px' }}>
          <button 
            onClick={() => navigate('/dashboard')}
            style={{ 
              background: '#161b22', 
              border: '1px solid #30363d', 
              padding: '10px', 
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c9d1d9'
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#8b949e'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#30363d'}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}>
              Cluster Identity #{clusterInfo.cluster_label}
              <span style={{ 
                fontSize: '12px', 
                padding: '2px 10px', 
                background: isCritical ? '#f85149' : '#238636', 
                borderRadius: '20px',
                color: '#fff',
                fontWeight: 600
              }}>
                Open
              </span>
              <span style={{ 
                fontSize: '12px', 
                padding: '2px 8px', 
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px', marginBottom: '24px' }}>
          <div style={{ padding: '32px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', borderLeft: isCritical ? '6px solid #f85149' : '6px solid #58a6ff' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: isCritical ? '#f85149' : '#58a6ff', fontSize: '13px', fontWeight: 600, textTransform: 'uppercase' }}>
               {isCritical ? <ShieldAlert size={16} /> : <Zap size={16} />}
               {clusterInfo.urgency} Discovery
             </div>
             <h2 style={{ fontSize: '20px', fontWeight: 500, lineHeight: 1.4, color: '#c9d1d9', margin: 0 }}>
               {clusterInfo.insight}
             </h2>
          </div>

          <div style={{ padding: '32px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ color: '#8b949e', fontSize: '12px', textTransform: 'uppercase', fontWeight: 600, marginBottom: '8px' }}>
              Issue Volume
            </div>
            <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: isCritical ? '#f85149' : '#c9d1d9' }}>
              {clusterInfo.issue_count}
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <GitPullRequestDraft size={14} /> Neural group priority
            </div>
          </div>
        </div>

        {/* Detailed Insights & Issues */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: '24px' }}>
          <div style={{ padding: '32px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '24px', fontWeight: 600, color: '#c9d1d9' }}>AI Content Analysis</h3>
            <div className="markdown-body" style={{ fontSize: '15px', lineHeight: 1.7, color: '#c9d1d9' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {clusterInfo.llm_summary}
              </ReactMarkdown>
            </div>

            <h3 style={{ fontSize: '16px', margin: '40px 0 16px 0', fontWeight: 600, color: '#c9d1d9' }}>Incidents in Cluster</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(clusterInfo.github_issue_numbers || []).map((num, idx) => (
                <a 
                  key={`${num}-${idx}`}
                  href={`https://github.com/${clusterInfo.repo}/issues/${num}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px 16px', 
                    background: '#161b22', 
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    color: '#c9d1d9',
                    fontSize: '14px',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
                  onMouseLeave={e => e.currentTarget.style.background = '#161b22'}
                >
                  <span style={{ fontWeight: 500 }}>Issue #{num}</span>
                  <ExternalLink size={14} color="#8b949e" />
                </a>
              ))}
            </div>
          </div>

          {/* Sidebar Metrics */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
             <div style={{ padding: '24px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px' }}>
               <h4 style={{ fontSize: '11px', color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px', fontWeight: 600 }}>Core Matrics</h4>
               
               <div style={{ marginBottom: '16px' }}>
                 <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Cluster Cohesion</div>
                 <div style={{ fontSize: '20px', fontWeight: 600, color: '#58a6ff' }}>{clusterInfo.similarity_score}</div>
               </div>

               <div>
                 <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Resolution Priority</div>
                 <div style={{ fontSize: '20px', fontWeight: 600, color: isCritical ? '#f85149' : '#c9d1d9' }}>{isCritical ? 'P-0' : 'P-1'}</div>
               </div>
             </div>
          </div>
        </div>

      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .indicator-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
      `}</style>
    </div>
  );
}

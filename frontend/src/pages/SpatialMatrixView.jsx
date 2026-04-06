import React, { useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

const CLUSTER_COLORS = [
  '#58a6ff','#f85149','#3fb950','#d29922','#bc8cff',
  '#ff7b72','#79c0ff','#56d364','#e3b341','#a5d6ff',
];

function SpatialMatrixView({ repo }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const transformRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });

  useEffect(() => {
    fetch(`http://localhost:8000/api/v1/github/spatial?repo=${encodeURIComponent(repo)}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError('Run a sync first to build the vector index.'); setLoading(false); });
  }, [repo]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    drawCanvas();
  }, [data, scale, offset]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = 'rgba(48,54,61,0.5)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < W; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
    }
    for (let i = 0; i < H; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    if (!data.points || data.points.length === 0) return;

    const xs = data.points.map(p => p.x);
    const ys = data.points.map(p => p.y);
    const minX = xs.reduce((a, b) => Math.min(a, b), Infinity);
    const maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity);
    const minY = ys.reduce((a, b) => Math.min(a, b), Infinity);
    const maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const pad = 60;

    const toCanvas = (px, py) => ({
      cx: (((px - minX) / rangeX) * (W - 2 * pad) + pad) * scale + offset.x,
      cy: (((py - minY) / rangeY) * (H - 2 * pad) + pad) * scale + offset.y,
    });

    // Build cluster color map
    const labelSet = [...new Set(data.points.map(p => p.cluster_label))];
    const colorMap = {};
    labelSet.forEach((lbl, i) => {
      colorMap[lbl] = lbl === -1 ? 'rgba(100,100,100,0.3)' : CLUSTER_COLORS[i % CLUSTER_COLORS.length];
    });

    // Draw connections within clusters (faint lines between nearby points)
    const clusterGroups = {};
    data.points.forEach(p => {
      if (p.cluster_label === -1) return;
      if (!clusterGroups[p.cluster_label]) clusterGroups[p.cluster_label] = [];
      clusterGroups[p.cluster_label].push(p);
    });
    Object.entries(clusterGroups).forEach(([label, pts]) => {
      if (pts.length < 2) return;
      const color = colorMap[parseInt(label)];
      ctx.strokeStyle = color.replace(')', ', 0.12)').replace('rgb', 'rgba');
      ctx.lineWidth = 0.8;
      const center = pts.reduce((acc, p) => ({ x: acc.x + p.x / pts.length, y: acc.y + p.y / pts.length }), { x: 0, y: 0 });
      const { cx: ccx, cy: ccy } = toCanvas(center.x, center.y);
      pts.forEach(p => {
        const { cx, cy } = toCanvas(p.x, p.y);
        ctx.beginPath(); ctx.moveTo(ccx, ccy); ctx.lineTo(cx, cy); ctx.stroke();
      });
    });

    // Draw points
    data.points.forEach(p => {
      const { cx, cy } = toCanvas(p.x, p.y);
      const color = colorMap[p.cluster_label] || '#555';
      const r = p.cluster_label === -1 ? 2 : 4;

      // Glow for clustered points
      if (p.cluster_label !== -1) {
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3);
        grad.addColorStop(0, color.replace(')', ', 0.3)').replace('rgb(', 'rgba('));
        grad.addColorStop(1, 'transparent');
        ctx.beginPath(); ctx.arc(cx, cy, r * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Legend
    const uniqueLabels = labelSet.filter(l => l !== -1).slice(0, 8);
    uniqueLabels.forEach((lbl, i) => {
      const x = 16, y = 20 + i * 22;
      ctx.beginPath(); ctx.arc(x + 6, y, 5, 0, Math.PI * 2);
      ctx.fillStyle = colorMap[lbl]; ctx.fill();
      ctx.fillStyle = '#8b949e'; ctx.font = '11px system-ui';
      ctx.fillText(`Cluster ${lbl}`, x + 16, y + 4);
    });
  };

  const getHoveredPoint = (e) => {
    if (!data || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const W = canvasRef.current.width, H = canvasRef.current.height;
    const xs = data.points.map(p => p.x), ys = data.points.map(p => p.y);
    const minX = xs.reduce((a, b) => Math.min(a, b), Infinity);
    const maxX = xs.reduce((a, b) => Math.max(a, b), -Infinity);
    const minY = ys.reduce((a, b) => Math.min(a, b), Infinity);
    const maxY = ys.reduce((a, b) => Math.max(a, b), -Infinity);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const pad = 60;

    for (const p of data.points) {
      const cx = (((p.x - minX) / rangeX) * (W - 2 * pad) + pad) * scale + offset.x;
      const cy = (((p.y - minY) / rangeY) * (H - 2 * pad) + pad) * scale + offset.y;
      const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
      if (dist < 8) return { point: p, cx, cy };
    }
    return null;
  };

  const handleMouseMove = (e) => {
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setOffset({ x: transformRef.current.offset.x + dx, y: transformRef.current.offset.y + dy });
      return;
    }
    const found = getHoveredPoint(e);
    if (found) {
      const rect = canvasRef.current.getBoundingClientRect();
      setTooltip({ point: found.point, x: e.clientX - rect.left, y: e.clientY - rect.top });
    } else {
      setTooltip(null);
    }
  };

  const handleMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    transformRef.current = { scale, offset };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const ev = data?.explained_variance || [];
  const explainedPct = ev.length >= 2 ? Math.round((ev[0] + ev[1]) * 100) : '—';

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#c9d1d9', margin: 0 }}>Spatial Matrix</h2>
          <p style={{ fontSize: '12px', color: '#8b949e', margin: '4px 0 0' }}>
            PCA 2D projection • {data?.total || 0} vectors • {explainedPct}% variance explained
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setScale(s => Math.min(s * 1.3, 5))} style={btnStyle}><ZoomIn size={14} /></button>
          <button onClick={() => setScale(s => Math.max(s / 1.3, 0.2))} style={btnStyle}><ZoomOut size={14} /></button>
          <button onClick={reset} style={btnStyle}><RotateCcw size={14} /></button>
        </div>
      </div>

      <div style={{ position: 'relative', border: '1px solid #30363d', borderRadius: '6px', overflow: 'hidden' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0d1117', zIndex: 2 }}>
            <Loader2 size={32} style={{ animation: 'spin 2s linear infinite', color: '#58a6ff' }} />
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: '60px', textAlign: 'center', color: '#8b949e' }}>
            <p style={{ fontSize: '14px' }}>{error}</p>
            <p style={{ fontSize: '12px', marginTop: '8px' }}>Go to Intelligence tab → trigger a sync first.</p>
          </div>
        )}
        {!error && (
          <div style={{ position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={900} height={520}
              style={{ display: 'block', cursor: isDragging.current ? 'grabbing' : 'grab', width: '100%' }}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { setTooltip(null); isDragging.current = false; }}
            />
            {tooltip && (
              <div style={{
                position: 'absolute', left: tooltip.x + 12, top: tooltip.y - 10,
                background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
                padding: '10px 14px', fontSize: '12px', color: '#c9d1d9',
                pointerEvents: 'none', zIndex: 10, maxWidth: '260px', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              }}>
                <div style={{ fontWeight: 600, color: '#58a6ff', marginBottom: '4px' }}>
                  Issue #{tooltip.point.issue_number}
                </div>
                <div style={{ color: '#8b949e', marginBottom: '4px' }}>{tooltip.point.title}</div>
                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <span style={{ background: '#238636', color: '#fff', padding: '1px 6px', borderRadius: '4px', fontSize: '11px' }}>
                    Cluster {tooltip.point.cluster_label}
                  </span>
                  <span style={{ color: '#8b949e', fontSize: '11px' }}>{tooltip.point.urgency}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = {
  background: '#161b22', border: '1px solid #30363d', borderRadius: '6px',
  color: '#8b949e', padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center',
};

export default SpatialMatrixView;

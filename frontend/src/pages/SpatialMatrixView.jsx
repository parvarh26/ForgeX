import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, ZoomIn, ZoomOut, RotateCcw, Maximize2 } from 'lucide-react';

const CLUSTER_PALETTE = [
  { base: '#58a6ff', glow: 'rgba(88,166,255,0.18)' },
  { base: '#f85149', glow: 'rgba(248,81,73,0.18)' },
  { base: '#3fb950', glow: 'rgba(63,185,80,0.18)' },
  { base: '#d29922', glow: 'rgba(210,153,34,0.18)' },
  { base: '#bc8cff', glow: 'rgba(188,140,255,0.18)' },
  { base: '#ff7b72', glow: 'rgba(255,123,114,0.18)' },
  { base: '#79c0ff', glow: 'rgba(121,192,255,0.18)' },
  { base: '#56d364', glow: 'rgba(86,211,100,0.18)' },
  { base: '#e3b341', glow: 'rgba(227,179,65,0.18)' },
  { base: '#a5d6ff', glow: 'rgba(165,214,255,0.18)' },
];

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
};

// Compute convex hull using Gift Wrapping
function convexHull(points) {
  if (points.length < 3) return points;
  const n = points.length;
  let l = 0;
  for (let i = 1; i < n; i++) if (points[i].x < points[l].x) l = i;
  const hull = [];
  let p = l;
  do {
    hull.push(points[p]);
    let q = (p + 1) % n;
    for (let i = 0; i < n; i++) {
      const cross = (points[q].x - points[p].x) * (points[i].y - points[p].y)
                  - (points[q].y - points[p].y) * (points[i].x - points[p].x);
      if (cross < 0) q = i;
    }
    p = q;
  } while (p !== l && hull.length < n);
  return hull;
}

// Draw a smooth puffed hull around cluster points
function drawClusterHull(ctx, pts, color, toCanvas, padding = 22) {
  if (pts.length < 2) return;
  const canvasPts = pts.map(p => toCanvas(p.x, p.y));
  const hull = convexHull(canvasPts.map((c, i) => ({ ...c, x: c.cx, y: c.cy })));
  if (hull.length < 2) return;

  ctx.save();
  ctx.beginPath();
  const first = hull[0];
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < hull.length; i++) {
    const prev = hull[i - 1];
    const curr = hull[i];
    const mx = (prev.x + curr.x) / 2;
    const my = (prev.y + curr.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
  }
  ctx.quadraticCurveTo(hull[hull.length - 1].x, hull[hull.length - 1].y, first.x, first.y);
  ctx.closePath();

  const rgb = hexToRgb(color);
  ctx.fillStyle = `rgba(${rgb},0.055)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${rgb},0.25)`;
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function SpatialMatrixView({ repo }) {
  const canvasRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tooltip, setTooltip] = useState(null);
  const [hoveredCluster, setHoveredCluster] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const transformRef = useRef({ scale: 1, offset: { x: 0, y: 0 } });
  const animFrameRef = useRef(null);

  useEffect(() => {
    fetch(`http://localhost:8000/api/v1/github/spatial?repo=${encodeURIComponent(repo)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e)))
      .then(d => { setData(d); setLoading(false); })
      .catch(() => { setError('Run a sync first to build the vector index.'); setLoading(false); });
  }, [repo]);

  const colorMap = React.useMemo(() => {
    if (!data) return {};
    const labelSet = [...new Set(data.points.map(p => p.cluster_label))].sort((a, b) => a - b);
    const map = {};
    let colorIdx = 0;
    labelSet.forEach(lbl => {
      if (lbl === -1) map[lbl] = { base: '#3d444d', glow: 'rgba(61,68,77,0.1)' };
      else map[lbl] = CLUSTER_PALETTE[colorIdx++ % CLUSTER_PALETTE.length];
    });
    return map;
  }, [data]);

  const clusterGroups = React.useMemo(() => {
    if (!data) return {};
    const groups = {};
    data.points.forEach(p => {
      if (p.cluster_label === -1) return;
      if (!groups[p.cluster_label]) groups[p.cluster_label] = [];
      groups[p.cluster_label].push(p);
    });
    return groups;
  }, [data]);

  const buildTransform = useCallback((W, H) => {
    if (!data?.points?.length) return null;
    const xs = data.points.map(p => p.x);
    const ys = data.points.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const pad = 72;
    return (px, py) => ({
      cx: (((px - minX) / rangeX) * (W - 2 * pad) + pad) * scale + offset.x,
      cy: (((py - minY) / rangeY) * (H - 2 * pad) + pad) * scale + offset.y,
    });
  }, [data, scale, offset]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Background
    ctx.clearRect(0, 0, W, H);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
    bgGrad.addColorStop(0, '#0a0e1a');
    bgGrad.addColorStop(1, '#0d1117');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);

    const toCanvas = buildTransform(W, H);
    if (!toCanvas) return;

    // Subtle dot-grid (replaces the flat line grid)
    ctx.fillStyle = 'rgba(48,54,61,0.45)';
    for (let x = 0; x < W; x += 32) {
      for (let y = 0; y < H; y += 32) {
        ctx.beginPath();
        ctx.arc(x, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (!data.points.length) return;

    // Phase 1: Cluster territory hulls (behind everything)
    Object.entries(clusterGroups).forEach(([label, pts]) => {
      const lbl = parseInt(label);
      const isHovered = hoveredCluster === lbl;
      const color = colorMap[lbl]?.base || '#555';
      ctx.save();
      if (isHovered) {
        // Brighter hull on hover
        ctx.globalAlpha = 1.5;
      }
      drawClusterHull(ctx, pts, color, toCanvas);
      ctx.restore();
    });

    // Phase 2: Radial glow halos for each cluster centroid
    Object.entries(clusterGroups).forEach(([label, pts]) => {
      const lbl = parseInt(label);
      const color = colorMap[lbl]?.base || '#555';
      const rgb = hexToRgb(color);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const { cx: ccx, cy: ccy } = toCanvas(cx, cy);
      const r = 40 + pts.length * 3;
      const grad = ctx.createRadialGradient(ccx, ccy, 0, ccx, ccy, Math.min(r, 120));
      grad.addColorStop(0, `rgba(${rgb},0.09)`);
      grad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(ccx, ccy, Math.min(r, 120), 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    });

    // Phase 3: Draw nodes — noise first (below), then clustered
    const noisePoints = data.points.filter(p => p.cluster_label === -1);
    const clusteredPoints = data.points.filter(p => p.cluster_label !== -1);

    // Noise (faint, small)
    noisePoints.forEach(p => {
      const { cx, cy } = toCanvas(p.x, p.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(61,68,77,0.55)';
      ctx.fill();
    });

    // Clustered — layered glow + crisp dot
    clusteredPoints.forEach(p => {
      const { cx, cy } = toCanvas(p.x, p.y);
      const palette = colorMap[p.cluster_label] || { base: '#555', glow: 'rgba(85,85,85,0.2)' };
      const rgb = hexToRgb(palette.base);
      const isHovered = hoveredCluster === p.cluster_label;
      const r = isHovered ? 5.5 : 4;

      // Outer glow shell
      const outerGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 4);
      outerGrad.addColorStop(0, `rgba(${rgb},${isHovered ? 0.35 : 0.2})`);
      outerGrad.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(cx, cy, r * 4, 0, Math.PI * 2);
      ctx.fillStyle = outerGrad;
      ctx.fill();

      // Core dot with bevel gradient
      const coreGrad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
      coreGrad.addColorStop(0, `rgba(${rgb},1)`);
      coreGrad.addColorStop(0.6, palette.base);
      coreGrad.addColorStop(1, `rgba(${rgb},0.75)`);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();

      // Sharp rim
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb},${isHovered ? 0.9 : 0.45})`;
      ctx.lineWidth = isHovered ? 1.5 : 0.8;
      ctx.stroke();
    });

    // Phase 4: Cluster centroid markers (subtle crosshair)
    Object.entries(clusterGroups).forEach(([label, pts]) => {
      const lbl = parseInt(label);
      const color = colorMap[lbl]?.base || '#555';
      const rgb = hexToRgb(color);
      const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const { cx: ccx, cy: ccy } = toCanvas(cx, cy);

      // Diamond marker
      ctx.save();
      ctx.translate(ccx, ccy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = `rgba(${rgb},0.7)`;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
    });

  }, [data, scale, offset, hoveredCluster, colorMap, clusterGroups, buildTransform]);

  useEffect(() => {
    if (!data || !canvasRef.current) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(drawCanvas);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [data, scale, offset, hoveredCluster, drawCanvas]);

  // Mouse wheel zoom
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    setScale(s => {
      const ns = Math.min(Math.max(s * factor, 0.15), 8);
      setOffset(o => ({
        x: mx - (mx - o.x) * (ns / s),
        y: my - (my - o.y) * (ns / s),
      }));
      return ns;
    });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const getHoveredPoint = useCallback((e) => {
    if (!data || !canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvas = canvasRef.current;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    const toCanvas = buildTransform(canvas.width, canvas.height);
    if (!toCanvas) return null;

    let closest = null, minDist = 14;
    for (const p of data.points) {
      const { cx, cy } = toCanvas(p.x, p.y);
      const dist = Math.hypot(mx - cx, my - cy);
      if (dist < minDist) { minDist = dist; closest = { point: p, cx, cy }; }
    }
    return closest;
  }, [data, buildTransform]);

  const handleMouseMove = useCallback((e) => {
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
      setHoveredCluster(found.point.cluster_label !== -1 ? found.point.cluster_label : null);
    } else {
      setTooltip(null);
      setHoveredCluster(null);
    }
  }, [getHoveredPoint]);

  const handleMouseDown = (e) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    transformRef.current = { scale, offset };
  };

  const handleMouseUp = () => { isDragging.current = false; };
  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const uniqueLabels = data
    ? [...new Set(data.points.map(p => p.cluster_label))].filter(l => l !== -1).sort((a, b) => a - b)
    : [];
  const ev = data?.explained_variance || [];
  const explainedPct = ev.length >= 2 ? Math.round((ev[0] + ev[1]) * 100) : '—';
  const noiseCount = data?.points?.filter(p => p.cluster_label === -1).length || 0;

  return (
    <div style={{ animation: 'fadeUpIn 400ms ease' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#c9d1d9', margin: 0 }}>Spatial Matrix</h2>
          <p style={{ fontSize: '12px', color: '#8b949e', margin: '4px 0 0', display: 'flex', gap: '12px' }}>
            <span>PCA 2D projection</span>
            <span style={{ color: '#30363d' }}>•</span>
            <span>{data?.total || 0} vectors</span>
            <span style={{ color: '#30363d' }}>•</span>
            <span>{explainedPct}% variance explained</span>
            {noiseCount > 0 && <><span style={{ color: '#30363d' }}>•</span><span style={{ color: '#6e7681' }}>{noiseCount} noise</span></>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={() => setScale(s => Math.min(s * 1.25, 8))} style={btnStyle} title="Zoom in">
            <ZoomIn size={13} />
          </button>
          <button onClick={() => setScale(s => Math.max(s / 1.25, 0.15))} style={btnStyle} title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <button onClick={reset} style={btnStyle} title="Reset view">
            <RotateCcw size={13} />
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div style={{
        position: 'relative',
        border: '1px solid #21262d',
        borderRadius: '10px',
        overflow: 'hidden',
        background: '#0a0e1a',
        boxShadow: '0 0 0 1px rgba(88,166,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03)',
      }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', gap: '12px', zIndex: 2 }}>
            <Loader2 size={28} style={{ animation: 'spin 1.5s linear infinite', color: '#58a6ff' }} />
            <span style={{ fontSize: '13px', color: '#8b949e' }}>Loading spatial index…</span>
          </div>
        )}
        {error && !loading && (
          <div style={{ padding: '80px 40px', textAlign: 'center', color: '#8b949e' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
            <p style={{ fontSize: '14px', color: '#c9d1d9', marginBottom: '6px' }}>Vector index not built yet</p>
            <p style={{ fontSize: '12px' }}>Go to the Intelligence tab and trigger a sync first.</p>
          </div>
        )}
        {!error && (
          <div style={{ position: 'relative' }}>
            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              style={{
                display: 'block',
                width: '100%',
                cursor: isDragging.current ? 'grabbing' : 'crosshair',
              }}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={() => { setTooltip(null); setHoveredCluster(null); isDragging.current = false; }}
            />

            {/* Floating legend — HTML overlay, not canvas-drawn */}
            {uniqueLabels.length > 0 && (
              <div style={{
                position: 'absolute', top: '14px', left: '14px',
                background: 'rgba(13,17,23,0.85)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(48,54,61,0.8)',
                borderRadius: '8px',
                padding: '10px 14px',
                minWidth: '130px',
              }}>
                <div style={{ fontSize: '10px', fontWeight: 600, color: '#6e7681', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Clusters
                </div>
                {uniqueLabels.map(lbl => {
                  const count = clusterGroups[lbl]?.length || 0;
                  const color = colorMap[lbl]?.base || '#555';
                  const isHov = hoveredCluster === lbl;
                  return (
                    <div
                      key={lbl}
                      onMouseEnter={() => setHoveredCluster(lbl)}
                      onMouseLeave={() => setHoveredCluster(null)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        fontSize: '11px', color: isHov ? '#c9d1d9' : '#8b949e',
                        padding: '3px 0', cursor: 'default',
                        transition: 'color 0.15s',
                      }}
                    >
                      <div style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: color,
                        boxShadow: isHov ? `0 0 6px ${color}` : 'none',
                        transition: 'box-shadow 0.15s',
                        flexShrink: 0,
                      }} />
                      <span style={{ flex: 1 }}>Cluster {lbl}</span>
                      <span style={{ fontSize: '10px', color: '#6e7681' }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tooltip */}
            {tooltip && (
              <div style={{
                position: 'absolute',
                left: Math.min(tooltip.x + 14, canvasRef.current ? canvasRef.current.getBoundingClientRect().width - 270 : tooltip.x + 14),
                top: tooltip.y - 14,
                background: 'rgba(13,17,23,0.95)',
                backdropFilter: 'blur(16px)',
                border: `1px solid ${colorMap[tooltip.point.cluster_label]?.base || '#30363d'}44`,
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '12px',
                color: '#c9d1d9',
                pointerEvents: 'none',
                zIndex: 10,
                maxWidth: '260px',
                boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{
                    width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                    background: colorMap[tooltip.point.cluster_label]?.base || '#555',
                    boxShadow: `0 0 6px ${colorMap[tooltip.point.cluster_label]?.base || '#555'}`,
                  }} />
                  <span style={{ fontWeight: 600, color: '#e6edf3' }}>
                    Issue #{tooltip.point.issue_number}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: '10px', padding: '1px 7px', borderRadius: '20px',
                    background: tooltip.point.cluster_label === -1 ? '#21262d' : `${colorMap[tooltip.point.cluster_label]?.base}22`,
                    color: tooltip.point.cluster_label === -1 ? '#6e7681' : colorMap[tooltip.point.cluster_label]?.base,
                    border: `1px solid ${tooltip.point.cluster_label === -1 ? '#30363d' : colorMap[tooltip.point.cluster_label]?.base + '44'}`,
                    flexShrink: 0,
                  }}>
                    {tooltip.point.cluster_label === -1 ? 'noise' : `C${tooltip.point.cluster_label}`}
                  </span>
                </div>
                <div style={{ color: '#8b949e', lineHeight: 1.4, fontSize: '11.5px' }}>
                  {tooltip.point.title || 'No title'}
                </div>
                {tooltip.point.urgency && tooltip.point.cluster_label !== -1 && (
                  <div style={{ marginTop: '7px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '10px', padding: '1px 7px', borderRadius: '20px',
                      background: tooltip.point.urgency === 'Critical' ? 'rgba(248,81,73,0.15)'
                        : tooltip.point.urgency === 'High' ? 'rgba(210,153,34,0.15)'
                        : 'rgba(63,185,80,0.12)',
                      color: tooltip.point.urgency === 'Critical' ? '#f85149'
                        : tooltip.point.urgency === 'High' ? '#d29922'
                        : '#3fb950',
                      border: `1px solid ${tooltip.point.urgency === 'Critical' ? '#f8514933'
                        : tooltip.point.urgency === 'High' ? '#d2992233'
                        : '#3fb95033'}`,
                    }}>
                      {tooltip.point.urgency}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Zoom indicator */}
            {scale !== 1 && (
              <div style={{
                position: 'absolute', bottom: '12px', right: '12px',
                background: 'rgba(13,17,23,0.75)', backdropFilter: 'blur(8px)',
                border: '1px solid #21262d', borderRadius: '6px',
                padding: '4px 10px', fontSize: '11px', color: '#6e7681',
              }}>
                {Math.round(scale * 100)}%
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {data && (
        <div style={{
          display: 'flex', gap: '24px', marginTop: '12px',
          padding: '10px 16px',
          background: '#0d1117',
          border: '1px solid #21262d',
          borderRadius: '8px',
          fontSize: '12px',
        }}>
          <div style={{ color: '#8b949e' }}>
            <span style={{ color: '#6e7681', marginRight: '6px' }}>Clusters</span>
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{uniqueLabels.length}</span>
          </div>
          <div style={{ color: '#8b949e' }}>
            <span style={{ color: '#6e7681', marginRight: '6px' }}>Vectors</span>
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{data.total}</span>
          </div>
          <div style={{ color: '#8b949e' }}>
            <span style={{ color: '#6e7681', marginRight: '6px' }}>Coverage</span>
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>
              {data.total > 0 ? Math.round(((data.total - noiseCount) / data.total) * 100) : 0}%
            </span>
          </div>
          <div style={{ color: '#8b949e' }}>
            <span style={{ color: '#6e7681', marginRight: '6px' }}>Variance</span>
            <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{explainedPct}%</span>
          </div>
          <div style={{ marginLeft: 'auto', color: '#6e7681', fontSize: '11px', display: 'flex', alignItems: 'center' }}>
            Scroll to zoom · Drag to pan · Hover to inspect
          </div>
        </div>
      )}
    </div>
  );
}

const btnStyle = {
  background: '#0d1117',
  border: '1px solid #21262d',
  borderRadius: '6px',
  color: '#8b949e',
  padding: '5px 9px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  transition: 'border-color 0.15s, color 0.15s',
};

export default SpatialMatrixView;

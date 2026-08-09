'use client';

import { useRef, useState } from 'react';

export interface MetricSeries {
  key: string;
  label: string;
  /** CSS color (e.g. var(--metric-series-1)). */
  color: string;
  /** Same length as `times`; null marks a missing bucket (gap in the line). */
  values: (number | null)[];
}

interface MetricChartProps {
  title: string;
  times: number[];
  series: MetricSeries[];
  /** Formats a value for the y-axis and tooltip. */
  format: (v: number) => string;
  /** Fixed y-axis maximum (e.g. 100 for %). Omit to derive from the data. */
  yMax?: number;
  height?: number;
  /** Draw an area fill under a single series. Ignored for multi-series. */
  area?: boolean;
}

// Internal SVG coordinate system; rendered at width=100% so it scales. Hover
// math uses ratios off the rendered rect, so the fixed width doesn't matter.
const W = 640;
const PAD = { top: 10, right: 10, bottom: 20, left: 48 };

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export function MetricChart({
  title,
  times,
  series,
  format,
  yMax,
  height = 170,
  area = false,
}: MetricChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const H = height;
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = times.length;

  const dataMax = Math.max(
    0,
    ...series.flatMap((s) => s.values.filter((v): v is number => v != null))
  );
  const max = yMax ?? niceMax(dataMax || 1);

  const x = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;

  // Build one path string, breaking into sub-paths across null gaps.
  const linePath = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d.trim();
  };

  const areaPath = (values: (number | null)[]) => {
    // Only a contiguous fill is drawn; leading/trailing nulls are trimmed.
    const pts = values
      .map((v, i) => ({ v, i }))
      .filter((p): p is { v: number; i: number } => p.v != null);
    if (pts.length < 2) return '';
    let d = `M${x(pts[0].i).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} `;
    pts.forEach((p) => (d += `L${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)} `));
    d += `L${x(pts[pts.length - 1].i).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;
    return d;
  };

  const ticks = [0, 0.5, 1].map((f) => f * max);
  const multi = series.length > 1;

  const onMove = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    const frac = (relX - PAD.left) / plotW;
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  };

  const hoverTime = hoverIdx != null ? times[hoverIdx] : null;
  const tooltipLeftPct =
    hoverIdx != null ? Math.max(2, Math.min(98, (x(hoverIdx) / W) * 100)) : 0;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-sm font-medium">{title}</span>
        {multi && (
          <div className="flex gap-3">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-[2px]"
                  style={{ backgroundColor: s.color }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          onMouseMove={onMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={title}
        >
          {/* gridlines + y labels */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--metric-grid)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 6}
                y={y(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={10}
                fill="var(--metric-axis)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {format(t)}
              </text>
            </g>
          ))}

          {/* area fill (single series only) */}
          {!multi && area && series[0] && (
            <path d={areaPath(series[0].values)} fill={series[0].color} fillOpacity={0.12} />
          )}

          {/* series lines */}
          {series.map((s) => (
            <path
              key={s.key}
              d={linePath(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* hover crosshair + markers */}
          {hoverIdx != null && (
            <g>
              <line
                x1={x(hoverIdx)}
                x2={x(hoverIdx)}
                y1={PAD.top}
                y2={PAD.top + plotH}
                stroke="var(--metric-axis)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {series.map((s) => {
                const v = s.values[hoverIdx];
                if (v == null) return null;
                return (
                  <circle
                    key={s.key}
                    cx={x(hoverIdx)}
                    cy={y(v)}
                    r={3.5}
                    fill={s.color}
                    stroke="var(--card)"
                    strokeWidth={1.5}
                  />
                );
              })}
            </g>
          )}
        </svg>

        {/* tooltip */}
        {hoverIdx != null && hoverTime != null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs shadow-md"
            style={{ left: `${tooltipLeftPct}%` }}
          >
            <div className="mb-0.5 text-muted-foreground">
              {new Date(hoverTime * 1000).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            {series.map((s) => {
              const v = s.values[hoverIdx];
              return (
                <div key={s.key} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="inline-block h-2 w-2 rounded-[2px]"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="ml-auto font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {v == null ? '—' : format(v)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

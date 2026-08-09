interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  /** 0-1 usage fraction; renders a thin bar under the value when provided. */
  fraction?: number;
}

export function StatTile({ label, value, sub, fraction }: StatTileProps) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className="mt-1 text-xl font-semibold"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {fraction != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, fraction * 100)).toFixed(0)}%`,
              backgroundColor: 'var(--metric-series-1)',
            }}
          />
        </div>
      )}
    </div>
  );
}

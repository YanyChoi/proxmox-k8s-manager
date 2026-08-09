'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { RefreshCw, Power, Square, Trash2, Server } from 'lucide-react';
import { MetricChart, MetricSeries } from '@/components/metrics/metric-chart';
import { StatTile } from '@/components/metrics/stat-tile';
import type { ProxmoxRrdSample, RrdTimeframe } from '@/lib/types/proxmox';

interface VM {
  vmid: number;
  name: string;
  status: string;
  cpus?: number;
  maxmem?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
  ipAddress?: string | null;
}

interface VMStatus {
  status: string;
  cpu?: number;
  cpus?: number;
  mem?: number;
  maxmem?: number;
  maxdisk?: number;
  uptime?: number;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Request failed');
  return res.json();
};

const TIMEFRAMES: RrdTimeframe[] = ['hour', 'day', 'week'];

function fmtBytes(bytes?: number | null): string {
  if (bytes == null) return 'N/A';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function fmtBps(bps: number): string {
  return `${fmtBytes(bps)}/s`;
}

function fmtUptime(seconds?: number): string {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function VMsPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [timeframe, setTimeframe] = useState<RrdTimeframe>('hour');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: vmsData, isLoading, mutate: refetchVMs } = useSWR<{ vms: VM[] }>(
    '/api/vms',
    fetcher,
    { refreshInterval: 15000 }
  );

  const vms = useMemo(
    () => (vmsData?.vms ?? []).filter((vm) => !vm.template),
    [vmsData]
  );

  // Selection is URL-synced without useSearchParams (avoids the Suspense
  // requirement): read once on mount, write on change.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('vmid');
    if (fromUrl) setSelected(Number(fromUrl));
  }, []);

  useEffect(() => {
    // Default to the first VM once the list loads and nothing is selected.
    if (selected == null && vms.length > 0) setSelected(vms[0].vmid);
  }, [vms, selected]);

  const select = useCallback((vmid: number) => {
    setSelected(vmid);
    const url = new URL(window.location.href);
    url.searchParams.set('vmid', String(vmid));
    window.history.replaceState(null, '', url);
  }, []);

  const current = vms.find((vm) => vm.vmid === selected) ?? null;
  const isRunning = current?.status === 'running';

  const { data: statusData } = useSWR<{ status: VMStatus }>(
    current && isRunning ? `/api/vms/${current.vmid}/status` : null,
    fetcher,
    { refreshInterval: 3000 }
  );
  const live = statusData?.status;

  const { data: rrdData, isLoading: rrdLoading } = useSWR<{ data: ProxmoxRrdSample[] }>(
    current && isRunning ? `/api/vms/${current.vmid}/rrddata?timeframe=${timeframe}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );
  const samples = rrdData?.data ?? [];
  const times = samples.map((s) => s.time);

  const cpuSeries: MetricSeries[] = [
    {
      key: 'cpu',
      label: 'CPU',
      color: 'var(--metric-series-1)',
      values: samples.map((s) => (s.cpu != null ? s.cpu * 100 : null)),
    },
  ];
  const memSeries: MetricSeries[] = [
    {
      key: 'mem',
      label: 'Memory',
      color: 'var(--metric-series-1)',
      values: samples.map((s) => s.mem ?? null),
    },
  ];
  const netSeries: MetricSeries[] = [
    { key: 'in', label: 'In', color: 'var(--metric-series-1)', values: samples.map((s) => s.netin ?? null) },
    { key: 'out', label: 'Out', color: 'var(--metric-series-2)', values: samples.map((s) => s.netout ?? null) },
  ];
  const diskSeries: MetricSeries[] = [
    { key: 'read', label: 'Read', color: 'var(--metric-series-1)', values: samples.map((s) => s.diskread ?? null) },
    { key: 'write', label: 'Write', color: 'var(--metric-series-2)', values: samples.map((s) => s.diskwrite ?? null) },
  ];

  const memMax = live?.maxmem ?? current?.maxmem;

  const doAction = async (vmid: number, action: 'start' | 'stop' | 'delete') => {
    if (action === 'delete' && !confirm(`Delete VM ${vmid}? This cannot be undone.`)) return;
    try {
      setActionBusy(`${vmid}:${action}`);
      setError(null);
      const res = await fetch(
        action === 'delete' ? `/api/vms/${vmid}` : `/api/vms/${vmid}/${action}`,
        { method: action === 'delete' ? 'DELETE' : 'POST' }
      );
      if (!res.ok) throw new Error(`Failed to ${action} VM`);
      if (action === 'delete' && selected === vmid) setSelected(null);
      await refetchVMs();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} VM`);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className="flex h-[calc(100vh-var(--nav-h,64px))] flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Virtual Machines</h1>
          <p className="text-sm text-muted-foreground">Proxmox VMs and live metrics</p>
        </div>
        <Button onClick={() => refetchVMs()} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Sidebar list */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r">
          {isLoading && vms.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Loading VMs…</div>
          ) : vms.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No VMs found.</div>
          ) : (
            <ul className="p-2">
              {vms.map((vm) => {
                const active = vm.vmid === selected;
                return (
                  <li key={vm.vmid}>
                    <button
                      onClick={() => select(vm.vmid)}
                      className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        active ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${
                          vm.status === 'running' ? 'bg-green-500' : 'bg-muted-foreground/40'
                        }`}
                      />
                      <span className="truncate font-medium">{vm.name}</span>
                      <span className="ml-auto font-mono text-xs text-muted-foreground">#{vm.vmid}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Focus pane */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4">
          {!current ? (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Server className="mx-auto mb-2 opacity-40" size={40} />
                <p>Select a VM to see its metrics</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Header + actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        isRunning ? 'bg-green-500' : 'bg-muted-foreground/40'
                      }`}
                    />
                    <h2 className="text-lg font-semibold">{current.name}</h2>
                    <span className="font-mono text-sm text-muted-foreground">#{current.vmid}</span>
                    <span className="capitalize text-sm text-muted-foreground">· {current.status}</span>
                  </div>
                  {current.ipAddress && (
                    <div className="mt-0.5 font-mono text-xs text-muted-foreground">{current.ipAddress}</div>
                  )}
                </div>
                <div className="flex gap-2">
                  {!isRunning ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionBusy != null}
                      onClick={() => doAction(current.vmid, 'start')}
                    >
                      <Power /> Start
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionBusy != null}
                      onClick={() => doAction(current.vmid, 'stop')}
                    >
                      <Square /> Stop
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={actionBusy != null}
                    onClick={() => doAction(current.vmid, 'delete')}
                  >
                    <Trash2 /> Delete
                  </Button>
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                <StatTile
                  label="CPU"
                  value={live?.cpu != null ? `${(live.cpu * 100).toFixed(1)}%` : '—'}
                  sub={`${current.cpus ?? live?.cpus ?? '?'} vCPU`}
                  fraction={live?.cpu ?? undefined}
                />
                <StatTile
                  label="Memory"
                  value={live?.mem != null ? fmtBytes(live.mem) : '—'}
                  sub={memMax ? `of ${fmtBytes(memMax)}` : undefined}
                  fraction={live?.mem != null && memMax ? live.mem / memMax : undefined}
                />
                <StatTile label="Disk (alloc)" value={fmtBytes(current.maxdisk)} sub="allocated" />
                <StatTile label="Uptime" value={fmtUptime(live?.uptime ?? current.uptime)} />
                <StatTile label="Status" value={current.status} />
              </div>

              {!isRunning ? (
                <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                  VM is stopped — no live metrics. Start it to see charts.
                </div>
              ) : (
                <>
                  {/* Timeframe switch */}
                  <div className="flex items-center gap-1">
                    {TIMEFRAMES.map((tf) => (
                      <button
                        key={tf}
                        onClick={() => setTimeframe(tf)}
                        className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
                          timeframe === tf
                            ? 'bg-primary text-primary-foreground'
                            : 'text-muted-foreground hover:bg-muted'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                    {rrdLoading && <RefreshCw className="ml-1 animate-spin text-muted-foreground" size={14} />}
                  </div>

                  {/* Charts */}
                  <div className="grid gap-3 lg:grid-cols-2">
                    <MetricChart
                      title="CPU usage"
                      times={times}
                      series={cpuSeries}
                      yMax={100}
                      area
                      format={(v) => `${v.toFixed(0)}%`}
                    />
                    <MetricChart
                      title="Memory"
                      times={times}
                      series={memSeries}
                      yMax={memMax}
                      area
                      format={fmtBytes}
                    />
                    <MetricChart
                      title="Network"
                      times={times}
                      series={netSeries}
                      format={fmtBps}
                    />
                    <MetricChart
                      title="Disk I/O"
                      times={times}
                      series={diskSeries}
                      format={fmtBps}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import UnifiedNetworkCard from '../components/UnifiedNetworkCard';
import UptimeChart from '../components/UptimeChart';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Power,
  RefreshCw,
  Server,
  Ticket
} from 'lucide-react';

interface ServerNode {
  id: string;
  name: string;
  location: string;
  status: 'operational' | 'degraded' | 'down';
  cpu: number | null;
  memory: number | null;
  disk: string | null;
  backupStatus: 'successful' | 'failed' | 'N/A';
  history: number[];
}

interface NetworkLink {
  id: string;
  provider: string;
  status: 'operational' | 'degraded' | 'down';
  uptime: number;
  latency: number | null;
  utilization: number | null;
  displayName?: string;
  pollingIp?: string;
  interfaceName?: string;
  transmitUtilization?: number | null;
  receiveUtilization?: number | null;
  siteName?: string;
  portSpeed?: string;
  circuitId?: string;
  linkType?: string;
  alias?: string;
  interfaceType?: string;
  ipAddress?: string;
  administrativeStatus?: string;
  operationalStatus?: string;
  lastStatusChange?: string;
  bandwidthReceiveMbps?: number | null;
  bandwidthTransmitMbps?: number | null;
  configuredSpeedMbps?: number | null;
  currentTrafficReceiveMbps?: number | null;
  currentTrafficTransmitMbps?: number | null;
  packetsPerSecondReceive?: number | null;
  packetsPerSecondTransmit?: number | null;
  averagePacketSizeReceive?: number | null;
  averagePacketSizeTransmit?: number | null;
  realtimeTransmitUtilization?: number | null;
  realtimeReceiveUtilization?: number | null;
  dailyTransmitUtilization?: number | null;
  dailyReceiveUtilization?: number | null;
  history: number[];
}

type SectionStatus = 'ok' | 'stale' | 'error' | 'never';
type SourceStatus = SectionStatus | 'partial';
type VisualTone = 'normal' | 'warning' | 'critical' | 'offline';

interface TicketBreakdown {
  new: number;
  assigned: number;
  inProgress: number;
  pending: number;
}

const HSD_STATUS_COLORS = {
  new: '#4f6bed',
  assigned: '#f0b429',
  inProgress: '#2e7d32',
  pending: '#7b8794'
} as const;

const SPECIAL_QUEUE_WATCH = [
  { label: 'P1', detail: 'Critical incidents' },
  { label: 'P2', detail: 'High-priority incidents' },
  { label: 'ONBOARDING', detail: 'User enablement queue' },
  { label: 'SECURITY', detail: 'Security-related tickets' }
] as const;

interface SectionHealth {
  key: 'nutanix' | 'servers' | 'networks' | 'symphony';
  label: string;
  source: 'nutanix' | 'solarwinds' | 'symphony';
  pollIntervalMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  status: SectionStatus;
}

interface SourceHealth {
  source: 'nutanix' | 'solarwinds' | 'symphony';
  label: string;
  sectionKeys: Array<'nutanix' | 'servers' | 'networks' | 'symphony'>;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  status: SourceStatus;
}

interface DashboardState {
  servers: ServerNode[];
  networks: NetworkLink[];
  nutanix: {
    uptime: string;
    nodesCount: number;
    storageUsage: number;
    historyCpu: number[];
    historyMem: number[];
    physicalMemoryUsage?: number;
    logicalMemoryUsage?: number;
    storageUsedTib?: number;
    storageCapacityTib?: number;
    memoryUsedGib?: number;
    memoryCapacityGib?: number;
  };
  symphony: {
    openIncidents: number;
    openIncidentsBreakdown: TicketBreakdown;
    serviceRequests: number;
    serviceRequestsBreakdown: TicketBreakdown;
    workOrders: number;
    workOrdersBreakdown: TicketBreakdown;
    changeRecords: number;
    changeRecordsBreakdown: TicketBreakdown;
    serviceRequestsSla: number;
    incidentsResponseSla: number;
    incidentsResolutionSla: number;
    requestsResponseSla: number;
    requestsResolutionSla: number;
  };
  sections: {
    nutanix: SectionHealth;
    servers: SectionHealth;
    networks: SectionHealth;
    symphony: SectionHealth;
  };
  sources: {
    nutanix: SourceHealth;
    solarwinds: SourceHealth;
    symphony: SourceHealth;
  };
  lastUpdate: string;
}

function formatSyncTime(timestamp: string | null) {
  if (!timestamp) {
    return 'Never';
  }

  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

function getHealthText(status: SourceStatus | SectionStatus) {
  switch (status) {
    case 'ok': return 'Live';
    case 'partial': return 'Partial';
    case 'stale': return 'Stale';
    case 'error': return 'Error';
    default: return 'Waiting';
  }
}

function getHealthBadgeStyle(status: SourceStatus | SectionStatus) {
  switch (status) {
    case 'ok':
      return { background: '#e8f5e9', color: '#2e7d32' };
    case 'partial':
      return { background: '#fff8e1', color: '#f57f17' };
    case 'stale':
      return { background: '#fff3e0', color: '#ef6c00' };
    case 'error':
      return { background: '#ffebee', color: '#c62828' };
    default:
      return { background: '#eceff1', color: '#546e7a' };
  }
}

function getHealthPulseClass(status: SourceStatus | SectionStatus) {
  switch (status) {
    case 'ok': return 'ok';
    case 'partial':
    case 'stale': return 'warning';
    case 'error': return 'critical';
    default: return '';
  }
}

function getSystemStatusText(data: DashboardState) {
  const statuses = Object.values(data.sources).map((source) => source.status);
  if (statuses.every((status) => status === 'ok')) {
    return 'ALL SOURCES HEALTHY';
  }
  if (statuses.some((status) => status === 'error')) {
    return 'SOURCE FAILURE';
  }
  if (statuses.some((status) => status === 'partial')) {
    return 'PARTIAL SOURCE COVERAGE';
  }
  if (statuses.some((status) => status === 'stale')) {
    return 'STALE DATA';
  }
  return 'WAITING FOR FIRST SYNC';
}

function parsePercentValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  return Number(parseFloat(match[1]).toFixed(2));
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(digits)}%`;
}

function getMetricTone(value: number | null, warning = 75, critical = 90): VisualTone {
  if (value === null) {
    return 'offline';
  }
  if (value >= critical) {
    return 'critical';
  }
  if (value >= warning) {
    return 'warning';
  }
  return 'normal';
}

function getTonePalette(tone: VisualTone) {
  switch (tone) {
    case 'normal':
      return {
        bg: 'rgba(46, 125, 50, 0.10)',
        border: 'rgba(46, 125, 50, 0.22)',
        text: '#1b5e20',
        fill: '#2e7d32',
        soft: 'rgba(46, 125, 50, 0.16)'
      };
    case 'warning':
      return {
        bg: 'rgba(245, 127, 23, 0.10)',
        border: 'rgba(245, 127, 23, 0.22)',
        text: '#b45309',
        fill: '#f57f17',
        soft: 'rgba(245, 127, 23, 0.18)'
      };
    case 'critical':
      return {
        bg: 'rgba(198, 40, 40, 0.10)',
        border: 'rgba(198, 40, 40, 0.22)',
        text: '#b71c1c',
        fill: '#c62828',
        soft: 'rgba(198, 40, 40, 0.18)'
      };
    default:
      return {
        bg: 'rgba(84, 110, 122, 0.10)',
        border: 'rgba(84, 110, 122, 0.22)',
        text: '#455a64',
        fill: '#607d8b',
        soft: 'rgba(84, 110, 122, 0.18)'
      };
  }
}

function getServerVisualState(server: ServerNode) {
  const cpuPct = server.cpu;
  const memoryPct = server.memory;
  const diskPct = parsePercentValue(server.disk);
  const noTelemetry = cpuPct === null && memoryPct === null && diskPct === null;

  let tone: VisualTone = 'normal';
  if (server.status === 'down') {
    tone = noTelemetry ? 'offline' : 'critical';
  } else if (noTelemetry) {
    tone = 'offline';
  } else if (server.backupStatus === 'failed' || [cpuPct, memoryPct, diskPct].some((value) => value !== null && value >= 90)) {
    tone = 'critical';
  } else if (server.status === 'degraded' || [cpuPct, memoryPct, diskPct].some((value) => value !== null && value >= 75)) {
    tone = 'warning';
  }

  const labelMap: Record<VisualTone, string> = {
    normal: 'Normal',
    warning: 'Warning',
    critical: 'Critical',
    offline: 'Offline'
  };

  return {
    tone,
    label: labelMap[tone],
    cpuPct,
    memoryPct,
    diskPct
  };
}

function formatServerName(name: string) {
  return name.split('.')[0];
}

function isWindowsServerName(name: string) {
  return name.toLowerCase().endsWith('.abgplanet.abg.com');
}

function isHciVm(server: ServerNode) {
  return server.disk !== null || server.backupStatus !== 'N/A';
}

function getServerOsFamily(server: ServerNode) {
  return isWindowsServerName(server.name) ? 'Windows' : 'Linux';
}

function getServerPlatform(server: ServerNode) {
  return isHciVm(server) ? 'HCI VM' : 'On Prem';
}

function getServerGroupKey(server: ServerNode) {
  return `${getServerOsFamily(server)}|${getServerPlatform(server)}`;
}

function sortServersForWallboard(servers: ServerNode[]) {
  const toneRank: Record<VisualTone, number> = { critical: 0, warning: 1, offline: 2, normal: 3 };
  return [...servers].sort((left, right) => {
    const leftTone = getServerVisualState(left).tone;
    const rightTone = getServerVisualState(right).tone;
    if (toneRank[leftTone] !== toneRank[rightTone]) {
      return toneRank[leftTone] - toneRank[rightTone];
    }

    return formatServerName(left.name).localeCompare(formatServerName(right.name));
  });
}

function formatSmallNumber(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)}${suffix}`;
}

function getSlaAccent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '#b0b7bf';
  }
  if (value >= 99.95) {
    return '#84c341';
  }
  if (value >= 95) {
    return '#ff8f00';
  }
  return '#f0b429';
}

function formatHealthErrorSummary(message: string | null) {
  if (!message) {
    return '';
  }

  const normalized = message.replace(/\s+/g, ' ').trim();
  if (/session expired/i.test(normalized)) {
    return 'Session expired';
  }
  if (/timeout/i.test(normalized)) {
    return 'Timeout';
  }
  if (/unreachable|network changed|connection aborted/i.test(normalized)) {
    return 'Source unreachable';
  }

  return normalized.length > 44 ? `${normalized.slice(0, 41)}...` : normalized;
}

function HciHeaderChip({
  label,
  value,
  detail,
  color
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  return (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '10px 12px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.56)',
        border: `1px solid ${color}22`,
        boxShadow: `inset 0 0 0 1px ${color}14`
      }}
    >
      <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color, opacity: 0.84 }}>{label}</span>
      <span style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.05 }}>{value}</span>
      <span style={{ fontSize: '0.7rem', opacity: 0.64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</span>
    </div>
  );
}

function HsdOverviewCard({
  title,
  total,
  breakdown
}: {
  title: string;
  total: number;
  breakdown: TicketBreakdown;
}) {
  const totalSafe = Math.max(0, total);
  const categories = [
    { label: 'NEW', value: breakdown.new, color: HSD_STATUS_COLORS.new },
    { label: 'ASG', value: breakdown.assigned, color: HSD_STATUS_COLORS.assigned },
    { label: 'IP', value: breakdown.inProgress, color: HSD_STATUS_COLORS.inProgress },
    { label: 'PND', value: breakdown.pending, color: HSD_STATUS_COLORS.pending }
  ];
  const peakCategory = Math.max(1, ...categories.map((category) => category.value));
  const activeCount = breakdown.assigned + breakdown.inProgress;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px 14px 12px',
        borderRadius: '18px',
        background: 'rgba(255,255,255,0.66)',
        border: '1px solid rgba(141,110,99,0.12)',
        boxShadow: 'inset 0 4px 0 0 rgba(93,64,55,0.10)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.66 }}>{title}</div>
          <div style={{ fontSize: '2.2rem', fontWeight: 800, lineHeight: 1, marginTop: '8px', color: 'var(--text-primary)' }}>{totalSafe}</div>
        </div>
        <div style={{ display: 'grid', gap: '6px', justifyItems: 'end' }}>
          <div
            style={{
              padding: '6px 9px',
              borderRadius: '999px',
              background: 'rgba(62,39,35,0.06)',
              border: '1px solid rgba(141,110,99,0.14)',
              fontSize: '0.62rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: 'var(--text-primary)'
            }}
          >
            OPEN
          </div>
          <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: HSD_STATUS_COLORS.inProgress }}>
            ACTIVE {activeCount}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: '8px', display: 'flex', overflow: 'hidden', borderRadius: '999px', background: 'rgba(62,39,35,0.08)' }}>
        {categories.map((category) => (
          <div
            key={category.label}
            style={{
              width: totalSafe > 0 ? `${(category.value / totalSafe) * 100}%` : '0%',
              minWidth: category.value > 0 ? '8px' : 0,
              background: category.color
            }}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', alignItems: 'end', minHeight: '88px' }}>
        {categories.map((category) => (
          <div key={category.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: category.color }}>{category.value}</span>
            <div style={{ width: '100%', height: '58px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              <div
                style={{
                  width: '34px',
                  height: category.value > 0 ? `${Math.max(8, (category.value / peakCategory) * 58)}px` : '4px',
                  borderRadius: '10px 10px 4px 4px',
                  background: category.value > 0 ? `linear-gradient(180deg, ${category.color}, ${category.color}cc)` : 'rgba(62,39,35,0.12)',
                  boxShadow: category.value > 0 ? `0 6px 12px ${category.color}26` : 'none'
                }}
              />
            </div>
            <span style={{ fontSize: '0.56rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.58 }}>{category.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniDonutMetric({
  label,
  value,
  accent,
  note = '',
  centerLabel,
  size = 52,
  stroke = 6,
  labelSize = '0.52rem',
  noteSize = '0.56rem',
  noteMinHeight = '10px'
}: {
  label: string;
  value: number | null;
  accent: string;
  note?: string;
  centerLabel?: string;
  size?: number;
  stroke?: number;
  labelSize?: string;
  noteSize?: string;
  noteMinHeight?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '58px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(62,39,35,0.10)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" style={{ fontSize: `${Math.max(9, Math.round(size * 0.19))}px`, fontWeight: 800, fill: accent }}>
          {centerLabel || (value === null ? 'N/A' : `${Math.round(value)}%`)}
        </text>
      </svg>
      <div style={{ fontSize: labelSize, letterSpacing: '0.08em', fontWeight: 800, color: accent }}>{label}</div>
      <div style={{ fontSize: noteSize, opacity: 0.56, minHeight: noteMinHeight }}>{note || '\u00a0'}</div>
    </div>
  );
}

function HsdSlaHeaderCard({
  title,
  response,
  resolution,
  accent,
  aboutToMiss = null
}: {
  title: string;
  response: number;
  resolution: number;
  accent: string;
  aboutToMiss?: number | null;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.56)',
        border: `1px solid ${accent}22`,
        minWidth: 0
      }}
    >
      <div style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', color: accent }}>{title}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <MiniDonutMetric label="RESP" value={response} accent={getSlaAccent(response)} />
        <MiniDonutMetric label="RES" value={resolution} accent={getSlaAccent(resolution)} />
        <MiniDonutMetric
          label="ATM"
          value={aboutToMiss === null ? null : Math.min(100, aboutToMiss)}
          accent={aboutToMiss !== null && aboutToMiss > 0 ? '#c62828' : '#b0b7bf'}
          centerLabel={aboutToMiss === null ? undefined : `${aboutToMiss}`}
          note="About to miss"
        />
      </div>
    </div>
  );
}

function SpecialQueueWatchCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minHeight: 0,
        padding: '12px',
        borderRadius: '16px',
        background: 'linear-gradient(180deg, rgba(62,39,35,0.04), rgba(255,255,255,0.62))',
        border: '1px solid rgba(141,110,99,0.12)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.62 }}>SPECIAL QUEUE WATCH</div>
          <div style={{ fontSize: '0.94rem', fontWeight: 800, marginTop: '4px' }}>P1 / P2 / onboarding / security</div>
        </div>
        <div
          style={{
            padding: '5px 8px',
            borderRadius: '999px',
            background: 'rgba(123,135,148,0.10)',
            border: '1px solid rgba(123,135,148,0.18)',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#52606d'
          }}
        >
          FEED NOT EXPOSED
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', minHeight: 0 }}>
        {SPECIAL_QUEUE_WATCH.map((queue) => (
          <div
            key={queue.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '6px',
              padding: '10px',
              borderRadius: '14px',
              background: 'rgba(255,255,255,0.60)',
              border: '1px solid rgba(141,110,99,0.10)'
            }}
          >
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.62 }}>{queue.label}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: '#607d8b' }}>--</div>
            <div style={{ fontSize: '0.58rem', opacity: 0.62, lineHeight: 1.35 }}>{queue.detail}</div>
            <div style={{ fontSize: '0.56rem', fontWeight: 700, letterSpacing: '0.06em', color: '#607d8b' }}>NOT IN CURRENT SYMPHONY SCRAPE</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerSummaryDonut({
  label,
  count,
  total,
  accent
}: {
  label: string;
  count: number;
  total: number;
  accent: string;
}) {
  const value = total > 0 ? (count / total) * 100 : 0;

  return (
    <MiniDonutMetric
      label={label}
      value={value}
      accent={accent}
      centerLabel={`${count}`}
      note=""
      size={40}
      stroke={5}
      labelSize="0.48rem"
      noteSize="0rem"
      noteMinHeight="0px"
    />
  );
}

function HsdSlaWidget({
  title,
  response,
  resolution,
  accent
}: {
  title: string;
  response: number;
  resolution: number;
  accent: string;
}) {
  const responseAccent = getSlaAccent(response);
  const resolutionAccent = getSlaAccent(resolution);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.56)',
        border: `1px solid ${accent}22`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div style={{ fontSize: '0.76rem', fontWeight: 800, letterSpacing: '0.08em', color: accent }}>{title}</div>
        <div style={{ fontSize: '0.66rem', fontWeight: 700, opacity: 0.56 }}>SLA</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px' }}>
        {[ 
          { label: 'Response', value: response, accent: responseAccent },
          { label: 'Resolution', value: resolution, accent: resolutionAccent }
        ].map((metric) => (
          <div key={metric.label} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '0.66rem', opacity: 0.62 }}>{metric.label}</span>
              <span style={{ fontSize: '1rem', fontWeight: 800, color: metric.accent }}>{formatPercent(metric.value, 2)}</span>
            </div>
            <div style={{ width: '100%', height: '8px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(62,39,35,0.08)' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, metric.value))}%`, height: '100%', background: metric.accent }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompactServerRow({ server }: { server: ServerNode }) {
  const visual = getServerVisualState(server);
  const palette = getTonePalette(visual.tone);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '128px minmax(0, 1fr) 50px',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 8px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.54)',
        border: `1px solid ${palette.border}`
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.74rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={server.name}>
          {formatServerName(server.name)}
        </div>
        <div style={{ fontSize: '0.54rem', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.62, marginTop: '3px' }}>
          {getServerOsFamily(server)} | {getServerPlatform(server)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {[
          { label: 'CPU', value: visual.cpuPct },
          { label: 'RAM', value: visual.memoryPct },
          { label: 'DSK', value: visual.diskPct }
        ].map((metric) => (
          <div key={metric.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '0.5rem', fontWeight: 800, opacity: 0.58 }}>{metric.label}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: getTonePalette(getMetricTone(metric.value)).text }}>
                {formatSmallNumber(metric.value, metric.value === null ? '' : '%')}
              </span>
            </div>
            <div style={{ width: '100%', height: '4px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(62,39,35,0.08)' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, metric.value ?? 0))}%`, height: '100%', background: getTonePalette(getMetricTone(metric.value)).fill }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
        <div style={{ width: '46px', height: '14px' }}>
          <UptimeChart history={server.history || []} color={palette.fill} hideNoDataText />
        </div>
        <span style={{ fontSize: '0.52rem', fontWeight: 700, opacity: 0.62 }}>{server.backupStatus === 'successful' ? 'BKP' : server.backupStatus === 'failed' ? 'FAIL' : 'N/A'}</span>
      </div>
    </div>
  );
}

function ServerSubgroupCard({
  title,
  subtitle,
  servers,
  accent
}: {
  title: string;
  subtitle: string;
  servers: ServerNode[];
  accent: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minHeight: 0,
        padding: '10px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.58)',
        border: `1px solid ${accent}18`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: accent }}>{title}</div>
          <div style={{ fontSize: '0.58rem', opacity: 0.62, marginTop: '2px' }}>{subtitle}</div>
        </div>
        <div style={{ fontSize: '1.08rem', fontWeight: 800, color: accent }}>{servers.length}</div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '6px',
          minHeight: 0,
          overflow: 'auto',
          paddingRight: '2px',
          alignContent: 'start'
        }}
      >
        {servers.length > 0 ? servers.map((server) => <CompactServerRow key={server.id} server={server} />) : (
          <div style={{ padding: '14px 10px', borderRadius: '12px', background: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', opacity: 0.58 }}>
            No servers in this category.
          </div>
        )}
      </div>
    </div>
  );
}

function ServerPlatformCard({
  title,
  subtitle,
  accent,
  windowsServers,
  linuxServers
}: {
  title: string;
  subtitle: string;
  accent: string;
  windowsServers: ServerNode[];
  linuxServers: ServerNode[];
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minHeight: 0,
        padding: '12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.46)',
        border: `1px solid ${accent}18`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '0.08em', color: accent }}>{title}</div>
          <div style={{ fontSize: '0.62rem', opacity: 0.62, marginTop: '3px' }}>{subtitle}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ padding: '5px 8px', borderRadius: '999px', fontSize: '0.64rem', fontWeight: 800, background: 'rgba(21,101,192,0.10)', color: '#1565c0' }}>
            WIN {windowsServers.length}
          </span>
          <span style={{ padding: '5px 8px', borderRadius: '999px', fontSize: '0.64rem', fontWeight: 800, background: 'rgba(46,125,50,0.10)', color: '#2e7d32' }}>
            LNX {linuxServers.length}
          </span>
        </div>
      </div>

      <div className="server-platform-card__content">
        <ServerSubgroupCard title="Windows" subtitle="Windows estate" servers={windowsServers} accent="#1565c0" />
        <ServerSubgroupCard title="Linux" subtitle="Linux estate" servers={linuxServers} accent="#2e7d32" />
      </div>
    </div>
  );
}

function SectionHealthMeta({ health }: { health: SectionHealth }) {
  const badgeStyle = getHealthBadgeStyle(health.status);
  const compactError = formatHealthErrorSummary(health.lastError);
  const lastSync = formatSyncTime(health.lastSuccessAt);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
      <span
        style={{
          ...badgeStyle,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: '999px',
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.05em',
          maxWidth: '280px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
        title={health.lastError || undefined}
      >
        <span className={`pulse-dot ${getHealthPulseClass(health.status)}`} />
        {`DATA LINK ${getHealthText(health.status).toUpperCase()} | ${lastSync}${compactError ? ` | ${compactError}` : ''}`}
      </span>
    </div>
  );
}

function StatusSummaryPill({ label, count, tone }: { label: string; count: number; tone: VisualTone }) {
  const palette = getTonePalette(tone);

  return (
    <div
      className="status-summary-pill"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '7px 10px',
        borderRadius: '12px',
        background: palette.bg,
        border: `1px solid ${palette.border}`
      }}
    >
      <span className="status-summary-pill__label" style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: palette.text }}>
        {label}
      </span>
      <span className="status-summary-pill__value" style={{ fontSize: '1.05rem', fontWeight: 800, color: palette.text }}>
        {count}
      </span>
    </div>
  );
}

function LinearMetricBar({
  label,
  value,
  tone,
  digits = 0
}: {
  label: string;
  value: number | null | undefined;
  tone: VisualTone;
  digits?: number;
}) {
  const palette = getTonePalette(tone);
  const fill = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', opacity: 0.72 }}>{label}</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: palette.text }}>{formatPercent(value, digits)}</span>
      </div>
      <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: 'rgba(62, 39, 35, 0.08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${fill}%`,
            height: '100%',
            borderRadius: '999px',
            background: `linear-gradient(90deg, ${palette.fill}, ${palette.fill}cc)`
          }}
        />
      </div>
    </div>
  );
}

function HsdWorkCard({
  label,
  total,
  breakdown,
  accent
}: {
  label: string;
  total: number;
  breakdown: TicketBreakdown;
  accent: string;
}) {
  const totalSafe = Math.max(0, total);
  const categories = [
    { key: 'new', label: 'NEW', value: breakdown.new, color: '#4f6bed' },
    { key: 'assigned', label: 'ASG', value: breakdown.assigned, color: '#f0b429' },
    { key: 'inProgress', label: 'IP', value: breakdown.inProgress, color: accent },
    { key: 'pending', label: 'PND', value: breakdown.pending, color: '#7b8794' }
  ] as const;

  return (
    <div
      className="hsd-work-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.52)',
        border: '1px solid rgba(141,110,99,0.12)',
        boxShadow: `inset 0 0 0 1px ${accent}20`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.64 }}>{label}</div>
          <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, marginTop: '4px', color: accent }}>{totalSafe}</div>
        </div>
        <div
          style={{
            minWidth: '68px',
            textAlign: 'center',
            padding: '6px 8px',
            borderRadius: '12px',
            background: `${accent}14`,
            border: `1px solid ${accent}28`
          }}
        >
          <div style={{ fontSize: '0.64rem', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.66 }}>ACTIVE</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, marginTop: '2px', color: '#3e2723' }}>
            {breakdown.inProgress + breakdown.assigned}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: '12px', borderRadius: '999px', overflow: 'hidden', display: 'flex', background: 'rgba(62,39,35,0.08)' }}>
        {categories.map((category) => {
          const width = totalSafe > 0 ? `${(category.value / totalSafe) * 100}%` : '0%';
          return (
            <div
              key={category.key}
              style={{
                width,
                minWidth: category.value > 0 ? '8px' : 0,
                background: category.color,
                transition: 'width 0.4s ease'
              }}
            />
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
        {categories.map((category) => (
          <div key={category.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '999px', background: category.color }} />
              <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.64 }}>{category.label}</span>
            </div>
            <span style={{ fontSize: '0.98rem', fontWeight: 800 }}>{category.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HsdStatusTile({
  label,
  count,
  total,
  color
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const share = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;

  return (
    <div
      className="hsd-status-tile"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px',
        borderRadius: '14px',
        background: `${color}10`,
        border: `1px solid ${color}22`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
        <span style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', color }}>
          {label}
        </span>
        <span style={{ fontSize: '1.12rem', fontWeight: 800, color }}>
          {count}
        </span>
      </div>
      <div style={{ width: '100%', height: '9px', borderRadius: '999px', background: 'rgba(62,39,35,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, share))}%`, height: '100%', borderRadius: '999px', background: color }} />
      </div>
      <div style={{ fontSize: '0.66rem', opacity: 0.72 }}>{share.toFixed(1)}% backlog</div>
    </div>
  );
}

function HsdQueueRail({
  label,
  total,
  breakdown,
  accent
}: {
  label: string;
  total: number;
  breakdown: TicketBreakdown;
  accent: string;
}) {
  const totalSafe = Math.max(0, total);
  const categories = [
    { key: 'new', short: 'N', value: breakdown.new, color: '#4f6bed' },
    { key: 'assigned', short: 'A', value: breakdown.assigned, color: '#f0b429' },
    { key: 'inProgress', short: 'IP', value: breakdown.inProgress, color: accent },
    { key: 'pending', short: 'P', value: breakdown.pending, color: '#7b8794' }
  ] as const;

  return (
    <div className="hsd-queue-rail">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.62 }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '1rem', fontWeight: 800, color: accent }}>{totalSafe}</span>
          <span style={{ fontSize: '0.66rem', opacity: 0.62 }}>open</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ width: '100%', height: '10px', borderRadius: '999px', overflow: 'hidden', display: 'flex', background: 'rgba(62,39,35,0.08)' }}>
          {categories.map((category) => {
            const width = totalSafe > 0 ? `${(category.value / totalSafe) * 100}%` : '0%';
            return (
              <div
                key={category.key}
                style={{
                  width,
                  minWidth: category.value > 0 ? '10px' : 0,
                  background: category.color
                }}
              />
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px', flexWrap: 'wrap' }}>
          {categories.map((category) => (
            <div key={category.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.66rem', opacity: 0.74 }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: category.color }} />
              <span style={{ fontWeight: 700 }}>{category.short}</span>
              <span>{category.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '6px',
          padding: '8px',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.5)',
          border: '1px solid rgba(141,110,99,0.12)'
        }}
      >
        {categories.map((category) => (
          <div key={category.key} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58 }}>{category.short}</span>
            <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{category.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerNodeCard({ server }: { server: ServerNode }) {
  const visual = getServerVisualState(server);
  const palette = getTonePalette(visual.tone);
  const statusIcon =
    visual.tone === 'normal' ? <CheckCircle2 size={14} /> :
    visual.tone === 'warning' ? <AlertTriangle size={14} /> :
    visual.tone === 'critical' ? <AlertOctagon size={14} /> :
    <Power size={14} />;

  return (
    <div
      className="server-node-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
        minHeight: '128px',
        padding: '12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.52)',
        border: `1px solid ${palette.border}`,
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '0 auto 0 0',
          width: '5px',
          background: palette.fill
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={server.name}>
            {formatServerName(server.name)}
          </div>
          <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', fontWeight: 700, opacity: 0.58, marginTop: '4px' }}>
            {server.location.toUpperCase()}
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '5px 8px',
            borderRadius: '999px',
            background: palette.bg,
            color: palette.text,
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em'
          }}
        >
          {statusIcon}
          {visual.label}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        <LinearMetricBar label="CPU" value={visual.cpuPct} tone={getMetricTone(visual.cpuPct)} digits={visual.cpuPct !== null && visual.cpuPct < 10 ? 2 : 0} />
        <LinearMetricBar label="RAM" value={visual.memoryPct} tone={getMetricTone(visual.memoryPct)} digits={visual.memoryPct !== null && visual.memoryPct < 10 ? 2 : 0} />
        <LinearMetricBar label="DISK" value={visual.diskPct} tone={getMetricTone(visual.diskPct)} digits={visual.diskPct !== null && visual.diskPct < 10 ? 2 : 0} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: 'auto' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '76px',
            padding: '5px 8px',
            borderRadius: '10px',
            fontSize: '0.66rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            background:
              server.backupStatus === 'successful' ? 'rgba(46,125,50,0.12)' :
              server.backupStatus === 'failed' ? 'rgba(198,40,40,0.12)' :
              'rgba(84,110,122,0.10)',
            color:
              server.backupStatus === 'successful' ? '#1b5e20' :
              server.backupStatus === 'failed' ? '#b71c1c' :
              '#546e7a'
          }}
        >
          {server.backupStatus === 'successful' ? 'BACKUP OK' : server.backupStatus === 'failed' ? 'BACKUP FAIL' : 'NO DATA'}
        </span>
        <div style={{ width: '72px', height: '22px' }}>
          <UptimeChart history={server.history || []} color={palette.fill} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [time, setTime] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const connectWS = () => {
      const apiHost = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const wsUrl = apiHost.replace(/^http/, 'ws');

      console.log(`Connecting to WebSocket gateway at ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to dashboard API gateway');
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'FULL_STATE' || message.type === 'METRIC_UPDATE') {
            setData(message.data);
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      ws.onclose = () => {
        console.log('Disconnected from gateway. Retrying in 5 seconds...');
        setWsConnected(false);
        setTimeout(connectWS, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket encountered error:', err);
        ws.close();
      };
    };

    connectWS();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const getThresholdColor = (pct: number) => {
    if (pct >= 95) return '#c62828';
    if (pct >= 90) return '#ff9100';
    if (pct >= 80) return '#f57f17';
    return '#2e7d32';
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Connecting to NOC Dashboard API Gateway...</p>
      </div>
    );
  }

  const overallSystemStatus = getSystemStatusText(data);
  const serverStates = data.servers.map((server) => getServerVisualState(server));
  const serverSummary = {
    normal: serverStates.filter((state) => state.tone === 'normal').length,
    warning: serverStates.filter((state) => state.tone === 'warning').length,
    critical: serverStates.filter((state) => state.tone === 'critical').length,
    offline: serverStates.filter((state) => state.tone === 'offline').length
  };
  const serverTopologySummary = {
    windows: data.servers.filter((server) => getServerOsFamily(server) === 'Windows').length,
    linux: data.servers.filter((server) => getServerOsFamily(server) === 'Linux').length,
    hciVm: data.servers.filter((server) => getServerPlatform(server) === 'HCI VM').length,
    onPrem: data.servers.filter((server) => getServerPlatform(server) === 'On Prem').length
  };
  const groupedServers = {
    windowsHci: sortServersForWallboard(data.servers.filter((server) => getServerGroupKey(server) === 'Windows|HCI VM')),
    windowsOnPrem: sortServersForWallboard(data.servers.filter((server) => getServerGroupKey(server) === 'Windows|On Prem')),
    linuxHci: sortServersForWallboard(data.servers.filter((server) => getServerGroupKey(server) === 'Linux|HCI VM')),
    linuxOnPrem: sortServersForWallboard(data.servers.filter((server) => getServerGroupKey(server) === 'Linux|On Prem'))
  };

  const ticketCards = [
    { label: 'INCIDENTS', total: data.symphony.openIncidents, breakdown: data.symphony.openIncidentsBreakdown },
    { label: 'SERVICE REQUESTS', total: data.symphony.serviceRequests, breakdown: data.symphony.serviceRequestsBreakdown },
    { label: 'WORK ORDERS', total: data.symphony.workOrders, breakdown: data.symphony.workOrdersBreakdown },
    { label: 'CHANGES', total: data.symphony.changeRecords, breakdown: data.symphony.changeRecordsBreakdown }
  ] as const;

  const totalHsdBacklog = ticketCards.reduce((sum, card) => sum + card.total, 0);
  const hsdBreakdownTotals = ticketCards.reduce<TicketBreakdown>((accumulator, card) => ({
    new: accumulator.new + card.breakdown.new,
    assigned: accumulator.assigned + card.breakdown.assigned,
    inProgress: accumulator.inProgress + card.breakdown.inProgress,
    pending: accumulator.pending + card.breakdown.pending
  }), { new: 0, assigned: 0, inProgress: 0, pending: 0 });
  const activeHsdWork = hsdBreakdownTotals.assigned + hsdBreakdownTotals.inProgress;
  const hciCurrentCpu = data.nutanix.historyCpu.length ? data.nutanix.historyCpu[data.nutanix.historyCpu.length - 1] : 0;

  return (
    <div className="dashboard-shell" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '100vh' }}>
      <header className="glass-panel dashboard-header dashboard-header--wall" style={{ display: 'grid', gridTemplateColumns: '280px minmax(0, 1fr) 280px', alignItems: 'center', gap: '14px', padding: '10px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '16px', background: 'linear-gradient(135deg, rgba(141,110,99,0.18), rgba(215,204,200,0.58))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Server size={24} style={{ color: 'var(--text-primary)' }} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: '1.35rem', color: 'var(--text-primary)', fontWeight: 700 }}>UTKAL IT DASHBOARD</h1>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.08em' }}>ENGINEERING WALLBOARD</div>
          </div>
        </div>

        <div className="dashboard-hci-strip">
          <HciHeaderChip label="CLUSTER" value={`${data.nutanix.nodesCount} Nodes`} detail={data.nutanix.uptime || 'Nutanix control plane'} color="#2e7d32" />
          <HciHeaderChip label="CPU" value={formatPercent(hciCurrentCpu, hciCurrentCpu < 10 ? 1 : 0)} detail="Current cluster load" color={getThresholdColor(hciCurrentCpu)} />
          <HciHeaderChip label="MEMORY" value={formatPercent(data.nutanix.logicalMemoryUsage || 0)} detail={`${data.nutanix.memoryUsedGib || 0} / ${data.nutanix.memoryCapacityGib || 0} GiB`} color={getThresholdColor(data.nutanix.logicalMemoryUsage || 0)} />
          <HciHeaderChip label="STORAGE" value={formatPercent(data.nutanix.storageUsage, 0)} detail={`${data.nutanix.storageUsedTib || 0} / ${data.nutanix.storageCapacityTib || 0} TiB`} color={getThresholdColor(data.nutanix.storageUsage)} />
          <HciHeaderChip label="HCI VM" value={`${serverTopologySummary.hciVm}`} detail={`${serverTopologySummary.windows} Windows | ${serverTopologySummary.linux} Linux`} color="#1565c0" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
            <span className={`pulse-dot ${wsConnected ? 'ok' : 'critical'}`} />
            <span style={{ fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em' }}>
              {wsConnected ? 'GATEWAY LIVE' : 'DISCONNECTED'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '18px', background: 'rgba(255,255,255,0.46)', border: '1px solid rgba(141,110,99,0.12)', fontSize: '1.05rem', fontFamily: 'var(--font-headings)', fontWeight: 700, color: 'var(--text-primary)' }}>
            <Clock size={16} style={{ color: 'var(--primary)' }} />
            <span>{time}</span>
          </div>
        </div>
      </header>

      <main className="dashboard-wall-grid">
        <section className="glass-panel dashboard-panel dashboard-panel--hsd" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.9fr) minmax(0, 1.35fr) auto', alignItems: 'start', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '16px',
                  background: 'rgba(21,101,192,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto'
                }}
              >
                <Ticket size={20} style={{ color: '#1565c0' }} />
              </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.1rem' }}>Hindalco Service Desk</h2>
                  <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>LIVE HSD BACKLOG</div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                    <span style={{ padding: '5px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, background: 'rgba(21,101,192,0.10)', color: '#1565c0' }}>
                      OPEN {totalHsdBacklog}
                    </span>
                  <span style={{ padding: '5px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, background: 'rgba(245,127,23,0.10)', color: '#b45309' }}>
                    ACTIVE {activeHsdWork}
                  </span>
                  <span style={{ padding: '5px 8px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800, background: 'rgba(123,135,148,0.10)', color: '#52606d' }}>
                    PENDING {hsdBreakdownTotals.pending}
                  </span>
                </div>
              </div>
            </div>
            <div className="hsd-header-sla-grid">
              <HsdSlaHeaderCard
                title="INCIDENT SLA"
                response={data.symphony.incidentsResponseSla}
                resolution={data.symphony.incidentsResolutionSla}
                accent="#c62828"
              />
              <HsdSlaHeaderCard
                title="SERVICE REQUEST SLA"
                response={data.symphony.requestsResponseSla}
                resolution={data.symphony.requestsResolutionSla}
                accent="#1565c0"
              />
            </div>
            <SectionHealthMeta health={data.sections.symphony} />
          </div>

          <div className="hsd-modern-grid">
            {ticketCards.map((card) => (
              <HsdOverviewCard
                key={card.label}
                title={card.label}
                total={card.total}
                breakdown={card.breakdown}
              />
            ))}
          </div>

          <SpecialQueueWatchCard />
        </section>

        <UnifiedNetworkCard links={data.networks} sectionHealth={data.sections.networks} />

        <section className="glass-panel dashboard-panel dashboard-panel--servers" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 0.9fr) minmax(0, 1fr) auto', alignItems: 'start', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '16px',
                  background: 'rgba(141,110,99,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: '0 0 auto'
                }}
              >
                <Layers size={20} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: '1.1rem' }}>Server Fleet</h2>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>HCI VM / ON PREM | WINDOWS / LINUX</div>
                <div style={{ fontSize: '0.72rem', opacity: 0.72, marginTop: '6px' }}>
                  {serverTopologySummary.windows} Windows | {serverTopologySummary.linux} Linux | {serverTopologySummary.hciVm} HCI VM | {serverTopologySummary.onPrem} On Prem
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
              <ServerSummaryDonut label="NORMAL" count={serverSummary.normal} total={data.servers.length} accent={getTonePalette('normal').fill} />
              <ServerSummaryDonut label="WARNING" count={serverSummary.warning} total={data.servers.length} accent={getTonePalette('warning').fill} />
              <ServerSummaryDonut label="CRITICAL" count={serverSummary.critical} total={data.servers.length} accent={getTonePalette('critical').fill} />
              <ServerSummaryDonut label="OFFLINE" count={serverSummary.offline} total={data.servers.length} accent={getTonePalette('offline').fill} />
            </div>
            <SectionHealthMeta health={data.sections.servers} />
          </div>

          <div className="server-platform-grid">
            <ServerPlatformCard
              title="HCI VM"
              subtitle="Nutanix-backed virtual estate"
              accent="#1565c0"
              windowsServers={groupedServers.windowsHci}
              linuxServers={groupedServers.linuxHci}
            />
            <ServerPlatformCard
              title="ON PREM"
              subtitle="SolarWinds-backed non-HCI estate"
              accent="#8d6e63"
              windowsServers={groupedServers.windowsOnPrem}
              linuxServers={groupedServers.linuxOnPrem}
            />
          </div>
        </section>
      </main>

      <footer className="glass-panel dashboard-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', fontSize: '0.74rem', opacity: 0.8 }}>
        <div>SYSTEM STATUS: {overallSystemStatus}</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {Object.values(data.sources).map((source) => {
            const badgeStyle = getHealthBadgeStyle(source.status);
            return (
              <span
                key={source.source}
                style={{
                  ...badgeStyle,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 8px',
                  borderRadius: '999px',
                  fontWeight: 600
                }}
                title={source.lastError || undefined}
              >
                <span className={`pulse-dot ${getHealthPulseClass(source.status)}`} />
                {source.label}: {getHealthText(source.status)} | {formatSyncTime(source.lastSuccessAt)}
              </span>
            );
          })}
        </div>
      </footer>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import UnifiedNetworkCard from '../components/UnifiedNetworkCard';
import UptimeChart from '../components/UptimeChart';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  Power,
  RefreshCw,
  Server,
  SlidersHorizontal,
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
  sourceOfTruth?: 'nutanix' | 'solarwinds' | null;
  platform?: 'hci-vm' | 'on-prem' | null;
  solarwindsNodeId?: number | null;
  pollingIp?: string | null;
  machineType?: string | null;
  hardwareType?: string | null;
  lastBoot?: string | null;
  availabilityToday?: number | null;
  history: number[];
  effectiveTelemetrySource?: 'nutanix' | 'solarwinds' | null;
  usingFallback?: boolean;
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
interface NutanixNodeHealth {
  name: string;
  status: VisualTone;
}

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

const SERVER_TABLE_COLUMNS = 'minmax(0, 1.95fr) minmax(72px, 0.8fr) minmax(72px, 0.8fr) minmax(72px, 0.8fr) 76px 90px';

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
    nodes: NutanixNodeHealth[];
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
    priority1Incidents: number;
    priority2Incidents: number;
    onboardingRequests: number;
    securityRequests: number;
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

type SectionFilterKey = 'hci' | 'hsd' | 'network' | 'servers';
type ServerStatusFilter = VisualTone;
type ServerPlatformFilter = 'HCI VM' | 'On Prem';
type ServerOsFilter = 'Windows' | 'Linux';
type ServerSourceFilter = 'nutanix' | 'solarwinds' | 'fallback';
type NetworkCarrierFilter = 'Jio' | 'RailTel' | 'Other';
type NetworkPathFilter = 'ISP' | 'SDWAN';
type NetworkStateFilter = 'up' | 'warning' | 'down';
type HsdWorkFilter = 'INCIDENTS' | 'SERVICE REQUESTS' | 'WORK ORDERS' | 'CHANGES';
type HsdQueueFilter = 'P1' | 'P2' | 'ONBOARD' | 'SECURITY';

interface DashboardFilters {
  sections: Record<SectionFilterKey, boolean>;
  serverStatuses: ServerStatusFilter[];
  serverPlatforms: ServerPlatformFilter[];
  serverOs: ServerOsFilter[];
  serverSources: ServerSourceFilter[];
  networkCarriers: NetworkCarrierFilter[];
  networkPaths: NetworkPathFilter[];
  networkStates: NetworkStateFilter[];
  hsdWorkTypes: HsdWorkFilter[];
  hsdQueueTypes: HsdQueueFilter[];
}

const ALL_SERVER_STATUSES: ServerStatusFilter[] = ['normal', 'warning', 'critical', 'offline'];
const ALL_SERVER_PLATFORMS: ServerPlatformFilter[] = ['HCI VM', 'On Prem'];
const ALL_SERVER_OS: ServerOsFilter[] = ['Windows', 'Linux'];
const ALL_SERVER_SOURCES: ServerSourceFilter[] = ['nutanix', 'solarwinds', 'fallback'];
const ALL_NETWORK_CARRIERS: NetworkCarrierFilter[] = ['Jio', 'RailTel', 'Other'];
const ALL_NETWORK_PATHS: NetworkPathFilter[] = ['ISP', 'SDWAN'];
const ALL_NETWORK_STATES: NetworkStateFilter[] = ['up', 'warning', 'down'];
const ALL_HSD_WORK_TYPES: HsdWorkFilter[] = ['INCIDENTS', 'SERVICE REQUESTS', 'WORK ORDERS', 'CHANGES'];
const ALL_HSD_QUEUE_TYPES: HsdQueueFilter[] = ['P1', 'P2', 'ONBOARD', 'SECURITY'];

function createDefaultFilters(): DashboardFilters {
  return {
    sections: {
      hci: true,
      hsd: true,
      network: true,
      servers: true
    },
    serverStatuses: [...ALL_SERVER_STATUSES],
    serverPlatforms: [...ALL_SERVER_PLATFORMS],
    serverOs: [...ALL_SERVER_OS],
    serverSources: [...ALL_SERVER_SOURCES],
    networkCarriers: [...ALL_NETWORK_CARRIERS],
    networkPaths: [...ALL_NETWORK_PATHS],
    networkStates: [...ALL_NETWORK_STATES],
    hsdWorkTypes: [...ALL_HSD_WORK_TYPES],
    hsdQueueTypes: [...ALL_HSD_QUEUE_TYPES]
  };
}

function createIssuesOnlyFilters(): DashboardFilters {
  return {
    sections: {
      hci: true,
      hsd: true,
      network: true,
      servers: true
    },
    serverStatuses: ['warning', 'critical', 'offline'],
    serverPlatforms: [...ALL_SERVER_PLATFORMS],
    serverOs: [...ALL_SERVER_OS],
    serverSources: [...ALL_SERVER_SOURCES],
    networkCarriers: [...ALL_NETWORK_CARRIERS],
    networkPaths: [...ALL_NETWORK_PATHS],
    networkStates: ['warning', 'down'],
    hsdWorkTypes: ['INCIDENTS', 'SERVICE REQUESTS'],
    hsdQueueTypes: ['P1', 'P2', 'ONBOARD', 'SECURITY']
  };
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

function getMetricTone(value: number | null, warning = 80, critical = 90): VisualTone {
  if (value === null) {
    return 'offline';
  }
  if (value > critical) {
    return 'critical';
  }
  if (value >= warning) {
    return 'warning';
  }
  return 'normal';
}

function getAvailabilityTone(value: number | null | undefined): VisualTone {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'offline';
  }
  if (value < 95) {
    return 'critical';
  }
  if (value < 99.95) {
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
  } else if (server.backupStatus === 'failed' || [cpuPct, memoryPct, diskPct].some((value) => value !== null && value > 90)) {
    tone = 'critical';
  } else if (server.status === 'degraded' || [cpuPct, memoryPct, diskPct].some((value) => value !== null && value >= 80)) {
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

function formatServerBootLabel(lastBoot?: string | null) {
  if (!lastBoot) {
    return null;
  }

  const match = lastBoot.match(/(\d{1,2})\s+([A-Za-z]+)/);
  if (!match) {
    return null;
  }

  return `BOOT ${match[1]} ${match[2].slice(0, 3).toUpperCase()}`;
}

function getServerHardwareLabel(server: ServerNode) {
  const hardwareType = server.hardwareType?.toLowerCase();
  if (hardwareType?.includes('virtual')) {
    return 'VIRT';
  }
  if (hardwareType?.includes('physical')) {
    return 'PHYS';
  }
  if (server.platform === 'hci-vm') {
    return 'HCI';
  }

  return null;
}

function getServerSourceChip(server: ServerNode) {
  if (server.usingFallback && server.effectiveTelemetrySource === 'solarwinds') {
    return {
      label: 'SW45 FB',
      color: '#ef6c00',
      background: 'rgba(239,108,0,0.12)',
      border: 'rgba(239,108,0,0.18)'
    };
  }

  if (server.sourceOfTruth === 'nutanix') {
    return {
      label: 'NX',
      color: '#1565c0',
      background: 'rgba(21,101,192,0.10)',
      border: 'rgba(21,101,192,0.18)'
    };
  }

  return {
    label: 'SW45',
    color: '#8d6e63',
    background: 'rgba(141,110,99,0.10)',
    border: 'rgba(141,110,99,0.18)'
  };
}

function getServerProtectionChip(server: ServerNode) {
  if (server.backupStatus === 'successful') {
    return {
      label: 'PD OK',
      accent: '#1b5e20',
      background: 'rgba(46,125,50,0.12)',
      border: 'rgba(46,125,50,0.18)'
    };
  }

  if (server.backupStatus === 'failed') {
    return {
      label: 'PD FAIL',
      accent: '#b71c1c',
      background: 'rgba(198,40,40,0.12)',
      border: 'rgba(198,40,40,0.18)'
    };
  }

  if (server.sourceOfTruth === 'nutanix' || server.platform === 'hci-vm') {
    return {
      label: 'NO PD',
      accent: '#ef6c00',
      background: 'rgba(239,108,0,0.12)',
      border: 'rgba(239,108,0,0.18)'
    };
  }

  return {
    label: 'SW45',
    accent: '#8d6e63',
    background: 'rgba(141,110,99,0.10)',
    border: 'rgba(141,110,99,0.16)'
  };
}

function isWindowsServerName(name: string) {
  return name.toLowerCase().endsWith('.abgplanet.abg.com');
}

function isHciVm(server: ServerNode) {
  if (server.platform === 'hci-vm' || server.sourceOfTruth === 'nutanix') {
    return true;
  }
  if (server.platform === 'on-prem' || server.sourceOfTruth === 'solarwinds') {
    return false;
  }

  return false;
}

function getServerOsFamily(server: ServerNode) {
  const machineType = server.machineType?.toLowerCase();
  if (machineType?.includes('windows')) {
    return 'Windows';
  }
  if (machineType?.includes('linux')) {
    return 'Linux';
  }

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

function toggleArraySelection<T extends string>(values: T[], value: T, allValues: readonly T[]) {
  const next = values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];

  if (next.length === 0) {
    return [...allValues];
  }

  return next;
}

function getServerSourceFilter(server: ServerNode): ServerSourceFilter {
  if (server.usingFallback && server.effectiveTelemetrySource === 'solarwinds') {
    return 'fallback';
  }

  return server.sourceOfTruth === 'nutanix' ? 'nutanix' : 'solarwinds';
}

function getNetworkCarrierFilter(link: NetworkLink): NetworkCarrierFilter {
  const haystack = `${link.provider} ${link.alias || ''} ${link.interfaceName || ''} ${link.displayName || ''}`.toLowerCase();
  if (haystack.includes('jio') || haystack.includes('rjio')) {
    return 'Jio';
  }
  if (haystack.includes('railtel')) {
    return 'RailTel';
  }

  return 'Other';
}

function getNetworkPathFilter(link: NetworkLink): NetworkPathFilter {
  const haystack = `${link.provider} ${link.interfaceName || ''} ${link.linkType || ''}`.toLowerCase();
  if (haystack.includes('sdwan') || haystack.includes('wan0') || haystack.includes('wan1')) {
    return 'SDWAN';
  }

  return 'ISP';
}

function getNetworkStateFilter(link: NetworkLink): NetworkStateFilter {
  const operationalState = (link.operationalStatus || '').toLowerCase();
  const administrativeState = (link.administrativeStatus || '').toLowerCase();

  if (link.status === 'down' || operationalState.includes('down')) {
    return 'down';
  }
  if (link.status === 'degraded' || administrativeState.includes('down')) {
    return 'warning';
  }

  return 'up';
}

function countActiveFilters(filters: DashboardFilters) {
  let count = 0;

  count += Object.values(filters.sections).filter((visible) => !visible).length;
  if (filters.serverStatuses.length !== ALL_SERVER_STATUSES.length) count += 1;
  if (filters.serverPlatforms.length !== ALL_SERVER_PLATFORMS.length) count += 1;
  if (filters.serverOs.length !== ALL_SERVER_OS.length) count += 1;
  if (filters.serverSources.length !== ALL_SERVER_SOURCES.length) count += 1;
  if (filters.networkCarriers.length !== ALL_NETWORK_CARRIERS.length) count += 1;
  if (filters.networkPaths.length !== ALL_NETWORK_PATHS.length) count += 1;
  if (filters.networkStates.length !== ALL_NETWORK_STATES.length) count += 1;
  if (filters.hsdWorkTypes.length !== ALL_HSD_WORK_TYPES.length) count += 1;
  if (filters.hsdQueueTypes.length !== ALL_HSD_QUEUE_TYPES.length) count += 1;

  return count;
}

function HciHeaderChip({
  label,
  value,
  detail,
  color,
  barValue = null,
  barTone = null,
  extra = null
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
  barValue?: number | null;
  barTone?: VisualTone | null;
  extra?: React.ReactNode;
}) {
  const palette = barTone ? getTonePalette(barTone) : null;
  const accent = palette?.fill || color;
  const trackFill = barValue === null || Number.isNaN(barValue) ? 0 : Math.max(0, Math.min(100, barValue));

  return (
    <div
      style={{
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        padding: '10px 12px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.56)',
        border: `1px solid ${accent}22`,
        boxShadow: `inset 0 0 0 1px ${accent}14`
      }}
    >
      <span style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: accent, opacity: 0.84 }}>{label}</span>
      {value ? <span style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.05 }}>{value}</span> : null}
      {detail ? (
        <span style={{ fontSize: '0.7rem', opacity: 0.64, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</span>
      ) : null}
      {extra ? <div style={{ width: '100%' }}>{extra}</div> : null}
      {barTone ? (
        <div style={{ width: '100%', height: '5px', borderRadius: '999px', overflow: 'hidden', background: palette?.bg || 'rgba(62,39,35,0.08)' }}>
          <div style={{ width: `${trackFill}%`, height: '100%', borderRadius: '999px', background: accent }} />
        </div>
      ) : null}
    </div>
  );
}

function HciNodeMarkers({ nodes }: { nodes: NutanixNodeHealth[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, nodes.length)}, minmax(0, 1fr))`, gap: '6px', width: '100%' }}>
      {nodes.map((node, index) => {
        const palette = getTonePalette(node.status);
        const statusLabel = node.status === 'normal'
          ? 'Normal'
          : node.status === 'warning'
            ? 'Warning'
            : node.status === 'critical'
              ? 'Critical'
              : 'Offline';

        return (
          <div
            key={node.name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              minHeight: '46px',
              padding: '5px 4px',
              borderRadius: '10px',
              background: palette.bg,
              border: `1px solid ${palette.border}`,
              boxSizing: 'border-box'
            }}
            title={`${node.name} | ${statusLabel}`}
          >
            <div
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.66)',
                border: `1px solid ${palette.border}`
              }}
            >
              <Server size={12} style={{ color: palette.fill }} />
            </div>
            <span style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.06em', color: palette.text, lineHeight: 1.1, textAlign: 'center' }}>
              {`N${index + 1}: ${statusLabel}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function HsdOverviewCard({
  title,
  total,
  breakdown,
  labels
}: {
  title: string;
  total: number;
  breakdown: TicketBreakdown;
  labels?: Partial<Record<keyof TicketBreakdown, string>>;
}) {
  const totalSafe = Math.max(0, total);
  const categories = [
    { label: labels?.new ?? 'NEW', value: breakdown.new, color: HSD_STATUS_COLORS.new },
    { label: labels?.assigned ?? 'ASG', value: breakdown.assigned, color: HSD_STATUS_COLORS.assigned },
    { label: labels?.inProgress ?? 'IP', value: breakdown.inProgress, color: HSD_STATUS_COLORS.inProgress },
    { label: labels?.pending ?? 'PND', value: breakdown.pending, color: HSD_STATUS_COLORS.pending }
  ].filter((category) => category.label);
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
        justifyContent: 'space-between',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.56)',
        border: `1px solid ${accent}22`,
        minWidth: 0,
        height: '100%',
        boxSizing: 'border-box'
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

function SpecialQueueWatchCard({
  queues
}: {
  queues: Array<{ label: string; detail: string; value: number; accent: string; background: string; border: string }>;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        gap: '8px',
        minHeight: 0,
        padding: '10px 12px',
        borderRadius: '16px',
        background: 'linear-gradient(180deg, rgba(62,39,35,0.04), rgba(255,255,255,0.62))',
        border: '1px solid rgba(141,110,99,0.12)',
        height: '100%',
        boxSizing: 'border-box'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.62 }}>SPECIAL QUEUE WATCH</div>
        <div
          style={{
            padding: '5px 8px',
            borderRadius: '999px',
            background: 'rgba(21,101,192,0.08)',
            border: '1px solid rgba(21,101,192,0.14)',
            fontSize: '0.62rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: '#1565c0'
          }}
        >
          LIVE QUEUE COUNTS
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', minHeight: 0, flex: '1 1 auto' }}>
        {queues.map((queue) => (
          <div
            key={queue.label}
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '4px',
              padding: '10px',
              borderRadius: '14px',
              background: queue.background,
              border: `1px solid ${queue.border}`,
              minHeight: '84px'
            }}
          >
            <div style={{ fontSize: '0.6rem', letterSpacing: '0.08em', fontWeight: 800, color: queue.accent }}>{queue.label}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: queue.accent }}>{queue.value}</div>
            <div style={{ fontSize: '0.58rem', opacity: 0.62, lineHeight: 1.35 }}>{queue.detail}</div>
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

function CompactMetaPill({
  label,
  color,
  background,
  border
}: {
  label: string;
  color: string;
  background: string;
  border: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '3px 6px',
        borderRadius: '999px',
        fontSize: '0.5rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        color,
        background,
        border: `1px solid ${border}`
      }}
    >
      {label}
    </span>
  );
}

function FleetSummaryChip({
  label,
  value,
  accent,
  background,
  border
}: {
  label: string;
  value: number;
  accent: string;
  background: string;
  border: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        minWidth: 0,
        padding: '5px 8px',
        borderRadius: '12px',
        background,
        border: `1px solid ${border}`
      }}
    >
      <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em', color: accent, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: accent, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

function ServerTableHeaderCell({ label, align = 'left' }: { label: string; align?: 'left' | 'center' | 'right' }) {
  return (
    <div
      style={{
        fontSize: '0.56rem',
        fontWeight: 800,
        letterSpacing: '0.1em',
        opacity: 0.56,
        textAlign: align
      }}
    >
      {label}
    </div>
  );
}

function ServerTableMetricBar({
  value,
  tone
}: {
  value: number | null;
  tone: VisualTone;
}) {
  const palette = getTonePalette(tone);
  const fill = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: palette.text, lineHeight: 1, textAlign: 'center' }}>
        {value === null ? 'N/A' : `${formatSmallNumber(value)}%`}
      </div>
      <div style={{ width: '100%', height: '5px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(62,39,35,0.08)' }}>
        <div style={{ width: `${fill}%`, height: '100%', borderRadius: '999px', background: palette.fill }} />
      </div>
    </div>
  );
}

function ServerFleetTableRow({ server }: { server: ServerNode }) {
  const visual = getServerVisualState(server);
  const palette = getTonePalette(visual.tone);
  const sourceChip = getServerSourceChip(server);
  const categoryPalette = getServerCategoryPalette(server);
  const protectionChip = getServerProtectionChip(server);
  const bootLabel = formatServerBootLabel(server.lastBoot)?.replace('BOOT ', '');
  const tertiaryMetric = server.disk !== null
    ? { value: visual.diskPct, tone: getMetricTone(visual.diskPct), label: 'DSK' }
    : { value: server.availabilityToday ?? null, tone: getAvailabilityTone(server.availabilityToday), label: 'AVL' };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: SERVER_TABLE_COLUMNS,
        alignItems: 'center',
        gap: '10px',
        padding: '5px 8px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.52)',
        border: `1px solid ${palette.border}`,
        boxShadow: `inset 4px 0 0 ${palette.fill}`
      }}
    >
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={server.name}>
            {formatServerName(server.name)}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          <CompactMetaPill label={categoryPalette.label} color={categoryPalette.accent} background={categoryPalette.background} border={categoryPalette.border} />
          <CompactMetaPill label={sourceChip.label} color={sourceChip.color} background={sourceChip.background} border={sourceChip.border} />
          {bootLabel ? (
            <CompactMetaPill label={bootLabel} color="#6d4c41" background="rgba(109,76,65,0.08)" border="rgba(109,76,65,0.14)" />
          ) : null}
        </div>
      </div>

      <ServerTableMetricBar value={visual.cpuPct} tone={getMetricTone(visual.cpuPct)} />
      <ServerTableMetricBar value={visual.memoryPct} tone={getMetricTone(visual.memoryPct)} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
        <div style={{ fontSize: '0.44rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.56, textAlign: 'center' }}>
          {tertiaryMetric.label}
        </div>
        <ServerTableMetricBar value={tertiaryMetric.value} tone={tertiaryMetric.tone} />
      </div>

      <div style={{ width: '100%', height: '18px' }}>
        <UptimeChart history={server.history || []} color={palette.fill} hideNoDataText />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'stretch' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3px 5px',
            borderRadius: '999px',
            background: palette.bg,
            border: `1px solid ${palette.border}`,
            fontSize: '0.46rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: palette.text
          }}
        >
          {visual.label.toUpperCase()}
        </span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3px 5px',
            borderRadius: '999px',
            background: protectionChip.background,
            border: `1px solid ${protectionChip.border}`,
            fontSize: '0.46rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: protectionChip.accent
          }}
        >
          {protectionChip.label}
        </span>
      </div>
    </div>
  );
}

function getServerCategoryPalette(server: ServerNode) {
  const platform = getServerPlatform(server);
  const os = getServerOsFamily(server);

  if (platform === 'HCI VM' && os === 'Windows') {
    return {
      label: 'HCI-WIN',
      accent: '#1565c0',
      background: 'rgba(21,101,192,0.08)',
      border: 'rgba(21,101,192,0.18)'
    };
  }

  if (platform === 'HCI VM' && os === 'Linux') {
    return {
      label: 'HCI-LNX',
      accent: '#2e7d32',
      background: 'rgba(46,125,50,0.08)',
      border: 'rgba(46,125,50,0.18)'
    };
  }

  if (platform === 'On Prem' && os === 'Windows') {
    return {
      label: 'ONP-WIN',
      accent: '#ef6c00',
      background: 'rgba(239,108,0,0.08)',
      border: 'rgba(239,108,0,0.18)'
    };
  }

  return {
    label: 'ONP-LNX',
    accent: '#546e7a',
    background: 'rgba(84,110,122,0.08)',
    border: 'rgba(84,110,122,0.18)'
  };
}

function DenseMetricCell({
  label,
  value,
  tone,
  suffix = ''
}: {
  label: string;
  value: number | null;
  tone: VisualTone;
  suffix?: string;
}) {
  const palette = getTonePalette(tone);
  const fill = value === null ? 0 : Math.max(0, Math.min(100, value));

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        minWidth: 0,
        padding: '4px 6px',
        borderRadius: '10px',
        background: palette.bg,
        border: `1px solid ${palette.border}`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '4px' }}>
        <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.62 }}>{label}</span>
        <span style={{ fontSize: '0.62rem', fontWeight: 800, color: palette.text }}>
          {value === null ? 'N/A' : `${formatSmallNumber(value)}${suffix}`}
        </span>
      </div>
      <div style={{ width: '100%', height: '3px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(62,39,35,0.08)' }}>
        <div style={{ width: `${fill}%`, height: '100%', background: palette.fill }} />
      </div>
    </div>
  );
}

function FleetServerTile({ server }: { server: ServerNode }) {
  const visual = getServerVisualState(server);
  const palette = getTonePalette(visual.tone);
  const sourceChip = getServerSourceChip(server);
  const categoryPalette = getServerCategoryPalette(server);
  const protectionChip = getServerProtectionChip(server);
  const platformShort = getServerPlatform(server) === 'HCI VM' ? 'HCI' : 'ONP';
  const osShort = getServerOsFamily(server) === 'Windows' ? 'WIN' : 'LNX';
  const bootLabel = formatServerBootLabel(server.lastBoot)?.replace('BOOT ', '');
  const tertiaryMetric = server.disk !== null
    ? { label: 'DSK', value: visual.diskPct, tone: getMetricTone(visual.diskPct), suffix: '%' }
    : { label: 'AVL', value: server.availabilityToday ?? null, tone: getAvailabilityTone(server.availabilityToday), suffix: '%' };

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 58px',
        gap: '8px',
        height: '100%',
        minHeight: '84px',
        padding: '9px 10px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.54)',
        border: `1px solid ${palette.border}`,
        boxShadow: `inset 0 1px 0 0 ${palette.soft}`
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '0 0 auto 0',
          height: '4px',
          background: palette.fill
        }}
      />

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={server.name}>
              {formatServerName(server.name)}
            </div>
          </div>
          <span style={{ fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.08em', color: palette.text, whiteSpace: 'nowrap' }}>
            {visual.label.toUpperCase()}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <CompactMetaPill label={categoryPalette.label} color={categoryPalette.accent} background={categoryPalette.background} border={categoryPalette.border} />
          <CompactMetaPill label={platformShort} color="#455a64" background="rgba(84,110,122,0.10)" border="rgba(84,110,122,0.16)" />
          <CompactMetaPill label={osShort} color={osShort === 'WIN' ? '#1565c0' : '#2e7d32'} background={osShort === 'WIN' ? 'rgba(21,101,192,0.08)' : 'rgba(46,125,50,0.08)'} border={osShort === 'WIN' ? 'rgba(21,101,192,0.16)' : 'rgba(46,125,50,0.16)'} />
          <CompactMetaPill label={sourceChip.label} color={sourceChip.color} background={sourceChip.background} border={sourceChip.border} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' }}>
          <DenseMetricCell label="CPU" value={visual.cpuPct} tone={getMetricTone(visual.cpuPct)} suffix="%" />
          <DenseMetricCell label="RAM" value={visual.memoryPct} tone={getMetricTone(visual.memoryPct)} suffix="%" />
          <DenseMetricCell label={tertiaryMetric.label} value={tertiaryMetric.value} tone={tertiaryMetric.tone} suffix={tertiaryMetric.suffix} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'stretch', minWidth: 0 }}>
        <div style={{ width: '100%', height: '20px' }}>
          <UptimeChart history={server.history || []} color={palette.fill} hideNoDataText />
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3px 4px',
            borderRadius: '10px',
            fontSize: '0.48rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: protectionChip.accent,
            background: protectionChip.background,
            border: `1px solid ${protectionChip.border}`
          }}
        >
          {protectionChip.label}
        </span>
        <span style={{ fontSize: '0.46rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58, textAlign: 'right', whiteSpace: 'nowrap' }}>
          {bootLabel || '--'}
        </span>
      </div>
    </div>
  );
}

function CompactServerRow({ server }: { server: ServerNode }) {
  const visual = getServerVisualState(server);
  const palette = getTonePalette(visual.tone);
  const sourceChip = getServerSourceChip(server);
  const protectionChip = getServerProtectionChip(server);
  const hardwareLabel = getServerHardwareLabel(server);
  const bootLabel = formatServerBootLabel(server.lastBoot);
  const tertiaryMetric = server.disk !== null
    ? { label: 'DSK', value: visual.diskPct, tone: getMetricTone(visual.diskPct) }
    : { label: 'AVL', value: server.availabilityToday ?? null, tone: getAvailabilityTone(server.availabilityToday) };
  const metrics: Array<{ label: string; value: number | null; tone: VisualTone }> = [
    { label: 'CPU', value: visual.cpuPct, tone: getMetricTone(visual.cpuPct) },
    { label: 'RAM', value: visual.memoryPct, tone: getMetricTone(visual.memoryPct) },
    tertiaryMetric
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '148px minmax(0, 1fr) 82px',
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
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '5px' }}>
          <CompactMetaPill label={sourceChip.label} color={sourceChip.color} background={sourceChip.background} border={sourceChip.border} />
          {hardwareLabel ? (
            <CompactMetaPill label={hardwareLabel} color="#546e7a" background="rgba(84,110,122,0.10)" border="rgba(84,110,122,0.18)" />
          ) : null}
          {bootLabel ? (
            <CompactMetaPill label={bootLabel} color="#6d4c41" background="rgba(109,76,65,0.08)" border="rgba(109,76,65,0.14)" />
          ) : null}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
        {metrics.map((metric) => (
          <div key={metric.label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' }}>
              <span style={{ fontSize: '0.5rem', fontWeight: 800, opacity: 0.58 }}>{metric.label}</span>
              <span style={{ fontSize: '0.6rem', fontWeight: 800, color: getTonePalette(metric.tone).text }}>
                {formatSmallNumber(metric.value, metric.value === null ? '' : '%')}
              </span>
            </div>
            <div style={{ width: '100%', height: '4px', borderRadius: '999px', overflow: 'hidden', background: 'rgba(62,39,35,0.08)' }}>
              <div style={{ width: `${Math.max(0, Math.min(100, metric.value ?? 0))}%`, height: '100%', background: getTonePalette(metric.tone).fill }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
        <div style={{ width: '74px', height: '16px' }}>
          <UptimeChart history={server.history || []} color={palette.fill} hideNoDataText />
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: '58px',
            padding: '3px 6px',
            borderRadius: '999px',
            fontSize: '0.5rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: protectionChip.accent,
            background: protectionChip.background,
            border: `1px solid ${protectionChip.border}`
          }}
        >
          {protectionChip.label}
        </span>
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

function FilterChip({
  label,
  active,
  onClick,
  accent = '#8d6e63'
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '34px',
        padding: '8px 10px',
        borderRadius: '999px',
        border: `1px solid ${active ? `${accent}33` : 'rgba(141,110,99,0.14)'}`,
        background: active ? `${accent}18` : 'rgba(255,255,255,0.72)',
        color: active ? accent : 'var(--text-secondary)',
        fontSize: '0.68rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        cursor: 'pointer',
        transition: 'background 0.2s ease, border-color 0.2s ease, color 0.2s ease'
      }}
    >
      {label}
    </button>
  );
}

function FilterGroup({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.1em', opacity: 0.62 }}>{title}</div>
      <div className="dashboard-filter-chip-grid">
        {children}
      </div>
    </div>
  );
}

function EmptyFilterState({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '16px 14px',
        borderRadius: '14px',
        background: 'rgba(255,255,255,0.54)',
        border: '1px dashed rgba(141,110,99,0.18)',
        fontSize: '0.78rem',
        opacity: 0.68
      }}
    >
      {label}
    </div>
  );
}

function FilterPanel({
  open,
  activeCount,
  filters,
  onClose,
  onReset,
  onIssuesOnly,
  onSectionToggle,
  onToggleServerStatus,
  onToggleServerPlatform,
  onToggleServerOs,
  onToggleServerSource,
  onToggleNetworkCarrier,
  onToggleNetworkPath,
  onToggleNetworkState,
  onToggleHsdWorkType,
  onToggleHsdQueueType
}: {
  open: boolean;
  activeCount: number;
  filters: DashboardFilters;
  onClose: () => void;
  onReset: () => void;
  onIssuesOnly: () => void;
  onSectionToggle: (key: SectionFilterKey) => void;
  onToggleServerStatus: (value: ServerStatusFilter) => void;
  onToggleServerPlatform: (value: ServerPlatformFilter) => void;
  onToggleServerOs: (value: ServerOsFilter) => void;
  onToggleServerSource: (value: ServerSourceFilter) => void;
  onToggleNetworkCarrier: (value: NetworkCarrierFilter) => void;
  onToggleNetworkPath: (value: NetworkPathFilter) => void;
  onToggleNetworkState: (value: NetworkStateFilter) => void;
  onToggleHsdWorkType: (value: HsdWorkFilter) => void;
  onToggleHsdQueueType: (value: HsdQueueFilter) => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="dashboard-filter-backdrop" onClick={onClose}>
      <div className="dashboard-filter-panel" onClick={(event) => event.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 800 }}>Filters</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.62, marginTop: '3px' }}>
              {activeCount > 0 ? `${activeCount} active group${activeCount > 1 ? 's' : ''}` : 'Showing all items'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: '36px',
              padding: '8px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(141,110,99,0.16)',
              background: 'rgba(255,255,255,0.72)',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              cursor: 'pointer'
            }}
          >
            DONE
          </button>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onReset}
            style={{
              minHeight: '36px',
              padding: '8px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(141,110,99,0.16)',
              background: 'rgba(255,255,255,0.72)',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              cursor: 'pointer'
            }}
          >
            RESET
          </button>
          <button
            type="button"
            onClick={onIssuesOnly}
            style={{
              minHeight: '36px',
              padding: '8px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(198,40,40,0.18)',
              background: 'rgba(198,40,40,0.10)',
              color: '#b71c1c',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              cursor: 'pointer'
            }}
          >
            ISSUES ONLY
          </button>
        </div>

        <FilterGroup title="SECTIONS">
          <FilterChip label="HCI" active={filters.sections.hci} onClick={() => onSectionToggle('hci')} accent="#2e7d32" />
          <FilterChip label="HSD" active={filters.sections.hsd} onClick={() => onSectionToggle('hsd')} accent="#1565c0" />
          <FilterChip label="NETWORK" active={filters.sections.network} onClick={() => onSectionToggle('network')} accent="#8d6e63" />
          <FilterChip label="SERVERS" active={filters.sections.servers} onClick={() => onSectionToggle('servers')} accent="#5d4037" />
        </FilterGroup>

        <FilterGroup title="SERVER STATUS">
          <FilterChip label="NORMAL" active={filters.serverStatuses.includes('normal')} onClick={() => onToggleServerStatus('normal')} accent="#2e7d32" />
          <FilterChip label="WARNING" active={filters.serverStatuses.includes('warning')} onClick={() => onToggleServerStatus('warning')} accent="#f57f17" />
          <FilterChip label="CRITICAL" active={filters.serverStatuses.includes('critical')} onClick={() => onToggleServerStatus('critical')} accent="#c62828" />
          <FilterChip label="OFFLINE" active={filters.serverStatuses.includes('offline')} onClick={() => onToggleServerStatus('offline')} accent="#607d8b" />
        </FilterGroup>

        <FilterGroup title="SERVER PLATFORM">
          <FilterChip label="HCI VM" active={filters.serverPlatforms.includes('HCI VM')} onClick={() => onToggleServerPlatform('HCI VM')} accent="#1565c0" />
          <FilterChip label="ON PREM" active={filters.serverPlatforms.includes('On Prem')} onClick={() => onToggleServerPlatform('On Prem')} accent="#ef6c00" />
        </FilterGroup>

        <FilterGroup title="SERVER OS">
          <FilterChip label="WINDOWS" active={filters.serverOs.includes('Windows')} onClick={() => onToggleServerOs('Windows')} accent="#1565c0" />
          <FilterChip label="LINUX" active={filters.serverOs.includes('Linux')} onClick={() => onToggleServerOs('Linux')} accent="#2e7d32" />
        </FilterGroup>

        <FilterGroup title="SERVER SOURCE">
          <FilterChip label="NUTANIX" active={filters.serverSources.includes('nutanix')} onClick={() => onToggleServerSource('nutanix')} accent="#1565c0" />
          <FilterChip label="SW45" active={filters.serverSources.includes('solarwinds')} onClick={() => onToggleServerSource('solarwinds')} accent="#8d6e63" />
          <FilterChip label="FALLBACK" active={filters.serverSources.includes('fallback')} onClick={() => onToggleServerSource('fallback')} accent="#ef6c00" />
        </FilterGroup>

        <FilterGroup title="NETWORK CARRIER">
          <FilterChip label="JIO" active={filters.networkCarriers.includes('Jio')} onClick={() => onToggleNetworkCarrier('Jio')} accent="#2e7d32" />
          <FilterChip label="RAILTEL" active={filters.networkCarriers.includes('RailTel')} onClick={() => onToggleNetworkCarrier('RailTel')} accent="#1565c0" />
          <FilterChip label="OTHER" active={filters.networkCarriers.includes('Other')} onClick={() => onToggleNetworkCarrier('Other')} accent="#546e7a" />
        </FilterGroup>

        <FilterGroup title="NETWORK PATH">
          <FilterChip label="ISP" active={filters.networkPaths.includes('ISP')} onClick={() => onToggleNetworkPath('ISP')} accent="#8d6e63" />
          <FilterChip label="SDWAN" active={filters.networkPaths.includes('SDWAN')} onClick={() => onToggleNetworkPath('SDWAN')} accent="#1565c0" />
        </FilterGroup>

        <FilterGroup title="NETWORK STATE">
          <FilterChip label="UP" active={filters.networkStates.includes('up')} onClick={() => onToggleNetworkState('up')} accent="#2e7d32" />
          <FilterChip label="WARNING" active={filters.networkStates.includes('warning')} onClick={() => onToggleNetworkState('warning')} accent="#f57f17" />
          <FilterChip label="DOWN" active={filters.networkStates.includes('down')} onClick={() => onToggleNetworkState('down')} accent="#c62828" />
        </FilterGroup>

        <FilterGroup title="HSD WORK TYPE">
          {ALL_HSD_WORK_TYPES.map((value) => (
            <FilterChip
              key={value}
              label={value}
              active={filters.hsdWorkTypes.includes(value)}
              onClick={() => onToggleHsdWorkType(value)}
              accent={value === 'INCIDENTS' ? '#c62828' : value === 'SERVICE REQUESTS' ? '#1565c0' : value === 'WORK ORDERS' ? '#6d4c41' : '#4f6bed'}
            />
          ))}
        </FilterGroup>

        <FilterGroup title="HSD SPECIAL QUEUES">
          <FilterChip label="P1" active={filters.hsdQueueTypes.includes('P1')} onClick={() => onToggleHsdQueueType('P1')} accent="#c62828" />
          <FilterChip label="P2" active={filters.hsdQueueTypes.includes('P2')} onClick={() => onToggleHsdQueueType('P2')} accent="#ef6c00" />
          <FilterChip label="ONBOARD" active={filters.hsdQueueTypes.includes('ONBOARD')} onClick={() => onToggleHsdQueueType('ONBOARD')} accent="#1565c0" />
          <FilterChip label="SECURITY" active={filters.hsdQueueTypes.includes('SECURITY')} onClick={() => onToggleHsdQueueType('SECURITY')} accent="#455a64" />
        </FilterGroup>
      </div>
    </div>
  );
}

function MobileSectionHealthBadge({ health }: { health: SectionHealth }) {
  const badgeStyle = getHealthBadgeStyle(health.status);

  return (
    <span
      style={{
        ...badgeStyle,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 8px',
        borderRadius: '999px',
        fontSize: '0.58rem',
        fontWeight: 800,
        letterSpacing: '0.05em',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        maxWidth: '100%'
      }}
      title={health.lastError || undefined}
    >
      <span className={`pulse-dot ${getHealthPulseClass(health.status)}`} />
      {`${getHealthText(health.status).toUpperCase()} | ${formatSyncTime(health.lastSuccessAt)}`}
    </span>
  );
}

function MobileSectionHeader({
  icon,
  title,
  subtitle,
  health
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  health: SectionHealth;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', minWidth: 0, flex: '1 1 180px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.62)',
            border: '1px solid rgba(141,110,99,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto'
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.98rem', fontWeight: 800, lineHeight: 1.15 }}>{title}</div>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', opacity: 0.6, marginTop: '3px' }}>{subtitle}</div>
        </div>
      </div>

      <MobileSectionHealthBadge health={health} />
    </div>
  );
}

function formatTrafficMbps(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} Mbps`;
}

function getNetworkPeakValue(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value));
  return valid.length ? Math.max(...valid) : null;
}

function getMobileNetworkTone(link: NetworkLink): VisualTone {
  const operationalState = (link.operationalStatus || '').toLowerCase();
  const administrativeState = (link.administrativeStatus || '').toLowerCase();

  if (link.status === 'down' || operationalState.includes('down')) {
    return 'critical';
  }
  if (link.status === 'degraded' || administrativeState.includes('down')) {
    return 'warning';
  }

  const peakUtilization = getNetworkPeakValue([
    link.realtimeTransmitUtilization,
    link.realtimeReceiveUtilization,
    link.dailyTransmitUtilization,
    link.dailyReceiveUtilization,
    link.transmitUtilization,
    link.receiveUtilization,
    link.utilization
  ]);

  if (peakUtilization !== null && peakUtilization >= 85) {
    return 'critical';
  }
  if (peakUtilization !== null && peakUtilization >= 60) {
    return 'warning';
  }

  return 'normal';
}

function getMobileNetworkStatusLabel(link: NetworkLink) {
  const normalized = (link.operationalStatus || link.status || '').toLowerCase();
  if (normalized.includes('down')) {
    return 'Down';
  }
  if (normalized.includes('warn') || normalized.includes('degrad')) {
    return 'Warning';
  }
  if (normalized.includes('up') || normalized.includes('operational') || normalized.includes('ok')) {
    return 'Up';
  }

  return link.status === 'down' ? 'Down' : link.status === 'degraded' ? 'Warning' : 'Up';
}

function getMobileNetworkLabel(link: NetworkLink) {
  return link.interfaceName || link.alias || link.displayName || link.provider;
}

function MobileNetworkLinkCard({ link }: { link: NetworkLink }) {
  const tone = getMobileNetworkTone(link);
  const palette = getTonePalette(tone);
  const txUtil = link.realtimeTransmitUtilization ?? link.transmitUtilization ?? null;
  const rxUtil = link.realtimeReceiveUtilization ?? link.receiveUtilization ?? null;
  const peakUtil = getNetworkPeakValue([txUtil, rxUtil]);
  const averageUtil = getNetworkPeakValue([link.dailyTransmitUtilization, link.dailyReceiveUtilization]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '12px',
        borderRadius: '16px',
        background: 'rgba(255,255,255,0.60)',
        border: `1px solid ${palette.border}`,
        boxShadow: `inset 0 0 0 1px ${palette.bg}`
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.08em', color: palette.text }}>{link.provider}</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.2, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={getMobileNetworkLabel(link)}>
            {getMobileNetworkLabel(link)}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 8px',
                borderRadius: '999px',
                fontSize: '0.56rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: palette.text,
                background: palette.bg,
                border: `1px solid ${palette.border}`
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: palette.fill }} />
              {(link.alias || link.provider).toUpperCase()} {getMobileNetworkStatusLabel(link).toUpperCase()}
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: '999px',
                fontSize: '0.56rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: 'var(--text-secondary)',
                background: 'rgba(255,255,255,0.76)',
                border: '1px solid rgba(141,110,99,0.12)'
              }}
            >
              {link.portSpeed || (link.configuredSpeedMbps ? `${link.configuredSpeedMbps.toFixed(0)} Mbps` : 'N/A')}
            </span>
          </div>
        </div>

        <div
          style={{
            minWidth: '72px',
            padding: '8px 10px',
            borderRadius: '12px',
            background: palette.bg,
            border: `1px solid ${palette.border}`
          }}
        >
          <div style={{ fontSize: '0.54rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.62 }}>UTIL NOW</div>
          <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.1, color: palette.text, marginTop: '4px' }}>{formatPercent(peakUtil, peakUtil !== null && peakUtil < 10 ? 1 : 0)}</div>
          <div style={{ fontSize: '0.54rem', opacity: 0.64, marginTop: '3px' }}>AVG {formatPercent(averageUtil, averageUtil !== null && averageUtil < 10 ? 1 : 0)}</div>
        </div>
      </div>

      <div className="dashboard-mobile-grid-two" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        <div
          style={{
            padding: '10px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(141,110,99,0.10)'
          }}
        >
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58 }}>TX NOW</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.1, marginTop: '4px' }}>{formatTrafficMbps(link.currentTrafficTransmitMbps)}</div>
          <div style={{ fontSize: '0.62rem', opacity: 0.66, marginTop: '4px' }}>{`${formatPercent(txUtil, 1)} util`}</div>
        </div>
        <div
          style={{
            padding: '10px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.78)',
            border: '1px solid rgba(141,110,99,0.10)'
          }}
        >
          <div style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58 }}>RX NOW</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 800, lineHeight: 1.1, marginTop: '4px' }}>{formatTrafficMbps(link.currentTrafficReceiveMbps)}</div>
          <div style={{ fontSize: '0.62rem', opacity: 0.66, marginTop: '4px' }}>{`${formatPercent(rxUtil, 1)} util`}</div>
        </div>
      </div>

      <div style={{ width: '100%', height: '56px', padding: '4px 0', borderRadius: '12px', background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(141,110,99,0.08)' }}>
        <UptimeChart history={link.history || []} color={palette.fill} threshold={80} fixedDomain={[0, 100]} hideNoDataText />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '0.58rem', opacity: 0.68 }}>
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {link.lastStatusChange ? `Change ${link.lastStatusChange}` : 'No status timestamp'}
        </span>
        <span style={{ whiteSpace: 'nowrap' }}>
          {`TX ${formatPercent(link.dailyTransmitUtilization, 1)} | RX ${formatPercent(link.dailyReceiveUtilization, 1)}`}
        </span>
      </div>
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
  ];

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
  ];

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
  const protectionChip = getServerProtectionChip(server);
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
            background: protectionChip.background,
            color: protectionChip.accent,
            border: `1px solid ${protectionChip.border}`
          }}
        >
          {protectionChip.label}
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<DashboardFilters>(createDefaultFilters);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const dateLabel = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeLabel = now.toLocaleTimeString('en-GB', { hour12: false });
      setTime(`${dateLabel} | ${timeLabel}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const connectWS = () => {
      const configuredApiHost = process.env.NEXT_PUBLIC_API_URL;
      const apiHost = configuredApiHost && !configuredApiHost.includes('localhost')
        ? configuredApiHost
        : `${window.location.protocol}//${window.location.hostname}:4000`;
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

  useEffect(() => {
    if (!filtersOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFiltersOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtersOpen]);

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Connecting to NOC Dashboard API Gateway...</p>
      </div>
    );
  }

  const overallSystemStatus = getSystemStatusText(data);
  const filteredServers = data.servers.filter((server) => {
    const visual = getServerVisualState(server);
    return (
      filters.serverStatuses.includes(visual.tone) &&
      filters.serverPlatforms.includes(getServerPlatform(server)) &&
      filters.serverOs.includes(getServerOsFamily(server)) &&
      filters.serverSources.includes(getServerSourceFilter(server))
    );
  });
  const filteredNetworks = data.networks.filter((link) => (
    filters.networkCarriers.includes(getNetworkCarrierFilter(link)) &&
    filters.networkPaths.includes(getNetworkPathFilter(link)) &&
    filters.networkStates.includes(getNetworkStateFilter(link))
  ));
  const rawTicketCards: Array<{
    label: HsdWorkFilter;
    total: number;
    breakdown: TicketBreakdown;
    labels?: Partial<Record<keyof TicketBreakdown, string>>;
  }> = [
    { label: 'INCIDENTS', total: data.symphony.openIncidents, breakdown: data.symphony.openIncidentsBreakdown },
    { label: 'SERVICE REQUESTS', total: data.symphony.serviceRequests, breakdown: data.symphony.serviceRequestsBreakdown },
    { label: 'WORK ORDERS', total: data.symphony.workOrders, breakdown: data.symphony.workOrdersBreakdown },
    {
      label: 'CHANGES',
      total: data.symphony.changeRecords,
      breakdown: data.symphony.changeRecordsBreakdown,
      labels: { new: 'INT', assigned: 'IMP', inProgress: 'APR', pending: '' }
    }
  ];
  const ticketCards = rawTicketCards.filter((card) => filters.hsdWorkTypes.includes(card.label));
  const specialQueues = [
    {
      label: 'P1' as HsdQueueFilter,
      detail: 'Org Affected',
      value: data.symphony.priority1Incidents,
      accent: '#c62828',
      background: 'rgba(198,40,40,0.08)',
      border: 'rgba(198,40,40,0.18)'
    },
    {
      label: 'P2' as HsdQueueFilter,
      detail: 'Unit Affected',
      value: data.symphony.priority2Incidents,
      accent: '#ef6c00',
      background: 'rgba(239,108,0,0.08)',
      border: 'rgba(239,108,0,0.18)'
    },
    {
      label: 'ONBOARD' as HsdQueueFilter,
      detail: 'SR category contains onboarding',
      value: data.symphony.onboardingRequests,
      accent: '#1565c0',
      background: 'rgba(21,101,192,0.08)',
      border: 'rgba(21,101,192,0.18)'
    },
    {
      label: 'SECURITY' as HsdQueueFilter,
      detail: 'SR category contains security',
      value: data.symphony.securityRequests,
      accent: '#455a64',
      background: 'rgba(69,90,100,0.08)',
      border: 'rgba(69,90,100,0.18)'
    }
  ].filter((queue) => filters.hsdQueueTypes.includes(queue.label));
  const serverStates = filteredServers.map((server) => getServerVisualState(server));
  const serverSummary = {
    normal: serverStates.filter((state) => state.tone === 'normal').length,
    warning: serverStates.filter((state) => state.tone === 'warning').length,
    critical: serverStates.filter((state) => state.tone === 'critical').length,
    offline: serverStates.filter((state) => state.tone === 'offline').length
  };
  const groupedServers = {
    windowsHci: sortServersForWallboard(filteredServers.filter((server) => getServerGroupKey(server) === 'Windows|HCI VM')),
    windowsOnPrem: sortServersForWallboard(filteredServers.filter((server) => getServerGroupKey(server) === 'Windows|On Prem')),
    linuxHci: sortServersForWallboard(filteredServers.filter((server) => getServerGroupKey(server) === 'Linux|HCI VM')),
    linuxOnPrem: sortServersForWallboard(filteredServers.filter((server) => getServerGroupKey(server) === 'Linux|On Prem'))
  };
  const serverFleetOrdered = [
    ...groupedServers.windowsHci,
    ...groupedServers.linuxHci,
    ...groupedServers.windowsOnPrem,
    ...groupedServers.linuxOnPrem
  ];
  const serverSummaryChips = [
    {
      label: 'NORMAL',
      value: serverSummary.normal,
      accent: getTonePalette('normal').text,
      background: getTonePalette('normal').bg,
      border: getTonePalette('normal').border
    },
    {
      label: 'WARNING',
      value: serverSummary.warning,
      accent: getTonePalette('warning').text,
      background: getTonePalette('warning').bg,
      border: getTonePalette('warning').border
    },
    {
      label: 'CRITICAL',
      value: serverSummary.critical,
      accent: getTonePalette('critical').text,
      background: getTonePalette('critical').bg,
      border: getTonePalette('critical').border
    },
    {
      label: 'OFFLINE',
      value: serverSummary.offline,
      accent: getTonePalette('offline').text,
      background: getTonePalette('offline').bg,
      border: getTonePalette('offline').border
    }
  ];
  const hciCurrentCpu = data.nutanix.historyCpu.length ? data.nutanix.historyCpu[data.nutanix.historyCpu.length - 1] : 0;
  const detailedNetworkLinks = filteredNetworks.filter((link) =>
    Boolean(
      link.interfaceName ||
      link.alias ||
      link.currentTrafficTransmitMbps !== undefined ||
      link.currentTrafficReceiveMbps !== undefined ||
      link.realtimeTransmitUtilization !== undefined ||
      link.realtimeReceiveUtilization !== undefined
    )
  );
  const effectiveMobileNetworkLinks = (detailedNetworkLinks.length ? detailedNetworkLinks : filteredNetworks).slice(0, 2);
  const nonNormalServers = serverFleetOrdered.filter((server) => getServerVisualState(server).tone !== 'normal');
  const mobileServerList = (nonNormalServers.length
    ? [...nonNormalServers, ...serverFleetOrdered.filter((server) => getServerVisualState(server).tone === 'normal')]
    : serverFleetOrdered
  ).slice(0, 6);
  const ticketBacklogTotal = Math.max(
    1,
    ticketCards.reduce((sum, card) => sum + card.total, 0)
  );
  const specialQueueTotal = Math.max(1, specialQueues.reduce((sum, queue) => sum + queue.value, 0));
  const activeFilterCount = countActiveFilters(filters);
  const visibleSections = filters.sections;
  const anySectionVisible = Object.values(visibleSections).some(Boolean);
  const hasLeftColumnContent = visibleSections.hci || visibleSections.hsd || visibleSections.network;
  const hasRightColumnContent = visibleSections.servers;

  const toggleSectionVisibility = (key: SectionFilterKey) => {
    setFilters((current) => ({
      ...current,
      sections: {
        ...current.sections,
        [key]: !current.sections[key]
      }
    }));
  };

  const resetFilters = () => setFilters(createDefaultFilters());
  const applyIssuesOnly = () => setFilters(createIssuesOnlyFilters());

  return (
    <>
    <FilterPanel
      open={filtersOpen}
      activeCount={activeFilterCount}
      filters={filters}
      onClose={() => setFiltersOpen(false)}
      onReset={resetFilters}
      onIssuesOnly={applyIssuesOnly}
      onSectionToggle={toggleSectionVisibility}
      onToggleServerStatus={(value) => setFilters((current) => ({ ...current, serverStatuses: toggleArraySelection(current.serverStatuses, value, ALL_SERVER_STATUSES) }))}
      onToggleServerPlatform={(value) => setFilters((current) => ({ ...current, serverPlatforms: toggleArraySelection(current.serverPlatforms, value, ALL_SERVER_PLATFORMS) }))}
      onToggleServerOs={(value) => setFilters((current) => ({ ...current, serverOs: toggleArraySelection(current.serverOs, value, ALL_SERVER_OS) }))}
      onToggleServerSource={(value) => setFilters((current) => ({ ...current, serverSources: toggleArraySelection(current.serverSources, value, ALL_SERVER_SOURCES) }))}
      onToggleNetworkCarrier={(value) => setFilters((current) => ({ ...current, networkCarriers: toggleArraySelection(current.networkCarriers, value, ALL_NETWORK_CARRIERS) }))}
      onToggleNetworkPath={(value) => setFilters((current) => ({ ...current, networkPaths: toggleArraySelection(current.networkPaths, value, ALL_NETWORK_PATHS) }))}
      onToggleNetworkState={(value) => setFilters((current) => ({ ...current, networkStates: toggleArraySelection(current.networkStates, value, ALL_NETWORK_STATES) }))}
      onToggleHsdWorkType={(value) => setFilters((current) => ({ ...current, hsdWorkTypes: toggleArraySelection(current.hsdWorkTypes, value, ALL_HSD_WORK_TYPES) }))}
      onToggleHsdQueueType={(value) => setFilters((current) => ({ ...current, hsdQueueTypes: toggleArraySelection(current.hsdQueueTypes, value, ALL_HSD_QUEUE_TYPES) }))}
    />
    <div className="dashboard-shell dashboard-shell--desktop" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '100vh' }}>
      <header className="glass-panel dashboard-header dashboard-header--wall" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '8px 16px' }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 700, letterSpacing: '0.04em' }}>UTKAL IT DASHBOARD</h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '0 0 auto' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '7px 12px',
              borderRadius: '999px',
              border: '1px solid rgba(141,110,99,0.14)',
              background: activeFilterCount > 0 ? 'rgba(21,101,192,0.10)' : 'rgba(255,255,255,0.52)',
              color: activeFilterCount > 0 ? '#1565c0' : 'var(--text-primary)',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={15} />
            {`FILTERS${activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}`}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '18px', background: 'rgba(255,255,255,0.46)', border: '1px solid rgba(141,110,99,0.12)', fontSize: '1.05rem', fontFamily: 'var(--font-headings)', fontWeight: 700, color: 'var(--text-primary)' }}>
            <Clock size={16} style={{ color: 'var(--primary)' }} />
            <span>{time}</span>
          </div>
        </div>
      </header>

      {anySectionVisible ? (
      <main
        className="dashboard-wall-grid"
        style={
          !hasLeftColumnContent && hasRightColumnContent
            ? { gridTemplateColumns: '1fr', gridTemplateAreas: '"servers"' }
            : hasLeftColumnContent && !hasRightColumnContent
              ? { gridTemplateColumns: '1fr', gridTemplateAreas: '"left"' }
              : undefined
        }
      >
        <div className="dashboard-left-stack">
          {visibleSections.hci ? (
          <section className="glass-panel dashboard-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0, padding: '12px 14px' }}>
            <div className="dashboard-hci-card-grid">
              <div className="dashboard-hci-header">
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '14px',
                    background: 'rgba(46,125,50,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto'
                  }}
                >
                  <Server size={18} style={{ color: '#2e7d32' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ fontSize: '1rem' }}>UAIL HCI</h2>
                  <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>LIVE CLUSTER METRICS</div>
                </div>
              </div>

              <SectionHealthMeta health={data.sections.nutanix} />

              <div className="dashboard-hci-strip" style={{ gridColumn: '1 / -1' }}>
                <HciHeaderChip
                  label="CLUSTER"
                  value=""
                  detail=""
                  color="#2e7d32"
                  extra={data.nutanix.nodes?.length ? <HciNodeMarkers nodes={data.nutanix.nodes.slice(0, data.nutanix.nodesCount || data.nutanix.nodes.length)} /> : null}
                />
                <HciHeaderChip
                  label="CPU"
                  value={formatPercent(hciCurrentCpu, hciCurrentCpu < 10 ? 1 : 0)}
                  detail="Current cluster load"
                  color={getTonePalette(getMetricTone(hciCurrentCpu)).fill}
                  barValue={hciCurrentCpu}
                  barTone={getMetricTone(hciCurrentCpu)}
                />
                <HciHeaderChip
                  label="MEMORY"
                  value={formatPercent(data.nutanix.logicalMemoryUsage || 0)}
                  detail={`${data.nutanix.memoryUsedGib || 0} / ${data.nutanix.memoryCapacityGib || 0} GiB`}
                  color={getTonePalette(getMetricTone(data.nutanix.logicalMemoryUsage || 0)).fill}
                  barValue={data.nutanix.logicalMemoryUsage || 0}
                  barTone={getMetricTone(data.nutanix.logicalMemoryUsage || 0)}
                />
                <HciHeaderChip
                  label="STORAGE"
                  value={formatPercent(data.nutanix.storageUsage, 0)}
                  detail={`${data.nutanix.storageUsedTib || 0} / ${data.nutanix.storageCapacityTib || 0} TiB`}
                  color={getTonePalette(getMetricTone(data.nutanix.storageUsage)).fill}
                  barValue={data.nutanix.storageUsage}
                  barTone={getMetricTone(data.nutanix.storageUsage)}
                />
              </div>
            </div>
          </section>
          ) : null}

          {visibleSections.hsd ? (
          <section className="glass-panel dashboard-panel dashboard-panel--hsd" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, flex: '1.06 1 0' }}>
            <div className="hsd-panel-header">
              <div className="hsd-panel-title">
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
                  <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>hsd.adityabirla.com</div>
                </div>
              </div>
              <SectionHealthMeta health={data.sections.symphony} />
            </div>

            <div className="hsd-modern-grid">
              {ticketCards.length > 0 ? ticketCards.map((card) => (
                <HsdOverviewCard
                  key={card.label}
                  title={card.label}
                  total={card.total}
                  breakdown={card.breakdown}
                  labels={card.labels}
                />
              )) : <EmptyFilterState label="No HSD work cards match the selected filters." />}
            </div>

            <div className="hsd-footer-row">
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
              {specialQueues.length > 0 ? <SpecialQueueWatchCard queues={specialQueues} /> : <EmptyFilterState label="No special queues match the selected filters." />}
            </div>
          </section>
          ) : null}

          {visibleSections.network ? (
            filteredNetworks.length > 0 ? (
              <div style={{ display: 'flex', minHeight: 0, flex: '0.94 1 0' }}>
                <UnifiedNetworkCard links={filteredNetworks} sectionHealth={data.sections.networks} />
              </div>
            ) : (
              <section className="glass-panel dashboard-panel dashboard-panel--network" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '14px', background: 'rgba(141,110,99,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Activity size={20} style={{ color: 'var(--primary)' }} />
                    </div>
                    <div>
                      <h2 style={{ fontSize: '0.98rem', color: 'var(--text-primary)' }}>Network Fabric</h2>
                      <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>REAL-TIME SD-WAN AND CARRIER VIEW</div>
                    </div>
                  </div>
                  <SectionHealthMeta health={data.sections.networks} />
                </div>
                <EmptyFilterState label="No network links match the selected filters." />
              </section>
            )
          ) : null}
        </div>

        {visibleSections.servers ? (
        <section className="glass-panel dashboard-panel dashboard-panel--servers" style={{ display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.72fr) minmax(0, 1.4fr) auto', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '14px',
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
                <h2 style={{ fontSize: '1.1rem' }}>Servers</h2>
                <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>LIVE MONITORING</div>
              </div>
            </div>
            <div className="server-fleet-summary-grid">
              {serverSummaryChips.map((chip) => (
                <FleetSummaryChip
                  key={chip.label}
                  label={chip.label}
                  value={chip.value}
                  accent={chip.accent}
                  background={chip.background}
                  border={chip.border}
                />
              ))}
            </div>
            <SectionHealthMeta health={data.sections.servers} />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: SERVER_TABLE_COLUMNS,
              gap: '10px',
              padding: '0 10px',
              alignItems: 'center'
            }}
          >
            <ServerTableHeaderCell label="SERVER / TAGS" />
            <ServerTableHeaderCell label="CPU" align="center" />
            <ServerTableHeaderCell label="RAM" align="center" />
            <ServerTableHeaderCell label="DSK / AVL" align="center" />
            <ServerTableHeaderCell label="TREND" align="center" />
            <ServerTableHeaderCell label="STATE" align="center" />
          </div>

          <div className="server-table-list">
            {serverFleetOrdered.length > 0 ? serverFleetOrdered.map((server) => (
              <ServerFleetTableRow key={server.id} server={server} />
            )) : <EmptyFilterState label="No servers match the selected filters." />}
          </div>
        </section>
        ) : null}
      </main>
      ) : (
        <div className="glass-panel">
          <EmptyFilterState label="All sections are hidden. Use Filters to show at least one section." />
        </div>
      )}

      <footer className="glass-panel dashboard-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '8px 16px', fontSize: '0.74rem', opacity: 0.8 }}>
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
    <div className="dashboard-mobile-shell">
      <header className="glass-panel dashboard-mobile-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', fontWeight: 800, letterSpacing: '0.04em', textAlign: 'center' }}>UTKAL IT DASHBOARD</h1>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '38px',
              padding: '8px 14px',
              borderRadius: '999px',
              border: '1px solid rgba(141,110,99,0.14)',
              background: activeFilterCount > 0 ? 'rgba(21,101,192,0.10)' : 'rgba(255,255,255,0.52)',
              color: activeFilterCount > 0 ? '#1565c0' : 'var(--text-primary)',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.06em',
              cursor: 'pointer'
            }}
          >
            <SlidersHorizontal size={15} />
            {`FILTERS${activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}`}
          </button>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 12px', borderRadius: '18px', background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,110,99,0.12)', fontSize: '0.94rem', fontFamily: 'var(--font-headings)', fontWeight: 700, color: 'var(--text-primary)' }}>
            <Clock size={15} style={{ color: 'var(--primary)' }} />
            <span>{time}</span>
          </div>
        </div>
      </header>

      <main className="dashboard-mobile-stack">
        {anySectionVisible ? (
          <>
        {visibleSections.hci ? (
        <section className="glass-panel dashboard-mobile-card">
          <MobileSectionHeader icon={<Server size={18} style={{ color: '#2e7d32' }} />} title="UAIL HCI" subtitle="LIVE CLUSTER METRICS" health={data.sections.nutanix} />
          <div className="dashboard-mobile-grid-two" style={{ marginTop: '12px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <HciHeaderChip
                label="CLUSTER"
                value=""
                detail=""
                color="#2e7d32"
                extra={data.nutanix.nodes?.length ? <HciNodeMarkers nodes={data.nutanix.nodes.slice(0, data.nutanix.nodesCount || data.nutanix.nodes.length)} /> : null}
              />
            </div>
            <HciHeaderChip
              label="CPU"
              value={formatPercent(hciCurrentCpu, hciCurrentCpu < 10 ? 1 : 0)}
              detail="Current load"
              color={getTonePalette(getMetricTone(hciCurrentCpu)).fill}
              barValue={hciCurrentCpu}
              barTone={getMetricTone(hciCurrentCpu)}
            />
            <HciHeaderChip
              label="MEMORY"
              value={formatPercent(data.nutanix.logicalMemoryUsage || 0)}
              detail={`${data.nutanix.memoryUsedGib || 0} / ${data.nutanix.memoryCapacityGib || 0} GiB`}
              color={getTonePalette(getMetricTone(data.nutanix.logicalMemoryUsage || 0)).fill}
              barValue={data.nutanix.logicalMemoryUsage || 0}
              barTone={getMetricTone(data.nutanix.logicalMemoryUsage || 0)}
            />
            <div style={{ gridColumn: '1 / -1' }}>
              <HciHeaderChip
                label="STORAGE"
                value={formatPercent(data.nutanix.storageUsage, 0)}
                detail={`${data.nutanix.storageUsedTib || 0} / ${data.nutanix.storageCapacityTib || 0} TiB`}
                color={getTonePalette(getMetricTone(data.nutanix.storageUsage)).fill}
                barValue={data.nutanix.storageUsage}
                barTone={getMetricTone(data.nutanix.storageUsage)}
              />
            </div>
          </div>
        </section>
        ) : null}

        {visibleSections.hsd ? (
        <section className="glass-panel dashboard-mobile-card">
          <MobileSectionHeader icon={<Ticket size={18} style={{ color: '#1565c0' }} />} title="Hindalco Service Desk" subtitle="hsd.adityabirla.com" health={data.sections.symphony} />
          <div className="dashboard-mobile-grid-two" style={{ marginTop: '12px' }}>
            {filters.hsdWorkTypes.includes('INCIDENTS') ? <HsdWorkCard label="INCIDENTS" total={data.symphony.openIncidents} breakdown={data.symphony.openIncidentsBreakdown} accent="#c62828" /> : null}
            {filters.hsdWorkTypes.includes('SERVICE REQUESTS') ? <HsdWorkCard label="SERVICE REQUESTS" total={data.symphony.serviceRequests} breakdown={data.symphony.serviceRequestsBreakdown} accent="#1565c0" /> : null}
            {filters.hsdWorkTypes.includes('WORK ORDERS') ? <HsdStatusTile label="WORK ORDERS" count={data.symphony.workOrders} total={ticketBacklogTotal} color="#6d4c41" /> : null}
            {filters.hsdWorkTypes.includes('CHANGES') ? <HsdStatusTile label="CHANGES" count={data.symphony.changeRecords} total={ticketBacklogTotal} color="#4f6bed" /> : null}
          </div>
          {ticketCards.length === 0 ? <div style={{ marginTop: '12px' }}><EmptyFilterState label="No HSD work cards match the selected filters." /></div> : null}
          <div className="dashboard-mobile-grid-two" style={{ marginTop: '12px' }}>
            <HsdSlaWidget title="INCIDENT SLA" response={data.symphony.incidentsResponseSla} resolution={data.symphony.incidentsResolutionSla} accent="#c62828" />
            <HsdSlaWidget title="SERVICE REQUEST SLA" response={data.symphony.requestsResponseSla} resolution={data.symphony.requestsResolutionSla} accent="#1565c0" />
          </div>
          <div className="dashboard-mobile-grid-two" style={{ marginTop: '12px' }}>
            {specialQueues.map((queue) => (
              <HsdStatusTile key={queue.label} label={queue.label} count={queue.value} total={specialQueueTotal} color={queue.accent} />
            ))}
          </div>
          {specialQueues.length === 0 ? <div style={{ marginTop: '12px' }}><EmptyFilterState label="No special queues match the selected filters." /></div> : null}
        </section>
        ) : null}

        {visibleSections.network ? (
        <section className="glass-panel dashboard-mobile-card">
          <MobileSectionHeader icon={<Activity size={18} style={{ color: 'var(--primary)' }} />} title="Network Fabric" subtitle="REAL-TIME LINK VIEW" health={data.sections.networks} />
          <div className="dashboard-mobile-list" style={{ marginTop: '12px' }}>
            {effectiveMobileNetworkLinks.length > 0 ? effectiveMobileNetworkLinks.map((link) => (
              <MobileNetworkLinkCard key={link.id} link={link} />
            )) : <EmptyFilterState label="No network links match the selected filters." />}
          </div>
        </section>
        ) : null}

        {visibleSections.servers ? (
        <section className="glass-panel dashboard-mobile-card">
          <MobileSectionHeader icon={<Layers size={18} style={{ color: 'var(--primary)' }} />} title="Servers" subtitle="LIVE MONITORING" health={data.sections.servers} />
          <div className="dashboard-mobile-grid-two" style={{ marginTop: '12px' }}>
            <StatusSummaryPill label="Normal" count={serverSummary.normal} tone="normal" />
            <StatusSummaryPill label="Warning" count={serverSummary.warning} tone="warning" />
            <StatusSummaryPill label="Critical" count={serverSummary.critical} tone="critical" />
            <StatusSummaryPill label="Offline" count={serverSummary.offline} tone="offline" />
          </div>
          <div className="dashboard-mobile-list" style={{ marginTop: '12px' }}>
            {mobileServerList.length > 0 ? mobileServerList.map((server) => (
              <ServerNodeCard key={server.id} server={server} />
            )) : <EmptyFilterState label="No servers match the selected filters." />}
          </div>
        </section>
        ) : null}
          </>
        ) : (
          <section className="glass-panel dashboard-mobile-card">
            <EmptyFilterState label="All sections are hidden. Use Filters to show at least one section." />
          </section>
        )}
      </main>

      <footer className="glass-panel dashboard-mobile-footer">
        <div style={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em' }}>SYSTEM STATUS: {overallSystemStatus}</div>
        <div className="dashboard-mobile-source-grid">
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
                  padding: '5px 8px',
                  borderRadius: '999px',
                  fontSize: '0.62rem',
                  fontWeight: 700
                }}
                title={source.lastError || undefined}
              >
                <span className={`pulse-dot ${getHealthPulseClass(source.status)}`} />
                {`${source.label}: ${getHealthText(source.status)} | ${formatSyncTime(source.lastSuccessAt)}`}
              </span>
            );
          })}
        </div>
      </footer>
    </div>
    </>
  );
}

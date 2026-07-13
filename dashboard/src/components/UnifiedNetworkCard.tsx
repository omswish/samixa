'use client';

import React from 'react';
import { Activity, Radio } from 'lucide-react';
import UptimeChart from './UptimeChart';

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

interface SectionHealth {
  key: 'nutanix' | 'servers' | 'networks' | 'symphony';
  label: string;
  source: 'nutanix' | 'solarwinds' | 'symphony';
  pollIntervalMs: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  status: 'ok' | 'stale' | 'error' | 'never';
}

interface UnifiedNetworkCardProps {
  links: NetworkLink[];
  sectionHealth: SectionHealth;
}

type VisualTone = 'normal' | 'warning' | 'critical';

function formatSyncTime(timestamp: string | null) {
  if (!timestamp) {
    return 'Never';
  }

  return new Date(timestamp).toLocaleTimeString('en-US', { hour12: false });
}

function getHealthText(status: SectionHealth['status']) {
  switch (status) {
    case 'ok': return 'Live';
    case 'stale': return 'Stale';
    case 'error': return 'Error';
    default: return 'Waiting';
  }
}

function getHealthBadgeStyle(status: SectionHealth['status']) {
  switch (status) {
    case 'ok':
      return { background: '#e8f5e9', color: '#2e7d32' };
    case 'stale':
      return { background: '#fff3e0', color: '#ef6c00' };
    case 'error':
      return { background: '#ffebee', color: '#c62828' };
    default:
      return { background: '#eceff1', color: '#546e7a' };
  }
}

function getTonePalette(tone: VisualTone) {
  switch (tone) {
    case 'normal':
      return {
        bg: 'rgba(46,125,50,0.10)',
        border: 'rgba(46,125,50,0.22)',
        text: '#1b5e20',
        fill: '#2e7d32'
      };
    case 'warning':
      return {
        bg: 'rgba(245,127,23,0.10)',
        border: 'rgba(245,127,23,0.22)',
        text: '#b45309',
        fill: '#f57f17'
      };
    default:
      return {
        bg: 'rgba(198,40,40,0.10)',
        border: 'rgba(198,40,40,0.22)',
        text: '#b71c1c',
        fill: '#c62828'
      };
  }
}

function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(digits)}%`;
}

function formatUptime(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${value.toFixed(3)}%`;
}

function formatLatency(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'No RTT';
  }

  return `${value} ms`;
}

function formatMbps(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} Mbps`;
}

function formatPps(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(0)} pps`;
}

function formatPacketSize(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(0)} B`;
}

function getUtilizationTone(value: number | null | undefined): VisualTone {
  if (value === null || value === undefined) {
    return 'warning';
  }
  if (value >= 85) {
    return 'critical';
  }
  if (value >= 60) {
    return 'warning';
  }
  return 'normal';
}

function getPeakValue(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value));
  return valid.length ? Math.max(...valid) : null;
}

function getLinkTone(link: NetworkLink): VisualTone {
  const operationalState = (link.operationalStatus || '').toLowerCase();
  const administrativeState = (link.administrativeStatus || '').toLowerCase();

  if (link.status === 'down' || operationalState.includes('down')) {
    return 'critical';
  }
  if (link.status === 'degraded' || administrativeState.includes('down')) {
    return 'warning';
  }

  const peakUtilization = getPeakValue([
    link.realtimeTransmitUtilization,
    link.realtimeReceiveUtilization,
    link.dailyTransmitUtilization,
    link.dailyReceiveUtilization,
    link.transmitUtilization,
    link.receiveUtilization,
    link.utilization
  ]);

  return getUtilizationTone(peakUtilization);
}

function getLinkLabel(link: NetworkLink) {
  return link.interfaceName || link.alias || link.displayName || link.provider;
}

function getSpeedLabel(link: NetworkLink) {
  if (link.portSpeed) {
    return link.portSpeed;
  }
  if (link.configuredSpeedMbps !== null && link.configuredSpeedMbps !== undefined) {
    return `${link.configuredSpeedMbps.toFixed(0)} Mbps`;
  }
  const peakBandwidth = getPeakValue([link.bandwidthReceiveMbps, link.bandwidthTransmitMbps]);
  if (peakBandwidth !== null) {
    return `${peakBandwidth.toFixed(0)} Mbps`;
  }
  return 'N/A';
}

function MetricRow({
  label,
  value,
  fill,
  tone
}: {
  label: string;
  value: string;
  fill: number;
  tone: VisualTone;
}) {
  const palette = getTonePalette(tone);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '0.58rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.62 }}>{label}</span>
        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: palette.text }}>{value}</span>
      </div>
      <div style={{ width: '100%', height: '6px', borderRadius: '999px', background: 'rgba(62,39,35,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(0, Math.min(100, fill))}%`, height: '100%', background: palette.fill, borderRadius: '999px' }} />
      </div>
    </div>
  );
}

function OverviewTile({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: VisualTone;
}) {
  const palette = getTonePalette(tone);

  return (
    <div
      className="network-overview-tile"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '10px 12px',
        borderRadius: '14px',
        background: palette.bg,
        border: `1px solid ${palette.border}`
      }}
    >
      <div style={{ fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.08em', color: palette.text, opacity: 0.78 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, lineHeight: 1, color: palette.text }}>{value}</div>
      <div style={{ fontSize: '0.68rem', opacity: 0.72, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
    </div>
  );
}

function DetailStatTile({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div style={{ padding: '7px 8px', borderRadius: '12px', background: 'rgba(255,255,255,0.52)', border: '1px solid rgba(141,110,99,0.10)' }}>
      <div style={{ fontSize: '0.56rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.58 }}>{label}</div>
      <div style={{ fontSize: '0.88rem', fontWeight: 800, marginTop: '3px' }}>{value}</div>
      <div style={{ fontSize: '0.6rem', opacity: 0.6, marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
    </div>
  );
}

export default function UnifiedNetworkCard({ links, sectionHealth }: UnifiedNetworkCardProps) {
  const healthBadgeStyle = getHealthBadgeStyle(sectionHealth.status);
  const detailedLinks = links.filter((link) =>
    Boolean(
      link.interfaceName ||
      link.alias ||
      link.interfaceType ||
      link.currentTrafficTransmitMbps !== undefined ||
      link.currentTrafficReceiveMbps !== undefined ||
      link.realtimeTransmitUtilization !== undefined ||
      link.realtimeReceiveUtilization !== undefined
    )
  );
  const focusLinks = detailedLinks.length > 0 ? detailedLinks : links;
  const focusIds = new Set(focusLinks.map((link) => link.id));
  const carrierLinks = links.filter((link) => !focusIds.has(link.id));
  const tonedLinks = focusLinks.map((link) => ({ link, tone: getLinkTone(link) }));
  const healthyLinks = tonedLinks.filter((entry) => entry.tone === 'normal').length;
  const peakRealtimeLink = tonedLinks.reduce<{ label: string; value: number } | null>((peak, entry) => {
    const value = getPeakValue([entry.link.realtimeTransmitUtilization, entry.link.realtimeReceiveUtilization]);
    if (value === null) {
      return peak;
    }
    if (!peak || value > peak.value) {
      return { label: getLinkLabel(entry.link), value };
    }
    return peak;
  }, null);
  const peakDailyLink = tonedLinks.reduce<{ label: string; value: number } | null>((peak, entry) => {
    const value = getPeakValue([entry.link.dailyTransmitUtilization, entry.link.dailyReceiveUtilization]);
    if (value === null) {
      return peak;
    }
    if (!peak || value > peak.value) {
      return { label: getLinkLabel(entry.link), value };
    }
    return peak;
  }, null);
  const totalCarrierCapacity = carrierLinks.reduce((sum, link) => {
    const match = link.portSpeed?.match(/(\d+(?:\.\d+)?)/);
    return sum + (match ? parseFloat(match[1]) : 0);
  }, 0);
  const carrierCaption = carrierLinks
    .map((link) => `${link.provider.replace(/\s*\(.*?\)\s*/g, '')} ${link.portSpeed || ''}`.trim())
    .join(' | ');

  return (
    <div className="glass-panel dashboard-panel dashboard-panel--network" style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '14px',
              background: 'rgba(141,110,99,0.14)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Activity size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '1.08rem', color: 'var(--text-primary)' }}>Network Fabric</h2>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>REAL-TIME SD-WAN AND CARRIER VIEW</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <div
            style={{
              ...healthBadgeStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 700
            }}
            title={sectionHealth.lastError || undefined}
          >
            <span className={`pulse-dot ${sectionHealth.status === 'ok' ? 'ok' : sectionHealth.status === 'error' ? 'critical' : 'warning'}`} />
            {getHealthText(sectionHealth.status).toUpperCase()}
          </div>
          <span style={{ fontSize: '0.78rem', opacity: 0.75 }}>Last synced: {formatSyncTime(sectionHealth.lastSuccessAt)}</span>
        </div>
      </div>

      <div className="network-overview-grid">
        <OverviewTile
          label="SD-WAN PATHS"
          value={`${healthyLinks}/${focusLinks.length}`}
          detail={detailedLinks.length > 0 ? 'Interface detail live from Orion' : 'Awaiting interface detail scrape'}
          tone={healthyLinks === focusLinks.length ? 'normal' : healthyLinks > 0 ? 'warning' : 'critical'}
        />
        <OverviewTile
          label="REALTIME PEAK"
          value={peakRealtimeLink ? formatPercent(peakRealtimeLink.value, 1) : 'N/A'}
          detail={peakRealtimeLink ? peakRealtimeLink.label : 'No realtime utilization yet'}
          tone={peakRealtimeLink ? getUtilizationTone(peakRealtimeLink.value) : 'warning'}
        />
        <OverviewTile
          label="DAILY PEAK"
          value={peakDailyLink ? formatPercent(peakDailyLink.value, 1) : 'N/A'}
          detail={peakDailyLink ? peakDailyLink.label : 'No daily averages yet'}
          tone={peakDailyLink ? getUtilizationTone(peakDailyLink.value) : 'warning'}
        />
        <OverviewTile
          label="CARRIER BACKHAUL"
          value={carrierLinks.length ? `${carrierLinks.length}` : '0'}
          detail={carrierLinks.length ? `${totalCarrierCapacity.toFixed(0)} Mbps | ${carrierCaption}` : 'No carrier circuits mapped'}
          tone={carrierLinks.length ? 'normal' : 'warning'}
        />
      </div>

      <div className="network-detail-list">
        {tonedLinks.map(({ link, tone }) => {
          const palette = getTonePalette(tone);
          const realtimePeak = getPeakValue([link.realtimeTransmitUtilization, link.realtimeReceiveUtilization]);
          const dailyPeak = getPeakValue([link.dailyTransmitUtilization, link.dailyReceiveUtilization]);
          const hasTraffic =
            link.currentTrafficTransmitMbps !== null && link.currentTrafficTransmitMbps !== undefined ||
            link.currentTrafficReceiveMbps !== null && link.currentTrafficReceiveMbps !== undefined;
          const trafficTotal = hasTraffic
            ? (link.currentTrafficTransmitMbps ?? 0) + (link.currentTrafficReceiveMbps ?? 0)
            : null;
          const label = getLinkLabel(link);
          const subtitle = [link.alias, link.interfaceType, link.ipAddress].filter(Boolean).join(' | ');
          const secondary = [link.displayName, link.pollingIp].filter(Boolean).join(' | ');

          return (
            <div
              key={link.id}
              className="network-link-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '10px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.5)',
                border: `1px solid ${palette.border}`,
                boxShadow: `inset 0 0 0 1px ${palette.bg}`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.08em', color: palette.text }}>{link.provider}</div>
                  <div
                    style={{
                      fontSize: '0.96rem',
                      fontWeight: 800,
                      lineHeight: 1.2,
                      marginTop: '3px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={label}
                  >
                    {label}
                  </div>
                  {subtitle ? (
                    <div style={{ fontSize: '0.62rem', opacity: 0.66, marginTop: '3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {subtitle}
                    </div>
                  ) : null}
                  {secondary ? (
                    <div style={{ fontSize: '0.6rem', opacity: 0.56, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {secondary}
                    </div>
                  ) : null}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flex: '0 0 auto' }}>
                  <div
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '5px 8px',
                      borderRadius: '999px',
                      background: palette.bg,
                      color: palette.text,
                      fontSize: '0.62rem',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase'
                    }}
                  >
                    <Radio size={12} />
                    {link.operationalStatus || tone}
                  </div>
                  <div style={{ width: '72px', height: '20px' }}>
                    <UptimeChart history={link.history || []} color={palette.fill} />
                  </div>
                </div>
              </div>

              <div className="network-detail-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                <DetailStatTile label="NOW" value={formatPercent(realtimePeak, realtimePeak !== null && realtimePeak < 10 ? 1 : 0)} detail="Peak realtime utilization" />
                <DetailStatTile label="TRAFFIC" value={trafficTotal !== null ? formatMbps(trafficTotal) : formatLatency(link.latency)} detail={trafficTotal !== null ? `${formatMbps(link.currentTrafficTransmitMbps)} TX | ${formatMbps(link.currentTrafficReceiveMbps)} RX` : 'Latency fallback'} />
                <DetailStatTile label="SPEED" value={getSpeedLabel(link)} detail={formatUptime(link.uptime)} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <MetricRow
                  label="TX UTIL"
                  value={`${formatPercent(link.realtimeTransmitUtilization ?? link.transmitUtilization, 1)} now | ${formatPercent(link.dailyTransmitUtilization, 1)} day`}
                  fill={Math.max(link.realtimeTransmitUtilization ?? link.transmitUtilization ?? 0, link.dailyTransmitUtilization ?? 0)}
                  tone={getUtilizationTone(Math.max(link.realtimeTransmitUtilization ?? link.transmitUtilization ?? 0, link.dailyTransmitUtilization ?? 0))}
                />
                <MetricRow
                  label="RX UTIL"
                  value={`${formatPercent(link.realtimeReceiveUtilization ?? link.receiveUtilization, 1)} now | ${formatPercent(link.dailyReceiveUtilization, 1)} day`}
                  fill={Math.max(link.realtimeReceiveUtilization ?? link.receiveUtilization ?? 0, link.dailyReceiveUtilization ?? 0)}
                  tone={getUtilizationTone(Math.max(link.realtimeReceiveUtilization ?? link.receiveUtilization ?? 0, link.dailyReceiveUtilization ?? 0))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '0.6rem', opacity: 0.64 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {link.lastStatusChange ? `Change ${link.lastStatusChange}` : 'No status timestamp'}
                </div>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                  {formatPps(getPeakValue([link.packetsPerSecondTransmit, link.packetsPerSecondReceive]))} | {formatPacketSize(getPeakValue([link.averagePacketSizeTransmit, link.averagePacketSizeReceive]))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

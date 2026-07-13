'use client';

import React from 'react';
import { Activity } from 'lucide-react';
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

  return normalized.length > 36 ? `${normalized.slice(0, 33)}...` : normalized;
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

function formatCompactState(state?: string | null) {
  if (!state) {
    return 'Waiting';
  }

  const normalized = state.toLowerCase();
  if (normalized.includes('up') || normalized.includes('operational') || normalized.includes('ok')) {
    return 'Up';
  }
  if (normalized.includes('down')) {
    return 'Down';
  }
  if (normalized.includes('warn') || normalized.includes('degrad')) {
    return 'Warning';
  }
  return state;
}

function getNetworkLinkState(link?: NetworkLink | null) {
  if (!link) {
    return { label: 'Waiting', tone: 'warning' as VisualTone };
  }

  const operational = (link.operationalStatus || '').toLowerCase();
  const stateLabel = formatCompactState(link.operationalStatus || link.status);
  if (link.status === 'down' || operational.includes('down')) {
    return { label: stateLabel, tone: 'critical' as VisualTone };
  }
  if (link.status === 'degraded') {
    return { label: stateLabel, tone: 'warning' as VisualTone };
  }
  return { label: stateLabel, tone: 'normal' as VisualTone };
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function buildUtilizationSeries(
  history: number[],
  dailyValue: number | null | undefined,
  realtimeValue: number | null | undefined
) {
  const trend = (history || [])
    .filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value))
    .slice(-6)
    .map(clampPercent);

  if (dailyValue !== null && dailyValue !== undefined && !Number.isNaN(dailyValue)) {
    trend.push(clampPercent(dailyValue));
  }

  if (realtimeValue !== null && realtimeValue !== undefined && !Number.isNaN(realtimeValue)) {
    trend.push(clampPercent(realtimeValue));
  }

  if (trend.length === 1) {
    trend.push(trend[0]);
  }

  return trend;
}

function getAdaptiveChartScale(values: Array<number | null | undefined>) {
  const valid = values.filter((value): value is number => value !== null && value !== undefined && !Number.isNaN(value));
  const peak = valid.length ? Math.max(...valid) : 0;

  if (peak <= 8) {
    return { upper: 20, ticks: [0, 5, 10, 15, 20] };
  }
  if (peak <= 18) {
    return { upper: 30, ticks: [0, 10, 20, 30] };
  }
  if (peak <= 30) {
    return { upper: 40, ticks: [0, 10, 20, 30, 40] };
  }
  if (peak <= 45) {
    return { upper: 60, ticks: [0, 20, 40, 60] };
  }

  return { upper: 100, ticks: [0, 20, 40, 60, 80, 100] };
}

function CombinedUtilizationSparklineRow({
  txHistory,
  rxHistory,
  txRealtimeValue,
  rxRealtimeValue,
  txDailyValue,
  rxDailyValue,
  tone
}: {
  txHistory: number[];
  rxHistory: number[];
  txRealtimeValue: number | null | undefined;
  rxRealtimeValue: number | null | undefined;
  txDailyValue: number | null | undefined;
  rxDailyValue: number | null | undefined;
  tone: VisualTone;
}) {
  const palette = getTonePalette(tone);
  const txTrend = buildUtilizationSeries(txHistory, txDailyValue, txRealtimeValue);
  const rxTrend = buildUtilizationSeries(rxHistory, rxDailyValue, rxRealtimeValue);
  const adaptiveScale = getAdaptiveChartScale([
    ...txTrend,
    ...rxTrend,
    txRealtimeValue,
    rxRealtimeValue,
    txDailyValue,
    rxDailyValue
  ]);
  const isZoomedScale = adaptiveScale.upper < 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span style={{ fontSize: '0.56rem', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.62 }}>TX / RX UTIL</span>
          {isZoomedScale ? (
            <span
              style={{
                padding: '2px 6px',
                borderRadius: '999px',
                background: 'rgba(22,151,246,0.10)',
                border: '1px solid rgba(22,151,246,0.18)',
                fontSize: '0.48rem',
                fontWeight: 800,
                letterSpacing: '0.08em',
                color: '#0d6fb8'
              }}
            >
              SCALE 0-{adaptiveScale.upper}
            </span>
          ) : null}
          <span
            style={{
              padding: '2px 6px',
              borderRadius: '999px',
              background: 'rgba(198,40,40,0.10)',
              border: '1px solid rgba(198,40,40,0.18)',
              fontSize: '0.48rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#b71c1c'
            }}
          >
            ALERT 80
          </span>
        </span>
        <span style={{ fontSize: '0.66rem', fontWeight: 800, color: palette.text }}>
          {`TX ${formatPercent(txRealtimeValue, 1)} | RX ${formatPercent(rxRealtimeValue, 1)}`}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: '92px',
          padding: '2px 0',
          borderRadius: '10px',
          background: 'rgba(255,255,255,0.72)',
          border: '1px solid rgba(141,110,99,0.08)'
        }}
      >
        <UptimeChart
          history={txTrend}
          color="#1697f6"
          secondaryHistory={rxTrend}
          secondaryColor="#ff0aa6"
          threshold={80}
          fixedDomain={[0, adaptiveScale.upper]}
          yTicks={adaptiveScale.ticks}
          hideNoDataText
          strokeWidth={2}
          variant="perfstack"
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '0.54rem', fontWeight: 700, color: '#1697f6' }}>AVG TX {formatPercent(txDailyValue, 1)}</span>
        <span style={{ fontSize: '0.54rem', fontWeight: 700, color: '#ff0aa6' }}>AVG RX {formatPercent(rxDailyValue, 1)}</span>
      </div>
    </div>
  );
}

function HeaderMetricStack({
  label,
  value,
  detail
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: '2px',
        minWidth: 0,
        padding: '6px 8px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.52)',
        border: '1px solid rgba(141,110,99,0.10)'
      }}
    >
      <div style={{ fontSize: '0.56rem', letterSpacing: '0.08em', fontWeight: 800, opacity: 0.62 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      <div style={{ fontSize: '0.56rem', opacity: 0.72, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
    </div>
  );
}

export default function UnifiedNetworkCard({ links, sectionHealth }: UnifiedNetworkCardProps) {
  const healthBadgeStyle = getHealthBadgeStyle(sectionHealth.status);
  const compactError = formatHealthErrorSummary(sectionHealth.lastError);
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
  const tonedLinks = focusLinks.map((link) => ({ link, tone: getLinkTone(link) }));

  return (
    <div className="glass-panel dashboard-panel dashboard-panel--network" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minHeight: 0 }}>
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
            <h2 style={{ fontSize: '0.98rem', color: 'var(--text-primary)' }}>Network Fabric</h2>
            <div style={{ fontSize: '0.68rem', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>REAL-TIME SD-WAN AND CARRIER VIEW</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
          <div
            style={{
              ...healthBadgeStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '999px',
              fontSize: '0.64rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              maxWidth: '270px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
            title={sectionHealth.lastError || undefined}
          >
            <span className={`pulse-dot ${sectionHealth.status === 'ok' ? 'ok' : sectionHealth.status === 'error' ? 'critical' : 'warning'}`} />
            {`DATA LINK ${getHealthText(sectionHealth.status).toUpperCase()} | ${formatSyncTime(sectionHealth.lastSuccessAt)}${compactError ? ` | ${compactError}` : ''}`}
          </div>
        </div>
      </div>

      <div className="network-detail-list">
        {tonedLinks.map(({ link, tone }) => {
          const palette = getTonePalette(tone);
          const realtimePeak = getPeakValue([link.realtimeTransmitUtilization, link.realtimeReceiveUtilization]);
          const dailyPeak = getPeakValue([link.dailyTransmitUtilization, link.dailyReceiveUtilization]);
          const hasTraffic =
            link.currentTrafficTransmitMbps !== null && link.currentTrafficTransmitMbps !== undefined ||
            link.currentTrafficReceiveMbps !== null && link.currentTrafficReceiveMbps !== undefined;
          const label = getLinkLabel(link);
          const subtitle = [link.interfaceType].filter(Boolean).join(' | ');
          const providerState = getNetworkLinkState(link);
          const metricSummary = [
            {
              label: 'NOW',
              value: formatPercent(realtimePeak, realtimePeak !== null && realtimePeak < 10 ? 1 : 0),
              detail: `Peak | AVG ${formatPercent(dailyPeak, dailyPeak !== null && dailyPeak < 10 ? 1 : 0)}`
            },
            {
              label: 'TX',
              value: hasTraffic ? formatMbps(link.currentTrafficTransmitMbps) : 'N/A',
              detail: `${formatPercent(link.realtimeTransmitUtilization ?? link.transmitUtilization, 1)} now | ${formatPercent(link.dailyTransmitUtilization, 1)} avg`
            },
            {
              label: 'RX',
              value: hasTraffic ? formatMbps(link.currentTrafficReceiveMbps) : 'N/A',
              detail: `${formatPercent(link.realtimeReceiveUtilization ?? link.receiveUtilization, 1)} now | ${formatPercent(link.dailyReceiveUtilization, 1)} avg`
            }
          ];

          return (
            <div
              key={link.id}
              className="network-link-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                padding: '7px',
                borderRadius: '16px',
                background: 'rgba(255,255,255,0.5)',
                border: `1px solid ${palette.border}`,
                boxShadow: `inset 0 0 0 1px ${palette.bg}`
              }}
            >
              <div className="network-link-top-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 800, letterSpacing: '0.08em', color: palette.text }}>{link.provider}</div>
                  <div
                    style={{
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      lineHeight: 1.2,
                      marginTop: '2px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={label}
                  >
                    {label}
                  </div>
                  {subtitle ? (
                    <div style={{ fontSize: '0.56rem', opacity: 0.66, marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {subtitle}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '5px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 8px',
                        borderRadius: '999px',
                        background: palette.bg,
                        border: `1px solid ${palette.border}`,
                        fontSize: '0.54rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: palette.text
                      }}
                    >
                      <span
                        style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '999px',
                          background: palette.fill
                        }}
                      />
                      {(link.alias || link.provider).toUpperCase()} - {providerState.label.toUpperCase()}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '999px',
                        background: 'rgba(255,255,255,0.56)',
                        border: '1px solid rgba(141,110,99,0.12)',
                        fontSize: '0.54rem',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {getSpeedLabel(link)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '6px', minWidth: 0 }}>
                  <div className="network-link-header-metrics">
                    {metricSummary.map((metric) => (
                      <HeaderMetricStack
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        detail={metric.detail}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <CombinedUtilizationSparklineRow
                  txHistory={link.history || []}
                  rxHistory={link.history || []}
                  txRealtimeValue={link.realtimeTransmitUtilization ?? link.transmitUtilization}
                  rxRealtimeValue={link.realtimeReceiveUtilization ?? link.receiveUtilization}
                  txDailyValue={link.dailyTransmitUtilization}
                  rxDailyValue={link.dailyReceiveUtilization}
                  tone={getUtilizationTone(Math.max(
                    link.realtimeTransmitUtilization ?? link.transmitUtilization ?? 0,
                    link.realtimeReceiveUtilization ?? link.receiveUtilization ?? 0,
                    link.dailyTransmitUtilization ?? 0,
                    link.dailyReceiveUtilization ?? 0
                  ))}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', fontSize: '0.5rem', opacity: 0.64 }}>
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

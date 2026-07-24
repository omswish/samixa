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
  txHistory?: number[];
  rxHistory?: number[];
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
const TX_ACCENT = '#1697f6';
const RX_ACCENT = '#ff0aa6';

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
      return { background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(69,147,95,0.15))', color: '#2d6443', border: '1px solid rgba(69,147,95,0.30)' };
    case 'stale':
      return { background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(208,149,56,0.15))', color: '#8d5c15', border: '1px solid rgba(208,149,56,0.30)' };
    case 'error':
      return { background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(141,31,63,0.17))', color: '#671730', border: '1px solid rgba(141,31,63,0.32)' };
    default:
      return { background: 'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(114,130,143,0.14))', color: '#4f5d68', border: '1px solid rgba(114,130,143,0.25)' };
  }
}

function getTonePalette(tone: VisualTone) {
  switch (tone) {
    case 'normal':
      return {
        bg: 'rgba(69,147,95,0.15)',
        border: 'rgba(69,147,95,0.30)',
        text: '#2d6443',
        fill: '#45935f'
      };
    case 'warning':
      return {
        bg: 'rgba(208,149,56,0.15)',
        border: 'rgba(208,149,56,0.30)',
        text: '#8d5c15',
        fill: '#d09538'
      };
    default:
      return {
        bg: 'rgba(141,31,63,0.17)',
        border: 'rgba(141,31,63,0.32)',
        text: '#671730',
        fill: '#8d1f3f'
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

function formatCompactMbpsValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${Math.round(value)}`;
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

function formatDirectionalFlowSummary(
  packetsPerSecond: number | null | undefined,
  averagePacketSize: number | null | undefined
) {
  return `${formatPps(packetsPerSecond)} / ${formatPacketSize(averagePacketSize)}`;
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
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '4px', fontSize: '0.66rem', fontWeight: 800 }}>
          <span style={{ color: TX_ACCENT }}>{`TX ${formatPercent(txRealtimeValue, 1)}`}</span>
          <span style={{ color: 'rgba(62,39,35,0.48)' }}>|</span>
          <span style={{ color: RX_ACCENT }}>{`RX ${formatPercent(rxRealtimeValue, 1)}`}</span>
        </span>
      </div>
      <div
        className="glass-chart-surface"
        style={{
          width: '100%',
          height: 'var(--wall-network-spark-height)',
          padding: '2px 0',
          borderRadius: '10px',
          border: '1px solid rgba(141,110,99,0.08)'
        }}
      >
        <UptimeChart
          history={txTrend}
          color={TX_ACCENT}
          secondaryHistory={rxTrend}
          secondaryColor={RX_ACCENT}
          threshold={80}
          fixedDomain={[0, adaptiveScale.upper]}
          yTicks={adaptiveScale.ticks}
          hideNoDataText
          strokeWidth={2}
          variant="perfstack"
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
        <span style={{ fontSize: '0.54rem', fontWeight: 700, color: TX_ACCENT }}>AVG TX {formatPercent(txDailyValue, 1)}</span>
        <span style={{ fontSize: '0.54rem', fontWeight: 700, color: RX_ACCENT }}>AVG RX {formatPercent(rxDailyValue, 1)}</span>
      </div>
    </div>
  );
}

function HeaderMetricStack({
  label,
  value,
  detail,
  accent,
  unit
}: {
  label: string;
  value: string;
  detail?: string;
  accent?: string;
  unit?: string;
}) {
  const compactValue = !unit;
  const valueFontSize = compactValue ? '1.04rem' : '1.18rem';

  return (
    <div
      className="glass-compact-surface"
      style={{
        display: 'grid',
        gap: detail ? '2px' : '1px',
        minWidth: 0,
        minHeight: detail ? 'var(--wall-network-header-metric-min-height)' : 'var(--wall-network-header-metric-min-height-compact)',
        padding: 'var(--wall-network-header-metric-padding)',
        borderRadius: '12px',
        border: '1px solid rgba(141,110,99,0.10)',
        alignContent: 'center'
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: '3px', minWidth: 0, flexWrap: 'nowrap' }}>
        <div style={{ fontSize: '0.54rem', letterSpacing: '0.07em', fontWeight: 800, color: accent ?? 'rgba(62,39,35,0.62)', whiteSpace: 'nowrap' }}>{label}</div>
        {unit ? (
          <div style={{ fontSize: '0.46rem', letterSpacing: '0.02em', fontWeight: 700, color: 'rgba(62,39,35,0.54)', whiteSpace: 'nowrap' }}>{unit}</div>
        ) : null}
      </div>
      <div style={{ fontSize: valueFontSize, fontWeight: 800, lineHeight: 1.02, letterSpacing: compactValue ? '-0.02em' : '0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: accent ?? 'var(--text-primary)' }}>{value}</div>
      {detail ? (
        <div style={{ fontSize: '0.58rem', opacity: 0.72, lineHeight: 1.15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{detail}</div>
      ) : null}
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
    <div className="glass-panel dashboard-panel dashboard-panel--network" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--wall-network-card-gap)', minHeight: 0, flex: '1 1 auto', width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            className="glass-metal-icon"
            style={{
              width: 'var(--wall-icon-sm)',
              height: 'var(--wall-icon-sm)',
              borderRadius: 'var(--wall-icon-radius-sm)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Activity size={20} style={{ color: 'var(--primary)' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--wall-title-sm)', color: 'var(--text-primary)' }}>Network Fabric</h2>
            <div style={{ fontSize: 'var(--wall-subtitle-size)', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 700 }}>REAL-TIME SD-WAN AND CARRIER VIEW</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', minWidth: 0 }}>
          <div
            className="glass-alert-surface"
            style={{
              ...healthBadgeStyle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: 'var(--wall-health-pill-padding)',
              borderRadius: '999px',
              fontSize: 'var(--wall-health-pill-font-size)',
              fontWeight: 800,
              letterSpacing: '0.05em',
              maxWidth: 'var(--wall-health-pill-max-width)',
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
          const metricSummary: Array<{ label: string; value: string; detail?: string; accent?: string; unit?: string }> = [
            {
              label: 'NOW',
              value: realtimePeak === null ? 'N/A' : `${Math.round(realtimePeak)}%`
            },
            {
              label: 'PEAK',
              value: dailyPeak === null ? 'N/A' : `${Math.round(dailyPeak)}%`
            },
            {
              label: 'TX',
              value: hasTraffic ? formatCompactMbpsValue(link.currentTrafficTransmitMbps) : 'N/A',
              accent: TX_ACCENT,
              unit: hasTraffic ? 'Mbps' : undefined
            },
            {
              label: 'RX',
              value: hasTraffic ? formatCompactMbpsValue(link.currentTrafficReceiveMbps) : 'N/A',
              accent: RX_ACCENT,
              unit: hasTraffic ? 'Mbps' : undefined
            }
          ];

          return (
            <div
              key={link.id}
              className="network-link-card glass-compact-surface"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--wall-network-link-gap)',
                padding: 'var(--wall-network-link-padding)',
                borderRadius: '16px',
                border: `1px solid ${palette.border}`,
                boxShadow: `inset 0 0 0 1px ${palette.bg}`
              }}
            >
              <div className="network-link-top-grid">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--wall-network-provider-size)', fontWeight: 800, letterSpacing: '0.08em', color: palette.text }}>{link.provider}</div>
                  <div
                    style={{
                      fontSize: 'var(--wall-network-label-size)',
                      fontWeight: 800,
                      lineHeight: 1.2,
                      marginTop: '1px',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={label}
                  >
                    {label}
                  </div>
                  {subtitle ? (
                    <div style={{ display: 'var(--wall-network-subtitle-display)', fontSize: 'var(--wall-network-subtitle-size)', opacity: 0.66, marginTop: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {subtitle}
                    </div>
                  ) : null}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', minWidth: 0, flexWrap: 'nowrap' }}>
                    <span
                      className="glass-chip-surface"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        flex: '0 0 auto',
                        width: 'fit-content',
                        maxWidth: '100%',
                        padding: 'var(--wall-network-chip-padding)',
                        borderRadius: '999px',
                        border: `1px solid ${palette.border}`,
                        fontSize: '0.52rem',
                        fontWeight: 800,
                        letterSpacing: '0.07em',
                        color: palette.text,
                        whiteSpace: 'nowrap'
                      }}
                      title={`${(link.alias || link.provider).toUpperCase()} - ${providerState.label.toUpperCase()}`}
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
                      className="glass-chip-surface"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: '0 0 auto',
                        width: 'fit-content',
                        padding: 'var(--wall-network-chip-padding)',
                        borderRadius: '999px',
                        border: '1px solid rgba(141,110,99,0.12)',
                        fontSize: '0.52rem',
                        fontWeight: 800,
                        letterSpacing: '0.07em',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {getSpeedLabel(link)}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'grid', gap: 'var(--wall-network-header-metric-gap)', minWidth: 0 }}>
                  <div className="network-link-header-metrics">
                    {metricSummary.map((metric) => (
                      <HeaderMetricStack
                        key={metric.label}
                        label={metric.label}
                        value={metric.value}
                        detail={metric.detail}
                        accent={metric.accent}
                        unit={metric.unit}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <CombinedUtilizationSparklineRow
                  txHistory={link.txHistory || link.history || []}
                  rxHistory={link.rxHistory || link.history || []}
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

              <div style={{ display: 'var(--wall-network-footer-display)', justifyContent: 'space-between', alignItems: 'center', gap: '6px', fontSize: 'var(--wall-network-meta-font-size)', opacity: 0.64 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {link.lastStatusChange ? `Status changed ${link.lastStatusChange}` : 'No status timestamp'}
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'right' }}>
                  <span style={{ color: TX_ACCENT, fontWeight: 700 }}>
                    {`TX ${formatDirectionalFlowSummary(link.packetsPerSecondTransmit, link.averagePacketSizeTransmit)}`}
                  </span>
                  <span style={{ color: 'rgba(62,39,35,0.48)' }}>|</span>
                  <span style={{ color: RX_ACCENT, fontWeight: 700 }}>
                    {`RX ${formatDirectionalFlowSummary(link.packetsPerSecondReceive, link.averagePacketSizeReceive)}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

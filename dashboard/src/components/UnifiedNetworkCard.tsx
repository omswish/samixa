'use client';

import React from 'react';
import UptimeChart from './UptimeChart';
import { Activity, Radio, ArrowUpRight, ShieldAlert } from 'lucide-react';

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

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${value}%`;
}

function formatUptime(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return 'N/A';
  }

  return `${value.toFixed(3)}%`;
}

export default function UnifiedNetworkCard({ links, sectionHealth }: UnifiedNetworkCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'ok';
      case 'degraded': return 'warning';
      default: return 'critical';
    }
  };

  const activeLinks = links.filter((link) => link.status === 'operational').length;
  const healthBadgeStyle = getHealthBadgeStyle(sectionHealth.status);
  const trendSources = links.filter((link) => link.history.length > 0);
  const trendHistory = trendSources.length > 0
    ? Array.from({ length: Math.max(...trendSources.map((link) => link.history.length)) }, (_, index) => {
        const values = trendSources
          .map((link) => link.history[index])
          .filter((value): value is number => typeof value === 'number');
        if (values.length === 0) {
          return 0;
        }

        return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
      })
    : [];

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>ISP Gateways & SDWAN</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
          <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '20px', backgroundColor: 'var(--accent)', color: 'var(--text-primary)', fontWeight: 500 }}>
            {activeLinks}/{links.length} Links Up
          </span>
          <span
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
            {getHealthText(sectionHealth.status).toUpperCase()} · Last synced {formatSyncTime(sectionHealth.lastSuccessAt)}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1 }}>
        {/* Left Column: Link Status List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {links.map((link) => {
            const hasDirectionalUtilization =
              (link.transmitUtilization !== null && link.transmitUtilization !== undefined) ||
              (link.receiveUtilization !== null && link.receiveUtilization !== undefined);

            return (
            <div 
              key={link.id} 
              style={{ 
                display: 'flex', 
                alignItems: 'flex-start', 
                justifyContent: 'space-between', 
                padding: '10px', 
                borderRadius: '8px', 
                background: 'rgba(255,255,255,0.4)', 
                border: '1px solid rgba(141, 110, 99, 0.08)',
                gap: '12px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0, flex: 1 }}>
                <span className={`pulse-dot ${getStatusColor(link.status)}`} style={{ marginTop: '6px' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{link.provider}</div>
                  <div style={{ fontSize: '0.78rem', opacity: 0.82, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={link.displayName || link.interfaceName || undefined}>
                    {link.interfaceName || link.displayName || 'SolarWinds node'}
                  </div>
                  <div style={{ fontSize: '0.72rem', opacity: 0.62, marginTop: '2px' }}>
                    {[
                      link.siteName,
                      link.pollingIp,
                      link.portSpeed,
                      link.linkType,
                      link.circuitId
                    ].filter(Boolean).join(' · ') || 'Metadata unavailable'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '14px', fontSize: '0.82rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <div>
                  <span style={{ opacity: 0.6, display: 'block', fontSize: '0.7rem' }}>UPTIME</span>
                  <span style={{ fontWeight: 600 }}>{formatUptime(link.uptime)}</span>
                </div>
                <div>
                  <span style={{ opacity: 0.6, display: 'block', fontSize: '0.7rem' }}>LATENCY</span>
                  <span style={{ fontWeight: 600 }}>
                    {link.latency !== null && link.latency !== undefined ? `${link.latency}ms` : 'N/A'}
                  </span>
                </div>
                <div>
                  <span style={{ opacity: 0.6, display: 'block', fontSize: '0.7rem' }}>TX / RX</span>
                  <span style={{ fontWeight: 600 }}>
                    {hasDirectionalUtilization
                      ? `${formatPercent(link.transmitUtilization)} / ${formatPercent(link.receiveUtilization)}`
                      : formatPercent(link.utilization)}
                  </span>
                </div>
              </div>
            </div>
            );
          })}
        </div>

        {/* Right Column: Performance Trend and Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.4)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(141, 110, 99, 0.08)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            SD-WAN Avg Utilization Trend
          </span>
          <div style={{ flex: 1, position: 'relative', minHeight: '80px', marginTop: '4px' }}>
            <UptimeChart 
              history={trendHistory} 
              color="#8d6e63" 
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', opacity: 0.6, marginTop: '8px' }}>
            <span>20 mins ago</span>
            <span>Now</span>
          </div>
          {sectionHealth.status === 'error' && sectionHealth.lastError ? (
            <div style={{ fontSize: '0.72rem', color: '#c62828', marginTop: '4px' }}>
              {sectionHealth.lastError}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

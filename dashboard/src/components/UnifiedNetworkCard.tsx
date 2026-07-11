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
  history: number[];
}

interface UnifiedNetworkCardProps {
  links: NetworkLink[];
}

export default function UnifiedNetworkCard({ links }: UnifiedNetworkCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'ok';
      case 'degraded': return 'warning';
      default: return 'critical';
    }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} style={{ color: 'var(--primary)' }} />
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-primary)' }}>ISP Gateways & SDWAN</h2>
        </div>
        <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '20px', backgroundColor: 'var(--accent)', color: 'var(--text-primary)', fontWeight: 500 }}>
          4 Links Active
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', flex: 1 }}>
        {/* Left Column: Link Status List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {links.map((link) => (
            <div 
              key={link.id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                padding: '10px', 
                borderRadius: '8px', 
                background: 'rgba(255,255,255,0.4)', 
                border: '1px solid rgba(141, 110, 99, 0.08)' 
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`pulse-dot ${getStatusColor(link.status)}`} />
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{link.provider}</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ opacity: 0.6, display: 'block', fontSize: '0.7rem' }}>LATENCY</span>
                  <span style={{ fontWeight: 600 }}>{link.latency !== null ? `${link.latency}ms` : 'N/A'}</span>
                </div>
                <div>
                  <span style={{ opacity: 0.6, display: 'block', fontSize: '0.7rem' }}>UTILIZATION</span>
                  <span style={{ fontWeight: 600 }}>{link.utilization !== null ? `${link.utilization}%` : 'N/A'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Performance Trend and Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255,255,255,0.4)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(141, 110, 99, 0.08)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            SDWAN Utilization Trend (20m)
          </span>
          <div style={{ flex: 1, position: 'relative', minHeight: '80px', marginTop: '4px' }}>
            {/* Overlay link utilizing the trend (e.g. EC-1 or ISP1) */}
            <UptimeChart 
              history={links[0]?.history || []} 
              color="#8d6e63" 
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', opacity: 0.6, marginTop: '8px' }}>
            <span>20 mins ago</span>
            <span>Now</span>
          </div>
        </div>
      </div>
    </div>
  );
}

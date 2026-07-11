'use client';

import React, { useEffect, useState, useRef } from 'react';
import UnifiedNetworkCard from '../components/UnifiedNetworkCard';
import UptimeChart from '../components/UptimeChart';
import { 
  Server, 
  Activity, 
  Database, 
  Clock, 
  RefreshCw, 
  Ticket, 
  Percent,
  HardDrive,
  Cpu,
  Layers,
  CheckCircle,
  AlertTriangle,
  XCircle
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
  history: number[];
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
  };
  symphony: {
    openIncidents: number;
    openIncidentsBreakdown: { new: number; assigned: number; inProgress: number; pending: number };
    serviceRequests: number;
    serviceRequestsBreakdown: { new: number; assigned: number; inProgress: number; pending: number };
    workOrders: number;
    workOrdersBreakdown: { new: number; assigned: number; inProgress: number; pending: number };
    changeRecords: number;
    changeRecordsBreakdown: { new: number; assigned: number; inProgress: number; pending: number };
    serviceRequestsSla: number;
    incidentsResponseSla: number;
    incidentsResolutionSla: number;
    requestsResponseSla: number;
    requestsResolutionSla: number;
  };
  lastUpdate: string;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardState | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [time, setTime] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  // Update clock every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set up WebSocket connection to central gateway
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
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational': return 'var(--status-ok)';
      case 'degraded': return 'var(--status-warning)';
      default: return 'var(--status-critical)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'operational': return <CheckCircle size={16} style={{ color: 'var(--status-ok)' }} />;
      case 'degraded': return <AlertTriangle size={16} style={{ color: 'var(--status-warning)' }} />;
      default: return <XCircle size={16} style={{ color: 'var(--status-critical)' }} />;
    }
  };

  if (!data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', gap: '16px' }}>
        <RefreshCw className="animate-spin" size={32} style={{ color: 'var(--primary)' }} />
        <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>Connecting to NOC Dashboard API Gateway...</p>
      </div>
    );
  }

  // Filter servers into Windows vs Linux
  const windowsServers = data.servers.filter(s => s.name.toLowerCase().includes('.abgplanet') || s.name.toLowerCase().includes('-us') || s.name.toLowerCase().includes('-fs'));
  const linuxServers = data.servers.filter(s => !windowsServers.includes(s));

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100vh' }}>
      
      {/* Header Panel */}
      <header className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center' }}>
            <Server size={24} style={{ color: 'var(--text-primary)' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>UTKAL IT DASHBOARD</h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>NOC Widescreen Operations Hub</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* Sync status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.5)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--panel-border)' }}>
            <span className={`pulse-dot ${wsConnected ? 'ok' : 'critical'}`} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {wsConnected ? 'GATEWAY CONNECTED' : 'DISCONNECTED'}
            </span>
          </div>

          {/* Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.25rem', fontFamily: 'var(--font-headings)', fontWeight: 600, color: 'var(--text-primary)' }}>
            <Clock size={18} style={{ color: 'var(--primary)' }} />
            <span>{time}</span>
          </div>
        </div>
      </header>

      {/* Main Grid: HCI, Network, Service Desk */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: '20px' }}>
        
        {/* Left Side: HCI / Nutanix Cluster Health & Symphony Service Desk */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* HCI Nutanix Cluster Card */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Database size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '1.2rem' }}>Nutanix HCI Cluster Health</h2>
              </div>
              <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Uptime: {data.nutanix.uptime}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {/* Nodes info */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px solid rgba(141,110,99,0.1)' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block' }}>NODES</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.nutanix.nodesCount} Online</span>
              </div>
              {/* Storage */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px solid rgba(141,110,99,0.1)' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block' }}>STORAGE USED</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{data.nutanix.storageUsage}%</span>
              </div>
              {/* Avg CPU */}
              <div style={{ padding: '12px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', border: '1px solid rgba(141,110,99,0.1)' }}>
                <span style={{ fontSize: '0.75rem', opacity: 0.7, display: 'block' }}>AVG CLUSTER CPU</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {data.nutanix.historyCpu.length ? `${data.nutanix.historyCpu[data.nutanix.historyCpu.length - 1]}%` : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* Unified Network links card */}
          <UnifiedNetworkCard links={data.networks} />

          {/* Symphony Ticket Summary Card */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Ticket size={20} style={{ color: 'var(--primary)' }} />
                <h2 style={{ fontSize: '1.2rem' }}>Hindalco Service Desk (Symphony)</h2>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                <span style={{ padding: '2px 6px', background: '#e8f5e9', color: '#2e7d32', borderRadius: '4px', fontWeight: 500 }}>
                  Inc SLA: {data.symphony.incidentsResolutionSla}%
                </span>
                <span style={{ padding: '2px 6px', background: '#e8f5e9', color: '#2e7d32', borderRadius: '4px', fontWeight: 500 }}>
                  Req SLA: {data.symphony.requestsResolutionSla}%
                </span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block' }}>INCIDENTS</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.symphony.openIncidents}</span>
                <span style={{ fontSize: '0.65rem', display: 'block', opacity: 0.6 }}>
                  {data.symphony.openIncidentsBreakdown.inProgress} In-Prg
                </span>
              </div>
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block' }}>SR</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.symphony.serviceRequests}</span>
                <span style={{ fontSize: '0.65rem', display: 'block', opacity: 0.6 }}>
                  {data.symphony.serviceRequestsBreakdown.inProgress} In-Prg
                </span>
              </div>
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block' }}>WORK ORDERS</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.symphony.workOrders}</span>
                <span style={{ fontSize: '0.65rem', display: 'block', opacity: 0.6 }}>
                  {data.symphony.workOrdersBreakdown.inProgress} In-Prg
                </span>
              </div>
              <div style={{ padding: '10px', background: 'rgba(255,255,255,0.4)', borderRadius: '8px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, display: 'block' }}>CHANGES</span>
                <span style={{ fontSize: '1.4rem', fontWeight: 700 }}>{data.symphony.changeRecords}</span>
                <span style={{ fontSize: '0.65rem', display: 'block', opacity: 0.6 }}>
                  {data.symphony.changeRecordsBreakdown.inProgress} In-Prg
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Server Nodes Matrix Table */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '780px', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={20} style={{ color: 'var(--primary)' }} />
              <h2 style={{ fontSize: '1.25rem' }}>Server Nodes (16 Monitored)</h2>
            </div>
            <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Last sync: {data.lastUpdate ? new Date(data.lastUpdate).toLocaleTimeString() : 'N/A'}</span>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--panel-border)', textAlign: 'left', opacity: 0.7 }}>
                <th style={{ padding: '8px 4px' }}>STATUS</th>
                <th style={{ padding: '8px 4px' }}>NODE NAME</th>
                <th style={{ padding: '8px 4px' }}>CPU</th>
                <th style={{ padding: '8px 4px' }}>RAM</th>
                <th style={{ padding: '8px 4px' }}>DISK</th>
                <th style={{ padding: '8px 4px' }}>BACKUP</th>
                <th style={{ padding: '8px 4px', width: '90px' }}>CPU TREND</th>
              </tr>
            </thead>
            <tbody>
              {data.servers.map((srv) => (
                <tr key={srv.id} style={{ borderBottom: '1px solid rgba(141,110,99,0.08)', height: '40px' }}>
                  <td style={{ padding: '6px 4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`pulse-dot ${srv.status === 'operational' ? 'ok' : srv.status === 'degraded' ? 'warning' : 'critical'}`} />
                      <span style={{ fontSize: '0.75rem', textTransform: 'capitalize', fontWeight: 500 }}>{srv.status}</span>
                    </div>
                  </td>
                  <td style={{ padding: '6px 4px', fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={srv.name}>
                    {srv.name.split('.')[0]}
                  </td>
                  <td style={{ padding: '6px 4px', fontWeight: 700 }}>
                    {srv.cpu !== null ? `${srv.cpu}%` : 'N/A'}
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    {srv.memory !== null ? `${srv.memory}%` : 'N/A'}
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    {srv.disk || 'N/A'}
                  </td>
                  <td style={{ padding: '6px 4px' }}>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      padding: '2px 6px', 
                      borderRadius: '4px', 
                      backgroundColor: srv.backupStatus === 'successful' ? '#e8f5e9' : srv.backupStatus === 'failed' ? '#ffebee' : '#f5f5f5',
                      color: srv.backupStatus === 'successful' ? '#2e7d32' : srv.backupStatus === 'failed' ? '#c62828' : '#757575',
                      fontWeight: 600
                    }}>
                      {srv.backupStatus}
                    </span>
                  </td>
                  <td style={{ padding: '6px 4px', height: '30px' }}>
                    <div style={{ height: '24px', width: '80px' }}>
                      <UptimeChart history={srv.history || []} color={srv.status === 'operational' ? '#2e7d32' : '#f57f17'} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* Footer */}
      <footer className="glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', fontSize: '0.75rem', opacity: 0.8 }}>
        <div>SYSTEM STATUS: ALL OPERATIONAL</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>Nutanix API: active</span>
          <span>SolarWinds Edge Scraper: active</span>
          <span>Symphony Edge Scraper: active</span>
        </div>
      </footer>

    </div>
  );
}

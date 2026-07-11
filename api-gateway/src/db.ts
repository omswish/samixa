import path from 'path';
import fs from 'fs';

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/db.json');

// Ensure db directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export interface DbSchema {
  servers: any[];
  networks: any[];
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

// Default state pre-populated with servers and networks
const defaultState: DbSchema = {
  servers: [
    { id: 'sw-srv-1', name: 'HIL-HIDDOR-AV01.abgplanet.abg.com', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-2', name: 'HIL-HIDDOR-BK01', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-3', name: 'HIL-HIDDOR-CSCTS1', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-4', name: 'HIL-HIDDOR-CSCTS2', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-5', name: 'HILHIDDORDT0320', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-6', name: 'HIL-HIDDOR-FS01.abgplanet.abg.com', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-7', name: 'HILHIDDORILMSAP', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-8', name: 'HILHIDDORILMSDB', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-9', name: 'HIL-HIDDOR-PIMW.abgplanet.abg.com', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-10', name: 'HIL-HIDDOR-PSDM.abgplanet.abg.com', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-11', name: 'HIL-HIDDOR-US01', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-12', name: 'HIL-HIDDOR-US02', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-13', name: 'HIL-HIDDOR-US03', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-14', name: 'HIL-HIDDOR-US04', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-15', name: 'HIL-HIDDOR-US05', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] },
    { id: 'sw-srv-16', name: 'HIL-HIDDOR-US06', location: 'Utkal DC', status: 'operational', cpu: null, memory: null, disk: null, backupStatus: 'N/A', history: [] }
  ],
  networks: [
    { id: 'sw-net-1', provider: 'RJIO (ISP1)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
    { id: 'sw-net-2', provider: 'RailTel (ISP2)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
    { id: 'sw-net-3', provider: 'HIL-UTK-EC-1 (SDWAN-A)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] },
    { id: 'sw-net-4', provider: 'HIL-UTK-EC-2 (SDWAN-B)', status: 'operational', uptime: 100, latency: null, utilization: null, history: [] }
  ],
  nutanix: {
    uptime: 'N/A',
    nodesCount: 0,
    storageUsage: 0,
    historyCpu: [],
    historyMem: []
  },
  symphony: {
    openIncidents: 0,
    openIncidentsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
    serviceRequests: 0,
    serviceRequestsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
    workOrders: 0,
    workOrdersBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
    changeRecords: 0,
    changeRecordsBreakdown: { new: 0, assigned: 0, inProgress: 0, pending: 0 },
    serviceRequestsSla: 100,
    incidentsResponseSla: 100,
    incidentsResolutionSla: 100,
    requestsResponseSla: 100,
    requestsResolutionSla: 100
  },
  lastUpdate: new Date().toISOString()
};

// Memory cache of DB state
let state: DbSchema = defaultState;

// Load initial state if file exists
if (fs.existsSync(dbPath)) {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8');
    state = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load db.json, using default state:', err);
    state = defaultState;
  }
} else {
  saveStateAtomically();
}

function saveStateAtomically() {
  try {
    const tempPath = `${dbPath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(state, null, 2), 'utf-8');
    fs.renameSync(tempPath, dbPath);
  } catch (err) {
    console.error('Error writing DB file atomically:', err);
  }
}

// Add value to sliding history window of max 20 items
function pushToHistory(history: number[], value: number): number[] {
  const newHistory = [...history, value];
  if (newHistory.length > 20) {
    return newHistory.slice(newHistory.length - 20);
  }
  return newHistory;
}

export function getDashboardState(): DbSchema {
  return state;
}

export function updateNutanix(data: {
  uptime?: string;
  nodesCount?: number;
  storageUsage?: number;
  cpuUsage?: number;
  memoryUsage?: number;
  vms?: Array<{ name: string; diskUsage?: string; backupStatus?: string }>;
}) {
  if (data.uptime !== undefined) state.nutanix.uptime = data.uptime;
  if (data.nodesCount !== undefined) state.nutanix.nodesCount = data.nodesCount;
  if (data.storageUsage !== undefined) state.nutanix.storageUsage = data.storageUsage;
  
  if (data.cpuUsage !== undefined) {
    state.nutanix.historyCpu = pushToHistory(state.nutanix.historyCpu || [], data.cpuUsage);
  }
  if (data.memoryUsage !== undefined) {
    state.nutanix.historyMem = pushToHistory(state.nutanix.historyMem || [], data.memoryUsage);
  }

  if (data.vms) {
    for (const vm of data.vms) {
      const server = state.servers.find(
        s => s.name.toLowerCase().includes(vm.name.toLowerCase()) || 
             vm.name.toLowerCase().includes(s.name.toLowerCase())
      );
      if (server) {
        if (vm.diskUsage !== undefined) server.disk = vm.diskUsage;
        if (vm.backupStatus !== undefined) server.backupStatus = vm.backupStatus;
      }
    }
  }

  state.lastUpdate = new Date().toISOString();
  saveStateAtomically();
}

export function updateSolarWinds(data: {
  servers?: Array<{ name: string; cpu?: number; memory?: number; status?: string }>;
  networks?: Array<{ id: string; latency?: number; utilization?: number; status?: string }>;
}) {
  if (data.servers) {
    for (const s of data.servers) {
      const server = state.servers.find(
        srv => srv.name.toLowerCase().includes(s.name.toLowerCase()) || 
               s.name.toLowerCase().includes(srv.name.toLowerCase())
      );
      if (server) {
        if (s.cpu !== undefined) {
          server.cpu = s.cpu;
          server.history = pushToHistory(server.history || [], s.cpu);
        }
        if (s.memory !== undefined) server.memory = s.memory;
        if (s.status !== undefined) server.status = s.status;
      }
    }
  }

  if (data.networks) {
    for (const n of data.networks) {
      const network = state.networks.find(net => net.id === n.id);
      if (network) {
        if (n.latency !== undefined) network.latency = n.latency;
        if (n.utilization !== undefined) {
          network.utilization = n.utilization;
          network.history = pushToHistory(network.history || [], n.utilization);
        }
        if (n.status !== undefined) network.status = n.status;
      }
    }
  }

  state.lastUpdate = new Date().toISOString();
  saveStateAtomically();
}

export function updateSymphony(data: {
  openIncidents?: number;
  openIncidentsBreakdown?: { new: number; assigned: number; inProgress: number; pending: number };
  serviceRequests?: number;
  serviceRequestsBreakdown?: { new: number; assigned: number; inProgress: number; pending: number };
  workOrders?: number;
  workOrdersBreakdown?: { new: number; assigned: number; inProgress: number; pending: number };
  changeRecords?: number;
  changeRecordsBreakdown?: { new: number; assigned: number; inProgress: number; pending: number };
  serviceRequestsSla?: number;
  incidentsResponseSla?: number;
  incidentsResolutionSla?: number;
  requestsResponseSla?: number;
  requestsResolutionSla?: number;
}) {
  if (data.openIncidents !== undefined) state.symphony.openIncidents = data.openIncidents;
  if (data.openIncidentsBreakdown) state.symphony.openIncidentsBreakdown = data.openIncidentsBreakdown;
  if (data.serviceRequests !== undefined) state.symphony.serviceRequests = data.serviceRequests;
  if (data.serviceRequestsBreakdown) state.symphony.serviceRequestsBreakdown = data.serviceRequestsBreakdown;
  if (data.workOrders !== undefined) state.symphony.workOrders = data.workOrders;
  if (data.workOrdersBreakdown) state.symphony.workOrdersBreakdown = data.workOrdersBreakdown;
  if (data.changeRecords !== undefined) state.symphony.changeRecords = data.changeRecords;
  if (data.changeRecordsBreakdown) state.symphony.changeRecordsBreakdown = data.changeRecordsBreakdown;
  
  if (data.serviceRequestsSla !== undefined) state.symphony.serviceRequestsSla = data.serviceRequestsSla;
  if (data.incidentsResponseSla !== undefined) state.symphony.incidentsResponseSla = data.incidentsResponseSla;
  if (data.incidentsResolutionSla !== undefined) state.symphony.incidentsResolutionSla = data.incidentsResolutionSla;
  if (data.requestsResponseSla !== undefined) state.symphony.requestsResponseSla = data.requestsResponseSla;
  if (data.requestsResolutionSla !== undefined) state.symphony.requestsResolutionSla = data.requestsResolutionSla;

  state.lastUpdate = new Date().toISOString();
  saveStateAtomically();
}

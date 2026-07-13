import dotenv from 'dotenv';
import path from 'path';

// Load env from workspace root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Allow self-signed certs (common for internal Prism Gateway)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/update';
const NUTANIX_HOST = process.env.NUTANIX_HOST || '10.23.50.27';
const NUTANIX_PORT = process.env.NUTANIX_PORT || '9440';
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. Set ${name} in the environment.`);
  }

  return value;
}

const NUTANIX_USER = requireEnv('NUTANIX_USER', process.env.NUTANIX_USER);
const NUTANIX_PASS = requireEnv('NUTANIX_PASS', process.env.NUTANIX_PASS);
const POLL_INTERVAL = 30000; // 30 seconds
type NutanixNodeStatus = 'normal' | 'warning' | 'critical' | 'offline';

function deriveNutanixNodeStatus(host: any): NutanixNodeStatus {
  const state = String(host?.state ?? '').toUpperCase();
  const hypervisorState = String(host?.hypervisor_state ?? '').toLowerCase();
  const connectionState = String(host?.acropolis_connection_state ?? '').toLowerCase();
  const metadataStatus = String(host?.metadata_store_status ?? '').toLowerCase();
  const maintenanceReason = String(host?.host_maintenance_mode_reason ?? '').trim();
  const maintenanceActive = Boolean(host?.host_in_maintenance_mode);

  if (host?.monitored === false || connectionState.includes('disconnected') || connectionState.includes('unreachable')) {
    return 'offline';
  }

  if (state.includes('DOWN') || state.includes('FAIL') || hypervisorState.includes('down')) {
    return 'offline';
  }

  if (
    host?.is_degraded ||
    maintenanceActive ||
    (maintenanceReason && maintenanceActive) ||
    state.includes('DEGRADE') ||
    (metadataStatus && metadataStatus !== 'knormalmode')
  ) {
    return 'warning';
  }

  if (
    (state && state !== 'NORMAL') ||
    (hypervisorState && !hypervisorState.includes('normal')) ||
    (connectionState && !connectionState.includes('connected'))
  ) {
    return 'critical';
  }

  return 'normal';
}

async function postUpdate(payload: object) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function reportFailure(attemptedAt: string, error: string) {
  try {
    await postUpdate({
      nutanix: {
        meta: {
          ok: false,
          attemptedAt,
          error
        }
      }
    });
  } catch (reportErr: any) {
    console.error(`[${new Date().toISOString()}] Failed to report Nutanix collector failure to gateway:`, reportErr.message);
  }
}

async function collectNutanixData() {
  const attemptedAt = new Date().toISOString();
  console.log(`[${attemptedAt}] Starting Nutanix metrics collection...`);
  
  const auth = Buffer.from(`${NUTANIX_USER}:${NUTANIX_PASS}`).toString('base64');
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Accept': 'application/json'
  };

  try {
    // 1. Fetch Cluster Stats
    const clusterUrl = `https://${NUTANIX_HOST}:${NUTANIX_PORT}/PrismGateway/services/rest/v2.0/cluster/`;
    const clusterRes = await fetch(clusterUrl, { headers });
    
    if (!clusterRes.ok) {
      throw new Error(`Failed to fetch cluster stats: ${clusterRes.statusText} (${clusterRes.status})`);
    }
    
    const clusterData = (await clusterRes.json()) as any;
    
    // Parse stats
    const cpuUsagePpm = clusterData.stats?.hypervisor_cpu_usage_ppm || 0;
    const cpuUsage = Number((cpuUsagePpm / 10000).toFixed(2)); // ppm -> %
    
    const memUsagePpm = clusterData.stats?.hypervisor_memory_usage_ppm || 0;
    const memoryUsage = Number((memUsagePpm / 10000).toFixed(2)); // ppm -> %
    
    const storageUsageBytes = clusterData.usage_stats?.['storage.usage_bytes'] || 0;
    const storageCapacityBytes = clusterData.usage_stats?.['storage.capacity_bytes'] || 1;
    const storageUsage = Number(((storageUsageBytes / storageCapacityBytes) * 100).toFixed(2));

    const nodesCount = clusterData.num_nodes || 0;
    let nodes: Array<{ name: string; status: NutanixNodeStatus }> = [];

    try {
      const hostsUrl = `https://${NUTANIX_HOST}:${NUTANIX_PORT}/PrismGateway/services/rest/v2.0/hosts/`;
      const hostsRes = await fetch(hostsUrl, { headers });
      if (hostsRes.ok) {
        const hostsData = (await hostsRes.json()) as any;
        nodes = (hostsData.entities || [])
          .map((entity: any) => ({
            name: entity.name || entity.hypervisor_address || entity.uuid,
            status: deriveNutanixNodeStatus(entity)
          }))
          .sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
      }
    } catch (hostErr) {
      console.warn('Could not retrieve Nutanix host list:', hostErr);
    }
    
    // 2. Fetch VMs List to calculate individual server statuses and metrics
    let vms: any[] = [];
    let logicalMemoryUsage = 0;
    let totalLogicalAllocatedBytes = 0;
    let activeLogicalUsedBytes = 0;
    try {
      const vmsUrl = `https://${NUTANIX_HOST}:${NUTANIX_PORT}/PrismGateway/services/rest/v1/vms`;
      const vmsRes = await fetch(vmsUrl, { headers });
      if (vmsRes.ok) {
        const vmsData = (await vmsRes.json()) as any;
        const entities = vmsData.entities || [];

        vms = entities.map((entity: any) => {
          // Parse CPU and memory from ppm stats
          const rawCpu = entity.stats?.hypervisor_cpu_usage_ppm ? parseInt(entity.stats.hypervisor_cpu_usage_ppm, 10) : 0;
          const cpu = Number((rawCpu / 10000).toFixed(2));
          
          const rawMem = entity.stats?.memory_usage_ppm ? parseInt(entity.stats.memory_usage_ppm, 10) : 0;
          const memory = Number((rawMem / 10000).toFixed(2));

          // Logical Memory Sums
          const capacity = entity.memoryCapacityInBytes || 0;
          totalLogicalAllocatedBytes += capacity;
          if (entity.powerState?.toLowerCase() === 'on' || entity.powerState?.toLowerCase() === 'poweredon') {
            activeLogicalUsedBytes += (capacity * rawMem) / 1000000;
          }

          // Calculate Disk usage
          const hasDiskUsage = entity.usageStats?.['storage.usage_bytes'] !== undefined && entity.diskCapacityInBytes;
          const diskUsed = hasDiskUsage ? entity.usageStats['storage.usage_bytes'] : 0;
          const diskCap = hasDiskUsage ? entity.diskCapacityInBytes : 0;
          const diskPercent = hasDiskUsage && diskCap > 0
            ? Number(((diskUsed / diskCap) * 100).toFixed(2))
            : undefined;

          const isPoweredOn = entity.powerState?.toLowerCase() === 'on' || entity.powerState?.toLowerCase() === 'poweredon';
          const status = isPoweredOn ? 'operational' : 'down';

          return {
            name: entity.vmName || entity.name,
            cpu,
            memory,
            diskUsage: diskPercent !== undefined ? `${diskPercent}%` : undefined,
            status,
            backupStatus: entity.protectionDomainName ? 'successful' : 'N/A'
          };
        });

        if (totalLogicalAllocatedBytes > 0) {
          logicalMemoryUsage = Number(((activeLogicalUsedBytes / totalLogicalAllocatedBytes) * 100).toFixed(2));
        }
      }
    } catch (vmErr) {
      console.warn('Could not retrieve VMs detailed list from v1 API:', vmErr);
    }

    const physicalMemoryUsage = memoryUsage; // cluster hypervisor memory usage %
    
    // Convert storage sizes from bytes to TiB
    const storageUsedTib = Number((storageUsageBytes / (1024 ** 4)).toFixed(2));
    const storageCapacityTib = Number((storageCapacityBytes / (1024 ** 4)).toFixed(2));
    
    // Convert logical memory sizes from bytes to GiB (active VM provisioning)
    let memoryUsedGib = 0;
    let memoryCapacityGib = 0;
    if (vms.length) {
      // Sum VMs memory capacities
      let totalMem = 0;
      let usedMem = 0;
      // We already calculated totalLogicalAllocatedBytes and activeLogicalUsedBytes inside the entities loop
      memoryUsedGib = Number((activeLogicalUsedBytes / (1024 ** 3)).toFixed(2));
      memoryCapacityGib = Number((totalLogicalAllocatedBytes / (1024 ** 3)).toFixed(2));
    }

    const payload = {
      nutanix: {
        meta: {
          ok: true,
          attemptedAt
        },
        uptime: 'Up',
        nodesCount,
        nodes: nodes.length ? nodes : undefined,
        storageUsage,
        cpuUsage,
        memoryUsage, // holds physical memory usage for retro-compatibility (charts)
        physicalMemoryUsage,
        logicalMemoryUsage,
        storageUsedTib,
        storageCapacityTib,
        memoryUsedGib,
        memoryCapacityGib,
        vms: vms.length ? vms : undefined
      }
    };

    // Post to API Gateway
    await postUpdate(payload);
    console.log(`[${new Date().toISOString()}] Nutanix metrics posted successfully.`);
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Error in Nutanix collector:`, err.message);
    await reportFailure(attemptedAt, err.message);
  }
}

// Start polling
console.log('Nutanix collector service started.');
collectNutanixData();
setInterval(collectNutanixData, POLL_INTERVAL);

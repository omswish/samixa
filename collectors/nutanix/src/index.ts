import dotenv from 'dotenv';
import path from 'path';

// Load env from workspace root
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Allow self-signed certs (common for internal Prism Gateway)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const API_URL = process.env.API_URL || 'http://localhost:4000/api/update';
const NUTANIX_HOST = process.env.NUTANIX_HOST || '10.23.50.27';
const NUTANIX_PORT = process.env.NUTANIX_PORT || '9440';
const NUTANIX_USER = process.env.NUTANIX_USER || 'hildoritdashboard';
const NUTANIX_PASS = process.env.NUTANIX_PASS || 'ItDa$(1857';
const POLL_INTERVAL = 30000; // 30 seconds

async function collectNutanixData() {
  console.log(`[${new Date().toISOString()}] Starting Nutanix metrics collection...`);
  
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
    
    // 2. Fetch VMs List to calculate On/Off and Disk/Backup statuses
    // For Phase 1 we will mock VM list mappings or query /vms/ if possible.
    // If /vms/ is not accessible or we want to remain robust, we can defaultVMs.
    // Let's implement /vms/ call to parse VM names, states and statuses.
    let vms: any[] = [];
    try {
      const vmsUrl = `https://${NUTANIX_HOST}:${NUTANIX_PORT}/PrismGateway/services/rest/v2.0/vms/`;
      const vmsRes = await fetch(vmsUrl, { headers });
      if (vmsRes.ok) {
        const vmsData = (await vmsRes.json()) as any;
        const entities = vmsData.entities || [];
        vms = entities.map((entity: any) => {
          // Convert storage size or usage
          const diskUsed = entity.storage_usage_bytes || 0;
          const diskCap = entity.storage_capacity_bytes || 1;
          const diskPercent = Number(((diskUsed / diskCap) * 100).toFixed(2));
          
          return {
            name: entity.name,
            diskUsage: `${diskPercent}%`,
            backupStatus: entity.protection_domain_name ? 'successful' : 'N/A'
          };
        });
      }
    } catch (vmErr) {
      console.warn('Could not retrieve VMs detailed list from API:', vmErr);
    }

    const payload = {
      nutanix: {
        uptime: 'Up', // default uptime string or extract if available
        nodesCount,
        storageUsage,
        cpuUsage,
        memoryUsage,
        vms: vms.length ? vms : undefined
      }
    };

    // Post to API Gateway
    const postRes = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (postRes.ok) {
      console.log(`[${new Date().toISOString()}] Nutanix metrics posted successfully.`);
    } else {
      console.error(`[${new Date().toISOString()}] Failed to post Nutanix metrics:`, await postRes.text());
    }
  } catch (err: any) {
    console.error(`[${new Date().toISOString()}] Error in Nutanix collector:`, err.message);
  }
}

// Start polling
console.log('Nutanix collector service started.');
collectNutanixData();
setInterval(collectNutanixData, POLL_INTERVAL);

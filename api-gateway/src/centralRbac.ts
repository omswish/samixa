export const DEFAULT_UNIT_ID = 'utkal';
export const DEFAULT_CLUSTER_ID = 'default-cluster';

export const GLOBAL_ROLES = ['platform_admin', 'central_viewer', 'global_auditor'] as const;
export const CLUSTER_ROLES = ['cluster_head', 'cluster_admin', 'cluster_auditor'] as const;
export const UNIT_ROLES = ['unit_admin', 'unit_operator', 'unit_auditor'] as const;

export type GlobalRole = (typeof GLOBAL_ROLES)[number];
export type ClusterRole = (typeof CLUSTER_ROLES)[number];
export type UnitRole = (typeof UNIT_ROLES)[number];
export type AppRoleKey = GlobalRole | ClusterRole | UnitRole;
export type AppRoleScope = 'global' | 'cluster' | 'unit';

export interface BusinessUnit {
  unitId: string;
  unitCode: string;
  unitName: string;
  enabled: boolean;
  timezone: string;
  metadataJson: Record<string, unknown>;
}

export interface UnitCluster {
  clusterId: string;
  clusterCode: string;
  clusterName: string;
  enabled: boolean;
  sortOrder: number;
  metadataJson: Record<string, unknown>;
}

export interface UnitClusterMembership {
  clusterId: string;
  unitId: string;
  membershipKind: 'primary' | 'secondary';
  sortOrder: number;
}

export const DEFAULT_BUSINESS_UNIT: BusinessUnit = {
  unitId: DEFAULT_UNIT_ID,
  unitCode: 'UAIL',
  unitName: 'Utkal Alumina',
  enabled: true,
  timezone: 'Asia/Kolkata',
  metadataJson: {
    bootstrap: true,
    legacyDefaultUnit: true
  }
};

export const DEFAULT_UNIT_CLUSTER: UnitCluster = {
  clusterId: DEFAULT_CLUSTER_ID,
  clusterCode: 'DEFAULT',
  clusterName: 'Default Operational Cluster',
  enabled: true,
  sortOrder: 100,
  metadataJson: {
    bootstrap: true,
    legacyDefaultCluster: true
  }
};

export const DEFAULT_CLUSTER_MEMBERSHIP: UnitClusterMembership = {
  clusterId: DEFAULT_CLUSTER_ID,
  unitId: DEFAULT_UNIT_ID,
  membershipKind: 'primary',
  sortOrder: 10
};

export interface GlobalRoleGrant {
  userId: number;
  roleKey: GlobalRole;
  expiresAt: string | null;
}

export interface ClusterRoleGrant {
  userId: number;
  clusterId: string;
  roleKey: ClusterRole;
  expiresAt: string | null;
}

export interface UnitRoleGrant {
  userId: number;
  unitId: string;
  roleKey: UnitRole;
  expiresAt: string | null;
}

export function getRoleScope(roleKey: AppRoleKey): AppRoleScope {
  if ((GLOBAL_ROLES as readonly string[]).includes(roleKey)) {
    return 'global';
  }

  if ((CLUSTER_ROLES as readonly string[]).includes(roleKey)) {
    return 'cluster';
  }

  return 'unit';
}

export function isGlobalRole(roleKey: string): roleKey is GlobalRole {
  return (GLOBAL_ROLES as readonly string[]).includes(roleKey);
}

export function isClusterRole(roleKey: string): roleKey is ClusterRole {
  return (CLUSTER_ROLES as readonly string[]).includes(roleKey);
}

export function isUnitRole(roleKey: string): roleKey is UnitRole {
  return (UNIT_ROLES as readonly string[]).includes(roleKey);
}

'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  HardDriveDownload,
  History,
  KeyRound,
  LogOut,
  Play,
  RefreshCw,
  Save,
  ServerCog,
  Settings2,
  ShieldCheck,
  Square,
  RotateCcw
} from 'lucide-react';

type DashboardSession = {
  email: string;
  role: 'viewer' | 'admin';
  displayName: string | null;
  isServerLocal: boolean;
  expiresAt: string;
};

type CollectorTargetSettings = {
  configKey: string | null;
  targetName: string;
  targetUrl: string;
  host: string | null;
  enabled: boolean;
  owner: string | null;
  pollIntervalSeconds: number | null;
  notes: string | null;
  metadata: Record<string, any>;
  username: string | null;
  passwordConfigured: boolean;
  configOrigin: string;
  secretOrigin: string;
  password?: string;
  clearPassword?: boolean;
};

type AdminSettingsPayload = {
  collectors: {
    nutanix: {
      primary: CollectorTargetSettings;
    };
    solarwinds: {
      servers: CollectorTargetSettings;
      networks: CollectorTargetSettings;
    };
    symphony: {
      primary: CollectorTargetSettings;
    };
  };
};

type AppAuthStatus = {
  mode: 'postgres' | 'runtime' | 'env';
  updatedAt: string | null;
  users: {
    admin: {
      custom: boolean;
      source: 'postgres' | 'runtime' | 'env';
      lastLoginAt: string | null;
    };
    operator: {
      custom: boolean;
      source: 'postgres' | 'runtime' | 'env';
      lastLoginAt: string | null;
    };
  };
};

type AppActionAuditRow = {
  auditId: number;
  occurredAt: string;
  actionType: string;
  actionResult: 'success' | 'failed' | 'denied';
  severity: 'info' | 'warning' | 'critical';
  actorUsername: string | null;
  actorRole: 'viewer' | 'admin' | null;
  surface: 'admin' | 'operator' | null;
  sourceIp: string | null;
  userAgent: string | null;
  targetType: string | null;
  targetId: string | null;
  message: string | null;
  errorMessage: string | null;
  requestSummaryJson: unknown;
  resultSummaryJson: unknown;
  correlationId: string | null;
};

type AuditFilterState = {
  actionType: string;
  actionResult: 'all' | 'success' | 'failed' | 'denied';
  actorUsername: string;
  surface: 'all' | 'admin' | 'operator';
  limit: 50 | 100 | 250;
};

type PasswordDraft = {
  adminPassword: string;
  adminConfirm: string;
  operatorPassword: string;
  operatorConfirm: string;
};

type ServiceSnapshot = {
  id: string;
  displayName: string;
  exposedToLan: boolean;
  listen: string | null;
  startupOrder?: number;
  notes: string;
  processStatus: string;
  overallStatus: 'online' | 'warning' | 'error' | 'stopped' | 'unknown';
  healthStatus: string;
  healthSummary: string;
  pid: number | null;
  uptime: string | null;
  lastSync: string | null;
  lastError: string | null;
};

type SessionSnapshot = {
  id: 'symphony' | 'solarwinds';
  displayName: string;
  overallStatus: 'authenticated' | 'partial' | 'missing' | 'invalid' | 'expired' | 'unreachable';
  summary: string;
  targets: Array<{
    id: string;
    label: string;
    exists: boolean;
    valid: boolean;
    sizeBytes: number | null;
    updatedAt: string | null;
    issue: string | null;
    authStatus: 'authenticated' | 'missing' | 'invalid' | 'expired' | 'unreachable';
    authSummary: string | null;
    validatedAt: string | null;
    finalUrl: string | null;
    httpStatus: number | null;
  }>;
};

type AdminTabKey = 'overview' | 'services' | 'sessions' | 'sources' | 'audit' | 'help';

const OPERATOR_PORT = '21060';

const helpDocuments = [
  {
    id: 'prd',
    title: 'PRD',
    detail: 'Product vision, scope, requirements, and acceptance criteria',
    href: '/help/UAIL-IT-Dashboard-PRD.pdf'
  },
  {
    id: 'project-documentation',
    title: 'Project Documentation',
    detail: 'Project baseline, workstreams, and git-history timeline',
    href: '/help/UAIL-IT-Dashboard-Project-Documentation-and-Timeline.pdf'
  },
  {
    id: 'system-design',
    title: 'System Design',
    detail: 'Architecture, runtime topology, and source-of-truth flows',
    href: '/help/UAIL-IT-Dashboard-System-Design.pdf'
  },
  {
    id: 'user-manual',
    title: 'User Manual',
    detail: 'Operator and admin usage guidance',
    href: '/help/UAIL-IT-Dashboard-User-Manual.pdf'
  },
  {
    id: 'developer-handbook',
    title: 'Developer Handbook',
    detail: 'Repository structure, workflows, and maintenance rules',
    href: '/help/UAIL-IT-Dashboard-Developer-Handbook.pdf'
  }
] as const;

type HelpDocumentId = (typeof helpDocuments)[number]['id'];

function cloneSettings(settings: AdminSettingsPayload) {
  return JSON.parse(JSON.stringify(settings)) as AdminSettingsPayload;
}

function parseLines(text: string) {
  return text
    .split(/\r?\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildSurfaceUrl(pathname: string, port: string) {
  const nextUrl = new URL(window.location.href);
  nextUrl.port = port;
  nextUrl.pathname = pathname;
  nextUrl.search = '';
  return nextUrl.toString();
}

function hasUrlScheme(value: string) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value);
}

function trimAuthorityInput(value: string | null | undefined) {
  return (value || '')
    .trim()
    .replace(/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//, '')
    .replace(/^\/\//, '')
    .split(/[/?#]/, 1)[0]
    .trim();
}

function parsePortValue(value: string | null | undefined) {
  const trimmed = (value || '').trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65535 ? parsed : null;
}

function parseAuthorityParts(value: string | null | undefined) {
  const authority = trimAuthorityInput(value);
  if (!authority) {
    return { hostname: null, port: null as number | null };
  }

  if (authority.startsWith('[')) {
    const closingBracketIndex = authority.indexOf(']');
    if (closingBracketIndex === -1) {
      return { hostname: authority, port: null as number | null };
    }

    const hostname = authority.slice(1, closingBracketIndex).trim() || null;
    const remainder = authority.slice(closingBracketIndex + 1);
    const portMatches = [...remainder.matchAll(/:(\d{1,5})/g)];
    return {
      hostname,
      port: parsePortValue(portMatches.at(-1)?.[1] ?? null)
    };
  }

  const segments = authority.split(':').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 0) {
    return { hostname: null, port: null as number | null };
  }

  const numericPortSegment = [...segments.slice(1)].reverse().find((segment) => /^\d{1,5}$/.test(segment));
  return {
    hostname: segments[0] || null,
    port: parsePortValue(numericPortSegment ?? null)
  };
}

function normalizeNutanixTargetUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(hasUrlScheme(trimmed) ? trimmed : `https://${trimmed}`);
    return `https://${parsed.hostname}:${parsed.port || '9440'}`;
  } catch {
    const { hostname, port } = parseAuthorityParts(trimmed);
    if (!hostname) {
      return trimmed;
    }

    return `https://${hostname}:${port || 9440}`;
  }
}

function parseUrlHostname(value: string) {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function renderPasswordStatus(target: CollectorTargetSettings) {
  if (target.clearPassword) {
    return 'Will be cleared on save';
  }

  if (target.password) {
    return 'Will be replaced on save';
  }

  return target.passwordConfigured ? 'Configured' : 'Not configured';
}

function toneStyles(status: ServiceSnapshot['overallStatus'] | SessionSnapshot['overallStatus']) {
  switch (status) {
    case 'online':
    case 'authenticated':
      return { color: '#2e7d32', background: 'rgba(46,125,50,0.10)', border: 'rgba(46,125,50,0.20)' };
    case 'warning':
    case 'partial':
    case 'expired':
      return { color: '#ef6c00', background: 'rgba(239,108,0,0.10)', border: 'rgba(239,108,0,0.20)' };
    case 'error':
    case 'invalid':
    case 'unreachable':
      return { color: '#c62828', background: 'rgba(198,40,40,0.10)', border: 'rgba(198,40,40,0.20)' };
    case 'stopped':
    case 'missing':
      return { color: '#455a64', background: 'rgba(69,90,100,0.10)', border: 'rgba(69,90,100,0.20)' };
    default:
      return { color: '#5d4037', background: 'rgba(93,64,55,0.10)', border: 'rgba(93,64,55,0.18)' };
  }
}

function sessionStatusLabel(status: SessionSnapshot['overallStatus']) {
  switch (status) {
    case 'authenticated':
      return 'AUTH OK';
    case 'expired':
      return 'EXPIRED';
    case 'unreachable':
      return 'UNREACHABLE';
    default:
      return status.toUpperCase();
  }
}

function joinDetails(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part && part.trim())).join(' | ');
}

function createEmptyPasswordDraft(): PasswordDraft {
  return {
    adminPassword: '',
    adminConfirm: '',
    operatorPassword: '',
    operatorConfirm: ''
  };
}

function createDefaultAuditFilters(): AuditFilterState {
  return {
    actionType: '',
    actionResult: 'all',
    actorUsername: '',
    surface: 'all',
    limit: 50
  };
}

function formatAuditTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('en-IN', {
    hour12: false,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function stringifyAuditJson(value: unknown) {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AdminPage() {
  const [session, setSession] = useState<DashboardSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [services, setServices] = useState<ServiceSnapshot[]>([]);
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [draft, setDraft] = useState<AdminSettingsPayload | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [selectedHelpDocId, setSelectedHelpDocId] = useState<HelpDocumentId>('prd');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceBusy, setServiceBusy] = useState<string | null>(null);
  const [sessionBusy, setSessionBusy] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState<AppAuthStatus | null>(null);
  const [passwordDraft, setPasswordDraft] = useState<PasswordDraft>(() => createEmptyPasswordDraft());
  const [auditRows, setAuditRows] = useState<AppActionAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoadedAt, setAuditLoadedAt] = useState<string | null>(null);
  const [auditFilters, setAuditFilters] = useState<AuditFilterState>(() => createDefaultAuditFilters());
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hsdImportRef = useRef<HTMLInputElement | null>(null);
  const solarwindsImportRef = useRef<HTMLInputElement | null>(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [servicesResponse, sessionsResponse, settingsResponse, authStatusResponse] = await Promise.all([
        fetch('/api/admin/services', { cache: 'no-store' }),
        fetch('/api/admin/sessions', { cache: 'no-store' }),
        fetch('/api/admin/settings', { cache: 'no-store' }),
        fetch('/api/admin/app-auth', { cache: 'no-store' })
      ]);

      const [servicesPayload, sessionsPayload, settingsPayload, authStatusPayload] = await Promise.all([
        servicesResponse.json().catch(() => ({})),
        sessionsResponse.json().catch(() => ({})),
        settingsResponse.json().catch(() => ({})),
        authStatusResponse.json().catch(() => ({}))
      ]);

      if (!servicesResponse.ok) {
        throw new Error(servicesPayload.error || 'Failed to load services.');
      }
      if (!sessionsResponse.ok) {
        throw new Error(sessionsPayload.error || 'Failed to load session status.');
      }
      if (!settingsResponse.ok) {
        throw new Error(settingsPayload.error || 'Failed to load settings.');
      }
      if (!authStatusResponse.ok) {
        throw new Error(authStatusPayload.error || 'Failed to load portal password status.');
      }

      setServices(servicesPayload.services || []);
      setSessions(sessionsPayload.sessions || []);
      setDraft(cloneSettings(settingsPayload));
      setAuthStatus(authStatusPayload);
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to load admin console.');
    } finally {
      setLoading(false);
    }
  };

  const loadAudit = async (filters: AuditFilterState = auditFilters) => {
    setAuditLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (filters.actionType.trim()) {
        query.set('actionType', filters.actionType.trim());
      }
      if (filters.actionResult !== 'all') {
        query.set('actionResult', filters.actionResult);
      }
      if (filters.actorUsername.trim()) {
        query.set('actorUsername', filters.actorUsername.trim());
      }
      if (filters.surface !== 'all') {
        query.set('surface', filters.surface);
      }
      query.set('limit', String(filters.limit));

      const response = await fetch(`/api/admin/audit?${query.toString()}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to load audit records.');
      }

      setAuditRows(Array.isArray(payload.rows) ? payload.rows : []);
      setAuditLoadedAt(new Date().toISOString());
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to load audit records.');
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void fetch('/api/auth/session', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error || 'Authentication required.');
        }

        if (!cancelled) {
          if (payload.session?.role !== 'admin') {
            window.location.replace('/');
            return;
          }

          setSession(payload.session);
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.location.replace('/login');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSessionLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!session || session.role !== 'admin') {
      return;
    }

    void loadAll();
  }, [session]);

  useEffect(() => {
    if (!session || session.role !== 'admin' || activeTab !== 'audit') {
      return;
    }

    void loadAudit(auditFilters);
  }, [session, activeTab]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.replace('/login');
    }
  };

  const handleExportAuditCsv = () => {
    const query = new URLSearchParams();
    if (auditFilters.actionType.trim()) {
      query.set('actionType', auditFilters.actionType.trim());
    }
    if (auditFilters.actionResult !== 'all') {
      query.set('actionResult', auditFilters.actionResult);
    }
    if (auditFilters.actorUsername.trim()) {
      query.set('actorUsername', auditFilters.actorUsername.trim());
    }
    if (auditFilters.surface !== 'all') {
      query.set('surface', auditFilters.surface);
    }
    query.set('limit', String(auditFilters.limit));
    query.set('format', 'xls');
    window.location.assign(`/api/admin/audit?${query.toString()}`);
  };

  const updateTarget = (
    source: 'nutanix' | 'symphony',
    patch: Partial<CollectorTargetSettings>
  ) => {
    setDraft((current) => current ? {
      ...current,
      collectors: {
        ...current.collectors,
        [source]: {
          primary: {
            ...current.collectors[source].primary,
            ...patch
          }
        }
      }
    } : current);
  };

  const updateSolarwindsTarget = (
    targetName: 'servers' | 'networks',
    patch: Partial<CollectorTargetSettings>
  ) => {
    setDraft((current) => current ? {
      ...current,
      collectors: {
        ...current.collectors,
        solarwinds: {
          ...current.collectors.solarwinds,
          [targetName]: {
            ...current.collectors.solarwinds[targetName],
            ...patch
          }
        }
      }
    } : current);
  };

  const handleSave = async () => {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify(draft)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save admin settings.');
      }

      setDraft(cloneSettings(payload));
      setMessage('Source settings saved successfully.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to save admin settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleServiceAction = async (action: 'start' | 'stop' | 'restart' | 'restart-all', target: string) => {
    setServiceBusy(`${action}:${target}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/services', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action, target })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Service action failed.');
      }

      setMessage(payload.message || 'Service action sent.');
      await loadAll();
    } catch (nextError: any) {
      setError(nextError?.message || 'Service action failed.');
    } finally {
      setServiceBusy(null);
    }
  };

  const handleImport = async (workflowId: 'symphony' | 'solarwinds', file: File | null) => {
    if (!file) {
      return;
    }

    setSessionBusy(`import:${workflowId}`);
    setError(null);
    setMessage(null);
    try {
      const raw = await file.text();
      const storageState = JSON.parse(raw);
      const response = await fetch('/api/admin/sessions/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ workflowId, storageState })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Session import failed.');
      }

      setMessage(payload.message || 'Session imported successfully.');
      await loadAll();
    } catch (nextError: any) {
      setError(nextError?.message || 'Session import failed.');
    } finally {
      setSessionBusy(null);
    }
  };

  const handleLaunchReauth = async (
    workflowId: 'symphony' | 'solarwinds',
    mode: 'interactive' | 'legacy-profile' = 'interactive'
  ) => {
    setSessionBusy(`${mode}:${workflowId}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/sessions/launch-reauth', {
        method: 'POST',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({ workflowId, mode })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || (mode === 'legacy-profile'
          ? 'Failed to launch legacy profile import.'
          : 'Failed to launch reauthentication.'));
      }

      setMessage(payload.message || (mode === 'legacy-profile'
        ? 'Legacy profile import launched.'
        : 'Interactive reauthentication launched.'));
    } catch (nextError: any) {
      setError(nextError?.message || (mode === 'legacy-profile'
        ? 'Failed to launch legacy profile import.'
        : 'Failed to launch reauthentication.'));
    } finally {
      setSessionBusy(null);
    }
  };

  const handleSavePortalPasswords = async () => {
    const adminPassword = passwordDraft.adminPassword.trim();
    const adminConfirm = passwordDraft.adminConfirm.trim();
    const operatorPassword = passwordDraft.operatorPassword.trim();
    const operatorConfirm = passwordDraft.operatorConfirm.trim();

    if (!adminPassword && !operatorPassword) {
      setError('Enter at least one password to update.');
      setMessage(null);
      return;
    }

    if (adminPassword && adminPassword !== adminConfirm) {
      setError('Admin password confirmation does not match.');
      setMessage(null);
      return;
    }

    if (operatorPassword && operatorPassword !== operatorConfirm) {
      setError('Operator password confirmation does not match.');
      setMessage(null);
      return;
    }

    setAuthBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/app-auth', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          adminPassword: adminPassword || undefined,
          operatorPassword: operatorPassword || undefined
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to update portal passwords.');
      }

      setAuthStatus(payload.status || null);
      setPasswordDraft(createEmptyPasswordDraft());
      setMessage(payload.message || 'Portal password updated.');
    } catch (nextError: any) {
      setError(nextError?.message || 'Failed to update portal passwords.');
    } finally {
      setAuthBusy(false);
    }
  };

  if (sessionLoading || !session) {
    return (
      <main style={loadingShellStyle}>
        <RefreshCw size={28} className="animate-spin" style={{ color: '#1565c0' }} />
        <span style={{ color: '#5d4037' }}>Validating admin access...</span>
      </main>
    );
  }

  const servicesOnline = services.filter((entry) => entry.overallStatus === 'online').length;
  const sessionsAvailable = sessions.filter((entry) => entry.overallStatus === 'authenticated').length;
  const enabledTargets = draft
    ? [
        draft.collectors.nutanix.primary.enabled,
        draft.collectors.solarwinds.servers.enabled,
        draft.collectors.solarwinds.networks.enabled,
        draft.collectors.symphony.primary.enabled
      ].filter(Boolean).length
    : 0;
  const servicesAttention = services.filter((entry) => entry.overallStatus !== 'online').length;
  const sessionsAttention = sessions.filter((entry) => entry.overallStatus !== 'authenticated').length;
  const selectedHelpDocument = helpDocuments.find((entry) => entry.id === selectedHelpDocId) ?? helpDocuments[0];

  const tabs: Array<{
    key: AdminTabKey;
    label: string;
    detail: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'overview',
      label: 'Overview',
      detail: 'Stack health and quick actions',
      icon: <ShieldCheck size={16} />
    },
    {
      key: 'services',
      label: 'Services',
      detail: 'Run state and restart controls',
      icon: <ServerCog size={16} />
    },
    {
      key: 'sessions',
      label: 'Sessions',
      detail: 'Imports and reauthentication',
      icon: <KeyRound size={16} />
    },
    {
      key: 'sources',
      label: 'Sources',
      detail: 'Collector endpoints and credentials',
      icon: <Settings2 size={16} />
    },
    {
      key: 'audit',
      label: 'Audit',
      detail: 'Admin actions and login trail',
      icon: <History size={16} />
    },
    {
      key: 'help',
      label: 'Help',
      detail: 'Embedded PDFs and reference material',
      icon: <BookOpenText size={16} />
    }
  ];

  const sessionTargetCount = sessions.reduce((total, workflow) => total + workflow.targets.length, 0);
  const authenticatedSessionTargets = sessions.reduce(
    (total, workflow) => total + workflow.targets.filter((target) => target.authStatus === 'authenticated').length,
    0
  );
  const workflowScopes = [
    {
      key: 'services' as const,
      title: 'Runtime control',
      detail: 'Start, stop, or restart stack components and check current health.',
      count: `${servicesAttention} need action`
    },
    {
      key: 'sessions' as const,
      title: 'Portal access',
      detail: 'Recover HSD and SolarWinds sessions, import state files, and reauthenticate.',
      count: `${sessionsAttention} need renewal`
    },
    {
      key: 'sources' as const,
      title: 'Collector setup',
      detail: 'Manage app passwords, source URLs, credentials, and source-specific selectors.',
      count: `${enabledTargets}/4 enabled`
    },
    {
      key: 'audit' as const,
      title: 'Traceability',
      detail: 'Review application actions and export the detailed event log for offline analysis.',
      count: `${auditRows.length} loaded`
    },
    {
      key: 'help' as const,
      title: 'Reference pack',
      detail: 'Open PRD, design, timeline, handbook, and user manual PDFs from the console.',
      count: `${helpDocuments.length} docs`
    }
  ];

  const renderOverviewPanel = () => (
    <div style={panelScrollerStyle}>
      <section style={workflowLaneGridStyle}>
        <div className="glass-panel" style={heroPanelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Command Center</h2>
              <div style={panelHintStyle}>First stop for current posture, urgent remediation, and routing into the correct workflow lane.</div>
            </div>
            <span style={{ ...statusChipStyle, color: '#1565c0', background: 'rgba(21,101,192,0.10)', borderColor: 'rgba(21,101,192,0.20)' }}>
              CONTROL LIVE
            </span>
          </div>

          <div style={workflowStatGridStyle}>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Stack health</div>
              <div style={workflowStatValueStyle}>{servicesOnline}/{services.length}</div>
              <div style={workflowStatDetailStyle}>{servicesAttention} services need action</div>
            </div>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Portal access</div>
              <div style={workflowStatValueStyle}>{authenticatedSessionTargets}/{sessionTargetCount || 1}</div>
              <div style={workflowStatDetailStyle}>{sessionsAttention} workflows need renewal</div>
            </div>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Collector targets</div>
              <div style={workflowStatValueStyle}>{enabledTargets}/4</div>
              <div style={workflowStatDetailStyle}>Saved endpoints currently enabled</div>
            </div>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Document library</div>
              <div style={workflowStatValueStyle}>{helpDocuments.length}</div>
              <div style={workflowStatDetailStyle}>Embedded PDFs mirrored for admins</div>
            </div>
          </div>

          <div style={workflowActionBarStyle}>
            <button type="button" onClick={() => window.location.assign(buildSurfaceUrl('/', OPERATOR_PORT))} style={secondaryButtonStyle}>
              <ShieldCheck size={16} />
              Open Operator View
            </button>
            <button type="button" onClick={() => void loadAll()} style={secondaryButtonStyle}>
              <RefreshCw size={16} />
              Refresh Console
            </button>
            <button type="button" onClick={() => void handleServiceAction('restart-all', 'stack')} disabled={serviceBusy !== null} style={primaryButtonStyle(serviceBusy !== null)}>
              <RotateCcw size={16} />
              Restart Entire Stack
            </button>
          </div>
        </div>

        <div className="glass-panel" style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Workflow Lanes</h2>
              <div style={panelHintStyle}>Each lane isolates one admin task scope so source edits, session work, and service control do not compete visually.</div>
            </div>
          </div>

          <div style={workflowScopeGridStyle}>
            {workflowScopes.map((scope) => (
              <button
                key={scope.key}
                type="button"
                onClick={() => setActiveTab(scope.key)}
                style={workflowScopeButtonStyle(activeTab === scope.key)}
              >
                <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{scope.title}</div>
                  <div style={{ fontSize: '0.79rem', color: 'var(--text-secondary)' }}>{scope.detail}</div>
                </div>
                <span style={overviewNavPillStyle}>{scope.count}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section style={overviewBottomGridStyle}>
        <div className="glass-panel" style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Service Snapshot</h2>
              <div style={panelHintStyle}>Core stack and collectors, reduced to one-line health rows for faster triage.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            {loading ? (
              <div style={loadingRowStyle}>
                <RefreshCw size={18} className="animate-spin" />
                Loading service state...
              </div>
            ) : services.map((service) => {
              const tone = toneStyles(service.overallStatus);
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setActiveTab('services')}
                  style={overviewListRowStyle}
                >
                  <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{service.displayName}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      {joinDetails([
                        service.healthSummary,
                        service.listen || 'No direct listen socket',
                        service.lastSync ? `Last sync ${service.lastSync}` : null
                      ])}
                    </div>
                  </div>
                  <span style={{ ...statusChipStyle, color: tone.color, background: tone.background, borderColor: tone.border }}>
                    {service.overallStatus.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="glass-panel" style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h2 style={panelTitleStyle}>Source Readiness</h2>
              <div style={panelHintStyle}>Session validity, saved endpoints, and operator access in one compact audit lane.</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '10px' }}>
            <button type="button" onClick={() => setActiveTab('sessions')} style={overviewListRowStyle}>
              <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Session workflows</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {authenticatedSessionTargets}/{sessionTargetCount || 1} authenticated targets across HSD and SolarWinds
                </div>
              </div>
              <span style={overviewNavPillStyle}>{sessions.length} workflows</span>
            </button>
            <button type="button" onClick={() => setActiveTab('sources')} style={overviewListRowStyle}>
              <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Collector target state</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {enabledTargets}/4 endpoints enabled, credentials managed from the shared source lane
                </div>
              </div>
              <span style={overviewNavPillStyle}>Open lane</span>
            </button>
            <button type="button" onClick={() => setActiveTab('help')} style={overviewListRowStyle}>
              <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Reference library</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  PRD, timeline, design, handbook, and user manual embedded for server-side review
                </div>
              </div>
              <span style={overviewNavPillStyle}>{helpDocuments.length} PDFs</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderServicesPanel = () => {
    const serviceGroups = [
      {
        title: 'Shared web stack',
        detail: 'Gateway, UI, and frontdoor processes that must remain consistent for both admin and operator access.',
        services: services.filter((service) => ['api-gateway', 'dashboard-ui', 'dashboard-frontdoor-operator', 'dashboard-frontdoor-admin'].includes(service.id))
      },
      {
        title: 'Collectors',
        detail: 'Source-facing workers for Nutanix, SolarWinds, and HSD.',
        services: services.filter((service) => !['api-gateway', 'dashboard-ui', 'dashboard-frontdoor-operator', 'dashboard-frontdoor-admin'].includes(service.id))
      }
    ];

    return (
      <section className="glass-panel" style={contentPanelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 style={panelTitleStyle}>Services</h2>
            <div style={panelHintStyle}>Compact service rows with current health, endpoint context, and scoped restart actions.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void loadAll()} style={secondaryButtonStyle}>
              <RefreshCw size={14} />
              Refresh state
            </button>
            <button type="button" onClick={() => void handleServiceAction('restart-all', 'stack')} disabled={serviceBusy !== null} style={primaryButtonStyle(serviceBusy !== null)}>
              <RotateCcw size={14} />
              Restart Stack
            </button>
          </div>
        </div>

        <div style={workflowStatGridStyle}>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Online</div>
            <div style={workflowStatValueStyle}>{servicesOnline}</div>
            <div style={workflowStatDetailStyle}>Services reporting healthy</div>
          </div>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Attention</div>
            <div style={workflowStatValueStyle}>{servicesAttention}</div>
            <div style={workflowStatDetailStyle}>Processes or health probes need review</div>
          </div>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>LAN listeners</div>
            <div style={workflowStatValueStyle}>{services.filter((service) => service.exposedToLan).length}</div>
            <div style={workflowStatDetailStyle}>Frontdoor surfaces exposed to clients</div>
          </div>
        </div>

        {loading ? (
          <div style={loadingRowStyle}>
            <RefreshCw size={18} className="animate-spin" />
            Loading service state...
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '14px' }}>
            {serviceGroups.map((group) => (
              <div key={group.title} style={scopeSectionStyle}>
                <div style={scopeSectionHeaderStyle}>
                  <div>
                    <div style={scopeSectionTitleStyle}>{group.title}</div>
                    <div style={scopeSectionHintStyle}>{group.detail}</div>
                  </div>
                  <span style={metaPillStyle}>{group.services.length} items</span>
                </div>

                <div style={{ display: 'grid', gap: '10px' }}>
                  {group.services.map((service) => {
                    const tone = toneStyles(service.overallStatus);
                    const endpointDetails = joinDetails([
                      service.listen || 'No direct listen socket',
                      service.pid ? `PID ${service.pid}` : null,
                      service.uptime ? `Uptime ${service.uptime}` : null
                    ]);
                    const healthDetails = joinDetails([
                      service.healthSummary,
                      service.lastSync ? `Last sync ${service.lastSync}` : null,
                      service.lastError || null
                    ]);

                    return (
                      <div key={service.id} style={serviceRowStyle}>
                        <div style={serviceRowMainStyle}>
                          <div style={{ display: 'grid', gap: '4px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{service.displayName}</div>
                              <span style={{ ...statusChipStyle, color: tone.color, background: tone.background, borderColor: tone.border }}>
                                {service.overallStatus.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{service.notes}</div>
                          </div>

                          <div style={metaRowStyle}>
                            <span style={metaPillStyle}>{service.exposedToLan ? 'LAN exposed' : 'Loopback only'}</span>
                            <span style={metaPillStyle}>Startup order {service.startupOrder ?? '-'}</span>
                            {endpointDetails ? <span style={metaPillStyle}>{endpointDetails}</span> : null}
                          </div>

                          <div style={serviceHealthStyle}>
                            <strong style={{ color: 'var(--text-primary)' }}>{service.healthSummary}</strong>
                            {healthDetails ? <span>{healthDetails}</span> : null}
                          </div>
                        </div>

                        <div style={serviceActionRailStyle}>
                          <button type="button" onClick={() => void handleServiceAction('start', service.id)} disabled={serviceBusy !== null} style={secondaryButtonStyle}>
                            <Play size={14} />
                            Start
                          </button>
                          <button type="button" onClick={() => void handleServiceAction('stop', service.id)} disabled={serviceBusy !== null} style={secondaryButtonStyle}>
                            <Square size={14} />
                            Stop
                          </button>
                          <button type="button" onClick={() => void handleServiceAction('restart', service.id)} disabled={serviceBusy !== null} style={secondaryButtonStyle}>
                            <RotateCcw size={14} />
                            Restart
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  const renderSessionsPanel = () => (
    <section className="glass-panel" style={contentPanelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>Sessions</h2>
          <div style={panelHintStyle}>Recovery lane for live portal access, imported browser state, and server-local reauthentication workflows.</div>
        </div>
        <button type="button" onClick={() => void loadAll()} style={secondaryButtonStyle}>
          <RefreshCw size={14} />
          Refresh state
        </button>
      </div>

      <input ref={hsdImportRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(event) => void handleImport('symphony', event.target.files?.[0] || null)} />
      <input ref={solarwindsImportRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(event) => void handleImport('solarwinds', event.target.files?.[0] || null)} />

      <div style={workflowLaneGridStyle}>
        <div className="glass-panel" style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <h3 style={panelTitleStyle}>Recovery Guidance</h3>
              <div style={panelHintStyle}>Session tasks are separated from source edits so credentials and cookies are never changed in the same lane by accident.</div>
            </div>
          </div>
          <div style={guideListStyle}>
            <div style={guideStepStyle}>
              <strong style={{ color: 'var(--text-primary)' }}>1. Validate current state</strong>
              <span>Use the session status on each workflow card before restarting any collectors.</span>
            </div>
            <div style={guideStepStyle}>
              <strong style={{ color: 'var(--text-primary)' }}>2. Import only trusted storage-state JSON</strong>
              <span>Imports replace the saved browser state on the server for the selected workflow.</span>
            </div>
            <div style={guideStepStyle}>
              <strong style={{ color: 'var(--text-primary)' }}>3. Reauthenticate from the host when required</strong>
              <span>HSD reauth stops the HSD collector first; after login, restart the collector from the Services lane.</span>
            </div>
          </div>
          <div style={metaRowStyle}>
            <span style={metaPillStyle}>{authenticatedSessionTargets}/{sessionTargetCount || 1} authenticated targets</span>
            {session?.isServerLocal ? <span style={metaPillStyle}>Server-local helper available</span> : <span style={metaPillStyle}>Remote viewer mode</span>}
          </div>
        </div>

        <div style={{ display: 'grid', gap: '12px' }}>
          {loading ? (
            <div style={loadingRowStyle}>
              <RefreshCw size={18} className="animate-spin" />
              Loading session state...
            </div>
          ) : sessions.map((workflow) => {
            const tone = toneStyles(workflow.overallStatus);
            return (
              <div key={workflow.id} style={compactCardStyle}>
                <div style={compactCardHeaderStyle}>
                  <div style={{ display: 'grid', gap: '4px' }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{workflow.displayName}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{workflow.summary}</div>
                  </div>
                  <span style={{ ...statusChipStyle, color: tone.color, background: tone.background, borderColor: tone.border }}>
                    {sessionStatusLabel(workflow.overallStatus)}
                  </span>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  {workflow.targets.map((target) => (
                    <div key={target.id} style={sessionTargetRowStyle}>
                      <div style={{ display: 'grid', gap: '4px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{target.label}</strong>
                        <span style={{ fontSize: '0.79rem', color: 'var(--text-secondary)' }}>
                          {joinDetails([
                            target.updatedAt ? `Updated ${target.updatedAt}` : 'Not present',
                            target.validatedAt ? `Checked ${target.validatedAt}` : null
                          ])}
                        </span>
                      </div>
                      <div style={metaRowStyle}>
                        {target.sizeBytes ? <span style={metaPillStyle}>{(target.sizeBytes / 1024).toFixed(1)} KB</span> : null}
                        {target.issue ? <span style={{ ...metaPillStyle, color: '#b3261e' }}>{target.issue}</span> : null}
                        {target.authSummary ? <span style={metaPillStyle}>{target.authSummary}</span> : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={compactActionRowStyle}>
                  <button
                    type="button"
                    onClick={() => (workflow.id === 'symphony' ? hsdImportRef.current : solarwindsImportRef.current)?.click()}
                    disabled={sessionBusy !== null}
                    style={secondaryButtonStyle}
                  >
                    <HardDriveDownload size={14} />
                    Import Session
                  </button>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {session?.isServerLocal ? (
                      <button
                        type="button"
                        onClick={() => void handleLaunchReauth(workflow.id)}
                        disabled={sessionBusy !== null}
                        style={secondaryButtonStyle}
                      >
                        <KeyRound size={14} />
                        {workflow.id === 'symphony' ? 'Stop Collector + Reauth' : 'Launch Reauth on Server'}
                      </button>
                    ) : null}
                    {session?.isServerLocal && workflow.id === 'symphony' ? (
                      <button
                        type="button"
                        onClick={() => void handleLaunchReauth('symphony', 'legacy-profile')}
                        disabled={sessionBusy !== null}
                        style={secondaryButtonStyle}
                      >
                        <HardDriveDownload size={14} />
                        Import Legacy HSD Profile
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );

  const renderSourcesPanel = () => (
    <section className="glass-panel" style={contentPanelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>Source Configuration</h2>
          <div style={panelHintStyle}>Separated control areas for app access, endpoint configuration, and source-specific metadata.</div>
        </div>
        <button type="button" onClick={() => void handleSave()} disabled={saving || !draft} style={primaryButtonStyle(saving || !draft)}>
          <Save size={16} />
          {saving ? 'Saving...' : 'Save Sources'}
        </button>
      </div>

      {!draft ? (
        <div style={loadingRowStyle}>
          <RefreshCw size={18} className="animate-spin" />
          Loading source settings...
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '14px' }}>
          <div style={workflowStatGridStyle}>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Password mode</div>
              <div style={workflowStatValueStyle}>
                {authStatus?.mode === 'postgres'
                  ? 'PG'
                  : authStatus?.mode === 'runtime'
                    ? 'RT'
                    : 'ENV'}
              </div>
              <div style={workflowStatDetailStyle}>Admin and operator login source</div>
            </div>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Targets enabled</div>
              <div style={workflowStatValueStyle}>{enabledTargets}/4</div>
              <div style={workflowStatDetailStyle}>Collectors currently active</div>
            </div>
            <div style={workflowStatCardStyle}>
              <div style={workflowStatCaptionStyle}>Save discipline</div>
              <div style={workflowStatValueStyle}>1</div>
              <div style={workflowStatDetailStyle}>Edit endpoints here, then verify from Services or Sessions</div>
            </div>
          </div>

          <div style={workflowLaneCompactStyle}>
            <div className="glass-panel" style={sourceAccessPanelStyle}>
              <div style={panelHeaderStyle}>
                <div>
                  <h3 style={panelTitleStyle}>Application Access</h3>
                  <div style={panelHintStyle}>Admin-only lane for changing the web login passwords. Leave fields blank to keep the current values.</div>
                </div>
                <button type="button" onClick={() => void handleSavePortalPasswords()} disabled={authBusy} style={primaryButtonStyle(authBusy)}>
                  <Save size={16} />
                  {authBusy ? 'Saving...' : 'Save Passwords'}
                </button>
              </div>

              <div style={metaRowStyle}>
                <span style={metaPillStyle}>
                  Mode {
                    authStatus?.mode === 'postgres'
                      ? 'Postgres primary'
                      : authStatus?.mode === 'runtime'
                        ? 'Runtime override'
                        : 'Environment default'
                  }
                </span>
                <span style={metaPillStyle}>Admin {authStatus?.users.admin.source || 'env'}</span>
                <span style={metaPillStyle}>Operator {authStatus?.users.operator.source || 'env'}</span>
                {authStatus?.updatedAt ? <span style={metaPillStyle}>Updated {new Date(authStatus.updatedAt).toLocaleString()}</span> : null}
                {authStatus?.users.admin.lastLoginAt ? <span style={metaPillStyle}>Admin login {new Date(authStatus.users.admin.lastLoginAt).toLocaleString()}</span> : null}
                {authStatus?.users.operator.lastLoginAt ? <span style={metaPillStyle}>Operator login {new Date(authStatus.users.operator.lastLoginAt).toLocaleString()}</span> : null}
              </div>

              <div style={sourceFieldGridStyle}>
                <label style={fieldBlockStyle}>
                  Admin password
                  <input
                    type="password"
                    value={passwordDraft.adminPassword}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, adminPassword: event.target.value }))}
                    placeholder="Leave blank to keep unchanged"
                    style={fieldStyle}
                  />
                </label>
                <label style={fieldBlockStyle}>
                  Confirm admin password
                  <input
                    type="password"
                    value={passwordDraft.adminConfirm}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, adminConfirm: event.target.value }))}
                    placeholder="Repeat admin password"
                    style={fieldStyle}
                  />
                </label>
                <label style={fieldBlockStyle}>
                  Operator password
                  <input
                    type="password"
                    value={passwordDraft.operatorPassword}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, operatorPassword: event.target.value }))}
                    placeholder="Leave blank to keep unchanged"
                    style={fieldStyle}
                  />
                </label>
                <label style={fieldBlockStyle}>
                  Confirm operator password
                  <input
                    type="password"
                    value={passwordDraft.operatorConfirm}
                    onChange={(event) => setPasswordDraft((current) => ({ ...current, operatorConfirm: event.target.value }))}
                    placeholder="Repeat operator password"
                    style={fieldStyle}
                  />
                </label>
              </div>

              <div style={guideListStyle}>
                <div style={guideStepStyle}>
                  <strong style={{ color: 'var(--text-primary)' }}>Change passwords only when needed</strong>
                  <span>Leave all fields blank to keep the current admin and operator credentials unchanged.</span>
                </div>
                <div style={guideStepStyle}>
                  <strong style={{ color: 'var(--text-primary)' }}>Separate app access from source credentials</strong>
                  <span>These passwords control dashboard login only. Nutanix, SolarWinds, and HSD credentials stay in their own source cards.</span>
                </div>
                <div style={guideStepStyle}>
                  <strong style={{ color: 'var(--text-primary)' }}>Verify after saving</strong>
                  <span>After saving, confirm authentication and collector behavior from the Services and Sessions lanes.</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: '12px' }}>
              <div style={scopeSectionStyle}>
                <div style={scopeSectionHeaderStyle}>
                  <div>
                    <div style={scopeSectionTitleStyle}>Collector endpoints</div>
                    <div style={scopeSectionHintStyle}>One card per source domain, with endpoint, credentials, polling cadence, and source-specific selectors.</div>
                  </div>
                  <span style={metaPillStyle}>Save once after all changes</span>
                </div>

                <div style={sourceGridStyle}>
                  {renderTargetCard(
                    'HSD / Symphony',
                    draft.collectors.symphony.primary,
                    (patch) => updateTarget('symphony', patch),
                    <label style={fieldBlockStyle}>
                      Exact workgroup
                      <textarea
                        value={String(draft.collectors.symphony.primary.metadata.exactWorkgroup || '')}
                        onChange={(event) => updateTarget('symphony', {
                          metadata: {
                            ...draft.collectors.symphony.primary.metadata,
                            exactWorkgroup: event.target.value
                          }
                        })}
                        rows={2}
                        style={textAreaStyle}
                      />
                    </label>,
                    {
                      description: 'Session-dependent service desk source and exact queue/workgroup mapping.'
                    }
                  )}

                  {renderTargetCard(
                    'Nutanix',
                    draft.collectors.nutanix.primary,
                    (patch) => updateTarget('nutanix', patch),
                    undefined,
                    {
                      normalizeTargetUrl: normalizeNutanixTargetUrlInput,
                      targetUrlHint: 'Accepted: host, https://host, or https://host:9440. Saved as canonical Prism URL.',
                      description: 'Primary HCI truth source when available.'
                    }
                  )}

                  {renderTargetCard(
                    'SolarWinds Servers (45)',
                    draft.collectors.solarwinds.servers,
                    (patch) => updateSolarwindsTarget('servers', patch),
                    <label style={fieldBlockStyle}>
                      Monitored servers
                      <textarea
                        value={(draft.collectors.solarwinds.servers.metadata.monitoredServers || []).join('\n')}
                        onChange={(event) => updateSolarwindsTarget('servers', {
                          metadata: {
                            ...draft.collectors.solarwinds.servers.metadata,
                            monitoredServers: parseLines(event.target.value)
                          }
                        })}
                        rows={4}
                        style={textAreaStyle}
                      />
                    </label>,
                    {
                      description: 'Server portal source for on-prem visibility and fallback data.'
                    }
                  )}

                  {renderTargetCard(
                    'SolarWinds Networks (46)',
                    draft.collectors.solarwinds.networks,
                    (patch) => updateSolarwindsTarget('networks', patch),
                    <label style={fieldBlockStyle}>
                      Network object IDs
                      <textarea
                        value={(draft.collectors.solarwinds.networks.metadata.networkObjectIds || []).join('\n')}
                        onChange={(event) => updateSolarwindsTarget('networks', {
                          metadata: {
                            ...draft.collectors.solarwinds.networks.metadata,
                            networkObjectIds: parseLines(event.target.value).slice(0, 5)
                          }
                        })}
                        rows={4}
                        style={textAreaStyle}
                      />
                    </label>,
                    {
                      description: 'Interface portal source for WAN and SDWAN objects.'
                    }
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  const renderAuditPanel = () => {
    const successCount = auditRows.filter((row) => row.actionResult === 'success').length;
    const deniedCount = auditRows.filter((row) => row.actionResult === 'denied').length;
    const failedCount = auditRows.filter((row) => row.actionResult === 'failed').length;

    return (
      <section className="glass-panel" style={contentPanelStyle}>
        <div style={panelHeaderStyle}>
          <div>
            <h2 style={panelTitleStyle}>Audit Trail</h2>
            <div style={panelHintStyle}>Screen view is intentionally compact: timestamp, action, result, and actor only. Use Excel export for the full detailed event payload.</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => void loadAudit()} style={secondaryButtonStyle}>
              <RefreshCw size={14} />
              Refresh audit
            </button>
            <button type="button" onClick={handleExportAuditCsv} style={secondaryButtonStyle}>
              <HardDriveDownload size={14} />
              Export Excel
            </button>
          </div>
        </div>

        <div style={workflowStatGridStyle}>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Loaded rows</div>
            <div style={workflowStatValueStyle}>{auditRows.length}</div>
            <div style={workflowStatDetailStyle}>{auditLoadedAt ? `Loaded ${new Date(auditLoadedAt).toLocaleString()}` : 'Not loaded in this session'}</div>
          </div>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Success</div>
            <div style={workflowStatValueStyle}>{successCount}</div>
            <div style={workflowStatDetailStyle}>Completed actions</div>
          </div>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Denied</div>
            <div style={workflowStatValueStyle}>{deniedCount}</div>
            <div style={workflowStatDetailStyle}>Rejected attempts</div>
          </div>
          <div style={workflowStatCardStyle}>
            <div style={workflowStatCaptionStyle}>Failed</div>
            <div style={workflowStatValueStyle}>{failedCount}</div>
            <div style={workflowStatDetailStyle}>Errored operations</div>
          </div>
        </div>

        <div style={itemCardStyle}>
          <div style={auditFilterGridStyle}>
            <label style={fieldBlockStyle}>
              Action type
              <input
                value={auditFilters.actionType}
                onChange={(event) => setAuditFilters((current) => ({ ...current, actionType: event.target.value }))}
                placeholder="admin.settings.update"
                style={fieldStyle}
              />
            </label>
            <label style={fieldBlockStyle}>
              Result
              <select
                value={auditFilters.actionResult}
                onChange={(event) => setAuditFilters((current) => ({ ...current, actionResult: event.target.value as AuditFilterState['actionResult'] }))}
                style={fieldStyle}
              >
                <option value="all">All</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="denied">Denied</option>
              </select>
            </label>
            <label style={fieldBlockStyle}>
              Actor
              <input
                value={auditFilters.actorUsername}
                onChange={(event) => setAuditFilters((current) => ({ ...current, actorUsername: event.target.value }))}
                placeholder="admin"
                style={fieldStyle}
              />
            </label>
            <label style={fieldBlockStyle}>
              Surface
              <select
                value={auditFilters.surface}
                onChange={(event) => setAuditFilters((current) => ({ ...current, surface: event.target.value as AuditFilterState['surface'] }))}
                style={fieldStyle}
              >
                <option value="all">All</option>
                <option value="admin">Admin</option>
                <option value="operator">Operator</option>
              </select>
            </label>
            <label style={fieldBlockStyle}>
              Row limit
              <select
                value={String(auditFilters.limit)}
                onChange={(event) => setAuditFilters((current) => ({ ...current, limit: Number(event.target.value) as AuditFilterState['limit'] }))}
                style={fieldStyle}
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="250">250</option>
              </select>
            </label>
          </div>

          <div style={compactActionRowStyle}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Filtered rows stay minimal on screen; export includes source IP, target IDs, request summaries, and error payloads.
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  const next = createDefaultAuditFilters();
                  setAuditFilters(next);
                  void loadAudit(next);
                }}
                style={secondaryButtonStyle}
              >
                <RotateCcw size={14} />
                Reset filters
              </button>
              <button type="button" onClick={() => void loadAudit()} style={primaryButtonStyle(auditLoading)}>
                <History size={14} />
                {auditLoading ? 'Loading...' : 'Apply filters'}
              </button>
            </div>
          </div>
        </div>

        <div style={auditTableCardStyle}>
          {auditLoading ? (
            <div style={loadingRowStyle}>
              <RefreshCw size={18} className="animate-spin" />
              Loading audit records...
            </div>
          ) : auditRows.length === 0 ? (
            <div style={{ ...itemCardStyle, color: 'var(--text-secondary)' }}>
              No audit records matched the current filter.
            </div>
          ) : (
            <div style={auditTableWrapStyle}>
              <table style={auditTableStyle}>
                <thead>
                  <tr>
                    <th style={auditHeadCellStyle}>Timestamp</th>
                    <th style={auditHeadCellStyle}>Action</th>
                    <th style={auditHeadCellStyle}>Result</th>
                    <th style={auditHeadCellStyle}>Who</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((row) => {
                    const tone = toneStyles(
                      row.actionResult === 'success'
                        ? 'online'
                        : row.actionResult === 'denied'
                          ? 'warning'
                          : 'error'
                    );

                    return (
                      <tr key={row.auditId} style={auditRowStyle}>
                        <td style={auditCellStyle}>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{formatAuditTimestamp(row.occurredAt)}</div>
                        </td>
                        <td style={auditCellStyle}>
                          <div style={{ display: 'grid', gap: '4px' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{row.actionType}</strong>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{row.surface || 'unknown surface'}</span>
                          </div>
                        </td>
                        <td style={auditCellStyle}>
                          <span style={{ ...statusChipStyle, color: tone.color, background: tone.background, borderColor: tone.border }}>
                            {row.actionResult.toUpperCase()}
                          </span>
                        </td>
                        <td style={auditCellStyle}>
                          <div style={{ display: 'grid', gap: '4px' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>{row.actorUsername || 'unknown actor'}</strong>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{row.actorRole || 'role unavailable'}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    );
  };

  const renderHelpPanel = () => (
    <section className="glass-panel" style={contentPanelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h2 style={panelTitleStyle}>Help</h2>
          <div style={panelHintStyle}>Reference lane for maintained PDFs. The user manual screenshots are refreshed from the live application and mirrored into this embedded library.</div>
        </div>
        <button
          type="button"
          onClick={() => window.open(selectedHelpDocument.href, '_blank', 'noopener,noreferrer')}
          style={secondaryButtonStyle}
          aria-label={`Open ${selectedHelpDocument.title} PDF in a new tab`}
        >
          <HardDriveDownload size={16} />
          Open PDF
        </button>
      </div>

      <div style={helpLayoutStyle}>
        <div style={helpListStyle}>
          <div style={scopeSectionStyle}>
            <div style={scopeSectionHeaderStyle}>
              <div>
                <div style={scopeSectionTitleStyle}>Document set</div>
                <div style={scopeSectionHintStyle}>Choose a document from the left and review the current PDF directly inside the console.</div>
              </div>
              <span style={metaPillStyle}>{helpDocuments.length} files</span>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
              {helpDocuments.map((document) => {
                const active = document.id === selectedHelpDocument.id;
                return (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setSelectedHelpDocId(document.id)}
                    style={helpDocButtonStyle(active)}
                  >
                    <div style={{ display: 'grid', gap: '4px', textAlign: 'left' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{document.title}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{document.detail}</div>
                    </div>
                    <span style={helpDocPillStyle(active)}>{active ? 'OPEN' : 'PDF'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={helpViewerShellStyle}>
          <div style={helpViewerMetaStyle}>
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{selectedHelpDocument.title}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{selectedHelpDocument.detail}</div>
            </div>
            <span style={metaPillStyle}>Embedded PDF</span>
          </div>
          <iframe
            key={selectedHelpDocument.href}
            title={`${selectedHelpDocument.title} PDF viewer`}
            src={selectedHelpDocument.href}
            style={helpViewerFrameStyle}
          />
        </div>
      </div>
    </section>
  );

  return (
    <main style={pageShellStyle}>
      <div style={pageFrameStyle}>
        <header className="glass-panel" style={headerShellStyle}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <div style={{ fontSize: '0.78rem', letterSpacing: '0.16em', fontWeight: 800, color: '#1565c0' }}>ADMIN CONSOLE</div>
            <h1 style={{ margin: 0, fontSize: '1.45rem', color: 'var(--text-primary)' }}>Utkal IT Dashboard Control</h1>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Structured lanes for runtime control, portal access recovery, source setup, audit review, and document access.</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => window.location.assign(buildSurfaceUrl('/', OPERATOR_PORT))} style={secondaryButtonStyle}>
              <ShieldCheck size={16} />
              Operator View
            </button>
            <button type="button" onClick={() => void loadAll()} style={secondaryButtonStyle}>
              <RefreshCw size={16} />
              Refresh
            </button>
            <button type="button" onClick={() => void handleServiceAction('restart-all', 'stack')} disabled={serviceBusy !== null} style={primaryButtonStyle(serviceBusy !== null)}>
              <RotateCcw size={16} />
              Restart Stack
            </button>
            <div style={identityPillStyle}>
              <span style={{ fontWeight: 800, letterSpacing: '0.08em' }}>ADMIN</span>
              <span>{session.displayName || session.email}</span>
              <button type="button" onClick={() => void handleLogout()} style={iconOnlyButtonStyle}>
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </header>

        {error ? <div style={{ ...messageBarStyle, color: '#b3261e', background: 'rgba(198,40,40,0.10)', borderColor: 'rgba(198,40,40,0.18)' }}>{error}</div> : null}
        {message ? <div style={{ ...messageBarStyle, color: '#2e7d32', background: 'rgba(46,125,50,0.10)', borderColor: 'rgba(46,125,50,0.18)' }}>{message}</div> : null}

        <section style={summaryStripStyle}>
          <button type="button" className="glass-panel" onClick={() => setActiveTab('services')} style={summaryCardButtonStyle(activeTab === 'services')}>
            <ServerCog size={18} style={{ color: '#1565c0' }} />
            <div style={{ display: 'grid', gap: '2px' }}>
              <div style={{ fontSize: '0.76rem', letterSpacing: '0.08em', fontWeight: 800, color: '#1565c0' }}>STACK HEALTH</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{servicesAttention} need action</div>
            </div>
            <div style={summaryValueStyle}>{servicesOnline}/{services.length}</div>
          </button>
          <button type="button" className="glass-panel" onClick={() => setActiveTab('sessions')} style={summaryCardButtonStyle(activeTab === 'sessions')}>
            <KeyRound size={18} style={{ color: '#2e7d32' }} />
            <div style={{ display: 'grid', gap: '2px' }}>
              <div style={{ fontSize: '0.76rem', letterSpacing: '0.08em', fontWeight: 800, color: '#2e7d32' }}>PORTAL ACCESS</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{sessionsAttention} workflows need renewal</div>
            </div>
            <div style={summaryValueStyle}>{authenticatedSessionTargets}/{sessionTargetCount || 1}</div>
          </button>
          <button type="button" className="glass-panel" onClick={() => setActiveTab('sources')} style={summaryCardButtonStyle(activeTab === 'sources')}>
            <Settings2 size={18} style={{ color: '#ef6c00' }} />
            <div style={{ display: 'grid', gap: '2px' }}>
              <div style={{ fontSize: '0.76rem', letterSpacing: '0.08em', fontWeight: 800, color: '#ef6c00' }}>SOURCE SETUP</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Saved collector endpoints and passwords</div>
            </div>
            <div style={summaryValueStyle}>{enabledTargets}/4</div>
          </button>
          <button type="button" className="glass-panel" onClick={() => setActiveTab('help')} style={summaryCardButtonStyle(activeTab === 'help')}>
            <BookOpenText size={18} style={{ color: '#6d4c41' }} />
            <div style={{ display: 'grid', gap: '2px' }}>
              <div style={{ fontSize: '0.76rem', letterSpacing: '0.08em', fontWeight: 800, color: '#6d4c41' }}>REFERENCE LIBRARY</div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Embedded documentation set</div>
            </div>
            <div style={summaryValueStyle}>{helpDocuments.length}</div>
          </button>
        </section>

        <section className="glass-panel" style={tabShellStyle}>
          <div role="tablist" aria-label="Admin workflows" style={tabListStyle}>
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.key)}
                  style={tabButtonStyle(active)}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                    {tab.icon}
                    {tab.label}
                  </span>
                  <span style={tabButtonDetailStyle}>{tab.detail}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div style={{ flex: '1 1 auto', minHeight: 0 }}>
          {activeTab === 'overview' ? renderOverviewPanel() : null}
          {activeTab === 'services' ? renderServicesPanel() : null}
          {activeTab === 'sessions' ? renderSessionsPanel() : null}
          {activeTab === 'sources' ? renderSourcesPanel() : null}
          {activeTab === 'audit' ? renderAuditPanel() : null}
          {activeTab === 'help' ? renderHelpPanel() : null}
        </div>
      </div>
    </main>
  );

  function renderTargetCard(
    title: string,
    target: CollectorTargetSettings,
    onChange: (patch: Partial<CollectorTargetSettings>) => void,
    extra?: React.ReactNode,
    options?: {
      normalizeTargetUrl?: (value: string) => string;
      targetUrlHint?: string;
      description?: string;
    }
  ) {
    return (
      <div style={itemCardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: '4px' }}>
            <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
            {options?.description ? (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{options.description}</div>
            ) : null}
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Config: {target.configOrigin} | Secret: {target.secretOrigin}
            </div>
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={target.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
            Enabled
          </label>
        </div>

        <div style={metaRowStyle}>
          {target.host ? <span style={metaPillStyle}>{target.host}</span> : null}
          <span style={metaPillStyle}>Poll {target.pollIntervalSeconds ?? '-'} s</span>
          {target.owner ? <span style={metaPillStyle}>{target.owner}</span> : null}
        </div>

        <div style={sourceFieldGridStyle}>
          <label style={fieldBlockStyle}>
            Target URL
            <input
              value={target.targetUrl}
              onChange={(event) => onChange({ targetUrl: event.target.value })}
              onBlur={(event) => {
                if (!options?.normalizeTargetUrl) {
                  return;
                }

                const normalized = options.normalizeTargetUrl(event.target.value);
                if (normalized && normalized !== target.targetUrl) {
                  onChange({
                    targetUrl: normalized,
                    host: parseUrlHostname(normalized)
                  });
                }
              }}
              style={fieldStyle}
            />
            {options?.targetUrlHint ? <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{options.targetUrlHint}</span> : null}
          </label>
          <label style={fieldBlockStyle}>
            Username
            <input value={target.username || ''} onChange={(event) => onChange({ username: event.target.value })} style={fieldStyle} />
          </label>
          <label style={fieldBlockStyle}>
            Password
            <input
              type="password"
              value={target.password || ''}
              onChange={(event) => onChange({ password: event.target.value, clearPassword: false })}
              placeholder={target.passwordConfigured ? 'Leave blank to keep existing password' : 'Enter password'}
              style={fieldStyle}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{renderPasswordStatus(target)}</span>
          </label>
          <label style={fieldBlockStyle}>
            Poll interval (seconds)
            <input
              type="number"
              value={target.pollIntervalSeconds ?? ''}
              onChange={(event) => onChange({ pollIntervalSeconds: event.target.value ? Number(event.target.value) : null })}
              style={fieldStyle}
            />
          </label>
        </div>

        <label style={fieldBlockStyle}>
          Notes
          <textarea value={target.notes || ''} onChange={(event) => onChange({ notes: event.target.value })} rows={2} style={textAreaStyle} />
        </label>

        {extra}
      </div>
    );
  }
}

const loadingShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '12px',
  background:
    'radial-gradient(circle at top left, rgba(21,101,192,0.14), transparent 42%), linear-gradient(135deg, #f7f4ef 0%, #ece4d8 100%)'
};

const pageShellStyle: React.CSSProperties = {
  minHeight: '100vh',
  height: '100vh',
  overflow: 'hidden',
  background:
    'radial-gradient(circle at top left, rgba(21,101,192,0.14), transparent 42%), linear-gradient(135deg, #f7f4ef 0%, #ece4d8 100%)',
  padding: '14px'
};

const pageFrameStyle: React.CSSProperties = {
  maxWidth: '1560px',
  height: '100%',
  margin: '0 auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px'
};

const headerShellStyle: React.CSSProperties = {
  padding: '14px 16px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  flexWrap: 'wrap'
};

const summaryStripStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))'
};

const summaryCardStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'grid',
  gap: '4px',
  alignContent: 'center',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center'
};

const summaryCardButtonStyle = (active: boolean): React.CSSProperties => ({
  ...summaryCardStyle,
  cursor: 'pointer',
  textAlign: 'left',
  border: active ? '1px solid rgba(21,101,192,0.26)' : '1px solid rgba(141,110,99,0.10)',
  background: active ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.66)'
});

const summaryValueStyle: React.CSSProperties = {
  fontSize: '1.8rem',
  fontWeight: 800,
  lineHeight: 1,
  color: 'var(--text-primary)'
};

const panelStyle: React.CSSProperties = {
  padding: '14px',
  display: 'grid',
  gap: '12px'
};

const tabShellStyle: React.CSSProperties = {
  padding: '8px 10px'
};

const tabListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  display: 'grid',
  gap: '4px',
  alignContent: 'start',
  textAlign: 'left',
  borderRadius: '14px',
  border: active ? '1px solid rgba(21,101,192,0.24)' : '1px solid rgba(141,110,99,0.14)',
  background: active ? 'rgba(21,101,192,0.10)' : 'rgba(255,255,255,0.62)',
  color: 'var(--text-primary)',
  padding: '10px 12px',
  fontWeight: 800,
  cursor: 'pointer'
});

const tabButtonDetailStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: 'var(--text-secondary)'
};

const panelScrollerStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  minHeight: '100%',
  maxHeight: '100%',
  overflow: 'auto',
  paddingRight: '4px'
};

const contentPanelStyle: React.CSSProperties = {
  ...panelStyle,
  minHeight: '100%',
  maxHeight: '100%',
  overflow: 'auto'
};

const panelHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap'
};

const overviewTopGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
};

const overviewBottomGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))'
};

const overviewMetricGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))'
};

const overviewMetricCardStyle: React.CSSProperties = {
  borderRadius: '14px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.62)',
  padding: '12px',
  display: 'grid',
  gap: '6px',
  alignContent: 'start'
};

const overviewMetricLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 800,
  color: '#1565c0'
};

const overviewMetricValueStyle: React.CSSProperties = {
  fontSize: '1.9rem',
  lineHeight: 1,
  fontWeight: 800,
  color: 'var(--text-primary)'
};

const compactActionRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const overviewLinkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 'fit-content',
  border: 0,
  padding: 0,
  background: 'transparent',
  color: '#1565c0',
  fontWeight: 800,
  cursor: 'pointer'
};

const overviewNavCardStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px',
  borderRadius: '14px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.62)',
  padding: '10px 12px',
  cursor: 'pointer',
  textAlign: 'left',
  color: 'var(--text-primary)'
};

const overviewNavPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '6px 10px',
  borderRadius: '999px',
  background: 'rgba(21,101,192,0.10)',
  color: '#1565c0',
  fontSize: '0.74rem',
  fontWeight: 800,
  letterSpacing: '0.08em'
};

const overviewListRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  borderRadius: '14px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.62)',
  padding: '10px 12px',
  cursor: 'pointer',
  color: 'var(--text-primary)'
};

const panelTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '1rem',
  color: 'var(--text-primary)'
};

const panelHintStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)'
};

const workflowLaneGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'minmax(0, 1.35fr) minmax(320px, 0.95fr)'
};

const workflowLaneCompactStyle: React.CSSProperties = {
  ...workflowLaneGridStyle,
  alignItems: 'start'
};

const heroPanelStyle: React.CSSProperties = {
  ...panelStyle,
  padding: '16px'
};

const sourceAccessPanelStyle: React.CSSProperties = {
  ...panelStyle,
  alignSelf: 'start'
};

const workflowStatGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'
};

const workflowStatCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.62)',
  padding: '12px',
  display: 'grid',
  gap: '4px',
  alignContent: 'start'
};

const workflowStatCaptionStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontWeight: 800,
  color: '#1565c0'
};

const workflowStatValueStyle: React.CSSProperties = {
  fontSize: '1.9rem',
  lineHeight: 1,
  fontWeight: 800,
  color: 'var(--text-primary)'
};

const workflowStatDetailStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)'
};

const workflowActionBarStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const workflowScopeGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px'
};

const workflowScopeButtonStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '12px',
  padding: '12px 14px',
  borderRadius: '14px',
  border: active ? '1px solid rgba(21,101,192,0.24)' : '1px solid rgba(141,110,99,0.14)',
  background: active ? 'rgba(21,101,192,0.08)' : 'rgba(255,255,255,0.60)',
  color: 'var(--text-primary)',
  textAlign: 'left',
  cursor: 'pointer'
});

const scopeSectionStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.14)',
  background: 'rgba(255,255,255,0.58)',
  padding: '12px',
  display: 'grid',
  gap: '12px'
};

const scopeSectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap'
};

const scopeSectionTitleStyle: React.CSSProperties = {
  fontWeight: 800,
  color: 'var(--text-primary)'
};

const scopeSectionHintStyle: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-secondary)'
};

const serviceRowStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  borderRadius: '14px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.74)',
  padding: '12px'
};

const serviceRowMainStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  minWidth: 0
};

const serviceActionRailStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  justifyContent: 'flex-end'
};

const guideListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px'
};

const guideStepStyle: React.CSSProperties = {
  display: 'grid',
  gap: '4px',
  borderRadius: '12px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.62)',
  padding: '10px 12px',
  color: 'var(--text-secondary)',
  fontSize: '0.82rem'
};

const sessionTargetRowStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  borderRadius: '12px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.58)',
  padding: '10px 12px'
};

const auditFilterGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))'
};

const auditTableCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.68)',
  padding: '0',
  minHeight: 0,
  overflow: 'hidden'
};

const auditTableWrapStyle: React.CSSProperties = {
  overflow: 'auto',
  maxHeight: '100%'
};

const auditTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'separate',
  borderSpacing: 0,
  minWidth: '720px'
};

const auditHeadCellStyle: React.CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 1,
  textAlign: 'left',
  padding: '12px 14px',
  background: '#f6efe5',
  borderBottom: '1px solid rgba(141,110,99,0.18)',
  fontSize: '0.76rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#6d4c41'
};

const auditRowStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.74)'
};

const auditCellStyle: React.CSSProperties = {
  padding: '12px 14px',
  borderBottom: '1px solid rgba(141,110,99,0.12)',
  verticalAlign: 'top'
};

const cardGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))'
};

const compactCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.14)',
  background: 'rgba(255,255,255,0.70)',
  padding: '12px',
  display: 'grid',
  gap: '10px',
  alignContent: 'start'
};

const compactCardHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'flex-start'
};

const metaRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '6px',
  flexWrap: 'wrap',
  alignItems: 'center'
};

const metaPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '4px 8px',
  borderRadius: '999px',
  border: '1px solid rgba(141,110,99,0.14)',
  background: 'rgba(255,255,255,0.76)',
  color: 'var(--text-secondary)',
  fontSize: '0.72rem',
  fontWeight: 700
};

const serviceHealthStyle: React.CSSProperties = {
  display: 'grid',
  gap: '4px',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)'
};

const targetCardStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  padding: '10px',
  borderRadius: '12px',
  border: '1px solid rgba(141,110,99,0.12)',
  background: 'rgba(255,255,255,0.58)'
};

const itemCardStyle: React.CSSProperties = {
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.68)',
  padding: '12px',
  display: 'grid',
  gap: '10px'
};

const helpLayoutStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'minmax(280px, 360px) minmax(0, 1fr)',
  alignItems: 'stretch',
  minHeight: 0,
  flex: '1 1 auto'
};

const helpListStyle: React.CSSProperties = {
  display: 'grid',
  gap: '8px',
  alignContent: 'start',
  minHeight: 0,
  overflow: 'auto',
  paddingRight: '4px'
};

const helpDocButtonStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '10px',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: '14px',
  border: active ? '1px solid rgba(21,101,192,0.22)' : '1px solid rgba(141,110,99,0.12)',
  background: active ? 'rgba(21,101,192,0.08)' : 'rgba(255,255,255,0.62)',
  color: 'var(--text-primary)',
  cursor: 'pointer'
});

const helpDocPillStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: '54px',
  padding: '6px 10px',
  borderRadius: '999px',
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  fontWeight: 800,
  color: active ? '#1565c0' : 'var(--text-secondary)',
  background: active ? 'rgba(21,101,192,0.12)' : 'rgba(93,64,55,0.08)',
  border: active ? '1px solid rgba(21,101,192,0.18)' : '1px solid rgba(141,110,99,0.12)'
});

const helpViewerShellStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  minHeight: 0,
  borderRadius: '16px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.68)',
  padding: '12px'
};

const helpViewerMetaStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap'
};

const helpViewerFrameStyle: React.CSSProperties = {
  width: '100%',
  minHeight: '72vh',
  height: '100%',
  border: '1px solid rgba(141,110,99,0.16)',
  borderRadius: '14px',
  background: '#ffffff'
};

const sourceGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '12px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))'
};

const sourceFieldGridStyle: React.CSSProperties = {
  display: 'grid',
  gap: '10px',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
};

const fieldBlockStyle: React.CSSProperties = {
  display: 'grid',
  gap: '5px',
  fontWeight: 700,
  fontSize: '0.82rem',
  color: 'var(--text-primary)'
};

const fieldStyle: React.CSSProperties = {
  borderRadius: '10px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.82)',
  padding: '9px 11px',
  color: 'var(--text-primary)'
};

const textAreaStyle: React.CSSProperties = {
  ...fieldStyle,
  resize: 'vertical',
  minHeight: '60px'
};

const loadingRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '120px',
  justifyContent: 'center',
  color: 'var(--text-secondary)'
};

const messageBarStyle: React.CSSProperties = {
  borderRadius: '14px',
  border: '1px solid',
  padding: '8px 10px',
  fontSize: '0.82rem',
  fontWeight: 700
};

const statusChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '999px',
  border: '1px solid',
  padding: '6px 10px',
  fontSize: '0.74rem',
  fontWeight: 800,
  letterSpacing: '0.08em'
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '10px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.72)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '0.8rem',
  fontWeight: 700,
  cursor: 'pointer'
};

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  borderRadius: '10px',
  border: 0,
  background: disabled ? 'rgba(21,101,192,0.42)' : '#1565c0',
  color: '#fff',
  padding: '8px 12px',
  fontSize: '0.82rem',
  fontWeight: 800,
  cursor: disabled ? 'not-allowed' : 'pointer'
});

const identityPillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 12px',
  borderRadius: '999px',
  border: '1px solid rgba(141,110,99,0.16)',
  background: 'rgba(255,255,255,0.72)',
  color: 'var(--text-primary)'
};

const iconOnlyButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer'
};

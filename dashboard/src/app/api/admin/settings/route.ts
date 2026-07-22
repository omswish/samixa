import { NextResponse } from 'next/server';
import { recordApplicationAuditEvent } from '../../../../lib/audit-client';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

function summarizeCollectorTarget(target: any) {
  if (!target || typeof target !== 'object') {
    return null;
  }

  const metadata = target.metadata && typeof target.metadata === 'object' && !Array.isArray(target.metadata)
    ? target.metadata
    : {};

  return {
    configKey: typeof target.configKey === 'string' ? target.configKey : null,
    targetUrl: typeof target.targetUrl === 'string' ? target.targetUrl : null,
    enabled: target.enabled !== false,
    owner: typeof target.owner === 'string' ? target.owner : null,
    notesPresent: typeof target.notes === 'string' ? target.notes.trim().length > 0 : false,
    pollIntervalSeconds: Number.isFinite(Number(target.pollIntervalSeconds))
      ? Number(target.pollIntervalSeconds)
      : null,
    metadataKeys: Object.keys(metadata),
    usernameConfigured: typeof target.username === 'string' && target.username.trim().length > 0,
    passwordUpdated: typeof target.password === 'string' && target.password.length > 0,
    passwordCleared: Boolean(target.clearPassword)
  };
}

function summarizeSettingsPayload(payload: any) {
  return {
    collectors: {
      nutanix: {
        primary: summarizeCollectorTarget(payload?.collectors?.nutanix?.primary)
      },
      solarwinds: {
        servers: summarizeCollectorTarget(payload?.collectors?.solarwinds?.servers),
        networks: summarizeCollectorTarget(payload?.collectors?.solarwinds?.networks)
      },
      symphony: {
        primary: summarizeCollectorTarget(payload?.collectors?.symphony?.primary)
      }
    }
  };
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
      cache: 'no-store'
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load admin settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.settings.update',
      actionResult: 'denied',
      severity: 'warning',
      surface: 'admin',
      targetType: 'collector-settings',
      targetId: 'all',
      message: 'Collector settings update was blocked because no valid admin session was present.',
      errorMessage: 'Authentication required.'
    });
    return auth.response;
  }

  try {
    const payload = await request.json();
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const body = await response.text();
    const parsedBody = tryParseJson(body);

    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.settings.update',
      actionResult: response.ok ? 'success' : response.status >= 400 && response.status < 500 ? 'denied' : 'failed',
      severity: response.ok ? 'info' : 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'collector-settings',
      targetId: 'all',
      message: response.ok
        ? 'Collector settings were updated.'
        : 'Collector settings update was rejected by the gateway.',
      errorMessage: !response.ok
        ? (parsedBody && typeof parsedBody.error === 'string' ? parsedBody.error : body || `HTTP ${response.status}`)
        : null,
      requestSummaryJson: summarizeSettingsPayload(payload),
      resultSummaryJson: response.ok
        ? {
            status: response.status,
            collectorsSaved: Object.keys((parsedBody as any)?.collectors || {})
          }
        : {
            status: response.status
          }
    });

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.settings.update',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'collector-settings',
      targetId: 'all',
      message: 'Collector settings update failed because the route encountered an internal error.',
      errorMessage: error?.message || 'Failed to save admin settings.'
    });
    return NextResponse.json({ error: error?.message || 'Failed to save admin settings.' }, { status: 500 });
  }
}

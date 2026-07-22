const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

export interface ApplicationAuditEventInput {
  request: Request;
  actionType: string;
  actionResult: 'success' | 'failed' | 'denied';
  severity?: 'info' | 'warning' | 'critical';
  actorUsername?: string | null;
  actorRole?: string | null;
  surface?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  message?: string | null;
  errorMessage?: string | null;
  requestSummaryJson?: unknown;
  resultSummaryJson?: unknown;
  correlationId?: string | null;
}

function getSourceIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || null;
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim() || null;
  }

  return null;
}

export async function recordApplicationAuditEvent(input: ApplicationAuditEventInput) {
  try {
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/internal/audit`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        occurredAt: new Date().toISOString(),
        actionType: input.actionType,
        actionResult: input.actionResult,
        severity: input.severity ?? 'info',
        actorUsername: input.actorUsername ?? null,
        actorRole: input.actorRole ?? null,
        surface: input.surface ?? null,
        sourceIp: getSourceIp(input.request),
        userAgent: input.request.headers.get('user-agent'),
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        message: input.message ?? null,
        errorMessage: input.errorMessage ?? null,
        requestSummaryJson: input.requestSummaryJson ?? null,
        resultSummaryJson: input.resultSummaryJson ?? null,
        correlationId: input.correlationId ?? null
      })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[audit] failed to record application audit event:', body || `HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('[audit] failed to reach internal audit endpoint:', error);
  }
}

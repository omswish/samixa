import { NextResponse } from 'next/server';
import { recordApplicationAuditEvent } from '../../../../../lib/audit-client';
import { launchSessionHelper } from '../../../../../lib/admin-runtime';
import { requireCurrentSession } from '../../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-reauth.launch',
      actionResult: 'denied',
      severity: 'warning',
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: 'unknown',
      message: 'Session reauthentication launch was blocked because no valid admin session was present.',
      errorMessage: 'Authentication required.'
    });
    return auth.response;
  }

  try {
    const body = await request.json();
    const workflowId = body?.workflowId;
    const mode = body?.mode === 'legacy-profile' ? 'legacy-profile' : 'interactive';
    if (workflowId !== 'symphony' && workflowId !== 'solarwinds') {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.session-reauth.launch',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'session-workflow',
        targetId: workflowId ?? 'unknown',
        message: 'Session reauthentication launch was rejected because the workflow identifier is unknown.',
        errorMessage: 'Unknown session workflow.',
        requestSummaryJson: {
          workflowId: workflowId ?? null,
          mode
        }
      });
      return NextResponse.json({ error: 'Unknown session workflow.' }, { status: 400 });
    }

    const result = await launchSessionHelper(workflowId, mode);
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-reauth.launch',
      actionResult: 'success',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: workflowId,
      message: 'Session reauthentication helper was launched.',
      requestSummaryJson: {
        workflowId,
        mode
      },
      resultSummaryJson: result
    });
    return NextResponse.json(result);
  } catch (error: any) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-reauth.launch',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: 'unknown',
      message: 'Session reauthentication helper launch failed because the runtime command did not complete successfully.',
      errorMessage: error?.message || 'Failed to launch reauthentication.'
    });
    return NextResponse.json({ error: error?.message || 'Failed to launch reauthentication.' }, { status: 500 });
  }
}

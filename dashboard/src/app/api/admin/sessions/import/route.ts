import { NextResponse } from 'next/server';
import { recordApplicationAuditEvent } from '../../../../../lib/audit-client';
import { importSessionWorkflow } from '../../../../../lib/admin-runtime';
import { requireCurrentSession } from '../../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-import',
      actionResult: 'denied',
      severity: 'warning',
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: 'unknown',
      message: 'Session import was blocked because no valid admin session was present.',
      errorMessage: 'Authentication required.'
    });
    return auth.response;
  }

  try {
    const body = await request.json();
    const workflowId = body?.workflowId;
    if (workflowId !== 'symphony' && workflowId !== 'solarwinds') {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.session-import',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'session-workflow',
        targetId: workflowId ?? 'unknown',
        message: 'Session import was rejected because the workflow identifier is unknown.',
        errorMessage: 'Unknown session workflow.',
        requestSummaryJson: {
          workflowId: workflowId ?? null
        }
      });
      return NextResponse.json({ error: 'Unknown session workflow.' }, { status: 400 });
    }

    const result = await importSessionWorkflow(workflowId, body?.storageState);
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-import',
      actionResult: 'success',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: workflowId,
      message: 'Session storage-state file was imported.',
      requestSummaryJson: {
        workflowId,
        storageStateProvided: Boolean(body?.storageState)
      },
      resultSummaryJson: result
    });
    return NextResponse.json({
      ...result,
      importedBy: auth.session?.email ?? null,
      importedAt: new Date().toISOString()
    });
  } catch (error: any) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.session-import',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'session-workflow',
      targetId: 'unknown',
      message: 'Session import failed because the uploaded payload could not be applied.',
      errorMessage: error?.message || 'Failed to import session.'
    });
    return NextResponse.json({ error: error?.message || 'Failed to import session.' }, { status: 500 });
  }
}

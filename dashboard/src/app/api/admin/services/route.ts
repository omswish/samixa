import { NextResponse } from 'next/server';
import { recordApplicationAuditEvent } from '../../../../lib/audit-client';
import { collectServiceSnapshots, runServiceAction } from '../../../../lib/admin-runtime';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    return NextResponse.json({ services: await collectServiceSnapshots() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load services.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.service-control',
      actionResult: 'denied',
      severity: 'warning',
      surface: 'admin',
      targetType: 'service',
      targetId: 'unknown',
      message: 'Service control action was blocked because no valid admin session was present.',
      errorMessage: 'Authentication required.'
    });
    return auth.response;
  }

  let action: 'start' | 'stop' | 'restart' | 'restart-all' | 'unknown' = 'unknown';
  let target = 'unknown';

  try {
    const body = await request.json();
    action = typeof body?.action === 'string' ? body.action : 'unknown';
    target = typeof body?.target === 'string' ? body.target : '';

    if (!['start', 'stop', 'restart', 'restart-all'].includes(action)) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.service-control',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'service',
        targetId: target || 'unknown',
        message: 'Service control action was rejected because the requested action is unsupported.',
        errorMessage: 'Unsupported service action.',
        requestSummaryJson: {
          requestedAction: action ?? null,
          requestedTarget: target || null
        }
      });
      return NextResponse.json({ error: 'Unsupported service action.' }, { status: 400 });
    }

    if (action !== 'restart-all' && !target) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.service-control',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'service',
        targetId: 'missing-target',
        message: 'Service control action was rejected because no target service was supplied.',
        errorMessage: 'Service target is required.',
        requestSummaryJson: {
          requestedAction: action
        }
      });
      return NextResponse.json({ error: 'Service target is required.' }, { status: 400 });
    }

    const validAction = action as 'start' | 'stop' | 'restart' | 'restart-all';
    const result = await runServiceAction(validAction, target);
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.service-control',
      actionResult: 'success',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'service',
      targetId: action === 'restart-all' ? 'dashboard-stack' : target,
      message: 'Service control action completed.',
      requestSummaryJson: {
        requestedAction: action,
        requestedTarget: action === 'restart-all' ? 'dashboard-stack' : target
      },
      resultSummaryJson: result
    });
    return NextResponse.json(result);
  } catch (error: any) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.service-control',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'service',
      targetId: target,
      message: 'Service control action failed because the runtime command did not complete successfully.',
      errorMessage: error?.message || 'Failed to run service action.',
      requestSummaryJson: {
        requestedAction: action,
        requestedTarget: target
      }
    });
    return NextResponse.json({ error: error?.message || 'Failed to run service action.' }, { status: 500 });
  }
}

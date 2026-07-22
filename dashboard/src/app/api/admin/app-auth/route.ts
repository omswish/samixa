import { NextResponse } from 'next/server';
import { fetchAppAuthStatus, updateAppAuthPasswords } from '../../../../lib/app-auth-client';
import { recordApplicationAuditEvent } from '../../../../lib/audit-client';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  return NextResponse.json(await fetchAppAuthStatus(), {
    headers: {
      'cache-control': 'no-store'
    }
  });
}

export async function PUT(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.app-auth.update',
      actionResult: 'denied',
      severity: 'warning',
      surface: 'admin',
      targetType: 'app-auth',
      targetId: 'local-users',
      message: 'App password update was blocked because no valid admin session was present.',
      errorMessage: 'Authentication required.'
    });
    return auth.response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const adminPassword = typeof body?.adminPassword === 'string' ? body.adminPassword.trim() : '';
    const operatorPassword = typeof body?.operatorPassword === 'string' ? body.operatorPassword.trim() : '';

    if (!adminPassword && !operatorPassword) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.app-auth.update',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'app-auth',
        targetId: 'local-users',
        message: 'App password update was rejected because no password fields were supplied.',
        errorMessage: 'Enter at least one password to update.'
      });
      return NextResponse.json({ error: 'Enter at least one password to update.' }, { status: 400 });
    }

    if (adminPassword && adminPassword.length < 4) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.app-auth.update',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'app-auth',
        targetId: 'admin',
        message: 'App password update was rejected because the admin password was too short.',
        errorMessage: 'Admin password must be at least 4 characters.'
      });
      return NextResponse.json({ error: 'Admin password must be at least 4 characters.' }, { status: 400 });
    }

    if (operatorPassword && operatorPassword.length < 4) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'admin.app-auth.update',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: auth.session.email,
        actorRole: auth.session.role,
        surface: 'admin',
        targetType: 'app-auth',
        targetId: 'operator',
        message: 'App password update was rejected because the operator password was too short.',
        errorMessage: 'Operator password must be at least 4 characters.'
      });
      return NextResponse.json({ error: 'Operator password must be at least 4 characters.' }, { status: 400 });
    }

    const result = await updateAppAuthPasswords({
      adminPassword: adminPassword || null,
      operatorPassword: operatorPassword || null
    });
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.app-auth.update',
      actionResult: 'success',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'app-auth',
      targetId: 'local-users',
      message: 'Local application passwords were updated.',
      requestSummaryJson: {
        updatedUsers: [
          adminPassword ? 'admin' : null,
          operatorPassword ? 'operator' : null
        ].filter(Boolean)
      },
      resultSummaryJson: {
        mode: result.status.mode,
        updatedAt: result.status.updatedAt
      }
    });

    return NextResponse.json({
      status: result.status,
      message: result.message
    }, {
      headers: {
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    await recordApplicationAuditEvent({
      request,
      actionType: 'admin.app-auth.update',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: auth.session.email,
      actorRole: auth.session.role,
      surface: 'admin',
      targetType: 'app-auth',
      targetId: 'local-users',
      message: 'Local application password update failed because the route encountered an internal error.',
      errorMessage: error?.message || 'Failed to update portal passwords.'
    });
    return NextResponse.json({ error: error?.message || 'Failed to update portal passwords.' }, { status: 500 });
  }
}

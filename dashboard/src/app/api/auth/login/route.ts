import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSessionToken, getSessionCookieName } from '../../../../lib/auth-cookie';
import { verifyAppAuthCredentials } from '../../../../lib/app-auth-client';
import { recordApplicationAuditEvent } from '../../../../lib/audit-client';
import { resolveDashboardSurface } from '../../../../lib/dashboard-surface';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const surface = await resolveDashboardSurface();
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';
    const username = surface === 'admin' ? 'admin' : 'operator';
    if (!password) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'auth.login',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: username,
        actorRole: surface === 'admin' ? 'admin' : 'viewer',
        surface,
        targetType: 'application-surface',
        targetId: surface,
        message: 'Login rejected because no password was supplied.',
        errorMessage: 'Password is required.'
      });
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }

    const user = await verifyAppAuthCredentials(username, password, {
      requireAdmin: surface === 'admin'
    });
    if (!user) {
      await recordApplicationAuditEvent({
        request,
        actionType: 'auth.login',
        actionResult: 'denied',
        severity: 'warning',
        actorUsername: username,
        actorRole: surface === 'admin' ? 'admin' : 'viewer',
        surface,
        targetType: 'application-surface',
        targetId: surface,
        message: 'Login rejected because the supplied password did not match.',
        errorMessage: surface === 'admin' ? 'Invalid admin password.' : 'Invalid operator password.'
      });
      return NextResponse.json({ error: surface === 'admin' ? 'Invalid admin password.' : 'Invalid operator password.' }, { status: 403 });
    }

    const sessionToken = createSessionToken(user.username, user.role);
    (await cookies()).set({
      name: getSessionCookieName(surface),
      value: sessionToken,
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/'
    });

    await recordApplicationAuditEvent({
      request,
      actionType: 'auth.login',
      actionResult: 'success',
      actorUsername: user.loginId || user.username,
      actorRole: user.role,
      surface,
      targetType: 'application-surface',
      targetId: surface,
      message: 'Interactive application login succeeded.'
    });

    return NextResponse.json({
      session: {
        email: user.loginId || user.username,
        role: user.role,
        displayName: user.loginId || user.displayName
      }
    });
  } catch (error: any) {
    const surface = await resolveDashboardSurface().catch(() => 'unknown');
    await recordApplicationAuditEvent({
      request,
      actionType: 'auth.login',
      actionResult: 'failed',
      severity: 'warning',
      actorUsername: surface === 'admin' ? 'admin' : surface === 'operator' ? 'operator' : null,
      actorRole: surface === 'admin' ? 'admin' : surface === 'operator' ? 'viewer' : null,
      surface,
      targetType: 'application-surface',
      targetId: surface,
      message: 'Login attempt failed because the route encountered an internal error.',
      errorMessage: error?.message || 'Login failed.'
    });
    return NextResponse.json({ error: error?.message || 'Login failed.' }, { status: 500 });
  }
}

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSessionToken, getSessionCookieName } from '../../../../lib/auth-cookie';
import { resolveDashboardSurface } from '../../../../lib/dashboard-surface';
import { authenticateLocalAppUser } from '../../../../lib/local-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const surface = await resolveDashboardSurface();
    const body = await request.json();
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password) {
      return NextResponse.json({ error: 'Password is required.' }, { status: 400 });
    }

    const username = surface === 'admin' ? 'admin' : 'operator';
    const user = authenticateLocalAppUser(username, password, {
      requireAdmin: surface === 'admin'
    });
    if (!user) {
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

    return NextResponse.json({
      session: {
        email: user.username,
        role: user.role,
        displayName: user.displayName
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Login failed.' }, { status: 500 });
  }
}

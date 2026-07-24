import { NextResponse } from 'next/server';
import { getSessionCookieName } from '../../../../lib/auth-cookie';
import { resolveDashboardSurface } from '../../../../lib/dashboard-surface';
import { resolveCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const session = await resolveCurrentSession();
  if (!session) {
    const surface = await resolveDashboardSurface();
    const response = NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    response.cookies.set({
      name: getSessionCookieName(surface),
      value: '',
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      expires: new Date(0)
    });
    return response;
  }

  return NextResponse.json({ session });
}

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionCookieName } from '../../../../lib/auth-cookie';
import { resolveDashboardSurface } from '../../../../lib/dashboard-surface';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const surface = await resolveDashboardSurface();
  (await cookies()).set({
    name: getSessionCookieName(surface),
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires: new Date(0)
  });

  return NextResponse.json({ success: true });
}

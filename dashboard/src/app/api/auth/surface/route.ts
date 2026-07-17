import { NextResponse } from 'next/server';
import { resolveDashboardSurface } from '../../../../lib/dashboard-surface';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const surface = await resolveDashboardSurface();
  return NextResponse.json({
    surface,
    username: surface === 'admin' ? 'admin' : 'operator',
    title: surface === 'admin' ? 'Admin Access' : 'Operator Access'
  });
}

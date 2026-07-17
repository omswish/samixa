import { NextResponse } from 'next/server';
import { collectSessionSnapshots } from '../../../../lib/admin-runtime';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    return NextResponse.json({ sessions: await collectSessionSnapshots() });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load session status.' }, { status: 500 });
  }
}

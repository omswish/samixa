import { NextResponse } from 'next/server';
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
    return auth.response;
  }

  try {
    const body = await request.json();
    const action = body?.action;
    const target = typeof body?.target === 'string' ? body.target : '';

    if (!['start', 'stop', 'restart', 'restart-all'].includes(action)) {
      return NextResponse.json({ error: 'Unsupported service action.' }, { status: 400 });
    }

    if (action !== 'restart-all' && !target) {
      return NextResponse.json({ error: 'Service target is required.' }, { status: 400 });
    }

    const result = await runServiceAction(action, target);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to run service action.' }, { status: 500 });
  }
}

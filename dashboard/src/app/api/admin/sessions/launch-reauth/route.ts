import { NextResponse } from 'next/server';
import { launchSessionHelper } from '../../../../../lib/admin-runtime';
import { requireCurrentSession } from '../../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const body = await request.json();
    const workflowId = body?.workflowId;
    if (workflowId !== 'symphony' && workflowId !== 'solarwinds') {
      return NextResponse.json({ error: 'Unknown session workflow.' }, { status: 400 });
    }

    return NextResponse.json(await launchSessionHelper(workflowId));
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to launch reauthentication.' }, { status: 500 });
  }
}

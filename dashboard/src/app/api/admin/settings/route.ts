import { NextResponse } from 'next/server';
import { requireCurrentSession } from '../../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

export async function GET() {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
      cache: 'no-store'
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load admin settings.' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireCurrentSession('admin');
  if (auth.response) {
    return auth.response;
  }

  try {
    const payload = await request.json();
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/admin/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to save admin settings.' }, { status: 500 });
  }
}

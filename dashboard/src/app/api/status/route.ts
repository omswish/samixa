import { NextResponse } from 'next/server';
import { requireCurrentSession } from '../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERNAL_GATEWAY_STATUS_URL =
  process.env.INTERNAL_GATEWAY_STATUS_URL || 'http://127.0.0.1:4000/api/status';

export async function GET() {
  const auth = await requireCurrentSession();
  if (auth.response) {
    return auth.response;
  }

  try {
    const response = await fetch(INTERNAL_GATEWAY_STATUS_URL, {
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
    return NextResponse.json(
      {
        error: error?.message || 'Gateway unavailable'
      },
      {
        status: 502,
        headers: {
          'cache-control': 'no-store'
        }
      }
    );
  }
}

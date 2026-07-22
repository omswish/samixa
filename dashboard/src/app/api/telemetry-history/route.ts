import { NextResponse } from 'next/server';
import { requireCurrentSession } from '../../../lib/server-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const INTERNAL_GATEWAY_BASE_URL = process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

export async function GET(request: Request) {
  const auth = await requireCurrentSession();
  if (auth.response) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const queryString = url.searchParams.toString();
    const target = `${INTERNAL_GATEWAY_BASE_URL}/api/telemetry-history${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(target, {
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
        error: error?.message || 'Failed to load telemetry history.'
      },
      {
        status: 500,
        headers: {
          'cache-control': 'no-store'
        }
      }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireCurrentSession();
  if (auth.response) {
    return auth.response;
  }

  try {
    const payload = await request.json();
    const response = await fetch(`${INTERNAL_GATEWAY_BASE_URL}/api/telemetry-history`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
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
        error: error?.message || 'Failed to load telemetry history.'
      },
      {
        status: 500,
        headers: {
          'cache-control': 'no-store'
        }
      }
    );
  }
}

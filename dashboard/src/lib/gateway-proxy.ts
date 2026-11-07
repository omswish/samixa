import { NextResponse } from 'next/server';
import { requireCurrentSession } from './server-auth';

const INTERNAL_GATEWAY_BASE_URL =
  process.env.INTERNAL_GATEWAY_BASE_URL || 'http://127.0.0.1:4000';

function buildGatewayUrl(pathname: string, request: Request) {
  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(pathname, INTERNAL_GATEWAY_BASE_URL);
  targetUrl.search = incomingUrl.search;
  return targetUrl.toString();
}

export async function proxyGatewayRequest(request: Request, pathname: string, init?: RequestInit & { requireAdmin?: boolean }) {
  const { requireAdmin, ...fetchInit } = init || {};
  const auth = await requireCurrentSession(requireAdmin ? 'admin' : undefined);
  if (auth.response) {
    return auth.response;
  }

  try {
    const response = await fetch(buildGatewayUrl(pathname, request), {
      cache: 'no-store',
      ...fetchInit
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

export async function proxyGatewayGet(request: Request, pathname: string) {
  return proxyGatewayRequest(request, pathname);
}

export async function proxyGatewayPost(request: Request, pathname: string) {
  return proxyGatewayRequest(request, pathname, {
    requireAdmin: true,
    method: 'POST',
    headers: {
      'content-type': request.headers.get('content-type') || 'application/json'
    },
    body: await request.text()
  });
}

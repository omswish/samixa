import { proxyGatewayGet, proxyGatewayPost } from '../../../../lib/gateway-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{
    path: string[];
  }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyGatewayGet(request, `/api/units/${path.map(encodeURIComponent).join('/')}`);
}

export async function POST(request: Request, context: RouteContext) {
  const { path } = await context.params;
  return proxyGatewayPost(request, `/api/units/${path.map(encodeURIComponent).join('/')}`);
}

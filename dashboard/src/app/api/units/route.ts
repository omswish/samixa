import { proxyGatewayGet } from '../../../lib/gateway-proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  return proxyGatewayGet(request, '/api/units');
}

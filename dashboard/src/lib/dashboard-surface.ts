import { headers } from 'next/headers';

export type DashboardSurface = 'operator' | 'admin';

export async function resolveDashboardSurface(): Promise<DashboardSurface> {
  const requestHeaders = await headers();
  return requestHeaders.get('x-itdash-surface') === 'admin' ? 'admin' : 'operator';
}

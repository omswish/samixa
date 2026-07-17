import LoginSurfacePage from '../../components/LoginSurfacePage';
import { resolveDashboardSurface } from '../../lib/dashboard-surface';

export default async function LoginPage() {
  const surface = await resolveDashboardSurface();
  return <LoginSurfacePage surface={surface} />;
}

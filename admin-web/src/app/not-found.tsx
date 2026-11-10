import { NotFoundView } from '@/components/layout/not-found-view';
import { adminPath } from '@/lib/admin-path';

export default function NotFound() {
  return <NotFoundView homeHref={adminPath()} homeLabel="Go to the dashboard" />;
}

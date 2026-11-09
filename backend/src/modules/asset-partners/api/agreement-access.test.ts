import type { Router } from 'express';
import { assetPartnerIocRoutes } from './asset-partner.ioc.routes';
import { buildAdminRouter } from '../../admin/admin.routes';

type Layer = { route?: { path: string; methods: Record<string, boolean> }; handle?: { stack?: Layer[] } };

function routes(router: Router): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[]) => {
    for (const l of stack) {
      if (l.route) for (const m of Object.keys(l.route.methods)) out.push(`${m.toUpperCase()} ${l.route.path}`);
      else if (l.handle?.stack) walk(l.handle.stack);
    }
  };
  walk((router as unknown as { stack: Layer[] }).stack);
  return out;
}

describe('who can publish the partner agreement', () => {
  it('city operators can read it but only HQ admin can publish', () => {
    const ioc = routes(assetPartnerIocRoutes);
    expect(ioc).toContain('GET /asset-partner-agreements');
    expect(ioc).not.toContain('POST /asset-partner-agreements');
    const admin = routes(buildAdminRouter());
    expect(admin).toContain('GET /asset-partner-agreements');
    expect(admin).toContain('POST /asset-partner-agreements');
  });
});

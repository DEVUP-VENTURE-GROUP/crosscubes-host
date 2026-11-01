import type { Request, Response } from 'express';
import { requireFleetOwner } from './require-fleet-owner';
import { requireAdmin } from './require-admin';
import { UserModel } from '../../modules/users/infrastructure/user.model';
import { HubModel } from '../../modules/hubs/infrastructure/hub.model';
import { currentHubId } from '../tenancy/hub-context';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../testing/mongo';

beforeAll(connectTestDb);
afterAll(disconnectTestDb);
beforeEach(clearTestDb);

const run = (mw: typeof requireFleetOwner, userId: string) =>
  new Promise<{ err: unknown; req: Request }>((resolve) => {
    const req = { principal: { userId, roles: ['house_fleet', 'admin'], permissions: ['*'] } } as unknown as Request;
    mw(req, {} as Response, (err?: unknown) => resolve({ err, req, hubInScope: currentHubId() } as never));
  });

const hubFor = (operatorUserId: string, status = 'live') =>
  HubModel.create({
    code: 'HOU', name: 'Houston', city: 'Houston', state: 'TX', timezone: 'America/Chicago', status,
    territory: { center: { type: 'Point', coordinates: [-95.37, 29.76] }, radiusMiles: 40 },
    franchisee: { legalName: 'Bayou Mobility LLC', contactName: 'Ana Ruiz', email: 'ana@example.com' },
    agreement: { termYears: 10 }, economics: { royaltyPct: 8, techFeePct: 2, marketingFundPct: 2 }, operatorUserId,
  });

const user = async (roles: string[], status = 'active') => String((await UserModel.create({ email: `${roles.join('-')}-${status}@example.com`, roles, status }))._id);

describe('operations panel gate', () => {
  it('lets a franchisee in with only Asset Partner powers, confined to their own hub', async () => {
    const id = await user(['house_fleet']);
    const hub = await hubFor(id);
    const { err, req, hubInScope } = (await run(requireFleetOwner, id)) as unknown as { err: unknown; req: Request; hubInScope?: string };
    expect(err).toBeUndefined();
    expect(req.principal!.permissions).toEqual(['admin:read', 'host:manage']);
    expect(req.principal!.hubId).toBe(hub._id);
    expect(hubInScope).toBe(hub._id);
  });

  it('turns away a franchisee whose hub is closed or who has no hub yet', async () => {
    const noHub = await user(['house_fleet']);
    expect((await run(requireFleetOwner, noHub)).err).toBeTruthy();
    const id = String((await UserModel.create({ email: 'closed@example.com', roles: ['house_fleet'], status: 'active' }))._id);
    await hubFor(id, 'closed');
    expect((await run(requireFleetOwner, id)).err).toBeTruthy();
  });

  it('turns away customers, hosts, staff and a suspended House Fleet account', async () => {
    for (const roles of [['guest'], ['host'], ['admin'], ['house_fleet', 'admin']]) {
      expect((await run(requireFleetOwner, await user(roles))).err).toBeTruthy();
    }
    expect((await run(requireFleetOwner, await user(['house_fleet'], 'suspended'))).err).toBeTruthy();
  });

  it('the House Fleet account still cannot open the admin console', async () => {
    expect((await run(requireAdmin, await user(['house_fleet']))).err).toBeTruthy();
  });
});

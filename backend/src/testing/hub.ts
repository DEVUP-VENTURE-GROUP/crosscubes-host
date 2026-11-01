import { HubModel } from '../modules/hubs/infrastructure/hub.model';
import { clearLiveHubCache } from '../modules/hubs/application/hub.service';

export const TEST_HUB_ID = 'hub-test';

/** A live hub for tests that need somewhere to apply, list or book; call after the database is cleared. */
export async function seedTestHub(): Promise<void> {
  clearLiveHubCache();
  await HubModel.collection.insertOne({
    _id: TEST_HUB_ID as never,
    code: 'TST',
    name: 'Test City',
    city: 'Dallas',
    state: 'TX',
    timezone: 'America/Chicago',
    status: 'live',
    territory: { center: { type: 'Point', coordinates: [-96.797, 32.7767] }, radiusMiles: 60, exclusive: true },
    franchisee: { legalName: 'Test Mobility LLC', contactName: 'Test', email: 'franchisee@example.com' },
    agreement: { termYears: 10 },
    economics: { royaltyPct: 8, techFeePct: 2, marketingFundPct: 2 },
    licences: [],
    timeline: [],
  });
}

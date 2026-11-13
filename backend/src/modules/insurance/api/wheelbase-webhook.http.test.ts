jest.mock('../../notifications/application/notification.service', () => ({ notificationService: { send: jest.fn(async () => undefined) } }));

import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { config } from '../../../config';
import { createApp } from '../../../app';
import { WheelbaseReservationModel } from '../infrastructure/wheelbase-reservation.model';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../../../testing/mongo';

const SECRET = 'q'.repeat(40);
let server: Server;
let url: string;

beforeAll(async () => {
  await connectTestDb();
  (config.wheelbase as { webhookSecret: string }).webhookSecret = SECRET;
  server = createApp().listen(0);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${config.app.apiPrefix}/integrations/wheelbase/reservations`;
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await clearTestDb();
  await disconnectTestDb();
});
beforeEach(clearTestDb);

const post = (body: unknown, secret?: string) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(secret ? { 'x-crosscubes-secret': secret } : {}) }, body: JSON.stringify(body) });
const reservation = { reservationId: 55, rentalId: 504956, status: 'approved', from: '2026-12-01', to: '2026-12-03', amount: '120.50' };

describe('POST /integrations/wheelbase/reservations', () => {
  it('refuses a caller without the secret and stores nothing', async () => {
    expect((await post(reservation)).status).toBe(401);
    expect((await post(reservation, 'nope')).status).toBe(401);
    expect(await WheelbaseReservationModel.countDocuments()).toBe(0);
  });

  it('rejects a malformed body', async () => {
    expect((await post({ reservationId: 'x' }, SECRET)).status).toBe(422);
  });

  it('stores a reservation sent the way Zapier sends it', async () => {
    const res = await post(reservation, SECRET);
    expect(res.status).toBe(200);
    expect(await WheelbaseReservationModel.findById('55').lean()).toMatchObject({ rentalId: 504956, state: 'active', amountCents: 12_050 });
  });
});

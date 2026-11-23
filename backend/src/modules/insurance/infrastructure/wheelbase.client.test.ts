import { fetchBlockedRanges } from './wheelbase.client';

const answer = (body: unknown, status = 200) => jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

afterEach(() => jest.restoreAllMocks());

describe('reading a listing’s taken dates from Wheelbase', () => {
  it('reads the bare list the API sends, and an empty list as a free car', async () => {
    answer([{ from: '2026-12-05', to: '2026-12-07', earliest_pickup_time: 600 }, { from: 'bad', to: '2026-12-09' }]);
    expect(await fetchBlockedRanges(528113, '2026-11-23', '2027-05-22')).toEqual([{ from: '2026-12-05', to: '2026-12-07' }]);
    answer([]);
    expect(await fetchBlockedRanges(528113, '2026-11-23', '2027-05-22')).toEqual([]);
  });

  it('also reads the list wrapped in `response`', async () => {
    answer({ response: [{ from: '2026-12-05T00:00:00Z', to: '2026-12-06T00:00:00Z' }] });
    expect(await fetchBlockedRanges(1, '2026-11-23', '2027-05-22')).toEqual([{ from: '2026-12-05', to: '2026-12-06' }]);
  });

  it('fails loudly on anything else, so the car keeps its last known days', async () => {
    answer({ error: 'nope' });
    await expect(fetchBlockedRanges(1, '2026-11-23', '2027-05-22')).rejects.toThrow('unexpected response');
    answer({}, 503);
    await expect(fetchBlockedRanges(1, '2026-11-23', '2027-05-22')).rejects.toThrow('Wheelbase availability 503');
  });
});

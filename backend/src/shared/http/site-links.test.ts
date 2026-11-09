/** Links in emails and texts open on the right website. */
const notifications = {
  webUrl: 'https://www.crosscubes.com',
  hostWebUrl: 'https://host.crosscubes.com',
  partnerWebUrl: 'https://partners.crosscubes.com',
  insuranceWebUrl: 'https://insure.example.com/s3cret',
};
jest.mock('../../config', () => ({ config: { notifications, app: { publicUrl: 'https://api.crosscubes.com' } } }));

import { webLink, siteForPath } from './site-links';

describe('webLink', () => {
  it('sends host and captain pages to the host site', () => {
    expect(webLink('/host/trips/b1')).toBe('https://host.crosscubes.com/host/trips/b1');
    expect(webLink('/host')).toBe('https://host.crosscubes.com/host');
    expect(webLink('/host/accept-invite?token=t')).toBe('https://host.crosscubes.com/host/accept-invite?token=t');
    expect(webLink('/captain')).toBe('https://host.crosscubes.com/captain');
  });

  it('sends the Asset Partner portal to the partner site', () => {
    expect(webLink('/asset-partners/dashboard')).toBe('https://partners.crosscubes.com/asset-partners/dashboard');
    expect(webLink('/asset-partners/statements')).toBe('https://partners.crosscubes.com/asset-partners/statements');
  });

  it('sends the insurer portal to the insurance site behind its secret path', () => {
    expect(webLink('/insurers/portal')).toBe('https://insure.example.com/s3cret/insurers/portal');
  });

  it('keeps everything else on the guest site, corporate included', () => {
    expect(webLink('/corporate/approvals')).toBe('https://www.crosscubes.com/corporate/approvals');
    expect(webLink('/insurers')).toBe('https://www.crosscubes.com/insurers');
    expect(webLink('/bookings/b1')).toBe('https://www.crosscubes.com/bookings/b1');
    expect(webLink('/asset-partners/apply')).toBe('https://www.crosscubes.com/asset-partners/apply');
    expect(webLink('/hosts/h1')).toBe('https://www.crosscubes.com/hosts/h1');
    expect(webLink('trips/t1')).toBe('https://www.crosscubes.com/trips/t1');
    expect(webLink('https://example.com/x')).toBe('https://example.com/x');
  });

  it('falls back to the guest site when a site has no URL configured', () => {
    const saved = { ...notifications };
    notifications.hostWebUrl = '';
    notifications.partnerWebUrl = '';
    notifications.insuranceWebUrl = '';
    try {
      expect(webLink('/host/trips/b1')).toBe('https://www.crosscubes.com/host/trips/b1');
      expect(webLink('/asset-partners/dashboard')).toBe('https://www.crosscubes.com/asset-partners/dashboard');
      expect(webLink('/insurers/portal')).toBe('https://www.crosscubes.com/insurers/portal');
    } finally {
      Object.assign(notifications, saved);
    }
  });

  it('does not mistake look-alike paths for another site', () => {
    expect(siteForPath('/hosting')).toBe('guest');
    expect(siteForPath('/hosts/h1')).toBe('guest');
    expect(siteForPath('/captains')).toBe('guest');
    expect(siteForPath('/asset-partners')).toBe('guest');
    expect(siteForPath('/insurers/portalx')).toBe('guest');
  });
});

import { createVehicleSchema } from '../../vehicles/dto/vehicle.schemas';
import { vehicleService } from '../../vehicles/application/vehicle.service';
import { VehicleModel, type VehicleDoc, type WheelbaseLink } from '../../vehicles/infrastructure/vehicle.model';
import { hubService } from '../../hubs/application/hub.service';
import { HubModel } from '../../hubs/infrastructure/hub.model';
import { HostModel } from '../../hosts/infrastructure/host.model';
import type { WheelbaseListing } from '../infrastructure/wheelbase.client';

type Fuel = 'petrol' | 'diesel' | 'hybrid' | 'ev';
const FUEL: Record<string, Fuel> = {
  gas: 'petrol', gasoline: 'petrol', petrol: 'petrol', unleaded: 'petrol', flex: 'petrol', flex_fuel: 'petrol',
  diesel: 'diesel', hybrid: 'hybrid', plug_in_hybrid: 'hybrid', phev: 'hybrid', electric: 'ev', ev: 'ev',
};
const key = (s?: string) => (s ?? '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export const fuelOf = (s?: string): Fuel | undefined => FUEL[key(s)];
export const transmissionOf = (s?: string): 'manual' | 'automatic' | undefined =>
  /auto|cvt/.test(key(s)) ? 'automatic' : /manual|stick/.test(key(s)) ? 'manual' : undefined;

const photosOf = (l: WheelbaseListing) => l.details.photoUrls.slice(0, 30).map((url, i) => ({ url, isCover: i === 0 }));
const titleOf = (l: WheelbaseListing) => (l.name.trim().length >= 3 ? l.name.trim() : [l.year, l.make, l.model].filter(Boolean).join(' ')).slice(0, 120);

export type ImportOutcome = { vehicleId: string } | { skip: string };

/** Turns one Wheelbase listing into a listed CrossCubes car under the fleet account of the city that covers it. */
export async function importListing(l: WheelbaseListing, link: WheelbaseLink): Promise<ImportOutcome> {
  const d = l.details;
  if (!l.live) return { skip: 'Hidden or not published in Wheelbase' };
  const lat = d.location?.lat;
  const lng = d.location?.lng;
  if (lat === undefined || lng === undefined) return { skip: 'No location on the Wheelbase listing' };

  const hubId = await hubService.resolveForPoint(lng, lat);
  if (!hubId) return { skip: `${d.location?.city ?? 'Its location'} is not inside any CrossCubes city` };
  const hub = await HubModel.findById(hubId).select('name operatorHostId').lean<{ name: string; operatorHostId?: string }>();
  const host = hub?.operatorHostId ? await HostModel.findById(hub.operatorHostId).select('userId').lean<{ userId: string }>() : null;
  if (!host) return { skip: `${hub?.name ?? 'The city'} has no fleet account yet` };

  const fuelType = fuelOf(d.fuelType);
  const transmission = transmissionOf(d.transmission);
  const missing = [
    !l.year && 'year', !l.make && 'make', !l.model && 'model', !fuelType && 'fuel type', !transmission && 'transmission',
    !d.seats && 'seats', !d.bodyClass && 'vehicle type', !d.pricePerDayCents && 'daily price', !d.photoUrls.length && 'photos',
  ].filter((m): m is string => !!m);
  if (missing.length) return { skip: `The Wheelbase listing has no ${missing.join(', ')}` };

  const parsed = createVehicleSchema.safeParse({
    make: l.make,
    model: l.model,
    year: l.year,
    bodyType: d.bodyClass,
    transmission,
    fuelType,
    seats: d.seats,
    features: d.features,
    photos: photosOf(l),
    location: { lat, lng, address: [d.location?.city, d.location?.state].filter(Boolean).join(', '), city: d.location?.city ?? '' },
    listing: { title: titleOf(l), description: (d.description ?? '').slice(0, 2000) },
    pricing: { dailyPrice: Math.round(d.pricePerDayCents!), currency: 'USD' },
  });
  if (!parsed.success) return { skip: `The Wheelbase listing has an unusable ${parsed.error.issues[0]?.path.join('.') || 'field'}` };

  const car = await vehicleService.create(host.userId, parsed.data);
  // Wheelbase has already checked and insures the car; guests still only see it while that insurance is approved.
  await VehicleModel.updateOne(
    { _id: car._id },
    { $set: { status: 'listed', verificationStatus: 'verified', wheelbase: link, ...(d.location?.state ? { 'location.state': d.location.state.toUpperCase().slice(0, 2) } : {}) } },
  );
  return { vehicleId: car._id };
}

/** Keeps an imported car's photos, price and words the same as its Wheelbase listing. */
export function importedContent(car: Pick<VehicleDoc, 'photos' | 'pricing' | 'listing'>, l: WheelbaseListing): Record<string, unknown> {
  const d = l.details;
  const set: Record<string, unknown> = {};
  const photos = photosOf(l);
  if (photos.length && photos.map((p) => p.url).join() !== (car.photos ?? []).map((p) => p.url).join()) set.photos = photos;
  if (d.pricePerDayCents && Math.round(d.pricePerDayCents) !== car.pricing?.dailyPrice) set['pricing.dailyPrice'] = Math.round(d.pricePerDayCents);
  const description = (d.description ?? '').slice(0, 2000);
  if (description && description !== car.listing?.description) set['listing.description'] = description;
  if (titleOf(l).length >= 3 && titleOf(l) !== car.listing?.title) set['listing.title'] = titleOf(l);
  return set;
}

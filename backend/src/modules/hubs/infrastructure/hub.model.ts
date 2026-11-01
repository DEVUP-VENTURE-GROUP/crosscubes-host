import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const HUB_STATUSES = ['setup', 'live', 'paused', 'closed'] as const;
export type HubStatus = (typeof HUB_STATUSES)[number];

export const LICENCE_KINDS = ['insurance', 'state_permit', 'business_licence', 'sales_tax', 'other'] as const;
export type LicenceKind = (typeof LICENCE_KINDS)[number];

export interface HubDocument {
  _id: string;
  kind: LicenceKind;
  label: string;
  number?: string;
  issuedAt?: Date;
  expiresAt?: Date;
  fileKey?: string;
  addedAt: Date;
  addedBy: string;
}

export interface LicenceTerm {
  feeCents: number;
  paidAt: Date;
  startsAt: Date;
  expiresAt: Date;
  reference?: string;
  by: string;
}

export interface HubDoc {
  _id: string;
  /** Short unique tag shown everywhere a hub is named, e.g. HOU. */
  code: string;
  name: string;
  city: string;
  state: string;
  timezone: string;
  status: HubStatus;
  territory: { center: { type: 'Point'; coordinates: [number, number] }; radiusMiles: number; exclusive: boolean };
  /** The licence holder: our representative who runs this city. */
  holder: { legalName: string; contactName: string; email: string; phone?: string };
  operatorUserId?: string;
  operatorHostId?: string;
  /** Holder share of the hub's gross, overriding the platform default when set. */
  economics: { holderShareBps?: number };
  /** The paid licence; the hub only takes bookings while it is in date. */
  licence: { startsAt?: Date; expiresAt?: Date; terms: LicenceTerm[]; remindedFor?: Date };
  /** Insurance, permits and registrations the holder must keep in date. */
  documents: HubDocument[];
  timeline: { at: Date; by: string; event: string; note?: string }[];
  applicationId?: string;
  launchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<HubDoc>(
  {
    _id: { type: String, default: () => uuid() },
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, uppercase: true, trim: true },
    timezone: { type: String, required: true },
    status: { type: String, enum: HUB_STATUSES, default: 'setup' },
    territory: {
      center: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], required: true },
      },
      radiusMiles: { type: Number, required: true, min: 1, max: 300 },
      exclusive: { type: Boolean, default: true },
    },
    holder: {
      legalName: { type: String, required: true, trim: true },
      contactName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },
    operatorUserId: String,
    operatorHostId: String,
    economics: { holderShareBps: { type: Number, min: 0, max: 5000 } },
    licence: {
      startsAt: Date,
      expiresAt: Date,
      remindedFor: Date,
      terms: {
        type: [new Schema({ feeCents: Number, paidAt: Date, startsAt: Date, expiresAt: Date, reference: String, by: String }, { _id: false })],
        default: [],
      },
    },
    documents: {
      type: [
        new Schema(
          {
            _id: { type: String, default: () => uuid() },
            kind: { type: String, enum: LICENCE_KINDS, required: true },
            label: { type: String, required: true },
            number: String,
            issuedAt: Date,
            expiresAt: Date,
            fileKey: String,
            addedAt: { type: Date, default: () => new Date() },
            addedBy: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    timeline: { type: [new Schema({ at: Date, by: String, event: String, note: String }, { _id: false })], default: [] },
    applicationId: String,
    launchedAt: Date,
  },
  { timestamps: true },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ operatorUserId: 1 }, { unique: true, sparse: true });
schema.index({ status: 1 });
schema.index({ 'licence.expiresAt': 1 });

export const HubModel = model<HubDoc>('Hub', schema);

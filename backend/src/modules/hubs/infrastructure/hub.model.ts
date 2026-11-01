import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const HUB_STATUSES = ['setup', 'live', 'paused', 'closed'] as const;
export type HubStatus = (typeof HUB_STATUSES)[number];

export const LICENCE_KINDS = ['franchise_agreement', 'insurance', 'state_permit', 'business_licence', 'sales_tax', 'other'] as const;
export type LicenceKind = (typeof LICENCE_KINDS)[number];

export interface HubLicence {
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
  franchisee: { legalName: string; contactName: string; email: string; phone?: string };
  operatorUserId?: string;
  operatorHostId?: string;
  agreement: { signedAt?: Date; startsAt?: Date; termYears: number; endsAt?: Date };
  /** Percent of gross trip revenue owed to HQ each month. */
  economics: { royaltyPct: number; techFeePct: number; marketingFundPct: number };
  licences: HubLicence[];
  timeline: { at: Date; by: string; event: string; note?: string }[];
  launchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const pct = { type: Number, required: true, min: 0, max: 50 };

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
    franchisee: {
      legalName: { type: String, required: true, trim: true },
      contactName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, trim: true },
    },
    operatorUserId: String,
    operatorHostId: String,
    agreement: {
      signedAt: Date,
      startsAt: Date,
      termYears: { type: Number, required: true, min: 1, max: 30 },
      endsAt: Date,
    },
    economics: { royaltyPct: pct, techFeePct: pct, marketingFundPct: pct },
    licences: {
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
    launchedAt: Date,
  },
  { timestamps: true },
);

schema.index({ code: 1 }, { unique: true });
schema.index({ operatorUserId: 1 }, { unique: true, sparse: true });
schema.index({ status: 1 });

export const HubModel = model<HubDoc>('Hub', schema);

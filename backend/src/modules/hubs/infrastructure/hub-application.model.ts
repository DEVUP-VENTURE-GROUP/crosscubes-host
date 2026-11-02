import { Schema, model } from 'mongoose';
import { uuid } from '../../../shared/utils/uuid';

export const HUB_APPLICATION_STATUSES = ['submitted', 'approved', 'rejected', 'paid', 'withdrawn'] as const;
export type HubApplicationStatus = (typeof HUB_APPLICATION_STATUSES)[number];

export const HUB_REJECTION_REASONS = ['territory_taken', 'market_not_ready', 'experience', 'capital', 'incomplete', 'other'] as const;
export type HubRejectionReason = (typeof HUB_REJECTION_REASONS)[number];

export const START_TIMELINES = ['now', 'three_months', 'six_months'] as const;

export interface HubApplicationDoc {
  _id: string;
  /** Shown to the applicant, e.g. CC-HUB-482913. */
  reference: string;
  userId: string;
  status: HubApplicationStatus;
  applicant: {
    fullName: string;
    email: string;
    phone: string;
    companyName?: string;
    city: string;
    state: string;
    about: string;
    carsFirstYear: number;
    startTimeline: (typeof START_TIMELINES)[number];
    hasBusinessEntity: boolean;
  };
  decision?: { by: string; at: Date; note?: string; reasons?: HubRejectionReason[] };
  hubId?: string;
  /** The licence price when approved; later price changes don't move what was offered. */
  licenceFeeCents?: number;
  payment?: { intentId?: string; paidAt?: Date };
  timeline: { at: Date; by: string; event: string; note?: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<HubApplicationDoc>(
  {
    _id: { type: String, default: () => uuid() },
    reference: { type: String, required: true },
    userId: { type: String, required: true },
    status: { type: String, enum: HUB_APPLICATION_STATUSES, default: 'submitted' },
    applicant: {
      fullName: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      phone: { type: String, required: true, trim: true },
      companyName: { type: String, trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, uppercase: true, trim: true },
      about: { type: String, required: true },
      carsFirstYear: { type: Number, required: true },
      startTimeline: { type: String, enum: START_TIMELINES, required: true },
      hasBusinessEntity: { type: Boolean, required: true },
    },
    decision: { by: String, at: Date, note: String, reasons: [String] },
    hubId: String,
    licenceFeeCents: Number,
    payment: { intentId: String, paidAt: Date },
    timeline: { type: [new Schema({ at: Date, by: String, event: String, note: String }, { _id: false })], default: [] },
  },
  { timestamps: true },
);

schema.index({ reference: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

export const HubApplicationModel = model<HubApplicationDoc>('HubApplication', schema);

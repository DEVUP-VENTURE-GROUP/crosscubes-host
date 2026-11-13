import { Schema, model } from 'mongoose';
import { hubScoped } from '../../../shared/tenancy/hub-scoped.plugin';

export type WheelbaseReservationState = 'active' | 'completed' | 'cancelled';

export interface WheelbaseReservationDoc {
  /** The Wheelbase reservation id. */
  _id: string;
  rentalId: number;
  /** Unset while the Wheelbase listing is not linked to a CrossCubes car. */
  vehicleId?: string;
  hubId?: string;
  /** Wheelbase's own status word, kept as sent. */
  status: string;
  state: WheelbaseReservationState;
  period: { start: Date; end: Date };
  /** Rental price before tax and insurance, as Wheelbase reports it. */
  amountCents?: number;
  currency: string;
  renterName?: string;
  sourceUpdatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<WheelbaseReservationDoc>(
  {
    _id: { type: String, required: true },
    rentalId: { type: Number, required: true },
    vehicleId: { type: String, index: true },
    status: { type: String, required: true },
    state: { type: String, required: true, enum: ['active', 'completed', 'cancelled'] },
    period: { start: { type: Date, required: true }, end: { type: Date, required: true } },
    amountCents: Number,
    currency: { type: String, default: 'USD' },
    renterName: String,
    sourceUpdatedAt: Date,
  },
  { timestamps: true, _id: false, collection: 'wheelbase_reservations' },
);

schema.plugin(hubScoped);
schema.index({ hubId: 1, state: 1, 'period.end': 1 });
schema.index({ rentalId: 1 });

export const WheelbaseReservationModel = model<WheelbaseReservationDoc>('WheelbaseReservation', schema);

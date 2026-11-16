import { Schema, model } from 'mongoose';
import type { WheelbaseSyncResult } from '../application/wheelbase-insurance.service';

export interface WheelbaseSyncStateDoc {
  _id: 'wheelbase';
  lastRunAt?: Date;
  lastOkAt?: Date;
  /** Why the last read failed, for staff; cleared by the next good read. */
  lastError?: 'not_set_up' | 'unreachable';
  lastResult?: WheelbaseSyncResult;
  /** Set once per outage so staff get one alert, not one every run. */
  staleAlertedAt?: Date;
}

const schema = new Schema<WheelbaseSyncStateDoc>(
  {
    _id: { type: String, default: 'wheelbase' },
    lastRunAt: Date,
    lastOkAt: Date,
    lastError: { type: String, enum: ['not_set_up', 'unreachable'] },
    lastResult: {
      listings: Number, updated: Number, autoLinked: Number, unmatched: Number, missing: Number, lapsed: Number, imported: Number,
      skipped: [{ _id: false, rentalId: Number, name: String, reason: String }],
      calendars: Number, calendarErrors: Number,
    },
    staleAlertedAt: Date,
  },
  { collection: 'wheelbase_sync_state', versionKey: false },
);

export const WheelbaseSyncStateModel = model<WheelbaseSyncStateDoc>('WheelbaseSyncState', schema);

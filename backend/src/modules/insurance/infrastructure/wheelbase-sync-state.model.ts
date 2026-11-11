import { Schema, model } from 'mongoose';

export interface WheelbaseSyncStateDoc {
  _id: 'wheelbase';
  lastRunAt?: Date;
  lastOkAt?: Date;
  /** Why the last read failed, for staff; cleared by the next good read. */
  lastError?: 'not_set_up' | 'unreachable';
  lastResult?: { listings: number; updated: number; autoLinked: number; unmatched: number; missing: number; lapsed: number };
  /** Set once per outage so staff get one alert, not one every run. */
  staleAlertedAt?: Date;
}

const schema = new Schema<WheelbaseSyncStateDoc>(
  {
    _id: { type: String, default: 'wheelbase' },
    lastRunAt: Date,
    lastOkAt: Date,
    lastError: { type: String, enum: ['not_set_up', 'unreachable'] },
    lastResult: { listings: Number, updated: Number, autoLinked: Number, unmatched: Number, missing: Number, lapsed: Number },
    staleAlertedAt: Date,
  },
  { collection: 'wheelbase_sync_state', versionKey: false },
);

export const WheelbaseSyncStateModel = model<WheelbaseSyncStateDoc>('WheelbaseSyncState', schema);

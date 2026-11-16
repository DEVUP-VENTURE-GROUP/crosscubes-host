import { Schema, model } from 'mongoose';

/** One row per Wheelbase listing CrossCubes has turned into a car; the unique id stops two servers importing it twice. */
export interface WheelbaseImportDoc {
  _id: number;
  vehicleId?: string;
  claimedAt: Date;
}

const schema = new Schema<WheelbaseImportDoc>(
  {
    _id: { type: Number },
    vehicleId: String,
    claimedAt: { type: Date, required: true },
  },
  { collection: 'wheelbase_imports', versionKey: false },
);

export const WheelbaseImportModel = model<WheelbaseImportDoc>('WheelbaseImport', schema);

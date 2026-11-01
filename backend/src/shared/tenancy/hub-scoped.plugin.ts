import type { Schema, Query, MongooseQueryMiddleware } from 'mongoose';
import { currentHubId } from './hub-context';
import { NotFoundError } from '../../core/errors/app-error';

const QUERY_OPS: MongooseQueryMiddleware[] = [
  'find',
  'findOne',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

function movesHub(update: unknown, hubId: string): boolean {
  if (!update || typeof update !== 'object') return false;
  const u = update as Record<string, unknown>;
  const set = (u.$set ?? {}) as Record<string, unknown>;
  const direct = 'hubId' in u ? u.hubId : set.hubId;
  return (direct !== undefined && direct !== hubId) || 'hubId' in ((u.$unset ?? {}) as object);
}

/** Adds hubId to a collection and, inside runInHub, confines every query, aggregate and write to that hub. */
export function hubScoped(schema: Schema): void {
  schema.add({ hubId: { type: String, index: true } });

  schema.pre(QUERY_OPS, function (this: Query<unknown, unknown>) {
    const hubId = currentHubId();
    if (!hubId) return;
    // Overwrites any hubId the caller passed, so a crafted filter can never reach another hub.
    this.where({ hubId });
    if (movesHub(this.getUpdate(), hubId)) throw new NotFoundError('Resource');
  });

  schema.pre('aggregate', function () {
    const hubId = currentHubId();
    if (!hubId) return;
    const pipeline = this.pipeline();
    const first = pipeline[0] as unknown as Record<string, unknown> | undefined;
    // $geoNear has to stay the first stage.
    pipeline.splice(first && '$geoNear' in first ? 1 : 0, 0, { $match: { hubId } });
  });

  schema.pre('save', function () {
    const hubId = currentHubId();
    if (!hubId) return;
    const doc = this as unknown as { hubId?: string };
    if (!doc.hubId) doc.hubId = hubId;
    else if (doc.hubId !== hubId) throw new NotFoundError('Resource');
  });

  schema.pre('insertMany', function (next: (err?: Error) => void, docs: unknown) {
    const hubId = currentHubId();
    if (!hubId) return next();
    for (const doc of (Array.isArray(docs) ? docs : [docs]) as { hubId?: string }[]) {
      if (!doc.hubId) doc.hubId = hubId;
      else if (doc.hubId !== hubId) return next(new NotFoundError('Resource'));
    }
    next();
  });
}

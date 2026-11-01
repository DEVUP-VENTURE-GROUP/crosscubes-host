import type { Request, Response, NextFunction } from 'express';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../core/errors/app-error';
import { userRepository } from '../../modules/users/infrastructure/user.repository';
import { hubService } from '../../modules/hubs/application/hub.service';
import { HOUSE_FLEET_ROLE, IOC_PERMISSIONS, STAFF_ROLES } from '../constants/rbac';
import { runInHub } from '../tenancy/hub-context';
import { logger } from '../../infrastructure/logging/logger';

/** The hub portal's gate: a franchisee account with an open hub, re-read from the database on every request. */
export function requireFleetOwner(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    try {
      const principal = req.principal;
      if (!principal) throw new UnauthorizedError();
      const user = await userRepository.findById(principal.userId);
      if (!user) throw new UnauthorizedError('Account not found');
      if (user.status !== 'active') throw new ForbiddenError('Account is not active');
      const roles = user.roles ?? [];
      if (!roles.includes(HOUSE_FLEET_ROLE) || roles.some((r) => STAFF_ROLES.includes(r))) {
        logger.warn({ userId: user._id }, 'hub portal access denied');
        throw new NotFoundError('Resource');
      }
      const hub = await hubService.hubForOperator(user._id);
      if (!hub) {
        logger.warn({ userId: user._id }, 'hub portal access denied: no open hub');
        throw new NotFoundError('Resource');
      }
      // Scoped to the routes mounted behind this gate, which are only Asset Partner management.
      principal.roles = roles;
      principal.permissions = [...IOC_PERMISSIONS];
      principal.hubId = hub._id;
      // Everything after this gate only sees and writes this hub's records.
      runInHub(hub._id, () => next());
    } catch (err) {
      next(err);
    }
  })();
}

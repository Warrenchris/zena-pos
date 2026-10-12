'use strict';

const jwt = require('jsonwebtoken');

/**
 * Per-request authentication/authorization state holder (Stage C1).
 *
 * Uses a module-private WeakMap keyed by the Express `req` object so that:
 * 1. The RS256 JWT is verified at most once per request across
 *    `emailVerification7DayGate` and `auth.js`.
 * 2. Cold requests share a single non-secret `User.findByPk` or
 *    `Employee.findByPk` promise across `emailVerification7DayGate`,
 *    `requireVerifiedEmail`, `tokenRevocationService.getUserStatus`,
 *    `tokenRevocationService.getAuthzVersion`, and `authzContext`.
 * 3. `tokenRevocationService.getOrgStatus` is resolved once per
 *    `(req, organizationId)` instead of being queried twice in `auth.js`
 *    and `authzContext.js`.
 *
 * Security Invariant:
 * - State is stored strictly in `requestStates` (a module-private WeakMap).
 * - Nothing is attached to `req`, so client-controlled headers, query params,
 *   or body fields cannot spoof or influence this state.
 * - Only non-secret columns are selected from `Users` and `Employees`
 *   (never password hashes, PINs, or verification/reset token hashes).
 */
const requestStates = new WeakMap();

const USER_NON_SECRET_ATTRIBUTES = Object.freeze([
  'id',
  'name',
  'email',
  'role',
  'active',
  'shopId',
  'authzVersion',
  'emailVerifiedAt',
  'createdAt'
]);

const EMPLOYEE_NON_SECRET_ATTRIBUTES = Object.freeze([
  'id',
  'firstName',
  'lastName',
  'email',
  'position',
  'status',
  'shopId',
  'authzVersion'
]);

function isRequestObject(req) {
  return typeof req === 'object' && req !== null;
}

function getOrCreateState(req) {
  if (!isRequestObject(req)) return null;
  let state = requestStates.get(req);
  if (!state) {
    state = {
      jwtVerification: null,
      actorPromises: new Map(),
      orgStatusPromises: new Map()
    };
    requestStates.set(req, state);
  }
  return state;
}

function getUserModel() {
  const models = require('../models');
  return models?.User || require('../models/User');
}

function getEmployeeModel() {
  const models = require('../models');
  return models?.Employee || require('../models/Employee');
}

/**
 * Verify a bearer JWT once per request and share the decoded claims
 * (or verification error) across middlewares inspecting the same token.
 */
function verifyRequestJwt(req, token) {
  const publicKey = (process.env.JWT_PUBLIC_KEY || '').replace(/\\n/g, '\n');
  const state = getOrCreateState(req);

  if (
    state &&
    state.jwtVerification &&
    state.jwtVerification.token === token &&
    state.jwtVerification.publicKey === publicKey
  ) {
    if (state.jwtVerification.error) {
      throw state.jwtVerification.error;
    }
    return { ...state.jwtVerification.decoded };
  }

  try {
    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    if (state) {
      state.jwtVerification = {
        token,
        publicKey,
        decoded,
        error: null
      };
    }
    return { ...decoded };
  } catch (err) {
    if (state) {
      state.jwtVerification = {
        token,
        publicKey,
        decoded: null,
        error: err
      };
    }
    throw err;
  }
}

function queryActorFromDb(id, isEmployee) {
  if (isEmployee) {
    const Employee = getEmployeeModel();
    return Employee.findByPk(id, {
      attributes: [...EMPLOYEE_NON_SECRET_ATTRIBUTES]
    });
  }
  const User = getUserModel();
  return User.findByPk(id, {
    attributes: [...USER_NON_SECRET_ATTRIBUTES]
  });
}

/**
 * Load a User or Employee record (non-secret columns only) at most once per request.
 */
function getRequestActor(req, id, isEmployee = false) {
  if (id === undefined || id === null) {
    return Promise.resolve(null);
  }
  const normalizedIsEmployee = Boolean(isEmployee);
  const state = getOrCreateState(req);
  if (!state) {
    return queryActorFromDb(id, normalizedIsEmployee);
  }

  const key = `${normalizedIsEmployee ? 'e' : 'u'}:${String(id)}`;
  if (state.actorPromises.has(key)) {
    return state.actorPromises.get(key);
  }

  const promise = Promise.resolve()
    .then(() => queryActorFromDb(id, normalizedIsEmployee))
    .catch((err) => {
      state.actorPromises.delete(key);
      throw err;
    });

  state.actorPromises.set(key, promise);
  return promise;
}

/**
 * Resolve organization status at most once per (req, orgId).
 */
function getRequestOrgStatus(req, orgId, resolverFn) {
  if (!orgId) {
    return Promise.resolve(null);
  }
  const state = getOrCreateState(req);
  if (!state) {
    return resolverFn(orgId);
  }

  const key = String(Number(orgId) || orgId);
  if (state.orgStatusPromises.has(key)) {
    return state.orgStatusPromises.get(key);
  }

  const promise = Promise.resolve()
    .then(() => resolverFn(orgId))
    .catch((err) => {
      state.orgStatusPromises.delete(key);
      throw err;
    });

  state.orgStatusPromises.set(key, promise);
  return promise;
}

module.exports = {
  USER_NON_SECRET_ATTRIBUTES,
  EMPLOYEE_NON_SECRET_ATTRIBUTES,
  verifyRequestJwt,
  getRequestActor,
  getRequestOrgStatus
};

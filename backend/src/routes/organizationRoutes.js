'use strict';

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const organizationController = require('../controllers/organizationController');
const { createDistributedRateLimiter } = require('../utils/distributedRateLimiter');

router.use(auth);

// Rate limiter for data export (2 exports per hour per org)
const dataExportLimiter = createDistributedRateLimiter({
  namespace: 'org-export',
  windowMs: 60 * 60 * 1000,
  max: 2,
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-forwarded-for'],
  message: { error: 'Too many export requests. Maximum 2 exports per hour.' },
  keyGenerator: (req) => `export:${req.organizationId || req.user?.organizationId || req.user?.id}`,
});

// Tenant-wide member management (P1-04)
router.get('/members', organizationController.getOrganizationMembers);

// Owner-only organization data export (7D)
router.get('/export', dataExportLimiter, organizationController.exportOrganizationData);

module.exports = router;

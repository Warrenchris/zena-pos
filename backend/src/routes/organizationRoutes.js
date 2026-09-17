'use strict';

const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const organizationController = require('../controllers/organizationController');

router.use(auth);

// Tenant-wide member management (P1-04)
router.get('/members', organizationController.getOrganizationMembers);

module.exports = router;

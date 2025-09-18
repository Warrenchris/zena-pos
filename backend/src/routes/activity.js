const express = require('express');
const { auth, checkRole } = require('../middleware/auth');
const controller = require('../controllers/activityController');

const router = express.Router();

router.use(auth, checkRole(['admin', 'manager']));

router.get('/', controller.list);

module.exports = router;



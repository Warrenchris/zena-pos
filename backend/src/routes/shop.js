const express = require('express');
const { auth, checkRole } = require('../middleware/auth');
const controller = require('../controllers/shopController');

const router = express.Router();

router.use(auth, checkRole(['admin']));

router.get('/me', controller.getMine);
router.put('/me', controller.updateMine);

module.exports = router;



const express = require('express');
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const controller = require('../controllers/userController');

const router = express.Router();

router.use(auth, checkRole(['admin']));

router.get('/', controller.list);
router.post(
  '/',
  requireVerifiedEmail,
  [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(['admin', 'cashier', 'manager'])
  ],
  controller.create
);
router.put('/:id/role', controller.updateRole);

module.exports = router;



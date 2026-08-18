const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Stricter limiter for credential/reset endpoints to slow down brute-force and
// credential-stuffing attempts. Keyed by IP + email so a single IP can't lock out
// unrelated accounts. Uses ipKeyGenerator to correctly normalize IPv6 addresses
// (otherwise an attacker could vary the IPv6 suffix to bypass the limit entirely).
// Deliberately NOT applied to /profile or /change-password, which are hit by
// already-authenticated users during normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${(req.body && req.body.email) || ''}`,
});

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long'),
    body('role')
      .optional()
      .isIn(['admin', 'cashier', 'manager'])
      .withMessage('Invalid role')
    ,
    body('shop.name').notEmpty().withMessage('Shop name is required')
  ],
  authController.register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  authController.login
);

router.post(
  '/forgot-password',
  authLimiter,
  [body('email').isEmail().withMessage('Please enter a valid email')],
  authController.forgotPassword
);

router.post(
  '/reset-password',
  authLimiter,
  [
    body('token').notEmpty().withMessage('Token is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
  ],
  authController.resetPassword
);

router.get('/profile', auth, authController.getProfile);
router.post('/change-password', auth, authController.changePassword);

module.exports = router;

const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { createDistributedRateLimiter } = require('../utils/distributedRateLimiter');
const router = express.Router();

const getClientIp = require('../utils/getClientIp');

// Distributed limiter for credential/reset endpoints (10 attempts / 15 mins)
// Keyed by IP + email so a single IP can't lock out unrelated accounts
const authLimiter = createDistributedRateLimiter({
  namespace: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-forwarded-for'],
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
  keyGenerator: (req) => `${getClientIp(req)}:${(req.body && req.body.email) || ''}`,
});

// Distributed limiter for registration (5 registrations / hour per IP)
const registerLimiter = createDistributedRateLimiter({
  namespace: 'register',
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-forwarded-for'],
  message: { error: 'Too many registration attempts from this IP address. Please try again later.' },
  keyGenerator: (req) => getClientIp(req),
});

router.post(
  '/register',
  registerLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Please enter a valid email'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters long'),
    body('role').optional(),
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
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
  ],
  authController.resetPassword
);

// Distributed limiter for email verification (20 attempts / 15 mins per IP).
// Keyed by IP ONLY: including the submitted token in the key would give every
// guessed token its own fresh bucket and make the limit meaningless.
const verifyEmailKeyGenerator = (req) => getClientIp(req);
const verifyEmailLimiter = createDistributedRateLimiter({
  namespace: 'verify-email',
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many verification attempts. Please try again in a few minutes.' },
  keyGenerator: verifyEmailKeyGenerator,
});

// Distributed limiter for resending verification (5 per hour per user/IP)
const resendLimiter = createDistributedRateLimiter({
  namespace: 'resend-verification',
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many verification requests. Maximum 5 per hour.' },
  keyGenerator: (req) => `${getClientIp(req)}:${req.user?.id || ''}`,
});

router.post(
  '/verify-email',
  verifyEmailLimiter,
  [body('token').trim().notEmpty().withMessage('Token is required')],
  authController.verifyEmail
);

router.post(
  '/resend-verification',
  auth,
  resendLimiter,
  authController.resendVerification
);

router.get('/profile', auth, authController.getProfile);
router.post('/change-password', auth, authController.changePassword);
router.post('/logout', auth, authController.logout);
router.post(
  '/switch-shop',
  auth,
  [
    body('shopId')
      .notEmpty()
      .withMessage('shopId is required')
      .bail()
      .isInt()
      .withMessage('shopId must be an integer')
  ],
  authController.switchShop
);

module.exports = router;
module.exports.authLimiter = authLimiter;
module.exports.registerLimiter = registerLimiter;
module.exports.verifyEmailLimiter = verifyEmailLimiter;
module.exports.verifyEmailKeyGenerator = verifyEmailKeyGenerator;
module.exports.resendLimiter = resendLimiter;

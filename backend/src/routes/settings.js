const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { auth } = require('../middleware/auth');
const { checkPermission } = require('../middleware/rolePermissions');
const {
  getSettings,
  updateSettings,
  resetSettings,
  getCurrencyFormat,
  getThemeSettings,
  getNotificationSettings
} = require('../controllers/settingsController');

// Custom validator for optional nullable fields
const isNullable = (value) => {
  return value === null || value === undefined || value === '';
};

// Validation rules for settings update
const settingsValidation = [
  body('systemName').optional().isString().isLength({ min: 1, max: 100 }),
  body('contactEmail')
    .optional()
    .custom((value) => {
      if (isNullable(value)) return true;
      // Use a more comprehensive email regex
      return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value);
    })
    .withMessage('Invalid email format'),
  body('contactPhone')
    .optional()
    .custom((value) => {
      if (isNullable(value)) return true;
      // Allow various phone formats
      return /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{3,}[-\s.]?[0-9]{3,}$/.test(value);
    })
    .withMessage('Invalid phone number format'),
  body('timezone').optional().isString(),
  body('language').optional().isIn(['en', 'sw', 'fr', 'ar']),
  body('theme').optional().isIn(['light', 'dark', 'system']),
  body('defaultCurrency')
    .optional()
    .isIn(['KES', 'USD', 'NGN', 'ZAR', 'GHS', 'TZS', 'UGX', 'XOF', 'XAF'])
    .withMessage('Invalid currency code')
    .custom((value, { req }) => {
      // Synchronize currency symbol with currency code
      const currencySymbols = {
        'USD': '$',
        'KES': 'KSh',
        'NGN': '₦',
        'ZAR': 'R',
        'GHS': 'GH₵',
        'TZS': 'TSh',
        'UGX': 'USh',
        'XOF': 'CFA',
        'XAF': 'FCFA'
      };
      if (value && !req.body.currencySymbol) {
        req.body.currencySymbol = currencySymbols[value];
      }
      return true;
    }),
  body('currencySymbol')
    .optional()
    .isString()
    .isLength({ min: 1, max: 10 })
    .withMessage('Currency symbol must be 1-10 characters long'),
  body('currencyPosition')
    .optional()
    .isIn(['before', 'after'])
    .withMessage('Currency position must be either "before" or "after"'),
  body('decimalPlaces')
    .optional()
    .isInt({ min: 0, max: 4 })
    .withMessage('Decimal places must be between 0 and 4'),
  body('enableNotifications').optional().isBoolean(),
  body('enableSoundAlerts').optional().isBoolean(),
  body('enableEmailAlerts').optional().isBoolean(),
  body('enableSuccessToasts').optional().isBoolean(),
  body('enableErrorToasts').optional().isBoolean(),
  body('passwordMinLength').optional().isInt({ min: 6, max: 20 }),
  body('requireSpecialChars').optional().isBoolean(),
  body('sessionTimeout').optional().isInt({ min: 30, max: 1440 }),
  body('enableTwoFactor').optional().isBoolean(),
  body('maxLoginAttempts').optional().isInt({ min: 3, max: 10 }),
  body('autoBackupEnabled').optional().isBoolean(),
  body('backupFrequency').optional().isIn(['daily', 'weekly', 'monthly']),
  body('backupRetentionDays').optional().isInt({ min: 7, max: 365 }),
  body('allowUserRegistration').optional().isBoolean(),
  body('requireEmailVerification').optional().isBoolean()
];

// All routes require authentication and admin role
router.use(auth);
router.use(checkPermission('manage_settings'));

// Get all settings
router.get('/', getSettings);

// Update settings
router.put('/', settingsValidation, updateSettings);

// Reset settings to defaults
router.post('/reset', resetSettings);

// Get specific setting groups
router.get('/currency', getCurrencyFormat);
router.get('/theme', getThemeSettings);
router.get('/notifications', getNotificationSettings);

module.exports = router;
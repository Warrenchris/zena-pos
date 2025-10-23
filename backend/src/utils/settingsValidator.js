const cleanAndValidateSettings = (data) => {
  const errors = [];
  const cleanData = {};

  // Define expected types and validation rules
  const fieldRules = {
    systemName: { type: 'string', maxLength: 100 },
    businessLogo: { type: 'string', optional: true },
    contactEmail: { type: 'string', optional: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    contactPhone: { type: 'string', optional: true },
    timezone: { type: 'string', values: ['Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 'Africa/Cairo', 'UTC'] },
    language: { type: 'string', values: ['en', 'sw', 'fr', 'ar'] },
    theme: { type: 'string', values: ['light', 'dark', 'system'] },
    defaultCurrency: { type: 'string', values: ['KES', 'USD', 'NGN', 'ZAR', 'GHS', 'TZS', 'UGX', 'XOF', 'XAF'] },
    currencySymbol: { type: 'string', maxLength: 10 },
    currencyPosition: { type: 'string', values: ['before', 'after'] },
    decimalPlaces: { type: 'number', min: 0, max: 4 },
    enableNotifications: { type: 'boolean' },
    enableSoundAlerts: { type: 'boolean' },
    enableEmailAlerts: { type: 'boolean' },
    enableSuccessToasts: { type: 'boolean' },
    enableErrorToasts: { type: 'boolean' },
    passwordMinLength: { type: 'number', min: 6, max: 20 },
    requireSpecialChars: { type: 'boolean' },
    sessionTimeout: { type: 'number', min: 30, max: 1440 },
    enableTwoFactor: { type: 'boolean' },
    maxLoginAttempts: { type: 'number', min: 3, max: 10 },
    autoBackupEnabled: { type: 'boolean' },
    backupFrequency: { type: 'string', values: ['daily', 'weekly', 'monthly'] },
    backupRetentionDays: { type: 'number', min: 7, max: 365 },
    allowUserRegistration: { type: 'boolean' },
    requireEmailVerification: { type: 'boolean' }
  };

  // Clean and validate each field
  Object.entries(data).forEach(([key, value]) => {
    const rule = fieldRules[key];
    if (!rule) {
      return; // Skip unknown fields
    }

    // Skip if field is optional and value is null/undefined
    if (rule.optional && (value === null || value === undefined)) {
      return;
    }

    // Type validation
    if (rule.type === 'boolean' && typeof value !== 'boolean') {
      if (typeof value === 'string') {
        value = value.toLowerCase() === 'true';
      } else if (typeof value === 'number') {
        value = value === 1;
      } else {
        errors.push({ field: key, message: `Must be a boolean value` });
        return;
      }
    }

    if (rule.type === 'number' && typeof value !== 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        errors.push({ field: key, message: `Must be a number` });
        return;
      }
      value = num;
    }

    // Value validation
    if (rule.values && !rule.values.includes(value)) {
      errors.push({
        field: key,
        message: `Must be one of: ${rule.values.join(', ')}`,
        allowedValues: rule.values
      });
      return;
    }

    if (rule.min !== undefined && value < rule.min) {
      errors.push({ field: key, message: `Must be at least ${rule.min}` });
      return;
    }

    if (rule.max !== undefined && value > rule.max) {
      errors.push({ field: key, message: `Must be at most ${rule.max}` });
      return;
    }

    if (rule.pattern && !rule.pattern.test(value)) {
      errors.push({ field: key, message: `Invalid format` });
      return;
    }

    if (rule.maxLength && value.length > rule.maxLength) {
      errors.push({ field: key, message: `Must be at most ${rule.maxLength} characters` });
      return;
    }

    cleanData[key] = value;
  });

  return { cleanData, validationErrors: errors };
};

module.exports = cleanAndValidateSettings;
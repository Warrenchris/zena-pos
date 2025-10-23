/**
 * Validation utilities for settings and forms
 */

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {Object} Validation result
 */
export const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isValid = emailRegex.test(email);
  
  return {
    isValid,
    error: isValid ? null : 'Please enter a valid email address'
  };
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {Object} Validation result
 */
export const validatePhone = (phone) => {
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
  const isValid = phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''));
  
  return {
    isValid,
    error: isValid ? null : 'Please enter a valid phone number'
  };
};

/**
 * Validate currency code
 * @param {string} currencyCode - Currency code to validate
 * @returns {Object} Validation result
 */
export const validateCurrencyCode = (currencyCode) => {
  const validCurrencies = ['KES', 'USD', 'NGN', 'ZAR', 'GHS', 'TZS', 'UGX', 'XOF', 'XAF'];
  const isValid = validCurrencies.includes(currencyCode);
  
  return {
    isValid,
    error: isValid ? null : `Invalid currency code. Must be one of: ${validCurrencies.join(', ')}`
  };
};

/**
 * Validate timezone
 * @param {string} timezone - Timezone to validate
 * @returns {Object} Validation result
 */
export const validateTimezone = (timezone) => {
  const validTimezones = [
    'Africa/Nairobi', 'Africa/Lagos', 'Africa/Johannesburg', 
    'Africa/Cairo', 'Africa/Casablanca', 'Africa/Addis_Ababa',
    'UTC', 'America/New_York', 'Europe/London'
  ];
  const isValid = validTimezones.includes(timezone);
  
  return {
    isValid,
    error: isValid ? null : `Invalid timezone. Must be one of: ${validTimezones.join(', ')}`
  };
};

/**
 * Validate language code
 * @param {string} language - Language code to validate
 * @returns {Object} Validation result
 */
export const validateLanguage = (language) => {
  const validLanguages = ['en', 'sw', 'fr', 'ar'];
  const isValid = validLanguages.includes(language);
  
  return {
    isValid,
    error: isValid ? null : `Invalid language code. Must be one of: ${validLanguages.join(', ')}`
  };
};

/**
 * Validate theme
 * @param {string} theme - Theme to validate
 * @returns {Object} Validation result
 */
export const validateTheme = (theme) => {
  const validThemes = ['light', 'dark', 'system'];
  const isValid = validThemes.includes(theme);
  
  return {
    isValid,
    error: isValid ? null : 'Invalid theme. Must be light, dark, or system'
  };
};

/**
 * Validate password minimum length
 * @param {number} length - Password minimum length
 * @returns {Object} Validation result
 */
export const validatePasswordMinLength = (length) => {
  const isValid = length >= 6 && length <= 20;
  
  return {
    isValid,
    error: isValid ? null : 'Password minimum length must be between 6 and 20 characters'
  };
};

/**
 * Validate session timeout
 * @param {number} timeout - Session timeout in minutes
 * @returns {Object} Validation result
 */
export const validateSessionTimeout = (timeout) => {
  const isValid = timeout >= 30 && timeout <= 1440;
  
  return {
    isValid,
    error: isValid ? null : 'Session timeout must be between 30 and 1440 minutes'
  };
};

/**
 * Validate backup retention days
 * @param {number} days - Backup retention days
 * @returns {Object} Validation result
 */
export const validateBackupRetention = (days) => {
  const isValid = days >= 7 && days <= 365;
  
  return {
    isValid,
    error: isValid ? null : 'Backup retention must be between 7 and 365 days'
  };
};

/**
 * Validate max login attempts
 * @param {number} attempts - Max login attempts
 * @returns {Object} Validation result
 */
export const validateMaxLoginAttempts = (attempts) => {
  const isValid = attempts >= 3 && attempts <= 10;
  
  return {
    isValid,
    error: isValid ? null : 'Max login attempts must be between 3 and 10'
  };
};

/**
 * Validate decimal places
 * @param {number} places - Number of decimal places
 * @returns {Object} Validation result
 */
export const validateDecimalPlaces = (places) => {
  const isValid = places >= 0 && places <= 4;
  
  return {
    isValid,
    error: isValid ? null : 'Decimal places must be between 0 and 4'
  };
};

/**
 * Validate system name
 * @param {string} name - System name
 * @returns {Object} Validation result
 */
export const validateSystemName = (name) => {
  const isValid = name && name.trim().length >= 1 && name.trim().length <= 100;
  
  return {
    isValid,
    error: isValid ? null : 'System name must be between 1 and 100 characters'
  };
};

/**
 * Validate currency symbol
 * @param {string} symbol - Currency symbol
 * @returns {Object} Validation result
 */
export const validateCurrencySymbol = (symbol) => {
  const isValid = symbol && symbol.trim().length >= 1 && symbol.trim().length <= 10;
  
  return {
    isValid,
    error: isValid ? null : 'Currency symbol must be between 1 and 10 characters'
  };
};

/**
 * Comprehensive settings validation
 * @param {Object} settings - Settings object to validate
 * @returns {Object} Validation result with errors
 */
export const validateSettings = (settings) => {
  const errors = {};
  
  // Validate general settings
  if (settings.systemName !== undefined) {
    const nameValidation = validateSystemName(settings.systemName);
    if (!nameValidation.isValid) {
      errors.systemName = nameValidation.error;
    }
  }
  
  if (settings.contactEmail !== undefined && settings.contactEmail) {
    const emailValidation = validateEmail(settings.contactEmail);
    if (!emailValidation.isValid) {
      errors.contactEmail = emailValidation.error;
    }
  }
  
  if (settings.contactPhone !== undefined && settings.contactPhone) {
    const phoneValidation = validatePhone(settings.contactPhone);
    if (!phoneValidation.isValid) {
      errors.contactPhone = phoneValidation.error;
    }
  }
  
  if (settings.timezone !== undefined) {
    const timezoneValidation = validateTimezone(settings.timezone);
    if (!timezoneValidation.isValid) {
      errors.timezone = timezoneValidation.error;
    }
  }
  
  if (settings.language !== undefined) {
    const languageValidation = validateLanguage(settings.language);
    if (!languageValidation.isValid) {
      errors.language = languageValidation.error;
    }
  }
  
  if (settings.theme !== undefined) {
    const themeValidation = validateTheme(settings.theme);
    if (!themeValidation.isValid) {
      errors.theme = themeValidation.error;
    }
  }
  
  // Validate currency settings
  if (settings.defaultCurrency !== undefined) {
    const currencyValidation = validateCurrencyCode(settings.defaultCurrency);
    if (!currencyValidation.isValid) {
      errors.defaultCurrency = currencyValidation.error;
    }
  }
  
  if (settings.currencySymbol !== undefined) {
    const symbolValidation = validateCurrencySymbol(settings.currencySymbol);
    if (!symbolValidation.isValid) {
      errors.currencySymbol = symbolValidation.error;
    }
  }
  
  if (settings.decimalPlaces !== undefined) {
    const decimalValidation = validateDecimalPlaces(settings.decimalPlaces);
    if (!decimalValidation.isValid) {
      errors.decimalPlaces = decimalValidation.error;
    }
  }
  
  // Validate security settings
  if (settings.passwordMinLength !== undefined) {
    const passwordValidation = validatePasswordMinLength(settings.passwordMinLength);
    if (!passwordValidation.isValid) {
      errors.passwordMinLength = passwordValidation.error;
    }
  }
  
  if (settings.sessionTimeout !== undefined) {
    const timeoutValidation = validateSessionTimeout(settings.sessionTimeout);
    if (!timeoutValidation.isValid) {
      errors.sessionTimeout = timeoutValidation.error;
    }
  }
  
  if (settings.maxLoginAttempts !== undefined) {
    const attemptsValidation = validateMaxLoginAttempts(settings.maxLoginAttempts);
    if (!attemptsValidation.isValid) {
      errors.maxLoginAttempts = attemptsValidation.error;
    }
  }
  
  // Validate backup settings
  if (settings.backupRetentionDays !== undefined) {
    const retentionValidation = validateBackupRetention(settings.backupRetentionDays);
    if (!retentionValidation.isValid) {
      errors.backupRetentionDays = retentionValidation.error;
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

export default {
  validateEmail,
  validatePhone,
  validateCurrencyCode,
  validateTimezone,
  validateLanguage,
  validateTheme,
  validatePasswordMinLength,
  validateSessionTimeout,
  validateBackupRetention,
  validateMaxLoginAttempts,
  validateDecimalPlaces,
  validateSystemName,
  validateCurrencySymbol,
  validateSettings
};

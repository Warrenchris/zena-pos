const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemSettings = sequelize.define('SystemSettings', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  },
  // General Settings
  systemName: {
    type: DataTypes.STRING,
    defaultValue: 'Zana POS System'
  },
  businessLogo: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  contactEmail: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isValidEmail(value) {
        if (value === null || value === '') return; // Allow null/empty
        if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
          throw new Error('Invalid email format');
        }
      }
    }
  },
  contactPhone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  timezone: {
    type: DataTypes.STRING,
    defaultValue: 'Africa/Nairobi'
  },
  language: {
    type: DataTypes.STRING,
    defaultValue: 'en'
  },
  theme: {
    type: DataTypes.ENUM('light', 'dark', 'system'),
    defaultValue: 'dark'
  },
  
  // Currency Settings
  defaultCurrency: {
    type: DataTypes.STRING,
    defaultValue: 'KES'
  },
  currencySymbol: {
    type: DataTypes.STRING,
    defaultValue: 'KSh'
  },
  currencyPosition: {
    type: DataTypes.ENUM('before', 'after'),
    defaultValue: 'before'
  },
  decimalPlaces: {
    type: DataTypes.INTEGER,
    defaultValue: 2
  },
  
  // Notification Settings
  enableNotifications: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enableSoundAlerts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enableEmailAlerts: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  enableSuccessToasts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  enableErrorToasts: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // Security Settings
  passwordMinLength: {
    type: DataTypes.INTEGER,
    defaultValue: 8
  },
  requireSpecialChars: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  sessionTimeout: {
    type: DataTypes.INTEGER,
    defaultValue: 480 // 8 hours in minutes
  },
  enableTwoFactor: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  maxLoginAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  
  // Data & Backup Settings
  autoBackupEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  backupFrequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
    defaultValue: 'daily'
  },
  backupRetentionDays: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  
  // User Management Settings
  allowUserRegistration: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  requireEmailVerification: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // POS & Tax Settings
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },

  // Receipt Customization & Printer Settings
  receiptHeader: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  receiptFooter: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  showLogoOnReceipt: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  printerType: {
    type: DataTypes.ENUM('browser', 'thermal'),
    defaultValue: 'browser'
  },
  printerIP: {
    type: DataTypes.STRING,
    allowNull: true
  },

  // Payment Methods & M-Pesa Credentials
  paybillNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tillNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  consumerKey: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  consumerSecret: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  passkey: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  enabledPaymentMethods: {
    type: DataTypes.JSON,
    defaultValue: { cash: true, mobile: true, bank: false }
  },

  // Additional Settings (JSON for extensibility)
  additionalSettings: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'SystemSettings',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['shopId']
    }
  ]
});

// Instance methods
SystemSettings.prototype.getCurrencyFormat = function() {
  return {
    code: this.defaultCurrency,
    symbol: this.currencySymbol,
    position: this.currencyPosition,
    decimalPlaces: this.decimalPlaces
  };
};

SystemSettings.prototype.getThemeSettings = function() {
  return {
    theme: this.theme,
    systemName: this.systemName,
    businessLogo: this.businessLogo
  };
};

SystemSettings.prototype.getNotificationSettings = function() {
  return {
    enableNotifications: this.enableNotifications,
    enableSoundAlerts: this.enableSoundAlerts,
    enableEmailAlerts: this.enableEmailAlerts,
    enableSuccessToasts: this.enableSuccessToasts,
    enableErrorToasts: this.enableErrorToasts
  };
};

SystemSettings.prototype.getSecuritySettings = function() {
  return {
    passwordMinLength: this.passwordMinLength,
    requireSpecialChars: this.requireSpecialChars,
    sessionTimeout: this.sessionTimeout,
    enableTwoFactor: this.enableTwoFactor,
    maxLoginAttempts: this.maxLoginAttempts
  };
};

// Static methods
SystemSettings.getDefaultSettings = function() {
  return {
    systemName: 'Zana POS System',
    contactEmail: null,
    contactPhone: null,
    timezone: 'Africa/Nairobi',
    language: 'en',
    theme: 'dark',
    defaultCurrency: 'KES',
    currencySymbol: 'KSh',
    currencyPosition: 'before',
    decimalPlaces: 2,
    enableNotifications: true,
    enableSoundAlerts: true,
    enableEmailAlerts: false,
    enableSuccessToasts: true,
    enableErrorToasts: true,
    passwordMinLength: 8,
    requireSpecialChars: false,
    sessionTimeout: 480,
    enableTwoFactor: false,
    maxLoginAttempts: 5,
    autoBackupEnabled: true,
    backupFrequency: 'daily',
    backupRetentionDays: 30,
    allowUserRegistration: false,
    requireEmailVerification: true,
    taxRate: 0.00,
    receiptHeader: null,
    receiptFooter: null,
    showLogoOnReceipt: true,
    printerType: 'browser',
    printerIP: null,
    paybillNumber: null,
    tillNumber: null,
    consumerKey: null,
    consumerSecret: null,
    passkey: null,
    enabledPaymentMethods: { cash: true, mobile: true, bank: false },
    additionalSettings: {}
  };
};

module.exports = SystemSettings;

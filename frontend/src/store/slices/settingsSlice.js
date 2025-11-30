import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit';
import { settingsAPI } from '../../services/api';
import { getCurrencySymbol } from '../../utils/currency';
import { toast } from '../../utils/toast';

const initialState = {
  // General Settings
  systemName: 'Zana POS System',
  businessLogo: null,
  contactEmail: null,
  contactPhone: null,
  timezone: 'Africa/Nairobi',
  language: 'en',
  theme: 'dark',

  // Currency Settings
  defaultCurrency: 'KES',
  currencySymbol: 'KSh',
  currencyPosition: 'before',
  decimalPlaces: 2,

  // Notification Settings
  enableNotifications: true,
  enableSoundAlerts: true,
  enableEmailAlerts: false,
  enableSuccessToasts: true,
  enableErrorToasts: true,

  // Security Settings
  passwordMinLength: 8,
  requireSpecialChars: false,
  sessionTimeout: 480,
  enableTwoFactor: false,
  maxLoginAttempts: 5,

  // Data & Backup Settings
  autoBackupEnabled: true,
  backupFrequency: 'daily',
  backupRetentionDays: 30,

  // User Management Settings
  allowUserRegistration: false,
  requireEmailVerification: true,

  // Additional Settings
  additionalSettings: {},

  loading: false,
  error: null,
  lastUpdated: null,
};

// Currency-specific thunk
export const updateCurrency = createAsyncThunk(
  'settings/updateCurrency',
  async ({ currencyCode }, { dispatch, rejectWithValue }) => {
    try {
      const currencySymbol = getCurrencySymbol(currencyCode);
      const response = await settingsAPI.update({
        defaultCurrency: currencyCode,
        currencySymbol
      });

      toast.success(`Currency updated to ${currencyCode}`);
      return response.data;
    } catch (error) {
      toast.error('Failed to update currency');
      return rejectWithValue(error.response?.data?.error || 'Failed to update currency');
    }
  }
);

// Async thunks
export const fetchSettings = createAsyncThunk(
  'settings/fetchSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.getAll();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch settings');
    }
  }
);

// Helper to clean settings data before sending to API
const cleanSettingsData = (data) => {
  const allowedFields = [
    'systemName',
    'businessLogo',
    'contactEmail',
    'contactPhone',
    'timezone',
    'language',
    'theme',
    'defaultCurrency',
    'currencySymbol',
    'currencyPosition',
    'decimalPlaces',
    'enableNotifications',
    'enableSoundAlerts',
    'enableEmailAlerts',
    'enableSuccessToasts',
    'enableErrorToasts',
    'passwordMinLength',
    'requireSpecialChars',
    'sessionTimeout',
    'enableTwoFactor',
    'maxLoginAttempts',
    'autoBackupEnabled',
    'backupFrequency',
    'backupRetentionDays',
    'allowUserRegistration',
    'requireEmailVerification',
    'additionalSettings'
  ];

  // Only include allowed fields
  const cleanedData = {};
  allowedFields.forEach(field => {
    if (data[field] !== undefined) {
      cleanedData[field] = data[field];
    }
  });

  // Ensure currency symbol matches currency code
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

  if (cleanedData.defaultCurrency && !cleanedData.currencySymbol) {
    cleanedData.currencySymbol = currencySymbols[cleanedData.defaultCurrency] || cleanedData.defaultCurrency;
  }

  return cleanedData;
};

export const updateSettings = createAsyncThunk(
  'settings/updateSettings',
  async (settingsData, { rejectWithValue }) => {
    try {
      // Clean the settings data before sending to API
      const cleanedData = cleanSettingsData(settingsData);
      const response = await settingsAPI.update(cleanedData);
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to update settings');
    }
  }
);

export const resetSettings = createAsyncThunk(
  'settings/resetSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.reset();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to reset settings');
    }
  }
);

export const fetchCurrencySettings = createAsyncThunk(
  'settings/fetchCurrencySettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.getCurrency();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch currency settings');
    }
  }
);

export const fetchThemeSettings = createAsyncThunk(
  'settings/fetchThemeSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.getTheme();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch theme settings');
    }
  }
);

export const fetchNotificationSettings = createAsyncThunk(
  'settings/fetchNotificationSettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.getNotifications();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to fetch notification settings');
    }
  }
);

// Refresh currency settings after update
export const refreshCurrencySettings = createAsyncThunk(
  'settings/refreshCurrencySettings',
  async (_, { rejectWithValue }) => {
    try {
      const response = await settingsAPI.getCurrency();
      return response.data;
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Failed to refresh currency settings');
    }
  }
);

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    updateSetting: (state, action) => {
      const { key, value } = action.payload;
      state[key] = value;
      state.lastUpdated = new Date().toISOString();
    },
    updateMultipleSettings: (state, action) => {
      Object.assign(state, action.payload);
      state.lastUpdated = new Date().toISOString();
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch settings
      .addCase(fetchSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSettings.fulfilled, (state, action) => {
        state.loading = false;
        Object.assign(state, action.payload);
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(fetchSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Update settings
      .addCase(updateSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateSettings.fulfilled, (state, action) => {
        state.loading = false;
        // Update all settings including currency settings
        Object.assign(state, action.payload);
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(updateSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Reset settings
      .addCase(resetSettings.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(resetSettings.fulfilled, (state, action) => {
        state.loading = false;
        Object.assign(state, action.payload);
        state.lastUpdated = new Date().toISOString();
      })
      .addCase(resetSettings.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })

      // Fetch currency settings
      .addCase(fetchCurrencySettings.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      })

      // Fetch theme settings
      .addCase(fetchThemeSettings.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      })

      // Fetch notification settings
      .addCase(fetchNotificationSettings.fulfilled, (state, action) => {
        Object.assign(state, action.payload);
      })

      // Refresh currency settings
      .addCase(refreshCurrencySettings.fulfilled, (state, action) => {
        // Update only currency-related settings
        const { code, symbol, position, decimalPlaces } = action.payload;
        state.defaultCurrency = code;
        state.currencySymbol = symbol;
        state.currencyPosition = position;
        state.decimalPlaces = decimalPlaces;
        state.lastUpdated = new Date().toISOString();
      });
  },
});

// Action creators
export const {
  setLoading,
  setError,
  clearError,
  updateSetting,
  updateMultipleSettings
} = settingsSlice.actions;

// Selectors with memoization
export const selectSettings = (state) => state.settings;

export const selectGeneralSettings = createSelector(
  [selectSettings],
  (settings) => ({
    systemName: settings.systemName,
    businessLogo: settings.businessLogo,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    timezone: settings.timezone,
    language: settings.language,
    theme: settings.theme,
  })
);

export const selectCurrencySettings = createSelector(
  [selectSettings],
  (settings) => ({
    defaultCurrency: settings.defaultCurrency,
    currencySymbol: settings.currencySymbol,
    currencyPosition: settings.currencyPosition,
    decimalPlaces: settings.decimalPlaces,
  })
);

export const selectNotificationSettings = createSelector(
  [selectSettings],
  (settings) => ({
    enableNotifications: settings.enableNotifications,
    enableSoundAlerts: settings.enableSoundAlerts,
    enableEmailAlerts: settings.enableEmailAlerts,
    enableSuccessToasts: settings.enableSuccessToasts,
    enableErrorToasts: settings.enableErrorToasts,
  })
);

export const selectSecuritySettings = createSelector(
  [selectSettings],
  (settings) => ({
    passwordMinLength: settings.passwordMinLength,
    requireSpecialChars: settings.requireSpecialChars,
    sessionTimeout: settings.sessionTimeout,
    enableTwoFactor: settings.enableTwoFactor,
    maxLoginAttempts: settings.maxLoginAttempts,
  })
);

export const selectBackupSettings = createSelector(
  [selectSettings],
  (settings) => ({
    autoBackupEnabled: settings.autoBackupEnabled,
    backupFrequency: settings.backupFrequency,
    backupRetentionDays: settings.backupRetentionDays,
  })
);

export const selectUserManagementSettings = createSelector(
  [selectSettings],
  (settings) => ({
    allowUserRegistration: settings.allowUserRegistration,
    requireEmailVerification: settings.requireEmailVerification,
  })
);

export const selectLoading = (state) => state.settings.loading;
export const selectError = (state) => state.settings.error;
export const selectLastUpdated = (state) => state.settings.lastUpdated;

// Currency formatting utility
export const formatCurrency = (amount, settings) => {
  const { currencySymbol, currencyPosition, decimalPlaces } = settings;

  // Use Intl.NumberFormat for proper formatting with commas
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

  const formattedAmount = formatter.format(parseFloat(amount) || 0);

  if (currencyPosition === 'before') {
    return `${currencySymbol} ${formattedAmount}`;
  } else {
    return `${formattedAmount} ${currencySymbol}`;
  }
};

export default settingsSlice.reducer;
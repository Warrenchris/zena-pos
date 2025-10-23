const { SystemSettings, Shop } = require('../models');
const { validationResult } = require('express-validator');

// Get all settings for a shop
exports.getSettings = async (req, res) => {
  try {
    const { shopId } = req;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop context required' });
    }

    let settings = await SystemSettings.findOne({
      where: { shopId },
      include: [{ model: Shop, attributes: ['id', 'name'] }]
    });

    // If no settings exist, create default settings
    if (!settings) {
      const defaultSettings = SystemSettings.getDefaultSettings();
      settings = await SystemSettings.create({
        shopId,
        ...defaultSettings
      });
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch settings',
      details: error.message 
    });
  }
};

// Update settings
exports.updateSettings = async (req, res) => {
  try {
    // 1. Validate request body
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Settings validation failed:', errors.array());
      return res.status(400).json({ 
        error: 'Validation failed',
        details: errors.array() 
      });
    }

    // 2. Check shop context
    const { shopId } = req;
    if (!shopId) {
      console.error('Shop context missing in settings update');
      return res.status(400).json({ error: 'Shop context required' });
    }

    // 3. Clean and validate update data
    const updateData = req.body;
    console.log('Settings update request for shop', shopId, ':', updateData);

    // 4. Clean and validate settings data
    const validationResults = validationResult(req);
    if (!validationResults.isEmpty()) {
      console.error('Settings validation failed:', validationResults.array());
      return res.status(400).json({ 
        error: 'Validation failed',
        details: validationResults.array() 
      });
    }

    // Process and clean update data
    const cleanData = {};
    Object.entries(updateData).forEach(([key, value]) => {
      // Only include defined values, allowing explicit null
      if (value !== undefined) {
        cleanData[key] = value;
      }
    });

    // Validate session timeout (must be between 30 minutes and 24 hours)
    if (updateData.sessionTimeout) {
      if (updateData.sessionTimeout < 30 || updateData.sessionTimeout > 1440) {
        return res.status(400).json({ 
          error: 'Session timeout must be between 30 and 1440 minutes' 
        });
      }
    }

    // Validate password requirements
    if (updateData.passwordMinLength && (updateData.passwordMinLength < 6 || updateData.passwordMinLength > 20)) {
      return res.status(400).json({ 
        error: 'Password minimum length must be between 6 and 20 characters' 
      });
    }

    // Validate backup retention
    if (updateData.backupRetentionDays && (updateData.backupRetentionDays < 7 || updateData.backupRetentionDays > 365)) {
      return res.status(400).json({ 
        error: 'Backup retention must be between 7 and 365 days' 
      });
    }

    // 5. Find existing settings
    let settings = await SystemSettings.findOne({ 
      where: { shopId },
      include: [{ model: Shop, attributes: ['id', 'name'] }]
    });

    // 6. Update or create settings
    const previousValues = settings ? settings.toJSON() : null;
    
    if (!settings) {
      const defaultSettings = SystemSettings.getDefaultSettings();
      settings = await SystemSettings.create({
        shopId,
        ...defaultSettings,
        ...cleanData
      });
    } else {
      await settings.update(cleanData);
    }

    // 7. Log the activity
    const { ActivityLog } = require('../models');
    await ActivityLog.create({
      shopId,
      userId: req.user.id,
      action: 'settings_updated',
      description: `Settings updated by ${req.user.name}`,
      metadata: { 
        updatedFields: Object.keys(cleanData),
        previousValues,
        newValues: cleanData
      }
    });

    // 8. Return updated settings
    await settings.reload(); // Refresh the instance to get the latest data
    
    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    
    // Handle specific database errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: error.errors.map(e => ({
          field: e.path,
          message: e.message
        }))
      });
    }
    
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        error: 'Invalid shop ID',
        details: 'The specified shop does not exist'
      });
    }
    
    // Handle unexpected errors
    res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
};

// Reset settings to defaults
exports.resetSettings = async (req, res) => {
  try {
    const { shopId } = req;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop context required' });
    }

    const defaultSettings = SystemSettings.getDefaultSettings();
    
    let settings = await SystemSettings.findOne({ where: { shopId } });
    
    if (!settings) {
      settings = await SystemSettings.create({
        shopId,
        ...defaultSettings
      });
    } else {
      await settings.update(defaultSettings);
    }

    // Log the activity
    const { ActivityLog } = require('../models');
    await ActivityLog.create({
      shopId,
      userId: req.user.id,
      action: 'settings_reset',
      description: `Settings reset to defaults by ${req.user.name}`
    });

    res.json({
      success: true,
      message: 'Settings reset to defaults successfully',
      data: settings
    });
  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({ 
      error: 'Failed to reset settings',
      details: error.message 
    });
  }
};

// Get currency format for display
exports.getCurrencyFormat = async (req, res) => {
  try {
    const { shopId } = req;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop context required' });
    }

    let settings = await SystemSettings.findOne({ where: { shopId } });
    
    if (!settings) {
      // Return default currency format
      const defaultSettings = SystemSettings.getDefaultSettings();
      return res.json({
        success: true,
        data: {
          code: defaultSettings.defaultCurrency,
          symbol: defaultSettings.currencySymbol,
          position: defaultSettings.currencyPosition,
          decimalPlaces: defaultSettings.decimalPlaces
        }
      });
    }

    res.json({
      success: true,
      data: settings.getCurrencyFormat()
    });
  } catch (error) {
    console.error('Error fetching currency format:', error);
    res.status(500).json({ 
      error: 'Failed to fetch currency format',
      details: error.message 
    });
  }
};

// Get theme settings
exports.getThemeSettings = async (req, res) => {
  try {
    const { shopId } = req;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop context required' });
    }

    let settings = await SystemSettings.findOne({ where: { shopId } });
    
    if (!settings) {
      // Return default theme settings
      const defaultSettings = SystemSettings.getDefaultSettings();
      return res.json({
        success: true,
        data: {
          theme: defaultSettings.theme,
          systemName: defaultSettings.systemName,
          businessLogo: defaultSettings.businessLogo
        }
      });
    }

    res.json({
      success: true,
      data: settings.getThemeSettings()
    });
  } catch (error) {
    console.error('Error fetching theme settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch theme settings',
      details: error.message 
    });
  }
};

// Get notification settings
exports.getNotificationSettings = async (req, res) => {
  try {
    const { shopId } = req;

    if (!shopId) {
      return res.status(400).json({ error: 'Shop context required' });
    }

    let settings = await SystemSettings.findOne({ where: { shopId } });
    
    if (!settings) {
      // Return default notification settings
      const defaultSettings = SystemSettings.getDefaultSettings();
      return res.json({
        success: true,
        data: {
          enableNotifications: defaultSettings.enableNotifications,
          enableSoundAlerts: defaultSettings.enableSoundAlerts,
          enableEmailAlerts: defaultSettings.enableEmailAlerts,
          enableSuccessToasts: defaultSettings.enableSuccessToasts,
          enableErrorToasts: defaultSettings.enableErrorToasts
        }
      });
    }

    res.json({
      success: true,
      data: settings.getNotificationSettings()
    });
  } catch (error) {
    console.error('Error fetching notification settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch notification settings',
      details: error.message 
    });
  }
};

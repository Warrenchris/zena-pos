const express = require('express');
const { auth } = require('../middleware/auth');
const router = express.Router();

// Get company settings
router.get('/', auth, async (req, res) => {
  try {
    const settings = await req.db.settings.findOne({
      where: { shopId: req.user.shopId }
    });
    res.json(settings || {});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update theme settings
router.put('/theme', auth, async (req, res) => {
  try {
    const { theme, primaryColor, sidebarStyle } = req.body;
    const settings = await req.db.settings.findOne({
      where: { shopId: req.user.shopId }
    });

    if (settings) {
      await settings.update({
        theme: { theme, primaryColor, sidebarStyle }
      });
    } else {
      await req.db.settings.create({
        shopId: req.user.shopId,
        theme: { theme, primaryColor, sidebarStyle }
      });
    }

    res.json({ message: 'Theme settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update regional settings
router.put('/regional', auth, async (req, res) => {
  try {
    const { currency, timezone, dateFormat, language } = req.body;
    const settings = await req.db.settings.findOne({
      where: { shopId: req.user.shopId }
    });

    if (settings) {
      await settings.update({
        regional: { currency, timezone, dateFormat, language }
      });
    } else {
      await req.db.settings.create({
        shopId: req.user.shopId,
        regional: { currency, timezone, dateFormat, language }
      });
    }

    res.json({ message: 'Regional settings updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
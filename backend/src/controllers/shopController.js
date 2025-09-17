const { Shop } = require('../models');

exports.getMine = async (req, res) => {
  const shop = await Shop.findByPk(req.user.shopId);
  res.json(shop);
};

exports.updateMine = async (req, res) => {
  const shop = await Shop.findByPk(req.user.shopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  const { name, address, phone, active } = req.body;
  if (name !== undefined) shop.name = name;
  if (address !== undefined) shop.address = address;
  if (phone !== undefined) shop.phone = phone;
  if (active !== undefined) shop.active = active;
  await shop.save();
  res.json(shop);
};



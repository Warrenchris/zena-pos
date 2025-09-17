const { validationResult } = require('express-validator');
const { User } = require('../models');

exports.list = async (req, res) => {
  const users = await User.findAll({ where: { shopId: req.user.shopId } });
  res.json(users);
};

exports.create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const { name, email, password, role } = req.body;
  const exists = await User.findOne({ where: { email } });
  if (exists) return res.status(400).json({ error: 'User already exists' });
  const user = await User.create({ name, email, password, role, shopId: req.user.shopId });
  res.status(201).json(user);
};

exports.updateRole = async (req, res) => {
  const { id } = req.params;
  const { role, active } = req.body;
  const user = await User.findOne({ where: { id, shopId: req.user.shopId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (role) user.role = role;
  if (active !== undefined) user.active = active;
  await user.save();
  res.json(user);
};



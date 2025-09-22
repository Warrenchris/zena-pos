const { Unit } = require('../models');
const { ValidationError } = require('sequelize');

// Get all units for a shop
exports.getUnits = async (req, res) => {
  try {
    const units = await Unit.findAll({
      where: { shopId: req.user.shopId },
      order: [['name', 'ASC']]
    });
    res.json(units);
  } catch (error) {
    console.error('Error fetching units:', error);
    res.status(500).json({ message: 'Failed to fetch units' });
  }
};

// Get a single unit by ID
exports.getUnitById = async (req, res) => {
  try {
    const unit = await Unit.findOne({
      where: { 
        id: req.params.id,
        shopId: req.user.shopId 
      }
    });
    
    if (!unit) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    res.json(unit);
  } catch (error) {
    console.error('Error fetching unit:', error);
    res.status(500).json({ message: 'Failed to fetch unit' });
  }
};

// Create a new unit
exports.createUnit = async (req, res) => {
  try {
    const unitData = {
      ...req.body,
      shopId: req.user.shopId
    };
    
    const unit = await Unit.create(unitData);
    res.status(201).json(unit);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors.map(err => ({ field: err.path, message: err.message }))
      });
    }
    console.error('Error creating unit:', error);
    res.status(500).json({ message: 'Failed to create unit' });
  }
};

// Update a unit
exports.updateUnit = async (req, res) => {
  try {
    const [updated] = await Unit.update(req.body, {
      where: { 
        id: req.params.id,
        shopId: req.user.shopId
      }
    });
    
    if (!updated) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    const unit = await Unit.findByPk(req.params.id);
    res.json(unit);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors.map(err => ({ field: err.path, message: err.message }))
      });
    }
    console.error('Error updating unit:', error);
    res.status(500).json({ message: 'Failed to update unit' });
  }
};

// Delete a unit
exports.deleteUnit = async (req, res) => {
  try {
    const deleted = await Unit.destroy({
      where: { 
        id: req.params.id,
        shopId: req.user.shopId
      }
    });
    
    if (!deleted) {
      return res.status(404).json({ message: 'Unit not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting unit:', error);
    res.status(500).json({ message: 'Failed to delete unit' });
  }
};
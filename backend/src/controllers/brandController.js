const { Brand } = require('../models');
const { ValidationError } = require('sequelize');

// Get all brands for a shop
exports.getBrands = async (req, res) => {
  try {
    const brands = await Brand.findAll({
      where: { shopId: req.user.shopId },
      order: [['name', 'ASC']]
    });
    res.json(brands);
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({ message: 'Failed to fetch brands' });
  }
};

// Get a single brand by ID
exports.getBrandById = async (req, res) => {
  try {
    const brand = await Brand.findOne({
      where: { 
        id: req.params.id,
        shopId: req.user.shopId 
      }
    });
    
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    
    res.json(brand);
  } catch (error) {
    console.error('Error fetching brand:', error);
    res.status(500).json({ message: 'Failed to fetch brand' });
  }
};

// Create a new brand
exports.createBrand = async (req, res) => {
  try {
    const brandData = {
      ...req.body,
      shopId: req.user.shopId
    };
    
    const brand = await Brand.create(brandData);
    res.status(201).json(brand);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors.map(err => ({ field: err.path, message: err.message }))
      });
    }
    console.error('Error creating brand:', error);
    res.status(500).json({ message: 'Failed to create brand' });
  }
};

// Update a brand
exports.updateBrand = async (req, res) => {
  try {
    const [updated] = await Brand.update(req.body, {
      where: { 
        id: req.params.id,
        shopId: req.user.shopId
      }
    });
    
    if (!updated) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    
    const brand = await Brand.findByPk(req.params.id);
    res.json(brand);
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: 'Validation error', 
        errors: error.errors.map(err => ({ field: err.path, message: err.message }))
      });
    }
    console.error('Error updating brand:', error);
    res.status(500).json({ message: 'Failed to update brand' });
  }
};

// Delete a brand
exports.deleteBrand = async (req, res) => {
  try {
    const deleted = await Brand.destroy({
      where: { 
        id: req.params.id,
        shopId: req.user.shopId
      }
    });
    
    if (!deleted) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting brand:', error);
    res.status(500).json({ message: 'Failed to delete brand' });
  }
};
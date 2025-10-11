const Store = require('../models/Store');

// Get all stores
const getAllStores = async (req, res) => {
  try {
    const stores = await Store.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'address', 'phone', 'email'],
      order: [['name', 'ASC']]
    });
    res.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ message: 'Error fetching stores' });
  }
};

// Get single store
const getStore = async (req, res) => {
  try {
    const { id } = req.params;
    const store = await Store.findOne({
      where: { id, isActive: true },
      attributes: ['id', 'name', 'address', 'phone', 'email']
    });

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    console.error('Error fetching store:', error);
    res.status(500).json({ message: 'Error fetching store' });
  }
};

// Create store
const createStore = async (req, res) => {
  try {
    const { name, address, phone, email } = req.body;
    
    const store = await Store.create({
      name,
      address,
      phone,
      email,
      isActive: true
    });
    
    res.status(201).json(store);
  } catch (error) {
    console.error('Error creating store:', error);
    res.status(500).json({ message: 'Error creating store' });
  }
};

// Update store
const updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, phone, email } = req.body;
    const store = await Store.findOne({
      where: { id, isActive: true }
    });

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }

    await store.update({
      name,
      address,
      phone,
      email
    });
    
    res.json(store);
  } catch (error) {
    console.error('Error updating store:', error);
    res.status(400).json({ message: 'Error updating store' });
  }
};

// Delete store (soft delete)
const deleteStore = async (req, res) => {
  try {
    const { id } = req.params;
    const store = await Store.findOne({
      where: { id, isActive: true }
    });
    
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }
    
    await store.update({ isActive: false });
    res.json({ message: 'Store deleted successfully' });
  } catch (error) {
    console.error('Error deleting store:', error);
    res.status(500).json({ message: 'Error deleting store' });
  }
};

module.exports = {
  getAllStores,
  getStore,
  createStore,
  updateStore,
  deleteStore
};
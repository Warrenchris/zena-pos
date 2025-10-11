const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { 
  getAllStores,
  getStore,
  createStore,
  updateStore,
  deleteStore
} = require('../controllers/storeController');

// Apply authentication middleware to all routes
router.use(auth);

// Get all stores
router.get('/', getAllStores);

// Get single store
router.get('/:id', getStore);

// Create store
router.post('/', createStore);

// Update store
router.put('/:id', updateStore);

// Delete store
router.delete('/:id', deleteStore);

module.exports = router;
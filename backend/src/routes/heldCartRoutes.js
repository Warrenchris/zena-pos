const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { HeldCart } = require('../models');
const { Op } = require('sequelize');

// POST /api/held-carts - Hold a cart
router.post('/', auth, async (req, res) => {
  try {
    const { label, items, customer, discounts } = req.body;
    const shopId = req.shopId || req.user.shopId;
    const cashierId = String(req.user.id);

    const heldAt = new Date();
    const expiresAt = new Date(heldAt.getTime() + 4 * 60 * 60 * 1000); // 4 hours

    const heldCart = await HeldCart.create({
      shopId,
      cashierId,
      label: label || `Customer ${Date.now()}`,
      cartSnapshot: { items, customer, discounts },
      heldAt,
      expiresAt,
      status: 'held'
    });

    res.status(201).json(heldCart);
  } catch (error) {
    console.error('Error holding cart:', error);
    res.status(500).json({ error: 'Failed to hold cart' });
  }
});

// GET /api/held-carts - Get all held carts for the shop
router.get('/', auth, async (req, res) => {
  try {
    const shopId = req.shopId || req.user.shopId;
    const now = new Date();

    const heldCarts = await HeldCart.findAll({
      where: {
        shopId,
        status: 'held',
        expiresAt: {
          [Op.gt]: now
        }
      },
      order: [['heldAt', 'DESC']]
    });

    res.json(heldCarts);
  } catch (error) {
    console.error('Error fetching held carts:', error);
    res.status(500).json({ error: 'Failed to fetch held carts' });
  }
});

// POST /api/held-carts/:id/recall - Recall a held cart
router.post('/:id/recall', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.shopId || req.user.shopId;

    const heldCart = await HeldCart.findOne({
      where: {
        id,
        shopId,
        status: 'held',
        expiresAt: {
          [Op.gt]: new Date()
        }
      }
    });

    if (!heldCart) {
      return res.status(404).json({ error: 'Held cart not found or expired' });
    }

    await heldCart.update({ status: 'recalled' });

    res.json(heldCart.cartSnapshot);
  } catch (error) {
    console.error('Error recalling cart:', error);
    res.status(500).json({ error: 'Failed to recall cart' });
  }
});

// DELETE /api/held-carts/:id - Hard delete a held cart
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const shopId = req.shopId || req.user.shopId;

    const heldCart = await HeldCart.findOne({
      where: {
        id,
        shopId
      }
    });

    if (!heldCart) {
      return res.status(404).json({ error: 'Held cart not found' });
    }

    await heldCart.destroy();

    res.json({ message: 'Held cart dismissed successfully' });
  } catch (error) {
    console.error('Error deleting held cart:', error);
    res.status(500).json({ error: 'Failed to delete held cart' });
  }
});

module.exports = router;

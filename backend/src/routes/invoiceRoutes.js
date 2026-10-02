const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { auth, authzContext, authorize } = require('../middleware/auth');
const invoiceController = require('../controllers/invoiceController');
const { invoiceValidation } = require('../middleware/validations/invoiceValidation');
const { Invoice } = require('../models');
const { validateDateRange } = require('../middleware/validators');

// Apply authentication and canonical authorization context middleware to all routes
router.use(auth);
router.use(authzContext);

// Get all invoices (with filters and pagination)
router.get('/',
  authorize({ permission: 'manage_sales', shopScope: 'current' }),
  validateDateRange,
  invoiceController.getInvoices
);

// Get invoice statistics
router.get('/statistics',
  authorize({ permission: 'manage_sales', shopScope: 'current' }),
  validateDateRange,
  invoiceController.getStatistics
);

// Get single invoice
router.get('/:id',
  authorize({
    shopScope: 'current',
    ownership: {
      getResource: (req) => Invoice.findByPk(req.params.id),
      getOwnerId: (inv) => inv.userId || inv.employeeId,
      managerPermission: 'manage_sales',
      antiOracle: true
    }
  }),
  invoiceController.getInvoiceById
);

// Create new invoice
router.post('/',
  authorize({ permission: 'create_sales', shopScope: 'current' }),
  invoiceValidation.create,
  invoiceController.createInvoice
);

// Update invoice
router.put('/:id',
  authorize({
    permission: 'manage_sales',
    shopScope: 'current',
    ownership: {
      getResource: (req) => Invoice.findByPk(req.params.id),
      managerPermission: 'manage_sales',
      antiOracle: true
    }
  }),
  invoiceValidation.update,
  invoiceController.updateInvoice
);

// Delete invoice (admin or org_admin)
router.delete('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    shopScope: 'current',
    ownership: {
      getResource: (req) => Invoice.findByPk(req.params.id),
      managerPermission: 'manage_sales',
      antiOracle: true
    }
  }),
  invoiceController.deleteInvoice
);

// Generate PDF
router.get('/:id/pdf',
  authorize({
    shopScope: 'current',
    ownership: {
      getResource: (req) => Invoice.findByPk(req.params.id),
      getOwnerId: (inv) => inv.userId || inv.employeeId,
      managerPermission: 'manage_sales',
      antiOracle: true
    }
  }),
  invoiceController.generatePDF
);

// Send invoice by email - temporarily disabled
router.post('/:id/send',
  authorize({ permission: 'manage_sales', shopScope: 'current' }),
  (req, res) => {
    res.status(501).json({
      message: 'Email service is temporarily disabled'
    });
  }
);

module.exports = router;
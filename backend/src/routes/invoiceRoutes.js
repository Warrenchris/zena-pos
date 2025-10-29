const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { auth, checkRole } = require('../middleware/auth');
const invoiceController = require('../controllers/invoiceController');
const { invoiceValidation } = require('../middleware/validations/invoiceValidation');

// Apply authentication middleware to all routes
router.use(auth);

// Get all invoices (with filters and pagination)
router.get('/', invoiceController.getInvoices);

// Get invoice statistics
router.get('/statistics', invoiceController.getStatistics);

// Get single invoice
router.get('/:id', invoiceController.getInvoiceById);

// Create new invoice
router.post('/', invoiceValidation.create, invoiceController.createInvoice);

// Update invoice
router.put('/:id', invoiceValidation.update, invoiceController.updateInvoice);

// Delete invoice (admin only)
router.delete('/:id', checkRole(['admin']), invoiceController.deleteInvoice);

// Generate PDF
router.get('/:id/pdf', invoiceController.generatePDF);

// Send invoice by email - temporarily disabled
router.post('/:id/send', (req, res) => {
  res.status(501).json({
    message: 'Email service is temporarily disabled'
  });
});

module.exports = router;
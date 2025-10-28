const express = require('express');
const router = express.Router();
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

// Send invoice by email
router.post('/:id/send', [
  body('email').optional().isEmail()
], invoiceController.sendByEmail);

module.exports = router;
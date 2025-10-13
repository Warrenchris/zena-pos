const EnhancedSaleService = require('../services/EnhancedSaleService');
const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

class EnhancedSalesController {
  async createSale(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, 'Validation Error', errors.array());
      }

      const saleData = {
        ...req.body,
        shopId: req.shop.id,
        employeeId: req.user.id
      };

      const sale = await EnhancedSaleService.createSale(saleData);
      res.status(201).json({
        status: 'success',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }

  async getSale(req, res, next) {
    try {
      const { id } = req.params;
      const sale = await EnhancedSaleService.getSaleById(id);
      
      if (!sale) {
        throw new ApiError(404, 'Sale not found');
      }

      res.json({
        status: 'success',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }

  async createRefund(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new ApiError(400, 'Validation Error', errors.array());
      }

      const refundData = {
        ...req.body,
        processedBy: req.user.id,
        shopId: req.shop.id
      };

      const refund = await EnhancedSaleService.createRefund(refundData);
      res.status(201).json({
        status: 'success',
        data: refund
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSaleStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const sale = await EnhancedSaleService.updateSaleStatus(id, status, req.user.id);
      res.json({
        status: 'success',
        data: sale
      });
    } catch (error) {
      next(error);
    }
  }

  async getSalesByDateRange(req, res, next) {
    try {
      const { startDate, endDate, limit = 10, offset = 0 } = req.query;
      
      // Validate dates
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new ApiError(400, 'Invalid date format');
      }

      const options = {
        where: { shopId: req.shop.id },
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const sales = await EnhancedSaleService.getSalesByDateRange(start, end, options);
      res.json({
        status: 'success',
        data: sales
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new EnhancedSalesController();
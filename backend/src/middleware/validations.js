const { body, param, query } = require('express-validator');
const { validate } = require('./validate');

const brandValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Brand name is required')
      .isLength({ max: 255 })
      .withMessage('Brand name must be less than 255 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('website')
      .optional()
      .trim()
      .isURL()
      .withMessage('Website must be a valid URL'),
    body('logo')
      .optional()
      .trim()
      .isURL()
      .withMessage('Logo must be a valid URL'),
    validate
  ],
  update: [
    param('id')
      .isInt()
      .withMessage('Invalid brand ID'),
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Brand name cannot be empty')
      .isLength({ max: 255 })
      .withMessage('Brand name must be less than 255 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('website')
      .optional()
      .trim()
      .isURL()
      .withMessage('Website must be a valid URL'),
    body('logo')
      .optional()
      .trim()
      .isURL()
      .withMessage('Logo must be a valid URL'),
    validate
  ]
};

const unitValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Unit name is required')
      .isLength({ max: 255 })
      .withMessage('Unit name must be less than 255 characters'),
    body('abbreviation')
      .trim()
      .notEmpty()
      .withMessage('Abbreviation is required')
      .isLength({ max: 10 })
      .withMessage('Abbreviation must be less than 10 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('conversionRate')
      .optional()
      .isFloat({ min: 0.0001 })
      .withMessage('Conversion rate must be a positive number'),
    validate
  ],
  update: [
    param('id')
      .isInt()
      .withMessage('Invalid unit ID'),
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Unit name cannot be empty')
      .isLength({ max: 255 })
      .withMessage('Unit name must be less than 255 characters'),
    body('abbreviation')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Abbreviation cannot be empty')
      .isLength({ max: 10 })
      .withMessage('Abbreviation must be less than 10 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('conversionRate')
      .optional()
      .isFloat({ min: 0.0001 })
      .withMessage('Conversion rate must be a positive number'),
    validate
  ]
};

const categoryValidation = {
  create: [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Category name is required')
      .isLength({ max: 255 })
      .withMessage('Category name must be less than 255 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('parentCategoryId')
      .optional()
      .isInt()
      .withMessage('Invalid parent category ID'),
    validate
  ],
  update: [
    param('id')
      .isInt()
      .withMessage('Invalid category ID'),
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Category name cannot be empty')
      .isLength({ max: 255 })
      .withMessage('Category name must be less than 255 characters'),
    body('description')
      .optional()
      .trim()
      .isLength({ max: 1000 })
      .withMessage('Description must be less than 1000 characters'),
    body('parentCategoryId')
      .optional()
      .isInt()
      .withMessage('Invalid parent category ID'),
    validate
  ],
  list: [
    query('topLevel')
      .optional()
      .isBoolean()
      .withMessage('topLevel parameter must be a boolean'),
    validate
  ]
};

module.exports = {
  brandValidation,
  unitValidation,
  categoryValidation
};
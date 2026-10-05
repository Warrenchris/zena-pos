'use strict';

const { Op } = require('sequelize');
const Employee = require('../models/Employee');
const User = require('../models/User');
const Shop = require('../models/Shop');
const OrganizationMembership = require('../models/OrganizationMembership');
const ShopAccess = require('../models/ShopAccess');
const Sale = require('../models/Sale');
const SaleItem = require('../models/SaleItem');
const Product = require('../models/Product');
const { validateEmployee } = require('../utils/validation');
const sequelize = require('../config/database');
const { NON_CANCELLED_SALE_FILTER } = require('../constants/saleFilters');
const entitlementService = require('../services/entitlementService');
const { sendUpgradePrompt } = require('../utils/upgradePrompt');
const staffCreationService = require('../services/staffCreationService');
const tokenRevocationService = require('../services/tokenRevocationService');

// Get all employees and shop staff
exports.getAllEmployees = async (req, res) => {
  try {
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const targetShopId = req.query.shopId
      ? parseInt(req.query.shopId, 10)
      : (req.shopId || req.authz?.scope?.activeShopId || req.user?.shopId);

    if (!targetShopId) {
      return res.status(400).json({ error: 'Shop context required.' });
    }

    // Verify target shop exists in this organization
    const targetShop = await Shop.findOne({
      where: { id: targetShopId, organizationId: orgId }
    });
    if (!targetShop) {
      return res.status(404).json({ error: 'Shop not found in this organization.' });
    }

    // Verify caller has access to this branch
    if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(targetShopId)) {
      return res.status(403).json({ error: 'Access denied to this branch.' });
    }

    const where = { shopId: targetShopId };

    const employees = await Employee.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    const users = await User.findAll({
      where: {
        ...where,
        role: { [Op.ne]: 'super_admin' }
      },
      attributes: ['id', 'name', 'email', 'role', 'active', 'shopId'],
      order: [['createdAt', 'DESC']]
    });

    const empList = employees.map(e => (e.toJSON ? e.toJSON() : e));
    const userList = users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      shopId: u.shopId
    }));

    // Merge & deduplicate by ID
    const map = new Map();
    [...empList, ...userList].forEach(item => {
      if (item && item.id) {
        map.set(String(item.id), item);
      }
    });

    const combinedList = Array.from(map.values());
    res.json(combinedList);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

// Get employee by ID (with stats, sales history, and top products)
exports.getEmployeeById = async (req, res) => {
  try {
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const targetId = req.params.id;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);

    let employeeData = null;
    let isUser = false;
    let shopId = null;

    if (isUuid) {
      const emp = await Employee.findByPk(targetId, {
        include: [{ model: Shop, attributes: ['id', 'organizationId'] }]
      });
      if (emp && emp.Shop?.organizationId === orgId) {
        if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(emp.shopId)) {
          return res.status(404).json({ error: 'Employee not found' });
        }
        employeeData = emp.toJSON ? emp.toJSON() : emp;
        shopId = emp.shopId;
      }
    } else if (/^\d+$/.test(targetId)) {
      const u = await User.findByPk(parseInt(targetId, 10), {
        include: [{ model: Shop, attributes: ['id', 'organizationId'] }]
      });
      if (u && u.Shop?.organizationId === orgId) {
        if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(u.shopId)) {
          return res.status(404).json({ error: 'Employee not found' });
        }
        const uJson = u.toJSON ? u.toJSON() : u;
        employeeData = {
          id: uJson.id,
          firstName: uJson.name ? uJson.name.split(' ')[0] : 'User',
          lastName: uJson.name && uJson.name.split(' ').length > 1 ? uJson.name.split(' ').slice(1).join(' ') : '',
          email: uJson.email,
          phone: '',
          position: uJson.role || 'user',
          status: uJson.active ? 'active' : 'inactive',
          hireDate: uJson.createdAt,
          salary: 0,
          shopId: uJson.shopId
        };
        isUser = true;
        shopId = u.shopId;
      }
    } else {
      const emp = await Employee.findByPk(targetId, {
        include: [{ model: Shop, attributes: ['id', 'organizationId'] }]
      });
      if (emp && emp.Shop?.organizationId === orgId) {
        if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(emp.shopId)) {
          return res.status(404).json({ error: 'Employee not found' });
        }
        employeeData = emp.toJSON ? emp.toJSON() : emp;
        shopId = emp.shopId;
      }
    }

    if (!employeeData) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const offset = (page - 1) * limit;

    const saleWhere = {
      shopId,
      ...NON_CANCELLED_SALE_FILTER,
      [isUser ? 'userId' : 'employeeId']: targetId
    };

    // 1. Sales Performance Stats
    const salesStats = await Sale.findOne({
      where: saleWhere,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalSales'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('total')), 0), 'totalRevenue'],
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'firstSaleDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'lastSaleDate']
      ],
      raw: true
    });

    const totalSales = parseInt(salesStats?.totalSales || 0, 10);
    const totalRevenue = parseFloat(salesStats?.totalRevenue || 0);
    const averageSaleValue = totalSales > 0 ? parseFloat((totalRevenue / totalSales).toFixed(2)) : 0;
    const firstSaleDate = salesStats?.firstSaleDate || null;
    const lastSaleDate = salesStats?.lastSaleDate || null;

    // 2. Paginated Sales History
    const historyWhere = {
      shopId,
      ...NON_CANCELLED_SALE_FILTER,
      [isUser ? 'userId' : 'employeeId']: targetId
    };

    const { count: orderCount, rows: sales } = await Sale.findAndCountAll({
      where: historyWhere,
      order: [['createdAt', 'DESC']],
      limit,
      offset,
      include: [{
        model: SaleItem,
        attributes: ['id', 'quantity', 'price', 'subtotal']
      }]
    });

    const salesHistory = sales.map(sale => {
      const s = sale.toJSON();
      const itemCount = s.SaleItems ? s.SaleItems.reduce((acc, item) => acc + (item.quantity || 1), 0) : 0;
      return {
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        total: parseFloat(s.total),
        paymentMethod: s.paymentMethod,
        status: s.saleStatus || 'completed',
        createdAt: s.createdAt,
        itemCount
      };
    });

    // 3. Top Products Sold (Single SQL GROUP BY Aggregation)
    let topProducts = [];
    try {
      const topItems = await SaleItem.findAll({
        attributes: [
          'productId',
          [sequelize.fn('COUNT', sequelize.col('SaleItem.id')), 'timesSold'],
          [sequelize.fn('SUM', sequelize.col('SaleItem.quantity')), 'totalQuantity'],
          [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('SaleItem.subtotal')), sequelize.fn('SUM', sequelize.literal('SaleItem.price * SaleItem.quantity'))), 'totalRevenue']
        ],
        include: [
          {
            model: Sale,
            where: saleWhere,
            attributes: []
          },
          {
            model: Product,
            attributes: ['id', 'name', 'sku', 'price']
          }
        ],
        group: ['SaleItem.productId', 'Product.id', 'Product.name', 'Product.sku', 'Product.price'],
        order: [[sequelize.literal('timesSold'), 'DESC'], [sequelize.literal('totalQuantity'), 'DESC']],
        limit: 5
      });

      topProducts = topItems.map(item => {
        const i = item.toJSON ? item.toJSON() : item;
        return {
          productId: i.productId,
          name: i.Product?.name || 'Unknown Product',
          sku: i.Product?.sku || '',
          price: parseFloat(i.Product?.price || 0),
          timesSold: parseInt(i.timesSold || item.dataValues?.timesSold || 0, 10),
          totalQuantity: parseInt(i.totalQuantity || item.dataValues?.totalQuantity || 0, 10),
          totalRevenue: parseFloat(i.totalRevenue || item.dataValues?.totalRevenue || 0)
        };
      });
    } catch (topErr) {
      console.warn('Could not compute top products for employee:', topErr.message);
      topProducts = [];
    }

    res.json({
      employee: employeeData,
      stats: {
        totalSales,
        totalRevenue,
        averageSaleValue,
        firstSaleDate,
        lastSaleDate
      },
      salesHistory,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(orderCount / limit) || 1,
        totalSales: orderCount,
        limit
      },
      topProducts
    });
  } catch (error) {
    console.error('Error fetching employee details:', error);
    res.status(500).json({ error: 'Failed to fetch employee details' });
  }
};

// Create new employee
exports.createEmployee = async (req, res) => {
  try {
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const validationError = validateEmployee(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { employee } = await staffCreationService.createStaffMember({
      actor: {
        ...req.user,
        organizationId: orgId,
        shopId: req.authz?.scope?.activeShopId || req.user.shopId
      },
      body: req.body,
      reqOrgId: orgId
    });

    return res.status(201).json(employee);
  } catch (error) {
    if (error.isUpgradePrompt && error.promptData) {
      return sendUpgradePrompt(res, error.promptData);
    }
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {})
      });
    }
    console.error('Error creating employee:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already exists', code: 'DUPLICATE_EMAIL' });
    }
    return res.status(500).json({ error: 'Failed to create employee' });
  }
};

// Update employee
exports.updateEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const employee = await Employee.findByPk(req.params.id, { transaction });
    if (!employee) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Verify employee belongs to caller's organization
    const currentShop = await Shop.findOne({
      where: { id: employee.shopId, organizationId: orgId },
      transaction
    });
    if (!currentShop) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Verify caller has branch access to current shop
    if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(employee.shopId)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: you do not have access to this branch.' });
    }

    // Self-modification guard: actor cannot modify their own privileges or status
    const isSelf = (req.authz?.identity?.isEmployee && String(req.authz.identity.id) === String(employee.id)) ||
                   (req.user?.isEmployee && String(req.user.id) === String(employee.id));
    if (isSelf && (req.body.position || req.body.role || req.body.orgRole || req.body.status)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: employees cannot modify their own privileges or status.' });
    }

    // Owner protection: cannot modify owner's account unless caller is owner
    const membership = await OrganizationMembership.findOne({
      where: { employeeId: employee.id },
      transaction
    });
    const isOwnerCaller = Boolean(req.authz?.tenant?.isOwner || (req.user && req.user.role === 'admin' && !req.user.isEmployee));
    if (membership?.orgRole === 'owner' && !isOwnerCaller) {
      await transaction.rollback();
      return res.status(403).json({ error: "Cannot modify the organization owner's account." });
    }

    // Owner elevation guard: only organization owner can grant administrator privileges
    const isGrantingAdmin = (req.body.position && req.body.position.toLowerCase() === 'admin') ||
                            (req.body.role && req.body.role.toLowerCase() === 'admin') ||
                            (req.body.orgRole === 'admin') ||
                            (req.body.orgRole === 'owner');
    if (isGrantingAdmin && !isOwnerCaller) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: only organization owners can grant administrator privileges.' });
    }

    // Branch reassignment validation
    let targetShopId = employee.shopId;
    const requestedShopId = req.body.shopId ? parseInt(req.body.shopId, 10) : null;
    if (requestedShopId && requestedShopId !== employee.shopId) {
      const targetShop = await Shop.findOne({
        where: { id: requestedShopId, organizationId: orgId, active: true },
        transaction
      });
      if (!targetShop) {
        await transaction.rollback();
        return res.status(404).json({ error: 'Target shop not found in this organization.' });
      }
      if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(targetShop.id)) {
        await transaction.rollback();
        return res.status(403).json({ error: 'Access denied: you do not have access to the target branch.' });
      }
      targetShopId = targetShop.id;
    }

    // Merge existing employee with request body for validation of partial updates
    const mergedPayload = {
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      position: employee.position,
      status: employee.status,
      salary: employee.salary,
      hireDate: employee.hireDate,
      ...req.body,
      shopId: targetShopId,
      id: req.params.id
    };

    const validationError = validateEmployee(mergedPayload);
    if (validationError) {
      await transaction.rollback();
      return res.status(400).json({ error: validationError });
    }

    // If password is empty, remove it from the update payload
    if (!req.body.password) {
      delete req.body.password;
    }

    const previousPosition = employee.position;
    const previousStatus = employee.status;
    const previousShopId = employee.shopId;

    const positionChanged = Boolean(req.body.position && req.body.position !== previousPosition);
    const statusChanged = Boolean(req.body.status && req.body.status !== previousStatus);
    const shopIdChanged = targetShopId !== previousShopId;

    await employee.update({
      ...req.body,
      shopId: targetShopId
    }, {
      transaction,
      individualHooks: true // Ensures password hashing hooks are run
    });

    // Synchronize OrganizationMembership
    let membershipOrgRoleChanged = false;
    if (membership) {
      if (positionChanged || req.body.orgRole) {
        const targetOrgRole = req.body.orgRole || staffCreationService.positionToOrgRole(req.body.position, req.body.role);
        if (membership.orgRole !== targetOrgRole) {
          membership.orgRole = targetOrgRole;
          membershipOrgRoleChanged = true;
        }
      }
      if (statusChanged) {
        membership.status = req.body.status === 'active' ? 'active' : 'suspended';
      }
      await membership.save({ transaction });

      // If branch changed, synchronize ShopAccess
      if (shopIdChanged) {
        await ShopAccess.findOrCreate({
          where: { membershipId: membership.id, shopId: targetShopId },
          defaults: { isDefault: true },
          transaction
        });
      }
    }

    const authzChanged = positionChanged || statusChanged || shopIdChanged || membershipOrgRoleChanged;
    if (authzChanged) {
      await tokenRevocationService.incrementAuthzVersion(employee.id, true, transaction);
    }

    await transaction.commit();

    if (statusChanged) {
      await tokenRevocationService.setUserStatus(employee.id, true, req.body.status);
    }

    res.json(employee);
  } catch (error) {
    await transaction.rollback();
    console.error('Error updating employee:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ error: 'Email already exists', code: 'DUPLICATE_EMAIL' });
    }
    res.status(500).json({ error: 'Failed to update employee' });
  }
};

// Delete employee
exports.deleteEmployee = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const orgId = req.authz?.tenant?.organizationId || req.organizationId || req.user?.organizationId;
    if (!orgId) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Organization context required.' });
    }

    const employee = await Employee.findByPk(req.params.id, { transaction });
    if (!employee) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Verify employee belongs to caller's organization
    const currentShop = await Shop.findOne({
      where: { id: employee.shopId, organizationId: orgId },
      transaction
    });
    if (!currentShop) {
      await transaction.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Verify caller has branch access to employee's shop
    if (req.authz?.scope?.hasShopAccess && !req.authz.scope.hasShopAccess(employee.shopId)) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: you do not have access to this branch.' });
    }

    // Self-deletion check
    const isSelf = (req.authz?.identity?.isEmployee && String(req.authz.identity.id) === String(employee.id)) ||
                   (req.user?.isEmployee && String(req.user.id) === String(employee.id));
    if (isSelf) {
      await transaction.rollback();
      return res.status(403).json({ error: 'Access denied: cannot delete your own account.' });
    }

    // Owner protection check
    const membership = await OrganizationMembership.findOne({
      where: { employeeId: employee.id },
      transaction
    });
    if (membership?.orgRole === 'owner') {
      await transaction.rollback();
      return res.status(403).json({ error: "Cannot delete the organization owner's account." });
    }

    // Clean up associated OrganizationMembership and ShopAccess
    if (membership) {
      await ShopAccess.destroy({
        where: { membershipId: membership.id },
        transaction
      });
      await membership.destroy({ transaction });
    }

    await employee.destroy({ transaction });
    await tokenRevocationService.incrementAuthzVersion(employee.id, true, transaction);
    await transaction.commit();

    await tokenRevocationService.setUserStatus(employee.id, true, 'inactive');

    res.status(204).send();
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};
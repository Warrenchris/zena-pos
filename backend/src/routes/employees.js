const express = require('express');
const router = express.Router();
const { auth, authzContext, authorize } = require('../middleware/auth');
const { requireVerifiedEmail } = require('../middleware/requireVerifiedEmail');
const { Employee, User, Shop } = require('../models');
const {
  getAllEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee
} = require('../controllers/employeeController');

// All employee routes require authentication and canonical authorization context
router.use(auth);
router.use(authzContext);

// Get all employees – branch scoped, requires manage_employees capability
router.get('/',
  authorize({
    permissions: { any: ['manage_employees'] },
    shopScope: 'current'
  }),
  getAllEmployees
);

// Get employee by ID – admin/manager or self-lookup, with anti-oracle masking
router.get('/:id',
  authorize({
    ownership: {
      getResource: async (req) => {
        const targetId = req.params.id;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
        if (isUuid) {
          const emp = await Employee.findByPk(targetId, {
            include: [{ model: Shop, attributes: ['id', 'organizationId'] }]
          });
          if (!emp) return null;
          return {
            id: emp.id,
            shopId: emp.shopId,
            organizationId: emp.Shop?.organizationId,
            isEmployee: true
          };
        } else if (/^\d+$/.test(targetId)) {
          const u = await User.findByPk(targetId, {
            include: [{ model: Shop, attributes: ['id', 'organizationId'] }]
          });
          if (!u) return null;
          return {
            id: u.id,
            shopId: u.shopId,
            organizationId: u.Shop?.organizationId,
            isEmployee: false
          };
        }
        return null;
      },
      isOwner: (authz, resource) => {
        if (!resource) return false;
        if (resource.isEmployee) {
          return authz.identity.isEmployee && String(authz.identity.id) === String(resource.id);
        } else {
          return !authz.identity.isEmployee && String(authz.identity.id) === String(resource.id);
        }
      },
      managerPermission: 'manage_employees',
      antiOracle: true
    }
  }),
  getEmployeeById
);

// Create new employee – requires governance admin role and manage_employees
router.post('/',
  requireVerifiedEmail,
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  createEmployee
);

// Update employee – requires governance admin role and manage_employees
router.put('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  updateEmployee
);

// Delete employee – requires governance admin role and manage_employees
router.delete('/:id',
  authorize({
    roles: ['admin', 'org_admin'],
    permission: 'manage_employees',
    shopScope: 'current'
  }),
  deleteEmployee
);

module.exports = router;
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrganizationMembership = sequelize.define('OrganizationMembership', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  organizationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Organizations',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  employeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'Employees',
      key: 'id'
    }
  },
  orgRole: {
    type: DataTypes.ENUM('owner', 'admin', 'member', 'billing_admin'),
    allowNull: false,
    defaultValue: 'member'
  },
  status: {
    type: DataTypes.ENUM('active', 'invited', 'suspended'),
    allowNull: false,
    defaultValue: 'active'
  }
}, {
  tableName: 'OrganizationMemberships',
  timestamps: true,
  validate: {
    exactlyOneIdentity() {
      const hasUser = this.userId !== null && this.userId !== undefined;
      const hasEmployee = this.employeeId !== null && this.employeeId !== undefined;
      if ((hasUser && hasEmployee) || (!hasUser && !hasEmployee)) {
        throw new Error('OrganizationMembership must have exactly one of userId or employeeId.');
      }
    }
  }
});

module.exports = OrganizationMembership;

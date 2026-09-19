const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const sequelize = require('../config/database');
const Shop = require('./Shop');
const { isBcryptHash } = require('../utils/passwordUtils');

const Employee = sequelize.define('Employee', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },
  position: {
    type: DataTypes.STRING,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  hireDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  salary: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  shopId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Shops',
      key: 'id'
    }
  }
}, {
  timestamps: true,
  indexes: [
    {
      name: 'idx_employees_shop_createdAt',
      fields: ['shopId', 'createdAt']
    }
  ],
  hooks: {
    beforeCreate: async (employee) => {
      if (employee.password && !isBcryptHash(employee.password)) {
        employee.password = await bcrypt.hash(employee.password, 8);
      }
    },
    beforeUpdate: async (employee) => {
      if (employee.changed('password') && employee.password && !isBcryptHash(employee.password)) {
        employee.password = await bcrypt.hash(employee.password, 8);
      }
    },
    beforeBulkCreate: async (records) => {
      for (const record of records) {
        if (record.password && !isBcryptHash(record.password)) {
          record.password = await bcrypt.hash(record.password, 8);
        }
      }
    },
    beforeBulkUpdate: async (options) => {
      if (options.attributes?.password && !isBcryptHash(options.attributes.password)) {
        options.attributes.password = await bcrypt.hash(options.attributes.password, 8);
      }
    }
  }
});

// Remove password from JSON responses
Employee.prototype.toJSON = function() {
  const values = { ...this.get() };
  delete values.password;
  return values;
};

// Add password validation methods - supporting both validatePassword and comparePassword for compatibility
Employee.prototype.validatePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

Employee.prototype.comparePassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

// Relationship with Shop
Employee.belongsTo(Shop, { foreignKey: 'shopId' });
Shop.hasMany(Employee, { foreignKey: 'shopId' });

module.exports = Employee;
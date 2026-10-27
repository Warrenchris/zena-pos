'use strict';

/**
 * Migration: Add manualHold to Subscriptions and create PlatformAuditLogs table
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const { DataTypes } = Sequelize;

    // 1. Add manualHold to Subscriptions table if not present
    const subDesc = await queryInterface.describeTable('Subscriptions');
    if (!subDesc.manualHold) {
      await queryInterface.addColumn('Subscriptions', 'manualHold', {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }

    // 2. Create PlatformAuditLogs table without foreign key constraints (survives org purges / user deletion)
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'PlatformAuditLogs'");
    if (tables.length === 0) {
      await queryInterface.createTable('PlatformAuditLogs', {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false
        },
        actorUserId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        organizationId: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        action: {
          type: DataTypes.STRING(255),
          allowNull: false
        },
        fromStatus: {
          type: DataTypes.STRING(50),
          allowNull: true
        },
        toStatus: {
          type: DataTypes.STRING(50),
          allowNull: true
        },
        reason: {
          type: DataTypes.TEXT,
          allowNull: false
        },
        ip: {
          type: DataTypes.STRING(45),
          allowNull: true
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      await queryInterface.addIndex('PlatformAuditLogs', ['organizationId'], {
        name: 'idx_platform_audit_logs_organization_id'
      });
      await queryInterface.addIndex('PlatformAuditLogs', ['actorUserId'], {
        name: 'idx_platform_audit_logs_actor_user_id'
      });
      await queryInterface.addIndex('PlatformAuditLogs', ['createdAt'], {
        name: 'idx_platform_audit_logs_created_at'
      });
    }
  },

  async down(queryInterface) {
    const [tables] = await queryInterface.sequelize.query("SHOW TABLES LIKE 'PlatformAuditLogs'");
    if (tables.length > 0) {
      await queryInterface.dropTable('PlatformAuditLogs');
    }

    const subDesc = await queryInterface.describeTable('Subscriptions');
    if (subDesc.manualHold) {
      await queryInterface.removeColumn('Subscriptions', 'manualHold');
    }
  }
};

'use strict';

/**
 * Migration: Add email verification columns to Users and backfill existing users.
 *
 * Columns added:
 * - emailVerifiedAt (DATE null)
 * - emailVerificationTokenHash (STRING(64) null, indexed)
 * - emailVerificationExpiresAt (DATE null)
 * - emailVerificationSentAt (DATE null)
 *
 * Backfill:
 * - emailVerifiedAt = NOW() for all existing users so no existing user is locked out.
 */

async function getColumns(queryInterface, tableName) {
  try {
    const tableDesc = await queryInterface.describeTable(tableName);
    return Object.keys(tableDesc);
  } catch (err) {
    return [];
  }
}

async function getExistingIndexNames(queryInterface, tableName) {
  try {
    const [indexes] = await queryInterface.sequelize.query(`SHOW INDEX FROM \`${tableName}\``);
    return new Set(indexes.map(idx => idx.Key_name));
  } catch (err) {
    return new Set();
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const userColumns = await getColumns(queryInterface, 'Users');

    if (!userColumns.includes('emailVerifiedAt')) {
      await queryInterface.addColumn('Users', 'emailVerifiedAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!userColumns.includes('emailVerificationTokenHash')) {
      await queryInterface.addColumn('Users', 'emailVerificationTokenHash', {
        type: Sequelize.STRING(64),
        allowNull: true
      });
    }

    if (!userColumns.includes('emailVerificationExpiresAt')) {
      await queryInterface.addColumn('Users', 'emailVerificationExpiresAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    if (!userColumns.includes('emailVerificationSentAt')) {
      await queryInterface.addColumn('Users', 'emailVerificationSentAt', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }

    const indexes = await getExistingIndexNames(queryInterface, 'Users');
    if (!indexes.has('users_email_verification_token_hash')) {
      await queryInterface.addIndex('Users', ['emailVerificationTokenHash'], {
        name: 'users_email_verification_token_hash'
      });
    }

    // Backfill: Grandfather all existing users so existing merchants are never locked out
    await queryInterface.sequelize.query(`
      UPDATE \`Users\`
      SET \`emailVerifiedAt\` = NOW()
      WHERE \`emailVerifiedAt\` IS NULL
    `);
  },

  async down(queryInterface, Sequelize) {
    const indexes = await getExistingIndexNames(queryInterface, 'Users');
    if (indexes.has('users_email_verification_token_hash')) {
      await queryInterface.removeIndex('Users', 'users_email_verification_token_hash');
    }

    const userColumns = await getColumns(queryInterface, 'Users');

    if (userColumns.includes('emailVerificationSentAt')) {
      await queryInterface.removeColumn('Users', 'emailVerificationSentAt');
    }

    if (userColumns.includes('emailVerificationExpiresAt')) {
      await queryInterface.removeColumn('Users', 'emailVerificationExpiresAt');
    }

    if (userColumns.includes('emailVerificationTokenHash')) {
      await queryInterface.removeColumn('Users', 'emailVerificationTokenHash');
    }

    if (userColumns.includes('emailVerifiedAt')) {
      await queryInterface.removeColumn('Users', 'emailVerifiedAt');
    }
  }
};

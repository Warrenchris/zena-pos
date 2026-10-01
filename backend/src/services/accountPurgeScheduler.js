'use strict';

const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize,
  Organization,
  OrganizationMembership,
  Shop,
  Customer,
  Employee,
  User,
  HeldCart
} = require('../models');
const entitlementService = require('./entitlementService');
const logger = require('../utils/logger');

/**
 * Executes statutory data purge for organizations whose 30-day post-closure retention
 * window has expired.
 *
 * Anonymizes customer and employee PII, terminates access, deletes ephemeral carts,
 * but preserves financial and tax records (Sale, SaleItem, SalePayment, Invoices)
 * intact for statutory 5-year tax audit compliance.
 *
 * @param {Date} [asOfDate=new Date()]
 * @returns {Promise<{ purgedCount: number, organizationIds: number[] }>}
 */
async function purgeExpiredOrganizations(asOfDate = new Date()) {
  const cutoff = new Date(asOfDate);

  const expiredOrgs = await Organization.findAll({
    where: {
      deletedAt: { [Op.ne]: null },
      scheduledPurgeAt: { [Op.lte]: cutoff }
    }
  });

  const purgedOrgIds = [];

  for (const org of expiredOrgs) {
    const t = await sequelize.transaction();
    try {
      const shops = await Shop.findAll({
        where: { organizationId: org.id },
        transaction: t
      });
      const shopIds = shops.map(s => s.id);

      // 1. Anonymize Customer PII (name, email, phone, address, notes)
      await Customer.update(
        {
          name: 'Anonymized Customer',
          email: null,
          phone: null,
          address: null,
          location: null,
          notes: null
        },
        {
          where: { organizationId: org.id },
          transaction: t
        }
      );

      // 2. Anonymize Employee PII (names, emails, phone, terminate and scramble password)
      if (shopIds.length) {
        const employees = await Employee.findAll({
          where: { shopId: shopIds },
          transaction: t
        });

        for (const emp of employees) {
          const scrambledEmail = `anonymized_${emp.id.replace(/-/g, '')}@purged.local`;
          const scrambledPassword = `PURGED_${crypto.randomUUID()}`;
          await emp.update(
            {
              firstName: 'Anonymized',
              lastName: 'Staff',
              email: scrambledEmail,
              phone: null,
              status: 'inactive',
              password: scrambledPassword
            },
            { transaction: t }
          );
        }
      }

      // 3. Anonymize User PII for users whose sole active association is this organization
      const memberships = await OrganizationMembership.findAll({
        where: { organizationId: org.id },
        transaction: t
      });
      const userIds = memberships.map(m => m.userId).filter(Boolean);

      if (userIds.length) {
        const users = await User.findAll({
          where: { id: userIds },
          transaction: t
        });

        for (const u of users) {
          if (u.role === 'super_admin') continue;

          const otherActiveMemberships = await OrganizationMembership.count({
            where: {
              userId: u.id,
              organizationId: { [Op.ne]: org.id },
              status: 'active'
            },
            transaction: t
          });

          if (otherActiveMemberships === 0) {
            const scrambledEmail = `purged_${u.id}_${Date.now()}@purged.local`;
            const scrambledPassword = `PURGED_${crypto.randomUUID()}`;
            await u.update(
              {
                name: 'Anonymized User',
                email: scrambledEmail,
                password: scrambledPassword,
                active: false
              },
              { transaction: t }
            );
          }
        }
      }

      // 4. Suspend memberships
      await OrganizationMembership.update(
        { status: 'suspended' },
        { where: { organizationId: org.id }, transaction: t, validate: false }
      );

      // 5. Delete ephemeral held carts
      if (shopIds.length && HeldCart) {
        await HeldCart.destroy({
          where: { shopId: shopIds },
          transaction: t
        });
      }

      // 6. Statutory tax / financial records retention:
      // Sale, SaleItem, SalePayment, SalesReturn, and SubscriptionInvoice records
      // remain untouched in the database for 5 years per statutory audit obligations.

      await t.commit();
      await entitlementService.invalidateOrgEntitlements(org.id);
      purgedOrgIds.push(org.id);

      logger.info(`[7D-PURGE] Successfully purged expired organization ${org.id} ("${org.name}").`);
    } catch (err) {
      await t.rollback();
      logger.error(`[7D-PURGE] Failed to purge organization ${org.id}:`, err);
    }
  }

  return {
    purgedCount: purgedOrgIds.length,
    organizationIds: purgedOrgIds
  };
}

module.exports = {
  purgeExpiredOrganizations
};

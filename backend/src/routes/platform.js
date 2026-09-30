'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const {
  Organization,
  Subscription,
  Plan,
  Shop,
  User,
  OrganizationMembership,
  SubscriptionInvoice,
  BillingNotificationLog
} = require('../models');
const {
  requirePlatformSuperAdmin,
  platformRateLimiter
} = require('../middleware/requirePlatformSuperAdmin');
const logger = require('../utils/logger');

// Apply distributed rate limiter and super-admin authentication
router.use(platformRateLimiter);
router.use(requirePlatformSuperAdmin);

/**
 * Clamps pagination parameters to safe boundaries.
 * Max limit is strictly enforced at 100 (ADD 2).
 */
function getPaginationParams(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || 20;
  const limit = Math.min(100, Math.max(1, rawLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * GET /api/platform/overview
 * Platform-wide SaaS summary metrics for operators.
 */
router.get('/overview', async (req, res) => {
  try {
    const [
      totalOrgs,
      activeOrgs,
      trialingOrgs,
      pastDueOrgs,
      suspendedOrgs,
      canceledOrgs,
      totalShops,
      totalUsers,
      recentSignups
    ] = await Promise.all([
      Organization.count(),
      Organization.count({ where: { status: 'active' } }),
      Organization.count({ where: { status: { [Op.in]: ['trialing', 'trial'] } } }),
      Organization.count({ where: { status: 'past_due' } }),
      Organization.count({ where: { status: 'suspended' } }),
      Organization.count({ where: { status: 'canceled' } }),
      Shop.count(),
      User.count({ where: { role: { [Op.ne]: 'super_admin' } } }),
      Organization.count({
        where: {
          createdAt: {
            [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          }
        }
      })
    ]);

    // Subscriptions count by plan
    const subscriptions = await Subscription.findAll({
      where: { status: 'active' },
      include: [{ model: Plan, attributes: ['code', 'name', 'priceMonthly', 'currency'] }]
    });

    let estimatedMRR = 0;
    const planCounts = {};

    for (const sub of subscriptions) {
      const planCode = sub.Plan?.code || 'unknown';
      planCounts[planCode] = (planCounts[planCode] || 0) + 1;

      const monthlyPrice = Number(sub.Plan?.priceMonthly || 0);
      estimatedMRR += monthlyPrice;
    }

    // Invoices summary
    const paidInvoicesCount = await SubscriptionInvoice.count({ where: { status: 'paid' } });
    const paidInvoicesSum = await SubscriptionInvoice.sum('amount', { where: { status: 'paid' } }) || 0;

    res.json({
      organizations: {
        total: totalOrgs,
        active: activeOrgs,
        trialing: trialingOrgs,
        pastDue: pastDueOrgs,
        suspended: suspendedOrgs,
        canceled: canceledOrgs,
        recentSignups30d: recentSignups
      },
      infrastructure: {
        totalShops,
        totalUsers
      },
      revenue: {
        activePaidSubscriptions: subscriptions.length,
        estimatedMRR: Math.round(estimatedMRR * 100) / 100,
        currency: 'KES',
        paidInvoicesCount,
        totalRevenuePaid: Math.round(paidInvoicesSum * 100) / 100
      },
      planDistribution: planCounts
    });
  } catch (error) {
    logger.error('Error fetching platform overview:', error);
    res.status(500).json({ error: 'Failed to fetch platform overview' });
  }
});

/**
 * GET /api/platform/organizations
 * Paginated tenant list with search, status filtering, and plan details.
 * Max limit capped at 100 (ADD 2).
 */
router.get('/organizations', async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { status, plan: planFilter, search } = req.query;

    const orgWhere = {};
    if (status) {
      orgWhere.status = status;
    }
    if (search) {
      orgWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { slug: { [Op.like]: `%${search}%` } }
      ];
    }

    const subInclude = {
      model: Subscription,
      required: false,
      include: [{ model: Plan, attributes: ['id', 'code', 'name', 'priceMonthly', 'currency'] }]
    };

    if (planFilter) {
      subInclude.required = true;
      subInclude.include[0].where = { code: planFilter };
    }

    const { count, rows } = await Organization.findAndCountAll({
      where: orgWhere,
      include: [
        subInclude,
        {
          model: Shop,
          attributes: ['id', 'name', 'active'],
          required: false
        },
        {
          model: OrganizationMembership,
          where: { orgRole: 'owner', status: 'active' },
          required: false,
          include: [{ model: User, attributes: ['id', 'name', 'email', 'emailVerifiedAt'] }]
        }
      ],
      distinct: true,
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    const organizations = rows.map((org) => {
      const ownerMembership = org.OrganizationMemberships?.[0];
      const ownerUser = ownerMembership?.User;
      const sub = org.Subscription;

      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        currency: org.currency,
        createdAt: org.createdAt,
        shopCount: org.Shops?.length || 0,
        subscription: sub ? {
          id: sub.id,
          status: sub.status,
          billingCycle: sub.billingCycle,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          trialEndsAt: sub.trialEndsAt,
          plan: sub.Plan ? {
            id: sub.Plan.id,
            code: sub.Plan.code,
            name: sub.Plan.name,
            priceMonthly: sub.Plan.priceMonthly,
            currency: sub.Plan.currency
          } : null
        } : null,
        owner: ownerUser ? {
          id: ownerUser.id,
          name: ownerUser.name,
          email: ownerUser.email,
          emailVerified: Boolean(ownerUser.emailVerifiedAt)
        } : null
      };
    });

    res.json({
      organizations,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error listing organizations for platform:', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
});

/**
 * GET /api/platform/organizations/:id
 * Deep-dive profile of an individual tenant organization.
 */
router.get('/organizations/:id', async (req, res) => {
  try {
    const orgId = parseInt(req.params.id, 10);
    if (!orgId) {
      return res.status(400).json({ error: 'Valid organization ID required' });
    }

    const org = await Organization.findByPk(orgId, {
      include: [
        {
          model: Subscription,
          include: [{ model: Plan }]
        },
        {
          model: Shop,
          attributes: ['id', 'name', 'phone', 'address', 'active', 'createdAt']
        },
        {
          model: OrganizationMembership,
          where: { status: 'active' },
          required: false,
          include: [{ model: User, attributes: ['id', 'name', 'email', 'role', 'active', 'emailVerifiedAt', 'createdAt'] }]
        }
      ]
    });

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Invoices and Notifications history
    const [recentInvoices, recentNotifications, memberCount] = await Promise.all([
      SubscriptionInvoice.findAll({
        where: { organizationId: orgId },
        include: [{ model: Plan, attributes: ['code', 'name'] }],
        order: [['createdAt', 'DESC']],
        limit: 10
      }),
      BillingNotificationLog.findAll({
        where: { organizationId: orgId },
        order: [['createdAt', 'DESC']],
        limit: 10
      }),
      OrganizationMembership.count({
        where: { organizationId: orgId, status: 'active' }
      })
    ]);

    const plan = org.Subscription?.Plan;
    const quotaUsage = {
      shops: {
        current: org.Shops?.length || 0,
        limit: plan?.maxShops ?? 1
      },
      users: {
        current: memberCount,
        limit: plan?.maxUsers ?? 2
      }
    };

    res.json({
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        currency: org.currency,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt
      },
      subscription: org.Subscription ? {
        id: org.Subscription.id,
        status: org.Subscription.status,
        billingCycle: org.Subscription.billingCycle,
        currentPeriodStart: org.Subscription.currentPeriodStart,
        currentPeriodEnd: org.Subscription.currentPeriodEnd,
        trialEndsAt: org.Subscription.trialEndsAt,
        cancelAtPeriodEnd: org.Subscription.cancelAtPeriodEnd,
        lastPaymentMethod: org.Subscription.lastPaymentMethod,
        lastPaymentDate: org.Subscription.lastPaymentDate,
        plan: plan ? {
          id: plan.id,
          code: plan.code,
          name: plan.name,
          priceMonthly: plan.priceMonthly,
          currency: plan.currency,
          maxShops: plan.maxShops,
          maxUsers: plan.maxUsers,
          features: plan.features
        } : null
      } : null,
      quotaUsage,
      shops: org.Shops || [],
      members: (org.OrganizationMemberships || []).map((m) => ({
        membershipId: m.id,
        orgRole: m.orgRole,
        status: m.status,
        user: m.User ? {
          id: m.User.id,
          name: m.User.name,
          email: m.User.email,
          role: m.User.role,
          active: m.User.active,
          emailVerified: Boolean(m.User.emailVerifiedAt)
        } : null
      })),
      recentInvoices,
      recentNotifications
    });
  } catch (error) {
    logger.error(`Error fetching organization ${req.params.id} for platform:`, error);
    res.status(500).json({ error: 'Failed to fetch organization details' });
  }
});

/**
 * GET /api/platform/plans
 * List of subscription plans and their active subscriber counts.
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.findAll({
      order: [['priceMonthly', 'ASC']]
    });

    const planStats = await Promise.all(
      plans.map(async (plan) => {
        const activeSubscribers = await Subscription.count({
          where: {
            planId: plan.id,
            status: { [Op.in]: ['active', 'trialing'] }
          }
        });
        return {
          id: plan.id,
          name: plan.name,
          code: plan.code,
          priceMonthly: plan.priceMonthly,
          currency: plan.currency,
          maxShops: plan.maxShops,
          maxUsers: plan.maxUsers,
          features: plan.features,
          isActive: plan.isActive,
          activeSubscribers
        };
      })
    );

    res.json({ plans: planStats });
  } catch (error) {
    logger.error('Error fetching plans for platform:', error);
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * GET /api/platform/invoices
 * Platform-wide invoice log across all organizations.
 * Max limit capped at 100 (ADD 2).
 */
router.get('/invoices', async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { status, paymentChannel, search } = req.query;

    const where = {};
    if (status) where.status = status;
    if (paymentChannel) where.paymentChannel = paymentChannel;
    if (search) {
      where[Op.or] = [
        { invoiceNumber: { [Op.like]: `%${search}%` } },
        { paymentReference: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await SubscriptionInvoice.findAndCountAll({
      where,
      include: [
        { model: Organization, attributes: ['id', 'name', 'slug'] },
        { model: Plan, attributes: ['id', 'code', 'name'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      invoices: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching invoices for platform:', error);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

/**
 * GET /api/platform/notifications
 * Audit log of billing notification dispatches across organizations.
 * Max limit capped at 100 (ADD 2).
 */
router.get('/notifications', async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { eventType, status, organizationId } = req.query;

    const where = {};
    if (eventType) where.eventType = eventType;
    if (status) where.status = status;
    if (organizationId) where.organizationId = parseInt(organizationId, 10);

    const { count, rows } = await BillingNotificationLog.findAndCountAll({
      where,
      include: [
        { model: Organization, attributes: ['id', 'name', 'slug'] }
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset
    });

    res.json({
      notifications: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching notification logs for platform:', error);
    res.status(500).json({ error: 'Failed to fetch notification logs' });
  }
});

module.exports = router;

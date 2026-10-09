/* eslint-env jest */
/* global describe, it, expect, beforeEach */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlatformOverview from '../../pages/platform/PlatformOverview';
import PlatformOrganizations from '../../pages/platform/PlatformOrganizations';
import PlatformPlans from '../../pages/platform/PlatformPlans';
import PlatformInvoices from '../../pages/platform/PlatformInvoices';
import PlatformNotifications from '../../pages/platform/PlatformNotifications';
import { platformAPI } from '../../services/platformAPI';

jest.mock('../../services/platformAPI', () => {
  const mockApi = {
    getOverview: jest.fn(),
    getOrganizations: jest.fn(),
    getOrganization: jest.fn(),
    getPlans: jest.fn(),
    getInvoices: jest.fn(),
    getNotifications: jest.fn(),
  };
  return {
    __esModule: true,
    platformAPI: mockApi,
    default: mockApi,
  };
});

describe('Platform Screens UI Harmonization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PlatformOverview', () => {
    it('renders overview KPIs and cards correctly', async () => {
      platformAPI.getOverview.mockResolvedValue({
        data: {
          organizations: {
            total: 42,
            recentSignups30d: 8,
            active: 35,
            trialing: 5,
            pastDue: 1,
            suspended: 1,
            canceled: 0,
          },
          revenue: {
            activePaidSubscriptions: 35,
            estimatedMRR: 125000,
            totalRevenuePaid: 850000,
          },
          infrastructure: {
            totalShops: 88,
            totalUsers: 140,
          },
          planDistribution: {
            starter: 15,
            professional: 20,
          },
        },
      });

      render(
        <MemoryRouter>
          <PlatformOverview />
        </MemoryRouter>
      );

      expect(await screen.findByText('Platform Overview')).toBeInTheDocument();
      expect(await screen.findByText('Total Tenants')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
      expect(screen.getByText('+8 new in 30d')).toBeInTheDocument();
      expect(screen.getByText('Active Paid Subs')).toBeInTheDocument();
      expect(screen.getAllByText('35').length).toBeGreaterThan(0);
      expect(screen.getByText('Tenant Lifecycle Breakdown')).toBeInTheDocument();
      expect(screen.getByText('Active Plan Distribution')).toBeInTheDocument();
      expect(screen.getByText('starter Plan')).toBeInTheDocument();
      expect(screen.getByText('professional Plan')).toBeInTheDocument();
    });
  });

  describe('PlatformOrganizations', () => {
    it('renders organization table with search bar and status filter', async () => {
      platformAPI.getOrganizations.mockResolvedValue({
        data: {
          organizations: [
            {
              id: 'org-abc',
              name: 'Savannah Supermarket',
              slug: 'savannah-supermarket',
              status: 'active',
              shopCount: 4,
              owner: {
                name: 'Alice Wanjiku',
                email: 'alice@savannah.co.ke',
              },
              subscription: {
                plan: { name: 'Enterprise' },
              },
              createdAt: '2026-03-15T10:00:00Z',
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      });

      render(
        <MemoryRouter>
          <PlatformOrganizations />
        </MemoryRouter>
      );

      expect(await screen.findByText('Organizations')).toBeInTheDocument();
      expect(await screen.findByText('Savannah Supermarket')).toBeInTheDocument();
      expect(screen.getByText('savannah-supermarket')).toBeInTheDocument();
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
      expect(screen.getByText('Alice Wanjiku')).toBeInTheDocument();
      expect(screen.getByText('Inspect')).toBeInTheDocument();
    });
  });

  describe('PlatformPlans', () => {
    it('renders subscription tiers and pricing cards', async () => {
      platformAPI.getPlans.mockResolvedValue({
        data: {
          plans: [
            {
              id: 'p-growth',
              name: 'Growth',
              code: 'GROWTH',
              currency: 'KES',
              priceMonthly: 4999,
              maxShops: 5,
              maxUsers: 10,
              isActive: true,
              activeSubscribers: 18,
            },
          ],
        },
      });

      render(
        <MemoryRouter>
          <PlatformPlans />
        </MemoryRouter>
      );

      expect(await screen.findByText('Subscription Plans')).toBeInTheDocument();
      expect(await screen.findByText('Growth')).toBeInTheDocument();
      expect(screen.getByText('GROWTH')).toBeInTheDocument();
      expect(screen.getByText('KES 4,999.00')).toBeInTheDocument();
      expect(screen.getByText('Max Shops')).toBeInTheDocument();
      expect(screen.getByText('18 tenants')).toBeInTheDocument();
    });
  });

  describe('PlatformInvoices', () => {
    it('renders global invoice ledger', async () => {
      platformAPI.getInvoices.mockResolvedValue({
        data: {
          invoices: [
            {
              id: 'inv-101',
              invoiceNumber: 'INV-2026-101',
              amount: 4999,
              currency: 'KES',
              paymentChannel: 'mpesa',
              status: 'paid',
              createdAt: '2026-03-20T08:00:00Z',
              Organization: { name: 'Savannah Supermarket' },
              Plan: { name: 'Growth' },
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      });

      render(
        <MemoryRouter>
          <PlatformInvoices />
        </MemoryRouter>
      );

      expect(await screen.findByText('Platform Invoices')).toBeInTheDocument();
      expect(await screen.findByText('INV-2026-101')).toBeInTheDocument();
      expect(screen.getByText('Savannah Supermarket')).toBeInTheDocument();
      expect(screen.getByText('KES 4999.00')).toBeInTheDocument();
      expect(screen.getAllByText('Paid').length).toBeGreaterThan(0);
    });
  });

  describe('PlatformNotifications', () => {
    it('renders notification audit logs', async () => {
      platformAPI.getNotifications.mockResolvedValue({
        data: {
          notifications: [
            {
              id: 'notif-99',
              eventType: 'PAYMENT_RECEIPT',
              recipientEmail: 'finance@savannah.co.ke',
              periodKey: '2026-03',
              status: 'sent',
              createdAt: '2026-03-20T08:05:00Z',
              Organization: { name: 'Savannah Supermarket' },
            },
          ],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      });

      render(
        <MemoryRouter>
          <PlatformNotifications />
        </MemoryRouter>
      );

      expect(await screen.findByText('Notification Audit Logs')).toBeInTheDocument();
      expect(await screen.findByText('PAYMENT_RECEIPT')).toBeInTheDocument();
      expect(screen.getByText('finance@savannah.co.ke')).toBeInTheDocument();
      expect(screen.getByText('2026-03')).toBeInTheDocument();
      expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    });
  });
});

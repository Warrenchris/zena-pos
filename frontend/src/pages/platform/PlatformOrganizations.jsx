import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';
import { platformAPI } from '../../services/platformAPI';
import PageHeader from '../../components/ui/PageHeader';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function PlatformOrganizations() {
  const [organizations, setOrganizations] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadOrgs() {
      try {
        setLoading(true);
        const params = {
          page: pagination.page,
          limit: 20,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(search ? { search } : {})
        };
        const res = await platformAPI.getOrganizations(params);
        setOrganizations(res.data.organizations);
        setPagination(res.data.pagination);
      } catch (err) {
        setError(err.response?.data?.error || err.message || 'Failed to load organizations');
      } finally {
        setLoading(false);
      }
    }
    loadOrgs();
  }, [pagination.page, statusFilter, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <Badge variant="success" dot size="sm">Active</Badge>;
      case 'trialing':
      case 'trial':
        return <Badge variant="info" dot size="sm">Trial</Badge>;
      case 'past_due':
        return <Badge variant="warning" dot size="sm">Past Due</Badge>;
      case 'suspended':
        return <Badge variant="danger" dot size="sm">Suspended</Badge>;
      case 'canceled':
        return <Badge variant="neutral" dot size="sm">Canceled</Badge>;
      default:
        return <Badge variant="neutral" size="sm">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Organizations"
        description="Manage and inspect all tenant organizations across the platform."
      />

      {/* Filters Bar */}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2.5 w-full sm:w-96">
            <div className="relative w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-text-muted">
                <MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <input
                type="text"
                placeholder="Search by name or slug..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full bg-surface border border-border-default rounded-xl pl-10 pr-3.5 py-2 text-small text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150"
              />
            </div>
            <Button type="submit" variant="primary" size="sm">
              Search
            </Button>
          </form>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <label className="text-small font-medium text-text-secondary flex items-center gap-1.5 shrink-0">
              <FunnelIcon className="h-4 w-4 text-text-muted" aria-hidden="true" />
              <span>Status:</span>
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="bg-surface border border-border-default rounded-xl px-3 py-2 text-small text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all duration-150 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="suspended">Suspended</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Error alert */}
      {error && (
        <div className="p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-small flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Organizations Table */}
      <div className="rounded-2xl border border-border-default bg-surface shadow-floating overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body border-collapse">
            <thead className="bg-surface-2/70 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
              <tr>
                <th scope="col" className="py-3.5 px-4 font-semibold">Organization</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Status</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Plan</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Branches</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Primary Owner</th>
                <th scope="col" className="py-3.5 px-4 font-semibold">Created</th>
                <th scope="col" className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default text-text-primary">
              {loading ? (
                Array.from({ length: 5 }).map((_, rIdx) => (
                  <tr key={rIdx} className="animate-pulse">
                    <td className="py-4 px-4">
                      <div className="h-4 bg-surface-2 rounded-md w-32 mb-1" />
                      <div className="h-3 bg-surface-2 rounded-md w-20" />
                    </td>
                    <td className="py-4 px-4"><div className="h-5 bg-surface-2 rounded-full w-16" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-20" /></td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-8" /></td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-surface-2 rounded-md w-28 mb-1" />
                      <div className="h-3 bg-surface-2 rounded-md w-36" />
                    </td>
                    <td className="py-4 px-4"><div className="h-4 bg-surface-2 rounded-md w-20" /></td>
                    <td className="py-4 px-4 text-right"><div className="h-7 bg-surface-2 rounded-xl w-20 ml-auto" /></td>
                  </tr>
                ))
              ) : organizations.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12">
                    <EmptyState
                      title="No organizations found"
                      description="No organizations match your search or filter criteria."
                    />
                  </td>
                </tr>
              ) : (
                organizations.map((org) => (
                  <tr
                    key={org.id}
                    className="hover:bg-surface-2/60 transition-colors duration-150"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-text-primary">{org.name}</div>
                      <div className="text-caption text-text-muted font-mono mt-0.5">{org.slug}</div>
                    </td>
                    <td className="py-3.5 px-4">{renderStatusBadge(org.status)}</td>
                    <td className="py-3.5 px-4">
                      {org.subscription?.plan?.name ? (
                        <Badge variant="neutral" size="sm">
                          {org.subscription.plan.name}
                        </Badge>
                      ) : (
                        <span className="text-caption text-text-muted">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-text-primary">
                      {org.shopCount}
                    </td>
                    <td className="py-3.5 px-4">
                      {org.owner ? (
                        <div>
                          <div className="text-small font-medium text-text-primary">{org.owner.name}</div>
                          <div className="text-caption text-text-muted font-mono">{org.owner.email}</div>
                        </div>
                      ) : (
                        <span className="text-caption text-text-muted">None</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-caption text-text-secondary">
                      {new Date(org.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        to={`/platform/organizations/${org.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border-default bg-surface hover:bg-surface-2 text-primary hover:text-primary-hover font-semibold text-caption transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40"
                      >
                        <span>Inspect</span>
                        <ArrowRightIcon className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Harmonized Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-surface-2/40 border-t border-border-default text-small text-text-secondary">
            <div>
              Showing page <strong className="font-semibold text-text-primary">{pagination.page}</strong> of{' '}
              <strong className="font-semibold text-text-primary">{pagination.totalPages}</strong> ({pagination.total} total)
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={ChevronLeftIcon}
                disabled={pagination.page <= 1}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                rightIcon={ChevronRightIcon}
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

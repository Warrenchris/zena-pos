import { useState, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { LoadingOverlay } from '../components/LoadingStates';
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import { fetchCustomers, deleteCustomer, createCustomer, updateCustomer } from '../store/slices/customersSlice';
import { customersAPI } from '../services/api';
import useCurrency from '../hooks/useCurrency';
import CustomerDetailsCard from '../components/CustomerDetailsCard';
import CustomerModal from '../components/CustomerModal';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';

const DAY_MS = 24 * 60 * 60 * 1000;

function visitLabel(value) {
  if (!value) return { text: 'Never', inactive: false };
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return { text: 'Never', inactive: false };
  const days = Math.floor((Date.now() - then) / DAY_MS);
  if (days <= 0) return { text: 'Today', inactive: false };
  if (days === 1) return { text: 'Yesterday', inactive: false };
  return { text: `${days} days ago`, inactive: days > 30 };
}

export default function Customers() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { customers, loading, pagination } = useSelector((state) => state.customers);
  const { format: formatCurrency } = useCurrency();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const res = await customersAPI.getStatistics();
      setSummary(res.data || null);
    } catch {
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const result = await dispatch(fetchCustomers({
          page: currentPage,
          limit: 10,
          search: searchTerm
        })).unwrap();
        
        if (searchTerm && result.customers.length === 0) {
          showToast({
            type: 'info',
            title: 'No Results',
            message: 'No customers found matching your search criteria'
          });
        }
      } catch (error) {
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load customers. Please try again.'
        });
      }
    };

    loadCustomers();
  }, [dispatch, currentPage, searchTerm]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowModal(true);
  };

  const handleDelete = async (customerId) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await dispatch(deleteCustomer(customerId)).unwrap();
        loadSummary();
        showToast({
          type: 'success',
          title: 'Customer Deleted',
          message: 'The customer has been successfully removed'
        });
      } catch (error) {
        showToast({
          type: 'error',
          title: 'Delete Failed',
          message: error.message || 'Failed to delete the customer. Please try again.'
        });
      }
    }
  };

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      render: (val, row) => {
        const place = row.location || row.address;
        const initial = (val || 'C').trim().charAt(0).toUpperCase() || 'C';
        return (
          <button
            onClick={() => setSelectedCustomer(row)}
            className="flex items-center gap-3 text-left font-semibold text-text-primary text-body hover:text-brand-yellow transition-colors focus:outline-none"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
              {initial}
            </span>
            <span>
              <span className="block">{val}</span>
              {place && <span className="block text-caption font-normal text-text-muted">{place}</span>}
            </span>
          </button>
        );
      }
    },
    {
      key: 'email',
      label: 'Contact Details',
      render: (val, row) => (
        <div>
          {val && <div className="text-small font-medium text-text-primary">{val}</div>}
          {row.phone ? (
            <a href={`tel:${row.phone}`} className="text-caption text-text-muted hover:text-text-primary">
              {row.phone}
            </a>
          ) : (
            !val && <div className="text-caption text-text-muted">No phone</div>
          )}
        </div>
      )
    },
    {
      key: 'totalPurchases',
      label: 'Total Spent',
      render: (val) => <span className="font-bold text-primary">{formatCurrency(val || 0)}</span>
    },
    {
      key: 'loyaltyPoints',
      label: 'Loyalty Points',
      render: (val) => (
        <Badge variant="primary">
          {val || 0} pts
        </Badge>
      )
    },
    {
      key: 'lastVisit',
      label: 'Last Visit',
      render: (val) => {
        const visit = visitLabel(val);
        return (
          <span className="inline-flex items-center gap-2 text-small text-text-secondary">
            {visit.text}
            {visit.inactive && <Badge variant="warning">Inactive</Badge>}
          </span>
        );
      }
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectedCustomer(row)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="View Customer Profile"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => handleEdit(row)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Edit Customer"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => navigate(`/pos?customerId=${encodeURIComponent(row.id)}`)}
            className="px-2 py-1 rounded-lg text-caption font-semibold text-primary hover:bg-primary/10 transition-colors"
            title="New Sale"
          >
            New Sale
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="p-1.5 rounded-lg text-danger hover:bg-danger/10 transition-colors"
            title="Delete Customer"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <LoadingOverlay isLoading={loading} text="Loading customers...">
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            title="Customers"
            description="Manage customer accounts, purchase histories, and loyalty points."
            primaryAction={{
              label: 'Add Customer',
              icon: PlusIcon,
              onClick: () => {
                setEditingCustomer(null);
                setShowModal(true);
              }
            }}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-caption text-text-secondary">Customers</p>
              <p className="text-h3 font-bold text-text-primary">
                {summary?.totalCustomers ?? pagination?.totalItems ?? pagination?.total ?? customers.length}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-caption text-text-secondary">Total spent</p>
              <p className="text-h3 font-bold text-primary">
                {summary ? formatCurrency(summary.totalSpent || 0) : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-caption text-text-secondary">Bought in 30 days</p>
              <p className="text-h3 font-bold text-text-primary">
                {summary ? (summary.activeCustomers ?? 0) : '—'}
              </p>
            </Card>
          </div>

          {/* Search Card */}
          <Card variant="default" className="p-4">
            <Input
              type="search"
              placeholder="Search customers by name, phone, or email..."
              value={searchTerm}
              onChange={handleSearch}
              leftIcon={MagnifyingGlassIcon}
            />
          </Card>

          {/* Notion-Style Table */}
          <Table
            columns={columns}
            data={customers}
            loading={loading}
            emptyTitle="No Customers Found"
            emptyDescription="Add new customer accounts to track purchases and issue loyalty rewards."
            pagination={{
              currentPage,
              totalPages: pagination?.totalPages || 1,
              totalItems: pagination?.totalItems ?? pagination?.total ?? customers.length,
              pageSize: 10,
              onPageChange: (p) => setCurrentPage(p)
            }}
          />
        </div>

        {/* Modals */}
        {showModal && (
          <CustomerModal
            isOpen={showModal}
            customer={editingCustomer}
            onClose={() => {
              setShowModal(false);
              setEditingCustomer(null);
            }}
            onSubmit={async (customerData) => {
              try {
                if (editingCustomer) {
                  await dispatch(updateCustomer({ id: editingCustomer.id, customerData })).unwrap();
                  showToast({
                    type: 'success',
                    title: 'Customer Updated',
                    message: `Successfully updated ${customerData.name}`
                  });
                } else {
                  await dispatch(createCustomer(customerData)).unwrap();
                  showToast({
                    type: 'success',
                    title: 'Customer Added',
                    message: `Successfully added ${customerData.name}`
                  });
                }
                setShowModal(false);
                setEditingCustomer(null);
                loadSummary();
              } catch (error) {
                showToast({
                  type: 'error',
                  title: 'Save Failed',
                  message: error.message || 'Failed to save customer information'
                });
              }
            }}
          />
        )}
        <CustomerDetailsCard customer={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      </LoadingOverlay>
    </div>
  );
}
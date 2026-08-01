import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
import useCurrency from '../hooks/useCurrency';
import CustomerDetailsCard from '../components/CustomerDetailsCard';
import CustomerModal from '../components/CustomerModal';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';

export default function Customers() {
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { customers, loading, pagination } = useSelector((state) => state.customers);
  const { format: formatCurrency } = useCurrency();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [editingCustomer, setEditingCustomer] = useState(null);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        const result = await dispatch(fetchCustomers({ 
          page: currentPage, 
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
      render: (val, row) => (
        <button
          onClick={() => setSelectedCustomer(row)}
          className="text-left font-semibold text-text-primary text-body hover:text-brand-yellow hover:underline transition-colors focus:outline-none"
        >
          <div>{val}</div>
          {row.address && <div className="text-caption text-text-muted font-normal">{row.address}</div>}
        </button>
      )
    },
    {
      key: 'email',
      label: 'Contact Details',
      render: (val, row) => (
        <div>
          <div className="text-small font-medium text-text-primary">{val || 'No email'}</div>
          <div className="text-caption text-text-muted">{row.phone || 'No phone'}</div>
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
      render: (val) => (
        <span className="text-small text-text-secondary">
          {val ? new Date(val).toLocaleDateString() : 'Never'}
        </span>
      )
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
              totalItems: pagination?.totalItems || customers.length,
              pageSize: 10,
              onPageChange: (p) => setCurrentPage(p)
            }}
          />
        </div>

        {/* Modals */}
        {showModal && (
          <CustomerModal
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
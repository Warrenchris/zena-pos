import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useToast } from '../components/Toast';
import { LoadingOverlay, InlineLoading } from '../components/LoadingStates';
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
    
    if (!e.target.value) {
      showToast({
        type: 'info',
        title: 'Search Cleared',
        message: 'Showing all customers'
      });
    }
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowModal(true);
    showToast({
      type: 'info',
      title: 'Edit Mode',
      message: `Editing customer: ${customer.name}`
    });
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

  // currency now handled by useCurrency hook

  return (
    <div className="min-h-screen p-6 bg-brand-black text-white">
      <LoadingOverlay isLoading={loading} text="Loading customers...">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-zana-yellow">Customers</h1>
              <p className="text-white/70">
                Manage your customer database
                {loading && <span className="ml-2 text-sm text-zana-yellow">(Refreshing...)</span>}
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setShowModal(true);
                showToast({
                  type: 'info',
                  title: 'Add Customer',
                  message: 'Fill in the customer details to add them to the system'
                });
              }}
              className="px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50 bg-zana-yellow text-black shadow-zana hover:bg-zana-yellow/90 hover:shadow-zana-lg focus:outline-none focus:ring-2 focus:ring-zana-yellow/50"
              disabled={loading}
            >
              <PlusIcon className="h-5 w-5" />
              Add Customer
            </button>
          </div>

          {/* Search */}
          <div className="bg-brand-gray p-6 rounded-lg shadow-zana border border-zana-borderTint">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-zana-yellow/50" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/40 text-white placeholder:text-zana-yellow/40 border border-zana-borderTint focus:outline-none focus:ring-2 focus:ring-zana-yellow focus:border-zana-yellow"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-brand-black rounded-lg shadow-zana overflow-hidden border border-zana-borderTint">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-zana-borderTint">
                <thead className="bg-black">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Total Spent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Loyalty Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Last Visit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-zana-yellow uppercase tracking-wider border-b border-zana-borderTint">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zana-borderTint">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="odd:bg-black/30 even:bg-black/20 hover:bg-zana-yellow/5">
                      <td className="px-6 py-4 whitespace-nowrap text-white">
                        <div>
                          <div className="text-sm font-medium">{customer.name}</div>
                          {customer.address && (
                            <div className="text-sm text-white/60">{customer.address}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-white">
                        <div className="text-sm">{customer.email || 'No email'}</div>
                        <div className="text-sm text-white/60">{customer.phone || 'No phone'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {formatCurrency(customer.totalPurchases)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-zana-yellow/10 text-zana-yellow border border-zana-borderTint">
                          {customer.loyaltyPoints} pts
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2 items-center">
                          <button
                            onClick={() => setSelectedCustomer(customer)}
                            className="text-zana-yellow hover:text-zana-yellow/80 hover:drop-shadow-[0_0_6px_rgba(255,214,0,0.6)]"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(customer)}
                            className="text-white/80 hover:text-white"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            className="text-red-400 hover:text-red-300"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Empty State */}
            {customers.length === 0 && !loading && (
              <div className="p-8 text-center">
                <p className="text-white/60">No customers found</p>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-black/30 px-4 py-3 flex items-center justify-between border-t border-zana-borderTint sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md text-white border-zana-borderTint bg-black hover:bg-zana-yellow/10 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === pagination.totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border text-sm font-medium rounded-md text-white border-zana-borderTint bg-black hover:bg-zana-yellow/10 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-white/80">
                      Showing page <span className="font-medium">{currentPage}</span> of{' '}
                      <span className="font-medium">{pagination.totalPages}</span>
                    </p>
                  </div>
                  <div>
                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                      {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            page === currentPage
                              ? 'z-10 bg-zana-yellow text-black border-zana-yellow'
                              : 'bg-black text-white/70 border-zana-borderTint hover:bg-zana-yellow/10'
                          }`}
                        >
                          {page}
                        </button>
                      ))}
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modals */}
        {showModal && (
          <CustomerModal
            customer={editingCustomer}
            onClose={() => {
              setShowModal(false);
              setEditingCustomer(null);
              showToast({
                type: 'info',
                title: 'Cancelled',
                message: 'Customer changes were cancelled'
              });
            }}
            onSubmit={async (customerData) => {
              try {
                if (editingCustomer) {
                  await dispatch(updateCustomer({ id: editingCustomer.id, customerData })).unwrap();
                  showToast({
                    type: 'success',
                    title: 'Customer Updated',
                    message: `Successfully updated ${customerData.name}'s information`
                  });
                } else {
                  await dispatch(createCustomer(customerData)).unwrap();
                  showToast({
                    type: 'success',
                    title: 'Customer Added',
                    message: `Successfully added ${customerData.name} to customers`
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
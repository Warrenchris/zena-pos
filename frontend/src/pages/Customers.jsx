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
import CustomerModal from '../components/CustomerModal';

export default function Customers() {
  const dispatch = useDispatch();
  const { showToast } = useToast();
  const { customers, loading, pagination } = useSelector((state) => state.customers);
  
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

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  return (
    <div className="min-h-screen p-6">
      <LoadingOverlay isLoading={loading} text="Loading customers...">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
              <p className="text-gray-600">
                Manage your customer database
                {loading && <span className="ml-2 text-sm text-blue-600">(Refreshing...)</span>}
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
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
              disabled={loading}
            >
              <PlusIcon className="h-5 w-5" />
              Add Customer
            </button>
          </div>

          {/* Search */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Spent
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Loyalty Points
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Visit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{customer.name}</div>
                          {customer.address && (
                            <div className="text-sm text-gray-500">{customer.address}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{customer.email || 'No email'}</div>
                        <div className="text-sm text-gray-500">{customer.phone || 'No phone'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(customer.totalPurchases)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {customer.loyaltyPoints} pts
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedCustomer(customer)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleEdit(customer)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
                            className="text-red-600 hover:text-red-900"
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
                <p className="text-gray-500">No customers found</p>
              </div>
            )}

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === pagination.totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
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
                              ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
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
      </LoadingOverlay>
    </div>
  );
}
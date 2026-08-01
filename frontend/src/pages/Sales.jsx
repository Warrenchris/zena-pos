import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { 
  PlusIcon, 
  EyeIcon,
  PrinterIcon,
  FunnelIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import { fetchAdminSales, fetchMySales } from '../store/slices/salesSlice';
import { fetchProducts } from '../store/slices/productsSlice';
import { fetchCustomers } from '../store/slices/customersSlice';
import { employeesAPI } from '../services/api';
import POSModal from '../components/POSModal';
import SaleDetailModal from '../components/SaleDetailModal';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';
import { useCurrency } from '../hooks/useCurrency';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Table from '../components/ui/Table';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/ui/PageHeader';

export default function Sales() {
  const dispatch = useDispatch();
  const { sales, loading, pagination } = useSelector((state) => state.sales);
  const { products } = useSelector((state) => state.products);
  const { customers } = useSelector((state) => state.customers);
  const { user } = useSelector((state) => state.auth);
  const { format: formatCurrency } = useCurrency();
  
  const [currentPage, setCurrentPage] = useState(1);
  const [showPOSModal, setShowPOSModal] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    cashierId: '',
    sortBy: 'createdAt',
    sortOrder: 'DESC'
  });

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const urlCustomerId = (() => {
    try { return new URLSearchParams(window.location.search).get('customerId') || ''; } catch { return ''; }
  })();

  useEffect(() => {
    if (isAdmin) {
      fetchEmployees();
    }
    dispatch(fetchProducts());
    dispatch(fetchCustomers());
  }, [dispatch, isAdmin]);

  const loadSalesData = () => {
    if (isAdmin) {
      dispatch(fetchAdminSales({ 
        page: currentPage, 
        ...filters 
      }));
    } else {
      dispatch(fetchMySales({ 
        page: currentPage, 
        startDate: filters.startDate,
        endDate: filters.endDate,
        sortBy: filters.sortBy,
        sortOrder: filters.sortOrder
      }));
    }
  };

  useEffect(() => {
    loadSalesData();
  }, [dispatch, currentPage, filters, isAdmin]);

  const fetchEmployees = async () => {
    try {
      const response = await employeesAPI.getAll();
      if (response.data && Array.isArray(response.data)) {
        setEmployees(response.data);
      } else if (response.data && Array.isArray(response.data.employees)) {
        setEmployees(response.data.employees);
      } else if (response.data && Array.isArray(response.data.rows)) {
        setEmployees(response.data.rows);
      } else {
        setEmployees([]);
      }
    } catch {
      setEmployees([]);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPaymentBadgeVariant = (status) => {
    switch (status?.toLowerCase()) {
      case 'completed':
      case 'paid':
        return 'success';
      case 'pending':
        return 'warning';
      case 'failed':
      case 'cancelled':
        return 'danger';
      default:
        return 'neutral';
    }
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      cashierId: '',
      sortBy: 'createdAt',
      sortOrder: 'DESC'
    });
    setCurrentPage(1);
  };

  const getCashierName = (sale) => {
    if (sale?.Employee) {
      return `${sale.Employee.firstName} ${sale.Employee.lastName}`;
    }
    if (sale?.User) {
      return sale.User.name || sale.User.email || 'Unknown User';
    }
    return 'Walk-in Cashier';
  };

  const filteredSalesList = (Array.isArray(sales) ? (urlCustomerId ? sales.filter(s => (s?.Customer?.id === urlCustomerId) || (s?.customerId === urlCustomerId)) : sales) : []);

  const columns = [
    {
      key: 'invoiceNumber',
      label: 'Invoice',
      render: (val) => <span className="font-semibold text-text-primary">{val}</span>
    },
    {
      key: 'Customer',
      label: 'Customer',
      render: (val, row) => (
        <span className="text-text-primary font-medium">
          {val?.name || row?.customerName || WALK_IN_CUSTOMER_NAME}
        </span>
      )
    },
    ...(isAdmin ? [{
      key: 'cashier',
      label: 'Cashier',
      render: (_, row) => <span className="text-text-secondary">{getCashierName(row)}</span>
    }] : []),
    {
      key: 'items',
      label: 'Items',
      render: (_, row) => {
        const count = row?.SaleItems ? row.SaleItems.length : row?.products ? row.products.length : 0;
        return (
          <span className="text-text-secondary text-small font-medium">{count} item(s)</span>
        );
      }
    },
    {
      key: 'total',
      label: 'Total',
      render: (val, row) => <span className="font-bold text-primary">{formatCurrency(val || row.totalAmount || 0)}</span>
    },
    {
      key: 'paymentStatus',
      label: 'Payment',
      render: (val, row) => (
        <div className="flex flex-col gap-1">
          <Badge variant={getPaymentBadgeVariant(val || row.status)}>
            {val || row.status || 'Completed'}
          </Badge>
          <span className="text-caption text-text-muted capitalize">{row?.paymentMethod || 'cash'}</span>
        </div>
      )
    },
    {
      key: 'createdAt',
      label: 'Date',
      render: (val) => <span className="text-text-secondary text-small">{formatDate(val)}</span>
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setSelectedSale(row)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="View Sale Details"
          >
            <EyeIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.print()}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
            title="Print Receipt"
          >
            <PrinterIcon className="h-4 w-4" />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={isAdmin ? 'Sales Management' : 'My Sales'}
        description={isAdmin ? 'View, filter, analyze, and manage all retail sales transactions across cashiers.' : 'View your completed sales transactions'}
        primaryAction={{
          label: 'New Sale',
          icon: PlusIcon,
          onClick: () => setShowPOSModal(true)
        }}
        secondaryActions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="md"
              leftIcon={ArrowPathIcon}
              onClick={loadSalesData}
            >
              Refresh
            </Button>
            <Button
              variant="outline"
              size="md"
              leftIcon={FunnelIcon}
              onClick={() => setShowFilters(!showFilters)}
            >
              {showFilters ? 'Hide Filters' : 'Filter Sales'}
            </Button>
          </div>
        }
      />

      {/* Filter Panel Card */}
      {showFilters && (
        <Card variant="default" className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              type="date"
              label="Start Date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
            />
            <Input
              type="date"
              label="End Date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
            />
            {isAdmin && (
              <div>
                <label className="block text-small font-semibold text-text-primary mb-1.5">Cashier</label>
                <select
                  value={filters.cashierId}
                  onChange={(e) => handleFilterChange('cashierId', e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
                >
                  <option value="">All Cashiers</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">Sort By</label>
              <select
                value={filters.sortBy}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="createdAt">Date</option>
                <option value="total">Total</option>
                <option value="invoiceNumber">Invoice</option>
              </select>
            </div>
            <div>
              <label className="block text-small font-semibold text-text-primary mb-1.5">Order</label>
              <select
                value={filters.sortOrder}
                onChange={(e) => handleFilterChange('sortOrder', e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface border border-border-default text-text-primary text-body focus:ring-2 focus:ring-primary/30"
              >
                <option value="DESC">Descending</option>
                <option value="ASC">Ascending</option>
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear All Filters
            </Button>
          </div>
        </Card>
      )}

      {/* Table */}
      <Table
        columns={columns}
        data={filteredSalesList}
        loading={loading}
        emptyTitle="No Sales Records Found"
        emptyDescription="Process transactions using the POS terminal to record sales."
        onSelectRow={(id) => {
          const sale = filteredSalesList.find(s => s.id === id);
          if (sale) setSelectedSale(sale);
        }}
        pagination={{
          currentPage,
          totalPages: pagination?.totalPages || 1,
          totalItems: pagination?.totalItems || filteredSalesList.length,
          pageSize: 10,
          onPageChange: (newPage) => setCurrentPage(newPage)
        }}
      />

      {/* Detail Modal */}
      <SaleDetailModal
        sale={selectedSale}
        isOpen={Boolean(selectedSale)}
        onClose={() => setSelectedSale(null)}
        onPrint={() => window.print()}
      />

      {/* POS Modal */}
      {showPOSModal && (
        <POSModal
          products={products}
          customers={customers}
          onClose={() => setShowPOSModal(false)}
        />
      )}
    </div>
  );
}

import { Fragment, useState, useEffect } from 'react';
import { Transition } from '@headlessui/react';
import { 
  XMarkIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  BriefcaseIcon, 
  BuildingOffice2Icon, 
  CalendarIcon, 
  CurrencyDollarIcon,
  ShoppingBagIcon,
  ClockIcon,
  StarIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import api from '../services/api';
import SaleDetailModal from './SaleDetailModal';

export default function EmployeeDetailsCard({ employee, onClose }) {
  const { format: formatCurrency } = useCurrency();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSale, setSelectedSale] = useState(null);
  const [fetchingSale, setFetchingSale] = useState(false);

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  useEffect(() => {
    if (!employee?.id) return;

    const fetchEmployeeProfile = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/employees/${employee.id}?page=${currentPage}&limit=5`);
        setProfileData(response.data);
      } catch (err) {
        console.error('Failed to load employee profile details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeProfile();
  }, [employee?.id, currentPage]);

  if (!employee) return null;

  const handleViewSale = async (saleId) => {
    setFetchingSale(true);
    try {
      const response = await api.get(`/api/sales/${saleId}`);
      setSelectedSale(response.data);
    } catch (err) {
      console.error('Failed to fetch sale details:', err);
    } finally {
      setFetchingSale(false);
    }
  };

  const emp = profileData?.employee || employee;
  const stats = profileData?.stats || {
    totalRevenue: 0,
    totalSales: 0,
    averageSaleValue: 0,
    firstSaleDate: null,
    lastSaleDate: null
  };
  const salesHistory = profileData?.salesHistory || [];
  const topProducts = profileData?.topProducts || [];
  const pagination = profileData?.pagination || { currentPage: 1, totalPages: 1, totalSales: 0 };

  const fullName = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee Profile';

  return (
    <>
      <Transition show={!!employee} as={Fragment}>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
            <Transition.Child 
              as={Fragment} 
              enter="transition-opacity duration-300" 
              enterFrom="opacity-0" 
              enterTo="opacity-100" 
              leave="transition-opacity duration-200" 
              leaveFrom="opacity-100" 
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" onClick={onClose} />
            </Transition.Child>

            <Transition.Child 
              as={Fragment} 
              enter="transform transition ease-out duration-300" 
              enterFrom="translate-y-8 opacity-0 sm:scale-95" 
              enterTo="translate-y-0 opacity-100 sm:scale-100" 
              leave="transform transition ease-in duration-200" 
              leaveFrom="translate-y-0 opacity-100 sm:scale-100" 
              leaveTo="translate-y-8 opacity-0 sm:scale-95"
            >
              <div className="relative transform overflow-hidden rounded-2xl bg-surface border border-border-default text-left shadow-modal transition-all sm:my-8 sm:w-full sm:max-w-4xl max-h-[90vh] flex flex-col">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-default bg-surface-2">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-lg">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xl font-bold text-text-primary">{fullName}</h3>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                          emp.status === 'active' 
                            ? 'bg-success-muted text-success-text border-success-border' 
                            : 'bg-danger-muted text-danger-text border-danger-border'
                        }`}>
                          {emp.status ? emp.status.toUpperCase() : 'ACTIVE'}
                        </span>
                      </div>
                      <p className="text-xs text-text-secondary">
                        {emp.position || 'Staff Member'} • Hired {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={onClose} 
                    className="p-2 rounded-lg hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors" 
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Content Container */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-text-primary">
                  {loading ? (
                    <div className="py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
                      <p className="mt-3 text-sm text-text-secondary">Loading performance data...</p>
                    </div>
                  ) : (
                    <>
                      {/* Stat Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                          <div className="flex items-center justify-between text-text-secondary text-xs mb-1">
                            <span>Total Revenue</span>
                            <CurrencyDollarIcon className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-xl font-bold text-text-primary">{formatCurrency(stats.totalRevenue)}</p>
                        </div>

                        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                          <div className="flex items-center justify-between text-text-secondary text-xs mb-1">
                            <span>Total Sales</span>
                            <ShoppingBagIcon className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-xl font-bold text-text-primary">{stats.totalSales}</p>
                        </div>

                        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                          <div className="flex items-center justify-between text-text-secondary text-xs mb-1">
                            <span>Avg Sale Value</span>
                            <DocumentTextIcon className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-xl font-bold text-text-primary">{formatCurrency(stats.averageSaleValue)}</p>
                        </div>

                        <div className="bg-surface-2 border border-border-default rounded-xl p-4">
                          <div className="flex items-center justify-between text-text-secondary text-xs mb-1">
                            <span>Last Active</span>
                            <ClockIcon className="h-4 w-4 text-primary" />
                          </div>
                          <p className="text-sm font-semibold text-text-primary mt-1">
                            {stats.lastSaleDate ? new Date(stats.lastSaleDate).toLocaleDateString() : 'No sales yet'}
                          </p>
                        </div>
                      </div>

                      {/* Contact & Employment Info */}
                      <div className="bg-surface-2 border border-border-default rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center space-x-3">
                          <EnvelopeIcon className="h-5 w-5 text-primary flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-xs text-text-secondary">Email</p>
                            <p className="text-text-primary truncate">{emp.email || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <PhoneIcon className="h-5 w-5 text-primary flex-shrink-0" />
                          <div>
                            <p className="text-xs text-text-secondary">Phone</p>
                            <p className="text-text-primary">{emp.phone || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <CurrencyDollarIcon className="h-5 w-5 text-primary flex-shrink-0" />
                          <div>
                            <p className="text-xs text-text-secondary">Salary</p>
                            <p className="text-text-primary">{emp.salary ? formatCurrency(Number(emp.salary)) : 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Top Products Sold Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                            <StarIcon className="h-4 w-4" />
                            Top Products Sold
                          </h4>
                          <span className="text-xs text-text-secondary">{topProducts.length} items</span>
                        </div>

                        {topProducts.length === 0 ? (
                          <div className="bg-surface-2 border border-border-default rounded-xl p-4 text-center text-xs text-text-secondary">
                            No product sales history recorded for this employee yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {topProducts.map((prod, idx) => (
                              <div key={prod.productId || idx} className="bg-surface-2 border border-border-default rounded-lg p-3 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-semibold text-text-primary truncate max-w-[140px]">{prod.name}</p>
                                  <p className="text-text-secondary mt-0.5">{prod.timesSold} sales • {prod.totalQuantity} units</p>
                                </div>
                                <span className="font-bold text-primary">{formatCurrency(prod.totalRevenue)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Sales Order History */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-primary flex items-center gap-1.5">
                            <ShoppingBagIcon className="h-4 w-4" />
                            Sales History
                          </h4>
                          <span className="text-xs text-text-secondary">Total {pagination.totalSales} sales</span>
                        </div>

                        {salesHistory.length === 0 ? (
                          <div className="bg-surface-2 border border-border-default rounded-xl p-8 text-center text-xs text-text-secondary">
                            <ShoppingBagIcon className="h-8 w-8 mx-auto mb-2 text-text-muted" />
                            No sales processed by this employee yet.
                          </div>
                        ) : (
                          <div className="bg-surface-2 border border-border-default rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-surface-3 text-text-secondary border-b border-border-default">
                                <tr>
                                  <th className="px-4 py-2.5">Invoice</th>
                                  <th className="px-4 py-2.5">Date</th>
                                  <th className="px-4 py-2.5">Items</th>
                                  <th className="px-4 py-2.5">Payment</th>
                                  <th className="px-4 py-2.5">Total</th>
                                  <th className="px-4 py-2.5 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border-default">
                                {salesHistory.map((sale) => (
                                  <tr key={sale.id} className="hover:bg-surface-3 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-text-primary">{sale.invoiceNumber}</td>
                                    <td className="px-4 py-2.5 text-text-secondary">
                                      {new Date(sale.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-2.5 text-text-secondary">{sale.itemCount} items</td>
                                    <td className="px-4 py-2.5 capitalize text-text-secondary">{sale.paymentMethod}</td>
                                    <td className="px-4 py-2.5 font-bold text-primary">{formatCurrency(sale.total)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      <button 
                                        onClick={() => handleViewSale(sale.id)}
                                        disabled={fetchingSale}
                                        className="text-xs text-primary hover:underline"
                                      >
                                        View Details
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {/* Pagination Controls */}
                            {pagination.totalPages > 1 && (
                              <div className="flex items-center justify-between px-4 py-2.5 bg-surface-2 border-t border-border-default text-xs text-text-secondary">
                                <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded border border-border-input hover:bg-surface-3 disabled:opacity-50"
                                  >
                                    <ChevronLeftIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                                    disabled={currentPage === pagination.totalPages}
                                    className="p-1 rounded border border-border-input hover:bg-surface-3 disabled:opacity-50"
                                  >
                                    <ChevronRightIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-border-default bg-surface-2 flex justify-end">
                  <button 
                    onClick={onClose} 
                    className="px-4 py-2 rounded-lg border border-border-input text-text-primary hover:bg-surface-2 text-sm font-medium transition-colors"
                  >
                    Close Profile
                  </button>
                </div>

              </div>
            </Transition.Child>
          </div>
        </div>
      </Transition>

      {/* Embedded Sale Detail Modal */}
      {selectedSale && (
        <SaleDetailModal 
          sale={selectedSale} 
          onClose={() => setSelectedSale(null)} 
        />
      )}
    </>
  );
}

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
              <div className="relative transform overflow-hidden rounded-2xl bg-brand-black border border-yellow-500/30 text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-4xl max-h-[90vh] flex flex-col">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-yellow-500/20 bg-black/50">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-full bg-brand-yellow/10 border border-brand-yellow/30 flex items-center justify-center text-brand-yellow font-bold text-lg">
                      {fullName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="text-xl font-bold text-brand-yellow">{fullName}</h3>
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
                          emp.status === 'active' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                            : 'bg-red-500/10 text-red-400 border-red-500/30'
                        }`}>
                          {emp.status ? emp.status.toUpperCase() : 'ACTIVE'}
                        </span>
                      </div>
                      <p className="text-xs text-yellow-200/70">
                        {emp.position || 'Staff Member'} • Hired {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={onClose} 
                    className="p-2 rounded-lg hover:bg-yellow-500/10 text-yellow-300 transition-colors" 
                    aria-label="Close"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Content Container */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-gray-100">
                  {loading ? (
                    <div className="py-12 text-center">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-brand-yellow border-t-transparent"></div>
                      <p className="mt-3 text-sm text-yellow-200/70">Loading performance data...</p>
                    </div>
                  ) : (
                    <>
                      {/* Stat Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-black/40 border border-yellow-500/20 rounded-xl p-4">
                          <div className="flex items-center justify-between text-yellow-200/70 text-xs mb-1">
                            <span>Total Revenue</span>
                            <CurrencyDollarIcon className="h-4 w-4 text-brand-yellow" />
                          </div>
                          <p className="text-xl font-bold text-brand-yellow">{formatCurrency(stats.totalRevenue)}</p>
                        </div>

                        <div className="bg-black/40 border border-yellow-500/20 rounded-xl p-4">
                          <div className="flex items-center justify-between text-yellow-200/70 text-xs mb-1">
                            <span>Total Sales</span>
                            <ShoppingBagIcon className="h-4 w-4 text-brand-yellow" />
                          </div>
                          <p className="text-xl font-bold text-white">{stats.totalSales}</p>
                        </div>

                        <div className="bg-black/40 border border-yellow-500/20 rounded-xl p-4">
                          <div className="flex items-center justify-between text-yellow-200/70 text-xs mb-1">
                            <span>Avg Sale Value</span>
                            <DocumentTextIcon className="h-4 w-4 text-brand-yellow" />
                          </div>
                          <p className="text-xl font-bold text-white">{formatCurrency(stats.averageSaleValue)}</p>
                        </div>

                        <div className="bg-black/40 border border-yellow-500/20 rounded-xl p-4">
                          <div className="flex items-center justify-between text-yellow-200/70 text-xs mb-1">
                            <span>Last Active</span>
                            <ClockIcon className="h-4 w-4 text-brand-yellow" />
                          </div>
                          <p className="text-sm font-semibold text-white mt-1">
                            {stats.lastSaleDate ? new Date(stats.lastSaleDate).toLocaleDateString() : 'No sales yet'}
                          </p>
                        </div>
                      </div>

                      {/* Contact & Employment Info */}
                      <div className="bg-black/40 border border-yellow-500/20 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="flex items-center space-x-3">
                          <EnvelopeIcon className="h-5 w-5 text-brand-yellow flex-shrink-0" />
                          <div className="truncate">
                            <p className="text-xs text-yellow-200/60">Email</p>
                            <p className="text-gray-200 truncate">{emp.email || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <PhoneIcon className="h-5 w-5 text-brand-yellow flex-shrink-0" />
                          <div>
                            <p className="text-xs text-yellow-200/60">Phone</p>
                            <p className="text-gray-200">{emp.phone || 'N/A'}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-3">
                          <CurrencyDollarIcon className="h-5 w-5 text-brand-yellow flex-shrink-0" />
                          <div>
                            <p className="text-xs text-yellow-200/60">Salary</p>
                            <p className="text-gray-200">{emp.salary ? formatCurrency(Number(emp.salary)) : 'N/A'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Top Products Sold Section */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-brand-yellow flex items-center gap-1.5">
                            <StarIcon className="h-4 w-4" />
                            Top Products Sold
                          </h4>
                          <span className="text-xs text-yellow-200/60">{topProducts.length} items</span>
                        </div>

                        {topProducts.length === 0 ? (
                          <div className="bg-black/20 border border-yellow-500/10 rounded-xl p-4 text-center text-xs text-yellow-200/60">
                            No product sales history recorded for this employee yet.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {topProducts.map((prod, idx) => (
                              <div key={prod.productId || idx} className="bg-black/30 border border-yellow-500/20 rounded-lg p-3 text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-semibold text-white truncate max-w-[140px]">{prod.name}</p>
                                  <p className="text-yellow-200/60 mt-0.5">{prod.timesSold} sales • {prod.totalQuantity} units</p>
                                </div>
                                <span className="font-bold text-brand-yellow">{formatCurrency(prod.totalRevenue)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Sales Order History */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-brand-yellow flex items-center gap-1.5">
                            <ShoppingBagIcon className="h-4 w-4" />
                            Sales History
                          </h4>
                          <span className="text-xs text-yellow-200/60">Total {pagination.totalSales} sales</span>
                        </div>

                        {salesHistory.length === 0 ? (
                          <div className="bg-black/20 border border-yellow-500/10 rounded-xl p-8 text-center text-xs text-yellow-200/60">
                            <ShoppingBagIcon className="h-8 w-8 mx-auto mb-2 text-yellow-500/40" />
                            No sales processed by this employee yet.
                          </div>
                        ) : (
                          <div className="bg-black/30 border border-yellow-500/20 rounded-xl overflow-hidden">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-black/50 text-yellow-200/70 border-b border-yellow-500/20">
                                <tr>
                                  <th className="px-4 py-2.5">Invoice</th>
                                  <th className="px-4 py-2.5">Date</th>
                                  <th className="px-4 py-2.5">Items</th>
                                  <th className="px-4 py-2.5">Payment</th>
                                  <th className="px-4 py-2.5">Total</th>
                                  <th className="px-4 py-2.5 text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-yellow-500/10">
                                {salesHistory.map((sale) => (
                                  <tr key={sale.id} className="hover:bg-yellow-500/5 transition-colors">
                                    <td className="px-4 py-2.5 font-medium text-white">{sale.invoiceNumber}</td>
                                    <td className="px-4 py-2.5 text-yellow-200/70">
                                      {new Date(sale.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-300">{sale.itemCount} items</td>
                                    <td className="px-4 py-2.5 capitalize text-gray-300">{sale.paymentMethod}</td>
                                    <td className="px-4 py-2.5 font-bold text-brand-yellow">{formatCurrency(sale.total)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                      <button 
                                        onClick={() => handleViewSale(sale.id)}
                                        disabled={fetchingSale}
                                        className="text-xs text-brand-yellow hover:underline"
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
                              <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 border-t border-yellow-500/20 text-xs text-yellow-200/70">
                                <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
                                <div className="flex space-x-2">
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="p-1 rounded border border-yellow-500/30 hover:bg-yellow-500/10 disabled:opacity-50"
                                  >
                                    <ChevronLeftIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                                    disabled={currentPage === pagination.totalPages}
                                    className="p-1 rounded border border-yellow-500/30 hover:bg-yellow-500/10 disabled:opacity-50"
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
                <div className="px-6 py-4 border-t border-yellow-500/20 bg-black/50 flex justify-end">
                  <button 
                    onClick={onClose} 
                    className="px-4 py-2 rounded-lg border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10 text-sm font-medium transition-colors"
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

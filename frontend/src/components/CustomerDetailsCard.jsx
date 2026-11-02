import { Fragment, useState, useEffect } from 'react';
import { Transition } from '@headlessui/react';
import { 
  XMarkIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  MapPinIcon, 
  CurrencyDollarIcon, 
  ClockIcon,
  ShoppingBagIcon,
  StarIcon,
  DocumentTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import SaleDetailModal from './SaleDetailModal';

export default function CustomerDetailsCard({ customer, onClose }) {
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();

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
    if (!customer?.id) return;

    const fetchCustomerProfile = async () => {
      setLoading(true);
      try {
        const response = await api.get(`/api/customers/${customer.id}?page=${currentPage}&limit=5`);
        setProfileData(response.data);
      } catch (err) {
        console.error('Failed to load customer profile details:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerProfile();
  }, [customer?.id, currentPage]);

  if (!customer) return null;

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

  const activeCustomer = profileData?.customer || customer;
  const stats = profileData?.stats || {
    totalSpend: activeCustomer.totalPurchases || 0,
    totalOrders: 0,
    averageOrderValue: 0,
    firstOrderDate: null,
    lastOrderDate: activeCustomer.lastVisit
  };
  const orderHistory = profileData?.orderHistory || [];
  const pagination = profileData?.pagination || { currentPage: 1, totalPages: 1, totalOrders: 0 };
  const favorites = profileData?.favorites || [];

  return (
    <>
      <Transition show={!!customer} as={Fragment}>
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <Transition.Child
            as={Fragment}
            enter="transition-opacity duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition-opacity duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
          </Transition.Child>

          {/* Slide-in / Centered Card */}
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="transform transition ease-out duration-300"
              enterFrom="translate-y-8 opacity-0 scale-95"
              enterTo="translate-y-0 opacity-100 scale-100"
              leave="transform transition ease-in duration-200"
              leaveFrom="translate-y-0 opacity-100 scale-100"
              leaveTo="translate-y-8 opacity-0 scale-95"
            >
              <div className="relative w-full max-w-4xl bg-surface border border-border-default rounded-2xl shadow-modal overflow-hidden my-8">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border-default bg-surface-2">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary font-bold text-xl">
                      {activeCustomer.name ? activeCustomer.name.charAt(0).toUpperCase() : 'C'}
                    </div>
                    <div>
                      <div className="flex items-center space-x-3">
                        <h3 className="text-2xl font-bold text-text-primary">{activeCustomer.name}</h3>
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary text-text-primary dark:text-surface">
                          {activeCustomer.loyaltyPoints || 0} pts
                        </span>
                      </div>
                      <p className="text-text-secondary text-xs mt-0.5">
                        Customer since {activeCustomer.createdAt ? new Date(activeCustomer.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-3 text-text-secondary hover:text-text-primary transition-colors">
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>

                {/* Body Content */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto custom-scrollbar">
                  {/* Top Analytics Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-surface-2 border border-border-default rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-text-secondary text-xs font-medium">
                        <span>Total Spend</span>
                        <CurrencyDollarIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-xl font-bold text-primary mt-2">
                        {formatCurrency(stats.totalSpend)}
                      </div>
                    </div>

                    <div className="bg-surface-2 border border-border-default rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-text-secondary text-xs font-medium">
                        <span>Total Orders</span>
                        <ShoppingBagIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-xl font-bold text-text-primary mt-2">
                        {stats.totalOrders}
                      </div>
                    </div>

                    <div className="bg-surface-2 border border-border-default rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-text-secondary text-xs font-medium">
                        <span>Avg Order Value</span>
                        <CurrencyDollarIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-xl font-bold text-text-primary mt-2">
                        {formatCurrency(stats.averageOrderValue)}
                      </div>
                    </div>

                    <div className="bg-surface-2 border border-border-default rounded-xl p-4 flex flex-col justify-between">
                      <div className="flex items-center justify-between text-text-secondary text-xs font-medium">
                        <span>Last Visit</span>
                        <ClockIcon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="text-sm font-semibold text-text-primary mt-2">
                        {stats.lastOrderDate ? new Date(stats.lastOrderDate).toLocaleDateString() : 'Never'}
                      </div>
                    </div>
                  </div>

                  {/* Contact Info Bar */}
                  <div className="bg-surface-2 border border-border-default rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center space-x-2 text-text-primary">
                      <EnvelopeIcon className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="truncate">{activeCustomer.email || 'No email registered'}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-text-primary">
                      <PhoneIcon className="h-4 w-4 text-primary flex-shrink-0" />
                      <span>{activeCustomer.phone || 'No phone number'}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-text-primary">
                      <MapPinIcon className="h-4 w-4 text-primary flex-shrink-0" />
                      <span className="truncate">{activeCustomer.address || activeCustomer.location || 'No location set'}</span>
                    </div>
                  </div>

                  {/* Frequently Purchased / Favorites */}
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <StarIcon className="h-5 w-5 text-primary" />
                      <h4 className="text-lg font-semibold text-text-primary">Top Frequently Bought Items</h4>
                    </div>

                    {loading ? (
                      <div className="py-6 text-center text-text-secondary text-sm">Loading favorites...</div>
                    ) : favorites.length === 0 ? (
                      <div className="bg-surface-2 border border-border-default rounded-xl p-4 text-center text-text-secondary text-xs">
                        No purchase history yet to determine frequent items.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {favorites.map((fav) => (
                          <div key={fav.productId} className="bg-surface-2 border border-border-default rounded-xl p-3 space-y-1.5 hover:border-border-hover transition-colors">
                            <div className="font-semibold text-text-primary text-sm truncate" title={fav.name}>{fav.name}</div>
                            <div className="flex items-center justify-between text-xs text-text-secondary">
                              <span>Price: <strong className="text-text-primary">{formatCurrency(fav.price)}</strong></span>
                              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{fav.timesPurchased} {fav.timesPurchased === 1 ? 'order' : 'orders'}</span>
                            </div>
                            <div className="text-[11px] text-text-secondary pt-1 border-t border-border-default">
                              Total Qty: {fav.totalQuantity} • Last: {fav.lastPurchasedAt ? new Date(fav.lastPurchasedAt).toLocaleDateString() : 'N/A'}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Order History */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DocumentTextIcon className="h-5 w-5 text-primary" />
                        <h4 className="text-lg font-semibold text-text-primary">Order History</h4>
                      </div>
                      {pagination.totalPages > 1 && (
                        <div className="flex items-center space-x-2 text-xs text-text-secondary">
                          <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
                          <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                            className="p-1 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-30"
                          >
                            <ChevronLeftIcon className="h-4 w-4" />
                          </button>
                          <button
                            disabled={currentPage === pagination.totalPages}
                            onClick={() => setCurrentPage(p => Math.min(p + 1, pagination.totalPages))}
                            className="p-1 rounded bg-surface-2 hover:bg-surface-3 disabled:opacity-30"
                          >
                            <ChevronRightIcon className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {loading ? (
                      <div className="py-8 text-center text-text-secondary text-sm">Loading order history...</div>
                    ) : orderHistory.length === 0 ? (
                      <div className="bg-surface-2 border border-border-default rounded-xl p-8 text-center space-y-2">
                        <ShoppingBagIcon className="h-8 w-8 text-text-muted mx-auto" />
                        <p className="text-text-primary font-medium text-sm">No orders yet</p>
                        <p className="text-text-secondary text-xs">This customer has not placed any orders.</p>
                      </div>
                    ) : (
                      <div className="border border-border-default rounded-xl overflow-hidden bg-surface">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs text-text-primary">
                            <thead className="bg-surface-2 text-text-secondary uppercase font-semibold border-b border-border-default">
                              <tr>
                                <th className="px-4 py-3">Date</th>
                                <th className="px-4 py-3">Invoice #</th>
                                <th className="px-4 py-3">Items</th>
                                <th className="px-4 py-3">Payment</th>
                                <th className="px-4 py-3">Total</th>
                                <th className="px-4 py-3 text-right">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-default">
                              {orderHistory.map((order) => (
                                <tr key={order.id} className="hover:bg-surface-2 transition-colors">
                                  <td className="px-4 py-3 font-medium text-text-primary">
                                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                                  </td>
                                  <td className="px-4 py-3 text-primary font-mono font-semibold">
                                    {order.invoiceNumber || `#${order.id}`}
                                  </td>
                                  <td className="px-4 py-3">{order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}</td>
                                  <td className="px-4 py-3 capitalize">{order.paymentMethod || 'cash'}</td>
                                  <td className="px-4 py-3 font-bold text-text-primary">
                                    {formatCurrency(order.total)}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <button
                                      disabled={fetchingSale}
                                      onClick={() => handleViewSale(order.id)}
                                      className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-xs transition-colors"
                                    >
                                      View Sale
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="px-6 py-4 border-t border-border-default bg-surface-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-text-secondary">
                    ID: <span className="font-mono text-text-primary">{activeCustomer.id}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button 
                      onClick={() => {
                        onClose();
                        navigate(`/pos?customerId=${encodeURIComponent(activeCustomer.id)}`);
                      }} 
                      className="px-4 py-2 rounded-xl bg-primary text-text-primary dark:text-surface font-semibold text-sm hover:bg-primary-hover transition-colors"
                    >
                      New Sale
                    </button>
                    <button 
                      onClick={onClose} 
                      className="px-4 py-2 rounded-xl border border-border-input text-text-primary text-sm hover:bg-surface-2 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            </Transition.Child>
          </div>
        </div>
      </Transition>

      {/* Embedded SaleDetailModal for viewing order details */}
      {selectedSale && (
        <SaleDetailModal
          sale={selectedSale}
          isOpen={!!selectedSale}
          onClose={() => setSelectedSale(null)}
        />
      )}
    </>
  );
}

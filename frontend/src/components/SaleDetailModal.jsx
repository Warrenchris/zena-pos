import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
  ClockIcon,
  UserIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  TagIcon,
  BuildingStorefrontIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import { format } from 'date-fns';

const SaleDetailModal = ({ sale, isOpen, onClose, onPrint, shopName, shop }) => {
  const { format: formatCurrency } = useCurrency();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !sale) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handlePrint = () => {
    if (onPrint) {
      onPrint(sale);
    }
  };

  const getStatusBadgeColor = (status) => {
    const statusUpper = (status || '').toUpperCase();
    if (statusUpper === 'COMPLETED' || statusUpper === 'PAID') {
      return 'bg-green-100 text-green-800 border-green-200';
    } else if (statusUpper === 'PENDING') {
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    } else if (statusUpper === 'FAILED' || statusUpper === 'CANCELLED') {
      return 'bg-red-100 text-red-800 border-red-200';
    }
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getPaymentMethodColor = (method) => {
    const methodUpper = (method || '').toUpperCase();
    if (methodUpper === 'CASH') {
      return 'bg-green-50 text-green-700 border-green-200';
    } else if (methodUpper.includes('M-PESA') || methodUpper.includes('MPESA')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    } else if (methodUpper === 'CARD') {
      return 'bg-purple-50 text-purple-700 border-purple-200';
    }
    return 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const customer = sale.Customer || sale.customer || null;
  const employee = sale.Employee || sale.employee || null;

  // Try to get items from multiple possible sources and ensure it's an array
  let saleItems = Array.isArray(sale.SaleItems) ? sale.SaleItems :
    Array.isArray(sale.items) ? sale.items : [];

  // If no SaleItems, try to use normalized 'products' array
  if (saleItems.length === 0 && Array.isArray(sale.products) && sale.products.length > 0) {
    saleItems = sale.products.map(p => ({
      id: p.id,
      quantity: p.quantity,
      price: p.priceAtSale,
      unitPrice: p.priceAtSale,
      priceAtSale: p.priceAtSale,
      Product: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        price: p.priceAtSale
      }
    }));
  }

  const totalDiscount = parseFloat(sale.discount || 0);
  const tax = parseFloat(sale.tax || 0);
  const subtotal = parseFloat(sale.subtotal || sale.totalAmount || 0);
  const total = parseFloat(sale.total || sale.totalAmount || 0);

  // Debug logging (remove in production)
  console.log('Sale Detail Modal - Sale Data:', {
    sale,
    customer,
    employee,
    saleItemsCount: saleItems.length,
    saleItems,
    paymentAmount: sale.paymentAmount,
    total: sale.total,
    subtotal: subtotal
  });

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity animate-fadeIn" />

      {/* Modal Container */}
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-white dark:bg-brand-gray rounded-2xl shadow-2xl max-w-4xl w-full animate-slideUp relative overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-yellow to-yellow-500 px-6 py-4 flex items-center justify-between border-b border-brand-yellow/20">
            <div className="flex items-center space-x-3">
              <div className="bg-white p-2 rounded-lg">
                <ShoppingCartIcon className="h-6 w-6 text-brand-yellow" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Sale #{sale.invoiceNumber || sale.id}
                </h2>
                <p className="text-sm text-gray-700">
                  {format(new Date(sale.createdAt), 'MMM dd, yyyy • hh:mm a')}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePrint}
                className="p-2 rounded-lg bg-white/80 hover:bg-white transition-colors text-gray-700 hover:text-brand-yellow"
                title="Print Receipt"
              >
                <PrinterIcon className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/80 hover:bg-white transition-colors text-gray-700 hover:text-red-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Error State */}
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700">{error}</p>
              </div>
            )}

            {/* Main Content */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column - Sale Info */}
              <div className="space-y-4">
                {/* Status Badge */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Sale Status</p>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeColor(sale.saleStatus || sale.status)}`}>
                      {sale.saleStatus || sale.status || 'COMPLETED'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 mb-1">Payment Method</p>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getPaymentMethodColor(sale.paymentMethod)}`}>
                      {sale.paymentMethod || 'CASH'}
                    </span>
                  </div>
                </div>

                {/* Shop Info */}
                {(shopName || shop?.name) && (
                  <div className="p-4 bg-brand-yellow/10 border border-brand-yellow/20 rounded-lg space-y-2">
                    <div className="flex items-center space-x-2">
                      <BuildingStorefrontIcon className="h-5 w-5 text-brand-yellow" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500">Shop</p>
                        <p className="font-medium text-gray-900">{shop?.name || shopName}</p>
                        {shop?.address && (
                          <p className="text-xs text-gray-600 mt-1">{shop.address}</p>
                        )}
                        {shop?.phone && (
                          <p className="text-xs text-gray-600">Tel: {shop.phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Cashier */}
                {(employee || sale.employeeId) && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Cashier</p>
                        <p className="font-medium text-gray-900">
                          {employee
                            ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim()
                            : sale.employeeId || 'Unknown'
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Customer */}
                {customer && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <UserIcon className="h-5 w-5 text-gray-500" />
                      <div>
                        <p className="text-sm text-gray-500">Customer</p>
                        <p className="font-medium text-gray-900">
                          {customer.name || 'Walk-in Customer'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Payment Info */}
              <div className="space-y-4">
                {/* Payment Details */}
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <h3 className="font-semibold text-gray-900 flex items-center">
                    <CurrencyDollarIcon className="h-5 w-5 mr-2 text-brand-yellow" />
                    Payment Details
                  </h3>

                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Amount Paid</span>
                    <span className="font-medium">{formatCurrency(total)}</span>
                  </div>

                  {sale.paymentAmount && parseFloat(sale.paymentAmount) !== total && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Received</span>
                      <span className="font-medium">{formatCurrency(parseFloat(sale.paymentAmount))}</span>
                    </div>
                  )}

                  {sale.change && parseFloat(sale.change) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-500">Change</span>
                      <span className="font-medium text-green-600">{formatCurrency(parseFloat(sale.change))}</span>
                    </div>
                  )}

                  {sale.paymentReference && (
                    <div>
                      <span className="text-sm text-gray-500">Reference</span>
                      <p className="font-mono text-sm">{sale.paymentReference}</p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {sale.notes && (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm font-medium text-yellow-900 mb-1">Notes</p>
                    <p className="text-sm text-yellow-800">{sale.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Products List */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <ShoppingCartIcon className="h-5 w-5 mr-2 text-brand-yellow" />
                Products ({saleItems.length})
              </h3>

              {saleItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No items found for this sale</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Product
                        </th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Unit Price
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {saleItems.map((item, index) => {
                        const product = item.Product || item.product || null;
                        const productName = product?.name || item.name || 'Unknown Product';
                        const productSku = product?.sku || item.sku;
                        const unitPrice = parseFloat(item.price || item.unitPrice || item.priceAtSale || product?.price || 0);
                        const quantity = parseInt(item.quantity || 0);
                        const subtotal = unitPrice * quantity;

                        return (
                          <tr key={item.id || index} className="hover:bg-gray-50">
                            <td className="px-4 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                {product?.imageUrl && (
                                  <img
                                    src={product.imageUrl}
                                    alt={productName}
                                    className="h-10 w-10 rounded-md mr-3 object-cover"
                                  />
                                )}
                                <div>
                                  <p className="text-sm font-medium text-gray-900">
                                    {productName}
                                  </p>
                                  {productSku && (
                                    <p className="text-xs text-gray-500">SKU: {productSku}</p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span className="px-3 py-1 bg-brand-yellow/20 text-brand-yellow rounded-full text-sm font-medium">
                                {quantity}
                              </span>
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                              {formatCurrency(unitPrice)}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                              {formatCurrency(subtotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="mt-6 border-t pt-4 space-y-2">
              {subtotal > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Subtotal</span>
                  <span className="font-medium">{formatCurrency(subtotal)}</span>
                </div>
              )}

              {totalDiscount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span className="flex items-center">
                    <TagIcon className="h-4 w-4 mr-1" />
                    Discount
                  </span>
                  <span className="font-medium">-{formatCurrency(totalDiscount)}</span>
                </div>
              )}

              {tax > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Tax</span>
                  <span className="font-medium">{formatCurrency(tax)}</span>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-lg font-bold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-brand-yellow">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-gray-50 dark:bg-brand-black border-t flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-brand-yellow text-gray-900 rounded-lg hover:bg-yellow-500 transition-colors font-medium flex items-center"
            >
              <PrinterIcon className="h-5 w-5 mr-2" />
              Print Receipt
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SaleDetailModal;


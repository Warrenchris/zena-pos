import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  PrinterIcon,
  ShoppingCartIcon,
  CurrencyDollarIcon,
  TagIcon,
  BuildingStorefrontIcon,
  UserIcon,
  ArrowUturnLeftIcon
} from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';
import { format } from 'date-fns';
import { usePermissions } from '../hooks/usePermissions';
import api from '../services/api';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Badge from './ui/Badge';

const SaleDetailModal = ({ sale, isOpen, onClose, onPrint, shopName, shop }) => {
  const { format: formatCurrency } = useCurrency();
  const { hasPermission } = usePermissions();

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [previousRefunds, setPreviousRefunds] = useState([]);
  const [refundQuantities, setRefundQuantities] = useState({});
  const [refundReasons, setRefundReasons] = useState({});
  const [isSubmittingRefund, setIsSubmittingRefund] = useState(false);

  const fetchRefunds = async () => {
    if (!sale || !sale.id) return;
    try {
      const response = await api.get(`/api/sales/${sale.id}/refunds`);
      setPreviousRefunds(response.data || []);
    } catch {
      setPreviousRefunds([]);
    }
  };

  useEffect(() => {
    if (isOpen && sale && sale.id) {
      fetchRefunds();
    } else {
      setPreviousRefunds([]);
    }
  }, [isOpen, sale]);

  if (!isOpen || !sale) return null;

  const handlePrint = () => {
    if (onPrint) {
      onPrint(sale);
    }
  };

  const customerName = sale.Customer?.name || sale.customer?.name || sale.customerName || WALK_IN_CUSTOMER_NAME;
  const employee = sale.Employee || sale.employee || null;
  const user = sale.User || sale.user || null;

  let saleItems = Array.isArray(sale.SaleItems) ? sale.SaleItems :
    Array.isArray(sale.items) ? sale.items : [];

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

  const calculateTotalRefund = () => {
    return saleItems.reduce((sum, item) => {
      const productId = item.productId || item.id || (item.Product && item.Product.id);
      const qty = refundQuantities[productId] || 0;
      const unitPrice = parseFloat(item.price || item.unitPrice || item.priceAtSale || 0);
      return sum + (qty * unitPrice);
    }, 0);
  };

  const handleConfirmRefund = async () => {
    const refundItems = Object.keys(refundQuantities)
      .map(productId => ({
        productId,
        quantity: refundQuantities[productId],
        reason: refundReasons[productId] || 'Customer Return'
      }))
      .filter(item => item.quantity > 0);

    if (refundItems.length === 0) return;

    setIsSubmittingRefund(true);
    try {
      const response = await api.post(`/api/sales/${sale.id}/refund`, {
        items: refundItems
      });
      
      sale.status = response.data.saleStatus.toUpperCase();
      setShowRefundModal(false);
      setRefundQuantities({});
      setRefundReasons({});
      fetchRefunds();
      if (onClose) onClose();
      window.location.reload();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit refund.');
    } finally {
      setIsSubmittingRefund(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Sale #${sale.invoiceNumber || sale.id}`}
      description={sale.createdAt ? format(new Date(sale.createdAt), 'MMM dd, yyyy • hh:mm a') : ''}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Sale Info */}
          <div className="p-4 rounded-xl border border-border-default bg-surface-2/30 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">Status</span>
              <Badge variant={sale.status?.toUpperCase() === 'COMPLETED' ? 'success' : 'warning'}>
                {sale.saleStatus || sale.status || 'COMPLETED'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-caption font-semibold uppercase tracking-wider text-text-muted">Payment Method</span>
              <span className="text-small font-semibold text-text-primary capitalize">{sale.paymentMethod || 'CASH'}</span>
            </div>
            {(shopName || shop?.name) && (
              <div className="pt-2 border-t border-border-default">
                <p className="text-caption text-text-muted">Shop Location</p>
                <p className="text-small font-semibold text-text-primary">{shop?.name || shopName}</p>
              </div>
            )}
            {(employee || user) && (
              <div className="pt-2 border-t border-border-default">
                <p className="text-caption text-text-muted">Cashier</p>
                <p className="text-small font-semibold text-text-primary">
                  {employee ? `${employee.firstName || ''} ${employee.lastName || ''}`.trim() : user?.name || 'Staff'}
                </p>
              </div>
            )}
            <div className="pt-2 border-t border-border-default">
              <p className="text-caption text-text-muted">Customer</p>
              <p className="text-small font-semibold text-text-primary">{customerName}</p>
            </div>
          </div>

          {/* Payment Info */}
          <div className="p-4 rounded-xl border border-border-default bg-surface-2/30 space-y-2 text-small">
            <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-2">Payment Summary</h4>
            <div className="flex justify-between text-text-secondary">
              <span>Amount Paid</span>
              <span className="font-semibold text-text-primary">{formatCurrency(total)}</span>
            </div>
            {sale.paymentAmount && parseFloat(sale.paymentAmount) !== total && (
              <div className="flex justify-between text-text-secondary">
                <span>Received</span>
                <span>{formatCurrency(parseFloat(sale.paymentAmount))}</span>
              </div>
            )}
            {sale.change && parseFloat(sale.change) > 0 && (
              <div className="flex justify-between text-success">
                <span>Change Returned</span>
                <span className="font-semibold">{formatCurrency(parseFloat(sale.change))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Products Table */}
        <div>
          <h4 className="text-caption font-semibold uppercase tracking-wider text-text-muted mb-3">
            Itemized Products ({saleItems.length})
          </h4>
          <div className="border border-border-default rounded-xl overflow-hidden bg-surface-0">
            <table className="w-full text-left text-small">
              <thead className="bg-surface-2/60 text-text-secondary text-caption font-semibold uppercase tracking-wider border-b border-border-default">
                <tr>
                  <th className="p-3">Product</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Price</th>
                  <th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default">
                {saleItems.map((item, index) => {
                  const product = item.Product || item.product || null;
                  const productName = product?.name || item.name || 'Product';
                  const unitPrice = parseFloat(item.price || item.unitPrice || item.priceAtSale || 0);
                  const quantity = parseInt(item.quantity || 0);
                  return (
                    <tr key={index} className="hover:bg-surface-2/40 transition-colors">
                      <td className="p-3 font-semibold text-text-primary">{productName}</td>
                      <td className="p-3 text-center text-text-secondary">{quantity}</td>
                      <td className="p-3 text-right text-text-secondary">{formatCurrency(unitPrice)}</td>
                      <td className="p-3 text-right font-bold text-primary">{formatCurrency(unitPrice * quantity)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Totals Summary */}
        <div className="p-4 rounded-xl bg-surface-2/50 border border-border-default space-y-2 text-small">
          {subtotal > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          )}
          {totalDiscount > 0 && (
            <div className="flex justify-between text-danger font-medium">
              <span>Discount</span>
              <span>-{formatCurrency(totalDiscount)}</span>
            </div>
          )}
          {tax > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Tax</span>
              <span>{formatCurrency(tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-body font-bold text-text-primary pt-2 border-t border-border-default">
            <span>Grand Total</span>
            <span className="text-primary">{formatCurrency(total)}</span>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-3 justify-end pt-4 border-t border-border-default">
          {hasPermission('process_refunds') && sale.status?.toUpperCase() !== 'REFUNDED' && (
            <Button variant="danger" size="md" leftIcon={ArrowUturnLeftIcon} onClick={() => setShowRefundModal(true)}>
              Process Refund
            </Button>
          )}
          <Button variant="outline" size="md" leftIcon={PrinterIcon} onClick={handlePrint}>
            Print Receipt
          </Button>
          <Button variant="primary" size="md" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SaleDetailModal;

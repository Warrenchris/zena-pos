import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { XMarkIcon, ArrowPathIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { updateStock } from '../store/slices/productsSlice';
import { useToast } from './Toast';

export default function StockModal({ product, onClose }) {
  const dispatch = useDispatch();
  const [quantity, setQuantity] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { showToast } = useToast();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const parsedQty = parseInt(quantity, 10);
    if (!quantity || isNaN(parsedQty) || parsedQty === 0) {
      setError('Please enter a valid non-zero quantity change');
      showToast({
        type: 'error',
        title: 'Invalid Quantity',
        message: 'Please enter a valid positive or negative quantity value'
      });
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      await dispatch(updateStock({ id: product.id, quantity: parsedQty })).unwrap();
      const action = parsedQty > 0 ? 'added to' : 'removed from';
      showToast({
        type: 'success',
        title: 'Stock Updated',
        message: `${Math.abs(parsedQty)} units ${action} ${product.name}`
      });
      onClose();
    } catch (err) {
      setError('Failed to update stock');
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update stock quantity. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  };

  const parsedChange = parseInt(quantity, 10) || 0;
  const currentStock = product?.stockQuantity || 0;
  const newStock = Math.max(0, currentStock + parsedChange);

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div 
        className="relative w-full max-w-md bg-surface border border-border-default shadow-modal rounded-2xl p-6 text-text-primary transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-default/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
              <ArrowPathIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary tracking-tight">
                Adjust Stock Level
              </h3>
              <p className="text-caption text-text-muted truncate max-w-[240px]">
                {product?.name || 'Selected Product'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors focus:outline-none"
            aria-label="Close dialog"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Current Stock Detail Pill */}
        <div className="my-4 p-3.5 rounded-xl bg-surface-2/60 border border-border-default flex items-center justify-between text-small">
          <div>
            <span className="text-caption text-text-muted">Current Inventory:</span>
            <div className="font-mono text-caption text-text-muted mt-0.5">SKU: {product?.sku || 'N/A'}</div>
          </div>
          <span className="text-lg font-extrabold text-primary">
            {currentStock} units
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-small font-semibold text-text-secondary mb-1.5">
              Quantity Adjustment <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setError('');
              }}
              className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                error ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
              } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
              placeholder="e.g. +10 to add, -5 to reduce"
            />
            {error && (
              <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                <ExclamationCircleIcon className="h-3.5 w-3.5" />
                <span>{error}</span>
              </p>
            )}
            <p className="text-caption text-text-muted mt-1.5">
              Use positive numbers (e.g. 15) for stock additions, negative numbers (e.g. -5) for adjustments.
            </p>
          </div>

          {/* New Calculated Stock Projection */}
          {quantity && parsedChange !== 0 && (
            <div className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-between text-small">
              <span className="text-text-secondary font-medium">Projected New Stock:</span>
              <span className="font-extrabold text-primary text-base">
                {newStock} units
              </span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border-default/80">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-border-default text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 font-medium text-small transition-colors"
            >
              Cancel
            </button>
            
            <button
              type="submit"
              disabled={loading || !quantity || parsedChange === 0}
              className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-small hover:bg-primary-hover active:bg-primary-active shadow-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Save Adjustment'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}

import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { updateStock } from '../store/slices/productsSlice'
import { useToast } from './Toast'

export default function StockModal({ product, onClose }) {
  const dispatch = useDispatch()
  const [quantity, setQuantity] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { showToast } = useToast()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!quantity || quantity === '0') {
      setError('Please enter a valid quantity')
      showToast({
        type: 'error',
        title: 'Invalid Quantity',
        message: 'Please enter a valid quantity value'
      })
      return
    }

    setLoading(true)
    setError('')
    
    try {
      await dispatch(updateStock({ id: product.id, quantity: parseInt(quantity) })).unwrap()
      const action = parseInt(quantity) > 0 ? 'added to' : 'removed from'
      showToast({
        type: 'success',
        title: 'Stock Updated',
        message: `${Math.abs(parseInt(quantity))} units ${action} ${product.name}`
      })
      onClose()
    } catch (err) {
      setError('Failed to update stock')
      showToast({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update stock quantity. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-surface border border-border-default rounded-2xl shadow-modal w-full max-w-md p-4 sm:p-5 flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] overflow-hidden">
        <div className="flex-shrink-0 flex justify-between items-center pb-3 border-b border-border-default mb-3">
          <h3 className="text-h3 font-bold text-text-primary">
            Update Stock - {product?.name}
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 scrollbar-thin">
          <div className="p-3 bg-surface-2/40 rounded-xl border border-border-default text-small">
            <p className="text-text-secondary">
              Current Stock: <span className="font-bold text-text-primary">{product?.stockQuantity}</span>
            </p>
            <p className="text-text-secondary">
              SKU: <span className="font-mono text-text-primary">{product?.sku}</span>
            </p>
          </div>

          <form id="stockForm" onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Quantity Change
              </label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value)
                  setError('')
                }}
                className={`w-full px-3 py-2 bg-surface border rounded-xl font-bold text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                  error ? 'border-danger' : 'border-border-default'
                }`}
                placeholder="e.g. +10 or -5"
                autoFocus
              />
              {error && <p className="text-danger text-caption mt-1">{error}</p>}
              <p className="text-caption text-text-muted mt-1">
                Use positive numbers to add stock, negative to remove stock
              </p>
            </div>

            {quantity && quantity !== '0' && (
              <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-xl">
                <p className="text-small text-text-primary">
                  New stock will be: <span className="font-bold text-primary">
                    {product?.stockQuantity + parseInt(quantity || 0)}
                  </span>
                </p>
              </div>
            )}
          </form>
        </div>

        <div className="flex-shrink-0 flex justify-end gap-3 pt-3 border-t border-border-default mt-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border-default rounded-xl text-text-secondary hover:bg-surface-2 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="stockForm"
            disabled={loading || !quantity || quantity === '0'}
            className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? 'Updating...' : 'Update Stock'}
          </button>
        </div>
      </div>
    </div>
  )
}

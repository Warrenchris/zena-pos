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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Update Stock - {product?.name}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">
            Current Stock: <span className="font-medium">{product?.stockQuantity}</span>
          </p>
          <p className="text-sm text-gray-600">
            SKU: <span className="font-medium">{product?.sku}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Change
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value)
                setError('')
              }}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                error ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter quantity (+ for increase, - for decrease)"
            />
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
            <p className="text-xs text-gray-500 mt-1">
              Use positive numbers to add stock, negative numbers to remove stock
            </p>
          </div>

          {quantity && quantity !== '0' && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md">
              <p className="text-sm text-gray-700">
                New stock will be: <span className="font-medium">
                  {product?.stockQuantity + parseInt(quantity || 0)}
                </span>
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !quantity || quantity === '0'}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Stock'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

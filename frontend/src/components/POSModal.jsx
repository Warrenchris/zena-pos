import { useState } from 'react'
import { useDispatch } from 'react-redux'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createSale } from '../store/slices/salesSlice'

export default function POSModal({ products, customers, onClose }) {
  const dispatch = useDispatch()
  const [cart, setCart] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [loading, setLoading] = useState(false)

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.productId === product.id)
    if (existingItem) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ))
    } else {
      setCart([...cart, {
        productId: product.id,
        quantity: 1,
        unitPrice: product.price,
        subtotal: product.price
      }])
    }
  }

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.productId !== productId))
    } else {
      setCart(cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity, subtotal: item.unitPrice * quantity }
          : item
      ))
    }
  }

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId))
  }

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0)
  }

  const getTax = () => {
    return getSubtotal() * 0.08 // 8% tax
  }

  const getTotal = () => {
    return getSubtotal() + getTax()
  }

  const handleCheckout = async () => {
    if (cart.length === 0) return

    setLoading(true)
    try {
      const saleData = {
        items: cart,
        customerId: selectedCustomer || null,
        paymentMethod,
        discount: 0,
        tax: getTax(),
        notes: ''
      }

      dispatch(createSale(saleData))
      setCart([])
      onClose()
    } catch (error) {
      console.error('Error creating sale:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-4 mx-auto p-5 border w-11/12 h-5/6 shadow-lg rounded-md bg-white flex">
        {/* Left Side - Products */}
        <div className="w-2/3 pr-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium text-gray-900">Point of Sale</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-3 gap-2 h-96 overflow-y-auto">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50 text-left"
              >
                <div className="font-medium text-sm">{product.name}</div>
                <div className="text-xs text-gray-500">{product.sku}</div>
                <div className="text-sm font-bold text-green-600">
                  {formatCurrency(product.price)}
                </div>
                <div className="text-xs text-gray-500">
                  Stock: {product.stockQuantity}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Side - Cart */}
        <div className="w-1/3 border-l pl-4">
          <h4 className="text-lg font-medium text-gray-900 mb-4">Cart</h4>

          {/* Cart Items */}
          <div className="h-64 overflow-y-auto mb-4">
            {cart.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Cart is empty</p>
            ) : (
              cart.map((item) => {
                const product = products.find(p => p.id === item.productId)
                return (
                  <div key={item.productId} className="flex justify-between items-center py-2 border-b">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{product?.name}</div>
                      <div className="text-xs text-gray-500">{formatCurrency(item.unitPrice)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-sm"
                      >
                        -
                      </button>
                      <span className="text-sm">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-sm"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-red-600 ml-2"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Customer Selection */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer (Optional)
            </label>
            <select
              value={selectedCustomer}
              onChange={(e) => setSelectedCustomer(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Walk-in Customer</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="check">Check</option>
            </select>
          </div>

          {/* Totals */}
          <div className="border-t pt-4 mb-4">
            <div className="flex justify-between text-sm">
              <span>Subtotal:</span>
              <span>{formatCurrency(getSubtotal())}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Tax:</span>
              <span>{formatCurrency(getTax())}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>{formatCurrency(getTotal())}</span>
            </div>
          </div>

          {/* Checkout Button */}
          <button
            onClick={handleCheckout}
            disabled={loading || cart.length === 0}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Checkout'}
          </button>
        </div>
      </div>
    </div>
  )
}

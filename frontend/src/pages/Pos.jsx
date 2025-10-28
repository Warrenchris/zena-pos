import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { fetchProducts } from '../store/slices/productsSlice'
import { fetchCustomers } from '../store/slices/customersSlice'
import POSModal from '../components/POSModal'

export default function Pos() {
  const dispatch = useDispatch()
  const { products } = useSelector((state) => state.products)
  const { customers } = useSelector((state) => state.customers)
  const [showPOSModal, setShowPOSModal] = useState(true)

  useEffect(() => {
    dispatch(fetchProducts())
    dispatch(fetchCustomers())
  }, [dispatch])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Point of Sale</h1>
          <p className="text-gray-600">Create a new sale</p>
        </div>
        <button
          onClick={() => setShowPOSModal(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
        >
          New Sale
        </button>
      </div>

      {showPOSModal && (
        <POSModal
          products={products}
          customers={customers}
          onClose={() => setShowPOSModal(false)}
        />
      )}
    </div>
  )
}

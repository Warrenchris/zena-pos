import React from 'react';

const Brands = () => {
  return (
    <div className="py-6">
      <h1 className="text-2xl font-semibold">Brands</h1>
      <p className="mt-2 text-gray-600">Manage product brands.</p>
    </div>
  );
};

export default Brands;

import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  PencilIcon,
  TrashIcon,
  GlobeAltIcon
} from '@heroicons/react/24/outline'
import { fetchBrands, deleteBrand } from '../store/slices/brandsSlice'
import BrandModal from '../components/BrandModal'

export default function Brands() {
  const dispatch = useDispatch()
  const { brands, loading } = useSelector((state) => state.brands)
  
  const [showModal, setShowModal] = useState(false)
  const [editingBrand, setEditingBrand] = useState(null)

  useEffect(() => {
    dispatch(fetchBrands())
  }, [dispatch])

  const handleEdit = (brand) => {
    setEditingBrand(brand)
    setShowModal(true)
  }

  const handleDelete = async (brandId) => {
    if (window.confirm('Are you sure you want to delete this brand?')) {
      dispatch(deleteBrand(brandId))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Brands</h1>
          <p className="text-gray-600">Manage product brands</p>
        </div>
        <button
          onClick={() => {
            setEditingBrand(null)
            setShowModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Add Brand
        </button>
      </div>

      {/* Brands Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading brands...</p>
          </div>
        ) : brands.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No brands found. Create your first brand!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {brands.map((brand) => (
              <div key={brand.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-3">
                    {brand.logo && (
                      <img 
                        src={brand.logo} 
                        alt={brand.name} 
                        className="w-10 h-10 object-contain rounded-full bg-gray-50"
                      />
                    )}
                    <h3 className="text-lg font-medium text-gray-900">{brand.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(brand)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(brand.id)}
                      className="text-red-600 hover:text-red-900 p-1"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {brand.description && (
                  <p className="text-sm text-gray-600 mb-3">{brand.description}</p>
                )}
                {brand.website && (
                  <a
                    href={brand.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                  >
                    <GlobeAltIcon className="h-4 w-4" />
                    Visit Website
                  </a>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  Created: {new Date(brand.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <BrandModal
          brand={editingBrand}
          onClose={() => {
            setShowModal(false)
            setEditingBrand(null)
          }}
        />
      )}
    </div>
  )
}
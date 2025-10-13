import React from 'react';

const SubCategories = () => {
  return (
    <div className="py-6">
      <h1 className="text-2xl font-semibold">Sub Categories</h1>
      <p className="mt-2 text-gray-600">Manage sub-categories under categories.</p>
    </div>
  );
};

export default SubCategories;

import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  PencilIcon,
  TrashIcon,
  TagIcon
} from '@heroicons/react/24/outline'
import { fetchCategories, deleteCategory } from '../store/slices/categoriesSlice'
import SubCategoryModal from '../components/SubCategoryModal'

export default function SubCategories() {
  const dispatch = useDispatch()
  const { categories, loading } = useSelector((state) => state.categories)
  
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  // Filter out only subcategories and organize them by parent category
  const subcategoriesByParent = categories.reduce((acc, category) => {
    if (category.parentCategoryId) {
      if (!acc[category.parentCategoryId]) {
        acc[category.parentCategoryId] = []
      }
      acc[category.parentCategoryId].push(category)
    }
    return acc
  }, {})

  const parentCategories = categories.filter(cat => !cat.parentCategoryId)

  const handleEdit = (category) => {
    setEditingCategory(category)
    setShowModal(true)
  }

  const handleDelete = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this subcategory?')) {
      dispatch(deleteCategory(categoryId))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subcategories</h1>
          <p className="text-gray-600">Manage product subcategories</p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null)
            setShowModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Add Subcategory
        </button>
      </div>

      {/* Subcategories by Parent Category */}
      <div className="space-y-6">
        {loading ? (
          <div className="p-8 text-center bg-white rounded-lg shadow">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading subcategories...</p>
          </div>
        ) : parentCategories.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-lg shadow">
            <p className="text-gray-500">No categories found. Please create a parent category first.</p>
          </div>
        ) : (
          parentCategories.map(parent => (
            <div key={parent.id} className="bg-white rounded-lg shadow overflow-hidden">
              <div className="p-4 bg-gray-50 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">{parent.name}</h2>
              </div>
              
              {!subcategoriesByParent[parent.id] || subcategoriesByParent[parent.id].length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  No subcategories found for this category.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
                  {subcategoriesByParent[parent.id].map((subcategory) => (
                    <div key={subcategory.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <div className="bg-blue-100 rounded-full p-2">
                            <TagIcon className="h-5 w-5 text-blue-600" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900">
                            {subcategory.name}
                          </h3>
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleEdit(subcategory)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Edit"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(subcategory.id)}
                            className="text-red-600 hover:text-red-900 p-1"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {subcategory.description && (
                        <p className="text-sm text-gray-600 mb-2">
                          {subcategory.description}
                        </p>
                      )}
                      <div className="text-xs text-gray-500">
                        Created: {new Date(subcategory.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <SubCategoryModal
          category={editingCategory}
          onClose={() => {
            setShowModal(false)
            setEditingCategory(null)
          }}
        />
      )}
    </div>
  )
}
import { useState, useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { 
  PlusIcon, 
  PencilIcon,
  TrashIcon
} from '@heroicons/react/24/outline'
import { fetchCategories, deleteCategory } from '../store/slices/categoriesSlice'
import CategoryModal from '../components/CategoryModal'

export default function Categories() {
  const dispatch = useDispatch()
  const { categories, loading } = useSelector((state) => state.categories)
  
  const [showModal, setShowModal] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  const handleEdit = (category) => {
    setEditingCategory(category)
    setShowModal(true)
  }

  const handleDelete = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category?')) {
      dispatch(deleteCategory(categoryId))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
          <p className="text-gray-600">Manage product categories</p>
        </div>
        <button
          onClick={() => {
            setEditingCategory(null)
            setShowModal(true)
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="h-5 w-5" />
          Add Category
        </button>
      </div>

      {/* Categories Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading categories...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No categories found. Create your first category!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-6">
            {categories.map((category) => (
              <div key={category.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-medium text-gray-900">{category.name}</h3>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleEdit(category)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(category.id)}
                      className="text-red-600 hover:text-red-900 p-1"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {category.description && (
                  <p className="text-sm text-gray-600 mb-3">{category.description}</p>
                )}
                <div className="text-xs text-gray-500">
                  Created: {new Date(category.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CategoryModal
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

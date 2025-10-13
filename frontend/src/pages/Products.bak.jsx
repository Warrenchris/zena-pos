import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useErrorHandler, errorTypes, createError } from '../utils/errorHandler'
import { LoadingOverlay, GridSkeletonLoader, InlineLoading } from '../components/LoadingStates'
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon
} from '@heroicons/react/24/outline'
import { fetchProducts, deleteProduct } from '../store/slices/productsSlice'
import { fetchCategories } from '../store/slices/categoriesSlice'
import ProductModal from '../components/ProductModal'
import StockModal from '../components/StockModal'

export default function Products() {
  const dispatch = useDispatch()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { handleError } = useErrorHandler()
  const { products, loading, pagination } = useSelector((state) => state.products)
  const { categories } = useSelector((state) => state.categories || { categories: [] })
  
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showStockModal, setShowStockModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [editingProduct, setEditingProduct] = useState(null)
  const [viewMode, setViewMode] = useState('grid') // 'grid' | 'list'
  const [filters, setFilters] = useState({ categoryId: '', availability: 'all', minPrice: '', maxPrice: '' })
  const [localLoading, setLocalLoading] = useState({
    delete: false,
    stock: false,
    filter: false
  })

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const result = await dispatch(fetchProducts({ 
          page: currentPage, 
          search: searchTerm || undefined,
          categoryId: filters.categoryId || undefined,
          availability: filters.availability !== 'all' ? filters.availability : undefined,
          minPrice: filters.minPrice || undefined,
          maxPrice: filters.maxPrice || undefined,
        })).unwrap()
        
        if (searchTerm && result.products.length === 0) {
          showToast({
            type: 'info',
            title: 'No Results',
            message: 'No products found matching your search criteria'
          })
        }
      } catch (error) {
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load products. Please try again.'
        })
      }
    }

    loadProducts()
    
    if (categories.length === 0) {
      dispatch(fetchCategories()).catch(error => {
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load categories'
        })
      })
    }
  }, [dispatch, currentPage, searchTerm, filters])

  const handleSearch = (e) => {
    setSearchTerm(e.target.value)
    setCurrentPage(1)
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setShowProductModal(true)
  }

  const handleDelete = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        setLocalLoading(prev => ({ ...prev, delete: true }));
        await dispatch(deleteProduct(productId)).unwrap();
        showToast({
          type: 'success',
          title: 'Product Deleted',
          message: 'The product has been successfully deleted',
          duration: 4000
        });
      } catch (error) {
        handleError(error, {
          [errorTypes.AUTHORIZATION]: {
            title: 'Cannot Delete Product',
            message: 'You do not have permission to delete products',
            type: 'error'
          },
          [errorTypes.NOT_FOUND]: {
            title: 'Product Not Found',
            message: 'This product may have already been deleted',
            type: 'warning'
          }
        });
      } finally {
        setLocalLoading(prev => ({ ...prev, delete: false }));
      }
    }
  }

  const handleStockUpdate = async (product) => {
    try {
      setLocalLoading(prev => ({ ...prev, stock: true }));
      setSelectedProduct(product);
      setShowStockModal(true);
      showToast({
        type: 'info',
        title: 'Update Stock',
        message: `Updating stock for ${product.name}`,
        duration: 3000
      });
    } catch (error) {
      handleError(error);
    } finally {
      setLocalLoading(prev => ({ ...prev, stock: false }));
    }
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const getStockStatus = (quantity, reorderPoint) => {
    if (quantity === 0) return { status: 'out', color: 'text-red-600' }
    if (quantity <= reorderPoint) return { status: 'low', color: 'text-yellow-600' }
    return { status: 'good', color: 'text-green-600' }
  }

  const filteredProducts = useMemo(() => products, [products])

  return (
    <div className="space-y-6 min-h-full p-1 bg-brand-black">
      <LoadingOverlay 
        isLoading={loading} 
        text={
          localLoading.filter ? "Applying filters..." :
          localLoading.delete ? "Deleting product..." :
          localLoading.stock ? "Updating stock..." :
          "Loading products..."
        }
        variant={
          localLoading.delete ? "error" :
          localLoading.stock ? "warning" :
          "default"
        }
      >
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-brand-yellow">Products</h1>
            <p className="text-gray-400">
              Manage your product inventory
              {loading && (
                <InlineLoading 
                  text={localLoading.filter ? "Filtering..." : "Loading..."} 
                  variant={localLoading.filter ? "warning" : "default"}
                />
              )}
            </p>
          </div>
          <button
            onClick={() => navigate('/products/create')}
            className="bg-brand-yellow text-brand-black px-4 py-2 rounded-lg hover:bg-brand-yellowDark shadow flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || localLoading.delete || localLoading.stock}
          >
            <PlusIcon className="h-5 w-5" />
            Add Product
          </button>
        </div>

      {/* Search and Filters */}
      <div className="bg-brand-gray p-6 rounded-lg border border-brand-yellow/20">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
              />
            </div>
          </div>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 w-full lg:w-auto">
            <select
              value={filters.categoryId}
              onChange={(e) => { setFilters((f) => ({ ...f, categoryId: e.target.value })); setCurrentPage(1) }}
              className="px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={filters.availability}
              onChange={(e) => { setFilters((f) => ({ ...f, availability: e.target.value })); setCurrentPage(1) }}
              className="px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            >
              <option value="all">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
            <input
              type="number"
              placeholder="Min Price"
              value={filters.minPrice}
              onChange={(e) => { setFilters((f) => ({ ...f, minPrice: e.target.value })); setCurrentPage(1) }}
              className="px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
            <input
              type="number"
              placeholder="Max Price"
              value={filters.maxPrice}
              onChange={(e) => { setFilters((f) => ({ ...f, maxPrice: e.target.value })); setCurrentPage(1) }}
              className="px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
            />
          </div>
          {/* View toggle */}
          <div className="flex items-center gap-2 ml-auto">
            <span className={`text-sm ${viewMode === 'list' ? 'text-gray-300' : 'text-gray-500'}`}>Grid</span>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              className="relative inline-flex h-6 w-12 items-center rounded-full bg-black/60 border border-brand-yellow/30"
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-brand-yellow transition ${viewMode === 'list' ? 'translate-x-6' : 'translate-x-1'}`}></span>
            </button>
            <span className={`text-sm ${viewMode === 'grid' ? 'text-gray-300' : 'text-gray-500'}`}>List</span>
          </div>
        </div>
      </div>

      {/* Products Content */}
      <div className="bg-brand-gray rounded-lg border border-brand-yellow/20 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            viewMode === 'grid' ? (
              <div className="p-4">
                <GridSkeletonLoader items={8} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" />
              </div>
            ) : (
              <div className="p-4">
                <SkeletonLoader lines={10} className="space-y-4" />
              </div>
            )
          ) : (
          <div className="overflow-x-auto">
            {viewMode === 'grid' ? (
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredProducts.map((product) => {
                  const stockStatus = getStockStatus(product.stockQuantity, product.reorderPoint)
                  return (
                    <div key={product.id} className="rounded-xl bg-brand-black border border-brand-yellow/20 hover:border-brand-yellow transition shadow-sm">
                      <div className="aspect-video w-full bg-black/50 rounded-t-xl flex items-center justify-center text-gray-400">
                        <span className="text-xs">No Image</span>
                      </div>
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-gray-100">{product.name}</p>
                            <p className="text-xs text-gray-300">{product.Category?.name || 'No Category'}</p>
                          </div>
                          <p className="text-sm font-bold text-brand-yellow">{formatCurrency(product.price)}</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${stockStatus.color}`}>Stock: {product.stockQuantity}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEdit(product)}
                              className="px-2 py-1 text-xs rounded bg-black/50 text-gray-100 border border-brand-yellow/20 hover:bg-black/60 disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={loading || localLoading.delete || localLoading.stock}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(product.id)}
                              className={`px-2 py-1 text-xs rounded ${
                                localLoading.delete ? 'bg-red-800 cursor-not-allowed' : 'bg-red-600/80 hover:bg-red-600'
                              } text-white disabled:opacity-50`}
                              disabled={loading || localLoading.delete || localLoading.stock}
                            >
                              {localLoading.delete ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
            <table className="min-w-full divide-y divide-black">
              <thead className="bg-black/40">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Image
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-brand-gray divide-y divide-black">
                {products.map((product) => {
                  const stockStatus = getStockStatus(product.stockQuantity, product.reorderPoint)
                  return (
                    <tr key={product.id} className="hover:bg-black/40">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">
                        <div className="h-10 w-14 bg-black/50 rounded"></div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-100">{product.name}</div>
                          {product.description && (
                            <div className="text-sm text-gray-400">{product.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{product.sku}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{product.Category?.name || 'No Category'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-100">{formatCurrency(product.price)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${stockStatus.color}`}>
                            {product.stockQuantity}
                          </span>
                          <span className="text-xs text-gray-400">
                            (Reorder: {product.reorderPoint})
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <button onClick={() => handleEdit(product)} className="text-brand-yellow hover:text-brand-yellowDark" title="Edit"><PencilIcon className="h-4 w-4" /></button>
                          <button onClick={() => handleStockUpdate(product)} className="text-green-400 hover:text-green-300" title="Update Stock"><EyeIcon className="h-4 w-4" /></button>
                          <button onClick={() => handleDelete(product.id)} className="text-red-400 hover:text-red-300" title="Delete"><TrashIcon className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            )}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-brand-gray px-4 py-3 flex items-center justify-between border-t border-black sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-brand-yellow/30 text-sm font-medium rounded-md text-gray-200 bg-brand-black hover:bg-black/40 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === pagination.totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-brand-yellow/30 text-sm font-medium rounded-md text-gray-200 bg-brand-black hover:bg-black/40 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-300">
                  Showing page <span className="font-medium">{currentPage}</span> of{' '}
                  <span className="font-medium">{pagination.totalPages}</span>
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                        page === currentPage
                          ? 'z-10 bg-brand-yellow/20 border-brand-yellow text-brand-yellow'
                          : 'bg-brand-black border-brand-yellow/30 text-gray-300 hover:bg-black/40'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showProductModal && (
        <ProductModal
          product={editingProduct}
          categories={categories}
          onClose={() => {
            setShowProductModal(false)
            setEditingProduct(null)
          }}
        />
      )}

      {showStockModal && (
        <StockModal
          product={selectedProduct}
          onClose={() => {
            setShowStockModal(false)
            setSelectedProduct(null)
          }}
        />
      )}
    </div>
  )
}

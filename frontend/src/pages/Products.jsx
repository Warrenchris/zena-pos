import { useState, useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useErrorHandler, errorTypes } from '../utils/errorHandler';
import { LoadingOverlay, GridSkeletonLoader, InlineLoading } from '../components/LoadingStates';
import useCurrency from '../hooks/useCurrency';
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
  Squares2X2Icon,
  Bars4Icon,
  CubeIcon,
  XMarkIcon,
  TagIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArchiveBoxXMarkIcon
} from '@heroicons/react/24/outline';
import { fetchProducts, deleteProduct } from '../store/slices/productsSlice';
import { fetchCategories } from '../store/slices/categoriesSlice';
import ProductModal from '../components/ProductModal';
import StockModal from '../components/StockModal';
import ErrorBoundary from '../components/ErrorBoundary';

function ProductsContent() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { handleError } = useErrorHandler();
  const { format: formatCurrency } = useCurrency();
  const { products, loading, pagination } = useSelector((state) => state.products || { products: [], loading: false });
  const { categories } = useSelector((state) => state.categories || { categories: [] });
  
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24); // Default to 24 items per page so all 13+ load on initial view
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'grid' | 'list'
  const [sortConfig, setSortConfig] = useState({ field: 'createdAt', direction: 'desc' });
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [filters, setFilters] = useState({
    categoryId: '',
    availability: 'all',
    minPrice: '',
    maxPrice: ''
  });
  const [localLoading, setLocalLoading] = useState({
    delete: false,
    stock: false,
    filter: false
  });

  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        setLocalLoading(prev => ({ ...prev, filter: true }));
        await dispatch(fetchProducts({ 
          page: currentPage, 
          pageSize: pageSize,
          search: searchTerm || undefined,
          categoryId: filters.categoryId || undefined,
          availability: filters.availability !== 'all' ? filters.availability : undefined,
          minPrice: filters.minPrice || undefined,
          maxPrice: filters.maxPrice || undefined,
        })).unwrap();
      } catch (error) {
        handleError(error, {
          [errorTypes.NETWORK]: {
            title: 'Connection Error',
            message: 'Unable to load products. Please check your connection.',
            type: 'error'
          }
        });
      } finally {
        setLocalLoading(prev => ({ ...prev, filter: false }));
      }
    };

    loadProducts();
  }, [dispatch, currentPage, pageSize, searchTerm, filters]);

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setFilters({
      categoryId: '',
      availability: 'all',
      minPrice: '',
      maxPrice: ''
    });
    setCurrentPage(1);
  };

  const hasActiveFilters = Boolean(searchTerm || filters.categoryId || filters.availability !== 'all' || filters.minPrice || filters.maxPrice);

  const handleDelete = async (productId, productName) => {
    if (window.confirm(`Are you sure you want to delete "${productName}"?`)) {
      try {
        setLocalLoading(prev => ({ ...prev, delete: true }));
        await dispatch(deleteProduct(productId)).unwrap();
        showToast({
          type: 'success',
          title: 'Product Deleted',
          message: `Successfully deleted ${productName}`,
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
  };

  const handleEditProduct = (product) => {
    setEditingProduct(product);
    setShowProductModal(true);
  };

  const handleStockUpdate = (product) => {
    setSelectedProduct(product);
    setShowStockModal(true);
  };

  const getStockStatus = (quantity, reorderPoint) => {
    const point = reorderPoint !== undefined && reorderPoint !== null ? reorderPoint : 10;
    if (quantity === 0) {
      return { 
        status: 'out', 
        label: 'Out of Stock', 
        badgeStyle: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
        textColor: 'text-red-600 dark:text-red-400',
        icon: ArchiveBoxXMarkIcon
      };
    }
    if (quantity <= point) {
      return { 
        status: 'low', 
        label: `Low Stock (${quantity})`, 
        badgeStyle: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
        textColor: 'text-amber-600 dark:text-amber-400',
        icon: ExclamationTriangleIcon
      };
    }
    return { 
      status: 'good', 
      label: `In Stock (${quantity})`, 
      badgeStyle: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      icon: CheckCircleIcon
    };
  };

  const sortedAndFilteredProducts = useMemo(() => {
    if (!products || !Array.isArray(products)) return [];
    return [...products].sort((a, b) => {
      const aValue = a[sortConfig.field] ?? '';
      const bValue = b[sortConfig.field] ?? '';
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }
      const comparison = String(aValue).localeCompare(String(bValue));
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [products, sortConfig]);

  const handleSort = (field) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleSelectAll = () => {
    if (selectedProducts.length === sortedAndFilteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(sortedAndFilteredProducts.map(p => p.id));
    }
  };

  const toggleProductSelection = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleBatchDelete = async () => {
    if (!selectedProducts.length || !window.confirm(`Delete ${selectedProducts.length} selected products?`)) {
      return;
    }

    try {
      setLocalLoading(prev => ({ ...prev, delete: true }));
      await Promise.all(selectedProducts.map(id => dispatch(deleteProduct(id))));
      showToast({
        type: 'success',
        title: 'Success',
        message: `${selectedProducts.length} products deleted successfully`
      });
      setSelectedProducts([]);
    } catch (error) {
      handleError(error, {
        [errorTypes.NETWORK]: {
          title: 'Connection Error',
          message: 'Unable to delete products. Please try again.',
          type: 'error'
        }
      });
    } finally {
      setLocalLoading(prev => ({ ...prev, delete: false }));
    }
  };

  const totalCount = pagination?.total ?? products.length;

  return (
    <div className="space-y-6 pt-2 pb-12 px-1">
      <LoadingOverlay 
        isLoading={loading} 
        text={
          localLoading.filter ? "Applying filters..." :
          localLoading.delete ? "Deleting product..." :
          localLoading.stock ? "Updating stock..." :
          "Loading products..."
        }
      >
        <div className="space-y-6">
          {/* Header Section */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 sm:p-6 rounded-2xl border border-border-default shadow-floating">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">Products</h1>
                <span className="px-2.5 py-0.5 text-caption font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
                  {totalCount}
                </span>
              </div>
              <p className="text-small text-text-secondary mt-1 flex items-center gap-2">
                <span>Manage catalog, categories, pricing, and inventory levels</span>
                {loading && (
                  <InlineLoading 
                    text={localLoading.filter ? "Filtering..." : "Loading..."} 
                  />
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* View Mode Toggle */}
              <div className="flex items-center bg-surface-2 rounded-xl p-1 border border-border-default shadow-2xs">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'grid' 
                      ? 'bg-surface text-primary shadow-xs font-semibold' 
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  title="Grid View"
                  aria-label="Grid View"
                >
                  <Squares2X2Icon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-lg transition-all ${
                    viewMode === 'list' 
                      ? 'bg-surface text-primary shadow-xs font-semibold' 
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                  title="List View"
                  aria-label="List View"
                >
                  <Bars4Icon className="h-4 w-4" />
                </button>
              </div>
              
              {/* Batch Actions */}
              {selectedProducts.length > 0 && (
                <button
                  onClick={handleBatchDelete}
                  className="bg-danger text-white px-3.5 py-2 rounded-xl hover:bg-red-700 flex items-center gap-1.5 text-small font-medium shadow-2xs transition-colors"
                  disabled={loading || localLoading.delete}
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete ({selectedProducts.length})
                </button>
              )}

              {/* Add Product Button */}
              <button
                onClick={() => navigate('/products/create')}
                className="bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-primary-hover active:bg-primary-active shadow-sm flex items-center gap-2 text-small font-semibold transition-all duration-150 active:scale-[0.98]"
                disabled={loading || localLoading.delete}
              >
                <PlusIcon className="h-4.5 w-4.5 stroke-[2.5]" />
                <span>Add Product</span>
              </button>
            </div>
          </div>

          {/* Search & Filters Section */}
          <div className="bg-surface p-4 sm:p-5 rounded-2xl border border-border-default shadow-floating space-y-4">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
              
              {/* Search Box */}
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="h-4 w-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search products by name, SKU, or barcode..."
                  value={searchTerm}
                  onChange={handleSearch}
                  disabled={loading}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-surface-2/60 text-text-primary border border-border-default focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary focus:bg-surface text-small placeholder-text-muted transition-colors"
                />
                {searchTerm && (
                  <button
                    onClick={handleClearSearch}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-text-muted hover:text-text-primary rounded-md transition-colors"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
              
              {/* Filters Group */}
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Category Select */}
                <select
                  value={filters.categoryId}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, categoryId: e.target.value }));
                    setCurrentPage(1);
                  }}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl bg-surface-2/60 text-text-primary border border-border-default focus:outline-none focus:ring-2 focus:ring-primary/40 text-small transition-colors min-w-[150px]"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                {/* Stock Status Select */}
                <select
                  value={filters.availability}
                  onChange={(e) => {
                    setFilters((f) => ({ ...f, availability: e.target.value }));
                    setCurrentPage(1);
                  }}
                  disabled={loading}
                  className="px-3.5 py-2.5 rounded-xl bg-surface-2/60 text-text-primary border border-border-default focus:outline-none focus:ring-2 focus:ring-primary/40 text-small transition-colors min-w-[140px]"
                >
                  <option value="all">All Availability</option>
                  <option value="in_stock">In Stock</option>
                  <option value="low_stock">Low Stock</option>
                  <option value="out_of_stock">Out of Stock</option>
                </select>

                {/* Reset Filters Button */}
                {hasActiveFilters && (
                  <button
                    onClick={handleResetFilters}
                    className="px-3.5 py-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 text-text-secondary hover:text-text-primary border border-border-default text-small font-medium transition-colors flex items-center gap-1.5"
                    title="Reset all filters"
                  >
                    <ArrowPathIcon className="h-4 w-4 text-text-muted" />
                    <span>Reset</span>
                  </button>
                )}
              </div>

            </div>
          </div>

          {/* Products View (Grid or List) */}
          <div className="bg-surface rounded-2xl border border-border-default shadow-floating overflow-hidden">
            {loading ? (
              <div className="p-6">
                <GridSkeletonLoader items={8} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6" />
              </div>
            ) : sortedAndFilteredProducts.length === 0 ? (
              <div className="p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center text-text-muted">
                  <CubeIcon className="h-6 w-6" />
                </div>
                <h3 className="text-body font-semibold text-text-primary">No products found</h3>
                <p className="text-small text-text-secondary max-w-sm">
                  {hasActiveFilters 
                    ? "No items match your active search and filter options. Try clearing filters."
                    : "No products in your catalog yet. Click 'Add Product' to get started."}
                </p>
                {hasActiveFilters ? (
                  <button
                    onClick={handleResetFilters}
                    className="mt-2 px-4 py-2 text-small font-medium rounded-xl bg-surface-2 text-text-primary hover:bg-surface-3 border border-border-default transition-colors"
                  >
                    Clear Filters
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/products/create')}
                    className="mt-2 px-4 py-2 text-small font-semibold rounded-xl bg-primary text-white hover:bg-primary-hover transition-colors"
                  >
                    Add Your First Product
                  </button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              /* GRID VIEW */
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {sortedAndFilteredProducts.map((product) => {
                  const stockStatus = getStockStatus(product.stockQuantity, product.reorderPoint);
                  const StatusIcon = stockStatus.icon;

                  return (
                    <div 
                      key={product.id} 
                      className="group rounded-2xl bg-surface border border-border-default hover:border-primary/40 hover:shadow-floating transition-all duration-200 flex flex-col overflow-hidden"
                    >
                      {/* Card Media Header */}
                      <div className="aspect-[16/10] w-full bg-gradient-to-br from-surface-2 via-surface-3 to-surface-2 relative flex items-center justify-center overflow-hidden border-b border-border-default/50">
                        {/* Category Pill (Top-Left) */}
                        <div className="absolute top-3 left-3 z-10">
                          <span className="inline-flex items-center gap-1 bg-surface/85 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-medium border border-border-default/60 text-text-secondary shadow-2xs">
                            <TagIcon className="h-3 w-3 text-primary" />
                            <span className="truncate max-w-[110px]">{product.Category?.name || 'Unassigned'}</span>
                          </span>
                        </div>

                        {/* Stock Badge (Top-Right) */}
                        <div className="absolute top-3 right-3 z-10">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border backdrop-blur-md shadow-2xs ${stockStatus.badgeStyle}`}>
                            <StatusIcon className="h-3 w-3" />
                            <span>{stockStatus.label}</span>
                          </span>
                        </div>

                        {/* Graphic Icon Thumbnail */}
                        <div className="w-14 h-14 rounded-2xl bg-surface/40 border border-border-default/40 backdrop-blur-sm flex items-center justify-center text-primary/40 group-hover:text-primary group-hover:scale-110 transition-all duration-300 shadow-2xs">
                          <CubeIcon className="h-7 w-7" />
                        </div>
                      </div>

                      {/* Card Content Body */}
                      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-body font-bold text-text-primary group-hover:text-primary transition-colors line-clamp-1">
                              {product.name}
                            </h3>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-1 text-caption text-text-muted font-mono">
                            <span>SKU: {product.sku || 'N/A'}</span>
                            {product.weightGrams ? <span>• {product.weightGrams}g</span> : null}
                          </div>
                        </div>

                        {/* Price Display */}
                        <div className="pt-2 border-t border-border-default/50 flex items-baseline justify-between">
                          <span className="text-caption text-text-muted font-medium">Selling Price</span>
                          <span className="text-lg font-extrabold text-primary tracking-tight">
                            {formatCurrency(product.price)}
                          </span>
                        </div>

                        {/* Action Buttons */}
                        <div className="pt-2 flex items-center gap-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-default text-caption font-medium transition-colors flex items-center justify-center gap-1"
                            title="Edit Product"
                          >
                            <PencilIcon className="h-3.5 w-3.5 text-text-secondary" />
                            <span>Edit</span>
                          </button>
                          
                          <button
                            onClick={() => handleStockUpdate(product)}
                            className="flex-1 py-1.5 px-2 rounded-xl bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-default text-caption font-medium transition-colors flex items-center justify-center gap-1"
                            title="Adjust Stock Level"
                          >
                            <ArrowPathIcon className="h-3.5 w-3.5 text-primary" />
                            <span>Stock</span>
                          </button>
                          
                          <button
                            onClick={() => handleDelete(product.id, product.name)}
                            className="p-1.5 rounded-xl bg-danger/10 hover:bg-danger/20 text-danger transition-colors"
                            title="Delete Product"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* LIST / TABLE VIEW */
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-border-default">
                  <thead className="bg-surface-2/70">
                    <tr>
                      <th scope="col" className="px-6 py-3.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="rounded border-border-default text-primary focus:ring-primary/40 bg-surface"
                            checked={selectedProducts.length === sortedAndFilteredProducts.length && sortedAndFilteredProducts.length > 0}
                            onChange={toggleSelectAll}
                            aria-label="Select all products"
                          />
                          <button
                            onClick={() => handleSort('name')}
                            className="hover:text-text-primary flex items-center gap-1"
                          >
                            <span>Product</span>
                            {sortConfig.field === 'name' && (
                              <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                            )}
                          </button>
                        </div>
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider">
                        Category
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('price')}
                          className="hover:text-text-primary flex items-center gap-1"
                        >
                          <span>Price</span>
                          {sortConfig.field === 'price' && (
                            <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-left text-caption font-semibold text-text-muted uppercase tracking-wider">
                        <button
                          onClick={() => handleSort('stockQuantity')}
                          className="hover:text-text-primary flex items-center gap-1"
                        >
                          <span>Stock Level</span>
                          {sortConfig.field === 'stockQuantity' && (
                            <span className="text-primary">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                          )}
                        </button>
                      </th>
                      <th scope="col" className="px-6 py-3.5 text-right text-caption font-semibold text-text-muted uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-default/60 bg-surface">
                    {sortedAndFilteredProducts.map((product) => {
                      const stockStatus = getStockStatus(product.stockQuantity, product.reorderPoint);
                      const isSelected = selectedProducts.includes(product.id);

                      return (
                        <tr 
                          key={product.id} 
                          className={`transition-colors ${isSelected ? 'bg-primary/5' : 'hover:bg-surface-2/40'}`}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                className="rounded border-border-default text-primary focus:ring-primary/40 bg-surface"
                                checked={isSelected}
                                onChange={() => toggleProductSelection(product.id)}
                                aria-label={`Select ${product.name}`}
                              />
                              <div>
                                <div className="text-body font-semibold text-text-primary">{product.name}</div>
                                <div className="text-caption font-mono text-text-muted">SKU: {product.sku || 'N/A'}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-caption font-medium bg-surface-2 text-text-secondary border border-border-default">
                              {product.Category?.name || 'Unassigned'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-body font-bold text-primary">{formatCurrency(product.price)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold border ${stockStatus.badgeStyle}`}>
                              <span>{stockStatus.label}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end items-center gap-2">
                              <button
                                onClick={() => handleEditProduct(product)}
                                className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-default transition-colors"
                                title="Edit Product"
                              >
                                <PencilIcon className="h-4 w-4 text-text-secondary" />
                              </button>
                              <button
                                onClick={() => handleStockUpdate(product)}
                                className="px-2.5 py-1 text-caption font-medium rounded-lg bg-surface-2 hover:bg-surface-3 text-text-primary border border-border-default transition-colors flex items-center gap-1"
                                title="Update Stock"
                              >
                                <ArrowPathIcon className="h-3.5 w-3.5 text-primary" />
                                <span>Stock</span>
                              </button>
                              <button
                                onClick={() => handleDelete(product.id, product.name)}
                                className="p-1.5 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger transition-colors"
                                title="Delete Product"
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls Footer */}
            {pagination && (pagination.totalPages > 1 || totalCount > 12) && (
              <div className="px-6 py-4 bg-surface-2/40 border-t border-border-default flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-small text-text-secondary">
                  Showing <span className="font-bold text-text-primary">{products.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</span> to{' '}
                  <span className="font-bold text-text-primary">
                    {Math.min(currentPage * pageSize, totalCount)}
                  </span> of <span className="font-bold text-text-primary">{totalCount}</span> products
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {/* Page Size Selector */}
                  <div className="flex items-center gap-2 text-caption text-text-muted">
                    <span>Show:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      disabled={loading}
                      className="px-2.5 py-1 rounded-xl bg-surface text-text-primary border border-border-default text-caption font-medium focus:outline-none focus:ring-2 focus:ring-primary/40 transition-colors"
                    >
                      <option value={12}>12 per page</option>
                      <option value={24}>24 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>

                  {/* Pagination Page Buttons */}
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1 || loading}
                        className="px-3 py-1 rounded-xl bg-surface text-text-primary border border-border-default hover:bg-surface-2 disabled:opacity-40 text-caption font-semibold transition-colors"
                      >
                        Prev
                      </button>

                      {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          disabled={loading}
                          className={`w-8 h-8 rounded-xl text-caption font-bold transition-all ${
                            currentPage === page
                              ? 'bg-primary text-white shadow-2xs'
                              : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-2 border border-border-default'
                          }`}
                        >
                          {page}
                        </button>
                      ))}

                      <button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, pagination.totalPages))}
                        disabled={currentPage >= pagination.totalPages || loading}
                        className="px-3 py-1 rounded-xl bg-surface text-text-primary border border-border-default hover:bg-surface-2 disabled:opacity-40 text-caption font-semibold transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Edit Product Modal */}
        {showProductModal && (
          <ProductModal
            product={editingProduct}
            categories={categories}
            onClose={() => {
              setShowProductModal(false);
              setEditingProduct(null);
            }}
          />
        )}

        {/* Stock Adjustment Modal */}
        {showStockModal && (
          <StockModal
            product={selectedProduct}
            onClose={() => {
              setShowStockModal(false);
              setSelectedProduct(null);
            }}
          />
        )}
      </LoadingOverlay>
    </div>
  );
}

export default function Products() {
  return (
    <ErrorBoundary>
      <ProductsContent />
    </ErrorBoundary>
  );
}
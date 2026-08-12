import { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { XMarkIcon, CubeIcon, TagIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import { createProduct, updateProduct } from '../store/slices/productsSlice';

export default function ProductModal({ product, categories = [], onClose }) {
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    description: '',
    price: '',
    cost: '',
    stockQuantity: '',
    reorderPoint: '10',
    CategoryId: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        description: product.description || '',
        price: product.price !== undefined ? String(product.price) : '',
        cost: product.cost !== undefined ? String(product.cost) : '',
        stockQuantity: product.stockQuantity !== undefined ? String(product.stockQuantity) : '',
        reorderPoint: product.reorderPoint !== undefined ? String(product.reorderPoint) : '10',
        CategoryId: product.CategoryId || product.categoryId || (product.Category?.id ? String(product.Category.id) : ''),
        categoryId: product.categoryId || product.CategoryId || (product.Category?.id ? String(product.Category.id) : '')
      });
    }
  }, [product]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (!formData.sku.trim()) newErrors.sku = 'SKU is required';
    if (!formData.price || isNaN(parseFloat(formData.price)) || parseFloat(formData.price) < 0) {
      newErrors.price = 'Valid positive price is required';
    }
    if (!formData.cost || isNaN(parseFloat(formData.cost)) || parseFloat(formData.cost) < 0) {
      newErrors.cost = 'Valid cost is required';
    }
    if (formData.stockQuantity === '' || isNaN(parseInt(formData.stockQuantity, 10)) || parseInt(formData.stockQuantity, 10) < 0) {
      newErrors.stockQuantity = 'Valid stock quantity is required';
    }
    if (formData.reorderPoint === '' || isNaN(parseInt(formData.reorderPoint, 10)) || parseInt(formData.reorderPoint, 10) < 0) {
      newErrors.reorderPoint = 'Valid reorder point is required';
    }
    if (!formData.CategoryId && !formData.categoryId) {
      newErrors.CategoryId = 'Category is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const catId = parseInt(formData.CategoryId || formData.categoryId, 10);
      const productData = {
        name: formData.name.trim(),
        sku: formData.sku.trim(),
        barcode: formData.barcode.trim() || undefined,
        description: formData.description.trim() || undefined,
        price: parseFloat(formData.price),
        cost: parseFloat(formData.cost),
        stockQuantity: parseInt(formData.stockQuantity, 10),
        reorderPoint: parseInt(formData.reorderPoint, 10),
        categoryId: catId,
        CategoryId: catId
      };

      if (product) {
        await dispatch(updateProduct({ id: product.id, productData })).unwrap();
      } else {
        await dispatch(createProduct(productData)).unwrap();
      }
      
      onClose();
    } catch (error) {
      console.error('Error saving product:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl bg-surface border border-border-default shadow-modal rounded-2xl p-6 text-text-primary transition-all duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border-default/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
              <CubeIcon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary tracking-tight">
                {product ? 'Edit Product' : 'Add New Product'}
              </h3>
              <p className="text-caption text-text-muted">
                {product ? `Update details for ${product.name}` : 'Fill in information to create a new catalog item'}
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

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Product Name */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Product Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.name ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="e.g. Auntie Pinky Basmati Rice 5kg"
              />
              {errors.name && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.name}</span>
                </p>
              )}
            </div>

            {/* SKU */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                SKU <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="sku"
                value={formData.sku}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary font-mono border ${
                  errors.sku ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="e.g. BAK001"
              />
              {errors.sku && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.sku}</span>
                </p>
              )}
            </div>

            {/* Barcode */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Barcode / EAN
              </label>
              <input
                type="text"
                name="barcode"
                value={formData.barcode}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary font-mono border border-border-default focus:border-primary focus:ring-2 focus:ring-primary/40 focus:bg-surface text-small placeholder-text-muted transition-colors"
                placeholder="e.g. 600123456789"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Category <span className="text-danger">*</span>
              </label>
              <select
                name="CategoryId"
                value={formData.CategoryId || formData.categoryId}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.CategoryId ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small transition-colors`}
              >
                <option value="">Select Category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.CategoryId && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.CategoryId}</span>
                </p>
              )}
            </div>

            {/* Price */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Selling Price <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                name="price"
                value={formData.price}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.price ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="0.00"
              />
              {errors.price && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.price}</span>
                </p>
              )}
            </div>

            {/* Cost */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Cost Price <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.cost ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="0.00"
              />
              {errors.cost && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.cost}</span>
                </p>
              )}
            </div>

            {/* Stock Quantity */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Stock Quantity <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                name="stockQuantity"
                value={formData.stockQuantity}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.stockQuantity ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="0"
              />
              {errors.stockQuantity && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.stockQuantity}</span>
                </p>
              )}
            </div>

            {/* Reorder Point */}
            <div>
              <label className="block text-small font-semibold text-text-secondary mb-1.5">
                Reorder Point <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                name="reorderPoint"
                value={formData.reorderPoint}
                onChange={handleChange}
                className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border ${
                  errors.reorderPoint ? 'border-danger focus:ring-danger/30' : 'border-border-default focus:border-primary focus:ring-primary/40'
                } focus:outline-none focus:ring-2 focus:bg-surface text-small placeholder-text-muted transition-colors`}
                placeholder="10"
              />
              {errors.reorderPoint && (
                <p className="text-danger text-caption font-medium mt-1 flex items-center gap-1">
                  <ExclamationCircleIcon className="h-3.5 w-3.5" />
                  <span>{errors.reorderPoint}</span>
                </p>
              )}
            </div>

          </div>

          {/* Description */}
          <div>
            <label className="block text-small font-semibold text-text-secondary mb-1.5">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-surface-2/70 text-text-primary border border-border-default focus:border-primary focus:ring-2 focus:ring-primary/40 focus:bg-surface text-small placeholder-text-muted transition-colors resize-none"
              placeholder="Enter optional product description, specifications, or notes..."
            />
          </div>

          {/* Modal Actions Footer */}
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
              disabled={loading}
              className="px-5 py-2.5 bg-primary text-white rounded-xl font-semibold text-small hover:bg-primary-hover active:bg-primary-active shadow-sm transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            >
              {loading ? 'Saving...' : (product ? 'Update Product' : 'Create Product')}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

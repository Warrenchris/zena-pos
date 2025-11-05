import { useState, useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { XMarkIcon, TagIcon, FolderIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import { createCategory, updateCategory } from '../store/slices/categoriesSlice'

export default function CategoryModal({ category, onClose, defaultParentId = null }) {
  const dispatch = useDispatch()
  const { categories } = useSelector(state => state.categories)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentCategoryId: ''
  })
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        description: category.description || '',
        parentCategoryId: category.parentCategoryId ? String(category.parentCategoryId) : ''
      })
    } else {
      // Reset form; preselect defaultParentId if provided
      setFormData({
        name: '',
        description: '',
        parentCategoryId: defaultParentId ? String(defaultParentId) : ''
      })
    }
  }, [category, defaultParentId])

  // Build map for descendants calculation
  const parentToChildren = useMemo(() => {
    const map = new Map();
    for (const c of categories) {
      if (!map.has(c.parentCategoryId || 0)) map.set(c.parentCategoryId || 0, []);
      map.get(c.parentCategoryId || 0).push(c);
    }
    return map;
  }, [categories]);

  const getDescendantIds = (id) => {
    const stack = [id];
    const seen = new Set();
    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      const kids = parentToChildren.get(current) || [];
      for (const k of kids) stack.push(k.id);
    }
    seen.delete(id);
    return seen;
  };

  const excludedIds = useMemo(() => {
    if (!category) return new Set();
    return getDescendantIds(category.id).add(category.id);
  }, [category, parentToChildren]);

  // Allow any category except the current or its descendants
  const availableParentCategories = useMemo(() => {
    return categories.filter(cat => !excludedIds.has(cat.id));
  }, [categories, excludedIds])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }))
    }
  }

  const validateForm = () => {
    const newErrors = {}
    
    if (!formData.name.trim()) newErrors.name = 'Category name is required'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validateForm()) return

    setLoading(true)
    try {
      const submissionData = {
        ...formData,
        parentCategoryId: formData.parentCategoryId ? Number(formData.parentCategoryId) : null
      }

      if (category) {
        await dispatch(updateCategory({ 
          id: category.id, 
          categoryData: submissionData 
        })).unwrap()
      } else {
        await dispatch(createCategory(submissionData)).unwrap()
      }
      if (typeof window !== 'undefined' && window.showToast) {
        window.showToast({
          type: 'success',
          title: 'Category saved',
          message: category ? 'Category updated successfully.' : 'Category created successfully.'
        })
      }
      
      onClose()
    } catch (error) {
      console.error('Error saving category:', error)
      setErrors(prev => ({
        ...prev,
        submit: 'Failed to save category. Please try again.'
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-neutral-950/70 backdrop-blur-sm z-50 flex items-start sm:items-center justify-center p-4">
      <div className="relative w-full max-w-lg sm:max-w-xl transform transition-all duration-200">
        <div className="rounded-2xl bg-white/5 text-white border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.45)] backdrop-blur-md overflow-hidden">
          <div className="flex justify-between items-center px-5 py-4 border-b border-white/10">
            <h3 className="text-lg font-semibold">
              {category ? 'Edit Category' : 'Add New Category'}
            </h3>
            <button
              onClick={onClose}
              className="text-white/60 hover:text-white/90 rounded-lg p-1.5 hover:bg-white/10"
              aria-label="Close"
              title="Close"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1" title="Required">
                Category Name *
              </label>
              <div className={`relative flex items-center rounded-xl bg-white/5 border ${errors.name ? 'border-red-500/60' : 'border-white/10'} focus-within:border-brand-yellow/60 focus-within:ring-2 focus-within:ring-brand-yellow/50`}>
                <TagIcon className="h-5 w-5 text-white/60 absolute left-3 pointer-events-none" />
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 bg-transparent outline-none text-white placeholder-white/50 rounded-xl"
                  placeholder="Enter category name"
                  title="Enter the category name"
                />
              </div>
              {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Parent Category
              </label>
              <div className="relative">
                <FolderIcon className="h-5 w-5 text-white/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <select
                  name="parentCategoryId"
                  value={formData.parentCategoryId}
                  onChange={handleChange}
                  className="w-full pl-10 pr-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-yellow/60"
                  title="Choose the parent category (optional)"
                >
                  <option className="bg-neutral-900" value="">None (Top Level Category)</option>
                  {availableParentCategories.map(cat => (
                    <option key={cat.id} className="bg-neutral-900" value={String(cat.id)}>{cat.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Description
              </label>
              <div className="relative">
                <PencilSquareIcon className="h-5 w-5 text-white/60 absolute left-3 top-3 pointer-events-none" />
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  className="w-full pl-10 pr-3 py-2 rounded-xl bg-white/5 text-white border border-white/10 focus:outline-none focus:ring-2 focus:ring-brand-yellow/60"
                  placeholder="Enter category description"
                  title="Describe this category (optional)"
                />
              </div>
            </div>

            {errors.submit && (
              <div className="text-red-300 text-sm bg-red-900/30 border border-red-700/40 p-3 rounded-xl">
                {errors.submit}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-white/85 border border-white/10 hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-brand-yellow text-black font-medium shadow-[0_8px_24px_rgba(255,214,0,0.35)] hover:shadow-[0_12px_28px_rgba(255,214,0,0.45)] hover:bg-brand-yellow/95 disabled:opacity-50 transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </span>
                ) : (
                  category ? 'Update Category' : 'Create Category'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

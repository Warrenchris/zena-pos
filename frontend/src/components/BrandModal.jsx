import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createBrand, updateBrand } from '../store/slices/brandsSlice'

export default function BrandModal({ brand, onClose }) {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    website: '',
    logo: ''
  })

  useEffect(() => {
    if (brand) {
      setFormData({
        name: brand.name || '',
        description: brand.description || '',
        website: brand.website || '',
        logo: brand.logo || ''
      })
    }
  }, [brand])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      if (brand) {
        await dispatch(updateBrand({ id: brand.id, brandData: formData })).unwrap()
      } else {
        await dispatch(createBrand(formData)).unwrap()
      }
      onClose()
    } catch (error) {
      console.error('Failed to save brand:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-surface border border-border-default rounded-2xl shadow-modal w-full max-w-md p-4 sm:p-5 flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] overflow-hidden">
        <div className="flex-shrink-0 flex justify-between items-center pb-3 border-b border-border-default mb-3">
          <h3 className="text-h3 font-bold text-text-primary">
            {brand ? 'Edit Brand' : 'Add New Brand'}
          </h3>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary p-1 rounded-lg hover:bg-surface-2 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5 scrollbar-thin">
            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Brand Name
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter brand name"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter brand description"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Website
              </label>
              <input
                type="url"
                name="website"
                value={formData.website}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="https://example.com"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Logo URL
              </label>
              <input
                type="url"
                name="logo"
                value={formData.logo}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-end gap-3 pt-3 border-t border-border-default mt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border-default rounded-xl text-text-secondary hover:bg-surface-2 font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-primary text-white rounded-xl hover:bg-primary-hover font-semibold disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : (brand ? 'Update Brand' : 'Create Brand')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
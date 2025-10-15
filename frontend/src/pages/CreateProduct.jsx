import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { categoriesAPI, productsAPI } from '../services/api'
import { useToast } from '../components/Toast'
import { 
  PhotoIcon,
  ArrowLeftIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

const initialForm = {
  name: '',
  sku: '',
  barcode: '',
  description: '',
  price: '',
  cost: '',
  stockQuantity: '0',
  reorderPoint: '10',
  CategoryId: '',
  expirationDate: 'never',
}

export default function CreateProduct() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [form, setForm] = useState(initialForm)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    categoriesAPI.getAll()
      .then((res) => {
        if (!mounted) return
        setCategories(res.data || [])
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        showToast({
          type: 'error',
          title: 'Error',
          message: 'Failed to load categories. Please try again.'
        })
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  const canSubmit = useMemo(() => {
    return (
      form.name.trim() &&
      form.sku.trim() &&
      form.price !== '' &&
      form.cost !== '' &&
      form.stockQuantity !== '' &&
      form.reorderPoint !== '' &&
      form.CategoryId
    )
  }, [form])

  const onChange = (e) => {
    const { name, value } = e.target
    setForm((f) => ({ ...f, [name]: value }))
  }

  const onImageChange = (e) => {
    const file = e.target.files?.[0]
    setImageFile(file || null)
    if (file) {
      const url = URL.createObjectURL(file)
      setImagePreview(url)
    } else {
      setImagePreview('')
    }
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      // Backend does not handle file uploads yet; image is optional preview-only.
      // If needed later, we can extend backend to accept multipart/form-data.
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || undefined,
        description: form.description.trim() || undefined,
        price: parseFloat(form.price),
        cost: parseFloat(form.cost),
        stockQuantity: parseInt(form.stockQuantity, 10),
        reorderPoint: parseInt(form.reorderPoint, 10),
        CategoryId: parseInt(form.CategoryId, 10),
        ...(form.expirationDate && form.expirationDate !== 'never' ? { expirationDate: form.expirationDate } : {}),
      }

      await productsAPI.create(payload)
      navigate('/products')
    } catch (err) {
      const message = err?.response?.data?.error || err?.message || 'Failed to create product'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-yellow">Create Product</h1>
          <p className="text-sm text-gray-400">Add a new product to your catalog.</p>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-3 py-2 text-sm text-gray-200 hover:bg-black/40 rounded-lg"
        >
          <ArrowLeftIcon className="h-5 w-5" /> Back
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details */}
        <div className="lg:col-span-2 bg-brand-gray border border-brand-yellow/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Product Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input name="name" value={form.name} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SKU</label>
              <input name="sku" value={form.sku} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Barcode (optional)</label>
              <input name="barcode" value={form.barcode} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Category</label>
              <select name="CategoryId" value={form.CategoryId} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow">
                <option value="">Select category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Price</label>
              <input name="price" type="number" step="0.01" value={form.price} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Cost</label>
              <input name="cost" type="number" step="0.01" value={form.cost} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Stock Quantity</label>
              <input name="stockQuantity" type="number" value={form.stockQuantity} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Reorder Point</label>
              <input name="reorderPoint" type="number" value={form.reorderPoint} onChange={onChange} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Expiration Date</label>
              <div className="flex gap-2">
                <select
                  value={form.expirationDate === 'never' ? 'never' : 'date'}
                  onChange={(e) => {
                    const mode = e.target.value
                    setForm((f) => ({ ...f, expirationDate: mode === 'never' ? 'never' : '' }))
                  }}
                  className="px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow"
                >
                  <option value="never">Never</option>
                  <option value="date">Set date…</option>
                </select>
                <input
                  type="date"
                  name="expirationDate"
                  value={form.expirationDate === 'never' ? '' : form.expirationDate}
                  onChange={onChange}
                  disabled={form.expirationDate === 'never'}
                  className="flex-1 px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow disabled:opacity-50"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">Default is "Never"; choose a date to enable.</p>
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-gray-400 mb-1">Description (optional)</label>
            <textarea name="description" value={form.description} onChange={onChange} rows={4} className="w-full px-3 py-2 rounded-lg bg-brand-black text-gray-100 border border-brand-yellow/20 focus:outline-none focus:ring-2 focus:ring-brand-yellow" />
          </div>
        </div>

        {/* Media */}
        <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-200 mb-4">Product Image (optional)</h2>
          <div className="border border-dashed border-brand-yellow/30 rounded-lg p-4 text-center">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="mx-auto max-h-48 rounded-md" />
            ) : (
              <div className="flex flex-col items-center justify-center text-gray-400">
                <PhotoIcon className="h-12 w-12 mb-2" />
                <p className="text-xs">Upload an image to help identify the product</p>
              </div>
            )}
            <div className="mt-4">
              <input id="file" type="file" accept="image/*" onChange={onImageChange} className="hidden" />
              <label htmlFor="file" className="inline-block cursor-pointer px-3 py-2 rounded-lg border border-brand-yellow/30 text-sm text-gray-100 hover:bg-black/40">Choose Image</label>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">Images are optional and currently not uploaded to the server.</p>
        </div>

        {/* Footer actions */}
        <div className="lg:col-span-3 flex items-center justify-end gap-3">
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <ExclamationTriangleIcon className="h-5 w-5" />
              <span>{error}</span>
            </div>
          )}
          <button type="button" onClick={() => navigate('/products')} className="px-4 py-2 rounded-lg border border-brand-yellow/30 text-sm text-gray-100 hover:bg-black/40">Cancel</button>
          <button type="submit" disabled={!canSubmit || loading} className="px-4 py-2 rounded-lg border border-brand-yellow/40 text-sm font-medium text-brand-black bg-brand-yellow hover:bg-brand-yellowDark disabled:opacity-60">
            {loading ? 'Saving...' : 'Create Product'}
          </button>
        </div>
      </form>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useDispatch } from 'react-redux'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createUnit, updateUnit } from '../store/slices/unitsSlice'

export default function UnitModal({ unit, onClose }) {
  const dispatch = useDispatch()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    description: '',
    conversionRate: '1'
  })

  useEffect(() => {
    if (unit) {
      setFormData({
        name: unit.name || '',
        abbreviation: unit.abbreviation || '',
        description: unit.description || '',
        conversionRate: unit.conversionRate?.toString() || '1'
      })
    }
  }, [unit])

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
      const unitData = {
        ...formData,
        conversionRate: parseFloat(formData.conversionRate)
      }
      
      if (unit) {
        await dispatch(updateUnit({ id: unit.id, unitData })).unwrap()
      } else {
        await dispatch(createUnit(unitData)).unwrap()
      }
      onClose()
    } catch (error) {
      console.error('Failed to save unit:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-stone-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-surface border border-border-default rounded-2xl shadow-modal w-full max-w-md p-4 sm:p-5 flex flex-col max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-2.5rem)] overflow-hidden">
        <div className="flex-shrink-0 flex justify-between items-center pb-3 border-b border-border-default mb-3">
          <h3 className="text-h3 font-bold text-text-primary">
            {unit ? 'Edit Unit' : 'Add New Unit'}
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
                Unit Name
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter unit name (e.g., Kilogram)"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Abbreviation
              </label>
              <input
                name="abbreviation"
                value={formData.abbreviation}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter abbreviation (e.g., kg)"
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
                rows={2}
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter unit description"
              />
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-secondary mb-1">
                Conversion Rate
                <span className="text-caption text-text-muted ml-1">
                  (relative to base unit)
                </span>
              </label>
              <input
                type="number"
                name="conversionRate"
                value={formData.conversionRate}
                onChange={handleChange}
                required
                min="0.000001"
                step="any"
                className="w-full px-3 py-2 bg-surface border border-border-default rounded-xl text-text-primary text-small focus:ring-2 focus:ring-primary/30"
                placeholder="Enter conversion rate"
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
              {loading ? 'Saving...' : (unit ? 'Update Unit' : 'Create Unit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
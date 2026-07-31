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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {unit ? 'Edit Unit' : 'Add New Unit'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Name
              </label>
              <input
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter unit name (e.g., Kilogram)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Abbreviation
              </label>
              <input
                name="abbreviation"
                value={formData.abbreviation}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter abbreviation (e.g., kg)"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter unit description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Conversion Rate
                <span className="text-xs text-gray-500 ml-1">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter conversion rate"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : (unit ? 'Update Unit' : 'Create Unit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
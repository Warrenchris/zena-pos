import { Fragment, useEffect } from 'react'
import { Transition } from '@headlessui/react'
import { XMarkIcon, EnvelopeIcon, PhoneIcon, MapPinIcon, CurrencyDollarIcon, ClockIcon } from '@heroicons/react/24/outline'
import useCurrency from '../hooks/useCurrency'

export default function CustomerDetailsCard({ customer, onClose }) {
  const { format } = useCurrency()

  useEffect(() => {
    const onEsc = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  if (!customer) return null

  return (
    <Transition show={!!customer} as={Fragment}>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="transition-opacity duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        </Transition.Child>

        {/* Slide-in Card */}
        <Transition.Child
          as={Fragment}
          enter="transform transition ease-out duration-300"
          enterFrom="translate-y-8 opacity-0"
          enterTo="translate-y-0 opacity-100"
          leave="transform transition ease-in duration-200"
          leaveFrom="translate-y-0 opacity-100"
          leaveTo="translate-y-8 opacity-0"
        >
          <div className="absolute inset-x-0 top-10 mx-auto w-[95%] max-w-3xl bg-brand-black border border-brand-yellow/30 rounded-2xl shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-brand-yellow/20 bg-gradient-to-r from-brand-black to-black rounded-t-2xl">
              <div>
                <h3 className="text-2xl font-bold text-brand-yellow">{customer.name}</h3>
                <p className="text-gray-300 text-sm">Customer Details</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-black/50 text-gray-300 hover:text-white">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <EnvelopeIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Email</p>
                    <p className="text-gray-100">{customer.email || 'No email'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <PhoneIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Phone</p>
                    <p className="text-gray-100">{customer.phone || 'No phone'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <MapPinIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Address</p>
                    <p className="text-gray-100">{customer.address || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CurrencyDollarIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Total Spent</p>
                    <p className="text-gray-100 font-semibold">{format(customer.totalPurchases || 0)}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <ClockIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-gray-400">Last Visit</p>
                    <p className="text-gray-100">{customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never'}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-yellow text-brand-black">{customer.loyaltyPoints || 0} pts</span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-brand-yellow/20 bg-black/40 rounded-b-2xl flex flex-wrap gap-3 justify-end">
              <button className="px-4 py-2 rounded-xl bg-brand-yellow text-brand-black font-semibold hover:bg-yellow-400">New Sale</button>
              <button className="px-4 py-2 rounded-xl border border-brand-yellow/40 text-gray-100 hover:bg-black/50">View Orders</button>
              <button className="px-4 py-2 rounded-xl border border-red-400/40 text-red-300 hover:bg-red-500/10">Remove</button>
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition>
  )
}



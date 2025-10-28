import React, { Fragment } from 'react'
import { useSelector } from 'react-redux'
import { Transition } from '@headlessui/react'
import { XMarkIcon, EnvelopeIcon, PhoneIcon, BriefcaseIcon, BuildingOffice2Icon, CalendarIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline'
import useCurrency from '../hooks/useCurrency'

export default function EmployeeDetailsCard({ employee, onClose }) {
  const { format: formatCurrency } = useCurrency()
  const myShop = useSelector(state => state.shop?.shop)
  if (!employee) return null

  return (
    <Transition show={!!employee} as={Fragment}>
      <div className="fixed inset-0 z-50">
        <Transition.Child as={Fragment} enter="transition-opacity duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="transition-opacity duration-200" leaveFrom="opacity-100" leaveTo="opacity-0">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        </Transition.Child>

        <Transition.Child as={Fragment} enter="transform transition ease-out duration-300" enterFrom="translate-y-8 opacity-0" enterTo="translate-y-0 opacity-100" leave="transform transition ease-in duration-200" leaveFrom="translate-y-0 opacity-100" leaveTo="translate-y-8 opacity-0">
          <div className="absolute inset-x-0 top-10 mx-auto w-[95%] max-w-2xl bg-brand-black border border-yellow-500/30 rounded-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-yellow-500/20 bg-black/40 rounded-t-2xl">
              <div>
                <h3 className="text-xl font-bold text-brand-yellow">{employee.firstName} {employee.lastName}</h3>
                <p className="text-xs text-yellow-200/70">Employee Details</p>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-yellow-500/10 text-yellow-300" aria-label="Close">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-100">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <EnvelopeIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Email</p>
                    <p>{employee.email || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PhoneIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Phone</p>
                    <p>{employee.phone || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <BriefcaseIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Position</p>
                    <p>{employee.position || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <BuildingOffice2Icon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Shop</p>
                    <p>{employee.shop?.name || employee.shopName || myShop?.name || employee.shopId || '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CalendarIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Hire Date</p>
                    <p>{employee.hireDate ? new Date(employee.hireDate).toLocaleDateString() : '-'}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CurrencyDollarIcon className="h-5 w-5 text-brand-yellow mt-0.5" />
                  <div>
                    <p className="text-xs text-yellow-200/70">Salary</p>
                    <p>{formatCurrency(Number(employee.salary||0))}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-yellow-500/20 bg-black/40 rounded-b-2xl flex justify-end gap-2">
              <button onClick={onClose} className="px-3 py-1.5 rounded border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/10">Close</button>
            </div>
          </div>
        </Transition.Child>
      </div>
    </Transition>
  )
}



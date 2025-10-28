import React from 'react';
import { XMarkIcon, UserCircleIcon, MapPinIcon, PhoneIcon, EnvelopeIcon, StarIcon } from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';

const Backdrop = ({ onClose, children }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
    onClick={onClose}
  >
    {/* Stop propagation so clicks inside the card don't close the modal */}
    <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl px-4">
      {children}
    </div>
  </div>
);

export default function CustomerDetailModal({ customer, onClose }) {
  const { format: formatCurrency } = useCurrency();

  if (!customer) return null;

  const statItems = [
    { label: 'Total Spent', value: formatCurrency(Number(customer.totalPurchases || 0)) },
    { label: 'Loyalty Points', value: `${Number(customer.loyaltyPoints || 0).toLocaleString()} pts` },
    { label: 'Last Visit', value: customer.lastVisit ? new Date(customer.lastVisit).toLocaleDateString() : 'Never' }
  ];

  return (
    <Backdrop onClose={onClose}>
      <div className="relative overflow-hidden rounded-2xl border border-yellow-500/30 bg-[#0b0b0b] shadow-2xl shadow-yellow-500/10">
        {/* Accent gradient ring */}
        <div className="pointer-events-none absolute -inset-1 bg-gradient-to-b from-yellow-500/10 via-transparent to-transparent" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-4 border-b border-yellow-500/20 bg-black/40">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 ring-4 ring-yellow-500/20 flex items-center justify-center">
              <UserCircleIcon className="h-7 w-7 text-black" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-yellow-300 leading-tight">{customer.name || 'Unnamed Customer'}</h3>
              <p className="text-xs text-yellow-200/70">Customer Profile</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-yellow-400/70 hover:text-yellow-300 hover:bg-yellow-500/10 transition-colors"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="relative p-6 space-y-6">
          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-black/30 p-3">
              <EnvelopeIcon className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-xs text-yellow-200/60">Email</p>
                <p className="text-yellow-100">{customer.email || 'No email'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-black/30 p-3">
              <PhoneIcon className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-xs text-yellow-200/60">Phone</p>
                <p className="text-yellow-100">{customer.phone || 'No phone'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-yellow-500/20 bg-black/30 p-3 md:col-span-2">
              <MapPinIcon className="h-5 w-5 text-yellow-400" />
              <div>
                <p className="text-xs text-yellow-200/60">Address</p>
                <p className="text-yellow-100">{customer.address || customer.location || 'No address'}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statItems.map((s) => (
              <div key={s.label} className="rounded-xl border border-yellow-500/20 bg-gradient-to-b from-yellow-500/5 to-transparent p-4">
                <p className="text-xs text-yellow-300/70">{s.label}</p>
                <p className="mt-1 text-lg font-semibold text-yellow-300">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Loyalty CTA */}
          <div className="flex items-center justify-between gap-4 rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-4">
            <div className="flex items-center gap-3">
              <StarIcon className="h-6 w-6 text-yellow-400" />
              <div>
                <p className="text-sm font-semibold text-yellow-200">Reward loyal customers</p>
                <p className="text-xs text-yellow-200/70">Offer discounts or perks based on points</p>
              </div>
            </div>
            <button
              className="whitespace-nowrap rounded-lg bg-gradient-to-r from-yellow-400 to-yellow-600 px-4 py-2 text-sm font-semibold text-black shadow-yellow-500/30 shadow hover:from-yellow-500 hover:to-yellow-700 transition-colors"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}



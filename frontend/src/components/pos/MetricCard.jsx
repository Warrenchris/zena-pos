import React from 'react';

/**
 * MetricCard — POS statistics card component
 */
export default function MetricCard({ icon: IconComponent, label, value, subtext, gradient, animated = false }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl backdrop-blur-sm border border-brand-yellow/20 transition-all duration-300 hover:shadow-2xl hover:border-brand-yellow/50 group ${animated ? 'animate-slideIn' : ''}`}>
      {/* Gradient background */}
      <div className={`absolute inset-0 ${gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-300`}></div>

      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${gradient}`}>
            <IconComponent className="h-7 w-7 sm:h-8 sm:w-8 text-brand-black" />
          </div>
          <div className="text-brand-yellow/60 text-xs">TODAY</div>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm sm:text-base text-gray-300 font-medium">{label}</h3>
          <p className="text-2xl sm:text-3xl font-bold text-white">{value}</p>
          {subtext && <p className="text-xs sm:text-sm text-gray-400">{subtext}</p>}
        </div>
      </div>

      {/* Hover accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand-yellow to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300"></div>
    </div>
  );
}

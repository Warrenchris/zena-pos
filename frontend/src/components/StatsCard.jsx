import React from 'react';
import { ArrowTrendingUpIcon } from '@heroicons/react/24/outline';

export default function StatsCard({ icon: Icon, title, value, trend, trendValue, color, suffix }) {
  const gradients = {
    green: {
      bg: 'from-green-400/20 to-green-600/20',
      text: 'from-green-400 to-emerald-400',
      accent: 'text-green-400'
    },
    blue: {
      bg: 'from-blue-400/20 to-blue-600/20',
      text: 'from-blue-400 to-cyan-400',
      accent: 'text-blue-400'
    },
    purple: {
      bg: 'from-purple-400/20 to-purple-600/20',
      text: 'from-purple-400 to-fuchsia-400',
      accent: 'text-purple-400'
    }
  };

  const gradient = gradients[color] || gradients.blue;

  return (
    <div className="bg-brand-gray/50 backdrop-blur-sm border border-brand-yellow/20 rounded-xl p-6 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 bg-gradient-to-br ${gradient.bg} rounded-xl flex items-center justify-center`}>
          <Icon className={`h-6 w-6 ${gradient.accent}`} />
        </div>
        {trend && (
          <div className={`flex items-center space-x-1 ${gradient.accent}`}>
            <ArrowTrendingUpIcon className="h-4 w-4" />
            <span className="text-sm">+{trendValue}</span>
          </div>
        )}
      </div>
      <h3 className="text-lg font-medium text-gray-300">{title}</h3>
      <div className="mt-2 flex items-baseline">
        <p className={`text-3xl font-bold bg-gradient-to-r ${gradient.text} bg-clip-text text-transparent`}>
          {value}
        </p>
        {suffix && <span className="text-gray-500 text-sm ml-2">{suffix}</span>}
      </div>
    </div>
  );
}
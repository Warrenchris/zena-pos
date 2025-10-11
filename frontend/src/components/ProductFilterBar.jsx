import React from 'react';
import { FunnelIcon, ViewColumnsIcon } from '@heroicons/react/24/outline';

export default function ProductFilterBar({ categories, selectedCategory, onCategoryChange, onViewChange, view }) {
  return (
    <div className="bg-brand-gray/50 backdrop-blur-sm border border-brand-yellow/20 rounded-xl p-4 mb-6 flex flex-wrap gap-4 items-center justify-between">
      {/* Categories Filter */}
      <div className="flex flex-wrap gap-2 flex-1">
        <button
          onClick={() => onCategoryChange('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
            selectedCategory === 'all'
              ? 'bg-brand-yellow text-black'
              : 'bg-black/30 text-gray-300 hover:bg-brand-yellow/20'
          }`}
        >
          All Products
        </button>
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => onCategoryChange(category)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              selectedCategory === category
                ? 'bg-brand-yellow text-black'
                : 'bg-black/30 text-gray-300 hover:bg-brand-yellow/20'
            }`}
          >
            {category}
          </button>
        ))}
      </div>

      {/* View Controls */}
      <div className="flex items-center space-x-2">
        <button
          className="p-2 rounded-lg bg-black/30 text-gray-300 hover:bg-brand-yellow/20 transition-colors duration-300"
          onClick={() => onViewChange('grid')}
        >
          <ViewColumnsIcon className="h-5 w-5" />
        </button>
        <button
          className="p-2 rounded-lg bg-black/30 text-gray-300 hover:bg-brand-yellow/20 transition-colors duration-300"
          onClick={() => onViewChange('list')}
        >
          <FunnelIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
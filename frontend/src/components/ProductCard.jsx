import React from 'react';
import { CurrencyDollarIcon, PlusIcon } from '@heroicons/react/24/outline';
import useCurrency from '../hooks/useCurrency';

export default function ProductCard({ product, onAddToCart }) {
  const { format: formatCurrency } = useCurrency();
  return (
    <div className="group bg-brand-gray/50 backdrop-blur-sm border border-brand-yellow/20 rounded-xl p-4 hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
      {/* Product Image */}
      <div className="relative aspect-square rounded-lg overflow-hidden mb-3 bg-black/40">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transform transition-transform group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <CurrencyDollarIcon className="h-12 w-12 text-gray-600" />
          </div>
        )}
        
        {/* Quick Add Button */}
        <button
          onClick={() => onAddToCart(product)}
          className="absolute bottom-2 right-2 bg-brand-yellow text-black p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 hover:bg-yellow-400"
        >
          <PlusIcon className="h-5 w-5" />
        </button>
        
        {/* Stock Badge */}
        {product.stock <= 5 && (
          <div className="absolute top-2 left-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded">
            Low Stock: {product.stock}
          </div>
        )}
      </div>

      {/* Product Info */}
      <div>
        <h3 className="font-medium text-gray-200 mb-1 truncate">{product.name}</h3>
        <p className="text-sm text-gray-400 mb-2 truncate">{product.category}</p>
        <div className="flex justify-between items-center">
          <p className="text-lg font-bold text-brand-yellow">{formatCurrency(product.price)}</p>
          <span className="text-sm text-gray-400">Stock: {product.stock}</span>
        </div>
      </div>
      
      {/* Hover Effect Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-brand-yellow/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl pointer-events-none" />
    </div>
  );
}
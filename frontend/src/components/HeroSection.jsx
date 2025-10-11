import React from 'react';
import { ShoppingCartIcon } from '@heroicons/react/24/outline';

export default function HeroSection({ onStartSale }) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-brand-gray/50 to-black/50 backdrop-blur-sm border border-brand-yellow/20 rounded-xl p-8 mb-8">
      <div className="relative z-10">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-gradient-to-tr from-brand-yellow to-yellow-400 rounded-2xl flex items-center justify-center shadow-lg mb-6 transform transition-transform duration-300 hover:scale-110">
            <ShoppingCartIcon className="h-8 w-8 text-brand-black" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">Ready to Start a Sale?</h2>
          <p className="text-gray-400 mb-6 max-w-lg">
            Begin a new transaction quickly and easily. Add products, apply discounts, and process payments in just a few clicks.
          </p>
          <button
            onClick={onStartSale}
            className="flex items-center px-6 py-3 bg-gradient-to-r from-brand-yellow to-yellow-500 text-black font-semibold rounded-xl shadow-lg hover:from-yellow-500 hover:to-brand-yellow transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-offset-2 focus:ring-offset-brand-black"
          >
            <ShoppingCartIcon className="h-5 w-5 mr-2" />
            Start New Sale
          </button>
        </div>
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-brand-yellow/5 to-transparent opacity-20"></div>
      <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl"></div>
      <div className="absolute -left-20 -top-20 w-64 h-64 bg-brand-yellow/10 rounded-full blur-3xl"></div>
    </div>
  );
}
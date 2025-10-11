import React from 'react';
import {
  ShoppingCartIcon,
  TrashIcon,
  MinusIcon,
  PlusIcon,
  CreditCardIcon
} from '@heroicons/react/24/outline';

export default function CartPanel({ 
  items,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onProceedToPayment,
  total 
}) {
  return (
    <div className="lg:w-96 bg-brand-gray/95 backdrop-blur-sm border-t lg:border-t-0 lg:border-l border-brand-yellow/20 flex flex-col h-[50vh] lg:h-full fixed lg:static bottom-0 left-0 right-0">
      {/* Cart Header */}
      <div className="p-6 border-b border-brand-yellow/20">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-100 flex items-center space-x-2">
            <ShoppingCartIcon className="h-6 w-6" />
            <span>Cart ({items.length})</span>
          </h2>
          {items.length > 0 && (
            <button
              onClick={onClearCart}
              className="text-red-400 hover:text-red-500 transition-colors duration-300"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {items.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <ShoppingCartIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Your cart is empty</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="bg-black/30 rounded-xl p-4 group hover:border-brand-yellow/40 transition-all duration-300">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-medium text-gray-200">{item.name}</h3>
                  <p className="text-brand-yellow text-lg">${item.price.toFixed(2)}</p>
                </div>
                <button
                  onClick={() => onRemoveItem(item)}
                  className="text-gray-500 hover:text-red-500 transition-colors duration-300"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onUpdateQuantity(item, item.quantity - 1)}
                    disabled={item.quantity <= 1}
                    className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <MinusIcon className="h-4 w-4" />
                  </button>
                  <span className="w-8 text-center text-gray-300">{item.quantity}</span>
                  <button
                    onClick={() => onUpdateQuantity(item, item.quantity + 1)}
                    className="p-1 rounded-lg bg-gray-800 text-gray-400 hover:bg-gray-700"
                  >
                    <PlusIcon className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-gray-300">
                  ${(item.price * item.quantity).toFixed(2)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cart Footer */}
      <div className="p-6 border-t border-brand-yellow/20 bg-black/20">
        <div className="mb-4">
          <div className="flex justify-between text-gray-400 mb-2">
            <span>Subtotal</span>
            <span>${total.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold text-gray-100">
            <span>Total</span>
            <span className="text-brand-yellow">${total.toFixed(2)}</span>
          </div>
        </div>

        <button
          onClick={onProceedToPayment}
          disabled={items.length === 0}
          className="w-full py-3 bg-gradient-to-r from-brand-yellow to-yellow-500 text-black font-semibold rounded-xl 
                   shadow-lg hover:from-yellow-500 hover:to-brand-yellow transition-all duration-300 
                   disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          <CreditCardIcon className="h-5 w-5" />
          <span>Proceed to Payment</span>
        </button>
      </div>
    </div>
  );
}
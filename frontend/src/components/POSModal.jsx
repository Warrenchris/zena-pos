import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { XMarkIcon, ShoppingBagIcon, TrashIcon, UserIcon, CreditCardIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { createSale } from '../store/slices/salesSlice';
import Button from './ui/Button';
import Input from './ui/Input';
import Badge from './ui/Badge';
import useCurrency from '../hooks/useCurrency';

export default function POSModal({ products = [], customers = [], onClose }) {
  const dispatch = useDispatch();
  const { format } = useCurrency();
  const [cart, setCart] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const addToCart = (product) => {
    const existingItem = cart.find(item => item.productId === product.id);
    if (existingItem) {
      setCart(cart.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, subtotal: (item.quantity + 1) * item.unitPrice }
          : item
      ));
    } else {
      setCart([...cart, {
        productId: product.id,
        quantity: 1,
        unitPrice: product.price,
        subtotal: product.price
      }]);
    }
  };

  const updateQuantity = (productId, quantity) => {
    if (quantity <= 0) {
      setCart(cart.filter(item => item.productId !== productId));
    } else {
      setCart(cart.map(item => 
        item.productId === productId 
          ? { ...item, quantity, subtotal: item.unitPrice * quantity }
          : item
      ));
    }
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.subtotal, 0);
  };

  const getTax = () => {
    return getSubtotal() * 0.08; // 8% tax
  };

  const getTotal = () => {
    return getSubtotal() + getTax();
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    setLoading(true);
    try {
      const saleData = {
        items: cart,
        customerId: selectedCustomer || null,
        paymentMethod,
        discount: 0,
        tax: getTax(),
        notes: ''
      };

      await dispatch(createSale(saleData));
      setCart([]);
      onClose();
    } catch (error) {
      console.error('Error creating sale:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-stone-950/50 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
      <div className="relative w-full max-w-6xl h-[88vh] border border-border-default shadow-modal rounded-2xl bg-surface flex flex-col lg:flex-row overflow-hidden transition-all duration-200">
        
        {/* Left Side — Catalog & Products */}
        <div className="lg:w-2/3 p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-border-default h-full bg-surface-2/30">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-h2 font-bold text-text-primary tracking-tight">Point of Sale</h2>
              <p className="text-caption text-text-secondary">Quick checkout terminal</p>
            </div>
            <button
              onClick={onClose}
              className="lg:hidden p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Search Filter */}
          <div className="mb-4">
            <Input
              type="search"
              placeholder="Filter products by name or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Products Grid */}
          <div className="flex-1 overflow-y-auto scrollbar-thin grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 pr-1">
            {filteredProducts.length === 0 ? (
              <div className="col-span-full py-12 text-center text-text-muted">
                No matching products found
              </div>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="p-4 border border-border-default rounded-xl text-left bg-surface hover:bg-surface-2 hover:border-primary/40 text-text-primary transition-all duration-150 flex flex-col justify-between shadow-2xs group focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div>
                    <div className="font-semibold text-small line-clamp-2 group-hover:text-primary transition-colors">
                      {product.name}
                    </div>
                    <div className="text-caption text-text-muted mt-0.5 font-mono">{product.sku}</div>
                  </div>
                  <div className="mt-3 pt-2 border-t border-border-default/60 flex items-center justify-between">
                    <span className="text-body font-bold text-primary">{format(product.price)}</span>
                    <Badge variant={product.stockQuantity > 5 ? 'success' : 'warning'} size="sm">
                      {product.stockQuantity} left
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Side — Cart & Payment */}
        <div className="lg:w-1/3 p-6 flex flex-col h-full bg-surface">
          <div className="flex items-center justify-between pb-4 border-b border-border-default mb-4">
            <div className="flex items-center gap-2">
              <ShoppingBagIcon className="h-5 w-5 text-primary" />
              <h3 className="text-h3 font-bold text-text-primary">Order Cart</h3>
            </div>
            <button
              onClick={onClose}
              className="hidden lg:block p-1.5 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-2"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto scrollbar-thin pr-1 mb-4 space-y-2">
            {cart.length === 0 ? (
              <div className="text-center py-16 text-text-muted">
                <ShoppingBagIcon className="h-10 w-10 mx-auto text-text-muted/40 mb-2" />
                <p className="text-small font-medium">Cart is currently empty</p>
                <p className="text-caption text-text-muted mt-1">Tap a product from the left grid to add it</p>
              </div>
            ) : (
              cart.map((item) => {
                const product = products.find(p => p.id === item.productId);
                return (
                  <div key={item.productId} className="flex items-center justify-between p-3 rounded-xl border border-border-default bg-surface-2/40">
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="text-small font-semibold text-text-primary truncate">{product?.name}</div>
                      <div className="text-caption text-text-muted">{format(item.unitPrice)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-7 h-7 rounded-lg bg-surface border border-border-default text-text-primary flex items-center justify-center font-bold hover:bg-surface-2 transition-colors"
                      >
                        -
                      </button>
                      <span className="text-small font-semibold text-text-primary w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-7 h-7 rounded-lg bg-surface border border-border-default text-text-primary flex items-center justify-center font-bold hover:bg-surface-2 transition-colors"
                      >
                        +
                      </button>
                      <button
                        onClick={() => removeFromCart(item.productId)}
                        className="text-danger p-1 hover:bg-danger/10 rounded-lg transition-colors ml-1"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Controls & Customer */}
          <div className="space-y-3 pt-3 border-t border-border-default">
            <div>
              <label className="block text-caption font-semibold text-text-muted uppercase tracking-wider mb-1">
                Customer
              </label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-surface border border-border-default text-text-primary text-small focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Walk-in Customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-caption font-semibold text-text-muted uppercase tracking-wider mb-1">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['cash', 'card', 'check'].map((method) => (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                    className={`py-2 px-3 rounded-xl border text-caption font-semibold uppercase tracking-wider transition-all ${
                      paymentMethod === method
                        ? 'bg-primary text-white border-primary shadow-2xs'
                        : 'bg-surface border-border-default text-text-secondary hover:bg-surface-2'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Totals Summary */}
            <div className="p-3.5 rounded-xl bg-surface-2/60 border border-border-default space-y-1.5 text-small">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span>{format(getSubtotal())}</span>
              </div>
              <div className="flex justify-between text-text-secondary">
                <span>Tax (8%)</span>
                <span>{format(getTax())}</span>
              </div>
              <div className="flex justify-between text-h3 font-bold text-text-primary pt-2 border-t border-border-default">
                <span>Total</span>
                <span className="text-primary">{format(getTotal())}</span>
              </div>
            </div>

            {/* Complete Transaction */}
            <Button
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={cart.length === 0}
              onClick={handleCheckout}
            >
              Complete Sale ({format(getTotal())})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

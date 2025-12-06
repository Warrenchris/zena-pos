import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../store/slices/productsSlice';
import useCurrency from '../hooks/useCurrency';
import {
  PrinterIcon,
  ShoppingCartIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  ShoppingBagIcon,
  ChevronDownIcon,
  CurrencyDollarIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import cashierAPI from '../services/cashierAPI';
import CustomerModal from '../components/CustomerModal';
import PaymentModal from '../components/PaymentModal';
import { useToast } from '../components/Toast';
import { notifySaleComplete, notifyError as notifyErrorUtil } from '../utils/notifications';

// Render premium metric card with consistent styling
const MetricCard = ({ icon, label, value, subtext, gradient, animated = false }) => {
  const IconComponent = icon;
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
};

export default function CashierDashboard() {
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user, token } = useSelector((state) => state.auth);
  const { products, loading: productsLoading } = useSelector((state) => state.products);
  const { showToast } = useToast();

  // Effect to validate authentication
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Sales workflow state
  const [salesMode, setSalesMode] = useState('idle'); // 'idle', 'customer-info', 'product-selection', 'payment'
  const [currentSale, setCurrentSale] = useState({
    customer: {
      name: '',
      location: '',
      phone: '',
      email: ''
    },
    items: [],
    total: 0,
    paymentMethod: 'cash',
    paymentAmount: '',
    notes: ''
  });

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [cashierStats, setCashierStats] = useState({
    today: { totalSales: 0, orderCount: 0 },
    week: { totalSales: 0, orderCount: 0 },
    topProducts: []
  });
  const [recentSales, setRecentSales] = useState([]);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showCart, setShowCart] = useState(false);

  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  // Prevent accidental programmatic clicks; only allow real user-initiated events
  const withTrustedClick = (handler) => (event, ...rest) => {
    if (event && event.nativeEvent && event.nativeEvent.isTrusted === false) return;
    return handler(event, ...rest);
  };

  // Fetch cashier-specific statistics
  const fetchCashierStats = useCallback(async () => {
    setStatsLoading(true);
    setError(null);
    try {
      const [statsResponse, salesResponse] = await Promise.all([
        cashierAPI.getCashierStats(user?.id),
        cashierAPI.getMySales(1, 5)
      ]);
      setCashierStats(statsResponse.data);
      setRecentSales(salesResponse.data.sales || salesResponse.data); // Handle potential pagination structure
    } catch (error) {
      console.error('Error fetching cashier stats:', error);
      setError(
        error.response?.status === 403
          ? 'You do not have permission to view these statistics.'
          : 'Unable to load cashier statistics. Please try again.'
      );
      // Set default values
      setCashierStats({
        today: { totalSales: 0, orderCount: 0 },
        week: { totalSales: 0, orderCount: 0 },
        topProducts: []
      });
      setRecentSales([]);
    } finally {
      setStatsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    dispatch(fetchProducts());
    fetchCashierStats();
  }, [dispatch, fetchCashierStats]);

  // Get unique categories from products
  const categories = useMemo(() => {
    const cats = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];
    return cats;
  }, [products]);

  // Filter products based on search query and category
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.barcode?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;

      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory]);

  // Sales workflow functions
  const startNewSale = () => {
    setSalesMode('customer-info');
    setShowCustomerModal(true);
  };

  const handleCustomerInfoSubmit = (customerData) => {
    setCurrentSale(prev => ({
      ...prev,
      customer: customerData
    }));
    setSalesMode('product-selection');
    setShowCustomerModal(false);
  };

  const skipCustomerInfo = () => {
    setCurrentSale(prev => ({
      ...prev,
      customer: { name: 'Walk-in Customer', location: '', phone: '', email: '' }
    }));
    setSalesMode('product-selection');
    setShowCustomerModal(false);
  };

  // Add item to cart
  const addToCart = (product) => {
    if (salesMode !== 'product-selection') return;

    // Check if product is out of stock
    if (product.stockQuantity <= 0) {
      showToast('This product is out of stock', 'error');
      return;
    }

    // Ensure price is a valid number
    const productPrice = typeof product.price === 'number'
      ? product.price
      : parseFloat(product.price || 0);

    const existingItem = currentSale.items.find(item => item.id === product.id);

    // Check if adding one more would exceed stock
    if (existingItem && existingItem.quantity >= product.stockQuantity) {
      showToast(`Cannot add more. Only ${product.stockQuantity} units available in stock.`, 'warning');
      return;
    }

    let updatedItems;
    if (existingItem) {
      updatedItems = currentSale.items.map(item =>
        item.id === product.id
          ? {
            ...item,
            quantity: item.quantity + 1,
            price: productPrice,
            subtotal: (item.quantity + 1) * productPrice
          }
          : item
      );
    } else {
      updatedItems = [...currentSale.items, {
        ...product,
        price: productPrice,
        quantity: 1,
        subtotal: productPrice
      }];
    }

    const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);

    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: newTotal
    }));

    showToast(`Added ${product.name} to cart`, 'success');
  };

  const removeFromCart = (itemId) => {
    const updatedItems = currentSale.items.filter(item => item.id !== itemId);
    const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: newTotal
    }));
  };

  const updateQuantity = (itemId, newQuantity) => {
    if (newQuantity < 1) return;

    const item = currentSale.items.find(i => i.id === itemId);
    if (!item) return;

    if (newQuantity > item.stockQuantity) {
      showToast(`Cannot exceed stock quantity of ${item.stockQuantity}`, 'warning');
      return;
    }

    const updatedItems = currentSale.items.map(item =>
      item.id === itemId
        ? { ...item, quantity: newQuantity, subtotal: newQuantity * item.price }
        : item
    );

    const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: newTotal
    }));
  };

  const cancelSale = () => {
    if (window.confirm('Are you sure you want to cancel this sale? All progress will be lost.')) {
      setSalesMode('idle');
      setCurrentSale({
        customer: { name: '', location: '', phone: '', email: '' },
        items: [],
        total: 0,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: ''
      });
    }
  };

  const handlePayment = async () => {
    setProcessingPayment(true);
    setPaymentError(null);
    try {
      // Prepare sale data
      const saleData = {
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        totalAmount: currentSale.total,
        paymentMethod: currentSale.paymentMethod,
        paymentAmount: parseFloat(currentSale.paymentAmount),
        // Send customer object as expected by the backend
        customer: {
          name: currentSale.customer.name,
          phone: currentSale.customer.phone,
          email: currentSale.customer.email,
          location: currentSale.customer.location
        },
        notes: currentSale.notes
      };

      // Call API
      const response = await api.post('/api/sales', saleData);

      // Success
      notifySaleComplete(response.data.id);
      setSalesMode('idle');
      setCurrentSale({
        customer: { name: '', location: '', phone: '', email: '' },
        items: [],
        total: 0,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: ''
      });
      setShowPaymentModal(false);
      fetchCashierStats(); // Refresh stats

    } catch (err) {
      console.error('Payment failed:', err);
      setPaymentError(err.response?.data?.message || 'Payment failed. Please try again.');
      notifyErrorUtil('Payment failed');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleBarcodeScan = () => {
    const barcode = prompt('Scan barcode (simulated):');
    if (barcode) {
      const product = products.find(p => p.barcode === barcode || p.sku === barcode);
      if (product) {
        addToCart(product);
      } else {
        showToast('Product not found', 'error');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b0b0c] via-[#0f0f11] to-[#0b0b0c]">
      {/* Animated background elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-20 left-20 w-72 h-72 bg-brand-yellow/5 rounded-full blur-3xl opacity-20"></div>
        <div className="absolute bottom-32 right-20 w-96 h-96 bg-brand-yellow/3 rounded-full blur-3xl opacity-10"></div>
      </div>

      {/* Main Content */}
      <div className="flex flex-col min-h-screen relative z-10">
        {/* Page content wrapper */}
        <div className="flex-1 overflow-hidden">
          {/* Sales Mode Content */}
          {salesMode === 'idle' && (
            <div className="min-h-screen flex flex-col overflow-y-auto">
              {/* Hero Section */}
              <div className="p-4 sm:p-8 md:p-12 text-center">
                <div className="max-w-4xl mx-auto mb-8 sm:mb-12 animate-fadeIn">
                  <div className="inline-flex items-center justify-center space-x-2 mb-6">
                    <div className="h-1 w-8 bg-brand-yellow rounded-full"></div>
                    <p className="text-brand-yellow text-sm font-semibold tracking-wider uppercase">WELCOME</p>
                    <div className="h-1 w-8 bg-brand-yellow rounded-full"></div>
                  </div>

                  <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
                    Ready to <span className="text-brand-yellow">Process</span> Sales?
                  </h1>

                  <p className="text-lg sm:text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
                    Fast, secure, and reliable POS processing. Start a new transaction to begin selling.
                  </p>

                  {/* Primary Action Button */}
                  <div className="mb-8">
                    <button
                      type="button"
                      onClick={withTrustedClick(startNewSale)}
                      className="relative inline-flex items-center justify-center space-x-3 px-8 sm:px-10 py-4 sm:py-5 bg-brand-yellow text-brand-black rounded-2xl sm:rounded-3xl font-bold text-base sm:text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-brand-yellow/50 hover:scale-105 active:scale-95 group"
                    >
                      <ShoppingBagIcon className="h-6 w-6 transition-transform group-hover:translate-y-0.5" />
                      <span>Start New Sale</span>
                      <div className="absolute inset-0 rounded-2xl sm:rounded-3xl bg-brand-yellow opacity-0 group-hover:opacity-20 transition-opacity duration-300 -z-10"></div>
                    </button>
                  </div>
                </div>
              </div>

              {/* Metrics Dashboard */}
              <div className="px-4 sm:px-8 md:px-12 pb-8 sm:pb-12">
                <div className="max-w-6xl mx-auto">
                  {/* Section Header */}
                  <div className="mb-8">
                    <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Your Performance Today</h2>
                    <p className="text-gray-400">Key metrics and insights at a glance</p>
                  </div>

                  {/* Metrics Grid */}
                  {error ? (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-8 text-center animate-fadeIn">
                      <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <XMarkIcon className="h-8 w-8 text-red-400" />
                      </div>
                      <p className="text-red-300 text-lg font-medium">{error}</p>
                      <button
                        onClick={withTrustedClick(fetchCashierStats)}
                        className="mt-4 px-6 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors text-sm font-medium"
                      >
                        Try Again
                      </button>
                    </div>
                  ) : statsLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="rounded-2xl bg-gradient-to-br from-brand-gray to-brand-gray/50 border border-brand-yellow/10 p-6 sm:p-8 animate-pulse">
                          <div className="space-y-3">
                            <div className="w-14 h-14 bg-brand-yellow/10 rounded-2xl"></div>
                            <div className="h-4 w-24 bg-brand-yellow/10 rounded"></div>
                            <div className="h-8 w-32 bg-brand-yellow/20 rounded"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                      <MetricCard
                        icon={CurrencyDollarIcon}
                        label="Today's Revenue"
                        value={formatCurrency(cashierStats.today.totalSales)}
                        subtext={`From ${cashierStats.today.orderCount} sales`}
                        gradient="bg-gradient-to-br from-brand-green to-[#059669]"
                        animated
                      />

                      <MetricCard
                        icon={ShoppingCartIcon}
                        label="Total Transactions"
                        value={cashierStats.today.orderCount}
                        subtext="Completed today"
                        gradient="bg-gradient-to-br from-brand-blue to-[#2563eb]"
                        animated
                      />

                      <MetricCard
                        icon={ChartBarIcon}
                        label="This Week's Revenue"
                        value={formatCurrency(cashierStats.week.totalSales)}
                        subtext={`${cashierStats.week.orderCount} transactions`}
                        gradient="bg-gradient-to-br from-brand-cyan to-[#06b6d4]"
                        animated
                      />

                      <MetricCard
                        icon={ShoppingBagIcon}
                        label="Items Sold"
                        value={(currentSale.items || []).reduce((sum, item) => sum + item.quantity, 0)}
                        subtext="Current session"
                        gradient="bg-gradient-to-br from-brand-amber to-[#d97706]"
                        animated
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Recent Activity Section */}
              {recentSales.length > 0 && (
                <div className="px-4 sm:px-8 md:px-12 pb-12">
                  <div className="max-w-6xl mx-auto">
                    <div className="mb-6">
                      <h3 className="text-2xl font-bold text-white mb-2">Recent Sales</h3>
                      <p className="text-gray-400">Your latest transactions</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recentSales.slice(0, 3).map((sale, idx) => (
                        <div
                          key={idx}
                          className="group bg-gradient-to-br from-brand-gray/50 to-brand-gray/30 border border-brand-yellow/20 rounded-2xl p-6 hover:border-brand-yellow/40 transition-all duration-300 hover:shadow-lg"
                          style={{ animationDelay: `${idx * 0.1}s` }}
                        >
                          <div className="flex items-start justify-between mb-4">
                            <div>
                              <p className="text-sm text-gray-400">Receipt #</p>
                              <p className="text-lg font-bold text-white">{sale?.id || 'N/A'}</p>
                            </div>
                            <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center">
                              <ShoppingCartIcon className="h-5 w-5 text-green-400" />
                            </div>
                          </div>
                          <div className="border-t border-brand-yellow/10 pt-4">
                            <p className="text-sm text-gray-400 mb-1">Total Amount</p>
                            <p className="text-2xl font-bold text-brand-yellow">{formatCurrency(sale?.total || 0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {
            salesMode === 'product-selection' && (
              <div className="flex flex-col lg:flex-row h-screen">
                {/* POS Terminal - Main Area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Sale Header - Premium Design */}
                  <div className="bg-gradient-to-r from-[#0f0f11]/80 to-[#0b0b0c]/40 backdrop-blur-md border-b border-brand-yellow/20 p-4 sm:p-6 shadow-2xl sticky top-0 z-30">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Current Sale</p>
                          <h2 className="text-xl font-bold text-white">{currentSale.customer.name}</h2>
                          {currentSale.customer.location && (
                            <p className="text-sm text-gray-300">📍 {currentSale.customer.location}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={withTrustedClick(cancelSale)}
                          className="px-4 py-2 text-gray-300 hover:bg-brand-yellow/10 hover:text-brand-yellow border border-brand-yellow/20 rounded-xl transition-all duration-200 text-sm font-medium hover:border-brand-yellow/40"
                        >
                          ✕ Cancel
                        </button>
                        {currentSale.items.length > 0 && (
                          <button
                            type="button"
                            onClick={withTrustedClick(() => setShowPaymentModal(true))}
                            className="px-5 py-2 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark transition-all duration-200 text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
                          >
                            ✓ Proceed to Payment
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters - Premium Design */}
                  <div className="p-4 sm:p-6 space-y-4 bg-[#0b0b0c]/30 border-b border-brand-yellow/20">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-yellow/20 to-transparent rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"></div>
                        <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-brand-yellow/60 group-focus-within:text-brand-yellow transition-colors" />
                        <input
                          type="text"
                          placeholder="Search products, barcode, or SKU..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="relative w-full pl-12 pr-4 py-3 sm:py-4 bg-[#0b0b0c]/50 text-brand-text border border-brand-yellow/20 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-transparent transition-all duration-200 placeholder-gray-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={withTrustedClick(handleBarcodeScan)}
                        className="group relative px-5 sm:px-6 py-3 sm:py-4 bg-gradient-to-r from-brand-yellow to-brand-yellowDark text-brand-black rounded-xl hover:shadow-2xl hover:shadow-brand-yellow/40 transition-all duration-300 flex items-center justify-center space-x-2 font-bold text-sm sm:text-base hover:scale-105 active:scale-95"
                      >
                        <QrCodeIcon className="h-5 w-5 transition-transform group-hover:rotate-12" />
                        <span className="hidden sm:inline">Scan</span>
                      </button>
                    </div>

                    {/* Category Filter - Horizontal Scroll */}
                    <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-hide">
                      {categories.map(category => (
                        <button
                          type="button"
                          key={category}
                          onClick={withTrustedClick(() => setSelectedCategory(category))}
                          className={`px-5 py-2 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap text-sm border ${selectedCategory === category
                            ? 'bg-brand-yellow text-brand-black border-brand-yellow shadow-lg shadow-brand-yellow/30'
                            : 'bg-[#0b0b0c]/40 text-brand-text border-brand-yellow/20 hover:border-brand-yellow/40 hover:bg-[#0b0b0c]/60'
                            }`}
                        >
                          {category === 'all' ? '🎯 All' : category}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Grid - Premium Card Design */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 sm:gap-4">
                      {productsLoading ? (
                        Array.from({ length: 10 }).map((_, i) => (
                          <div key={i} className="bg-brand-gray/30 border border-brand-yellow/10 rounded-2xl overflow-hidden animate-pulse">
                            <div className="w-full aspect-square bg-brand-black/40"></div>
                            <div className="p-4 space-y-2">
                              <div className="h-4 bg-brand-yellow/10 rounded w-3/4"></div>
                              <div className="h-3 bg-brand-yellow/10 rounded w-1/2"></div>
                              <div className="h-6 bg-brand-yellow/20 rounded w-2/3 mt-3"></div>
                            </div>
                          </div>
                        ))
                      ) : filteredProducts.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-20 h-20 bg-brand-yellow/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <MagnifyingGlassIcon className="h-10 w-10 text-brand-yellow" />
                          </div>
                          <h3 className="text-xl font-bold text-brand-text mb-2">No Products Found</h3>
                          <p className="text-gray-400 max-w-xs">Try adjusting your search or category filter to find what you need</p>
                        </div>
                      ) : (
                        filteredProducts.map((product, idx) => (
                          <button
                            type="button"
                            key={product.id}
                            onClick={withTrustedClick(() => addToCart(product))}
                            disabled={product.stockQuantity <= 0}
                            className="group relative h-full bg-gradient-to-br from-[#0f0f11]/50 to-[#0b0b0c]/50 border border-brand-yellow/20 rounded-2xl overflow-hidden hover:border-brand-yellow/50 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-brand-yellow/20 hover:shadow-2xl hover:shadow-brand-yellow/20 hover:scale-105 active:scale-95"
                            style={{ transitionDelay: `${idx * 0.02}s` }}
                          >
                            {/* Stock Badge */}
                            {product.stockQuantity <= 5 && product.stockQuantity > 0 && (
                              <div className="absolute top-3 right-3 z-10 bg-red-500/90 px-3 py-1 rounded-lg text-xs font-bold text-white flex items-center space-x-1">
                                <span>⚠️</span>
                                <span>Low Stock</span>
                              </div>
                            )}
                            {product.stockQuantity <= 0 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                                <div className="text-center">
                                  <p className="text-sm font-bold text-white mb-1">OUT OF STOCK</p>
                                </div>
                              </div>
                            )}

                            {/* Image Container */}
                            <div className="relative w-full aspect-square bg-gradient-to-br from-[#0b0b0c]/60 to-[#0b0b0c]/40 flex items-center justify-center overflow-hidden">
                              {product.image ? (
                                <img
                                  src={product.image}
                                  alt={product.name}
                                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                />
                              ) : (
                                <div className="text-5xl group-hover:scale-125 transition-transform duration-300">📦</div>
                              )}
                              {/* Overlay on hover */}
                              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                            </div>

                            {/* Content */}
                            <div className="p-3 sm:p-4 relative">
                              <h3 className="font-bold text-brand-text text-sm line-clamp-2 group-hover:text-white transition-colors mb-1">
                                {product.name}
                              </h3>
                              <p className="text-xs text-gray-400 mb-3">SKU: {product.sku || 'N/A'}</p>

                              {/* Price and Action */}
                              <div className="flex items-end justify-between">
                                <div>
                                  <p className="text-xs text-gray-400 mb-1">Price</p>
                                  <p className="text-lg sm:text-xl font-black text-brand-yellow">
                                    {formatCurrency(typeof product.price === 'number'
                                      ? product.price
                                      : parseFloat(product.price || 0))}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-gray-400 mb-1">Stock</p>
                                  <p className={`font-bold text-sm ${product.stockQuantity > 5 ? 'text-green-400' : product.stockQuantity > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                                    {product.stockQuantity}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Add to Cart Indicator */}
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-transparent via-brand-yellow to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left"></div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Cart Panel - Mobile Bottom Sheet / Desktop Sidebar */}
                <div className={`${showCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
                  } fixed lg:static bottom-0 left-0 right-0 lg:right-auto lg:w-96 bg-gradient-to-b from-[#0f0f11]/90 to-[#0b0b0c]/70 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-brand-yellow/20 flex flex-col h-[60vh] lg:h-full transition-transform duration-300 ease-out z-50 lg:z-auto shadow-2xl`
                }>
                  {/* Cart Header */}
                  <div className="p-4 sm:p-6 border-b border-brand-yellow/20 bg-gradient-to-r from-[#0f0f11]/80 to-[#0b0b0c]/40">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-brand-yellow/20 rounded-xl flex items-center justify-center">
                          <ShoppingCartIcon className="h-5 w-5 text-brand-yellow" />
                        </div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Shopping Cart</p>
                          <p className="text-lg font-bold text-brand-text">{currentSale.items.length} items</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {currentSale.items.length > 0 && (
                          <button
                            type="button"
                            onClick={withTrustedClick(() => setCurrentSale(prev => ({ ...prev, items: [], total: 0 })))}
                            className="w-10 h-10 flex items-center justify-center text-brand-yellow/60 hover:bg-brand-yellow/20 hover:text-brand-yellow border border-brand-yellow/20 rounded-xl transition-all duration-200"
                            title="Clear cart"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="lg:hidden w-10 h-10 flex items-center justify-center text-brand-yellow/60 hover:text-brand-yellow hover:bg-brand-yellow/10 rounded-xl transition-all"
                          onClick={withTrustedClick(() => setShowCart(!showCart))}
                        >
                          <ChevronDownIcon className={`h-5 w-5 transition-transform duration-300 ${showCart ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Cart Items */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
                    {
                      currentSale.items.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center py-8">
                          <div className="w-16 h-16 bg-brand-yellow/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <ShoppingCartIcon className="h-8 w-8 text-brand-yellow/60" />
                          </div>
                          <p className="text-gray-300 font-medium mb-1">Cart is Empty</p>
                          <p className="text-sm text-gray-400">Add products to get started</p>
                        </div>
                      ) : (
                        currentSale.items.map((item, idx) => (
                          <div
                            key={item.id}
                            className="group bg-gradient-to-br from-[#0b0b0c]/60 to-[#0b0b0c]/40 rounded-xl p-4 hover:from-[#0b0b0c]/80 hover:to-[#0b0b0c]/60 transition-all duration-200 border border-brand-yellow/10 hover:border-brand-yellow/30"
                            style={{ animationDelay: `${idx * 0.05}s` }}
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-bold text-brand-text text-sm group-hover:text-white transition-colors line-clamp-2">{item.name}</h4>
                                <div className="flex items-center space-x-1 mt-1">
                                  <p className="text-xs text-gray-400">
                                    {formatCurrency(parseFloat(item.price || 0))}/ea
                                  </p>
                                  {item.quantity >= item.stockQuantity && (
                                    <span className="text-xs text-yellow-400 font-semibold">📍 Max</span>
                                  )}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={withTrustedClick(() => removeFromCart(item.id))}
                                className="w-8 h-8 flex items-center justify-center text-brand-yellow/60 hover:bg-brand-yellow/20 hover:text-brand-yellow border border-brand-yellow/20 rounded-lg transition-all duration-200"
                                title="Remove item"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </div>

                            {/* Quantity Control */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-1 bg-[#0b0b0c]/40 rounded-lg p-1">
                                <button
                                  type="button"
                                  onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity - 1))}
                                  className="w-7 h-7 bg-brand-yellow text-brand-black rounded-md flex items-center justify-center transition-colors disabled:opacity-40 hover:bg-brand-yellowDark font-bold"
                                  disabled={item.quantity <= 1}
                                  title="Decrease quantity"
                                >
                                  <MinusIcon className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    if (!isNaN(val)) {
                                      updateQuantity(item.id, val);
                                    }
                                  }}
                                  min="1"
                                  max={item.stockQuantity}
                                  className="w-12 px-1 py-1 text-center bg-transparent text-white text-sm font-bold focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity + 1))}
                                  className="w-7 h-7 bg-brand-yellow text-brand-black rounded-md flex items-center justify-center transition-colors disabled:opacity-40 hover:bg-brand-yellowDark font-bold"
                                  disabled={item.quantity >= item.stockQuantity}
                                  title="Increase quantity"
                                >
                                  <PlusIcon className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-brand-yellow text-lg">
                                  {formatCurrency(parseFloat((item.price * item.quantity).toFixed(2)))}
                                </p>
                                <p className="text-xs text-gray-400">
                                  {item.quantity}x @ {formatCurrency(parseFloat(item.price || 0))}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      )
                    }
                  </div>

                  {/* Total and Checkout */}
                  {
                    currentSale.items.length > 0 && (
                      <div className="p-4 sm:p-6 border-t border-brand-yellow/20 bg-gradient-to-t from-[#0f0f11] to-[#0b0b0c]/50 space-y-4">
                        {/* Summary */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300">Subtotal:</span>
                            <span className="text-brand-text font-semibold">
                              {formatCurrency(currentSale.items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0))}
                            </span>
                          </div>
                          <div className="h-px bg-gradient-to-r from-transparent via-brand-yellow/20 to-transparent"></div>
                          <div className="flex justify-between items-center">
                            <span className="text-base font-bold text-brand-text">Total:</span>
                            <span className="text-2xl sm:text-3xl font-black text-brand-yellow">
                              {formatCurrency(currentSale.total)}
                            </span>
                          </div>
                        </div>

                        {/* Checkout Button */}
                        <button
                          type="button"
                          onClick={withTrustedClick(() => setShowPaymentModal(true))}
                          className="w-full group relative py-4 sm:py-5 bg-gradient-to-r from-brand-yellow to-brand-yellowDark text-brand-black rounded-xl sm:rounded-2xl font-bold text-base sm:text-lg shadow-lg hover:shadow-2xl hover:shadow-brand-yellow/40 transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center space-x-2"
                        >
                          <span>💳 Proceed to Payment</span>
                          <ArrowTrendingUpIcon className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                        </button>
                      </div>
                    )
                  }
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* Mobile Cart Toggle Button */}
      {
        salesMode === 'product-selection' && (
          <div className="lg:hidden fixed bottom-6 right-6 z-40">
            <button
              type="button"
              onClick={withTrustedClick(() => setShowCart(!showCart))}
              className="group relative w-16 h-16 bg-gradient-to-br from-brand-yellow to-brand-yellowDark text-brand-black rounded-2xl shadow-2xl hover:shadow-brand-yellow/50 transition-all duration-300 flex items-center justify-center hover:scale-110 active:scale-95"
            >
              <ShoppingCartIcon className="h-7 w-7" />
              {currentSale.items.length > 0 && (
                <span className="absolute -top-3 -right-3 bg-red-500 text-white text-xs font-bold rounded-full h-7 w-7 flex items-center justify-center shadow-lg animate-bounce-gentle">
                  {currentSale.items.length}
                </span>
              )}
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-2xl bg-brand-yellow opacity-0 group-hover:opacity-20 transition-opacity duration-300 -z-10"></div>
            </button>
          </div>
        )
      }

      {/* Customer Information Modal */}
      <CustomerModal
        isOpen={showCustomerModal}
        onClose={() => {
          setShowCustomerModal(false);
          setSalesMode('idle');
        }}
        onSubmit={handleCustomerInfoSubmit}
        onSkip={skipCustomerInfo}
      />

      {/* Payment Modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        currentSale={currentSale}
        onUpdateSale={setCurrentSale}
        onPayment={handlePayment}
        processingPayment={processingPayment}
        paymentError={paymentError}
        setPaymentError={setPaymentError}
      />

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 lg:bottom-8 lg:right-8 flex flex-col space-y-3 z-40">
        <button
          type="button"
          onClick={withTrustedClick(() => window.print())}
          className="group relative w-14 h-14 lg:w-16 lg:h-16 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 flex items-center justify-center text-gray-700 hover:text-blue-600 hover:bg-white active:scale-95"
          title="Print Last Receipt"
        >
          <PrinterIcon className="h-6 w-6 lg:h-7 lg:w-7" />
          <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-40 transition-opacity duration-300 -z-10"></div>
        </button>
        <button
          type="button"
          onClick={withTrustedClick(() => setShowStatsPanel(!showStatsPanel))}
          className="group relative w-14 h-14 lg:w-16 lg:h-16 bg-white/90 backdrop-blur-md rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 flex items-center justify-center text-gray-700 hover:text-green-600 hover:bg-white active:scale-95"
          title="View Performance Stats"
        >
          <ChartBarIcon className="h-6 w-6 lg:h-7 lg:w-7" />
          <div className="absolute inset-0 rounded-2xl bg-white opacity-0 group-hover:opacity-40 transition-opacity duration-300 -z-10"></div>
        </button>
      </div>

      {/* Stats Panel Overlay - Premium Design */}
      {
        showStatsPanel && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-end" onClick={withTrustedClick(() => setShowStatsPanel(false))}>
            <div className="absolute right-4 sm:right-8 top-24 w-96 max-w-[calc(100vw-2rem)] bg-gradient-to-br from-[#0f0f11] to-[#0b0b0c]/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-brand-yellow/20 p-6 sm:p-8 animate-slideIn" onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-xs text-brand-yellow uppercase tracking-widest font-bold">Performance Dashboard</p>
                  <h3 className="text-3xl font-black text-brand-text mt-1">My Stats</h3>
                </div>
                <button
                  onClick={withTrustedClick(() => setShowStatsPanel(false))}
                  className="w-10 h-10 flex items-center justify-center text-brand-yellow/60 hover:text-brand-yellow hover:bg-brand-yellow/10 rounded-xl transition-all duration-200"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Today's Sales */}
                <div className="group relative bg-gradient-to-br from-brand-green/20 to-brand-green/10 border border-brand-green/30 hover:border-brand-green/60 rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-default">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-brand-green/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-xs text-brand-green/80 uppercase tracking-wide font-semibold mb-1">Today's Revenue</p>
                      <p className="text-3xl font-black text-brand-text mb-1">{formatCurrency(cashierStats?.today?.totalSales || 0)}</p>
                      <p className="text-sm text-brand-green/70">{cashierStats?.today?.orderCount || 0} completed transactions</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-brand-green/20 flex items-center justify-center">
                      <ArrowTrendingUpIcon className="h-6 w-6 text-brand-green" />
                    </div>
                  </div>
                </div>

                {/* This Week */}
                <div className="group relative bg-gradient-to-br from-brand-cyan/20 to-brand-cyan/10 border border-brand-cyan/30 hover:border-brand-cyan/60 rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-default">
                  <div className="absolute top-0 right-0 w-20 h-20 bg-brand-cyan/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
                  <div className="relative flex items-start justify-between">
                    <div>
                      <p className="text-xs text-brand-cyan/80 uppercase tracking-wide font-semibold mb-1">Weekly Revenue</p>
                      <p className="text-3xl font-black text-brand-text mb-1">{formatCurrency(cashierStats?.week?.totalSales || 0)}</p>
                      <p className="text-sm text-brand-cyan/70">{cashierStats?.week?.orderCount || 0} transactions this week</p>
                    </div>
                    <div className="w-12 h-12 rounded-xl bg-brand-cyan/20 flex items-center justify-center">
                      <ChartBarIcon className="h-6 w-6 text-brand-cyan" />
                    </div>
                  </div>
                </div>

                {/* Recent Sales */}
                <div className="bg-gradient-to-br from-[#0b0b0c]/60 to-[#0b0b0c]/40 border border-brand-yellow/10 rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-bold text-brand-text text-lg">Recent Sales</h4>
                    <ShoppingCartIcon className="h-5 w-5 text-brand-yellow/60" />
                  </div>
                  <div className="space-y-2">
                    {(recentSales || []).slice(0, 4).map((sale, index) => (
                      <div key={index} className="flex justify-between items-center p-3 bg-[#0b0b0c]/30 hover:bg-[#0b0b0c]/50 rounded-lg transition-colors group">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-brand-green group-hover:animate-pulse"></div>
                          <span className="text-sm text-gray-300 font-medium">Receipt #{sale?.id || 'N/A'}</span>
                        </div>
                        <span className="font-bold text-brand-yellow">{formatCurrency(sale?.total || 0)}</span>
                      </div>
                    ))}
                    {recentSales.length === 0 && (
                      <div className="text-center py-6">
                        <ShoppingCartIcon className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                        <p className="text-gray-400 text-sm">No recent sales</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div>
  );
}
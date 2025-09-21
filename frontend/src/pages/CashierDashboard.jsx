import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchProducts } from '../store/slices/productsSlice';
import { 
  XMarkIcon, 
  PrinterIcon, 
  ClockIcon,
  ShoppingCartIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
  DevicePhoneMobileIcon,
  BanknotesIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  EyeIcon,
  ShoppingBagIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import cashierAPI from '../services/cashierAPI';
import CustomerModal from '../components/CustomerModal';

export default function CashierDashboard() {
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const { products, loading: productsLoading } = useSelector((state) => state.products);
  
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    dispatch(fetchProducts());
    fetchCashierStats();
  }, [dispatch]);

  // Fetch cashier-specific statistics
  const fetchCashierStats = async () => {
    try {
      const response = await cashierAPI.getCashierStats(user?.id);
      setCashierStats(response.data);
    } catch (error) {
      console.error('Error fetching cashier stats:', error);
    }
  };

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
    
    const existingItem = currentSale.items.find(item => item.id === product.id);
    const updatedItems = existingItem
      ? currentSale.items.map(item =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
        )
      : [...currentSale.items, { ...product, quantity: 1 }];
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    }));
  };

  // Remove item from cart
  const removeFromCart = (productId) => {
    const updatedItems = currentSale.items.filter(item => item.id !== productId);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    }));
  };

  // Update item quantity
  const updateQuantity = (productId, newQuantity) => {
    if (newQuantity < 1) return;
    const updatedItems = currentSale.items.map(item =>
      item.id === productId
        ? { ...item, quantity: newQuantity }
        : item
    );
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    }));
  };

  // Cancel current sale
  const cancelSale = () => {
    setSalesMode('idle');
    setCurrentSale({
      customer: { name: '', location: '', phone: '', email: '' },
      items: [],
      total: 0,
      paymentMethod: 'cash',
      paymentAmount: '',
      notes: ''
    });
  };

  // Handle payment
  const handlePayment = async () => {
    if (!currentSale.paymentAmount || parseFloat(currentSale.paymentAmount) < currentSale.total) {
      alert('Invalid payment amount');
      return;
    }

    try {
      const saleData = {
        customer: currentSale.customer,
        total: currentSale.total,
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        paymentAmount: parseFloat(currentSale.paymentAmount),
        paymentMethod: currentSale.paymentMethod,
        notes: currentSale.notes,
        employeeId: user?.id
      };

      const response = await cashierAPI.createSale(saleData);
      const sale = response.data;
      
      // Print receipt
      printReceipt(sale);
      
      // Reset sale state
      cancelSale();
      setShowPaymentModal(false);
      
      // Update recent sales and stats
      setRecentSales([sale, ...recentSales.slice(0, 4)]);
      fetchCashierStats();
    } catch (error) {
      alert('Error processing sale: ' + error.message);
    }
  };

  const printReceipt = (sale) => {
    const receiptWindow = window.open('', '_blank');
    receiptWindow.document.write(`
      <html>
        <head>
          <title>Receipt</title>
          <style>
            body { font-family: 'Courier New', monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
            .header { text-align: center; margin-bottom: 20px; border-bottom: 1px dashed #333; padding-bottom: 10px; }
            .customer { margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 5px; }
            .item { margin: 8px 0; display: flex; justify-content: space-between; }
            .total { margin-top: 20px; border-top: 1px solid #333; padding-top: 10px; }
            .footer { text-align: center; margin-top: 20px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${user?.shop?.name || 'Store Name'}</h2>
            <p>Receipt #${sale.id || 'N/A'}</p>
            <p>${new Date().toLocaleString()}</p>
            <p>Cashier: ${user?.name || 'N/A'}</p>
          </div>
          ${currentSale.customer.name !== 'Walk-in Customer' ? `
            <div class="customer">
              <p><strong>Customer:</strong> ${currentSale.customer.name}</p>
              ${currentSale.customer.location ? `<p><strong>Location:</strong> ${currentSale.customer.location}</p>` : ''}
              ${currentSale.customer.phone ? `<p><strong>Phone:</strong> ${currentSale.customer.phone}</p>` : ''}
          </div>
          ` : ''}
          ${currentSale.items.map(item => `
            <div class="item">
              <span>${item.name} x ${item.quantity}</span>
              <span>$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          `).join('')}
          <div class="total">
            <div class="item"><strong>Total:</strong> <strong>$${currentSale.total.toFixed(2)}</strong></div>
            <div class="item">Paid: $${parseFloat(currentSale.paymentAmount).toFixed(2)}</div>
            <div class="item">Change: $${(parseFloat(currentSale.paymentAmount) - currentSale.total).toFixed(2)}</div>
            <div class="item">Method: ${currentSale.paymentMethod.toUpperCase()}</div>
          </div>
          <div class="footer">
            <p>Thank you for your purchase!</p>
            <p>Visit us again soon!</p>
          </div>
        </body>
      </html>
    `);
    receiptWindow.document.close();
    receiptWindow.print();
  };

  // Handle barcode scanning simulation
  const handleBarcodeScan = () => {
    const barcode = prompt('Enter barcode or scan:');
    if (barcode) {
      const product = products.find(p => p.barcode === barcode);
      if (product) {
        addToCart(product);
      } else {
        alert('Product not found!');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Simplified Sidebar */}
      <div className={`fixed left-0 top-0 h-full bg-white/90 backdrop-blur-md shadow-xl border-r border-gray-200/50 z-30 transition-all duration-300 ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="p-4 border-b border-gray-200/50">
          <div className="flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <ShoppingBagIcon className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-800">POS Terminal</span>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <div className="w-4 h-4 flex flex-col justify-center space-y-1">
                <div className="w-full h-0.5 bg-gray-600"></div>
                <div className="w-full h-0.5 bg-gray-600"></div>
                <div className="w-full h-0.5 bg-gray-600"></div>
              </div>
            </button>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => setShowStatsPanel(!showStatsPanel)}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              showStatsPanel ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChartBarIcon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">My Stats</span>}
          </button>

          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-all duration-200">
            <ClockIcon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Sales History</span>}
          </button>

          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-all duration-200">
            <UserIcon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Profile</span>}
          </button>

          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-100 transition-all duration-200">
            <Cog6ToothIcon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Settings</span>}
          </button>
        </nav>

        <div className="absolute bottom-4 left-4 right-4">
          <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all duration-200">
            <ArrowRightOnRectangleIcon className="h-5 w-5 flex-shrink-0" />
            {!sidebarCollapsed && <span className="font-medium">Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className={`transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b border-gray-200/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Point of Sale</h1>
              <p className="text-gray-600">Welcome back, {user?.name || 'Cashier'}</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-500">Today's Sales</p>
                <p className="text-xl font-bold text-green-600">${cashierStats.today.totalSales.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">{cashierStats.today.orderCount}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Sales Mode Content */}
        {salesMode === 'idle' && (
          <div className="p-6">
            {/* Welcome Screen with New Sale Button */}
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-24 h-24 bg-gradient-to-r from-blue-600 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <ShoppingBagIcon className="h-12 w-12 text-white" />
                </div>
                <h2 className="text-3xl font-bold text-gray-800 mb-4">Ready to Start a Sale?</h2>
                <p className="text-gray-600 mb-8">Click the button below to begin processing a new transaction</p>
                
                <button
                  onClick={startNewSale}
                  className="px-8 py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-2xl font-bold text-xl hover:from-green-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Start New Sale
                </button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Today's Revenue</h3>
                  <p className="text-2xl font-bold text-green-600">${cashierStats.today.totalSales.toFixed(2)}</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ShoppingCartIcon className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">Transactions</h3>
                  <p className="text-2xl font-bold text-blue-600">{cashierStats.today.orderCount}</p>
                </div>
                
                <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ChartBarIcon className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800">This Week</h3>
                  <p className="text-2xl font-bold text-purple-600">${cashierStats.week.totalSales.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {salesMode === 'product-selection' && (
          <div className="flex">
            {/* POS Terminal - Main Area */}
            <div className="flex-1 p-6">
              {/* Sale Header */}
              <div className="mb-6 bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-800">Current Sale</h2>
                    <p className="text-gray-600">
                      Customer: <span className="font-medium">{currentSale.customer.name}</span>
                      {currentSale.customer.location && (
                        <span className="ml-2">• {currentSale.customer.location}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={cancelSale}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      Cancel Sale
                    </button>
                    {currentSale.items.length > 0 && (
                      <button
                        onClick={() => setShowPaymentModal(true)}
                        className="px-6 py-2 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-blue-700 transition-all duration-200"
                      >
                        Proceed to Payment
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Search and Filters */}
              <div className="mb-6 space-y-4">
                <div className="flex space-x-4">
                  <div className="flex-1 relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
                      placeholder="Search products by name, barcode, or SKU..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <button
                    onClick={handleBarcodeScan}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
                  >
                    <QrCodeIcon className="h-5 w-5" />
                    <span>Scan Barcode</span>
                  </button>
                </div>

                {/* Category Filter */}
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {categories.map(category => (
                    <button
                      key={category}
                      onClick={() => setSelectedCategory(category)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 whitespace-nowrap ${
                        selectedCategory === category
                          ? 'bg-blue-600 text-white shadow-lg'
                          : 'bg-white/80 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                      }`}
                    >
                      {category === 'all' ? 'All Products' : category}
                    </button>
                  ))}
                </div>
        </div>
        
              {/* Product Grid */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {productsLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="bg-white/80 rounded-xl p-4 animate-pulse">
                      <div className="w-full h-32 bg-gray-200 rounded-lg mb-3"></div>
                      <div className="h-4 bg-gray-200 rounded mb-2"></div>
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    </div>
                  ))
          ) : (
            filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                      disabled={product.stockQuantity <= 0}
                      className="group bg-white/80 backdrop-blur-sm rounded-xl p-4 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    >
                      <div className="aspect-square w-full bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-4xl text-gray-400">📦</div>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-800 text-sm mb-1 line-clamp-2">{product.name}</h3>
                      <p className="text-lg font-bold text-green-600 mb-1">${product.price.toFixed(2)}</p>
                      <p className="text-xs text-gray-500">
                        Stock: {product.stockQuantity}
                        {product.stockQuantity <= 5 && (
                          <span className="text-red-500 ml-1">⚠️</span>
                        )}
                      </p>
              </button>
            ))
          )}
        </div>
      </div>

            {/* Cart Panel */}
            <div className="w-96 bg-white/90 backdrop-blur-md shadow-xl border-l border-gray-200/50 flex flex-col">
              <div className="p-6 border-b border-gray-200/50">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-800 flex items-center space-x-2">
                    <ShoppingCartIcon className="h-6 w-6" />
                    <span>Cart ({currentSale.items.length})</span>
                  </h2>
                  {currentSale.items.length > 0 && (
                    <button
                      onClick={() => setCurrentSale(prev => ({ ...prev, items: [], total: 0 }))}
                      className="text-red-500 hover:text-red-700 transition-colors"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                </div>
        </div>
        
              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {currentSale.items.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCartIcon className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">Cart is empty</p>
                    <p className="text-sm text-gray-400">Add products to get started</p>
                  </div>
                ) : (
                  currentSale.items.map(item => (
                    <div key={item.id} className="bg-gray-50/80 rounded-xl p-4 hover:bg-gray-100/80 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-800 text-sm">{item.name}</h4>
                          <p className="text-xs text-gray-500">${item.price.toFixed(2)} each</p>
                        </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                          className="text-red-500 hover:text-red-700 transition-colors"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                </div>
                      <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                  >
                            <MinusIcon className="h-4 w-4" />
                  </button>
                          <span className="font-semibold min-w-[2rem] text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
                          >
                            <PlusIcon className="h-4 w-4" />
                  </button>
                        </div>
                        <span className="font-bold text-green-600">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                </div>
              </div>
                  ))
                )}
          </div>

              {/* Total and Checkout */}
              {currentSale.items.length > 0 && (
                <div className="p-6 border-t border-gray-200/50 bg-white/50">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-bold text-gray-800">Total:</span>
                    <span className="text-2xl font-bold text-green-600">${currentSale.total.toFixed(2)}</span>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
                    className="w-full py-4 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-bold hover:from-green-700 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl"
            >
                    Proceed to Payment
            </button>
          </div>
              )}
        </div>
      </div>
        )}
      </div>

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
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Payment</h3>
            
            {/* Customer Summary */}
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <h4 className="font-semibold text-gray-800 mb-2">Customer Information</h4>
              <p className="text-sm text-gray-600">
                <strong>Name:</strong> {currentSale.customer.name}
              </p>
              {currentSale.customer.location && (
                <p className="text-sm text-gray-600">
                  <strong>Location:</strong> {currentSale.customer.location}
                </p>
              )}
            </div>
            
            {/* Payment Methods */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">Payment Method</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'cash' }))}
                  className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                    currentSale.paymentMethod === 'cash' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <BanknotesIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Cash</span>
                </button>
                <button
                  onClick={() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'card' }))}
                  className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                    currentSale.paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCardIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Card</span>
                </button>
                <button
                  onClick={() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'mobile' }))}
                  className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                    currentSale.paymentMethod === 'mobile' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <DevicePhoneMobileIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Mobile</span>
                </button>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Amount Received
              </label>
              <input
                type="number"
                value={currentSale.paymentAmount}
                onChange={(e) => setCurrentSale(prev => ({ ...prev, paymentAmount: e.target.value }))}
                className="w-full p-4 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                placeholder="0.00"
                autoFocus
              />
            </div>

            {/* Change Display */}
            {currentSale.paymentAmount && (
              <div className="mb-6 p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Change:</span>
                  <span className="text-xl font-bold text-green-600">
                    ${(parseFloat(currentSale.paymentAmount) - currentSale.total).toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Back to Cart
              </button>
              <button
                onClick={handlePayment}
                disabled={!currentSale.paymentAmount || parseFloat(currentSale.paymentAmount) < currentSale.total}
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-700 hover:to-blue-700 transition-all duration-200"
              >
                Complete Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col space-y-3 z-40">
        <button
          onClick={() => window.print()}
          className="w-14 h-14 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-gray-600 hover:text-blue-600"
          title="Print Last Receipt"
        >
          <PrinterIcon className="h-6 w-6" />
        </button>
        <button
          onClick={() => setShowStatsPanel(!showStatsPanel)}
          className="w-14 h-14 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-gray-600 hover:text-green-600"
          title="View Stats"
        >
          <ChartBarIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Stats Panel Overlay */}
      {showStatsPanel && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={() => setShowStatsPanel(false)}>
          <div className="absolute right-6 top-20 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">My Performance</h3>
              <button
                onClick={() => setShowStatsPanel(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-r from-green-500 to-blue-500 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">Today's Sales</p>
                    <p className="text-2xl font-bold">${cashierStats.today.totalSales.toFixed(2)}</p>
                    <p className="text-sm opacity-90">{cashierStats.today.orderCount} transactions</p>
                  </div>
                  <ArrowTrendingUpIcon className="h-8 w-8 opacity-80" />
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">This Week</p>
                    <p className="text-2xl font-bold">${cashierStats.week.totalSales.toFixed(2)}</p>
                    <p className="text-sm opacity-90">{cashierStats.week.orderCount} transactions</p>
                  </div>
                  <ChartBarIcon className="h-8 w-8 opacity-80" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Recent Sales</h4>
                <div className="space-y-2">
                  {recentSales.slice(0, 3).map((sale, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">#{sale.id || 'N/A'}</span>
                      <span className="font-medium">${sale.total?.toFixed(2) || '0.00'}</span>
                    </div>
                  ))}
                  {recentSales.length === 0 && (
                    <p className="text-gray-500 text-sm">No recent sales</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
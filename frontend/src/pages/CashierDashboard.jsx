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
import AdminSidebar from '../components/AdminSidebar';

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
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Prevent accidental programmatic clicks; only allow real user-initiated events
  const withTrustedClick = (handler) => (event, ...rest) => {
    if (event && event.nativeEvent && event.nativeEvent.isTrusted === false) return;
    return handler(event, ...rest);
  };

  useEffect(() => {
    dispatch(fetchProducts());
    fetchCashierStats();
  }, [dispatch]);

  // Fetch cashier-specific statistics
  const fetchCashierStats = async () => {
    setStatsLoading(true);
    setError(null);
    try {
      const response = await cashierAPI.getCashierStats(user?.id);
      setCashierStats(response.data);
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
    } finally {
      setStatsLoading(false);
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
    
    // Check if product is out of stock
    if (product.stockQuantity <= 0) {
      alert('This product is out of stock');
      return;
    }
    
    const existingItem = currentSale.items.find(item => item.id === product.id);
    
    // Check if adding one more would exceed stock
    if (existingItem && existingItem.quantity >= product.stockQuantity) {
      alert(`Cannot add more. Only ${product.stockQuantity} units available in stock.`);
      return;
    }
    
    const updatedItems = existingItem
      ? currentSale.items.map(item =>
        item.id === product.id
          ? { 
              ...item, 
              quantity: item.quantity + 1,
              subtotal: (item.quantity + 1) * item.price // Add subtotal for each item
            }
          : item
        )
      : [...currentSale.items, { 
          ...product, 
          quantity: 1,
          subtotal: product.price // Initial subtotal
        }];
    
    // Calculate total with proper decimal handling
    const total = updatedItems.reduce((sum, item) => {
      const itemTotal = parseFloat((item.price * item.quantity).toFixed(2));
      return sum + itemTotal;
    }, 0);
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: parseFloat(total.toFixed(2)) // Ensure total is properly rounded
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
    if (newQuantity < 1) {
      // Instead of silently returning, ask if they want to remove the item
      if (confirm('Remove item from cart?')) {
        removeFromCart(productId);
      }
      return;
    }

    const updatedItems = currentSale.items.map(item => {
      if (item.id === productId) {
        // Check stock quantity
        if (newQuantity > item.stockQuantity) {
          alert(`Cannot add more. Only ${item.stockQuantity} units available in stock.`);
          return item;
        }
        
        return { 
          ...item, 
          quantity: newQuantity,
          subtotal: parseFloat((newQuantity * item.price).toFixed(2))
        };
      }
      return item;
    });
    
    // Calculate total with proper decimal handling
    const total = updatedItems.reduce((sum, item) => {
      const itemTotal = parseFloat((item.price * item.quantity).toFixed(2));
      return sum + itemTotal;
    }, 0);
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: parseFloat(total.toFixed(2)) // Ensure total is properly rounded
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
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState(null);

  const validatePayment = () => {
    if (!currentSale.paymentAmount) {
      setPaymentError('Please enter payment amount');
      return false;
    }
    
    const paymentAmount = parseFloat(currentSale.paymentAmount);
    if (isNaN(paymentAmount)) {
      setPaymentError('Invalid payment amount');
      return false;
    }

    if (paymentAmount < currentSale.total) {
      setPaymentError('Payment amount must cover the total');
      return false;
    }

    setPaymentError(null);
    return true;
  };

  const handlePayment = async () => {
    if (!validatePayment()) return;

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      // Format payment amount to 2 decimal places
      const paymentAmount = parseFloat(parseFloat(currentSale.paymentAmount).toFixed(2));
      
      const saleData = {
        customer: currentSale.customer,
        total: parseFloat(currentSale.total.toFixed(2)), // Ensure consistent decimal places
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: parseFloat(item.price.toFixed(2))
        })),
        paymentAmount,
        paymentMethod: currentSale.paymentMethod,
        notes: currentSale.notes,
        employeeId: user?.id,
        change: parseFloat((paymentAmount - currentSale.total).toFixed(2))
      };

      const response = await cashierAPI.createSale(saleData);
      const sale = response.data;
      
      // Print receipt
      try {
        await printReceipt(sale);
      } catch (printError) {
        console.error('Failed to print receipt:', printError);
        // Show print error but don't fail the transaction
        alert('Transaction successful but failed to print receipt. Please try printing again.');
      }
      
      // Reset sale state
      cancelSale();
      setShowPaymentModal(false);
      
      // Update recent sales and stats
      setRecentSales([sale, ...recentSales.slice(0, 4)]);
      fetchCashierStats();
      
      // Show success message
      alert('Transaction completed successfully!');
    } catch (error) {
      console.error('Payment processing error:', error);
      setPaymentError(error.response?.data?.error || 'Error processing sale. Please try again.');
    } finally {
      setProcessingPayment(false);
    }
  };

  const printReceipt = (sale) => {
    return new Promise((resolve, reject) => {
      try {
    const receiptWindow = window.open('', '_blank');
        if (!receiptWindow) {
          throw new Error('Please allow pop-ups to print receipts');
        }

        const itemsHtml = currentSale.items.map(item => `
          <div class="item">
            <div class="item-details">
              <span class="item-name">${item.name}</span>
              <span class="item-meta">${item.sku || ''}</span>
            </div>
            <div class="item-price">
              <span class="quantity">${item.quantity} x $${item.price.toFixed(2)}</span>
              <span class="amount">$${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          </div>
        `).join('');

        const discountTotal = currentSale.items.reduce((sum, item) => sum + (item.discount || 0), 0);
        const subtotal = currentSale.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const total = currentSale.total;
        const change = parseFloat(currentSale.paymentAmount) - total;

    receiptWindow.document.write(`
      <html>
        <head>
              <title>Receipt #${sale.id || 'N/A'}</title>
              <meta charset="utf-8">
          <style>
                @page { size: 80mm 297mm; margin: 0; }
                body { 
                  font-family: 'Courier New', monospace; 
                  padding: 20px; 
                  max-width: 80mm; 
                  margin: 0 auto;
                  color: #333;
                }
                .header { 
                  text-align: center; 
                  margin-bottom: 20px; 
                  border-bottom: 1px dashed #333; 
                  padding-bottom: 10px; 
                }
                .logo {
                  max-width: 150px;
                  margin: 0 auto 10px;
                }
                .shop-name {
                  font-size: 1.5em;
                  font-weight: bold;
                  margin: 0;
                }
                .customer { 
                  margin-bottom: 15px; 
                  padding: 10px; 
                  background: #f8f8f8; 
                  border-radius: 4px;
                  font-size: 0.9em;
                }
                .items {
                  margin: 20px 0;
                }
                .item { 
                  margin: 8px 0;
                }
                .item-details {
                  display: flex;
                  flex-direction: column;
                  margin-bottom: 4px;
                }
                .item-name {
                  font-weight: bold;
                }
                .item-meta {
                  font-size: 0.8em;
                  color: #666;
                }
                .item-price {
                  display: flex;
                  justify-content: space-between;
                  font-size: 0.9em;
                }
                .totals { 
                  margin-top: 20px; 
                  border-top: 1px solid #333; 
                  padding-top: 10px;
                }
                .total-row {
                  display: flex;
                  justify-content: space-between;
                  margin: 5px 0;
                }
                .grand-total {
                  font-size: 1.2em;
                  font-weight: bold;
                  margin-top: 10px;
                  padding-top: 10px;
                  border-top: 1px dashed #333;
                }
                .payment-info {
                  margin: 20px 0;
                  padding: 10px;
                  background: #f8f8f8;
                  border-radius: 4px;
                }
                .footer { 
                  text-align: center; 
                  margin-top: 30px; 
                  font-size: 0.9em;
                  padding-top: 20px;
                  border-top: 1px dashed #333;
                }
                .barcode {
                  text-align: center;
                  margin: 20px 0;
                  font-family: 'Libre Barcode 39', cursive;
                  font-size: 2em;
                }
                @media print {
                  body { padding: 0; }
                  .no-print { display: none; }
                }
          </style>
        </head>
        <body>
          <div class="header">
                ${user?.shop?.logo ? `<img src="${user.shop.logo}" alt="Shop Logo" class="logo"/>` : ''}
                <h1 class="shop-name">${user?.shop?.name || 'Store Name'}</h1>
                <p>${user?.shop?.address || ''}</p>
                <p>Tel: ${user?.shop?.phone || ''}</p>
            <p>Receipt #${sale.id || 'N/A'}</p>
            <p>${new Date().toLocaleString()}</p>
            <p>Cashier: ${user?.name || 'N/A'}</p>
          </div>

          ${currentSale.customer.name !== 'Walk-in Customer' ? `
            <div class="customer">
              <p><strong>Customer:</strong> ${currentSale.customer.name}</p>
              ${currentSale.customer.location ? `<p><strong>Location:</strong> ${currentSale.customer.location}</p>` : ''}
              ${currentSale.customer.phone ? `<p><strong>Phone:</strong> ${currentSale.customer.phone}</p>` : ''}
                  ${currentSale.customer.email ? `<p><strong>Email:</strong> ${currentSale.customer.email}</p>` : ''}
          </div>
          ` : ''}

              <div class="items">
                ${itemsHtml}
            </div>

              <div class="totals">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span>$${subtotal.toFixed(2)}</span>
          </div>
                ${discountTotal > 0 ? `
                  <div class="total-row">
                    <span>Discount:</span>
                    <span>-$${discountTotal.toFixed(2)}</span>
                  </div>
                ` : ''}
                <div class="total-row grand-total">
                  <span>Total:</span>
                  <span>$${total.toFixed(2)}</span>
                </div>
              </div>

              <div class="payment-info">
                <div class="total-row">
                  <span>Payment Method:</span>
                  <span>${currentSale.paymentMethod.toUpperCase()}</span>
                </div>
                <div class="total-row">
                  <span>Amount Paid:</span>
                  <span>$${parseFloat(currentSale.paymentAmount).toFixed(2)}</span>
                </div>
                <div class="total-row">
                  <span>Change:</span>
                  <span>$${change.toFixed(2)}</span>
                </div>
              </div>

              <div class="barcode">
                *${sale.id || 'N/A'}*
              </div>

          <div class="footer">
            <p>Thank you for your purchase!</p>
                <p>${user?.shop?.tagline || 'Visit us again soon!'}</p>
                ${user?.shop?.footer || ''}
              </div>

              <div class="no-print">
                <button onclick="window.print();" style="padding: 10px 20px; background: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; margin: 20px auto; display: block;">
                  Print Receipt
                </button>
          </div>
        </body>
      </html>
    `);

    receiptWindow.document.close();

        // Attempt to print
    receiptWindow.print();
        
        // Listen for the window being closed
        const checkWindowClosed = setInterval(() => {
          if (receiptWindow.closed) {
            clearInterval(checkWindowClosed);
            resolve();
          }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
          clearInterval(checkWindowClosed);
          resolve();
        }, 30000);

      } catch (error) {
        reject(error);
      }
    });
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
    <div className="min-h-screen bg-brand-black">
      {/* AdminSidebar */}
      <AdminSidebar isOpen={!sidebarCollapsed} onClose={() => setSidebarCollapsed(true)} user={user} variant="cashier" />

      {/* Main Content */}
      <div className={`transition-all duration-300 flex flex-col min-h-screen ${!sidebarCollapsed ? 'lg:pl-80' : 'lg:pl-20'}`}>
        {/* Top navigation is provided by Layout; removed here to avoid duplication */}
        {/* Page content wrapper */}
        <div className="flex-1 overflow-hidden">

        {/* Sales Mode Content */}
        {salesMode === 'idle' && (
          <div className="p-6">
            {/* Welcome Screen with New Sale Button */}
            <div className="max-w-4xl mx-auto">
              <div className="text-center mb-8">
                <div className="w-24 h-24 bg-brand-yellow rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <ShoppingBagIcon className="h-12 w-12 text-brand-black" />
                </div>
                <h2 className="text-3xl font-bold text-gray-100 mb-4">Ready to Start a Sale?</h2>
                <p className="text-gray-400 mb-8">Click the button below to begin processing a new transaction</p>
                
                <button
                  type="button"
                  onClick={withTrustedClick(startNewSale)}
                  className="px-8 py-4 bg-brand-yellow text-brand-black rounded-2xl font-bold text-xl hover:bg-brand-yellowDark transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                >
                  Start New Sale
                </button>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {error ? (
                  <div className="col-span-3 bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                      <XMarkIcon className="h-6 w-6 text-red-600" />
                    </div>
                    <p className="text-red-400">{error}</p>
                  </div>
                ) : statsLoading ? (
                  <>
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center animate-pulse">
                      <div className="w-12 h-12 bg-green-100/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <div className="w-6 h-6 bg-green-600/20 rounded"></div>
                      </div>
                      <div className="h-6 w-32 bg-gray-700 rounded mx-auto mb-2"></div>
                      <div className="h-8 w-24 bg-gray-700 rounded mx-auto"></div>
                    </div>
                    
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center animate-pulse">
                      <div className="w-12 h-12 bg-blue-100/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <div className="w-6 h-6 bg-blue-600/20 rounded"></div>
                      </div>
                      <div className="h-6 w-32 bg-gray-700 rounded mx-auto mb-2"></div>
                      <div className="h-8 w-24 bg-gray-700 rounded mx-auto"></div>
                    </div>
                    
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center animate-pulse">
                      <div className="w-12 h-12 bg-purple-100/50 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <div className="w-6 h-6 bg-purple-600/20 rounded"></div>
                      </div>
                      <div className="h-6 w-32 bg-gray-700 rounded mx-auto mb-2"></div>
                      <div className="h-8 w-24 bg-gray-700 rounded mx-auto"></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
                  </div>
                      <h3 className="text-lg font-semibold text-gray-100">Today's Revenue</h3>
                      <p className="text-2xl font-bold text-green-400">${cashierStats.today.totalSales.toFixed(2)}</p>
                </div>
                
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ShoppingCartIcon className="h-6 w-6 text-blue-600" />
                  </div>
                      <h3 className="text-lg font-semibold text-gray-100">Transactions</h3>
                      <p className="text-2xl font-bold text-blue-400">{cashierStats.today.orderCount}</p>
                </div>
                
                    <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center">
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <ChartBarIcon className="h-6 w-6 text-purple-600" />
                  </div>
                      <h3 className="text-lg font-semibold text-gray-100">This Week</h3>
                      <p className="text-2xl font-bold text-purple-400">${cashierStats.week.totalSales.toFixed(2)}</p>
                </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {salesMode === 'product-selection' && (
          <div className="lg:flex h-[calc(100vh-64px)]">
            {/* POS Terminal - Main Area */}
            <div className="flex-1 p-6 overflow-y-auto">
              {/* Sale Header */}
              <div className="mb-6 bg-brand-gray border border-brand-yellow/20 rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-100">Current Sale</h2>
                    <p className="text-gray-300">
                      Customer: <span className="font-medium">{currentSale.customer.name}</span>
                      {currentSale.customer.location && (
                        <span className="ml-2">• {currentSale.customer.location}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={withTrustedClick(cancelSale)}
                      className="px-4 py-2 text-red-400 hover:bg-black/40 rounded-lg transition-colors"
                    >
                      Cancel Sale
                    </button>
                    {currentSale.items.length > 0 && (
                      <button
                        type="button"
                        onClick={withTrustedClick(() => setShowPaymentModal(true))}
                        className="px-6 py-2 bg-brand-yellow text-brand-black rounded-lg font-medium hover:bg-brand-yellowDark transition-all duration-200"
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
                      className="w-full pl-10 pr-4 py-3 bg-brand-black text-gray-100 border border-brand-yellow/20 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={withTrustedClick(handleBarcodeScan)}
                    className="px-6 py-3 bg-brand-yellow text-brand-black rounded-xl hover:bg-brand-yellowDark transition-all duration-200 flex items-center space-x-2 shadow-lg hover:shadow-xl"
                  >
                    <QrCodeIcon className="h-5 w-5" />
                    <span>Scan Barcode</span>
                  </button>
                </div>

                {/* Category Filter */}
                <div className="flex space-x-2 overflow-x-auto pb-2">
                  {categories.map(category => (
                    <button
                      type="button"
                      key={category}
                      onClick={withTrustedClick(() => setSelectedCategory(category))}
                      className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 whitespace-nowrap ${
                        selectedCategory === category
                          ? 'bg-brand-yellow text-brand-black shadow-lg'
                          : 'bg-brand-gray text-gray-200 hover:bg-black/40'
                      }`}
                    >
                      {category === 'all' ? 'All Products' : category}
                    </button>
                  ))}
                </div>
        </div>
        
              {/* Product Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 pb-[50vh] lg:pb-0">
          {productsLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-4 animate-pulse">
                      <div className="w-full aspect-square bg-black/40 rounded-lg mb-3"></div>
                      <div className="h-4 bg-black/40 rounded mb-2"></div>
                      <div className="h-4 bg-black/40 rounded w-3/4 mb-2"></div>
                      <div className="h-6 bg-brand-yellow/20 rounded w-1/2"></div>
                      <div className="h-4 bg-black/40 rounded w-1/3 mt-2"></div>
                    </div>
                  ))
          ) : filteredProducts.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <div className="w-16 h-16 bg-brand-yellow/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MagnifyingGlassIcon className="h-8 w-8 text-brand-yellow" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-100 mb-2">No Products Found</h3>
                    <p className="text-gray-400">Try adjusting your search or category filter</p>
                  </div>
          ) : (
            filteredProducts.map(product => (
              <button
                type="button"
                key={product.id}
                onClick={withTrustedClick(() => addToCart(product))}
                      disabled={product.stockQuantity <= 0}
                      className="group bg-brand-gray border border-brand-yellow/20 rounded-xl p-4 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    >
                      <div className="aspect-square w-full bg-black/40 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="text-4xl text-gray-300">📦</div>
                        )}
                      </div>
                      <h3 className="font-semibold text-gray-100 text-sm mb-1 line-clamp-2">{product.name}</h3>
                      <p className="text-lg font-bold text-brand-yellow mb-1">${product.price.toFixed(2)}</p>
                      <p className="text-xs text-gray-300">
                        Stock: {product.stockQuantity}
                        {product.stockQuantity <= 5 && (
                          <span className="text-red-400 ml-1">⚠️</span>
                        )}
                      </p>
              </button>
            ))
          )}
        </div>
      </div>

            {/* Cart Panel */}
            <div className="lg:w-96 bg-brand-gray border-t lg:border-t-0 lg:border-l border-brand-yellow/20 flex flex-col h-[50vh] lg:h-full fixed lg:static bottom-0 left-0 right-0">
              <div className="p-6 border-b border-brand-yellow/20">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-gray-100 flex items-center space-x-2">
                    <ShoppingCartIcon className="h-6 w-6" />
                    <span>Cart ({currentSale.items.length})</span>
                  </h2>
                  <div className="flex items-center space-x-4">
                  {currentSale.items.length > 0 && (
                    <button
                      type="button"
                      onClick={withTrustedClick(() => setCurrentSale(prev => ({ ...prev, items: [], total: 0 })))}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        title="Clear cart"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  )}
                    <button
                      type="button"
                      className="lg:hidden text-gray-400 hover:text-gray-300"
                      onClick={withTrustedClick(() => {
                        const cartPanel = document.getElementById('cart-panel');
                        if (cartPanel) {
                          cartPanel.classList.toggle('h-[50vh]');
                          cartPanel.classList.toggle('h-20');
                        }
                      })}
                    >
                      <ChevronDownIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
        </div>
        
              {/* Cart Items */}
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                {currentSale.items.length === 0 ? (
                  <div className="text-center py-12">
                    <ShoppingCartIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-300">Cart is empty</p>
                    <p className="text-sm text-gray-400">Add products to get started</p>
                  </div>
                ) : (
                  currentSale.items.map(item => (
                    <div key={item.id} className="bg-black/40 rounded-xl p-4 hover:bg-black/50 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-100 text-sm">{item.name}</h4>
                          <div className="flex items-center space-x-2">
                            <p className="text-xs text-gray-300">${item.price.toFixed(2)} each</p>
                            {item.quantity >= item.stockQuantity && (
                              <span className="text-xs text-yellow-400">Max stock reached</span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={withTrustedClick(() => removeFromCart(item.id))}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          title="Remove item"
                        >
                          <XMarkIcon className="h-4 w-4" />
                        </button>
                </div>
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col items-start space-y-1">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity - 1))}
                              className="w-8 h-8 bg-brand-black border border-brand-yellow/20 rounded-lg flex items-center justify-center hover:bg-black/60 transition-colors disabled:opacity-50"
                              disabled={item.quantity <= 1}
                              title="Decrease quantity"
                  >
                            <MinusIcon className="h-4 w-4" />
                  </button>
                            <div className="relative">
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
                                className="w-16 px-2 py-1 text-center bg-brand-black border border-brand-yellow/20 rounded-lg text-gray-100"
                              />
                            </div>
                  <button
                    type="button"
                    onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity + 1))}
                              className="w-8 h-8 bg-brand-black border border-brand-yellow/20 rounded-lg flex items-center justify-center hover:bg-black/60 transition-colors disabled:opacity-50"
                              disabled={item.quantity >= item.stockQuantity}
                              title={item.quantity >= item.stockQuantity ? 'Maximum stock reached' : 'Increase quantity'}
                          >
                            <PlusIcon className="h-4 w-4" />
                  </button>
                        </div>
                          <div className="text-xs text-gray-400">
                            In stock: {item.stockQuantity}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-brand-yellow">
                            ${item.subtotal.toFixed(2)}
                        </span>
                          {item.quantity > 1 && (
                            <div className="text-xs text-gray-400">
                              ${item.price.toFixed(2)} × {item.quantity}
                            </div>
                          )}
                        </div>
                </div>
              </div>
                  ))
                )}
          </div>

              {/* Total and Checkout */}
              {currentSale.items.length > 0 && (
                <div className="p-6 border-t border-brand-yellow/20 bg-brand-gray">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-lg font-bold text-gray-100">Total:</span>
                    <span className="text-2xl font-bold text-brand-yellow">${currentSale.total.toFixed(2)}</span>
            </div>
            <button
              type="button"
              onClick={withTrustedClick(() => setShowPaymentModal(true))}
                    className="w-full py-4 bg-brand-yellow text-brand-black rounded-xl font-bold hover:bg-brand-yellowDark transition-all duration-200 shadow-lg hover:shadow-xl"
            >
                    Proceed to Payment
            </button>
          </div>
              )}
        </div>
      </div>
        )}
        </div>
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50" onClick={withTrustedClick(() => setShowPaymentModal(false))}>
          <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-gray-800">Payment</h3>
              <button
                type="button"
                onClick={withTrustedClick(() => setShowPaymentModal(false))}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            
            {/* Sale Summary */}
            <div className="mb-6 bg-gray-50 rounded-xl p-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">${currentSale.total.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-lg font-bold">
                <span className="text-gray-800">Total Due</span>
                <span className="text-green-600">${currentSale.total.toFixed(2)}</span>
              </div>
            </div>
            
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
                  type="button"
                  onClick={withTrustedClick(() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'cash' })))}
                  className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                    currentSale.paymentMethod === 'cash' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <BanknotesIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Cash</span>
                </button>
                <button
                  type="button"
                  onClick={withTrustedClick(() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'card' })))}
                  className={`p-3 rounded-xl border-2 transition-all duration-200 flex flex-col items-center space-y-2 ${
                    currentSale.paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <CreditCardIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Card</span>
                </button>
                <button
                  type="button"
                  onClick={withTrustedClick(() => setCurrentSale(prev => ({ ...prev, paymentMethod: 'mobile' })))}
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
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">$</span>
              <input
                type="number"
                  step="0.01"
                  min="0"
                value={currentSale.paymentAmount}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || (!isNaN(value) && parseFloat(value) >= 0)) {
                      setCurrentSale(prev => ({ ...prev, paymentAmount: value }));
                      setPaymentError(null);
                    }
                  }}
                  className={`w-full p-4 pl-8 border rounded-xl text-lg transition-all ${
                    paymentError
                      ? 'border-red-500 focus:ring-2 focus:ring-red-500'
                      : 'border-gray-200 focus:ring-2 focus:ring-blue-500'
                  } focus:border-transparent`}
                placeholder="0.00"
                autoFocus
              />
                {currentSale.paymentAmount && !isNaN(parseFloat(currentSale.paymentAmount)) && (
                  <div className="absolute right-4 top-1/2 transform -translate-y-1/2 text-sm">
                    {parseFloat(currentSale.paymentAmount) >= currentSale.total ? (
                      <span className="text-green-600">✓ Sufficient</span>
                    ) : (
                      <span className="text-red-500">Insufficient</span>
                    )}
                  </div>
                )}
              </div>
              {paymentError && (
                <p className="mt-2 text-sm text-red-600">{paymentError}</p>
              )}
            </div>

            {/* Change Display */}
            {currentSale.paymentAmount && !isNaN(parseFloat(currentSale.paymentAmount)) && (
              <div className="mb-6 p-4 bg-gray-50 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Amount Received</span>
                  <span className="font-medium">${parseFloat(currentSale.paymentAmount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Due</span>
                  <span className="font-medium">-${currentSale.total.toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Change Due</span>
                    <span className={`text-xl font-bold ${
                      parseFloat(currentSale.paymentAmount) >= currentSale.total
                        ? 'text-green-600'
                        : 'text-red-500'
                    }`}>
                      ${Math.max(0, (parseFloat(currentSale.paymentAmount) - currentSale.total)).toFixed(2)}
                  </span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={withTrustedClick(() => setShowPaymentModal(false))}
                disabled={processingPayment}
                className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back to Cart
              </button>
              <button
                type="button"
                onClick={withTrustedClick(handlePayment)}
                disabled={
                  processingPayment || 
                  !currentSale.paymentAmount || 
                  isNaN(parseFloat(currentSale.paymentAmount)) ||
                  parseFloat(currentSale.paymentAmount) < currentSale.total
                }
                className="flex-1 py-3 bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-green-700 hover:to-blue-700 transition-all duration-200 relative"
              >
                {processingPayment ? (
                  <>
                    <span className="opacity-0">Complete Sale</span>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  </>
                ) : (
                  'Complete Sale'
                )}
              </button>
            </div>
            
            {/* Quick Amount Buttons */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[10, 20, 50, 100, 200, 500].map(amount => (
                <button
                  key={amount}
                  type="button"
                  onClick={withTrustedClick(() => {
                    setCurrentSale(prev => ({ ...prev, paymentAmount: amount.toString() }));
                    setPaymentError(null);
                  })}
                  className="py-2 px-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col space-y-3 z-40">
        <button
          type="button"
          onClick={withTrustedClick(() => window.print())}
          className="w-14 h-14 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-gray-600 hover:text-blue-600"
          title="Print Last Receipt"
        >
          <PrinterIcon className="h-6 w-6" />
        </button>
        <button
          type="button"
          onClick={withTrustedClick(() => setShowStatsPanel(!showStatsPanel))}
          className="w-14 h-14 bg-white/90 backdrop-blur-sm rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center text-gray-600 hover:text-green-600"
          title="View Stats"
        >
          <ChartBarIcon className="h-6 w-6" />
        </button>
      </div>

      {/* Stats Panel Overlay */}
      {showStatsPanel && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40" onClick={withTrustedClick(() => setShowStatsPanel(false))}>
          <div className="absolute right-6 top-20 w-80 bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">My Performance</h3>
              <button
                onClick={withTrustedClick(() => setShowStatsPanel(false))}
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
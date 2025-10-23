import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../store/slices/productsSlice';
import { getCurrentUser } from '../store/slices/authSlice';
import StatsCard from '../components/StatsCard';
import { useAdvancedCurrency } from '../hooks/useAdvancedCurrency';
import HeroSection from '../components/HeroSection';
import ProductCard from '../components/ProductCard';
import ProductFilterBar from '../components/ProductFilterBar';
import CartPanel from '../components/CartPanel';
import { 
  PrinterIcon, 
  ClockIcon,
  ShoppingCartIcon,
  MagnifyingGlassIcon,
  QrCodeIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  UserIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  EyeIcon,
  ShoppingBagIcon,
  ChevronDownIcon,
  CurrencyDollarIcon,
  XMarkIcon,
  Bars3Icon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import api from '../services/api';
import cashierAPI from '../services/cashierAPI';
import CustomerModal from '../components/CustomerModal';
import PaymentModal from '../components/PaymentModal';
import { useToast } from '../components/Toast';

export default function CashierDashboard() {
  const { formatLocale: formatCurrency, roundToUnit } = useAdvancedCurrency();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  // Currency utility functions
  const calculateItemTotal = (item) => {
    return roundToUnit((parseFloat(item.price || 0) * item.quantity));
  };

  const parseAmount = (amount) => {
    return roundToUnit(parseFloat(amount || 0));
  };
  const { user, token } = useSelector((state) => state.auth);
  const { products, loading: productsLoading } = useSelector((state) => state.products);
  const [view, setView] = useState('grid');
  const { showToast, hideToast } = useToast();
  
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

    // Ensure price is a valid number
    const productPrice = typeof product.price === 'number' 
      ? product.price 
      : parseFloat(product.price || 0);
    
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
              price: productPrice,
              subtotal: (item.quantity + 1) * parseFloat(item.price || 0)
            }
          : item
        )
      : [...currentSale.items, { 
          ...product, 
          price: typeof product.price === 'number' ? product.price : parseFloat(product.price || 0),
          quantity: 1,
          subtotal: typeof product.price === 'number' ? product.price : parseFloat(product.price || 0)
        }];
    
    // Calculate total with proper decimal handling
    const total = updatedItems.reduce((sum, item) => {
      const itemTotal = parseFloat((item.price * item.quantity).toFixed(2));
      return sum + itemTotal;
    }, 0);
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: parseFloat(total.toFixed(2))
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
      if (confirm('Remove item from cart?')) {
        removeFromCart(productId);
      }
      return;
    }

    const updatedItems = currentSale.items.map(item => {
      if (item.id === productId) {
        if (newQuantity > item.stockQuantity) {
          alert(`Cannot add more. Only ${item.stockQuantity} units available in stock.`);
          return item;
        }
        
        return { 
          ...item, 
          quantity: newQuantity,
          subtotal: parseFloat((newQuantity * parseFloat(item.price || 0)).toFixed(2))
        };
      }
      return item;
    });
    
    const total = updatedItems.reduce((sum, item) => {
      const itemTotal = parseFloat((item.price * item.quantity).toFixed(2));
      return sum + itemTotal;
    }, 0);
    
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: parseFloat(total.toFixed(2))
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
    if (!currentSale.items.length) {
      setPaymentError('Cart is empty');
      return false;
    }

    // Validate all cart items have valid product IDs
    const invalidItems = currentSale.items.filter(item => !item.id || isNaN(parseInt(item.id)));
    if (invalidItems.length > 0) {
      setPaymentError(`Invalid product data detected. Please remove and re-add items.`);
      return false;
    }

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

    if (!user || !token) {
      setPaymentError('You must be logged in to process payments. Please log in again.');
      navigate('/login');
      return;
    }

    setProcessingPayment(true);
    setPaymentError(null);

    try {
      const paymentAmount = parseAmount(currentSale.paymentAmount);
      
      // Validate and prepare sale data
      const validatedItems = currentSale.items.map(item => {
        // Ensure productId is valid
        if (!item.id || isNaN(parseInt(item.id))) {
          throw new Error(`Invalid product ID for item: ${item.name || 'Unknown'}`);
        }
        
        return {
          productId: parseInt(item.id),
          quantity: parseInt(item.quantity),
          discount: parseFloat(item.discount || 0),
          price: parseFloat((typeof item.price === 'number' ? item.price : parseFloat(item.price || 0)).toFixed(2))
        };
      });

      // Clean customer data - remove empty strings and null values
      const cleanCustomer = currentSale.customer ? {
        ...currentSale.customer,
        email: currentSale.customer.email && currentSale.customer.email.trim() !== '' 
          ? currentSale.customer.email.trim() 
          : undefined,
        phone: currentSale.customer.phone && currentSale.customer.phone.trim() !== '' 
          ? currentSale.customer.phone.trim() 
          : undefined,
        location: currentSale.customer.location && currentSale.customer.location.trim() !== '' 
          ? currentSale.customer.location.trim() 
          : undefined
      } : undefined;

      const saleData = {
        // Required fields with correct structure
        items: validatedItems,
        customerId: currentSale.customer?.id || null, // Send null if no customer.id
        // Additional fields
        customer: cleanCustomer,
        total: parseFloat(currentSale.total.toFixed(2)),
        paymentAmount,
        paymentMethod: currentSale.paymentMethod || 'cash',
        notes: currentSale.notes,
        employeeId: user?.id,
        change: parseFloat((paymentAmount - currentSale.total).toFixed(2))
      };

      const response = await cashierAPI.createSale(saleData);
      const sale = response.data;
      
      try {
        await printReceipt(sale);
      } catch (printError) {
        console.error('Failed to print receipt:', printError);
        showToast({
          type: 'info',
          title: 'Printed later',
          message: 'Transaction succeeded, but printing failed. Try printing again.'
        });
      }
      
      // Smooth reset: close modal, then reset sale state
      setShowPaymentModal(false);
      setTimeout(() => {
        cancelSale();
      }, 200);
      
      setRecentSales([sale, ...recentSales.slice(0, 4)]);
      fetchCashierStats();

      // Show success toast with key details
      const firstItem = currentSale.items[0];
      const itemLabel = firstItem ? `${firstItem.name}${currentSale.items.length > 1 ? ` +${currentSale.items.length - 1} more` : ''}` : 'Sale';
      const quantity = currentSale.items.reduce((sum, i) => sum + i.quantity, 0);
      const total = currentSale.total.toFixed(2);
      showToast({
        type: 'success',
        title: `Sale of ${itemLabel} completed`,
        message: `Qty: ${quantity} • Total: ${formatCurrency(total)}`
      });
    } catch (error) {
      console.error('Payment processing error:', error);
      if (error.response?.status === 403) {
        setPaymentError('Authentication error. Please try logging in again.');
        navigate('/login');
      } else if (error.response?.status === 400) {
        // Handle validation errors
        const errors = error.response?.data?.errors || [];
        if (errors.length > 0) {
          const errorMessages = errors.map(err => err.msg).join(', ');
          setPaymentError(`Validation error: ${errorMessages}`);
          showToast({
            type: 'error',
            title: 'Invalid data',
            message: errorMessages
          });
      } else {
          const msg = error.response?.data?.error || 'Invalid data provided. Please check your inputs.';
          setPaymentError(msg);
          showToast({
            type: 'error',
            title: 'Sale failed',
            message: msg
          });
        }
      } else {
        const msg = error.response?.data?.error || error.message || 'Error processing sale. Please try again.';
        setPaymentError(msg);
        showToast({
          type: 'error',
          title: 'Sale failed',
          message: msg
        });
      }
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
              <span class="quantity">${item.quantity} x ${formatCurrency(parseFloat(item.price || 0))}</span>
              <span class="amount">${formatCurrency(parseFloat(item.price || 0) * item.quantity)}</span>
            </div>
          </div>
        `).join('');

        const discountTotal = currentSale.items.reduce((sum, item) => sum + (item.discount || 0), 0);
        const subtotal = currentSale.items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);
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
                  <span>${formatCurrency(subtotal)}</span>
                </div>
                ${discountTotal > 0 ? `
                  <div class="total-row">
                    <span>Discount:</span>
                    <span>-${formatCurrency(discountTotal)}</span>
                  </div>
                ` : ''}
                <div class="total-row grand-total">
                  <span>Total:</span>
                  <span>${formatCurrency(total)}</span>
                </div>
              </div>

              <div class="payment-info">
                <div class="total-row">
                  <span>Payment Method:</span>
                  <span>${currentSale.paymentMethod.toUpperCase()}</span>
                </div>
                <div class="total-row">
                  <span>Amount Paid:</span>
                  <span>${formatCurrency(parseFloat(currentSale.paymentAmount))}</span>
                </div>
                <div class="total-row">
                  <span>Change:</span>
                  <span>${formatCurrency(change)}</span>
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
        receiptWindow.print();
        
        const checkWindowClosed = setInterval(() => {
          if (receiptWindow.closed) {
            clearInterval(checkWindowClosed);
            resolve();
          }
        }, 1000);

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
    <div className="min-h-screen bg-gradient-to-br from-brand-black to-gray-900">
      {/* Main Content */}
      <div className="flex flex-col min-h-screen">
        {/* Page content wrapper */}
        <div className="flex-1 overflow-hidden">
          {/* Sales Mode Content */}
          {salesMode === 'idle' && (
            <div className="p-4 sm:p-6">
              {/* Welcome Screen with New Sale Button */}
              <div className="max-w-6xl mx-auto">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 bg-brand-yellow rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <ShoppingBagIcon className="h-10 w-10 sm:h-12 sm:w-12 text-brand-black" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-100 mb-4">Ready to Start a Sale?</h2>
                  <p className="text-gray-400 mb-8 max-w-md mx-auto">Click the button below to begin processing a new transaction</p>
                  
                  <button
                    type="button"
                    onClick={withTrustedClick(startNewSale)}
                    className="px-6 py-3 sm:px-8 sm:py-4 bg-brand-yellow text-brand-black rounded-2xl font-bold text-lg sm:text-xl hover:bg-brand-yellowDark transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105"
                  >
                    Start New Sale
                  </button>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {error ? (
                    <div className="col-span-full bg-red-500/10 border border-red-500/20 rounded-xl p-6 text-center">
                      <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                        <XMarkIcon className="h-6 w-6 text-red-600" />
                      </div>
                      <p className="text-red-400">{error}</p>
                    </div>
                  ) : statsLoading ? (
                    <>
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center animate-pulse">
                          <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                            <div className="w-6 h-6 bg-gray-600 rounded"></div>
                          </div>
                          <div className="h-6 w-32 bg-gray-700 rounded mx-auto mb-2"></div>
                          <div className="h-8 w-24 bg-gray-700 rounded mx-auto"></div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-200">
                        <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-100">Today's Revenue</h3>
                        <p className="text-2xl font-bold text-green-400">{formatCurrency(cashierStats.today.totalSales)}</p>
                      </div>
                      
                      <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-200">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <ShoppingCartIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-100">Transactions</h3>
                        <p className="text-2xl font-bold text-blue-400">{cashierStats.today.orderCount}</p>
                      </div>
                      
                      <div className="bg-brand-gray border border-brand-yellow/20 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-200 sm:col-span-2 lg:col-span-1">
                        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                          <ChartBarIcon className="h-6 w-6 text-purple-600" />
                        </div>
                        <h3 className="text-lg font-semibold text-gray-100">This Week</h3>
                        <p className="text-2xl font-bold text-purple-400">{formatCurrency(cashierStats.week.totalSales)}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {salesMode === 'product-selection' && (
            <div className="flex flex-col lg:flex-row h-screen">
              {/* POS Terminal - Main Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Sale Header */}
                <div className="bg-brand-gray/50 backdrop-blur-sm border-b border-brand-yellow/20 p-4 sm:p-6 shadow-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-100">Current Sale</h2>
                      <p className="text-gray-300">
                        Customer: <span className="font-medium">{currentSale.customer.name}</span>
                        {currentSale.customer.location && (
                          <span className="ml-2">• {currentSale.customer.location}</span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3">
                      <button
                        type="button"
                        onClick={withTrustedClick(cancelSale)}
                        className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                      >
                        Cancel Sale
                      </button>
                      {currentSale.items.length > 0 && (
                        <button
                          type="button"
                          onClick={withTrustedClick(() => setShowPaymentModal(true))}
                          className="px-4 py-2 bg-brand-yellow text-brand-black rounded-lg font-medium hover:bg-brand-yellowDark transition-all duration-200 text-sm"
                        >
                          Proceed to Payment
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="p-4 sm:p-6 space-y-4 bg-brand-black/30">
                  <div className="flex flex-col sm:flex-row gap-4">
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
                      className="px-4 py-3 bg-brand-yellow text-brand-black rounded-xl hover:bg-brand-yellowDark transition-all duration-200 flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl text-sm font-medium"
                    >
                      <QrCodeIcon className="h-5 w-5" />
                      <span className="hidden sm:inline">Scan Barcode</span>
                    </button>
                  </div>

                  {/* Category Filter */}
                  <div className="flex space-x-2 overflow-x-auto pb-2">
                    {categories.map(category => (
                      <button
                        type="button"
                        key={category}
                        onClick={withTrustedClick(() => setSelectedCategory(category))}
                        className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 whitespace-nowrap text-sm ${
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
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  <div className={`grid ${
                    view === 'grid' 
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' 
                      : 'grid-cols-1'
                  } gap-3 sm:gap-4`}>
                    {productsLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="bg-brand-gray/50 backdrop-blur-sm border border-brand-yellow/20 rounded-xl p-4 animate-pulse">
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
                          className="group bg-brand-gray border border-brand-yellow/20 rounded-xl p-3 sm:p-4 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                        >
                          <div className="aspect-square w-full bg-black/40 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                            {product.image ? (
                              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="text-2xl sm:text-4xl text-gray-300">📦</div>
                            )}
                          </div>
                          <h3 className="font-semibold text-gray-100 text-sm mb-1 line-clamp-2">{product.name}</h3>
                          <p className="text-lg font-bold text-brand-yellow mb-1">
                            {formatCurrency(typeof product.price === 'number' 
                              ? product.price 
                              : parseFloat(product.price || 0))}
                          </p>
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
              </div>

              {/* Cart Panel - Mobile Bottom Sheet / Desktop Sidebar */}
              <div className={`${
                showCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
              } fixed lg:static bottom-0 left-0 right-0 lg:right-auto lg:w-96 bg-brand-gray border-t lg:border-t-0 lg:border-l border-brand-yellow/20 flex flex-col h-[60vh] lg:h-full transition-transform duration-300 ease-in-out z-50 lg:z-auto`}>
                <div className="p-4 sm:p-6 border-b border-brand-yellow/20">
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
                        onClick={withTrustedClick(() => setShowCart(!showCart))}
                      >
                        <ChevronDownIcon className={`h-5 w-5 transition-transform ${showCart ? 'rotate-180' : ''}`} />
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
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
                              <p className="text-xs text-gray-300">
                                {formatCurrency(parseFloat(item.price || 0))} each
                              </p>
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
                                  className="w-16 px-2 py-1 text-center bg-brand-black border border-brand-yellow/20 rounded-lg text-gray-100 text-sm"
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
                  <div className="p-4 sm:p-6 border-t border-brand-yellow/20 bg-brand-gray">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-lg font-bold text-gray-100">Total:</span>
                      <span className="text-2xl font-bold text-brand-yellow">{formatCurrency(currentSale.total)}</span>
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

      {/* Mobile Cart Toggle Button */}
      {salesMode === 'product-selection' && (
        <div className="lg:hidden fixed bottom-4 right-4 z-40">
          <button
            type="button"
            onClick={withTrustedClick(() => setShowCart(!showCart))}
            className="w-14 h-14 bg-brand-yellow text-brand-black rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
          >
            <ShoppingCartIcon className="h-6 w-6" />
            {currentSale.items.length > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-6 w-6 flex items-center justify-center">
                {currentSale.items.length}
              </span>
            )}
          </button>
        </div>
      )}

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
          <div className="absolute right-4 top-20 w-80 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
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
                    <p className="text-2xl font-bold">{formatCurrency(cashierStats?.today?.totalSales || 0)}</p>
                    <p className="text-sm opacity-90">{cashierStats?.today?.orderCount || 0} transactions</p>
                  </div>
                  <ArrowTrendingUpIcon className="h-8 w-8 opacity-80" />
                </div>
              </div>

              <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl p-4 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm opacity-90">This Week</p>
                    <p className="text-2xl font-bold">{formatCurrency(cashierStats?.week?.totalSales || 0)}</p>
                    <p className="text-sm opacity-90">{cashierStats?.week?.orderCount || 0} transactions</p>
                  </div>
                  <ChartBarIcon className="h-8 w-8 opacity-80" />
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl p-4">
                <h4 className="font-semibold text-gray-800 mb-3">Recent Sales</h4>
                <div className="space-y-2">
                  {(recentSales || []).slice(0, 3).map((sale, index) => (
                    <div key={index} className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">#{sale?.id || 'N/A'}</span>
                      <span className="font-medium">{formatCurrency(sale?.total || 0)}</span>
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
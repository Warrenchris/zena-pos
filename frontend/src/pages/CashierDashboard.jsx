import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../store/slices/productsSlice';
import { getCurrentUser } from '../store/slices/authSlice';
import StatsCard from '../components/StatsCard';
import useCurrency from '../hooks/useCurrency';
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
import { notifySaleComplete, notifyError as notifyErrorUtil, showSnackbar } from '../utils/notifications';

export default function CashierDashboard() {
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  // Currency utility functions
  const calculateItemTotal = (item) => {
    return Math.round((parseFloat(item.price || 0) * item.quantity) * 100) / 100;
  };

  const parseAmount = (amount) => {
    return Math.round(parseFloat(amount || 0) * 100) / 100;
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

  // Render premium metric card with consistent styling
  const MetricCard = ({ icon: Icon, label, value, subtext, gradient, animated = false }) => (
    <div className={`relative overflow-hidden rounded-2xl backdrop-blur-sm border border-brand-yellow/20 transition-all duration-300 hover:shadow-2xl hover:border-brand-yellow/50 group ${animated ? 'animate-slideIn' : ''}`}>
      {/* Gradient background */}
      <div className={`absolute inset-0 ${gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-300`}></div>
      
      {/* Content */}
      <div className="relative p-6 sm:p-8">
        <div className="flex items-start justify-between mb-4">
          <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${gradient}`}>
            <Icon className="h-7 w-7 sm:h-8 sm:w-8 text-brand-black" />
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

    // Show snackbar notification
    showSnackbar(
      existingItem 
        ? `${product.name} quantity updated to ${existingItem.quantity + 1}` 
        : `${product.name} added to cart`,
      'success',
      2000
    );
  };

  // Remove item from cart
  const removeFromCart = (productId) => {
    const itemToRemove = currentSale.items.find(item => item.id === productId);
    const updatedItems = currentSale.items.filter(item => item.id !== productId);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)
    }));

    // Show snackbar notification
    if (itemToRemove) {
      showSnackbar(`${itemToRemove.name} removed from cart`, 'info', 2000);
    }
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

      // Add to notification panel
      notifySaleComplete({
        ...sale,
        invoiceNumber: sale.invoiceNumber || sale.id,
        total: sale.total || currentSale.total
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
        // Add error notification
        notifyErrorUtil('Sale Failed', msg);
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
    <div className="min-h-screen bg-gradient-to-br from-brand-black via-gray-900 to-brand-black">
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
                        gradient="bg-gradient-to-br from-green-500 to-emerald-600"
                        animated
                      />
                      
                      <MetricCard
                        icon={ShoppingCartIcon}
                        label="Total Transactions"
                        value={cashierStats.today.orderCount}
                        subtext="Completed today"
                        gradient="bg-gradient-to-br from-blue-500 to-cyan-600"
                        animated
                      />
                      
                      <MetricCard
                        icon={ChartBarIcon}
                        label="This Week's Revenue"
                        value={formatCurrency(cashierStats.week.totalSales)}
                        subtext={`${cashierStats.week.orderCount} transactions`}
                        gradient="bg-gradient-to-br from-purple-500 to-indigo-600"
                        animated
                      />
                      
                      <MetricCard
                        icon={ShoppingBagIcon}
                        label="Items Sold"
                        value={(currentSale.items || []).reduce((sum, item) => sum + item.quantity, 0)}
                        subtext="Current session"
                        gradient="bg-gradient-to-br from-orange-500 to-red-600"
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

          {salesMode === 'product-selection' && (
            <div className="flex flex-col lg:flex-row h-screen">
              {/* POS Terminal - Main Area */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Sale Header - Premium Design */}
                <div className="bg-gradient-to-r from-brand-gray/80 to-brand-gray/40 backdrop-blur-md border-b border-brand-yellow/20 p-4 sm:p-6 shadow-2xl sticky top-0 z-30">
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
                <div className="p-4 sm:p-6 space-y-4 bg-brand-black/30 border-b border-brand-yellow/10">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative group">
                      <div className="absolute inset-0 bg-gradient-to-r from-brand-yellow/20 to-transparent rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity duration-300"></div>
                      <MagnifyingGlassIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-brand-yellow/60 group-focus-within:text-brand-yellow transition-colors" />
                      <input
                        type="text"
                        placeholder="Search products, barcode, or SKU..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="relative w-full pl-12 pr-4 py-3 sm:py-4 bg-brand-black/50 text-gray-100 border border-brand-yellow/20 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-transparent transition-all duration-200 placeholder-gray-500"
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
                        className={`px-5 py-2 rounded-xl font-semibold transition-all duration-200 whitespace-nowrap text-sm border ${
                          selectedCategory === category
                            ? 'bg-brand-yellow text-brand-black border-brand-yellow shadow-lg shadow-brand-yellow/30'
                            : 'bg-brand-black/40 text-gray-200 border-brand-yellow/20 hover:border-brand-yellow/40 hover:bg-brand-black/60'
                        }`}
                      >
                        {category === 'all' ? '🎯 All' : category}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Product Grid - Premium Card Design */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6">
                  <div className={`grid ${
                    view === 'grid' 
                      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5' 
                      : 'grid-cols-1'
                  } gap-3 sm:gap-4`}>
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
                        <h3 className="text-xl font-bold text-gray-100 mb-2">No Products Found</h3>
                        <p className="text-gray-400 max-w-xs">Try adjusting your search or category filter to find what you need</p>
                      </div>
                    ) : (
                      filteredProducts.map((product, idx) => (
                        <button
                          type="button"
                          key={product.id}
                          onClick={withTrustedClick(() => addToCart(product))}
                          disabled={product.stockQuantity <= 0}
                          className="group relative h-full bg-gradient-to-br from-brand-gray/50 to-brand-gray/30 border border-brand-yellow/20 rounded-2xl overflow-hidden hover:border-brand-yellow/50 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-brand-yellow/20 hover:shadow-2xl hover:shadow-brand-yellow/20 hover:scale-105 active:scale-95"
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
                          <div className="relative w-full aspect-square bg-gradient-to-br from-brand-black/60 to-brand-black/40 flex items-center justify-center overflow-hidden">
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
                            <h3 className="font-bold text-gray-100 text-sm line-clamp-2 group-hover:text-white transition-colors mb-1">
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
              <div className={`${
                showCart ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'
              } fixed lg:static bottom-0 left-0 right-0 lg:right-auto lg:w-96 bg-gradient-to-b from-brand-gray/90 to-brand-gray/70 backdrop-blur-md border-t lg:border-t-0 lg:border-l border-brand-yellow/30 flex flex-col h-[60vh] lg:h-full transition-transform duration-300 ease-out z-50 lg:z-auto shadow-2xl`}>
                {/* Cart Header */}
                <div className="p-4 sm:p-6 border-b border-brand-yellow/20 bg-gradient-to-r from-brand-gray/80 to-brand-gray/40">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-brand-yellow/20 rounded-xl flex items-center justify-center">
                        <ShoppingCartIcon className="h-5 w-5 text-brand-yellow" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Shopping Cart</p>
                        <p className="text-lg font-bold text-white">{currentSale.items.length} items</p>
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
                  {currentSale.items.length === 0 ? (
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
                        className="group bg-gradient-to-br from-brand-black/60 to-brand-black/40 rounded-xl p-4 hover:from-brand-black/80 hover:to-brand-black/60 transition-all duration-200 border border-brand-yellow/10 hover:border-brand-yellow/30"
                        style={{ animationDelay: `${idx * 0.05}s` }}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-bold text-gray-100 text-sm group-hover:text-white transition-colors line-clamp-2">{item.name}</h4>
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
                          <div className="flex items-center space-x-1 bg-brand-black/40 rounded-lg p-1">
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
                  )}
                </div>

                {/* Total and Checkout */}
                {currentSale.items.length > 0 && (
                  <div className="p-4 sm:p-6 border-t border-brand-yellow/20 bg-gradient-to-t from-brand-gray to-brand-gray/50 space-y-4">
                    {/* Summary */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-300">Subtotal:</span>
                        <span className="text-gray-100 font-semibold">
                          {formatCurrency(currentSale.items.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0))}
                        </span>
                      </div>
                      <div className="h-px bg-gradient-to-r from-transparent via-brand-yellow/20 to-transparent"></div>
                      <div className="flex justify-between items-center">
                        <span className="text-base font-bold text-gray-100">Total:</span>
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
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Cart Toggle Button */}
      {salesMode === 'product-selection' && (
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
      {showStatsPanel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-center justify-end" onClick={withTrustedClick(() => setShowStatsPanel(false))}>
          <div className="absolute right-4 sm:right-8 top-24 w-96 max-w-[calc(100vw-2rem)] bg-gradient-to-br from-brand-gray to-brand-gray/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-brand-yellow/20 p-6 sm:p-8 animate-slideIn" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-xs text-brand-yellow uppercase tracking-widest font-bold">Performance Dashboard</p>
                <h3 className="text-3xl font-black text-white mt-1">My Stats</h3>
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
              <div className="group relative bg-gradient-to-br from-green-500/20 to-emerald-600/10 border border-green-500/30 hover:border-green-500/60 rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-default">
                <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-xs text-green-300/80 uppercase tracking-wide font-semibold mb-1">Today's Revenue</p>
                    <p className="text-3xl font-black text-white mb-1">{formatCurrency(cashierStats?.today?.totalSales || 0)}</p>
                    <p className="text-sm text-green-200/70">{cashierStats?.today?.orderCount || 0} completed transactions</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center">
                    <ArrowTrendingUpIcon className="h-6 w-6 text-green-400" />
                  </div>
                </div>
              </div>

              {/* This Week */}
              <div className="group relative bg-gradient-to-br from-purple-500/20 to-indigo-600/10 border border-purple-500/30 hover:border-purple-500/60 rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-default">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full blur-2xl group-hover:blur-3xl transition-all"></div>
                <div className="relative flex items-start justify-between">
                  <div>
                    <p className="text-xs text-purple-300/80 uppercase tracking-wide font-semibold mb-1">Weekly Revenue</p>
                    <p className="text-3xl font-black text-white mb-1">{formatCurrency(cashierStats?.week?.totalSales || 0)}</p>
                    <p className="text-sm text-purple-200/70">{cashierStats?.week?.orderCount || 0} transactions this week</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <ChartBarIcon className="h-6 w-6 text-purple-400" />
                  </div>
                </div>
              </div>

              {/* Recent Sales */}
              <div className="bg-gradient-to-br from-brand-black/60 to-brand-black/40 border border-brand-yellow/10 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold text-white text-lg">Recent Sales</h4>
                  <ShoppingCartIcon className="h-5 w-5 text-brand-yellow/60" />
                </div>
                <div className="space-y-2">
                  {(recentSales || []).slice(0, 4).map((sale, index) => (
                    <div key={index} className="flex justify-between items-center p-3 bg-black/30 hover:bg-black/50 rounded-lg transition-colors group">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 group-hover:animate-pulse"></div>
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
      )}
    </div>
  );
}
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../store/slices/productsSlice';
import useCurrency from '../hooks/useCurrency';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import Fuse from 'fuse.js';
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

// Custom Hook for Persisted Cart
function usePersistedCart(cashierId) {
  const [currentSale, setCurrentSale] = useState({
    customer: { name: '', location: '', phone: '', email: '' },
    items: [],
    total: 0,
    paymentMethod: 'cash',
    paymentAmount: '',
    notes: ''
  });
  const [pendingCart, setPendingCart] = useState(null);
  const key = `zena_cart_${cashierId}`;

  useEffect(() => {
    if (!cashierId) {
      setPendingCart(null);
      return;
    }
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const age = Date.now() - (parsed.savedAt || 0);
        if (age < 8 * 60 * 60 * 1000) { // 8 hours
          setPendingCart(parsed);
        } else {
          localStorage.removeItem(key);
        }
      } catch (err) {
        localStorage.removeItem(key);
      }
    } else {
      setPendingCart(null);
    }
  }, [cashierId, key]);

  useEffect(() => {
    if (!cashierId) return;

    const hasItems = currentSale.items && currentSale.items.length > 0;
    const hasCustomer = currentSale.customer && currentSale.customer.name && currentSale.customer.name !== 'Walk-in Customer';

    if (hasItems || hasCustomer) {
      const dataToSave = {
        items: currentSale.items.map(item => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          sku: item.sku,
          barcode: item.barcode,
          image: item.image,
          stockQuantity: item.stockQuantity
        })),
        customer: currentSale.customer,
        customerId: currentSale.customerId,
        notes: currentSale.notes,
        savedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(dataToSave));
    } else {
      localStorage.removeItem(key);
    }
  }, [currentSale.items, currentSale.customer, currentSale.customerId, currentSale.notes, cashierId, key]);

  const clearPersistedCart = useCallback(() => {
    if (!cashierId) return;
    localStorage.removeItem(key);
    setPendingCart(null);
  }, [cashierId, key]);

  return {
    currentSale,
    setCurrentSale,
    pendingCart,
    setPendingCart,
    clearPersistedCart
  };
}

export default function CashierDashboard() {
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user, token } = useSelector((state) => state.auth);
  const { showToast } = useToast();
  
  // Persisted cart state hook
  const { currentSale, setCurrentSale, pendingCart, setPendingCart, clearPersistedCart } = usePersistedCart(user?.id);

  // Sales workflow state
  const [salesMode, setSalesMode] = useState('idle'); // 'idle', 'customer-info', 'product-selection', 'payment'

  // Held Carts workflow state
  const [heldCarts, setHeldCarts] = useState([]);
  const [showHoldPrompt, setShowHoldPrompt] = useState(false);
  const [holdLabel, setHoldLabel] = useState('');
  const [showHeldCartsDrawer, setShowHeldCartsDrawer] = useState(false);

  // Barcode / fuzzy search / cart item undo states
  const [searchType, setSearchType] = useState('exact');
  const lastFullProductsRef = useRef([]);
  const [pendingRemovals, setPendingRemovals] = useState({});
  const [undoToast, setUndoToast] = useState(null);
  const removalTimeoutsRef = useRef({});
  const undoButtonRef = useRef(null);

  const isModalOpen = showPaymentModal || showCustomerModal || showHeldCartsDrawer || showHoldPrompt;

  const onScanBarcode = async (scannedBarcode) => {
    setBarcodeError('');
    try {
      const response = await api.get('/api/products', {
        params: {
          search: scannedBarcode.trim(),
          page: 1,
          pageSize: 20
        }
      });
      const returnedProducts = response.data.products || response.data || [];
      if (returnedProducts.length === 1) {
        addToCart(returnedProducts[0]);
      } else if (returnedProducts.length === 0) {
        setBarcodeError(`Barcode not found: ${scannedBarcode}`);
      } else {
        setDisplayedProducts(returnedProducts);
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err);
      setBarcodeError(`Barcode not found: ${scannedBarcode}`);
    }
  };

  useBarcodeScanner({
    onScan: onScanBarcode,
    isActive: salesMode === 'product-selection' && !isModalOpen
  });

  // Effect to validate authentication
  useEffect(() => {
    if (!token) {
      navigate('/login');
    }
  }, [token, navigate]);

  // Revalidate prices of cart items against server
  const revalidateCartPrices = useCallback(async (items) => {
    const updatedItems = [];
    let priceChanged = false;
    for (const item of items) {
      try {
        const response = await api.get(`/api/products/${item.id}`);
        const freshProduct = response.data;
        const freshPrice = typeof freshProduct.price === 'number' ? freshProduct.price : parseFloat(freshProduct.price || 0);
        const oldPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
        if (Math.abs(freshPrice - oldPrice) > 0.001) {
          priceChanged = true;
        }
        updatedItems.push({
          ...item,
          price: freshPrice,
          subtotal: item.quantity * freshPrice,
          stockQuantity: freshProduct.stockQuantity
        });
      } catch (err) {
        updatedItems.push(item);
      }
    }
    return { updatedItems, priceChanged };
  }, []);

  // Restore cart action
  const handleRestoreCart = async () => {
    if (!pendingCart) return;
    try {
      const { items, customer, customerId, notes } = pendingCart;
      const { updatedItems, priceChanged } = await revalidateCartPrices(items);
      const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);

      setCurrentSale({
        customer: customer || { name: 'Walk-in Customer', location: '', phone: '', email: '' },
        customerId: customerId || null,
        items: updatedItems,
        total: newTotal,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: notes || ''
      });
      setSalesMode('product-selection');

      if (priceChanged) {
        showToast('Some item prices have changed since this cart was saved.', 'warning');
      } else {
        showToast('Cart restored successfully.', 'success');
      }
    } catch (error) {
      console.error('Error restoring cart:', error);
      showToast('Failed to restore cart completely.', 'error');
    } finally {
      setPendingCart(null);
    }
  };

  // Dismiss cart action
  const handleDismissPendingCart = () => {
    clearPersistedCart();
  };

  // Fetch Held Carts list
  const fetchHeldCarts = useCallback(async () => {
    try {
      const response = await api.get('/api/held-carts');
      setHeldCarts(response.data);
    } catch (error) {
      console.error('Error fetching held carts:', error);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchHeldCarts();
    }
  }, [token, fetchHeldCarts]);

  // Hold active cart submit handler
  const handleHoldCartSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    const defaultLabel = `Customer ${heldCarts.length + 1}`;
    const finalLabel = holdLabel.trim() || defaultLabel;

    try {
      await api.post('/api/held-carts', {
        label: finalLabel,
        items: currentSale.items.map(item => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price
        })),
        customer: currentSale.customer,
        discounts: []
      });

      showToast(`Cart held as '${finalLabel}'.`, 'success');
      
      // Clear cart state and persisted storage
      setCurrentSale({
        customer: { name: '', location: '', phone: '', email: '' },
        items: [],
        total: 0,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: ''
      });
      clearPersistedCart();
      setSalesMode('idle');
      setShowHoldPrompt(false);
      setHoldLabel('');
      fetchHeldCarts();
    } catch (error) {
      console.error('Error holding cart:', error);
      showToast('Failed to hold cart.', 'error');
    }
  };

  // Recall held cart action
  const handleRecall = async (heldCart) => {
    if (currentSale.items.length > 0) {
      const confirmReplace = window.confirm('You have items in your active cart. Are you sure you want to replace it with the recalled cart?');
      if (!confirmReplace) return;
    }

    try {
      const response = await api.post(`/api/held-carts/${heldCart.id}/recall`);
      const { items, customer, discounts, notes } = response.data;
      
      // Re-fetch current prices
      const { updatedItems, priceChanged } = await revalidateCartPrices(items);
      const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);

      setCurrentSale({
        customer: customer || { name: 'Walk-in Customer', location: '', phone: '', email: '' },
        customerId: customer?.id || null,
        items: updatedItems,
        total: newTotal,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: notes || ''
      });
      setSalesMode('product-selection');

      if (priceChanged) {
        showToast('Some item prices have changed since this cart was held.', 'warning');
      } else {
        showToast(`Recalled held cart '${heldCart.label}'`, 'success');
      }
      
      setShowHeldCartsDrawer(false);
      fetchHeldCarts();
    } catch (error) {
      console.error('Error recalling held cart:', error);
      showToast('Failed to recall held cart.', 'error');
    }
  };

  // Dismiss/delete held cart action
  const handleDismissHeldCart = async (id, label) => {
    try {
      await api.delete(`/api/held-carts/${id}`);
      showToast(`Held cart '${label}' dismissed.`, 'success');
      fetchHeldCarts();
    } catch (error) {
      console.error('Error dismissing held cart:', error);
      showToast('Failed to dismiss held cart.', 'error');
    }
  };

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
    fetchCashierStats();
  }, [fetchCashierStats]);

  const [categoryObjects, setCategoryObjects] = useState([]);
  const [categories, setCategories] = useState(['all']);
  const [displayedProducts, setDisplayedProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [showBarcodeField, setShowBarcodeField] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeError, setBarcodeError] = useState('');
  const searchInputRef = useRef(null);

  // Fetch categories on mount
  useEffect(() => {
    const fetchCats = async () => {
      try {
        const response = await api.get('/api/categories');
        setCategoryObjects(response.data);
        const catNames = response.data.map(c => c.name).filter(Boolean);
        setCategories(['all', ...catNames]);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCats();
  }, []);

  // Fetch products when search query or category selection changes (debounced)
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      setProductsLoading(true);
      try {
        const params = {
          search: searchQuery,
          page: 1,
          pageSize: 20,
          fuzzy: true
        };
        if (selectedCategory !== 'all') {
          const matchedCat = categoryObjects.find(c => c.name === selectedCategory);
          if (matchedCat) {
            params.categoryId = matchedCat.id;
          }
        }
        const response = await api.get('/api/products', { params });
        const fetchedProducts = response.data.products || response.data || [];
        const returnedSearchType = response.data.searchType || 'exact';

        if (!searchQuery.trim()) {
          lastFullProductsRef.current = fetchedProducts;
        }

        let mergedResults = [...fetchedProducts];
        let currentSearchType = returnedSearchType;

        if (searchQuery.trim().length >= 2 && fetchedProducts.length < 3) {
          const fuse = new Fuse(lastFullProductsRef.current || [], {
            keys: ['name', 'sku', 'barcode'],
            threshold: 0.4,
            minMatchCharLength: 2
          });
          const fuseResults = fuse.search(searchQuery.trim()).map(res => res.item);
          const serverIds = new Set(fetchedProducts.map(p => p.id));
          const uniqueFuzzyResults = fuseResults.filter(p => !serverIds.has(p.id));

          if (uniqueFuzzyResults.length > 0) {
            mergedResults = [
              ...fetchedProducts,
              ...uniqueFuzzyResults.map(p => ({ ...p, isFuzzy: true }))
            ];
            currentSearchType = 'fuzzy';
          }
        }

        setDisplayedProducts(mergedResults);
        setSearchType(currentSearchType);
      } catch (err) {
        console.error('Error fetching products:', err);
      } finally {
        setProductsLoading(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, selectedCategory, categoryObjects]);

  // Autofocus search input when POS mounts (product-selection mode)
  useEffect(() => {
    if (salesMode === 'product-selection') {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }, [salesMode]);

  // Sales workflow functions
  const startNewSale = () => {
    setSalesMode('customer-info');
    setShowCustomerModal(true);
  };

  const handleCustomerInfoSubmit = (customerData) => {
    setCurrentSale(prev => ({
      ...prev,
      customer: {
        name: customerData.name,
        location: customerData.location,
        phone: customerData.phone,
        email: customerData.email
      },
      customerId: customerData.id || null
    }));
    setSalesMode('product-selection');
    setShowCustomerModal(false);
  };

  const skipCustomerInfo = () => {
    setCurrentSale(prev => ({
      ...prev,
      customer: { name: 'Walk-in Customer', location: '', phone: '', email: '' },
      customerId: null
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

  const commitRemoval = (itemId) => {
    if (removalTimeoutsRef.current[itemId]) {
      clearTimeout(removalTimeoutsRef.current[itemId]);
      delete removalTimeoutsRef.current[itemId];
    }

    setCurrentSale(prev => {
      const updatedItems = prev.items.filter(i => i.id !== itemId);
      const remainingItems = updatedItems.filter(i => !pendingRemovals[i.id]);
      const newTotal = remainingItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);
      return {
        ...prev,
        items: updatedItems,
        total: newTotal
      };
    });

    setPendingRemovals(prev => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    setUndoToast(prev => (prev && prev.itemId === itemId ? null : prev));
  };

  const undoRemoval = (itemId) => {
    if (removalTimeoutsRef.current[itemId]) {
      clearTimeout(removalTimeoutsRef.current[itemId]);
      delete removalTimeoutsRef.current[itemId];
    }

    setPendingRemovals(prev => {
      const copy = { ...prev };
      delete copy[itemId];

      const remainingItems = currentSale.items.filter(i => !copy[i.id]);
      const newTotal = remainingItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

      setCurrentSale(sale => ({
        ...sale,
        total: newTotal
      }));

      return copy;
    });

    setUndoToast(null);
  };

  const removeFromCart = (itemId) => {
    const activeKeys = Object.keys(pendingRemovals);
    if (activeKeys.length > 0) {
      activeKeys.forEach(id => {
        commitRemoval(id);
      });
    }

    const item = currentSale.items.find(i => i.id === itemId);
    if (!item) return;

    setPendingRemovals(prev => ({
      ...prev,
      [itemId]: { item, removedAt: Date.now() }
    }));

    const remainingItems = currentSale.items.filter(i => i.id !== itemId && !pendingRemovals[i.id]);
    const newTotal = remainingItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);
    setCurrentSale(prev => ({
      ...prev,
      total: newTotal
    }));

    setUndoToast({
      itemId,
      productName: item.name
    });

    const timeoutId = setTimeout(() => {
      commitRemoval(itemId);
    }, 5000);

    removalTimeoutsRef.current[itemId] = timeoutId;
  };

  // Keyboard accessibility for undo toast
  useEffect(() => {
    if (undoToast) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          commitRemoval(undoToast.itemId);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [undoToast, pendingRemovals]);

  useEffect(() => {
    if (undoToast) {
      setTimeout(() => {
        undoButtonRef.current?.focus();
      }, 50);
    }
  }, [undoToast]);

  const handleProceedToPayment = () => {
    const pendingIds = Object.keys(pendingRemovals);
    if (pendingIds.length > 0) {
      pendingIds.forEach(id => {
        if (removalTimeoutsRef.current[id]) {
          clearTimeout(removalTimeoutsRef.current[id]);
          delete removalTimeoutsRef.current[id];
        }
      });
      const activeItems = currentSale.items.filter(item => !pendingRemovals[item.id]);
      const activeTotal = activeItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);

      setCurrentSale(prev => ({
        ...prev,
        items: activeItems,
        total: activeTotal
      }));
      setPendingRemovals({});
      setUndoToast(null);
    }
    setShowPaymentModal(true);
  };

  const handleClearCart = (confirm = false) => {
    if (confirm && !window.confirm('Are you sure you want to clear this cart?')) {
      return;
    }

    Object.keys(removalTimeoutsRef.current).forEach(id => {
      clearTimeout(removalTimeoutsRef.current[id]);
    });
    removalTimeoutsRef.current = {};

    setCurrentSale(prev => ({ ...prev, items: [], total: 0 }));
    setPendingRemovals({});
    setUndoToast(null);
    clearPersistedCart();
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

    const newTotal = updatedItems.filter(i => !pendingRemovals[i.id]).reduce((sum, item) => sum + item.subtotal, 0);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: newTotal
    }));
  };

  const cancelSale = () => {
    if (window.confirm('Are you sure you want to cancel this sale? All progress will be lost.')) {
      setSalesMode('idle');

      Object.keys(removalTimeoutsRef.current).forEach(id => {
        clearTimeout(removalTimeoutsRef.current[id]);
      });
      removalTimeoutsRef.current = {};

      setCurrentSale({
        customer: { name: '', location: '', phone: '', email: '' },
        items: [],
        total: 0,
        paymentMethod: 'cash',
        paymentAmount: '',
        notes: ''
      });
      setPendingRemovals({});
      setUndoToast(null);
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
        customerId: currentSale.customerId || null,
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

  const handlePaymentSuccess = (completeSale) => {
    notifySaleComplete(completeSale.id);
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
    fetchCashierStats();
  };

  const handleBarcodeScan = () => {
    setShowBarcodeField(prev => !prev);
    setBarcodeInput('');
    setBarcodeError('');
  };

  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;

    setBarcodeError('');
    try {
      const response = await api.get('/api/products', {
        params: {
          search: barcodeInput.trim(),
          page: 1,
          pageSize: 20
        }
      });
      const returnedProducts = response.data.products || response.data || [];
      const matchedProduct = returnedProducts.find(
        p => p.barcode === barcodeInput.trim() || p.sku === barcodeInput.trim()
      );
      if (matchedProduct) {
        addToCart(matchedProduct);
        setBarcodeInput('');
      } else {
        setBarcodeError('Product not found');
      }
    } catch (err) {
      console.error('Barcode lookup failed:', err);
      setBarcodeError('Product not found');
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
        {pendingCart && (
          <div className="bg-brand-yellow/15 border-b border-brand-yellow/30 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slideIn">
            <div className="flex items-center space-x-3">
              <span className="text-xl">🛒</span>
              <p className="text-sm text-brand-yellow font-medium">
                You have an unsaved cart from your last session ({pendingCart.items?.length || 0} items).
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={handleRestoreCart}
                className="px-4 py-2 bg-brand-yellow text-brand-black font-bold text-xs rounded-xl hover:bg-brand-yellowDark transition-all"
              >
                Restore Cart
              </button>
              <button
                type="button"
                onClick={handleDismissPendingCart}
                className="px-4 py-2 bg-transparent text-gray-400 hover:text-white text-xs font-bold rounded-xl transition-all border border-gray-600 hover:border-gray-400"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
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
                      <div className="flex items-center space-x-4">
                        <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
                        <div>
                          <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Current Sale</p>
                          <h2 className="text-xl font-bold text-white">{currentSale.customer.name}</h2>
                          {currentSale.customer.location && (
                            <p className="text-sm text-gray-300">📍 {currentSale.customer.location}</p>
                          )}
                        </div>
                        {/* Scanner Status Indicator */}
                        <div className="flex items-center space-x-2 pl-4 border-l border-gray-800">
                          <span className="text-sm">📷</span>
                          <span className={`text-xs font-semibold ${isModalOpen ? 'text-orange-400' : 'text-green-400'}`}>
                            {isModalOpen ? 'Scanner paused' : 'Scanner ready'}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        <button
                          type="button"
                          onClick={() => setShowHeldCartsDrawer(true)}
                          className="px-4 py-2 text-brand-yellow hover:bg-brand-yellow/10 border border-brand-yellow/20 rounded-xl transition-all duration-200 text-sm font-medium hover:border-brand-yellow/40 flex items-center space-x-2"
                        >
                          <span>⏸️ Held Carts</span>
                          {heldCarts.length > 0 && (
                            <span className="bg-brand-yellow text-brand-black text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                              {heldCarts.length}
                            </span>
                          )}
                        </button>
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
                            onClick={withTrustedClick(handleProceedToPayment)}
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
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search products, barcode, or SKU..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="relative w-full pl-12 pr-4 py-3 sm:py-4 bg-[#0b0b0c]/50 text-brand-text border border-brand-yellow/20 rounded-xl focus:ring-2 focus:ring-brand-yellow focus:border-transparent transition-all duration-200 placeholder-gray-500"
                        />
                        {searchType === 'fuzzy' && searchQuery.trim() && (
                          <p className="text-xs text-brand-yellow/80 italic mt-1.5 ml-1 animate-fadeIn">
                            Showing approximate matches for '{searchQuery}'
                          </p>
                        )}
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
                    {showBarcodeField && (
                      <form onSubmit={handleBarcodeSubmit} className="flex gap-2 items-center mt-2 animate-fadeIn">
                        <input
                          type="text"
                          placeholder="Scan or type barcode..."
                          value={barcodeInput}
                          onChange={(e) => {
                            setBarcodeInput(e.target.value);
                            setBarcodeError('');
                          }}
                          className="flex-1 px-4 py-2 bg-[#0b0b0c]/60 border border-brand-yellow/30 text-white rounded-xl focus:ring-1 focus:ring-brand-yellow"
                          autoFocus
                        />
                        <button type="submit" className="px-4 py-2 bg-brand-yellow text-brand-black font-bold rounded-xl hover:bg-brand-yellowDark">
                          Add
                        </button>
                        {barcodeError && <span className="text-red-500 text-sm ml-2 font-medium">⚠️ {barcodeError}</span>}
                      </form>
                    )}

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
                      ) : displayedProducts.length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                          <div className="w-20 h-20 bg-brand-yellow/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                            <MagnifyingGlassIcon className="h-10 w-10 text-brand-yellow" />
                          </div>
                          <h3 className="text-xl font-bold text-brand-text mb-2">No Products Found</h3>
                          <p className="text-gray-400 max-w-xs">
                            {searchQuery.trim()
                              ? `No products found for '${searchQuery}'. Check spelling or scan the barcode.`
                              : "Try adjusting your search or category filter to find what you need"
                            }
                          </p>
                        </div>
                      ) : (
                        (() => {
                          const elements = [];
                          let renderedFuzzyDivider = false;
                          displayedProducts.forEach((product, idx) => {
                            if (product.isFuzzy && !renderedFuzzyDivider) {
                              elements.push(
                                <div key="fuzzy-divider" className="col-span-full border-t border-dashed border-brand-yellow/30 py-4 my-2 flex items-center justify-between">
                                  <span className="text-sm font-semibold text-brand-yellow tracking-wider uppercase">Approximate matches</span>
                                  <div className="h-[1px] bg-brand-yellow/20 flex-1 ml-4"></div>
                                </div>
                              );
                              renderedFuzzyDivider = true;
                            }
                            elements.push(
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
                                <div className="p-3 sm:p-4 relative text-left">
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
                            );
                          });
                          return elements;
                        })()
                      )
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
                            onClick={() => handleClearCart(false)}
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
                        (() => {
                          const elements = [];
                          currentSale.items.forEach((item, idx) => {
                            const isPending = !!pendingRemovals[item.id];
                            elements.push(
                              <div
                                key={item.id}
                                className={`group bg-gradient-to-br from-[#0b0b0c]/60 to-[#0b0b0c]/40 rounded-xl p-4 hover:from-[#0b0b0c]/80 hover:to-[#0b0b0c]/60 transition-all duration-200 border border-brand-yellow/10 hover:border-brand-yellow/30 ${isPending ? 'opacity-40 line-through pointer-events-none' : ''}`}
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
                            );
                          });
                          return elements;
                        })()
                      )
                    }
                  </div>

                  {/* Undo Toast */}
                  {undoToast && (
                    <div 
                      className="bg-brand-gray/95 border border-brand-yellow/30 p-3 rounded-xl flex items-center justify-between text-xs text-white shadow-2xl animate-slideIn relative overflow-hidden my-2 mx-4"
                      role="status"
                      aria-live="polite"
                    >
                      <div 
                        className="absolute bottom-0 left-0 h-1 bg-brand-yellow" 
                        style={{ 
                          width: '100%', 
                          animation: 'countdown 5s linear forwards' 
                        }}
                      ></div>
                      <style>{`
                        @keyframes countdown {
                          from { width: 100%; }
                          to { width: 0%; }
                        }
                      `}</style>
                      <div className="flex-1 pr-2">
                        <strong>{undoToast.productName}</strong> removed.
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => undoRemoval(undoToast.itemId)}
                          className="px-3 py-1 bg-brand-yellow text-brand-black rounded-lg font-bold hover:bg-brand-yellowDark focus:ring-2 focus:ring-brand-yellow focus:outline-none text-xs"
                          ref={undoButtonRef}
                        >
                          Undo
                        </button>
                        <button
                          type="button"
                          onClick={() => commitRemoval(undoToast.itemId)}
                          className="text-gray-400 hover:text-white p-1"
                          title="Dismiss"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Total and Checkout */}
                  {
                    currentSale.items.length > 0 && (
                      <div className="p-4 sm:p-6 border-t border-brand-yellow/20 bg-gradient-to-t from-[#0f0f11] to-[#0b0b0c]/50 space-y-4">
                        {/* Summary */}
                        <div className="space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300">Subtotal:</span>
                            <span className="text-brand-text font-semibold">
                              {formatCurrency(currentSale.items.filter(item => !pendingRemovals[item.id]).reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0))}
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

                        {/* Hold / Clear Cart Actions */}
                        {showHoldPrompt ? (
                          <form onSubmit={handleHoldCartSubmit} className="bg-[#0b0b0c]/60 p-4 border border-brand-yellow/30 rounded-xl space-y-3 animate-fadeIn">
                            <div>
                              <label className="block text-xs font-bold text-gray-400 mb-1">HOLD CART LABEL</label>
                              <input
                                type="text"
                                placeholder={`Customer ${heldCarts.length + 1}`}
                                value={holdLabel}
                                onChange={(e) => setHoldLabel(e.target.value)}
                                className="w-full px-3 py-2 bg-[#0b0b0c] text-white border border-brand-yellow/20 rounded-lg focus:ring-1 focus:ring-brand-yellow text-sm focus:outline-none"
                                maxLength={80}
                                autoFocus
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="flex-1 py-2 bg-brand-yellow text-brand-black text-xs font-bold rounded-lg hover:bg-brand-yellowDark transition-colors"
                              >
                                Confirm Hold
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowHoldPrompt(false);
                                  setHoldLabel('');
                                }}
                                className="flex-1 py-2 bg-transparent text-gray-400 hover:text-white border border-gray-600 rounded-lg text-xs font-bold transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setHoldLabel(`Customer ${heldCarts.length + 1}`);
                                setShowHoldPrompt(true);
                              }}
                              className="flex-1 py-3 border border-brand-yellow/30 text-brand-yellow font-bold text-sm rounded-xl hover:bg-brand-yellow/10 transition-all flex items-center justify-center space-x-1"
                            >
                              <span>⏸️ Hold Cart</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleClearCart(true)}
                              className="flex-1 py-3 border border-red-500/30 text-red-400 font-bold text-sm rounded-xl hover:bg-red-500/10 transition-all flex items-center justify-center space-x-1"
                            >
                              <span>🗑️ Clear Cart</span>
                            </button>
                          </div>
                        )}

                        {/* Checkout Button */}
                        <button
                          type="button"
                          onClick={withTrustedClick(handleProceedToPayment)}
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
        onPaymentSuccess={handlePaymentSuccess}
        processingPayment={processingPayment}
        paymentError={paymentError}
        setPaymentError={setPaymentError}
      />

      {/* Held Carts Drawer Overlay */}
      {showHeldCartsDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowHeldCartsDrawer(false)}
          ></div>
          
          {/* Drawer Panel */}
          <div className="relative w-full max-w-md h-full bg-gradient-to-b from-[#0f0f11] to-[#0b0b0c] border-l border-brand-yellow/20 flex flex-col shadow-2xl animate-slideOver">
            {/* Header */}
            <div className="p-6 border-b border-brand-yellow/20 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>⏸️</span> Held Carts
                </h3>
                <p className="text-xs text-gray-400 mt-1">Select a held transaction to recall it</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldCartsDrawer(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white border border-gray-800 hover:border-gray-600 rounded-xl transition-all"
              >
                ✕
              </button>
            </div>
            
            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {heldCarts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="text-4xl mb-3">📭</div>
                  <p className="text-gray-300 font-medium">No Held Carts</p>
                  <p className="text-xs text-gray-400 max-w-xs mt-1">Carts parked by any cashier in this shop will appear here.</p>
                </div>
              ) : (
                heldCarts.map(cart => {
                  const itemCount = cart.cartSnapshot?.items?.length || 0;
                  const totalAmt = cart.cartSnapshot?.items?.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0) || 0;
                  const heldTime = new Date(cart.heldAt).toLocaleTimeString();
                  
                  return (
                    <div
                      key={cart.id}
                      className="bg-brand-gray/20 border border-brand-yellow/10 hover:border-brand-yellow/30 rounded-xl p-4 transition-all flex flex-col justify-between gap-3 group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white text-base">{cart.label}</h4>
                          <p className="text-xs text-gray-400 mt-1">
                            {itemCount} item(s) • Total: {formatCurrency(totalAmt)}
                          </p>
                          <p className="text-xs text-brand-yellow/70 mt-1">Held at: {heldTime}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleRecall(cart)}
                          className="flex-1 py-2 bg-brand-yellow text-brand-black text-xs font-bold rounded-lg hover:bg-brand-yellowDark transition-all"
                        >
                          Recall Transaction
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissHeldCart(cart.id, cart.label)}
                          className="px-3 py-2 bg-transparent text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-bold transition-all"
                          title="Dismiss / Delete held cart"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

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
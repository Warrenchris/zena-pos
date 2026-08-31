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
  XMarkIcon,
  QuestionMarkCircleIcon,
  CommandLineIcon,
  TagIcon,
  CloudArrowUpIcon,
  CameraIcon,
  MapPinIcon,
  PauseIcon,
  BoltIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  CubeIcon,
  TicketIcon,
  InboxIcon,
  SignalIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';
import api, { couponsAPI } from '../services/api';
import cashierAPI from '../services/cashierAPI';
import CustomerModal from '../components/CustomerModal';
import { WALK_IN_CUSTOMER_NAME } from '../constants/customer';
import PaymentModal from '../components/PaymentModal';
import SaleCompleteModal from '../components/SaleCompleteModal';
import KeyboardShortcutsPopover from '../components/pos/KeyboardShortcutsPopover';
import DiscountModal from '../components/pos/DiscountModal';
import { useToast } from '../components/Toast';
import { notifySaleComplete, notifyError as notifyErrorUtil } from '../utils/notifications';
import MetricCard from '../components/pos/MetricCard';
import { usePersistedCart } from '../hooks/usePersistedCart';
import { usePendingSales } from '../hooks/usePendingSales';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';

export default function CashierDashboard() {
  const { format: formatCurrency } = useCurrency();
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const { user, token } = useSelector((state) => state.auth);
  const { showToast } = useToast();
  
  // Persisted cart state hook
  const { currentSale, setCurrentSale, pendingCart, setPendingCart, clearPersistedCart } = usePersistedCart(user?.id);

  // Offline pending sales queue hook (Fix 7)
  const { queueSale, pendingCount, isSyncing, flushPendingSales, generateUUID } = usePendingSales(user?.id, {
    showToast,
    onSaleSynced: () => {
      fetchCashierStats();
    }
  });

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

  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showShortcutHint, setShowShortcutHint] = useState(() => {
    try {
      return localStorage.getItem('zena_pos_dismiss_shortcut_hint') !== 'true';
    } catch {
      return true;
    }
  });

  // Manual Discount states (Fix 8)
  const [cartManualDiscount, setCartManualDiscount] = useState(null);
  const [discountModalState, setDiscountModalState] = useState({
    isOpen: false,
    target: 'cart',
    item: null,
    baseAmount: 0,
    existingDiscount: null
  });

  const isModalOpen = showPaymentModal || showCustomerModal || showHeldCartsDrawer || showHoldPrompt || !!completedSale || showShortcutsModal || discountModalState.isOpen;

  useKeyboardShortcuts({
    isActive: salesMode === 'product-selection' && !isModalOpen && !completedSale,
    onProceedToPayment: () => {
      if (currentSale.items.length > 0) {
        handleProceedToPayment();
      }
    },
    onHoldCart: () => {
      if (currentSale.items.length > 0) {
        setHoldLabel(`Customer ${heldCarts.length + 1}`);
        setShowHoldPrompt(true);
      }
    },
    onOpenHeldCarts: () => setShowHeldCartsDrawer(true),
    onCancelSale: () => {
      if (salesMode === 'product-selection') {
        cancelSale();
      }
    },
    onFocusSearch: () => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    },
    onToggleHelp: () => setShowShortcutsModal(prev => !prev)
  });

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

  // Revalidate prices of cart items against server using a single batch request
  const revalidateCartPrices = useCallback(async (items) => {
    if (!Array.isArray(items) || items.length === 0) {
      return { updatedItems: [], priceChanged: false };
    }

    try {
      const ids = items.map(item => item.id || item.productId).filter(Boolean).join(',');
      const response = await api.get('/api/products/batch', { params: { ids } });
      const freshProducts = response.data || [];
      const productMap = new Map(freshProducts.map(p => [p.id, p]));

      let priceChanged = false;
      const updatedItems = items.map(item => {
        const itemId = item.id || item.productId;
        const freshProduct = productMap.get(itemId);

        if (freshProduct) {
          const freshPrice = typeof freshProduct.price === 'number' ? freshProduct.price : parseFloat(freshProduct.price || 0);
          const oldPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
          if (Math.abs(freshPrice - oldPrice) > 0.001) {
            priceChanged = true;
          }
          return {
            ...item,
            price: freshPrice,
            subtotal: item.quantity * freshPrice,
            stockQuantity: freshProduct.stockQuantity
          };
        }
        return item;
      });

      return { updatedItems, priceChanged };
    } catch (error) {
      console.warn('Batch price revalidation failed, falling back to parallel fetch:', error);
      // Parallel fallback with Promise.all
      let priceChanged = false;
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          try {
            const itemId = item.id || item.productId;
            const res = await api.get(`/api/products/${itemId}`);
            const freshProduct = res.data;
            const freshPrice = typeof freshProduct.price === 'number' ? freshProduct.price : parseFloat(freshProduct.price || 0);
            const oldPrice = typeof item.price === 'number' ? item.price : parseFloat(item.price || 0);
            if (Math.abs(freshPrice - oldPrice) > 0.001) {
              priceChanged = true;
            }
            return {
              ...item,
              price: freshPrice,
              subtotal: item.quantity * freshPrice,
              stockQuantity: freshProduct.stockQuantity
            };
          } catch {
            return item;
          }
        })
      );
      return { updatedItems, priceChanged };
    }
  }, []);

  // Restore cart action
  const handleRestoreCart = async () => {
    if (!pendingCart) return;
    try {
      const { items, customer, customerId, notes } = pendingCart;
      const { updatedItems, priceChanged } = await revalidateCartPrices(items);
      const newTotal = updatedItems.reduce((sum, item) => sum + item.subtotal, 0);

      setCurrentSale({
        customer: customer || { name: WALK_IN_CUSTOMER_NAME, location: '', phone: '', email: '' },
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
        customer: customer || { name: WALK_IN_CUSTOMER_NAME, location: '', phone: '', email: '' },
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

  // Coupon / Voucher states
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  // Recalculate cart totals considering item discounts, cart manual discount, or coupon (one-or-the-other)
  const computeCartTotals = useCallback((items, manualDiscount = cartManualDiscount, coupon = appliedCoupon) => {
    const activeItems = items.filter(item => !pendingRemovals[item.id]);
    const grossSubtotal = activeItems.reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0);
    const itemDiscountsTotal = activeItems.reduce((sum, item) => sum + (parseFloat(item.discount || 0)), 0);
    const netSubtotal = Math.max(0, grossSubtotal - itemDiscountsTotal);

    let cartDiscountAmount = 0;
    if (manualDiscount) {
      if (manualDiscount.discountType === 'percentage') {
        cartDiscountAmount = Math.min(netSubtotal, (netSubtotal * parseFloat(manualDiscount.discountValue || 0)) / 100);
      } else {
        cartDiscountAmount = Math.min(netSubtotal, parseFloat(manualDiscount.discountValue || 0));
      }
    }

    let couponDiscountAmount = 0;
    if (coupon) {
      couponDiscountAmount = parseFloat(coupon.discountAmount || 0);
    }

    const total = Math.max(0, netSubtotal - cartDiscountAmount - couponDiscountAmount);
    return { grossSubtotal, itemDiscountsTotal, netSubtotal, cartDiscountAmount, couponDiscountAmount, total };
  }, [pendingRemovals, cartManualDiscount, appliedCoupon]);

  // Open line-item discount modal
  const handleOpenItemDiscount = (item) => {
    const itemBaseAmount = parseFloat(item.price || 0) * item.quantity;
    setDiscountModalState({
      isOpen: true,
      target: 'item',
      item,
      baseAmount: itemBaseAmount,
      existingDiscount: item.discount ? {
        discountType: item.discountType,
        discountValue: item.discountValue,
        discountReason: item.discountReason
      } : null
    });
  };

  // Open cart-level manual discount modal (enforces one-or-the-other with coupons)
  const handleOpenCartDiscount = () => {
    if (appliedCoupon) {
      const confirmReplace = window.confirm(`A coupon '${appliedCoupon.code}' is applied. Applying a manual discount will replace it. Proceed?`);
      if (!confirmReplace) return;
    }
    const grossSubtotal = currentSale.items
      .filter(item => !pendingRemovals[item.id])
      .reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity) - (parseFloat(item.discount || 0)), 0);

    setDiscountModalState({
      isOpen: true,
      target: 'cart',
      item: null,
      baseAmount: grossSubtotal,
      existingDiscount: cartManualDiscount
    });
  };

  // Apply discount from modal
  const handleApplyDiscount = (discountData) => {
    if (discountModalState.target === 'item') {
      const updatedItems = currentSale.items.map(item => {
        if (item.id === discountModalState.item?.id) {
          return {
            ...item,
            discount: discountData.discountAmount,
            discountType: discountData.discountType,
            discountValue: discountData.discountValue,
            discountReason: discountData.discountReason,
            managerApprovalId: discountData.managerApprovalId || null,
            managerPassword: discountData.managerPassword || null
          };
        }
        return item;
      });
      const totals = computeCartTotals(updatedItems, cartManualDiscount, appliedCoupon);
      setCurrentSale(prev => ({
        ...prev,
        items: updatedItems,
        total: totals.total
      }));
      showToast(`Discount applied to ${discountModalState.item?.name}`, 'success');
    } else {
      // Cart-level discount: clear coupon (one-or-the-other policy)
      setAppliedCoupon(null);
      setCartManualDiscount(discountData);
      const totals = computeCartTotals(currentSale.items, discountData, null);
      setCurrentSale(prev => ({
        ...prev,
        total: totals.total,
        manualDiscount: discountData,
        appliedCoupon: null
      }));
      showToast(`Cart discount of ${formatCurrency(discountData.discountAmount)} applied!`, 'success');
    }
  };

  // Remove line-item discount
  const handleRemoveItemDiscount = (itemId) => {
    const updatedItems = currentSale.items.map(item => {
      if (item.id === itemId) {
        const copy = { ...item };
        delete copy.discount;
        delete copy.discountType;
        delete copy.discountValue;
        delete copy.discountReason;
        delete copy.managerApprovalId;
        delete copy.managerPassword;
        return copy;
      }
      return item;
    });
    const totals = computeCartTotals(updatedItems, cartManualDiscount, appliedCoupon);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: totals.total
    }));
    showToast('Item discount removed.', 'info');
  };

  // Remove cart-level manual discount
  const handleRemoveCartDiscount = () => {
    setCartManualDiscount(null);
    const totals = computeCartTotals(currentSale.items, null, appliedCoupon);
    setCurrentSale(prev => ({
      ...prev,
      total: totals.total,
      manualDiscount: null
    }));
    showToast('Cart discount removed.', 'info');
  };

  // Apply Coupon handler (enforces one-or-the-other with manual discount)
  const handleApplyCoupon = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!couponCode.trim()) return;

    if (cartManualDiscount) {
      const confirmReplace = window.confirm('A manual discount is currently applied. Applying a coupon will replace it. Proceed?');
      if (!confirmReplace) return;
      setCartManualDiscount(null);
    }

    setValidatingCoupon(true);
    setCouponError('');
    try {
      const subtotal = currentSale.items
        .filter(item => !pendingRemovals[item.id])
        .reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity) - (parseFloat(item.discount || 0)), 0);

      const res = await couponsAPI.validate(couponCode.trim(), subtotal);
      if (res.data && res.data.valid) {
        const { coupon, discountAmount } = res.data;
        const calcDiscount = parseFloat(discountAmount || 0);
        const newCouponObj = {
          code: coupon.code,
          title: coupon.title,
          discountAmount: calcDiscount,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue
        };
        setAppliedCoupon(newCouponObj);

        // Recalculate total with coupon discount (and no cart manual discount)
        const totals = computeCartTotals(currentSale.items, null, newCouponObj);
        setCurrentSale(prev => ({
          ...prev,
          total: totals.total,
          appliedCoupon: coupon.code,
          manualDiscount: null
        }));

        setCouponCode('');
        showToast(`Coupon '${coupon.code}' applied! Saved ${formatCurrency(calcDiscount)}`, 'success');
      } else {
        setCouponError(res.data?.message || 'Invalid or expired coupon');
      }
    } catch (err) {
      setCouponError(err.response?.data?.error || err.response?.data?.message || 'Invalid coupon code');
    } finally {
      setValidatingCoupon(false);
    }
  };

  // Remove Coupon handler
  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError('');
    const totals = computeCartTotals(currentSale.items, cartManualDiscount, null);
    setCurrentSale(prev => ({
      ...prev,
      total: totals.total,
      appliedCoupon: null
    }));
    showToast('Coupon removed.', 'info');
  };

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
    setCurrentSale(prev => ({
      ...prev,
      customer: { name: WALK_IN_CUSTOMER_NAME, location: '', phone: '', email: '' },
      customerId: null
    }));
    setSalesMode('product-selection');
    setShowCustomerModal(false);
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
      customer: { name: WALK_IN_CUSTOMER_NAME, location: '', phone: '', email: '' },
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
            subtotal: ((item.quantity + 1) * productPrice) - (parseFloat(item.discount || 0))
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

    const totals = computeCartTotals(updatedItems);

    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: totals.total
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
      const totals = computeCartTotals(updatedItems);
      return {
        ...prev,
        items: updatedItems,
        total: totals.total
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

      const totals = computeCartTotals(currentSale.items);

      setCurrentSale(sale => ({
        ...sale,
        total: totals.total
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

    const totals = computeCartTotals(currentSale.items);
    setCurrentSale(prev => ({
      ...prev,
      total: totals.total
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
      const totals = computeCartTotals(activeItems);

      setCurrentSale(prev => ({
        ...prev,
        items: activeItems,
        total: totals.total
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

    setCartManualDiscount(null);
    setAppliedCoupon(null);
    setCurrentSale(prev => ({ ...prev, items: [], total: 0, appliedCoupon: null, manualDiscount: null }));
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
        ? { ...item, quantity: newQuantity, subtotal: (newQuantity * item.price) - (parseFloat(item.discount || 0)) }
        : item
    );

    const totals = computeCartTotals(updatedItems);
    setCurrentSale(prev => ({
      ...prev,
      items: updatedItems,
      total: totals.total
    }));
  };

  const cancelSale = () => {
    if (window.confirm('Are you sure you want to cancel this sale? All progress will be lost.')) {
      setSalesMode('idle');

      Object.keys(removalTimeoutsRef.current).forEach(id => {
        clearTimeout(removalTimeoutsRef.current[id]);
      });
      removalTimeoutsRef.current = {};

      setCartManualDiscount(null);
      setAppliedCoupon(null);
      setCurrentSale({
        customer: { name: '', location: '', phone: '', email: '' },
        customerId: null,
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

    const idempotencyKey = generateUUID();

    // A single manager credential authorizes every discount in this sale —
    // pulled from whichever discount (cart-level takes priority, else the
    // first item that needed approval) actually required it. We do not send
    // a password per line item; one verified approval covers the whole sale.
    const approvalSource = (cartManualDiscount && cartManualDiscount.managerApprovalId)
      ? cartManualDiscount
      : currentSale.items.find(item => item.managerApprovalId);
    const managerApprovalId = approvalSource ? approvalSource.managerApprovalId : null;
    const managerPassword = approvalSource ? approvalSource.managerPassword : null;

    // Prepare sale data with discount metadata and client idempotency key
    const saleData = {
      idempotencyKey,
      managerApprovalId,
      managerPassword,
      items: currentSale.items.map(item => ({
        productId: item.id,
        quantity: item.quantity,
        price: item.price,
        discount: item.discount || 0,
        discountType: item.discountType || null,
        discountValue: item.discountValue || null,
        discountReason: item.discountReason || null
      })),
      totalAmount: currentSale.total,
      total: currentSale.total,
      discount: (cartManualDiscount ? cartManualDiscount.discountAmount : (appliedCoupon ? appliedCoupon.discountAmount : 0)),
      discountType: (cartManualDiscount ? cartManualDiscount.discountType : (appliedCoupon ? appliedCoupon.discountType : null)),
      discountValue: (cartManualDiscount ? cartManualDiscount.discountValue : (appliedCoupon ? appliedCoupon.discountValue : null)),
      discountReason: (cartManualDiscount ? cartManualDiscount.discountReason : (appliedCoupon ? `Coupon: ${appliedCoupon.code}` : null)),
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

    try {
      // Call API
      const response = await api.post('/api/sales', saleData);

      // Success — snapshot sale data for receipt screen before resetting
      const changeDue = Math.max(0, parseFloat(currentSale.paymentAmount) - currentSale.total);
      setCompletedSale({
        serverData: response.data,
        items: [...currentSale.items],
        customer: { ...currentSale.customer },
        total: currentSale.total,
        paymentMethod: currentSale.paymentMethod,
        paymentAmount: parseFloat(currentSale.paymentAmount),
        change: changeDue,
        notes: currentSale.notes
      });
      notifySaleComplete(response.data);
      setShowPaymentModal(false);
      fetchCashierStats(); // Refresh stats
      // NOTE: Do NOT reset salesMode or currentSale here — the SaleCompleteModal handles that via handleCompletedSaleNewSale

    } catch (err) {
      console.error('Payment failed:', err);
      const isNetworkIssue = (typeof navigator !== 'undefined' && !navigator.onLine) || !err.response || err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');

      // Offline resilience: queue cash sales locally with idempotency key
      if (currentSale.paymentMethod === 'cash' && isNetworkIssue) {
        queueSale(saleData);
        const changeDue = Math.max(0, parseFloat(currentSale.paymentAmount) - currentSale.total);
        setCompletedSale({
          serverData: {
            id: `offline-${Date.now()}`,
            invoiceNumber: `OFFLINE-${Date.now().toString().slice(-4)}`
          },
          items: [...currentSale.items],
          customer: { ...currentSale.customer },
          total: currentSale.total,
          paymentMethod: 'cash',
          paymentAmount: parseFloat(currentSale.paymentAmount),
          change: changeDue,
          notes: currentSale.notes,
          isOffline: true
        });
        showToast('Offline mode: Cash sale saved locally. Will auto-sync when reconnected.', 'warning');
        setShowPaymentModal(false);
        return;
      }

      setPaymentError(err.response?.data?.message || err.response?.data?.error || 'Payment failed. Please try again.');
      notifyErrorUtil('Payment failed');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handlePaymentSuccess = (completeSale) => {
    // Snapshot sale data for receipt screen
    setCompletedSale({
      serverData: completeSale,
      items: [...currentSale.items],
      customer: { ...currentSale.customer },
      total: currentSale.total,
      paymentMethod: currentSale.paymentMethod,
      paymentAmount: parseFloat(currentSale.paymentAmount || currentSale.total),
      change: parseFloat(completeSale?.change || 0),
      notes: currentSale.notes
    });
    notifySaleComplete(completeSale);
    setShowPaymentModal(false);
    fetchCashierStats();
    // NOTE: Do NOT reset salesMode or currentSale here — SaleCompleteModal handles that
  };

  // Called when cashier clicks "New Sale" on the receipt/confirmation screen
  const handleCompletedSaleNewSale = () => {
    setSalesMode('idle');
    setCartManualDiscount(null);
    setAppliedCoupon(null);
    setCurrentSale({
      customer: { name: '', location: '', phone: '', email: '' },
      customerId: null,
      items: [],
      total: 0,
      paymentMethod: 'cash',
      paymentAmount: '',
      notes: '',
      appliedCoupon: null,
      manualDiscount: null
    });
    setCompletedSale(null);
    clearPersistedCart();
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
    <div className="space-y-6">
      {/* Main Content */}
      <div className="flex flex-col relative z-10 space-y-6">
        {pendingCart && (
          <div className="bg-primary/10 border border-primary/30 rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slideIn">
            <div className="flex items-center space-x-3">
              <ShoppingCartIcon className="h-6 w-6 text-primary shrink-0" />
              <p className="text-small font-medium text-text-primary">
                You have an unsaved cart from your last session ({pendingCart.items?.length || 0} items).
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleRestoreCart}
              >
                Restore Cart
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDismissPendingCart}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {/* Offline Sales Queue Banner (Fix 7) */}
        {pendingCount > 0 && (
          <div className="bg-warning/10 border border-warning/30 rounded-2xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-slideIn">
            <div className="flex items-center space-x-3">
              <SignalIcon className="h-6 w-6 text-warning shrink-0" />
              <div>
                <p className="text-small font-bold text-text-primary">
                  Offline Sales Queue: {pendingCount} sale(s) waiting to sync
                </p>
                <p className="text-caption text-text-secondary">
                  Completed offline with idempotency keys. Will upload automatically when online.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              leftIcon={CloudArrowUpIcon}
              onClick={flushPendingSales}
              loading={isSyncing}
              disabled={typeof navigator !== 'undefined' && !navigator.onLine}
            >
              Sync Now
            </Button>
          </div>
        )}

        {/* Page content wrapper */}
        <div className="flex-1 overflow-hidden">
          {/* Sales Mode Content */}
          {salesMode === 'idle' && (
            <div className="space-y-6">
              {/* Hero Banner Card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/15 via-surface to-primary/5 border border-border-default shadow-floating p-8 sm:p-12 text-center">
                <div className="max-w-2xl mx-auto space-y-4">
                  <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-primary/10 text-primary text-caption font-semibold uppercase tracking-wider">
                    <span>Point of Sale Terminal</span>
                  </div>

                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-text-primary tracking-tight">
                    Ready to <span className="text-primary">Process</span> Sales?
                  </h1>

                  <p className="text-body text-text-secondary max-w-xl mx-auto">
                    Fast, secure, and reliable POS processing. Start a new transaction to begin selling immediately.
                  </p>

                  <div className="pt-2">
                    <Button
                      variant="primary"
                      size="lg"
                      leftIcon={ShoppingBagIcon}
                      onClick={withTrustedClick(startNewSale)}
                      className="px-8 py-3.5 text-body font-bold rounded-2xl shadow-lg hover:scale-105 transition-transform"
                    >
                      Start New Sale
                    </Button>
                  </div>
                </div>
              </div>

              {/* Performance Today Section */}
              <div className="space-y-4">
                <div>
                  <h2 className="text-h2 font-bold text-text-primary">Your Performance Today</h2>
                  <p className="text-caption text-text-secondary">Key metrics and checkout statistics at a glance</p>
                </div>

                {error ? (
                  <div className="bg-danger/10 border border-danger/30 rounded-2xl p-6 text-center">
                    <p className="text-danger font-medium">{error}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={withTrustedClick(fetchCashierStats)}
                      className="mt-3"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : statsLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-28 bg-surface border border-border-default rounded-2xl animate-pulse"></div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <MetricCard
                      icon={CurrencyDollarIcon}
                      label="Today's Revenue"
                      value={formatCurrency(cashierStats.today.totalSales)}
                      subtext={`From ${cashierStats.today.orderCount} sales`}
                      gradient="bg-success text-white"
                      animated
                    />

                    <MetricCard
                      icon={ShoppingCartIcon}
                      label="Total Transactions"
                      value={cashierStats.today.orderCount}
                      subtext="Completed today"
                      gradient="bg-primary text-white"
                      animated
                    />

                    <MetricCard
                      icon={ChartBarIcon}
                      label="This Week's Revenue"
                      value={formatCurrency(cashierStats.week.totalSales)}
                      subtext={`${cashierStats.week.orderCount} transactions`}
                      gradient="bg-secondary text-white"
                      animated
                    />

                    <MetricCard
                      icon={ShoppingBagIcon}
                      label="Items Sold"
                      value={cashierStats.today.itemCount !== undefined ? cashierStats.today.itemCount : (currentSale.items || []).reduce((sum, item) => sum + item.quantity, 0)}
                      subtext="Completed today"
                      gradient="bg-warning text-white"
                      animated
                    />
                  </div>
                )}
              </div>

              {/* Recent Activity Section */}
              {recentSales.length > 0 && (
                <div className="space-y-4 pt-2">
                  <div>
                    <h3 className="text-h3 font-bold text-text-primary">Recent Completed Sales</h3>
                    <p className="text-caption text-text-secondary">Latest transactions recorded at this terminal</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {recentSales.slice(0, 3).map((sale, idx) => (
                      <Card key={idx} variant="default" className="p-5 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-caption font-semibold text-text-muted uppercase">Receipt #</p>
                            <p className="text-body font-bold text-text-primary">{sale?.invoiceNumber || sale?.id || 'N/A'}</p>
                          </div>
                          <Badge variant="success" size="sm">Completed</Badge>
                        </div>
                        <div className="pt-2 border-t border-border-default flex justify-between items-center">
                          <span className="text-small text-text-secondary">Total Amount</span>
                          <span className="text-h3 font-bold text-primary">{formatCurrency(sale?.totalAmount ?? sale?.total ?? 0)}</span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {salesMode === 'product-selection' && (
            <div className="flex flex-col md:flex-row gap-4 sm:gap-6 w-full md:h-[calc(100vh-7rem)] md:max-h-[calc(100vh-7rem)]">
              {/* POS Terminal - Main Area */}
              <div className="flex-1 flex flex-col space-y-4 min-w-0 md:h-full md:overflow-hidden">
                {/* Sale Header */}
                <div className="bg-surface border border-border-default rounded-2xl p-3.5 sm:p-4 shadow-floating">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Left: Customer Info & Scanner Status */}
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      <div className="w-2.5 h-2.5 rounded-full bg-success animate-pulse shrink-0"></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2 flex-wrap">
                          <h2 className="text-body font-bold text-text-primary truncate max-w-[180px] sm:max-w-xs">
                            {currentSale.customer?.name || WALK_IN_CUSTOMER_NAME}
                          </h2>
                          <button
                            type="button"
                            onClick={() => setShowCustomerModal(true)}
                            className="text-[11px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md transition-colors flex items-center space-x-1 shrink-0 whitespace-nowrap"
                            title="Set or change customer info"
                          >
                            <PencilSquareIcon className="h-3 w-3" />
                            <span>{currentSale.customer?.name === WALK_IN_CUSTOMER_NAME ? 'Add Customer' : 'Change'}</span>
                          </button>
                        </div>
                        {currentSale.customer?.location && (
                          <p className="text-caption text-text-secondary truncate flex items-center gap-0.5">
                            <MapPinIcon className="h-3 w-3 inline text-text-muted" />
                            {currentSale.customer.location}
                          </p>
                        )}
                      </div>

                      {/* Scanner Status Indicator */}
                      <div className="flex items-center space-x-1.5 pl-3 border-l border-border-default shrink-0">
                        <span className="text-caption font-semibold text-text-muted hidden sm:inline flex items-center gap-1">
                          <CameraIcon className="h-3.5 w-3.5" /> Scanner
                        </span>
                        <Badge variant={isModalOpen ? 'warning' : 'success'} size="sm">
                          {isModalOpen ? 'Paused' : 'Ready'}
                        </Badge>
                      </div>
                    </div>

                    {/* Right: POS Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowShortcutsModal(true)}
                        className="flex items-center space-x-1 text-text-muted hover:text-text-primary px-2.5"
                        title="Keyboard Shortcuts (Press ?)"
                      >
                        <CommandLineIcon className="h-4 w-4" />
                        <span className="hidden sm:inline text-caption">Shortcuts</span>
                        <kbd className="text-[10px] font-mono px-1 py-0.5 bg-surface-2 rounded border border-border-default">?</kbd>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={PauseIcon}
                        onClick={() => setShowHeldCartsDrawer(true)}
                        className="px-2.5"
                      >
                        <span className="text-caption">Held</span>
                        {heldCarts.length > 0 && (
                          <Badge variant="primary" size="sm">{heldCarts.length}</Badge>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={XMarkIcon}
                        className="text-danger hover:border-danger/40 px-2.5 text-caption"
                        onClick={withTrustedClick(cancelSale)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>

                  {/* Dismissible Keyboard Shortcuts Hint Bar */}
                  {showShortcutHint && (
                    <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-1.5 flex items-center justify-between text-caption text-text-secondary animate-fadeIn">
                      <div className="flex items-center space-x-2.5 overflow-x-auto scrollbar-hide py-0.5">
                        <span className="font-semibold text-primary flex items-center gap-1">
                          <BoltIcon className="h-3.5 w-3.5" /> Shortcuts:
                        </span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">F2</kbd> Pay</span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">F3</kbd> Hold</span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">F4</kbd> Held Carts</span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">F9</kbd> Cancel</span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">Ctrl+/</kbd> Search</span>
                        <span><kbd className="px-1.5 py-0.5 bg-surface rounded border border-border-default text-[10px] font-mono font-bold text-text-primary">?</kbd> Help</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowShortcutHint(false);
                          try { localStorage.setItem('zena_pos_dismiss_shortcut_hint', 'true'); } catch {}
                        }}
                        className="text-text-muted hover:text-text-primary ml-2 p-0.5"
                        title="Dismiss shortcuts hint"
                      >
                        <XMarkIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Search and Filters - Clean Design */}
                  <div className="p-4 sm:p-5 space-y-3 bg-surface-2/30 border-b border-border-default rounded-b-2xl">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="flex-1 relative group min-w-0">
                        <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 transform -translate-y-1/2 h-5 w-5 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="Search products, barcode, or SKU..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-11 pr-4 py-2.5 bg-surface text-text-primary border border-border-default rounded-xl focus:ring-2 focus:ring-primary/30 focus:border-primary text-body transition-all"
                        />
                        {searchType === 'fuzzy' && searchQuery.trim() && (
                          <p className="text-caption text-primary italic mt-1 ml-1">
                            Showing approximate matches for '{searchQuery}'
                          </p>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        leftIcon={QrCodeIcon}
                        className="shrink-0 min-w-[100px]"
                        onClick={withTrustedClick(handleBarcodeScan)}
                      >
                        Scan
                      </Button>
                    </div>
                    {showBarcodeField && (
                      <form onSubmit={handleBarcodeSubmit} className="flex gap-2 items-center mt-2">
                        <input
                          type="text"
                          placeholder="Scan or type barcode..."
                          value={barcodeInput}
                          onChange={(e) => {
                            setBarcodeInput(e.target.value);
                            setBarcodeError('');
                          }}
                          className="flex-1 px-3.5 py-2 bg-surface border border-border-default text-text-primary rounded-xl text-body focus:ring-2 focus:ring-primary/30"
                          autoFocus
                        />
                        <Button type="submit" variant="primary" size="sm">
                          Add
                        </Button>
                        {barcodeError && (
                          <span className="text-caption text-danger font-medium ml-2 flex items-center gap-1">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5" />
                            {barcodeError}
                          </span>
                        )}
                      </form>
                    )}

                    {/* Category Filter Pills */}
                    <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-hide">
                      {categories.map(category => (
                        <button
                          type="button"
                          key={category}
                          onClick={withTrustedClick(() => setSelectedCategory(category))}
                          className={`px-4 py-2 rounded-xl text-small font-semibold transition-all whitespace-nowrap border ${
                            selectedCategory === category
                              ? 'bg-primary text-white border-primary shadow-2xs'
                              : 'bg-surface text-text-secondary border-border-default hover:bg-surface-2'
                          }`}
                        >
                          {category === 'all' ? 'All' : category}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Product Grid */}
                  <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                      {productsLoading ? (
                        Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="h-44 bg-surface border border-border-default rounded-2xl animate-pulse"></div>
                        ))
                      ) : displayedProducts.length === 0 ? (
                        <div className="col-span-full py-16 text-center text-text-muted">
                          <MagnifyingGlassIcon className="h-10 w-10 mx-auto text-text-muted/40 mb-3" />
                          <h3 className="text-body font-bold text-text-primary mb-1">No Products Found</h3>
                          <p className="text-caption text-text-muted">
                            {searchQuery.trim()
                              ? `No matching products for '${searchQuery}'`
                              : "Try adjusting your search or category filter"
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
                                <div key="fuzzy-divider" className="col-span-full border-t border-dashed border-border-default py-2 my-1 flex items-center justify-between">
                                  <span className="text-caption font-semibold text-primary uppercase tracking-wider">Approximate matches</span>
                                  <div className="h-[1px] bg-border-default flex-1 ml-3"></div>
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
                                className="group relative text-left bg-surface border border-border-default rounded-2xl p-4 hover:border-primary/50 hover:shadow-floating transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex flex-col justify-between"
                              >
                                <div className="space-y-2">
                                  <div className="flex items-start justify-between">
                                    <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center text-xl group-hover:scale-110 transition-transform text-text-muted">
                                      <CubeIcon className="h-5 w-5" />
                                    </div>
                                    <Badge variant={product.stockQuantity > 5 ? 'success' : product.stockQuantity > 0 ? 'warning' : 'danger'} size="sm">
                                      {product.stockQuantity > 0 ? `${product.stockQuantity} left` : 'Out of stock'}
                                    </Badge>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-small text-text-primary line-clamp-2 group-hover:text-primary transition-colors">
                                      {product.name}
                                    </h4>
                                    <p className="text-caption text-text-muted mt-0.5 font-mono">{product.sku || 'N/A'}</p>
                                  </div>
                                </div>

                                <div className="mt-3 pt-2 border-t border-border-default/60 flex items-center justify-between">
                                  <span className="text-h3 font-bold text-primary">
                                    {formatCurrency(typeof product.price === 'number' ? product.price : parseFloat(product.price || 0))}
                                  </span>
                                  <span className="text-caption font-semibold text-text-muted group-hover:text-primary transition-colors">+ Add</span>
                                </div>
                              </button>
                            );
                          });
                          return elements;
                        })()
                      )}
                    </div>
                  </div>
                </div>

                {/* Cart Panel Sidebar */}
                <div className={`w-full md:w-80 lg:w-96 bg-surface border border-border-default rounded-2xl flex flex-col md:h-full shadow-floating overflow-hidden shrink-0 ${showCart ? 'flex' : 'hidden md:flex'}`}>
                  {/* Cart Header */}
                  <div className="p-4 border-b border-border-default bg-surface-2/30 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                        <ShoppingCartIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-caption font-semibold text-text-muted uppercase tracking-wider">Shopping Cart</p>
                        <p className="text-h3 font-bold text-text-primary">{currentSale.items.length} items</p>
                      </div>
                    </div>
                    {currentSale.items.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleClearCart(false)}
                        className="p-2 text-text-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
                        title="Clear cart"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    )}
                  </div>

                  {/* Cart Items List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-2">
                    {currentSale.items.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center py-12 text-text-muted">
                        <ShoppingCartIcon className="h-10 w-10 text-text-muted/40 mb-2" />
                        <p className="text-small font-medium text-text-primary">Cart is empty</p>
                        <p className="text-caption text-text-muted mt-1">Select items from the catalog to add</p>
                      </div>
                    ) : (
                      currentSale.items.map((item) => {
                        const isPending = !!pendingRemovals[item.id];
                        const itemSubtotal = (parseFloat(item.price || 0) * item.quantity) - (parseFloat(item.discount || 0));
                        return (
                          <div
                            key={item.id}
                            className={`p-3 rounded-xl border border-border-default bg-surface-2/40 flex items-center justify-between gap-2 ${isPending ? 'opacity-40 line-through' : ''}`}
                          >
                            <div className="flex-1 min-w-0">
                              <h5 className="font-semibold text-small text-text-primary truncate">{item.name}</h5>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <p className="text-caption text-text-muted">{formatCurrency(parseFloat(item.price || 0))} / ea</p>
                                {item.discount > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenItemDiscount(item)}
                                    className="text-[11px] font-semibold text-success bg-success/15 px-1.5 py-0.5 rounded-md hover:bg-success/25 transition-colors flex items-center space-x-1"
                                    title="Edit item discount"
                                  >
                                    <TagIcon className="h-3 w-3 inline" />
                                    <span>-{formatCurrency(item.discount)}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenItemDiscount(item)}
                                    className="text-[11px] text-text-muted hover:text-primary hover:underline transition-colors"
                                    title="Add discount to this line item"
                                  >
                                    + Discount
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity - 1))}
                                className="w-7 h-7 rounded-lg bg-surface border border-border-default text-text-primary font-bold hover:bg-surface-2 flex items-center justify-center"
                                disabled={item.quantity <= 1}
                              >
                                <MinusIcon className="h-3 w-3" />
                              </button>
                              <span className="w-6 text-center text-small font-bold text-text-primary">{item.quantity}</span>
                              <button
                                type="button"
                                onClick={withTrustedClick(() => updateQuantity(item.id, item.quantity + 1))}
                                className="w-7 h-7 rounded-lg bg-surface border border-border-default text-text-primary font-bold hover:bg-surface-2 flex items-center justify-center"
                                disabled={item.quantity >= item.stockQuantity}
                              >
                                <PlusIcon className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={withTrustedClick(() => removeFromCart(item.id))}
                                className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors ml-1"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
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
                          <XMarkIcon className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Total and Checkout */}
                  {currentSale.items.length > 0 && (
                    <div className="p-4 border-t border-border-default bg-surface-2/30 space-y-3">
                      {/* Manual Cart Discount & Coupon Section */}
                      <div className="space-y-2">
                        {/* Active Cart Manual Discount Banner */}
                        {cartManualDiscount ? (
                          <div className="flex items-center justify-between p-2.5 bg-primary/10 border border-primary/30 rounded-xl text-caption">
                            <div className="flex items-center space-x-2 truncate">
                              <TagIcon className="h-4 w-4 text-primary shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold text-primary truncate">
                                  Cart Discount ({cartManualDiscount.discountType === 'percentage' ? `${cartManualDiscount.discountValue}%` : formatCurrency(cartManualDiscount.discountValue)})
                                </p>
                                <p className="text-text-muted text-[10px] truncate">
                                  {cartManualDiscount.discountReason || 'Manual Discount'} • Saved {formatCurrency(cartManualDiscount.discountAmount)}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveCartDiscount}
                              className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                              title="Remove cart discount"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : appliedCoupon ? (
                          <div className="flex items-center justify-between p-2.5 bg-success/10 border border-success/30 rounded-xl text-caption">
                            <div className="flex items-center space-x-2 truncate">
                              <TicketIcon className="h-4 w-4 text-success shrink-0" />
                              <div className="min-w-0">
                                <p className="font-bold text-success truncate">{appliedCoupon.code}</p>
                                <p className="text-text-muted text-[10px]">Saved {formatCurrency(appliedCoupon.discountAmount)}</p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleRemoveCoupon}
                              className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors shrink-0"
                              title="Remove coupon"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            <form onSubmit={handleApplyCoupon} className="flex gap-1.5 items-center">
                              <input
                                type="text"
                                placeholder="Voucher / Promo Code"
                                value={couponCode}
                                onChange={(e) => {
                                  setCouponCode(e.target.value);
                                  setCouponError('');
                                }}
                                className="flex-1 px-3 py-1.5 bg-surface border border-border-default text-text-primary rounded-xl text-caption uppercase focus:ring-2 focus:ring-primary/30"
                              />
                              <Button type="submit" variant="outline" size="sm" loading={validatingCoupon} disabled={!couponCode.trim()}>
                                Apply
                              </Button>
                            </form>
                            <button
                              type="button"
                              onClick={handleOpenCartDiscount}
                              className="w-full text-center text-[11px] text-primary font-semibold hover:underline flex items-center justify-center space-x-1 py-1"
                            >
                              <TagIcon className="h-3.5 w-3.5" />
                              <span>Apply Manual Discount to Cart</span>
                            </button>
                          </div>
                        )}
                        {couponError && (
                          <p className="text-[11px] text-danger font-medium mt-0.5 flex items-center gap-1">
                            <ExclamationTriangleIcon className="h-3.5 w-3.5 inline" />
                            {couponError}
                          </p>
                        )}
                      </div>

                      {/* Summary Breakdown */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-caption">
                          <span className="text-text-secondary">Gross Subtotal</span>
                          <span className="text-text-primary font-semibold">
                            {formatCurrency(currentSale.items.filter(item => !pendingRemovals[item.id]).reduce((sum, item) => sum + (parseFloat(item.price || 0) * item.quantity), 0))}
                          </span>
                        </div>

                        {/* Item Discounts Subtotal if any */}
                        {currentSale.items.some(item => item.discount > 0) && (
                          <div className="flex justify-between items-center text-caption text-success font-semibold">
                            <span>Item Discounts</span>
                            <span>
                              -{formatCurrency(currentSale.items.filter(item => !pendingRemovals[item.id]).reduce((sum, item) => sum + (parseFloat(item.discount || 0)), 0))}
                            </span>
                          </div>
                        )}

                        {/* Cart Manual Discount */}
                        {cartManualDiscount && (
                          <div className="flex justify-between items-center text-caption text-success font-semibold">
                            <span>Cart Discount</span>
                            <span>-{formatCurrency(cartManualDiscount.discountAmount)}</span>
                          </div>
                        )}

                        {/* Coupon Discount */}
                        {appliedCoupon && (
                          <div className="flex justify-between items-center text-caption text-success font-semibold">
                            <span>Coupon ({appliedCoupon.code})</span>
                            <span>-{formatCurrency(appliedCoupon.discountAmount)}</span>
                          </div>
                        )}

                        <div className="h-px bg-border-default"></div>
                        <div className="flex justify-between items-center pt-1">
                          <span className="text-body font-bold text-text-primary">Total</span>
                          <span className="text-h2 font-bold text-primary">
                            {formatCurrency(currentSale.total)}
                          </span>
                        </div>
                      </div>

                      {/* Hold / Clear Cart Actions */}
                      {showHoldPrompt ? (
                        <form onSubmit={handleHoldCartSubmit} className="bg-surface p-3 border border-border-default rounded-xl space-y-2">
                          <label className="block text-caption font-semibold text-text-secondary">Hold Cart Label</label>
                          <input
                            type="text"
                            placeholder={`Customer ${heldCarts.length + 1}`}
                            value={holdLabel}
                            onChange={(e) => setHoldLabel(e.target.value)}
                            className="w-full px-3 py-1.5 bg-surface border border-border-default text-text-primary rounded-lg text-small focus:ring-2 focus:ring-primary/30"
                            maxLength={80}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button type="submit" variant="primary" size="sm" className="flex-1">
                              Confirm Hold
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                setShowHoldPrompt(false);
                                setHoldLabel('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            leftIcon={PauseIcon}
                            className="flex-1"
                            onClick={() => {
                              setHoldLabel(`Customer ${heldCarts.length + 1}`);
                              setShowHoldPrompt(true);
                            }}
                          >
                            Hold
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            leftIcon={TrashIcon}
                            className="flex-1 text-danger hover:border-danger/40"
                            onClick={() => handleClearCart(true)}
                          >
                            Clear
                          </Button>
                        </div>
                      )}

                      {/* Checkout Button */}
                      <Button
                        type="button"
                        variant="primary"
                        size="lg"
                        fullWidth
                        rightIcon={ArrowTrendingUpIcon}
                        onClick={withTrustedClick(handleProceedToPayment)}
                        className="py-3 font-bold rounded-xl shadow-md"
                      >
                        Proceed to Payment
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )
          }
        </div>
      </div>

      {/* Mobile Cart Toggle Button */}
      {
        salesMode === 'product-selection' && (
          <div className="md:hidden fixed bottom-6 right-6 z-40">
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
        onClose={() => setShowCustomerModal(false)}
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

      {/* Sale Complete / Receipt Confirmation Modal */}
      <SaleCompleteModal
        completedSale={completedSale}
        onNewSale={handleCompletedSaleNewSale}
        onClose={handleCompletedSaleNewSale}
      />

      {/* Keyboard Shortcuts Help Popover */}
      <KeyboardShortcutsPopover
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Manual / Ad-hoc Discount Modal (Fix 8) */}
      <DiscountModal
        isOpen={discountModalState.isOpen}
        onClose={() => setDiscountModalState(prev => ({ ...prev, isOpen: false }))}
        target={discountModalState.target}
        item={discountModalState.item}
        baseAmount={discountModalState.baseAmount}
        existingDiscount={discountModalState.existingDiscount}
        userRole={user?.role || 'cashier'}
        onApplyDiscount={handleApplyDiscount}
        onRemoveDiscount={() => {
          if (discountModalState.target === 'item') {
            handleRemoveItemDiscount(discountModalState.item?.id);
          } else {
            handleRemoveCartDiscount();
          }
        }}
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
                  <PauseIcon className="h-5 w-5 text-primary" /> Held Carts
                </h3>
                <p className="text-xs text-gray-400 mt-1">Select a held transaction to recall it</p>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldCartsDrawer(false)}
                className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white border border-gray-800 hover:border-gray-600 rounded-xl transition-all"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            
            {/* List */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {heldCarts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <InboxIcon className="h-12 w-12 text-gray-500 mb-2" />
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

      {/* Floating Action Buttons Removed to prevent blocking catalog cards and cart view */}

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
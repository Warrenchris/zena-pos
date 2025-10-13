import React, { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { fetchProducts } from '../store/slices/productsSlice';
import { getCurrentUser } from '../store/slices/authSlice';
import StatsCard from '../components/StatsCard';
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
import { useApiWithToast } from '../hooks/useApiWithToast';

export default function CashierDashboard() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);
  const { products, loading: productsLoading } = useSelector((state) => state.products);
  const [view, setView] = useState('grid');
  const { showToast } = useToast();
  const { loading, executeApiCall } = useApiWithToast();
  
  // Effect to validate authentication
  useEffect(() => {
    if (!token) {
      navigate('/login');
    } else {
      handleInitialLoad();
    }
  }, [token]);

  const handleInitialLoad = async () => {
    const result = await executeApiCall(
      async () => {
        const userResult = await dispatch(getCurrentUser()).unwrap();
        const productsResult = await dispatch(fetchProducts()).unwrap();
        return { user: userResult, products: productsResult };
      },
      null // No success message needed for initial load
    );

    if (!result.success) {
      navigate('/login');
    }
  };

  const handlePayment = async (paymentDetails) => {
    const result = await executeApiCall(
      async () => {
        return await cashierAPI.createSale(paymentDetails);
      },
      'Sale completed successfully!'
    );

    if (result.success) {
      setCart([]);
      setCustomerModalOpen(false);
      setPaymentModalOpen(false);
      navigate('/sales');
    }
  };

  const handleProductAction = async (product, action) => {
    switch (action) {
      case 'add':
        try {
          if (product.quantity <= 0) {
            showToast({
              type: 'warning',
              title: 'Out of Stock',
              message: 'This product is currently unavailable'
            });
            return;
          }
          addToCart(product);
          showToast({
            type: 'success',
            title: 'Added to Cart',
            message: `${product.name} added to cart`
          });
        } catch (error) {
          showToast({
            type: 'error',
            title: 'Error',
            message: 'Could not add product to cart'
          });
        }
        break;
        
      // ... rest of the component
    }
  };

  return (
    // ... component JSX
  );
}
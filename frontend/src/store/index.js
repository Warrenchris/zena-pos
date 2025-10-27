import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import productsReducer from './slices/productsSlice'
import customersReducer from './slices/customersSlice'
import salesReducer from './slices/salesSlice'
import categoriesReducer from './slices/categoriesSlice'
import settingsReducer from './slices/settingsSlice'
import analyticsReducer from './slices/analyticsSlice'
import shopReducer from './slices/shopSlice'
import brandsReducer from './slices/brandsSlice'
import unitsReducer from './slices/unitsSlice'
import notificationsReducer from './slices/notificationsSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productsReducer,
    customers: customersReducer,
    sales: salesReducer,
    categories: categoriesReducer,
    settings: settingsReducer,
    analytics: analyticsReducer,
    shop: shopReducer,
    brands: brandsReducer,
    units: unitsReducer,
    notifications: notificationsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      immutableCheck: { 
        // Ignore these field paths in all actions
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all state
        ignoredPaths: ['_persist'],
        // Warn after 50ms instead of 32ms
        warnAfter: 50,
      },
      serializableCheck: {
        // Ignore these field paths in all actions
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
        // Ignore these field paths in all state
        ignoredPaths: ['_persist'],
      },
    }),
})

export default store
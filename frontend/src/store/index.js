import { configureStore } from '@reduxjs/toolkit'
import authReducer from './slices/authSlice'
import productsReducer from './slices/productsSlice'
import customersReducer from './slices/customersSlice'
import salesReducer from './slices/salesSlice'
import categoriesReducer from './slices/categoriesSlice'
import settingsReducer from './slices/settingsSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    products: productsReducer,
    customers: customersReducer,
    sales: salesReducer,
    categories: categoriesReducer,
    settings: settingsReducer,
  },
})

export default store
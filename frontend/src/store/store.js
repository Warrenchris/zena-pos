import { configureStore } from '@reduxjs/toolkit';
import { combineReducers } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import shopReducer from './slices/shopSlice';

const rootReducer = combineReducers({
  auth: authReducer,
  shop: shopReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
  // Safely determine production mode without assuming `process` exists in the runtime.
  devTools: !(typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'production'),
});

export default store;
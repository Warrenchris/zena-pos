import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authAPI } from '../../services/api'
import { cacheProfile, clearCachedProfile, readCachedProfile } from '../../offline/authCache'
import Sentry from '../../instrument'

function syncSentryUser(user, shop) {
  try {
    if (user?.id) {
      Sentry.setUser({ id: String(user.id) });
      if (shop?.id || user.shopId) {
        Sentry.setTag('shopId', String(shop?.id || user.shopId));
      }
      if (user.organizationId) {
        Sentry.setTag('organizationId', String(user.organizationId));
      }
      if (user.role) {
        Sentry.setTag('role', String(user.role));
      }
    } else {
      Sentry.setUser(null);
    }
  } catch (err) {
    // Non-blocking: Sentry sync must never disrupt auth state
  }
}

// Shown when the server can't be reached. Deliberately different from the "session expired" message,
// so a dropped connection never signs anyone out.
export const CONNECTIVITY_ERROR = 'Cannot reach the server. Check your internet connection and try again.'

const initialState = {
  user: null,
  shop: null,
  token: localStorage.getItem('token'),
  loading: false,
  error: null,
}

export const login = createAsyncThunk(
  'auth/login',
  async (credentials, { rejectWithValue, dispatch }) => {
    try {
      const response = await authAPI.login(credentials)
      const { token, user, shop } = response.data
      
      // Store token
      localStorage.setItem('token', token)
      
      // Get full profile after login
      try {
        const profileResponse = await authAPI.getProfile()
        const result = {
          token,
          user: profileResponse.data.user,
          shop: profileResponse.data.shop || profileResponse.data.user?.shop || null
        }
        cacheProfile(token, { user: result.user, shop: result.shop })
        return result
      } catch (profileError) {
        // If profile fetch fails, return basic user info with shop
        const result = {
          token,
          user,
          shop: shop || user?.shop || null
        }
        cacheProfile(token, { user: result.user, shop: result.shop })
        return result
      }
    } catch (error) {
      if (error?.isAxiosError && !error.response) {
        return rejectWithValue(CONNECTIVITY_ERROR);
      }
      const data = error?.response?.data;
      let errorMsg = 'Invalid email or password';
      if (Array.isArray(data?.errors) && data.errors.length > 0) {
        errorMsg = data.errors.map((e) => e.msg).filter(Boolean).join(', ') || errorMsg;
      } else if (data?.error) {
        errorMsg = data.error;
      }
      return rejectWithValue(errorMsg);
    }
  }
)

export const getCurrentUser = createAsyncThunk(
  'auth/getCurrentUser',
  async (_, { rejectWithValue, getState }) => {
    const { token } = getState().auth;
    if (!token) {
      return rejectWithValue('No authentication token found');
    }
    
    try {
      const response = await authAPI.getProfile()
      cacheProfile(token, response.data)
      return response.data
    } catch (error) {
      // No answer from the server (offline, timeout) or the server is down: that is not an expired
      // session. Stay signed in, using the profile remembered on this device if there is one.
      if (error?.isAxiosError && (!error.response || error.response.status >= 500)) {
        const cached = readCachedProfile(token)
        return cached ? cached : rejectWithValue(CONNECTIVITY_ERROR)
      }
      if (error.response?.status === 401) {
        localStorage.removeItem('token');
      }
      return rejectWithValue(
        error?.response?.data?.error || 'Your session has expired. Please sign in again.'
      )
    }
  }
)

export const switchActiveShop = createAsyncThunk(
  'auth/switchActiveShop',
  async (shopId, { rejectWithValue, dispatch }) => {
    try {
      const response = await authAPI.switchShop(shopId);
      const { token, user, shop } = response.data;
      
      const combinedUser = user ? { ...user, shop: shop || user.shop } : null;
      dispatch(setCredentials({ user: combinedUser, token }));

      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }

      return response.data;
    } catch (error) {
      return rejectWithValue(
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        error?.message ||
        'Failed to switch active shop'
      );
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null
      state.shop = null
      state.token = null
      state.error = null
      localStorage.removeItem('token')
      clearCachedProfile()
      syncSentryUser(null)
    },
    clearError: (state) => {
      state.error = null
    },
    setCredentials: (state, action) => {
      state.user = action.payload.user || null
      state.shop = action.payload.user?.shop || null
      state.token = action.payload.token || null
      if (action.payload.token) {
        localStorage.setItem('token', action.payload.token)
      }
      syncSentryUser(action.payload.user, action.payload.user?.shop)
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.shop = action.payload.shop || action.payload.user?.shop || null
        state.token = action.payload.token
        syncSentryUser(action.payload.user, action.payload.shop || action.payload.user?.shop)
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload || action.error.message || 'Failed to login'
      })
      .addCase(getCurrentUser.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(getCurrentUser.fulfilled, (state, action) => {
        state.loading = false
        state.user = action.payload.user
        state.shop = action.payload?.shop || action.payload.user?.shop || null
        state.error = null
        syncSentryUser(action.payload.user, action.payload?.shop || action.payload.user?.shop)
      })
      .addCase(getCurrentUser.rejected, (state, action) => {
        state.loading = false
        state.user = null
        state.shop = null
        // Only clear token if it's an authentication error
        if (action.payload === 'Your session has expired. Please sign in again.' || 
            action.payload === 'No authentication token found') {
          state.token = null
          localStorage.removeItem('token')
          clearCachedProfile()
        }
        state.error = action.payload || null
      })
      .addCase(switchActiveShop.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(switchActiveShop.fulfilled, (state, action) => {
        state.loading = false
        state.token = action.payload.token
        state.shop = action.payload.shop
        if (action.payload.user) {
          state.user = { ...action.payload.user, shop: action.payload.shop }
        }
      })
      .addCase(switchActiveShop.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload
      })
  },
})

export const { logout, clearError, setCredentials } = authSlice.actions
export default authSlice.reducer
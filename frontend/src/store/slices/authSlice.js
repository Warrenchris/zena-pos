import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { authAPI } from '../../services/api'

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
      const { token, user } = response.data
      
      // Store token
      localStorage.setItem('token', token)
      
      // Get full profile after login
      try {
        const profileResponse = await authAPI.getProfile()
        return {
          token,
          user: profileResponse.data.user,
          shop: profileResponse.data.shop
        }
      } catch (profileError) {
        // If profile fetch fails, return basic user info
        return { token, user }
      }
    } catch (error) {
      return rejectWithValue(
        error?.response?.data?.error ||
        'Invalid email or password'
      )
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
      return response.data
    } catch (error) {
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
        state.shop = action.payload.user?.shop || null
        state.token = action.payload.token
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
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  theme: {
    mode: 'light',
    primaryColor: '#3B82F6',
    sidebarStyle: 'expanded',
  },
  regional: {
    currency: 'USD',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
  },
  loading: false,
  error: null,
};

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme: (state, action) => {
      state.theme = { ...state.theme, ...action.payload };
    },
    setRegional: (state, action) => {
      state.regional = { ...state.regional, ...action.payload };
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

// Action creators
export const { setTheme, setRegional, setLoading, setError } = settingsSlice.actions;

// Thunks
export const fetchSettings = () => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    const response = await settingsAPI.getAll();
    if (response.data.theme) {
      dispatch(setTheme(response.data.theme));
    }
    if (response.data.regional) {
      dispatch(setRegional(response.data.regional));
    }
  } catch (error) {
    dispatch(setError(error.message));
  } finally {
    dispatch(setLoading(false));
  }
};

export const updateThemeSettings = (themeData) => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    await settingsAPI.updateTheme(themeData);
    dispatch(setTheme(themeData));
  } catch (error) {
    dispatch(setError(error.message));
    throw error;
  } finally {
    dispatch(setLoading(false));
  }
};

export const updateRegionalSettings = (regionalData) => async (dispatch) => {
  try {
    dispatch(setLoading(true));
    await settingsAPI.updateRegional(regionalData);
    dispatch(setRegional(regionalData));
  } catch (error) {
    dispatch(setError(error.message));
    throw error;
  } finally {
    dispatch(setLoading(false));
  }
};

// Selectors
export const selectTheme = (state) => state.settings.theme;
export const selectRegional = (state) => state.settings.regional;
export const selectLoading = (state) => state.settings.loading;
export const selectError = (state) => state.settings.error;

export default settingsSlice.reducer;
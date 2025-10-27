import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

const initialState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null
};

export const addNotification = createAsyncThunk(
  'notifications/addNotification',
  async (notification, { dispatch }) => {
    const timestamp = new Date().toISOString();
    const newNotification = {
      ...notification,
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      read: false
    };
    return newNotification;
  }
);

export const markAsRead = createAsyncThunk(
  'notifications/markAsRead',
  async (notificationId, { getState }) => {
    return notificationId;
  }
);

export const markAllAsRead = createAsyncThunk(
  'notifications/markAllAsRead',
  async () => {
    return true;
  }
);

export const removeNotification = createAsyncThunk(
  'notifications/removeNotification',
  async (notificationId) => {
    return notificationId;
  }
);

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(addNotification.fulfilled, (state, action) => {
        state.notifications = [action.payload, ...state.notifications];
        state.unreadCount = state.notifications.filter(n => !n.read).length;
        
        // Keep only last 50 notifications
        if (state.notifications.length > 50) {
          state.notifications = state.notifications.slice(0, 50);
        }
      })
      .addCase(markAsRead.fulfilled, (state, action) => {
        const id = action.payload;
        state.notifications = state.notifications.map(n => 
          n.id === id ? { ...n, read: true } : n
        );
        state.unreadCount = state.notifications.filter(n => !n.read).length;
      })
      .addCase(markAllAsRead.fulfilled, (state) => {
        state.notifications = state.notifications.map(n => ({ ...n, read: true }));
        state.unreadCount = 0;
      })
      .addCase(removeNotification.fulfilled, (state, action) => {
        state.notifications = state.notifications.filter(n => n.id !== action.payload);
        state.unreadCount = state.notifications.filter(n => !n.read).length;
      });
  }
});

export const { clearNotifications } = notificationsSlice.actions;
export default notificationsSlice.reducer;


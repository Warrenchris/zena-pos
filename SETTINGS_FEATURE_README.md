# Settings Feature Documentation

## Overview

The Settings feature provides a comprehensive system configuration interface for the Zana POS system. It allows administrators to manage system-wide settings including general configuration, currency settings, notifications, security, data backup, and user management.

## Features

### 🧩 Core Functionalities

- **Role-Based Access Control**: Settings are only accessible to admin users
- **Organized Dashboard**: Clean tabbed interface with 6 main categories
- **Real-time Updates**: Changes apply immediately across the system
- **Validation**: Comprehensive input validation with error feedback
- **Reset Functionality**: Restore to default settings with confirmation

### 📋 Settings Categories

#### 1. General Settings
- System name configuration
- Business logo upload
- Contact details (email, phone)
- Timezone selection
- Language preferences
- Theme selection (light/dark/system)

#### 2. Currency Settings
- Default currency selection (KES, USD, NGN, ZAR, etc.)
- Currency symbol customization
- Currency position (before/after amount)
- Decimal places configuration
- Live preview of currency formatting

#### 3. Notification Settings
- Enable/disable system notifications
- Sound alerts toggle
- Email notifications toggle
- Success/error toast controls

#### 4. Security Settings
- Password minimum length
- Special character requirements
- Session timeout configuration
- Two-factor authentication toggle
- Maximum login attempts

#### 5. Data & Backup Settings
- Automatic backup configuration
- Backup frequency (daily/weekly/monthly)
- Backup retention period
- Data export/import capabilities

#### 6. User Management Settings
- User registration controls
- Email verification requirements
- Role-based access management

## Technical Implementation

### Backend Architecture

#### Database Model
```javascript
// SystemSettings model with comprehensive fields
const SystemSettings = {
  // General Settings
  systemName: String,
  businessLogo: Text,
  contactEmail: String,
  contactPhone: String,
  timezone: String,
  language: String,
  theme: ENUM('light', 'dark', 'system'),
  
  // Currency Settings
  defaultCurrency: String,
  currencySymbol: String,
  currencyPosition: ENUM('before', 'after'),
  decimalPlaces: Integer,
  
  // Notification Settings
  enableNotifications: Boolean,
  enableSoundAlerts: Boolean,
  enableEmailAlerts: Boolean,
  enableSuccessToasts: Boolean,
  enableErrorToasts: Boolean,
  
  // Security Settings
  passwordMinLength: Integer,
  requireSpecialChars: Boolean,
  sessionTimeout: Integer,
  enableTwoFactor: Boolean,
  maxLoginAttempts: Integer,
  
  // Data & Backup Settings
  autoBackupEnabled: Boolean,
  backupFrequency: ENUM('daily', 'weekly', 'monthly'),
  backupRetentionDays: Integer,
  
  // User Management Settings
  allowUserRegistration: Boolean,
  requireEmailVerification: Boolean,
  
  // Additional Settings
  additionalSettings: JSON
}
```

#### API Endpoints
- `GET /api/settings` - Retrieve all settings
- `PUT /api/settings` - Update settings
- `POST /api/settings/reset` - Reset to defaults
- `GET /api/settings/currency` - Get currency settings
- `GET /api/settings/theme` - Get theme settings
- `GET /api/settings/notifications` - Get notification settings

#### Security
- Admin-only access with role-based permissions
- Input validation and sanitization
- Activity logging for all changes
- Secure API endpoints with authentication

### Frontend Architecture

#### State Management
- Redux store with `settingsSlice`
- Async thunks for API operations
- Comprehensive selectors for different setting groups
- Real-time state updates

#### Components
- `Settings.jsx` - Main settings dashboard
- `CurrencyDisplay.jsx` - Currency formatting components
- `CurrencyInput.jsx` - Currency input fields
- `CurrencyBadge.jsx` - Currency display badges
- `ErrorBoundary.jsx` - Error handling wrapper

#### Hooks
- `useCurrency()` - Currency formatting and utilities
- `useErrorHandler()` - Comprehensive error handling
- `useCurrencyContext()` - Currency context access

#### Utilities
- `currencyUtils.js` - Currency formatting utilities
- `validation.js` - Input validation functions
- `formatters.js` - Enhanced formatters with settings support

## Usage

### Accessing Settings
1. Navigate to `/admin/settings` (admin users only)
2. Select the desired settings category from the sidebar
3. Modify settings as needed
4. Click "Save Changes" to apply updates
5. Use "Reset to Defaults" to restore original settings

### Currency System Integration
The currency system automatically updates across all pages when settings change:

```javascript
// Using the currency hook
import { useCurrency } from '../hooks/useCurrency';

const MyComponent = () => {
  const { format, getSymbol, getCode } = useCurrency();
  
  return (
    <div>
      <span>{format(1234.56)}</span> {/* Automatically formatted */}
      <span>Currency: {getCode()}</span>
    </div>
  );
};
```

### Validation
All settings include comprehensive validation:

```javascript
// Example validation
const validation = validateSettings({
  systemName: 'My POS System',
  contactEmail: 'admin@example.com',
  defaultCurrency: 'KES',
  currencySymbol: 'KSh'
});

if (!validation.isValid) {
  console.log(validation.errors);
}
```

## Configuration

### Environment Variables
```bash
# Backend
JWT_SECRET=your-secret-key
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zana_pos

# Frontend
VITE_API_URL=http://localhost:3000
```

### Database Migration
Run the migration to create the SystemSettings table:

```bash
cd backend
npm run db:migrate
```

### Permissions
Ensure the `manage_settings` permission is assigned to admin roles:

```javascript
const ROLE_PERMISSIONS = {
  admin: ['all'],
  manager: [
    // ... other permissions
    'manage_settings'
  ]
};
```

## Error Handling

### Backend Error Handling
- Comprehensive validation with detailed error messages
- Graceful error responses with appropriate HTTP status codes
- Activity logging for debugging and audit trails

### Frontend Error Handling
- Real-time validation feedback
- User-friendly error messages
- Loading states and success confirmations
- Error boundaries for component-level error handling

## Testing

### Integration Test
Run the comprehensive integration test:

```bash
node test-settings-integration.js
```

### Manual Testing Checklist
- [ ] Admin can access settings page
- [ ] Non-admin users are denied access
- [ ] All setting categories load correctly
- [ ] Form validation works properly
- [ ] Settings save successfully
- [ ] Currency changes apply across the app
- [ ] Reset functionality works
- [ ] Error handling displays properly

## Security Considerations

1. **Authentication**: All settings endpoints require valid JWT tokens
2. **Authorization**: Only admin users can access settings
3. **Validation**: All inputs are validated and sanitized
4. **Audit Trail**: All changes are logged with user information
5. **Data Protection**: Sensitive settings are properly secured

## Performance

- **Lazy Loading**: Settings are loaded only when needed
- **Caching**: Currency settings are cached for performance
- **Optimistic Updates**: UI updates immediately for better UX
- **Debounced Validation**: Validation doesn't block user input

## Future Enhancements

1. **Settings Import/Export**: Bulk settings management
2. **Settings Templates**: Pre-configured setting profiles
3. **Advanced Security**: Additional 2FA options
4. **Audit Dashboard**: Settings change history
5. **Multi-language Support**: Localized settings interface

## Troubleshooting

### Common Issues

1. **Settings not saving**
   - Check user permissions
   - Verify API endpoint accessibility
   - Check browser console for errors

2. **Currency not updating**
   - Ensure CurrencyProvider is wrapping the app
   - Check Redux store state
   - Verify settings API response

3. **Validation errors**
   - Check input format requirements
   - Verify field constraints
   - Review validation error messages

### Debug Mode
Enable debug logging:

```javascript
// In development
localStorage.setItem('debug', 'settings:*');
```

## Support

For technical support or feature requests, please contact the development team or create an issue in the project repository.

---

**Version**: 1.0.0  
**Last Updated**: January 2025  
**Compatibility**: Zana POS v1.0+

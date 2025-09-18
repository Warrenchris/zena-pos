# Multi-Tenant Architecture Setup

This document explains the multi-tenant architecture implementation that ensures each shop/company has isolated data and does not interfere with other companies.

## Overview

The system has been updated to implement a **multi-tenant architecture** where:
- Each shop/company has its own isolated data
- Users can only access data belonging to their shop
- All database queries are automatically filtered by shop ID
- New data is automatically associated with the user's shop

## Architecture Changes

### 1. Database Models Updated

All major models now include a `shopId` foreign key:

- **Products** → `shopId` references `Shops(id)`
- **Categories** → `shopId` references `Shops(id)`
- **Customers** → `shopId` references `Shops(id)`
- **Sales** → `shopId` references `Shops(id)`
- **Expenses** → `shopId` references `Shops(id)`
- **ActivityLogs** → `shopId` references `Shops(id)`
- **Users** → Already had `shopId` (existing)
- **Employees** → Already had `shopId` (existing)

### 2. API Middleware Enhanced

- **Authentication middleware** now validates `shopId` in JWT tokens
- **Request context** automatically includes `req.shopId` for all authenticated requests
- **Data isolation** is enforced at the API level

### 3. Controllers Updated

All controllers now:
- Filter queries by `shopId` automatically
- Include `shopId` when creating new records
- Validate shop ownership for updates/deletes
- Prevent cross-shop data access

### 4. Frontend Integration

- **Authentication** now includes shop information
- **Redux store** tracks current shop context
- **API calls** automatically include shop context via JWT token

## Setup Instructions

### For New Installations

1. Run the database initialization:
   ```bash
   cd backend
   npm run db:migrate
   ```

2. The system will automatically create a default shop and associate all data with it.

### For Existing Installations

1. **Backup your database** before running migrations:
   ```bash
   # Example for PostgreSQL
   pg_dump your_database > backup_before_multi_tenant.sql
   ```

2. Run the multi-tenant setup script:
   ```bash
   cd backend
   psql -d your_database -f database/migrations/setup_multi_tenant.sql
   ```

3. Restart your backend server:
   ```bash
   npm restart
   ```

## How It Works

### Data Isolation

1. **User Login**: When a user logs in, their JWT token includes their `shopId`
2. **API Requests**: Every API request automatically includes the user's shop context
3. **Database Queries**: All queries are filtered by `shopId` to ensure data isolation
4. **Data Creation**: New records automatically include the user's `shopId`

### Example Flow

```javascript
// 1. User logs in
POST /api/auth/login
{
  "email": "user@shop1.com",
  "password": "password"
}

// Response includes shop context
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@shop1.com",
    "role": "admin",
    "shop": {
      "id": 1,
      "name": "Shop 1"
    }
  },
  "token": "jwt_token_with_shopId"
}

// 2. API requests automatically include shop context
GET /api/products
// Only returns products from shop 1

// 3. Creating new data
POST /api/products
{
  "name": "New Product",
  "price": 10.99
}
// Automatically includes shopId: 1
```

## Security Features

### 1. Automatic Data Filtering
- All database queries include shop filtering
- Users cannot access data from other shops
- Cross-shop data access is prevented at the API level

### 2. JWT Token Validation
- Tokens must include valid `shopId`
- Token validation ensures shop context is present
- Expired or invalid tokens are rejected

### 3. Request Validation
- Every authenticated request validates shop ownership
- Unauthorized access attempts are blocked
- Audit logs track all data access by shop

## Creating Multiple Shops

### For Administrators

1. **Create a new shop**:
   ```sql
   INSERT INTO Shops (name, address, phone, active)
   VALUES ('New Shop', '123 Main St', '555-0123', true);
   ```

2. **Create users for the new shop**:
   ```javascript
   POST /api/auth/register
   {
     "name": "Shop Manager",
     "email": "manager@newshop.com",
     "password": "password",
     "role": "admin",
     "shop": {
       "name": "New Shop"
     }
   }
   ```

### For Existing Users

Users can only access data from their assigned shop. To move a user to a different shop, update their `shopId` in the database.

## Monitoring and Maintenance

### Database Queries

Monitor shop-specific queries:
```sql
-- Check data distribution by shop
SELECT 
  s.name as shop_name,
  COUNT(p.id) as products,
  COUNT(c.id) as customers,
  COUNT(sa.id) as sales
FROM Shops s
LEFT JOIN Products p ON s.id = p.shopId
LEFT JOIN Customers c ON s.id = c.shopId
LEFT JOIN Sales sa ON s.id = sa.shopId
GROUP BY s.id, s.name;
```

### Performance Optimization

- Indexes are created on `shopId` columns for fast filtering
- Consider partitioning large tables by `shopId` for very large deployments
- Monitor query performance and optimize as needed

## Troubleshooting

### Common Issues

1. **"Shop context required" error**:
   - Ensure user has valid shop assignment
   - Check JWT token includes `shopId`

2. **Data not appearing**:
   - Verify `shopId` is correctly set on records
   - Check user's shop assignment

3. **Permission denied**:
   - Verify user has proper role for the shop
   - Check shop is active

### Debug Mode

Enable debug logging to see shop context in API requests:
```javascript
// In your API middleware
console.log('Shop Context:', req.shopId, 'User:', req.user.id);
```

## Benefits

1. **Complete Data Isolation**: Each shop's data is completely separate
2. **Scalability**: Easy to add new shops without affecting existing ones
3. **Security**: Prevents accidental or malicious cross-shop data access
4. **Compliance**: Helps meet data privacy and isolation requirements
5. **Multi-brand Support**: Single system can serve multiple businesses

## Future Enhancements

- Shop-specific branding and themes
- Cross-shop reporting for administrators
- Shop-specific feature toggles
- Advanced user management across shops
- Data export/import by shop

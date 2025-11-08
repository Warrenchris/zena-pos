# API Documentation

## Base URL

- **Development**: `http://localhost:3000/api`
- **Production**: `https://api.yourdomain.com/api`

## Authentication

All protected endpoints require JWT authentication using RS256 algorithm.

### Authentication Header

```
Authorization: Bearer <jwt_token>
```

### Getting a Token

1. Register a new user or login with existing credentials
2. Token is returned in the response
3. Include token in all subsequent requests

See [Inter-Service Authentication Flow](./INTER_SERVICE_AUTHENTICATION.md) for detailed authentication flow.

---

## API Endpoints

### Authentication

#### Register User
```http
POST /api/auth/register
```

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "admin",
  "shop": {
    "name": "My Shop",
    "address": "123 Main St",
    "phone": "+1234567890"
  }
}
```

**Response:** `201 Created`
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "shopId": 1,
    "shop": {
      "id": 1,
      "name": "My Shop"
    }
  },
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Login
```http
POST /api/auth/login
```

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "john@example.com",
    "role": "admin",
    "shopId": 1
  },
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### Get Profile
```http
GET /api/auth/profile
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com",
  "role": "admin",
  "shopId": 1
}
```

#### Forgot Password
```http
POST /api/auth/forgot-password
```

**Request Body:**
```json
{
  "email": "john@example.com"
}
```

**Response:** `200 OK`
```json
{
  "message": "If the email exists, a reset link has been sent.",
  "token": "reset-token-here"
}
```

#### Reset Password
```http
POST /api/auth/reset-password
```

**Request Body:**
```json
{
  "token": "reset-token-here",
  "password": "newpassword123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Password reset successfully"
}
```

---

### Products

#### Get All Products
```http
GET /api/products
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search term
- `category` (optional): Filter by category ID
- `lowStock` (optional): Filter low stock items (true/false)

**Response:** `200 OK`
```json
{
  "products": [
    {
      "id": 1,
      "name": "Product Name",
      "sku": "SKU001",
      "barcode": "1234567890",
      "description": "Product description",
      "price": 99.99,
      "cost": 50.00,
      "stockQuantity": 100,
      "reorderPoint": 20,
      "CategoryId": 1,
      "category": {
        "id": 1,
        "name": "Category Name"
      },
      "shopId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

#### Get Product by ID
```http
GET /api/products/:id
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Product Name",
  "sku": "SKU001",
  "barcode": "1234567890",
  "description": "Product description",
  "price": 99.99,
  "cost": 50.00,
  "stockQuantity": 100,
  "reorderPoint": 20,
  "CategoryId": 1,
  "category": {
    "id": 1,
    "name": "Category Name"
  },
  "shopId": 1
}
```

#### Create Product
```http
POST /api/products
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Request Body:**
```json
{
  "name": "Product Name",
  "sku": "SKU001",
  "barcode": "1234567890",
  "description": "Product description",
  "price": 99.99,
  "cost": 50.00,
  "stockQuantity": 100,
  "reorderPoint": 20,
  "CategoryId": 1,
  "expirationDate": "2024-12-31T00:00:00.000Z",
  "weightGrams": 500
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "Product Name",
  "sku": "SKU001",
  "price": 99.99,
  "stockQuantity": 100,
  "shopId": 1
}
```

#### Update Product
```http
PUT /api/products/:id
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Request Body:** (Same as Create Product)

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Updated Product Name",
  "price": 109.99,
  "stockQuantity": 95
}
```

#### Delete Product
```http
DELETE /api/products/:id
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`

**Response:** `200 OK`
```json
{
  "message": "Product deleted successfully"
}
```

#### Update Stock
```http
PATCH /api/products/:id/stock
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`, `cashier`

**Request Body:**
```json
{
  "quantity": 50
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "stockQuantity": 150,
  "message": "Stock updated successfully"
}
```

---

### Sales

#### Get All Sales
```http
GET /api/sales
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `customerId` (optional): Filter by customer ID
- `status` (optional): Filter by status

**Response:** `200 OK`
```json
{
  "sales": [
    {
      "id": 1,
      "totalAmount": 199.98,
      "discount": 10.00,
      "tax": 19.00,
      "paymentMethod": "cash",
      "status": "completed",
      "customerId": 1,
      "customer": {
        "id": 1,
        "name": "Customer Name"
      },
      "items": [
        {
          "id": 1,
          "productId": 1,
          "quantity": 2,
          "price": 99.99,
          "discount": 5.00,
          "total": 194.98
        }
      ],
      "shopId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50
  }
}
```

#### Get Sale by ID
```http
GET /api/sales/:id
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "totalAmount": 199.98,
  "discount": 10.00,
  "tax": 19.00,
  "paymentMethod": "cash",
  "status": "completed",
  "customerId": 1,
  "items": [...],
  "shopId": 1
}
```

#### Create Sale
```http
POST /api/sales
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "items": [
    {
      "productId": 1,
      "quantity": 2,
      "price": 99.99,
      "discount": 5.00,
      "discountType": "fixed",
      "discountValue": 5.00,
      "taxRate": 10.0,
      "taxAmount": 19.00
    }
  ],
  "customerId": 1,
  "customer": {
    "name": "Walk-in Customer",
    "email": "customer@example.com",
    "phone": "+1234567890"
  },
  "paymentMethod": "cash",
  "discount": 10.00,
  "discountType": "percentage",
  "notes": "Sale notes",
  "reference": "REF001"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "totalAmount": 199.98,
  "status": "completed",
  "shopId": 1
}
```

#### Update Sale
```http
PUT /api/sales/:id
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:** (Similar to Create Sale)

**Response:** `200 OK`
```json
{
  "id": 1,
  "totalAmount": 189.98,
  "status": "completed"
}
```

#### Delete Sale
```http
DELETE /api/sales/:id
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "message": "Sale deleted successfully"
}
```

---

### Customers

#### Get All Customers
```http
GET /api/customers
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `search` (optional): Search term
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "customers": [
    {
      "id": 1,
      "name": "Customer Name",
      "email": "customer@example.com",
      "phone": "+1234567890",
      "address": "123 Main St",
      "loyaltyPoints": 100,
      "totalPurchases": 1000.00,
      "shopId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50
  }
}
```

#### Get Customer by ID
```http
GET /api/customers/:id
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "loyaltyPoints": 100,
  "totalPurchases": 1000.00,
  "shopId": 1
}
```

#### Create Customer
```http
POST /api/customers
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "Customer Name",
  "email": "customer@example.com",
  "phone": "+1234567890",
  "address": "123 Main St",
  "notes": "Customer notes"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "name": "Customer Name",
  "email": "customer@example.com",
  "shopId": 1
}
```

#### Update Customer
```http
PUT /api/customers/:id
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:** (Same as Create Customer)

**Response:** `200 OK`
```json
{
  "id": 1,
  "name": "Updated Customer Name",
  "email": "customer@example.com"
}
```

#### Delete Customer
```http
DELETE /api/customers/:id
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "message": "Customer deleted successfully"
}
```

#### Get Customer Statistics
```http
GET /api/customers/statistics
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "totalCustomers": 100,
  "newCustomers": 10,
  "totalPurchases": 50000.00,
  "averagePurchase": 500.00
}
```

---

### Expenses

#### Get All Expenses
```http
GET /api/expenses
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `category` (optional): Filter by category

**Response:** `200 OK`
```json
{
  "expenses": [
    {
      "id": 1,
      "description": "Office Supplies",
      "amount": 500.00,
      "category": "inventory",
      "date": "2024-01-01T00:00:00.000Z",
      "paymentMethod": "bank_transfer",
      "reference": "REF001",
      "notes": "Monthly supplies",
      "shopId": 1,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50
  }
}
```

#### Create Expense
```http
POST /api/expenses
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Request Body:**
```json
{
  "description": "Office Supplies",
  "amount": 500.00,
  "category": "inventory",
  "date": "2024-01-01T00:00:00.000Z",
  "paymentMethod": "bank_transfer",
  "reference": "REF001",
  "notes": "Monthly supplies"
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "description": "Office Supplies",
  "amount": 500.00,
  "category": "inventory",
  "shopId": 1
}
```

#### Get Expense Statistics
```http
GET /api/expenses/statistics
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date
- `category` (optional): Filter by category

**Response:** `200 OK`
```json
{
  "totalExpenses": 5000.00,
  "byCategory": {
    "inventory": 2000.00,
    "salary": 2000.00,
    "rent": 1000.00
  },
  "averageExpense": 500.00
}
```

---

### Dashboard

#### Get Dashboard Statistics
```http
GET /api/dashboard/stats
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "totalSales": 50000.00,
  "totalRevenue": 45000.00,
  "totalExpenses": 10000.00,
  "profit": 35000.00,
  "totalCustomers": 100,
  "totalProducts": 500,
  "lowStockProducts": 10
}
```

#### Get Revenue Data
```http
GET /api/dashboard/revenue
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `period` (optional): `daily`, `weekly`, `monthly` (default: `monthly`)
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "period": "monthly",
  "data": [
    {
      "date": "2024-01-01",
      "revenue": 10000.00,
      "sales": 50
    },
    {
      "date": "2024-02-01",
      "revenue": 12000.00,
      "sales": 60
    }
  ]
}
```

#### Get Top Products
```http
GET /api/dashboard/top-products
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `limit` (optional): Number of products (default: 10)
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "products": [
    {
      "id": 1,
      "name": "Product Name",
      "totalSales": 10000.00,
      "quantitySold": 100,
      "revenue": 10000.00
    }
  ]
}
```

---

### Analytics

#### Get Visitors
```http
GET /api/analytics/visitors
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "total": 1000,
  "unique": 800,
  "period": "monthly"
}
```

#### Get Order Tracking
```http
GET /api/analytics/orders
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "total": 500,
  "completed": 450,
  "pending": 30,
  "cancelled": 20
}
```

#### Get Customer Locations
```http
GET /api/analytics/customer-locations
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "locations": [
    {
      "city": "Nairobi",
      "count": 100,
      "percentage": 50.0
    }
  ]
}
```

#### Get Sales Channels
```http
GET /api/analytics/sales-channels
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "channels": [
    {
      "channel": "online",
      "sales": 30000.00,
      "percentage": 60.0
    },
    {
      "channel": "store",
      "sales": 20000.00,
      "percentage": 40.0
    }
  ]
}
```

---

### Reports

#### Get Sales Summary
```http
GET /api/reports/sales-summary
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "totalSales": 50000.00,
  "totalRevenue": 45000.00,
  "totalDiscounts": 2000.00,
  "totalTax": 3000.00,
  "numberOfSales": 500,
  "averageSale": 100.00
}
```

#### Get Profit and Loss
```http
GET /api/reports/profit-loss
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "revenue": 50000.00,
  "costOfGoods": 20000.00,
  "expenses": 10000.00,
  "grossProfit": 30000.00,
  "netProfit": 20000.00,
  "profitMargin": 40.0
}
```

#### Get Tax Estimate
```http
GET /api/reports/tax-estimate
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "totalTax": 3000.00,
  "taxableSales": 30000.00,
  "taxRate": 10.0
}
```

#### Get Employee Sales
```http
GET /api/reports/employee-sales
```

**Headers:** `Authorization: Bearer <token>`

**Required Role:** `admin`, `manager`

**Query Parameters:**
- `startDate` (optional): ISO 8601 date
- `endDate` (optional): ISO 8601 date

**Response:** `200 OK`
```json
{
  "employees": [
    {
      "id": 1,
      "name": "Employee Name",
      "totalSales": 10000.00,
      "numberOfSales": 50
    }
  ]
}
```

---

### Settings

#### Get Settings
```http
GET /api/settings
```

**Headers:** `Authorization: Bearer <token>`

**Response:** `200 OK`
```json
{
  "systemName": "Zana POS",
  "defaultCurrency": "KES",
  "currencySymbol": "KSh",
  "currencyPosition": "before",
  "decimalPlaces": 2,
  "timezone": "Africa/Nairobi",
  "language": "en",
  "theme": "light"
}
```

#### Update Settings
```http
PUT /api/settings
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "systemName": "My POS System",
  "defaultCurrency": "KES",
  "currencySymbol": "KSh",
  "currencyPosition": "before",
  "decimalPlaces": 2
}
```

**Response:** `200 OK`
```json
{
  "message": "Settings updated successfully",
  "settings": { ... }
}
```

---

### AI Service Proxy

The backend acts as a proxy for AI service endpoints. All AI service requests must go through the backend proxy.

#### AI Service Status
```http
GET /api/ai/status
```

**Headers:** Not required (public health check)

**Response:** `200 OK`
```json
{
  "ok": true,
  "timestamp": 1234567890,
  "details": {
    "upstream": "http://ai_service:8000"
  }
}
```

#### Forward to AI Service
```http
POST /api/ai/forward/api/finance/analyze
GET /api/ai/forward/api/forecasting/forecast
POST /api/ai/forward/api/insights/analyze
```

**Headers:** `Authorization: Bearer <token>`

**Note:** The path after `/forward/` is forwarded to the AI service. For example:
- `/api/ai/forward/api/finance/analyze` → `POST http://ai_service:8000/api/finance/analyze`

**Request Body:** (Depends on AI endpoint)

**Response:** (Depends on AI endpoint)

---

## AI Service Endpoints

The AI service runs on port 8000 and can be accessed directly (with authentication) or through the backend proxy.

### Base URL
- **Development**: `http://localhost:8000`
- **Docker**: `http://ai_service:8000`

### Health Check
```http
GET /
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "service": "Zana AI Financial Helper"
}
```

### Financial Analysis
```http
POST /api/finance/analyze
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "revenue": 10000.00,
  "costs": 5000.00,
  "expenses": 2000.00,
  "assets": 50000.00,
  "liabilities": 20000.00,
  "date": "2024-01-01T00:00:00"
}
```

**Response:** `200 OK`
```json
{
  "gross_profit_margin": 0.5,
  "net_profit_margin": 0.3,
  "current_ratio": 2.5,
  "quick_ratio": 2.0,
  "debt_to_equity": 0.67,
  "inventory_turnover": 0.33,
  "cash_conversion_cycle": 45.0
}
```

### Forecasting
```http
POST /api/forecasting/forecast
```

**Headers:** `Authorization: Bearer <token>`

**Query Parameters:**
- `periods` (optional): Number of periods to forecast (default: 30)

**Request Body:**
```json
{
  "dates": [
    "2024-01-01T00:00:00",
    "2024-02-01T00:00:00",
    "2024-03-01T00:00:00"
  ],
  "values": [1000.00, 1200.00, 1100.00]
}
```

**Response:** `200 OK`
```json
{
  "dates": ["2024-04-01T00:00:00", ...],
  "predictions": [1150.00, ...],
  "lower_bounds": [1100.00, ...],
  "upper_bounds": [1200.00, ...]
}
```

### Business Insights
```http
POST /api/insights/analyze
```

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "revenue": [1000.00, 1200.00, 1100.00],
  "costs": [500.00, 600.00, 550.00],
  "customer_count": [100, 120, 110],
  "transaction_count": [50, 60, 55],
  "average_transaction_value": [20.00, 20.00, 20.00]
}
```

**Response:** `200 OK`
```json
[
  {
    "insight_type": "Revenue Growth",
    "description": "Positive revenue growth of 10.0%",
    "score": 0.1,
    "recommendations": [
      "Consider expanding to new markets",
      "Invest in marketing to maintain growth",
      "Analyze top-performing products/services"
    ]
  }
]
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "Error message",
  "details": "Additional error details (optional)"
}
```

### Common HTTP Status Codes

| Status Code | Meaning | Description |
|------------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Authentication Errors

```json
{
  "error": "Authorization token required."
}
```

```json
{
  "error": "Invalid token."
}
```

```json
{
  "error": "Token expired."
}
```

### Validation Errors

```json
{
  "errors": [
    {
      "field": "email",
      "message": "Please enter a valid email"
    },
    {
      "field": "password",
      "message": "Password must be at least 6 characters long"
    }
  ]
}
```

---

## Rate Limiting

Currently, rate limiting is not implemented. Consider implementing rate limiting in production to prevent abuse.

---

## Pagination

Many list endpoints support pagination using query parameters:

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10)

**Response Format:**
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "pages": 10
  }
}
```

---

## Multi-Tenant Isolation

All endpoints automatically filter data by `shopId` from the JWT token. Users can only access data belonging to their shop.

**Exception:** Users with `super_admin` role can access all data.

---

## Related Documentation

- [Inter-Service Authentication Flow](./INTER_SERVICE_AUTHENTICATION.md) - Detailed authentication flow
- [JWT Setup Guide](./JWT_SETUP_GUIDE.md) - JWT configuration
- [Docker Setup](./DOCKER_SETUP.md) - Development environment setup


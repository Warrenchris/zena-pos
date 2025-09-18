-- Multi-tenant setup script
-- This script sets up multi-tenant architecture for existing database

-- Step 1: Create a default shop if none exists
INSERT INTO Shops (name, address, phone, active, createdAt, updatedAt)
SELECT 'Default Shop', 'Default Address', '000-000-0000', true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM Shops LIMIT 1);

-- Step 2: Add shopId columns to all tables (if they don't exist)
-- Categories
ALTER TABLE Categories ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE Categories ADD CONSTRAINT fk_categories_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Products  
ALTER TABLE Products ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE Products ADD CONSTRAINT fk_products_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Customers
ALTER TABLE Customers ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE Customers ADD CONSTRAINT fk_customers_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Sales
ALTER TABLE Sales ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE Sales ADD CONSTRAINT fk_sales_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Expenses
ALTER TABLE Expenses ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE Expenses ADD CONSTRAINT fk_expenses_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- ActivityLogs
ALTER TABLE ActivityLogs ADD COLUMN shopId INTEGER DEFAULT 1;
ALTER TABLE ActivityLogs ADD CONSTRAINT fk_activity_logs_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Step 3: Update all existing records to use the default shop
UPDATE Categories SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;
UPDATE Products SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;
UPDATE Customers SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;
UPDATE Sales SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;
UPDATE Expenses SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;
UPDATE ActivityLogs SET shopId = (SELECT id FROM Shops LIMIT 1) WHERE shopId IS NULL;

-- Step 4: Make shopId NOT NULL after setting default values
ALTER TABLE Categories ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Products ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Customers ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Sales ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Expenses ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE ActivityLogs ALTER COLUMN shopId SET NOT NULL;

-- Step 5: Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_categories_shop_id ON Categories(shopId);
CREATE INDEX IF NOT EXISTS idx_products_shop_id ON Products(shopId);
CREATE INDEX IF NOT EXISTS idx_customers_shop_id ON Customers(shopId);
CREATE INDEX IF NOT EXISTS idx_sales_shop_id ON Sales(shopId);
CREATE INDEX IF NOT EXISTS idx_expenses_shop_id ON Expenses(shopId);
CREATE INDEX IF NOT EXISTS idx_activity_logs_shop_id ON ActivityLogs(shopId);

-- Step 6: Update unique constraints to be shop-scoped where needed
-- For example, make email unique within a shop for customers
-- (This would require dropping and recreating constraints)

-- Verify the setup
SELECT 'Multi-tenant setup completed successfully' as status;
SELECT 'Default shop created with ID: ' || id as shop_info FROM Shops LIMIT 1;
SELECT 'Total records updated:' as summary;
SELECT 'Categories: ' || COUNT(*) as categories FROM Categories;
SELECT 'Products: ' || COUNT(*) as products FROM Products;
SELECT 'Customers: ' || COUNT(*) as customers FROM Customers;
SELECT 'Sales: ' || COUNT(*) as sales FROM Sales;
SELECT 'Expenses: ' || COUNT(*) as expenses FROM Expenses;
SELECT 'ActivityLogs: ' || COUNT(*) as activity_logs FROM ActivityLogs;

-- Migration to add shopId to all tables for multi-tenant architecture
-- Run this script to update existing database

-- Add shopId column to Categories table
ALTER TABLE Categories ADD COLUMN shopId INTEGER;
ALTER TABLE Categories ADD CONSTRAINT fk_categories_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Add shopId column to Products table  
ALTER TABLE Products ADD COLUMN shopId INTEGER;
ALTER TABLE Products ADD CONSTRAINT fk_products_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Add shopId column to Customers table
ALTER TABLE Customers ADD COLUMN shopId INTEGER;
ALTER TABLE Customers ADD CONSTRAINT fk_customers_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Add shopId column to Sales table
ALTER TABLE Sales ADD COLUMN shopId INTEGER;
ALTER TABLE Sales ADD CONSTRAINT fk_sales_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Add shopId column to Expenses table
ALTER TABLE Expenses ADD COLUMN shopId INTEGER;
ALTER TABLE Expenses ADD CONSTRAINT fk_expenses_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Add shopId column to ActivityLogs table
ALTER TABLE ActivityLogs ADD COLUMN shopId INTEGER;
ALTER TABLE ActivityLogs ADD CONSTRAINT fk_activity_logs_shop 
    FOREIGN KEY (shopId) REFERENCES Shops(id);

-- Update existing data to assign to a default shop (shop ID 1)
-- This assumes you have at least one shop created
UPDATE Categories SET shopId = 1 WHERE shopId IS NULL;
UPDATE Products SET shopId = 1 WHERE shopId IS NULL;
UPDATE Customers SET shopId = 1 WHERE shopId IS NULL;
UPDATE Sales SET shopId = 1 WHERE shopId IS NULL;
UPDATE Expenses SET shopId = 1 WHERE shopId IS NULL;
UPDATE ActivityLogs SET shopId = 1 WHERE shopId IS NULL;

-- Make shopId NOT NULL after setting default values
ALTER TABLE Categories ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Products ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Customers ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Sales ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE Expenses ALTER COLUMN shopId SET NOT NULL;
ALTER TABLE ActivityLogs ALTER COLUMN shopId SET NOT NULL;

-- Add indexes for better performance
CREATE INDEX idx_categories_shop_id ON Categories(shopId);
CREATE INDEX idx_products_shop_id ON Products(shopId);
CREATE INDEX idx_customers_shop_id ON Customers(shopId);
CREATE INDEX idx_sales_shop_id ON Sales(shopId);
CREATE INDEX idx_expenses_shop_id ON Expenses(shopId);
CREATE INDEX idx_activity_logs_shop_id ON ActivityLogs(shopId);

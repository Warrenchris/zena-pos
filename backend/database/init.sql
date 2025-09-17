-- Create database
CREATE DATABASE IF NOT EXISTS zana_db;
USE zana_db;

-- Create database user
CREATE USER IF NOT EXISTS 'zana_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON zana_db.* TO 'zana_user'@'localhost';
FLUSH PRIVILEGES;

-- Database schema will be managed by Sequelize through migrations

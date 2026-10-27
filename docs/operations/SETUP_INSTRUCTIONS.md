# 🚀 Project Setup Instructions

## Prerequisites
- Node.js (v16 or higher)
- MySQL Server
- Git

## Database Setup

### 1. Install MySQL
If you don't have MySQL installed:
- Download from: https://dev.mysql.com/downloads/mysql/
- Install and start MySQL service

### 2. Create Database and User

**Option A: Using MySQL Command Line**
```sql
-- Connect to MySQL as root
mysql -u root -p

-- Create database
CREATE DATABASE IF NOT EXISTS zana_db;

-- Create user (replace 'your_password' with a secure password)
CREATE USER IF NOT EXISTS 'zana_user'@'localhost' IDENTIFIED BY 'your_password';

-- Grant privileges
GRANT ALL PRIVILEGES ON zana_db.* TO 'zana_user'@'localhost';
FLUSH PRIVILEGES;

-- Exit MySQL
EXIT;
```

**Option B: Using MySQL Workbench**
1. Open MySQL Workbench
2. Connect to your MySQL server
3. Run the SQL commands above

### 3. Update Backend Configuration
Edit `backend/.env` file and update the database credentials:

```env
# Database Configuration
DB_NAME=zana_db
DB_USER=zana_user
DB_PASS=your_password  # The password you set above
DB_HOST=localhost
DB_PORT=3306

# JWT Secret
JWT_SECRET=your_super_secret_jwt_key_here_make_it_long_and_secure

# Server Configuration
NODE_ENV=development
PORT=3000

# CORS Configuration
CORS_ORIGIN=http://localhost:5173
```

## Running the Application

### 1. Start Backend Server
```bash
cd backend
npm install
npm run dev
```

### 2. Start Frontend Development Server
```bash
cd frontend
npm install
npm run dev
```

### 3. Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Default Login Credentials
The system will create default users when you first run it. Check the seeders for default credentials.

## Troubleshooting

### Database Connection Issues
1. Ensure MySQL is running
2. Check if the database and user exist
3. Verify credentials in `.env` file
4. Make sure the database port (3306) is not blocked

### Frontend Issues
1. Make sure you're running `npm run dev` from the `frontend` directory
2. Check if all dependencies are installed (`npm install`)

### Backend Issues
1. Make sure you're running `npm run dev` from the `backend` directory
2. Check if all dependencies are installed (`npm install`)
3. Verify the `.env` file exists and has correct values

## Quick Start (If MySQL is already set up)

1. **Setup Database:**
   ```bash
   # Connect to MySQL and create database
   mysql -u root -p
   CREATE DATABASE zana_db;
   CREATE USER 'zana_user'@'localhost' IDENTIFIED BY 'password123';
   GRANT ALL PRIVILEGES ON zana_db.* TO 'zana_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

2. **Update .env file** with your MySQL password

3. **Start both servers:**
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev
   
   # Terminal 2 - Frontend  
   cd frontend
   npm run dev
   ```

4. **Access the application** at http://localhost:5173

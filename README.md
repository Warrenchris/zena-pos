# 🛒 Zana POS & Enterprise Platform

> **Cloud-based POS, ERM, CRM, and AI Financial Helper tailored for African SMEs.**

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-v18-blue)](https://reactjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v0.100%2B-009688)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ED)](https://www.docker.com/)

---

## 📋 Overview

**Zana Platform** is an all-in-one business management solution designed to empower Small and Medium Enterprises (SMEs) across Africa. It integrates traditional Point-of-Sale (POS) operations with Enterprise Resource Management (ERM), Customer Relationship Management (CRM), and a predictive AI Financial Assistant to deliver real-time data insights, automated stock reordering, and financial forecasting.

---

## ✨ Key Features

### 🛒 Point of Sale (POS)
* **Sales Terminal**: Fast checkout experience with barcode support, item discounts, and multiple payment methods.
* **Inventory & Stock Tracking**: Real-time stock counts, multi-location support, and automated low-stock notifications.
* **Invoicing & Receipts**: PDF receipt generation, invoice exporting, and sales summary reports.
* **Multi-Currency Support**: Native handling of regional and international currencies.

### 🏢 Enterprise Resource Management (ERM)
* **Staff & Employee Management**: Shift tracking, commission calculation, and role allocation.
* **Role-Based Access Control (RBAC)**: Fine-grained permissions cached via Redis for ultra-low latency authorization.
* **Financial Accounting & Expenses**: Expense categorization, cash flow monitoring, and profit/loss statements.

### 👥 Customer Relationship Management (CRM)
* **Customer Profiles**: Store contact details, credit/debt history, and preferences.
* **Loyalty Programs**: Automated reward points and customer tiering.
* **Regional Communication**: Targeted market updates and promotional alerts.

### 🤖 AI Financial Helper
* **Demand Forecasting**: Powered by Meta's Prophet algorithm for accurate revenue and inventory prediction.
* **Smart Stock Intelligence**: Predictive stock reorder recommendations based on historical velocity.
* **Anomaly & Risk Detection**: Automated alerts for abnormal revenue drops or inventory discrepancies.

---

## 🛠️ Tech Stack

| Domain | Technology | Description |
|---|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Redux Toolkit | High-performance SPA with modern UI/UX components |
| **Backend** | Node.js, Express 5, Sequelize ORM | RESTful API backend handling business logic & auth |
| **AI Microservice**| Python 3.9+, FastAPI, Prophet, Scikit-learn, Pandas | Machine learning & financial forecasting engine |
| **Database** | MySQL 8 | Relational data persistence with Sequelize migrations |
| **Caching / State** | Redis 7 | High-performance caching for RBAC permissions & session storage |
| **Authentication** | RS256 Asymmetric JWT | Secure inter-service communication with public key verification |
| **Containerization**| Docker & Docker Compose | Containerized orchestration for easy local & cloud setup |

---

## 📁 Repository Structure

```
zana-pos/
├── backend/                  # Node.js/Express REST API service
│   ├── database/             # Database initialization & SQL scripts
│   ├── migrations/           # Sequelize database migrations
│   ├── seeders/              # Initial seed data scripts
│   ├── src/                  # Express controllers, models, routes, & middleware
│   └── tests/                # Jest integration & unit tests
├── frontend/                 # React + TypeScript + Vite frontend app
│   ├── src/                  # Components, pages, hooks, Redux store
│   └── public/               # Static web assets
├── ai_service/               # FastAPI Python AI microservice
│   ├── src/                  # Forecasting algorithms, API endpoints, ML models
│   ├── pyproject.toml        # Poetry dependency management
│   └── jwt_public_key.pem    # RS256 public key for token verification
├── docs/                     # Additional architecture & design documents
├── docker-compose.yml        # Docker composition for full-stack deployment
├── start-docker.ps1          # PowerShell helper script for Docker launch
└── Makefile                  # Task automation commands
```

---

## 🚀 Quick Start Guide

### Prerequisites
* **Docker & Docker Compose** (Recommended)
* **Node.js** (v18+) & **npm** (v9+)
* **Python** (v3.9+) & **Poetry** (if running AI service natively)
* **MySQL** (v8.0+) & **Redis** (v7.0+) (if running locally without Docker)

---

### Option 1: Docker (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Warrenchris/zena-pos.git
   cd zena-pos
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` files to `.env` in the respective service directories:
   * `backend/.env`
   * `frontend/.env`
   * `ai_service/.env`

3. **Start all services**:
   ```bash
   npm run dev:all
   ```
   *or using Docker Compose directly:*
   ```bash
   docker-compose up --build -d
   ```

4. **Access the applications**:
   * 🌐 **Frontend Application**: [http://localhost:5173](http://localhost:5173)
   * ⚙️ **Backend API**: [http://localhost:3000](http://localhost:3000)
   * 🤖 **AI Microservice Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
   * 🗄️ **MySQL Database**: `localhost:3307`
   * 🔴 **Redis Cache**: `localhost:6379`

5. **Check Service Health**:
   ```bash
   npm run health
   ```

---

### Option 2: Local Native Setup

1. **Install Dependencies**:
   ```bash
   npm run install:all
   ```

2. **Setup Backend**:
   ```bash
   cd backend
   npm install
   npx sequelize-cli db:migrate
   npm run dev
   ```

3. **Setup Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Setup AI Service**:
   ```bash
   cd ai_service
   poetry install
   poetry run uvicorn src.main:app --reload --port 8000
   ```

---

## 🔧 Environment Configuration

### Backend (`backend/.env`)
```env
PORT=3000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=3306
DB_NAME=zana_pos
DB_USER=root
DB_PASS=root
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
AI_SERVICE_URL=http://localhost:8000
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:3000
VITE_AI_SERVICE_URL=http://localhost:8000
```

### AI Service (`ai_service/.env`)
```env
PORT=8000
JWT_ALGORITHM=RS256
JWT_PUBLIC_KEY_PATH=/app/jwt_public_key.pem
```

---

## 📜 NPM Script Commands Reference

From the project root:

| Command | Description |
|---|---|
| `npm run dev:all` | Start all services via Docker Compose in detached mode |
| `npm run dev:down` | Stop and remove Docker containers |
| `npm run dev:logs` | Stream logs from all running containers |
| `npm run backend:logs` | Stream backend logs |
| `npm run frontend:logs` | Stream frontend logs |
| `npm run ai:logs` | Stream AI service logs |
| `npm run backend:shell` | Open interactive shell inside backend container |
| `npm run install:all` | Install node modules & dependencies across backend, frontend, and AI service |
| `npm run health` | Test availability of all service HTTP endpoints |

---

## 🔒 Security & Architecture

* **Inter-Service Authentication**: Built with **RS256 JWT** signatures. The Backend signs requests using a private key, and the AI microservice verifies requests using the shared public key.
* **Cached RBAC Enforcement**: Role permissions are cached in Redis to minimize database overhead during high-concurrency requests.
* **Rate Limiting & Security Headers**: Integrated `helmet` and `express-rate-limit` to prevent brute-force attacks and standard web vulnerabilities.

---

## 📚 Detailed Documentation

For specific implementation details, refer to the following guides in the repository:
* 📄 [API Documentation](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/API_DOCUMENTATION.md)
* 🐳 [Docker Setup Guide](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/DOCKER_SETUP.md)
* 🔑 [Inter-Service Authentication](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/INTER_SERVICE_AUTHENTICATION.md)
* 🔐 [JWT RS256 Migration Guide](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/JWT_RS256_MIGRATION_GUIDE.md)
* ⚡ [RBAC Caching Implementation](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/RBAC_CACHING_IMPLEMENTATION.md)
* ⚙️ [Settings Feature Documentation](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/SETTINGS_FEATURE_README.md)
* 📊 [Chart Standardization Guide](file:///c:/Users/WARREN%20CHRIS/Desktop/empty/CHART_LIBRARY_STANDARDIZATION.md)

---

## 📄 License

This project is licensed under the **ISC License**.
# Makefile for Zana Development Environment

.PHONY: help dev-up dev-down dev-build dev-logs dev-restart dev-clean dev-stop dev-ps
.PHONY: backend-logs frontend-logs ai-logs mysql-logs
.PHONY: backend-shell frontend-shell ai-shell mysql-shell
.PHONY: install install-backend install-frontend install-ai
.PHONY: keys keys-generate keys-distribute

# Default target
.DEFAULT_GOAL := help

# Colors for output
GREEN  := \033[0;32m
YELLOW := \033[0;33m
RED    := \033[0;31m
NC     := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Zana Development Environment - Available Commands:$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

dev-up: ## Start all services in detached mode
	@echo "$(GREEN)Starting all development services...$(NC)"
	docker-compose up --build -d
	@echo "$(GREEN)Services started!$(NC)"
	@echo "$(YELLOW)Backend:$(NC) http://localhost:3000"
	@echo "$(YELLOW)Frontend:$(NC) http://localhost:5173"
	@echo "$(YELLOW)AI Service:$(NC) http://localhost:8000"
	@echo "$(YELLOW)MySQL:$(NC) localhost:3307"

dev-down: ## Stop all services
	@echo "$(YELLOW)Stopping all services...$(NC)"
	docker-compose down

dev-stop: ## Stop services without removing containers
	@echo "$(YELLOW)Stopping services (keeping containers)...$(NC)"
	docker-compose stop

dev-restart: dev-down dev-up ## Restart all services

dev-build: ## Build all service images without starting
	@echo "$(GREEN)Building all service images...$(NC)"
	docker-compose build

dev-logs: ## View logs from all services (follow mode)
	@echo "$(GREEN)Viewing logs for all services (Ctrl+C to exit)...$(NC)"
	docker-compose logs -f

dev-ps: ## Show status of all services
	@echo "$(GREEN)Service Status:$(NC)"
	docker-compose ps

# Individual service logs
backend-logs: ## View backend logs
	docker-compose logs -f backend

frontend-logs: ## View frontend logs
	docker-compose logs -f frontend

ai-logs: ## View AI service logs
	docker-compose logs -f ai_service

mysql-logs: ## View MySQL logs
	docker-compose logs -f mysql

# Shell access to containers
backend-shell: ## Open shell in backend container
	docker-compose exec backend sh

frontend-shell: ## Open shell in frontend container
	docker-compose exec frontend sh

ai-shell: ## Open shell in AI service container
	docker-compose exec ai_service bash

mysql-shell: ## Open MySQL shell
	docker-compose exec mysql mysql -u root -p

# Installation helpers
install: install-backend install-frontend install-ai ## Install dependencies for all services

install-backend: ## Install backend dependencies
	@echo "$(GREEN)Installing backend dependencies...$(NC)"
	cd backend && npm install

install-frontend: ## Install frontend dependencies
	@echo "$(GREEN)Installing frontend dependencies...$(NC)"
	cd frontend && npm install

install-ai: ## Install AI service dependencies
	@echo "$(GREEN)Installing AI service dependencies...$(NC)"
	cd ai_service && poetry install

# Cleanup
dev-clean: ## Remove all containers, volumes, and images
	@echo "$(RED)WARNING: This will remove all containers, volumes, and images!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v --rmi all; \
		echo "$(GREEN)Cleanup complete.$(NC)"; \
	fi

# Database operations
db-migrate: ## Run database migrations
	@echo "$(GREEN)Running database migrations...$(NC)"
	docker-compose exec backend npm run migrate || echo "$(YELLOW)No migrate script found$(NC)"

db-seed: ## Seed the database
	@echo "$(GREEN)Seeding database...$(NC)"
	docker-compose exec backend npm run seed || echo "$(YELLOW)No seed script found$(NC)"

# JWT key management
keys: keys-generate keys-distribute ## Generate and distribute JWT keys (RS256)

keys-generate: ## Generate new RS256 key pair for JWT signing
	@echo "$(GREEN)Generating new RSA key pair for JWT signing...$(NC)"
	cd backend && node scripts/generate-jwt-keys.js
	@echo "$(GREEN)Generated:$(NC)"
	@echo "  - backend/jwt_private_key.pem (keep private!)"
	@echo "  - backend/jwt_public_key.pem"

keys-distribute: ## Copy public key to services that need it
	@echo "$(GREEN)Distributing JWT public key to services...$(NC)"
	@cp backend/jwt_public_key.pem ai_service/ || echo "$(RED)Failed to copy to ai_service$(NC)"
	@echo "$(GREEN)Distributed public key to:$(NC)"
	@echo "  - ai_service/jwt_public_key.pem"

# Health checks
health: ## Check health of all services
	@echo "$(GREEN)Checking service health...$(NC)"
	@echo "$(YELLOW)Backend:$(NC)"
	@curl -s http://localhost:3000/api/system-health || echo "$(RED)Backend not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)Frontend:$(NC)"
	@curl -s http://localhost:5173 > /dev/null && echo "$(GREEN)Frontend is up$(NC)" || echo "$(RED)Frontend not responding$(NC)"
	@echo ""
	@echo "$(YELLOW)AI Service:$(NC)"
	@curl -s http://localhost:8000/ > /dev/null && echo "$(GREEN)AI Service is up$(NC)" || echo "$(RED)AI Service not responding$(NC)"


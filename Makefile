# StockMafia — Go Microservices Build System
# Usage: make <target>

.PHONY: help build build-gateway build-crawler build-price build-analytics build-alert build-portfolio
.PHONY: test test-gateway test-crawler test-price test-analytics test-alert test-portfolio
.PHONY: docker docker-gateway docker-crawler docker-price docker-analytics docker-alert docker-portfolio
.PHONY: proto migrate run dev clean lint vet

# Configuration
SERVICES := gateway crawler price analytics alert portfolio
PROTO_DIR := proto/stockmafia
BUILD_DIR := build
DOCKER_REGISTRY ?= ghcr.io/stockmafia
VERSION ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
GO := go
GOFLAGS := -ldflags="-s -w"
CGO_ENABLED ?= 0

# Colors
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-25s\033[0m %s\n", $$1, $$2}'

# ─── Build ────────────────────────────────────────────────────

build: build-gateway build-crawler build-price build-analytics build-alert build-portfolio ## Build all services
	@echo "$(GREEN)✓ All services built$(NC)"

build-%: ## Build a specific service (e.g., make build-gateway)
	@echo "$(YELLOW)Building $*...$(NC)"
	@mkdir -p $(BUILD_DIR)
	cd services/$* && CGO_ENABLED=$(CGO_ENABLED) $(GO) build $(GOFLAGS) -o ../../$(BUILD_DIR)/$* ./cmd/main.go
	@echo "$(GREEN)✓ $(BUILD_DIR)/$*$(NC)"

# ─── Test ─────────────────────────────────────────────────────

test: test-gateway test-crawler test-price test-analytics test-alert test-portfolio ## Test all services
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-%: ## Test a specific service (e.g., make test-gateway)
	@echo "$(YELLOW)Testing $*...$(NC)"
	cd services/$* && $(GO) test -v -race -count=1 ./...
	@echo "$(GREEN)✓ $* tests passed$(NC)"

# ─── Docker ───────────────────────────────────────────────────

docker: docker-gateway docker-crawler docker-price docker-analytics docker-alert docker-portfolio ## Build all Docker images
	@echo "$(GREEN)✓ All Docker images built$(NC)"

docker-%: ## Build Docker image for a service
	@echo "$(YELLOW)Building Docker image for $*...$(NC)"
	docker build -t $(DOCKER_REGISTRY)/$*:$(VERSION) -t $(DOCKER_REGISTRY)/$*:latest -f services/$*/Dockerfile .
	@echo "$(GREEN)✓ $(DOCKER_REGISTRY)/$*:$(VERSION)$(NC)"

push-%: ## Push Docker image for a service
	@echo "$(YELLOW)Pushing $(DOCKER_REGISTRY)/$*:$(VERSION)...$(NC)"
	docker push $(DOCKER_REGISTRY)/$*:$(VERSION)
	docker push $(DOCKER_REGISTRY)/$*:latest
	@echo "$(GREEN)✓ Pushed$(NC)"

push: docker ## Build and push all Docker images
	@for svc in $(SERVICES); do $(MAKE) push-$$svc; done

# ─── Proto ────────────────────────────────────────────────────

proto: ## Generate protobuf code
	@echo "$(YELLOW)Generating protobuf code...$(NC)"
	./scripts/generate-protos.sh
	@echo "$(GREEN)✓ Proto code generated$(NC)"

# ─── Database ─────────────────────────────────────────────────

migrate-up: ## Run database migrations up
	@echo "$(YELLOW)Running migrations...$(NC)"
	./scripts/migrate.sh up
	@echo "$(GREEN)✓ Migrations complete$(NC)"

migrate-down: ## Run database migrations down
	@echo "$(YELLOW)Rolling back migrations...$(NC)"
	./scripts/migrate.sh down

migrate-status: ## Check migration status
	./scripts/migrate.sh status

# ─── Run ──────────────────────────────────────────────────────

run: build ## Build and run all services locally
	@echo "$(YELLOW)Starting all services...$(NC)"
	./scripts/dev.sh

run-%: build-% ## Build and run a specific service
	@echo "$(YELLOW)Starting $*...$(NC)"
	./$(BUILD_DIR)/$*

# ─── Dev ──────────────────────────────────────────────────────

dev: ## Start development environment (Docker infrastructure + native Go)
	./scripts/dev.sh

# ─── Lint ─────────────────────────────────────────────────────

lint: ## Run golangci-lint on all services
	@for svc in $(SERVICES); do \
		echo "$(YELLOW)Linting $$svc...$(NC)"; \
		cd services/$$svc && $(GO) run github.com/golangci/golangci-lint/cmd/golangci-lint@latest run ./... || true; \
		cd ../..; \
	done

vet: ## Run go vet on all services
	@for svc in $(SERVICES); do \
		echo "$(YELLOW)Vetting $$svc...$(NC)"; \
		cd services/$$svc && $(GO) vet ./... || true; \
		cd ../..; \
	done

# ─── Clean ────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf $(BUILD_DIR)
	@echo "$(GREEN)✓ Cleaned$(NC)"

# ─── Deploy ───────────────────────────────────────────────────

deploy-local: ## Deploy to local Docker Compose
	./scripts/deploy.sh local

deploy-k8s: push ## Deploy to Kubernetes
	./scripts/deploy.sh k8s

deploy-proxmox: ## Deploy to Proxmox LXC
	./scripts/deploy.sh proxmox

# ─── Info ─────────────────────────────────────────────────────

info: ## Show build information
	@echo "Version:    $(VERSION)"
	@echo "Go:         $(shell $(GO) version)"
	@echo "Docker:     $(shell docker --version 2>/dev/null || echo 'not installed')"
	@echo "Services:   $(SERVICES)"
	@echo "Registry:   $(DOCKER_REGISTRY)"

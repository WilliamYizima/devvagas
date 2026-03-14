.PHONY: help setup install dev build test type-check clean

help: ## Mostra esta ajuda
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

setup: ## Configuração inicial completa (instala deps + cria .env)
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ .env criado a partir de .env.example — edite com seus valores reais"; \
	else \
		echo "ℹ️  .env já existe, pulando"; \
	fi
	@mkdir -p data tmp
	npm install

install: ## Instala dependências
	npm install

dev: ## Inicia em modo desenvolvimento (hot-reload)
	npm run dev

start: ## Inicia a partir do build compilado
	npm run build && npm start

build: ## Compila TypeScript
	npm run build

test: ## Executa os testes
	npm test

type-check: ## Verifica tipos TypeScript sem compilar
	npm run type-check

clean: ## Remove arquivos gerados (dist/, data/, tmp/)
	rm -rf dist data tmp

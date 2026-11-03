#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker não está instalado." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "O Docker não está rodando. Abra o Docker Desktop e tente de novo." >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependências..."
  npm install
fi

echo "Subindo o Postgres..."
docker compose up -d

echo "Esperando o banco ficar pronto..."
health=""
for _ in $(seq 1 30); do
  health="$(docker inspect -f '{{.State.Health.Status}}' market-intelligence-db 2>/dev/null || true)"
  if [ "$health" = "healthy" ]; then
    break
  fi
  sleep 2
done

if [ "$health" != "healthy" ]; then
  echo "O Postgres não ficou pronto." >&2
  exit 1
fi

echo "Coletando categorias e mais vendidos..."
npm run scrape:ml
echo "Para buscar os mesmos produtos no AliExpress e no Alibaba: npm run scrape:suppliers"

echo "Frontend em http://localhost:3000"
exec npm run dev

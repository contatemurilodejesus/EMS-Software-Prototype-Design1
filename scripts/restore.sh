#!/usr/bin/env bash
# EnergyMatrix - restore do PostgreSQL (docs/operations.md).
#
# ATENCAO: sobrescreve o banco destino. Pare o backend antes:
#   docker compose stop backend
#
# Uso:
#   ./scripts/restore.sh backups/energymatrix_YYYYMMDD_HHMMSS.dump
#   ./scripts/restore.sh <dump> "postgres://..."   # URL de administracao
set -euo pipefail

DUMP="${1:?uso: restore.sh <dump> [database-url]}"
URL="${2:-${DATABASE_ADMIN_URL:-${DATABASE_URL:-postgres://energymatrix:energymatrix@localhost:5433/energymatrix}}}"

if [[ ! -f "$DUMP" ]]; then
  echo "[restore] arquivo nao encontrado: $DUMP" >&2
  exit 1
fi

echo "[restore] ATENCAO: restaurando $DUMP em $URL (drop implicito com --clean)"
pg_restore -d "$URL" --clean --if-exists --no-owner "$DUMP"
echo "[restore] ok - suba o backend e verifique: curl /api/health/ready"

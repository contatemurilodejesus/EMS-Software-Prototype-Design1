#!/usr/bin/env bash
# EnergyMatrix - backup do PostgreSQL (RPO diario, docs/operations.md).
#
# Uso:
#   ./scripts/backup.sh                 # usa DATABASE_ADMIN_URL ou default local
#   ./scripts/backup.sh "postgres://..." # URL de administracao explicita
#
# Requer pg_dump no PATH (host com postgres-client ou exec via container).
set -euo pipefail

URL="${1:-${DATABASE_ADMIN_URL:-${DATABASE_URL:-postgres://energymatrix:energymatrix@localhost:5433/energymatrix}}}"
OUT_DIR="${BACKUP_DIR:-backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/energymatrix_${STAMP}.dump"

echo "[backup] destino: $OUT"
pg_dump -Fc -d "$URL" -f "$OUT"
echo "[backup] ok: $(du -h "$OUT" | cut -f1)"

# Retencao simples local: mantem os 7 dumps mais recentes.
ls -1t "$OUT_DIR"/energymatrix_*.dump 2>/dev/null | tail -n +8 | xargs -r rm --
echo "[backup] retencao: ultimos 7 dumps mantidos em $OUT_DIR"

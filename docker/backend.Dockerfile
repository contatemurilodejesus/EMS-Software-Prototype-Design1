# Imagens Docker - EnergyMatrix EMS
# Contexto de build = raiz do repositorio (ver docker-compose.yml).

# ---------------------------------------------------------------------------
# Backend: Node 24 roda o TS nativamente (type stripping) - sem build.
# ---------------------------------------------------------------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY backend ./backend

EXPOSE 8787
CMD ["node", "backend/src/server/index.ts"]
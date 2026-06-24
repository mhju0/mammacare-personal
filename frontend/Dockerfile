# ── Stage 1: 빌드 ────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# 의존성 레이어 캐시 최적화
COPY package.json pnpm-lock.yaml pnpm.yaml pnpm-workspace.yaml .npmrc ./

RUN pnpm install --frozen-lockfile

# 소스 코드 및 .env 파일 복사 (VITE_* 빌드 타임 주입)
COPY . .

RUN pnpm run build

# ── Stage 2: nginx 서빙 ──────────────────────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]

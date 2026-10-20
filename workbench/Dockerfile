# OpenRouter AI Workbench — agent local + interface, avec Chromium pour le navigateur intégré.
FROM mcr.microsoft.com/playwright:v1.56.1-noble

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    PREVIEW_PORT=8788 \
    INCLUDE_CLAUDE_SKILLS=false

RUN apt-get update && apt-get install -y --no-install-recommends git python3 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

USER pwuser
EXPOSE 8787 8788
VOLUME ["/app/data", "/app/workspace"]
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server/index.js"]

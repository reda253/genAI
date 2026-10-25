# One image: Fastify API + built web app on port 4000. Run via the root docker-compose.yml.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
# Empty VITE_API_URL = same origin as the API.
RUN VITE_API_URL= VITE_USE_MOCKS=false npm run build

FROM node:22-slim AS app
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY prompts/ /app/prompts/
COPY --from=web /web/dist /app/web/dist
ENV HOST=0.0.0.0 PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]

# syntax=docker/dockerfile:1

# --- Build the static bundle -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Serve with nginx --------------------------------------------------------
FROM nginx:alpine
# App bundle.
COPY --from=build /app/dist /usr/share/nginx/html
# SPA + healthz + cache rules.
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Generates config.js from env at container start (runs before nginx).
COPY docker-entrypoint.d/40-app-config.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
EXPOSE 80

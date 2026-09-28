# frontend/Dockerfile — multi-etapa fuerte: Node compila, nginx sirve


# ---------- Etapa 1: build (compila la SPA) ----------
FROM node:20-alpine AS build
WORKDIR /app
# los manifiestos antes que el código: npm ci se reutiliza del cache si no cambian
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build


# ---------- Etapa 2: final (solo archivos estáticos + nginx) ----------
FROM nginxinc/nginx-unprivileged:1.27-alpine
# lo ÚNICO que cruza de etapa: el resultado de la compilación
COPY --from=build /app/dist /usr/share/nginx/html
# la configuración de nginx como plantilla; la imagen la procesa AL ARRANCAR
COPY nginx/templates/ /etc/nginx/templates/
# (punto 6) configuración que nginx resuelve al arrancar, no durante el build
ENV API_HOST=catalogo-api \
API_PORT=8000 \
NGINX_ENVSUBST_FILTER=^API_
# la base ya corre como usuario nginx (uid 101); no hace falta USER
EXPOSE 8080

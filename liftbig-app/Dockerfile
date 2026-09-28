# Stage 1: Build the Angular application
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
# docker-compose.yml passes "production,docker" so the local stack calls the local API via /api.
ARG NG_CONFIGURATION=production
RUN npm run build -- --configuration ${NG_CONFIGURATION}

# Stage 2: Serve the application with Nginx
FROM nginx:alpine

# Copy the built app from the builder stage
COPY --from=builder /usr/src/app/www /usr/share/nginx/html

# Replace the default Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

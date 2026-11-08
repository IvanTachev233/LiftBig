# Stage 1: Build dependencies
FROM node:24-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Dev (hot-reload)
FROM deps AS dev
WORKDIR /app
COPY . .
CMD ["npm", "run", "start:dev"]

# Stage 3: Build for production
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

# Stage 4: Runtime dependencies only (no TypeScript, Jest, ESLint or Nest CLI)
FROM node:24-alpine AS runtime-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Stage 5: Production
FROM node:24-alpine AS production
WORKDIR /app
COPY --from=runtime-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
# The files stay owned by root, so the process can read the app but not change it.
# node (uid 1000) is the official image's unprivileged user.
USER node
EXPOSE 3000
CMD ["node", "dist/main"]

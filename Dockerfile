# QTO full-stack (Vite React + Hono/tRPC + Drizzle/MySQL)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install --no-save drizzle-kit
COPY --from=build /app/dist ./dist
COPY db ./db
COPY drizzle.config.ts ./
EXPOSE 3000
# Pirmiausia DB migracijos, tada serveris
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/boot.js"]

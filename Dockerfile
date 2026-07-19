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
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY .env ./
EXPOSE 3000
CMD ["node", "dist/boot.js"]

# === Build Stage: Compile TypeScript to JavaScript ===
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

WORKDIR /app

# Copy package files and install ALL deps (including devDeps for tsc)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and compile TypeScript → dist/
COPY . .
RUN pnpm run build

# === Production Stage: Run compiled JS ===
FROM node:20-alpine AS production

RUN npm install -g pnpm

WORKDIR /app

# Copy package files and install production deps only
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder stage
COPY --from=builder /app/dist ./dist

EXPOSE 8000

CMD ["node", "dist/server.js"]

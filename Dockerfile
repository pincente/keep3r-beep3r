# Stage 1: Build Stage
FROM node:16-slim AS builder

# Set working directory
WORKDIR /app

# Install all dependencies including devDependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production Stage
FROM node:16-slim

# Set NODE_ENV to production
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm install --production

# Copy built files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/abis ./src/abis

# Start the app
CMD ["node", "dist/index.js"]

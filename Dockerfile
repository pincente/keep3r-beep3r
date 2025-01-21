# Use the official Node.js 16 slim image
FROM node:16-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Copy app source code and TypeScript config
COPY src ./src
COPY tsconfig.json ./

# Build the TypeScript code
RUN npm run build

# Expose any necessary ports (if needed)
# EXPOSE 3000

# Start the app
CMD [ "node", "dist/index.js" ]

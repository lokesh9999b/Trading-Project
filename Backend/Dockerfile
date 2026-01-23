# Use Node.js v20 (Compatible with modern libs)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first (Optimization for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose the port (must match your index.js port)
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]
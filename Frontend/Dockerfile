# Stage 1: Build the Angular App
FROM node:20-alpine as build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# Build for production
RUN npm run build

# Stage 2: Serve with Nginx (Lightweight Web Server)
FROM nginx:alpine
# Copy built files from Stage 1 to Nginx
# IMPORTANT: Replace 'trading-frontend' with the name found in your angular.json -> "projects": { "NAME": ... }
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
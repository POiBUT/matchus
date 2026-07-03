FROM node:20-alpine

# Set working directory
WORKDIR /app

# Update npm to latest version to avoid notices
RUN npm install -g npm@11.14.1

# Create npm cache and log directories with proper permissions
RUN mkdir -p /app/.npm/_logs && \
    chmod -R 777 /app/.npm

# Configure npm to use local directory for logs
ENV NPM_CONFIG_CACHE=/app/.npm/cache
ENV NPM_CONFIG_LOGPATH=/app/.npm/_logs

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the entire project
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=80

# Expose port 80
EXPOSE 80

# Start the bot server using npm script
CMD ["npm", "run", "bot"]

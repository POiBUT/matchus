#!/bin/bash

# Deployment Script for Matchus Telegram Mini App & Bot Server
# Prerequisites: git, Node.js, npm, PM2 (install globally via `npm install -g pm2`)

set -euo pipefail

# Configuration - Modify these values as needed
APP_DIR="."                     # Path to the application directory (relative or absolute)
GIT_BRANCH="main"               # Git branch to deploy
PM2_APP_NAME="matchus-app"      # Name for the PM2 process

echo "=== Starting Matchus Deployment ==="

# Navigate to application directory
if ! cd "$APP_DIR"; then
    echo "Error: Failed to navigate to app directory: $APP_DIR"
    exit 1
fi

# Pull latest code from git (if repository exists)
if [ -d ".git" ]; then
    echo "Pulling latest code from git branch: $GIT_BRANCH..."
    git pull origin "$GIT_BRANCH"
else
    echo "Warning: No git repository found, skipping code pull"
fi

# Install production dependencies
echo "Installing dependencies..."
npm install --production

# Restart or start the application with PM2
echo "Managing application process..."
if pm2 list | grep -q "$PM2_APP_NAME"; then
    echo "Restarting existing PM2 process: $PM2_APP_NAME"
    pm2 restart "$PM2_APP_NAME"
else
    echo "Starting new PM2 process: $PM2_APP_NAME"
    pm2 start bot/server.js --name "$PM2_APP_NAME"
fi

# Save PM2 process list to persist across reboots
pm2 save

echo "=== Deployment Completed Successfully ==="

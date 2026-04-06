#!/bin/bash

# OpenIssue Dev Environment Bootstrapper
# This script fires up both the FastAPI backend and Vite frontend concurrently.

# Colors for logging
CYAN='\033[0;36m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${CYAN}🚀 Booting OpenIssue Intelligence Intelligence Engine...${NC}"

# Function to kill background processes on exit
cleanup() {
    echo -e "\n${BLUE}🛑 Shutting down services...${NC}"
    [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null
    exit
}

# Clean stale processes before starting new ones — prevent port-shift confusion
echo -e "${BLUE}🧹 Cleaning up port 8000 and 5173...${NC}"
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

trap cleanup SIGINT SIGTERM EXIT

# 1. Start Backend
echo -e "${GREEN}📦 [1/2] Starting FastAPI Backend on port 8000...${NC}"
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# 2. Start Frontend
echo -e "${GREEN}🎨 [2/2] Starting Vite Frontend on port 5173...${NC}"
cd frontend

# Source NVM if it exists
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    . "$NVM_DIR/nvm.sh"
    nvm use 20 --silent || nvm use default --silent
fi

# Check for node_modules
if [ ! -d "node_modules" ]; then
    echo -e "${BLUE}📦 node_modules not found. Installing dependencies...${NC}"
    npm install
fi

npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo -e "${CYAN}✨ System Live!${NC}"
echo -e "   - Backend:  ${GREEN}http://localhost:8000${NC}"
echo -e "   - Frontend: ${GREEN}http://localhost:5173 (or next port)${NC}"
echo -e "   - Logs:     tail -f backend.log frontend.log"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Press Ctrl+C to stop all services.${NC}"

# Keep script alive and monitor processes
while true; do
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Backend process died. Check backend.log for details.${NC}"
        cleanup
    fi
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Frontend process died. Check frontend.log for details.${NC}"
        cleanup
    fi
    sleep 2
done

#!/bin/bash

# Define directories
BASE_DIR="/Users/victoralmeidaj16/Downloads/Insta-Automation"

echo "Stopping any running servers on ports 3000, 3001, 3011, 3050..."
# Find and kill processes listening on these ports
for port in 3000 3001 3011 3050; do
    pids=$(lsof -t -i :$port)
    if [ ! -z "$pids" ]; then
        for pid in $pids; do
            echo "Killing process on port $port (PID: $pid)..."
            kill -9 $pid 2>/dev/null || true
        done
    fi
done

# Clean up stale pid files
rm -f "$BASE_DIR/.backend.pid" "$BASE_DIR/.frontend.pid" "$BASE_DIR/.elevepic.pid"

echo "Starting Backend server (Port 3011)..."
cd "$BASE_DIR/backend"
npm run dev > "$BASE_DIR/.backend.log" 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$BASE_DIR/.backend.pid"

echo "Starting ElevePic Node server (Port 3050)..."
cd "$BASE_DIR/elevepic-node"
npm start > "$BASE_DIR/.elevepic.log" 2>&1 &
ELEVEPIC_PID=$!
echo $ELEVEPIC_PID > "$BASE_DIR/.elevepic.pid"

echo "Starting Frontend Next.js server (Port 3000)..."
cd "$BASE_DIR/frontend"
npm run dev > "$BASE_DIR/.frontend.log" 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$BASE_DIR/.frontend.pid"

echo "Waiting for servers to initialize..."
sleep 5

echo "----------------------------------------"
echo "Checking server status:"
backend_port_status=$(lsof -t -i :3011)
elevepic_port_status=$(lsof -t -i :3050)
frontend_port_status=$(lsof -t -i :3000)

if [ ! -z "$backend_port_status" ]; then
    echo "✅ Backend (Port 3011): RUNNING (PID: $backend_port_status)"
else
    echo "❌ Backend (Port 3011): OFFLINE"
fi

if [ ! -z "$elevepic_port_status" ]; then
    echo "✅ ElevePic (Port 3050): RUNNING (PID: $elevepic_port_status)"
else
    echo "❌ ElevePic (Port 3050): OFFLINE"
fi

if [ ! -z "$frontend_port_status" ]; then
    echo "✅ Frontend (Port 3000): RUNNING (PID: $frontend_port_status)"
else
    echo "❌ Frontend (Port 3000): OFFLINE"
fi
echo "----------------------------------------"

echo "All servers started! Access the app at http://localhost:3000"

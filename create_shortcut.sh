#!/bin/bash

APP_NAME="InstaAutomation"
URL="http://localhost:3000"
ICON_PATH="/Users/victoralmeidaj16/.gemini/antigravity/brain/1f50e3fe-01e1-486c-bab9-d386af7b48e0/insta_automation_icon_v2_1765027222776.png"
DESTINATION="$HOME/Applications"
FRONTEND_DIR="/Users/victoralmeidaj16/Downloads/Insta-Automation/frontend"
BACKEND_DIR="/Users/victoralmeidaj16/Downloads/Insta-Automation/backend"

echo "Creating shortcut for $URL..."

# Create the AppleScript source with dual auto-start logic
cat <<EOF > "$APP_NAME.applescript"
try
    -- Check Backend (Port 3001)
    try
        do shell script "lsof -i :3001 -sTCP:LISTEN"
    on error
        -- Backend NOT running, start it
        tell application "Terminal"
            do script "cd $BACKEND_DIR && npm start"
            activate
        end tell
    end try

    -- Check Frontend (Port 3000)
    try
        do shell script "lsof -i :3000 -sTCP:LISTEN"
    on error
        -- Frontend NOT running, start it
        tell application "Terminal"
            do script "cd $FRONTEND_DIR && npm run dev"
            activate
        end tell
    end try
    
    -- Wait a bit for servers to initialize if they were just started
    delay 5
    
    -- Open the URL
    open location "$URL"
    
on error errMsg
    display dialog "Error starting InstaAutomation: " & errMsg
end try
EOF

# Compile into an Application
osacompile -o "$APP_NAME.app" "$APP_NAME.applescript"

# Create iconset
echo "Generating iconset..."
mkdir "$APP_NAME.iconset"

# Resize images with explicit format
sips -s format png -z 16 16     "$ICON_PATH" --out "$APP_NAME.iconset/icon_16x16.png" > /dev/null
sips -s format png -z 32 32     "$ICON_PATH" --out "$APP_NAME.iconset/icon_16x16@2x.png" > /dev/null
sips -s format png -z 32 32     "$ICON_PATH" --out "$APP_NAME.iconset/icon_32x32.png" > /dev/null
sips -s format png -z 64 64     "$ICON_PATH" --out "$APP_NAME.iconset/icon_32x32@2x.png" > /dev/null
sips -s format png -z 128 128   "$ICON_PATH" --out "$APP_NAME.iconset/icon_128x128.png" > /dev/null
sips -s format png -z 256 256   "$ICON_PATH" --out "$APP_NAME.iconset/icon_128x128@2x.png" > /dev/null
sips -s format png -z 256 256   "$ICON_PATH" --out "$APP_NAME.iconset/icon_256x256.png" > /dev/null
sips -s format png -z 512 512   "$ICON_PATH" --out "$APP_NAME.iconset/icon_256x256@2x.png" > /dev/null
sips -s format png -z 512 512   "$ICON_PATH" --out "$APP_NAME.iconset/icon_512x512.png" > /dev/null
sips -s format png -z 1024 1024 "$ICON_PATH" --out "$APP_NAME.iconset/icon_512x512@2x.png" > /dev/null

# Convert to icns
echo "Converting to .icns..."
iconutil -c icns "$APP_NAME.iconset"

# Replace icon
echo "Applying icon..."
cp "$APP_NAME.icns" "$APP_NAME.app/Contents/Resources/applet.icns"

# Cleanup
rm "$APP_NAME.applescript"
rm -rf "$APP_NAME.iconset"
rm "$APP_NAME.icns"

# Move to Applications if it exists
if [ -d "$DESTINATION" ]; then
    echo "Moving to $DESTINATION..."
    rm -rf "$DESTINATION/$APP_NAME.app"
    mv "$APP_NAME.app" "$DESTINATION/"
    echo "App moved to $DESTINATION"
    echo "You can now find 'InstaAutomation' in Launchpad!"
else
    echo "App created in current directory: $APP_NAME.app"
    echo "Move it to your Applications folder to see it in Launchpad."
fi

echo "Done!"

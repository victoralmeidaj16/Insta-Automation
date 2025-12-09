#!/bin/bash

APP_NAME="DebugIcon"
ICON_PATH="/Users/victoralmeidaj16/.gemini/antigravity/brain/1f50e3fe-01e1-486c-bab9-d386af7b48e0/insta_automation_icon_1765026773443.png"

echo "Checking icon path: $ICON_PATH"
ls -l "$ICON_PATH"

mkdir "$APP_NAME.iconset"

echo "Running sips..."
sips -s format png -z 16 16     "$ICON_PATH" --out "$APP_NAME.iconset/icon_16x16.png"
sips -s format png -z 32 32     "$ICON_PATH" --out "$APP_NAME.iconset/icon_16x16@2x.png"
sips -s format png -z 32 32     "$ICON_PATH" --out "$APP_NAME.iconset/icon_32x32.png"
sips -s format png -z 64 64     "$ICON_PATH" --out "$APP_NAME.iconset/icon_32x32@2x.png"
sips -s format png -z 128 128   "$ICON_PATH" --out "$APP_NAME.iconset/icon_128x128.png"
sips -s format png -z 256 256   "$ICON_PATH" --out "$APP_NAME.iconset/icon_128x128@2x.png"
sips -s format png -z 256 256   "$ICON_PATH" --out "$APP_NAME.iconset/icon_256x256.png"
sips -s format png -z 512 512   "$ICON_PATH" --out "$APP_NAME.iconset/icon_256x256@2x.png"
sips -s format png -z 512 512   "$ICON_PATH" --out "$APP_NAME.iconset/icon_512x512.png"
sips -s format png -z 1024 1024 "$ICON_PATH" --out "$APP_NAME.iconset/icon_512x512@2x.png"

echo "Listing iconset content:"
ls -l "$APP_NAME.iconset"

echo "Converting to icns..."
iconutil -c icns "$APP_NAME.iconset"

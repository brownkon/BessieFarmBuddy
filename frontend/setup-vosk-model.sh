#!/bin/bash

# Configuration
MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip"
ZIP_FILE="vosk-model-en-us-0.22-lgraph.zip"
MODEL_DIR="vosk-model-en-us-0.22-lgraph"
TARGET_NAME="model-en-us"

# Directories
FRONTEND_DIR="$(pwd)"
ANDROID_ASSETS_DIR="$FRONTEND_DIR/android/app/src/main/assets"
IOS_DIR="$FRONTEND_DIR/ios"

echo "Step 1: Downloading Vosk Model ($MODEL_URL)..."
if [ ! -f "$ZIP_FILE" ]; then
    curl -L "$MODEL_URL" -o "$ZIP_FILE"
else
    echo "$ZIP_FILE already exists, skipping download."
fi

echo "Step 2: Extracting..."
unzip -o "$ZIP_FILE"

echo "Step 3: Setting up Android Assets..."
mkdir -p "$ANDROID_ASSETS_DIR"
rm -rf "$ANDROID_ASSETS_DIR/$TARGET_NAME"
cp -r "$MODEL_DIR" "$ANDROID_ASSETS_DIR/$TARGET_NAME"

echo "Step 4: Setting up iOS Resources..."
rm -rf "$IOS_DIR/$TARGET_NAME"
cp -r "$MODEL_DIR" "$IOS_DIR/$TARGET_NAME"

# Cleanup
echo "Cleaning up temp files..."
rm -rf "$MODEL_DIR"
# rm "$ZIP_FILE" # Keep the zip just in case for now

echo "Vosk model setup complete. Android and iOS model directories are ready."
echo "Target name: $TARGET_NAME"
echo "Location (Android): $ANDROID_ASSETS_DIR/$TARGET_NAME"
echo "Location (iOS): $IOS_DIR/$TARGET_NAME"

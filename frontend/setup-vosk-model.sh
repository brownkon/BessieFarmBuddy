#!/bin/bash

# Configuration: Smallest stable English model (0.15) (40MB zip / 70MB unzip)
MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
ZIP_FILE="vosk-model-small-en-us-0.15.zip"
MODEL_DIR="vosk-model-small-en-us-0.15"
TARGET_NAME="model-en-us"

# Directories
FRONTEND_DIR="$(pwd)"
ANDROID_ASSETS_DIR="$FRONTEND_DIR/android/app/src/main/assets"
IOS_DIR="$FRONTEND_DIR/ios"

echo "Step 1: Downloading Smallest Vosk Model..."
if [ ! -f "$ZIP_FILE" ]; then
    curl -L "$MODEL_URL" -o "$ZIP_FILE"
else
    echo "$ZIP_FILE already exists, skipping download."
fi

echo "Step 2: Extracting..."
unzip -o "$ZIP_FILE"

echo "Step 3: Updating Root Project Model..."
rm -rf "$FRONTEND_DIR/$TARGET_NAME"
cp -r "$MODEL_DIR" "$FRONTEND_DIR/$TARGET_NAME"

echo "Step 4: Updating Android Assets..."
mkdir -p "$ANDROID_ASSETS_DIR"
rm -rf "$ANDROID_ASSETS_DIR/$TARGET_NAME"
cp -r "$MODEL_DIR" "$ANDROID_ASSETS_DIR/$TARGET_NAME"

echo "Step 5: Updating iOS Resources..."
rm -rf "$IOS_DIR/$TARGET_NAME"
cp -r "$MODEL_DIR" "$IOS_DIR/$TARGET_NAME"

# Cleanup
echo "Cleaning up temp files..."
rm -rf "$MODEL_DIR"
rm "$ZIP_FILE"

echo "Success! Standardized on absolute smallest stable model."
echo "Locations: root/$TARGET_NAME, ios/$TARGET_NAME, and android assets."

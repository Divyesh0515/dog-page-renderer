# 🐾 Paws & Heroes — Image Renderer

Auto image text overlay renderer for Facebook dog pages.

## Features
- Downloads image from Fal.AI URL
- Adds dark gradient overlay at bottom
- Adds bold white headline text
- Adds page watermark
- Returns final JPEG image

## API Endpoint

### POST /render

**Request Body:**
```json
{
  "image_url": "https://fal.ai/...",
  "headline": "THIS DOG SAVED 12 MARINES",
  "page_name": "Paws & Heroes"
}
```

**Response:**
- Returns JPEG image directly

## Deploy on Render.com

1. Push to GitHub
2. Connect to Render.com
3. New Web Service
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Done!

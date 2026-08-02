const express = require("express");
const Jimp = require("jimp");
const axios = require("axios");
const crypto = require("crypto");
const FormData = require("form-data");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

app.get("/", (req, res) => {
  res.json({ status: "Paws & Heroes Renderer v3.0 Running!", version: "3.0.0" });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

async function uploadToCloudinary(imageBuffer) {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signatureString = `timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

  const form = new FormData();
  form.append("file", imageBuffer, { filename: "rendered.jpg", contentType: "image/jpeg" });
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", timestamp);
  form.append("signature", signature);

  const response = await axios.post(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    form,
    { headers: form.getHeaders() }
  );
  return response.data.secure_url;
}

// Draw solid color rectangle
function drawRect(image, x, y, w, h, r, g, b, a) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < image.getWidth() && py >= 0 && py < image.getHeight()) {
        const existing = Jimp.intToRGBA(image.getPixelColor(px, py));
        const blendR = Math.floor(existing.r * (1 - a / 255) + r * (a / 255));
        const blendG = Math.floor(existing.g * (1 - a / 255) + g * (a / 255));
        const blendB = Math.floor(existing.b * (1 - a / 255) + b * (a / 255));
        image.setPixelColor(Jimp.rgbaToInt(blendR, blendG, blendB, 255), px, py);
      }
    }
  }
}

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes", style } = req.body;

    if (!image_url || !headline) {
      return res.status(400).json({ error: "image_url and headline are required" });
    }

    // Auto rotate style 1,2,3
    const styleNum = style || (Math.floor(Date.now() / 1000) % 3) + 1;
    console.log(`Processing style ${styleNum}:`, headline);

    // Download image
    const imageResponse = await axios.get(image_url, { responseType: "arraybuffer" });
    const image = await Jimp.read(Buffer.from(imageResponse.data));

    const W = image.getWidth();
    const H = image.getHeight();

    // BLACK SOLID BAR — bottom 35%
    const barH = Math.floor(H * 0.35);
    const barY = H - barH;
    drawRect(image, 0, barY, W, barH, 0, 0, 0, 255);

    // Load fonts
    const bigFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const medFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    // Split headline into words
    const words = headline.toUpperCase().split(" ");
    const maxW = W - 40;

    // Build lines
    let lines = [];
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      const tw = Jimp.measureText(bigFont, test);
      if (tw <= maxW) {
        currentLine = test;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Limit to 3 lines
    lines = lines.slice(0, 3);

    const lineH = 72;
    const pageNameH = 35;
    const bottomPad = 15;
    const totalTextH = lines.length * lineH + pageNameH + bottomPad;
    let startY = H - totalTextH - 10;

    // =============================================
    // STYLE 1 — White + Orange highlight
    // Key words (first 2) in orange, rest white
    // =============================================
    if (styleNum === 1) {
      // Orange accent words (first 2 words of headline)
      const accentWords = words.slice(0, 2);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWords = line.split(" ");
        const lineW = Jimp.measureText(bigFont, line);
        let curX = Math.floor((W - lineW) / 2);
        const curY = startY + i * lineH;

        for (const w of lineWords) {
          const isAccent = accentWords.includes(w);
          const wW = Jimp.measureText(bigFont, w + " ");

          if (isAccent) {
            // Draw orange color overlay for accent word
            // Since Jimp only has white/black fonts, we draw orange rect then white text
            // We'll use a trick: draw the word position with orange background
            drawRect(image, curX - 2, curY, wW, lineH - 5, 255, 140, 0, 255);
          }
          image.print(bigFont, curX, curY, w);
          curX += wW;
          if (curX < W - 20) {
            image.print(bigFont, curX, curY, " ");
            curX += Jimp.measureText(bigFont, " ");
          }
        }
      }
    }

    // =============================================
    // STYLE 2 — News Style: "NEWS" tag + orange left border
    // =============================================
    else if (styleNum === 2) {
      // NEWS tag
      const newsTagW = 90;
      const newsTagH = 32;
      const newsTagX = 20;
      const newsTagY = barY + 10;
      drawRect(image, newsTagX, newsTagY, newsTagW, newsTagH, 255, 140, 0, 255);
      image.print(smallFont, newsTagX + 8, newsTagY + 8, "NEWS");

      // Orange left border line
      drawRect(image, 20, newsTagY + newsTagH + 8, 5, lines.length * lineH + 10, 255, 140, 0, 255);

      // White text with left border offset
      for (let i = 0; i < lines.length; i++) {
        const curY = newsTagY + newsTagH + 10 + i * lineH;
        image.print(bigFont, 35, curY, lines[i]);
      }

      startY = newsTagY + newsTagH + 10 + lines.length * lineH;
    }

    // =============================================
    // STYLE 3 — White + Cyan highlight
    // Key emotional words in cyan
    // =============================================
    else if (styleNum === 3) {
      const accentWords = words.slice(1, 3); // middle words get cyan

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWords = line.split(" ");
        const lineW = Jimp.measureText(bigFont, line);
        let curX = Math.floor((W - lineW) / 2);
        const curY = startY + i * lineH;

        for (const w of lineWords) {
          const isAccent = accentWords.includes(w);
          const wW = Jimp.measureText(bigFont, w);

          if (isAccent) {
            // Cyan background for accent
            drawRect(image, curX - 2, curY, wW + 4, lineH - 5, 0, 200, 200, 255);
          }
          image.print(bigFont, curX, curY, w);
          curX += wW + Jimp.measureText(bigFont, " ");
        }
      }
    }

    // For style 1 & 3 — print lines normally (already done above with color)
    if (styleNum === 1 || styleNum === 3) {
      // Already printed above with accent colors
    } else if (styleNum === 2) {
      // Already printed above
    }

    // =============================================
    // PAGE NAME — Center Bottom (All styles)
    // =============================================
    const pageNameY = H - pageNameH - bottomPad;
    const pageText = page_name.toUpperCase();
    const pageW = Jimp.measureText(medFont, pageText);
    image.print(medFont, Math.floor((W - pageW) / 2), pageNameY, pageText);

    // Upload to Cloudinary
    const outputBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    console.log("Uploading to Cloudinary...");
    const cloudinaryUrl = await uploadToCloudinary(outputBuffer);
    console.log("✅ Done:", cloudinaryUrl);

    res.json({ success: true, image_url: cloudinaryUrl, style: styleNum });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Render failed", message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐾 Paws & Heroes Renderer v3.0 on port ${PORT}`);
});

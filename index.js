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

app.get("/", (req, res) => res.json({ status: "Renderer v6.0 Running!" }));
app.get("/health", (req, res) => res.json({ status: "OK" }));

async function uploadToCloudinary(buffer) {
  const timestamp = Math.round(Date.now() / 1000);
  const sig = crypto.createHash("sha1")
    .update(`timestamp=${timestamp}${CLOUDINARY_API_SECRET}`)
    .digest("hex");
  const form = new FormData();
  form.append("file", buffer, { filename: "rendered.jpg", contentType: "image/jpeg" });
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("timestamp", timestamp);
  form.append("signature", sig);
  const res = await axios.post(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    form, { headers: form.getHeaders() }
  );
  return res.data.secure_url;
}

// Draw colored rectangle with opacity
function drawRect(image, x, y, w, h, r, g, b, opacity) {
  const imgW = image.getWidth();
  const imgH = image.getHeight();
  const alpha = Math.floor(opacity * 255);
  for (let py = y; py < Math.min(y + h, imgH); py++) {
    for (let px = x; px < Math.min(x + w, imgW); px++) {
      if (px < 0 || py < 0) continue;
      const existing = Jimp.intToRGBA(image.getPixelColor(px, py));
      const blend = (a, b) => Math.floor(a * (1 - opacity) + b * opacity);
      image.setPixelColor(
        Jimp.rgbaToInt(blend(existing.r, r), blend(existing.g, g), blend(existing.b, b), 255),
        px, py
      );
    }
  }
}

// Draw gradient overlay — bottom to top, 0 to 60% opacity
function drawGradient(image) {
  const W = image.getWidth();
  const H = image.getHeight();
  const gradH = Math.floor(H * 0.50);
  const gradStart = H - gradH;

  for (let y = gradStart; y < H; y++) {
    const progress = (y - gradStart) / gradH;
    // Max opacity = 0.60 (60%)
    const opacity = progress * 0.60;
    for (let x = 0; x < W; x++) {
      const px = Jimp.intToRGBA(image.getPixelColor(x, y));
      const blend = (c) => Math.floor(c * (1 - opacity));
      image.setPixelColor(
        Jimp.rgbaToInt(blend(px.r), blend(px.g), blend(px.b), 255),
        x, y
      );
    }
  }
}

// Smart font selection
async function getSmartFont(text, maxWidth) {
  const sizes = [
    { font: await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE), lineH: 75 },
    { font: await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE), lineH: 40 },
    { font: await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE), lineH: 24 },
  ];

  for (const f of sizes) {
    const words = text.split(" ");
    let lines = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (Jimp.measureText(f.font, test) <= maxWidth) {
        cur = test;
      } else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);

    const allFit = lines.every(l => Jimp.measureText(f.font, l) <= maxWidth);
    if (allFit && lines.length <= 4) return { ...f, lines };
  }

  const fallback = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  return { font: fallback, lineH: 24, lines: [text.substring(0, 35)] };
}

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes", style } = req.body;
    if (!image_url || !headline) return res.status(400).json({ error: "Missing fields" });

    const styleNum = style || (Math.floor(Date.now() / 1000) % 3) + 1;
    console.log(`Style ${styleNum}:`, headline);

    // Load image
    const imgRes = await axios.get(image_url, { responseType: "arraybuffer" });
    const image = await Jimp.read(Buffer.from(imgRes.data));
    const W = image.getWidth();
    const H = image.getHeight();

    // =============================================
    // GRADIENT OVERLAY — 60% max opacity
    // =============================================
    drawGradient(image);

    // =============================================
    // SMART FONT
    // =============================================
    const maxTextW = W - 40;
    const { font, lineH, lines } = await getSmartFont(headline.toUpperCase(), maxTextW);
    const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const medFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);

    const pageNameH = 38;
    const bottomPad = 20;
    const totalH = lines.length * lineH + pageNameH + bottomPad;
    const textStartY = H - totalH - 15;

    const words = headline.toUpperCase().split(" ");

    // =============================================
    // STYLE 1 — White + Orange highlight
    // =============================================
    if (styleNum === 1) {
      const accentWords = words.slice(0, 2);
      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        const lineW = Jimp.measureText(font, lines[i]);
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH;
        for (const w of lineWords) {
          const wW = Jimp.measureText(font, w);
          const spW = Jimp.measureText(font, " ");
          if (accentWords.includes(w)) {
            drawRect(image, curX - 3, curY + 4, wW + 6, lineH - 8, 255, 130, 0, 0.95);
          }
          image.print(font, curX, curY, w);
          curX += wW + spW;
        }
      }
    }

    // =============================================
    // STYLE 2 — NEWS tag + Orange border
    // =============================================
    else if (styleNum === 2) {
      const leftPad = 20;
      const newsTagH = 28;
      const newsTagW = 85;
      const newsTagY = textStartY - newsTagH - 8;

      // NEWS orange tag
      drawRect(image, leftPad, newsTagY, newsTagW, newsTagH, 255, 130, 0, 0.95);
      image.print(smallFont, leftPad + 8, newsTagY + 6, "NEWS");

      // Orange left border
      drawRect(image, leftPad, textStartY, 5, lines.length * lineH + 8, 255, 130, 0, 0.95);

      // Text
      for (let i = 0; i < lines.length; i++) {
        image.print(font, leftPad + 15, textStartY + i * lineH, lines[i]);
      }
    }

    // =============================================
    // STYLE 3 — White + Cyan highlight
    // =============================================
    else if (styleNum === 3) {
      const accentWords = words.slice(1, 3);
      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        const lineW = Jimp.measureText(font, lines[i]);
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH;
        for (const w of lineWords) {
          const wW = Jimp.measureText(font, w);
          const spW = Jimp.measureText(font, " ");
          if (accentWords.includes(w)) {
            drawRect(image, curX - 3, curY + 4, wW + 6, lineH - 8, 0, 210, 210, 0.95);
          }
          image.print(font, curX, curY, w);
          curX += wW + spW;
        }
      }
    }

    // =============================================
    // PAGE NAME — Center Bottom
    // =============================================
    const pageW = Jimp.measureText(medFont, page_name);
    image.print(medFont, Math.floor((W - pageW) / 2), H - pageNameH - bottomPad + 10, page_name);

    // Upload
    const buffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    const url = await uploadToCloudinary(buffer);
    console.log("✅ Done:", url);
    res.json({ success: true, image_url: url, style: styleNum });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🐾 Renderer v6.0 on port ${PORT}`));

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
  res.json({ status: "Paws & Heroes Renderer v4.0 Running!" });
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

function drawRect(image, x, y, w, h, r, g, b, a) {
  const imgW = image.getWidth();
  const imgH = image.getHeight();
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      if (px >= 0 && px < imgW && py >= 0 && py < imgH) {
        const existing = Jimp.intToRGBA(image.getPixelColor(px, py));
        const blendR = Math.floor(existing.r * (1 - a / 255) + r * (a / 255));
        const blendG = Math.floor(existing.g * (1 - a / 255) + g * (a / 255));
        const blendB = Math.floor(existing.b * (1 - a / 255) + b * (a / 255));
        image.setPixelColor(Jimp.rgbaToInt(blendR, blendG, blendB, 255), px, py);
      }
    }
  }
}

// =============================================
// SMART FONT SELECTOR — Auto fit text
// =============================================
async function getSmartFont(text, maxWidth) {
  // Try fonts from biggest to smallest
  const fonts = [
    { font: await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE), size: 64, lineH: 72 },
    { font: await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE), size: 32, lineH: 40 },
    { font: await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE), size: 16, lineH: 24 },
  ];

  for (const f of fonts) {
    const words = text.split(" ");
    let maxLineW = 0;
    let currentLine = "";
    let lines = [];

    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      const tw = Jimp.measureText(f.font, test);
      if (tw <= maxWidth) {
        currentLine = test;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    // Check all lines fit
    let allFit = true;
    for (const line of lines) {
      const lw = Jimp.measureText(f.font, line);
      if (lw > maxWidth) { allFit = false; break; }
    }

    if (allFit && lines.length <= 4) {
      return { ...f, lines };
    }
  }

  // Fallback — smallest font
  const fallbackFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
  return {
    font: fallbackFont,
    size: 16,
    lineH: 24,
    lines: [text.substring(0, 40)]
  };
}

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes", style } = req.body;

    if (!image_url || !headline) {
      return res.status(400).json({ error: "image_url and headline are required" });
    }

    const styleNum = style || (Math.floor(Date.now() / 1000) % 3) + 1;
    console.log(`Style ${styleNum}:`, headline);

    // Download + load image
    const imageResponse = await axios.get(image_url, { responseType: "arraybuffer" });
    const image = await Jimp.read(Buffer.from(imageResponse.data));
    const W = image.getWidth();
    const H = image.getHeight();

    // GRADIENT OVERLAY — bottom 45% with 40% opacity
const gradH = Math.floor(H * 0.45);
const gradStart = H - gradH;
for (let y = gradStart; y < H; y++) {
  const progress = (y - gradStart) / gradH;
  const alpha = Math.floor(progress * 102); // 40% opacity max = 102/255
  for (let x = 0; x < W; x++) {
    const pixel = image.getPixelColor(x, y);
    const rgba = Jimp.intToRGBA(pixel);
    const newR = Math.floor(rgba.r * (1 - progress * 0.85));
    const newG = Math.floor(rgba.g * (1 - progress * 0.85));
    const newB = Math.floor(rgba.b * (1 - progress * 0.85));
    image.setPixelColor(
      Jimp.rgbaToInt(newR, newG, newB, rgba.a), x, y
    );
  }
}
const barY = gradStart;
const barH = gradH;

    // SMART FONT — auto size to fit
    const maxTextW = W - 30;
    const headlineUpper = headline.toUpperCase();
    const { font, lineH, lines } = await getSmartFont(headlineUpper, maxTextW);

    // Small fonts for page name
    const pageFont = await Jimp.loadFont(Jimp.FONT_SANS_32_WHITE);
    const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    const pageNameH = 40;
    const bottomPad = 20;
    const totalTextH = lines.length * lineH + pageNameH + bottomPad;
    const textStartY = barY + Math.floor((barH - totalTextH) / 2);

    const words = headlineUpper.split(" ");

    // =============================================
    // STYLE 1 — White + Orange highlight
    // =============================================
    if (styleNum === 1) {
      const accentWords = words.slice(0, 2);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWords = line.split(" ");
        const lineW = Jimp.measureText(font, line);
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH;

        for (const w of lineWords) {
          const isAccent = accentWords.includes(w);
          const wW = Jimp.measureText(font, w);
          const spaceW = Jimp.measureText(font, " ");

          if (isAccent) {
            drawRect(image, curX - 2, curY + 4, wW + 4, lineH - 8, 255, 130, 0, 255);
          }
          image.print(font, curX, curY, w);
          curX += wW + spaceW;
        }
      }
    }

    // =============================================
    // STYLE 2 — News tag + Orange left border
    // =============================================
    else if (styleNum === 2) {
      const newsTagW = 85;
      const newsTagH = 28;
      const leftPad = 20;
      const newsTagY = barY + 12;

      // NEWS tag
      drawRect(image, leftPad, newsTagY, newsTagW, newsTagH, 255, 130, 0, 255);
      image.print(smallFont, leftPad + 8, newsTagY + 6, "NEWS");

      // Orange left border
      const borderY = newsTagY + newsTagH + 6;
      const borderH = lines.length * lineH + 10;
      drawRect(image, leftPad, borderY, 5, borderH, 255, 130, 0, 255);

      // Text lines
      for (let i = 0; i < lines.length; i++) {
        const curY = borderY + 5 + i * lineH;
        image.print(font, leftPad + 15, curY, lines[i]);
      }
    }

    // =============================================
    // STYLE 3 — White + Cyan highlight
    // =============================================
    else if (styleNum === 3) {
      const accentWords = words.slice(1, 3);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineWords = line.split(" ");
        const lineW = Jimp.measureText(font, line);
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH;

        for (const w of lineWords) {
          const isAccent = accentWords.includes(w);
          const wW = Jimp.measureText(font, w);
          const spaceW = Jimp.measureText(font, " ");

          if (isAccent) {
            drawRect(image, curX - 2, curY + 4, wW + 4, lineH - 8, 0, 210, 210, 255);
          }
          image.print(font, curX, curY, w);
          curX += wW + spaceW;
        }
      }
    }

    // =============================================
    // PAGE NAME — Center Bottom (All styles)
    // =============================================
    const pageText = page_name.toUpperCase();
    const pageW = Jimp.measureText(pageFont, pageText);
    const pageY = H - pageNameH - bottomPad + 10;
    image.print(pageFont, Math.floor((W - pageW) / 2), pageY, pageText);

    // Upload to Cloudinary
    const outputBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);
    const cloudinaryUrl = await uploadToCloudinary(outputBuffer);
    console.log("✅ Done:", cloudinaryUrl);

    res.json({ success: true, image_url: cloudinaryUrl, style: styleNum });

  } catch (error) {
    console.error("❌ Error:", error.message);
    res.status(500).json({ error: "Render failed", message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🐾 Renderer v4.0 on port ${PORT}`);
});

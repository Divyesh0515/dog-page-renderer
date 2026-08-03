const express = require("express");
const { createCanvas, loadImage, registerFont } = require("canvas");
const axios = require("axios");
const crypto = require("crypto");
const FormData = require("form-data");
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Download fonts on startup
async function downloadFont(url, dest) {
  if (fs.existsSync(dest)) return;
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", reject);
  });
}

async function setupFonts() {
  const fontsDir = path.join(__dirname, "fonts");
  if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir);

  const bebasUrl = "https://github.com/googlefonts/BebasNeue/raw/main/fonts/ttf/BebasNeue-Regular.ttf";
  const poppinsUrl = "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-Bold.ttf";

  const bebasPath = path.join(fontsDir, "BebasNeue.ttf");
  const poppinsPath = path.join(fontsDir, "Poppins-Bold.ttf");

  try {
    await downloadFont(bebasUrl, bebasPath);
    await downloadFont(poppinsUrl, poppinsPath);
    registerFont(bebasPath, { family: "BebasNeue" });
    registerFont(poppinsPath, { family: "Poppins" });
    console.log("✅ Fonts loaded!");
  } catch (e) {
    console.log("⚠️ Font download failed, using fallback:", e.message);
  }
}

setupFonts();

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

app.get("/", (req, res) => res.json({ status: "Renderer v5.0 Running!" }));
app.get("/health", (req, res) => res.json({ status: "OK" }));

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes", style } = req.body;
    if (!image_url || !headline) return res.status(400).json({ error: "Missing fields" });

    const styleNum = style || (Math.floor(Date.now() / 1000) % 3) + 1;

    // Load image
    const imgResponse = await axios.get(image_url, { responseType: "arraybuffer" });
    const srcImage = await loadImage(Buffer.from(imgResponse.data));

    const W = srcImage.width;
    const H = srcImage.height;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Draw original image
    ctx.drawImage(srcImage, 0, 0, W, H);

    // =============================================
    // GRADIENT OVERLAY — Bottom 42%
    // =============================================
    const gradH = Math.floor(H * 0.42);
    const gradY = H - gradH;
    const gradient = ctx.createLinearGradient(0, gradY, 0, H);
    gradient.addColorStop(0, "rgba(0,0,0,0)");
    gradient.addColorStop(0.4, "rgba(0,0,0,0.7)");
    gradient.addColorStop(1, "rgba(0,0,0,0.92)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, gradY, W, gradH);

    // =============================================
    // FONTS
    // =============================================
    const headlineSize = Math.floor(W * 0.085);
    const watermarkSize = Math.floor(W * 0.038);
    const newsTagSize = Math.floor(W * 0.032);

    // =============================================
    // STYLE 1 — Orange + White (Puppie Lovers Club)
    // =============================================
    const headlineUpper = headline.toUpperCase();
    const words = headlineUpper.split(" ");

    // Text area
    const textPadding = Math.floor(W * 0.05);
    const textMaxW = W - textPadding * 2;
    const lineH = Math.floor(headlineSize * 1.15);
    const pageNameH = Math.floor(watermarkSize * 2);
    const bottomPad = Math.floor(H * 0.03);

    // Wrap text
    ctx.font = `${headlineSize}px BebasNeue, Arial Black`;
    let lines = [];
    let currentLine = "";
    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width <= textMaxW) {
        currentLine = test;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
    lines = lines.slice(0, 3);

    const totalTextH = lines.length * lineH + pageNameH + bottomPad + 20;
    const textStartY = H - totalTextH - bottomPad;

    if (styleNum === 1) {
      // STYLE 1: White + Orange highlight words
      const accentWords = words.slice(0, 2);
      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        const lineW = ctx.measureText(lines[i]).width;
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH + headlineSize;

        for (const w of lineWords) {
          const wW = ctx.measureText(w).width;
          const spW = ctx.measureText(" ").width;

          if (accentWords.includes(w)) {
            // Orange background
            ctx.fillStyle = "rgba(255, 130, 0, 0.95)";
            ctx.fillRect(curX - 4, curY - headlineSize + 4, wW + 8, headlineSize + 4);
            ctx.fillStyle = "#FFFFFF";
          } else {
            ctx.fillStyle = "#FFFFFF";
          }

          // Text shadow
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 8;
          ctx.shadowOffsetX = 2;
          ctx.shadowOffsetY = 2;
          ctx.font = `${headlineSize}px BebasNeue, Arial Black`;
          ctx.fillText(w, curX, curY);
          ctx.shadowBlur = 0;
          curX += wW + spW;
        }
      }
    }

    else if (styleNum === 2) {
      // STYLE 2: News tag + Orange border
      const newsTagW = Math.floor(W * 0.16);
      const newsTagH = Math.floor(H * 0.038);
      const leftPad = Math.floor(W * 0.05);
      const newsTagY = textStartY - newsTagH - 8;

      // NEWS tag
      ctx.fillStyle = "rgba(255, 130, 0, 0.95)";
      ctx.fillRect(leftPad, newsTagY, newsTagW, newsTagH);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${newsTagSize}px Poppins, Arial`;
      ctx.fillText("NEWS", leftPad + 8, newsTagY + newsTagH - 6);

      // Orange left border
      ctx.fillStyle = "rgba(255, 130, 0, 0.95)";
      ctx.fillRect(leftPad, textStartY, 5, lines.length * lineH);

      // White text
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `${headlineSize}px BebasNeue, Arial Black`;
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 8;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], leftPad + 15, textStartY + i * lineH + headlineSize);
      }
      ctx.shadowBlur = 0;
    }

    else if (styleNum === 3) {
      // STYLE 3: White + Cyan highlight
      const accentWords = words.slice(1, 3);
      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        const lineW = ctx.measureText(lines[i]).width;
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH + headlineSize;

        ctx.font = `${headlineSize}px BebasNeue, Arial Black`;
        for (const w of lineWords) {
          const wW = ctx.measureText(w).width;
          const spW = ctx.measureText(" ").width;

          if (accentWords.includes(w)) {
            ctx.fillStyle = "rgba(0, 210, 210, 0.95)";
            ctx.fillRect(curX - 4, curY - headlineSize + 4, wW + 8, headlineSize + 4);
            ctx.fillStyle = "#FFFFFF";
          } else {
            ctx.fillStyle = "#FFFFFF";
          }

          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 8;
          ctx.fillText(w, curX, curY);
          ctx.shadowBlur = 0;
          curX += wW + spW;
        }
      }
    }

    // =============================================
    // PAGE NAME — Poppins, Center Bottom
    // =============================================
    ctx.font = `${watermarkSize}px Poppins, Arial`;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    const pageW = ctx.measureText(page_name).width;
    ctx.fillText(page_name, Math.floor((W - pageW) / 2), H - bottomPad);
    ctx.shadowBlur = 0;

    // Export
    const buffer = canvas.toBuffer("image/jpeg", { quality: 0.92 });
    const url = await uploadToCloudinary(buffer);
    res.json({ success: true, image_url: url, style: styleNum });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🐾 Renderer v5.0 on port ${PORT}`));

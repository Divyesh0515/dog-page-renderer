const express = require("express");
const { createCanvas, registerFont, loadImage } = require("@napi-rs/canvas");
const axios = require("axios");
const crypto = require("crypto");
const FormData = require("form-data");
const path = require("path");

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Register fonts from fonts/ folder
try {
  registerFont(path.join(__dirname, "fonts", "impact.ttf"), { family: "Impact" });
  registerFont(path.join(__dirname, "fonts", "BebasNeue-Regular.ttf"), { family: "BebasNeue" });
  registerFont(path.join(__dirname, "fonts", "Poppins-ExtraBold.ttf"), { family: "Poppins" });
  console.log("✅ Fonts loaded!");
} catch (e) {
  console.log("⚠️ Font error:", e.message);
}

app.get("/", (req, res) => res.json({ status: "Renderer v7.0 Running!" }));
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

// Wrap text into lines
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      cur = test;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

// Auto font size
function getAutoFontSize(ctx, text, maxWidth, maxSize, minSize, fontFamily) {
  for (let size = maxSize; size >= minSize; size -= 4) {
    ctx.font = `${size}px ${fontFamily}`;
    const words = text.split(" ");
    let fits = true;
    let cur = "";
    let lineCount = 0;
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width <= maxWidth) {
        cur = test;
      } else {
        lineCount++;
        cur = w;
        if (lineCount > 3) { fits = false; break; }
      }
    }
    if (fits) return size;
  }
  return minSize;
}

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes", style } = req.body;
    if (!image_url || !headline) return res.status(400).json({ error: "Missing fields" });

    const styleNum = style || (Math.floor(Date.now() / 1000) % 3) + 1;
    console.log(`Style ${styleNum}:`, headline);

    // Load image
    const imgRes = await axios.get(image_url, { responseType: "arraybuffer" });
    const srcImg = await loadImage(Buffer.from(imgRes.data));

    const W = srcImg.width;
    const H = srcImg.height;

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");

    // Draw image
    ctx.drawImage(srcImg, 0, 0, W, H);

    // =============================================
    // GRADIENT OVERLAY — 0% to 60% opacity
    // =============================================
    const gradH = Math.floor(H * 0.50);
    const gradY = H - gradH;
    const grad = ctx.createLinearGradient(0, gradY, 0, H);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.45, "rgba(0,0,0,0.40)");
    grad.addColorStop(1, "rgba(0,0,0,0.60)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, gradY, W, gradH);

    // =============================================
    // AUTO FONT SIZE
    // =============================================
    const textMaxW = W - 50;
    const fontSize = getAutoFontSize(ctx, headline.toUpperCase(), textMaxW, Math.floor(W * 0.12), Math.floor(W * 0.05), "Impact");
    const lineH = Math.floor(fontSize * 1.12);

    ctx.font = `${fontSize}px Impact`;
    const lines = wrapText(ctx, headline.toUpperCase(), textMaxW);

    const pageNameSize = Math.floor(W * 0.038);
    const bottomPad = Math.floor(H * 0.035);
    const totalTextH = lines.length * lineH + pageNameSize + bottomPad + 10;
    const textStartY = H - totalTextH - Math.floor(H * 0.02);

    const words = headline.toUpperCase().split(" ");

    // =============================================
    // STYLE 1 — White + Orange (Canine Journal style)
    // =============================================
    if (styleNum === 1) {
      const accentWords = words.slice(0, 3);

      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        ctx.font = `${fontSize}px Impact`;
        const lineW = ctx.measureText(lines[i]).width;
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH + fontSize;

        for (const w of lineWords) {
          const wW = ctx.measureText(w).width;
          const spW = ctx.measureText(" ").width;

          if (accentWords.includes(w)) {
            ctx.fillStyle = "#FF8C00";
          } else {
            ctx.fillStyle = "#FFFFFF";
          }

          // Text shadow
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 3;
          ctx.shadowOffsetY = 3;
          ctx.fillText(w, curX, curY);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          curX += wW + spW;
        }
      }
    }

    // =============================================
    // STYLE 2 — NEWS tag + Orange border
    // =============================================
    else if (styleNum === 2) {
      const leftPad = Math.floor(W * 0.05);
      const newsSize = Math.floor(W * 0.032);
      const newsTagH = Math.floor(newsSize * 1.6);
      const newsTagW = Math.floor(newsSize * 3.2);
      const newsTagY = textStartY - newsTagH - 10;

      // Orange NEWS tag
      ctx.fillStyle = "#FF8C00";
      ctx.fillRect(leftPad, newsTagY, newsTagW, newsTagH);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold ${newsSize}px Poppins, Arial`;
      ctx.fillText("NEWS", leftPad + 6, newsTagY + newsTagH - 6);

      // Orange left border
      ctx.fillStyle = "#FF8C00";
      ctx.fillRect(leftPad, textStartY, 5, lines.length * lineH + 5);

      // White text
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `${fontSize}px Impact`;
      ctx.shadowColor = "rgba(0,0,0,0.9)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetX = 3;
      ctx.shadowOffsetY = 3;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], leftPad + 15, textStartY + i * lineH + fontSize);
      }
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // =============================================
    // STYLE 3 — White + Cyan
    // =============================================
    else if (styleNum === 3) {
      const accentWords = words.slice(1, 4);

      for (let i = 0; i < lines.length; i++) {
        const lineWords = lines[i].split(" ");
        ctx.font = `${fontSize}px Impact`;
        const lineW = ctx.measureText(lines[i]).width;
        let curX = Math.floor((W - lineW) / 2);
        const curY = textStartY + i * lineH + fontSize;

        for (const w of lineWords) {
          const wW = ctx.measureText(w).width;
          const spW = ctx.measureText(" ").width;

          ctx.fillStyle = accentWords.includes(w) ? "#00D2D2" : "#FFFFFF";
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetX = 3;
          ctx.shadowOffsetY = 3;
          ctx.fillText(w, curX, curY);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          curX += wW + spW;
        }
      }
    }

    // =============================================
    // PAGE NAME — Poppins, Center Bottom
    // =============================================
    ctx.font = `${pageNameSize}px Poppins, Arial`;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 6;
    const pageW = ctx.measureText(page_name).width;
    ctx.fillText(page_name, Math.floor((W - pageW) / 2), H - bottomPad);
    ctx.shadowBlur = 0;

    // Export & Upload
    const buffer = canvas.toBuffer("image/jpeg");
    const url = await uploadToCloudinary(buffer);
    console.log("✅ Done:", url);
    res.json({ success: true, image_url: url, style: styleNum });

  } catch (err) {
    console.error("❌ Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🐾 Renderer v7.0 on port ${PORT}`));

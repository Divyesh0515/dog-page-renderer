const express = require("express");
const Jimp = require("jimp");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =============================================
// PAWS & HEROES — IMAGE RENDERER
// =============================================

app.get("/", (req, res) => {
  res.json({
    status: "Paws & Heroes Renderer Running!",
    endpoint: "POST /render",
    version: "1.0.0",
  });
});

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes" } = req.body;

    // Validate inputs
    if (!image_url || !headline) {
      return res.status(400).json({
        error: "image_url and headline are required",
      });
    }

    console.log("Processing:", { image_url, headline, page_name });

    // =============================================
    // STEP 1: Download image from Fal.AI
    // =============================================
    const imageResponse = await axios.get(image_url, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // =============================================
    // STEP 2: Load image with Jimp
    // =============================================
    const image = await Jimp.read(imageBuffer);
    const imgWidth = image.getWidth();
    const imgHeight = image.getHeight();

    // =============================================
    // STEP 3: Add dark gradient overlay (bottom)
    // =============================================
    const gradientHeight = Math.floor(imgHeight * 0.45);
    const gradientStart = imgHeight - gradientHeight;

    for (let y = gradientStart; y < imgHeight; y++) {
      const progress = (y - gradientStart) / gradientHeight;
      const alpha = Math.floor(progress * 210);

      for (let x = 0; x < imgWidth; x++) {
        const pixel = image.getPixelColor(x, y);
        const rgba = Jimp.intToRGBA(pixel);

        const newR = Math.floor(rgba.r * (1 - progress * 0.7));
        const newG = Math.floor(rgba.g * (1 - progress * 0.7));
        const newB = Math.floor(rgba.b * (1 - progress * 0.7));

        image.setPixelColor(
          Jimp.rgbaToInt(newR, newG, newB, rgba.a),
          x,
          y
        );
      }
    }

    // =============================================
    // STEP 4: Load fonts
    // =============================================
    const headlineFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const watermarkFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    // =============================================
    // STEP 5: Add Headline Text
    // =============================================
    const headlineUpper = headline.toUpperCase();
    const words = headlineUpper.split(" ");
    const maxWidth = imgWidth - 40;

    // Split headline into 2 lines
    let line1 = "";
    let line2 = "";
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const textWidth = Jimp.measureText(headlineFont, testLine);

      if (textWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (!line1) {
          line1 = currentLine;
          currentLine = word;
        } else {
          line2 = currentLine + (currentLine ? " " : "") + word;
          currentLine = "";
        }
      }
    }

    if (currentLine) {
      if (!line1) {
        line1 = currentLine;
      } else {
        line2 = line2
          ? line2 + " " + currentLine
          : currentLine;
      }
    }

    // Calculate text positions
    const lineHeight = 70;
    const watermarkHeight = 30;
    const bottomPadding = 20;
    const watermarkY = imgHeight - watermarkHeight - bottomPadding;
    const line2Y = watermarkY - lineHeight - 10;
    const line1Y = line2 ? line2Y - lineHeight - 5 : line2Y;

    // Draw headline line 1
    const line1Width = Jimp.measureText(headlineFont, line1);
    const line1X = (imgWidth - line1Width) / 2;
    image.print(headlineFont, line1X, line1Y, line1);

    // Draw headline line 2 (if exists)
    if (line2) {
      const line2Width = Jimp.measureText(headlineFont, line2);
      const line2X = (imgWidth - line2Width) / 2;
      image.print(headlineFont, line2X, line2Y, line2);
    }

    // =============================================
    // STEP 6: Add Watermark — "Paws & Heroes 🐾"
    // =============================================
    const watermarkText = `🐾 ${page_name.toUpperCase()}`;
    const watermarkWidth = Jimp.measureText(watermarkFont, watermarkText);
    const watermarkX = imgWidth - watermarkWidth - 15;
    image.print(watermarkFont, watermarkX, watermarkY, watermarkText);

    // =============================================
    // STEP 7: Convert to buffer and return
    // =============================================
    const outputBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    res.set("Content-Type", "image/jpeg");
    res.set("Content-Disposition", "inline; filename=rendered.jpg");
    res.send(outputBuffer);

    console.log("✅ Image rendered successfully!");
  } catch (error) {
    console.error("❌ Render error:", error.message);
    res.status(500).json({
      error: "Render failed",
      message: error.message,
    });
  }
});

// =============================================
// HEALTH CHECK
// =============================================
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🐾 Paws & Heroes Renderer running on port ${PORT}`);
});

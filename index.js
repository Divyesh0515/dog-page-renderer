const express = require("express");
const Jimp = require("jimp");
const axios = require("axios");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Cloudinary config from env
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

app.get("/", (req, res) => {
  res.json({
    status: "Paws & Heroes Renderer Running!",
    endpoint: "POST /render",
    version: "2.0.0",
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Upload to Cloudinary using signed upload
async function uploadToCloudinary(imageBuffer) {
  const crypto = require("crypto");
  const timestamp = Math.round(new Date().getTime() / 1000);
  
  // Create signature
  const signatureString = `timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash("sha1").update(signatureString).digest("hex");

  const FormData = require("form-data");
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

app.post("/render", async (req, res) => {
  try {
    const { image_url, headline, page_name = "Paws & Heroes" } = req.body;

    if (!image_url || !headline) {
      return res.status(400).json({
        error: "image_url and headline are required",
      });
    }

    console.log("Processing:", { image_url, headline, page_name });

    // STEP 1: Download image
    const imageResponse = await axios.get(image_url, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // STEP 2: Load with Jimp
    const image = await Jimp.read(imageBuffer);
    const imgWidth = image.getWidth();
    const imgHeight = image.getHeight();

    // STEP 3: Dark gradient overlay bottom
    const gradientHeight = Math.floor(imgHeight * 0.45);
    const gradientStart = imgHeight - gradientHeight;

    for (let y = gradientStart; y < imgHeight; y++) {
      const progress = (y - gradientStart) / gradientHeight;
      for (let x = 0; x < imgWidth; x++) {
        const pixel = image.getPixelColor(x, y);
        const rgba = Jimp.intToRGBA(pixel);
        const newR = Math.floor(rgba.r * (1 - progress * 0.75));
        const newG = Math.floor(rgba.g * (1 - progress * 0.75));
        const newB = Math.floor(rgba.b * (1 - progress * 0.75));
        image.setPixelColor(Jimp.rgbaToInt(newR, newG, newB, rgba.a), x, y);
      }
    }

    // STEP 4: Load fonts
    const headlineFont = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
    const watermarkFont = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    // STEP 5: Headline text
    const headlineUpper = headline.toUpperCase();
    const words = headlineUpper.split(" ");
    const maxWidth = imgWidth - 60;

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
          line2 = line2 ? line2 + " " + word : currentLine + " " + word;
          currentLine = "";
        }
      }
    }
    if (currentLine) {
      if (!line1) line1 = currentLine;
      else line2 = line2 ? line2 + " " + currentLine : currentLine;
    }

    const lineHeight = 72;
    const bottomPadding = 25;
    const watermarkH = 25;
    const watermarkY = imgHeight - watermarkH - bottomPadding;
    const line2Y = watermarkY - lineHeight - 10;
    const line1Y = line2 ? line2Y - lineHeight - 5 : line2Y;

    // Draw lines centered
    const l1W = Jimp.measureText(headlineFont, line1);
    image.print(headlineFont, Math.floor((imgWidth - l1W) / 2), line1Y, line1);

    if (line2) {
      const l2W = Jimp.measureText(headlineFont, line2);
      image.print(headlineFont, Math.floor((imgWidth - l2W) / 2), line2Y, line2);
    }

    // STEP 6: Watermark
    const watermarkText = `PAWS & HEROES`;
    const wW = Jimp.measureText(watermarkFont, watermarkText);
    image.print(watermarkFont, imgWidth - wW - 15, watermarkY, watermarkText);

    // STEP 7: Get buffer
    const outputBuffer = await image.getBufferAsync(Jimp.MIME_JPEG);

    // STEP 8: Upload to Cloudinary
    console.log("Uploading to Cloudinary...");
    const cloudinaryUrl = await uploadToCloudinary(outputBuffer);
    console.log("✅ Cloudinary URL:", cloudinaryUrl);

    // STEP 9: Return URL
    res.json({
      success: true,
      image_url: cloudinaryUrl,
    });

  } catch (error) {
    console.error("❌ Render error:", error.message);
    res.status(500).json({
      error: "Render failed",
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`🐾 Paws & Heroes Renderer v2.0 running on port ${PORT}`);
});

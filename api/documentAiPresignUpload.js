import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { filename, type, size } = req.body;

    if (!filename || !type || size == null) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate MIME types and Sizes
    const allowedTypes = {
      "image/jpeg": 20 * 1024 * 1024, // 20MB
      "image/png": 20 * 1024 * 1024,
      "image/webp": 20 * 1024 * 1024,
      "application/pdf": 30 * 1024 * 1024, // 30MB
      "text/plain": 2 * 1024 * 1024, // 2MB
    };

    if (!allowedTypes[type]) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    if (size > allowedTypes[type]) {
      return res.status(400).json({ error: "File exceeds maximum allowed size" });
    }

    // Safe filename and Key generation
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const randomId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    const date = new Date();
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    
    const fileKey = `tmp/document-ai/${year}/${month}/${day}/${randomId}-${safeFilename}`;

    const s3Client = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT_URL,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: type,
    });

    const expiresIn = 60; // 60 seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return res.status(200).json({
      uploadUrl,
      fileKey,
      name: filename,
      type,
      size,
      expiresIn
    });
  } catch (error) {
    console.error("Presign upload error:", error.message || error);
    return res.status(500).json({ error: "Failed to generate presigned URL" });
  }
}

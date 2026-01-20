import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload file to S3
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - Original file name
 * @param {string} mimetype - File MIME type
 * @param {string} folder - S3 folder path
 * @param {string} vendorId - Vendor ID for organization
 * @returns {Promise<string>} - S3 object key
 */
export async function uploadToS3(fileBuffer, fileName, mimetype, folder, vendorId) {
  try {
    // Sanitize filename
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const timestamp = Date.now();
    const key = `${folder}/vendor-${vendorId}/${timestamp}-${sanitizedFileName}`;

    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimetype,
      // Optional: Add metadata
      Metadata: {
        vendorId: vendorId.toString(),
        uploadedAt: timestamp.toString(),
      },
    };

    await s3Client.send(new PutObjectCommand(uploadParams));
    
    // Return the S3 key (not full URL)
    return key;
  } catch (error) {
    console.error("S3 Upload Error:", error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
}

/**
 * Generate presigned URL for secure file access
 * @param {string} key - S3 object key
 * @param {number} expiresIn - URL expiry in seconds (default: 3600 = 1 hour)
 * @returns {Promise<string>} - Presigned URL
 */
export async function generatePresignedUrl(key, expiresIn = 3600) {
  try {
    if (!key) return null;

    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return null;
  }
}

/**
 * Generate public URL (if bucket is public)
 * @param {string} key - S3 object key
 * @returns {string} - Public URL
 */
export function getPublicUrl(key) {
  if (!key) return null;
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

export { s3Client, BUCKET_NAME };
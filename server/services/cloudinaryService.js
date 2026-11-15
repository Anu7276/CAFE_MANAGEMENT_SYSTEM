/**
 * Cloudinary Storage & Asset Management Service
 * Provides upload and asset deletion for menu items.
 * Falls back to local disk storage in development when Cloudinary is not configured.
 */

const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary if credentials are present
const isCloudinaryConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

/**
 * Upload an uploaded multer file to Cloudinary or return local path
 * @param {Express.Multer.File} file 
 * @returns {Promise<{ url: string, publicId: string | null }>}
 */
async function uploadItemImage(file) {
  if (!file) {
    return { url: null, publicId: null };
  }

  // If in production or Cloudinary credentials are provided, upload to Cloudinary
  if (isCloudinaryConfigured || (process.env.NODE_ENV === 'production' && isCloudinaryConfigured)) {
    try {
      const uploadResult = await cloudinary.uploader.upload(file.path, {
        folder: 'cafe_emerald/items',
        use_filename: true,
        unique_filename: true,
        resource_type: 'image',
        transformation: [
          { width: 1000, height: 1000, crop: 'limit' },
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      });

      // Remove temporary file from local disk after successful cloud upload
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id
      };
    } catch (err) {
      console.error('Cloudinary upload failed:', err.message);
      // Fallback to local file path if Cloudinary fails
      return {
        url: `/uploads/${file.filename}`,
        publicId: null
      };
    }
  }

  // Local development fallback
  return {
    url: `/uploads/${file.filename}`,
    publicId: null
  };
}

/**
 * Delete an old item asset from Cloudinary or local disk
 * @param {string} imageUrl 
 * @param {string} [publicId] 
 */
async function deleteItemImage(imageUrl, publicId) {
  if (!imageUrl && !publicId) return;

  // 1. Delete from Cloudinary if publicId exists or URL is a Cloudinary URL
  if (isCloudinaryConfigured && (publicId || (imageUrl && imageUrl.includes('res.cloudinary.com')))) {
    try {
      let targetId = publicId;
      if (!targetId && imageUrl) {
        // Extract public ID from Cloudinary URL: .../upload/v1234/cafe_emerald/items/xyz.jpg
        const matches = imageUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
        if (matches && matches[1]) {
          targetId = matches[1];
        }
      }

      if (targetId) {
        await cloudinary.uploader.destroy(targetId);
        console.log(`[Cloudinary] Deleted old asset: ${targetId}`);
      }
    } catch (err) {
      console.warn(`[Cloudinary] Asset deletion warning for ${imageUrl}:`, err.message);
    }
    return;
  }

  // 2. Delete from local disk if it's a local /uploads/ file
  if (imageUrl && imageUrl.startsWith('/uploads/')) {
    try {
      const filename = path.basename(imageUrl);
      const localFilePath = path.join(__dirname, '../public/uploads', filename);
      if (fs.existsSync(localFilePath)) {
        fs.unlinkSync(localFilePath);
        console.log(`[Local Disk] Removed replaced asset: ${filename}`);
      }
    } catch (err) {
      console.warn(`[Local Disk] Failed to delete local asset ${imageUrl}:`, err.message);
    }
  }
}

module.exports = {
  isCloudinaryConfigured,
  uploadItemImage,
  deleteItemImage
};

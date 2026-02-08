const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

// Configure multer for memory storage (don't save to disk)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!"), false);
    }
  },
});

// Utility function to upload buffer to Cloudinary
function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (result) resolve(result);
      else reject(err);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
}

module.exports = { upload, uploadBufferToCloudinary };

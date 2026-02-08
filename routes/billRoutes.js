const express = require("express");
const multer = require("multer");
const {
  createBill,
  listBills,
  healthCheck,
  getBillById,
  getPdf,
  downloadPdf,
  deleteBill,
} = require("../controllers/BillController.js");

const router = express.Router();

// Configure multer for handling form-data (including file uploads if needed)..
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    fieldSize: 5 * 1024 * 1024, // 5MB per field
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now (you can restrict later)
    cb(null, true);
  },
});

// Routes
router.post("/", upload.single("image"), createBill); // upload.any() handles any form fields and files
router.get("/", listBills);
router.get("/health", healthCheck);
router.get("/:id", getBillById);
router.get("/:id/pdf", getPdf);
router.get("/:id/download", downloadPdf);
router.delete("/:id", deleteBill);

module.exports = router;

const express = require("express");
const {
  createBankDetail,
  getBankDetailById,
  updateBankDetail,
  deleteBankDetail,
  hardDeleteBankDetail,
  toggleBankDetailStatus,
  getBankDetails,
} = require("../controllers/BankDetailController");

const router = express.Router();

// GET /api/bank-details - Get all bank details
router.get("/", getBankDetails);

// POST /api/bank-details - Create new bank detail
router.post("/", createBankDetail);

// GET /api/bank-details/:id - Get single bank detail by ID
router.get("/:id", getBankDetailById);

// PUT /api/bank-details/:id - Update bank detail
router.put("/:id", updateBankDetail);

// DELETE /api/bank-details/:id - Soft delete bank detail (set isActive to false)
router.delete("/:id", deleteBankDetail);

// DELETE /api/bank-details/:id/hard - Hard delete bank detail (permanently remove)
router.delete("/:id/hard", hardDeleteBankDetail);

// PATCH /api/bank-details/:id/toggle - Toggle bank detail status
router.patch("/:id/toggle", toggleBankDetailStatus);

module.exports = router;

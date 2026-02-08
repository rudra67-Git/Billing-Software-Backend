const BankDetail = require("../models/BankDetail");

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Create a new bank detail
const createBankDetail = asyncHandler(async (req, res) => {
  try {
    // Validate required fields
    const {
      bankName,
      accountName,
      accountNumber,
      ifscCode,
      swiftCode,
      branchAddress,
      branchName,
    } = req.body;

    if (
      !bankName ||
      !accountName ||
      !accountNumber ||
      !ifscCode ||
      !swiftCode
    ) {
      return res.status(400).json({
        error:
          "Bank name, account name, account number, IFSC code, SWIFT code, branch name, and branch address are required",
      });
    }
    console.log("Creating bank detail with data:", req.body);
    // Check if account number already exists
    const existingAccount = await BankDetail.findOne({
      accountNumber: accountNumber.trim(),
      isActive: true,
    });

    if (existingAccount) {
      return res.status(409).json({
        error: "An active account with this account number already exists",
      });
    }

    const bankDetail = new BankDetail({
      bankName: bankName.trim(),
      accountName: accountName.trim(),
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.toUpperCase(), // Corrected field name
      swiftCode: swiftCode.trim().toUpperCase(),
      branchName: branchName,
      branchAddress: branchAddress,
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    });

    await bankDetail.save();

    console.log("Bank detail created:", {
      bankDetail,
    });

    res.status(201).json({
      success: true,
      message: "Bank account added successfully",
      bankDetail,
    });
  } catch (error) {
    console.error("Error creating bank detail:", error);
    res.status(500).json({
      error: "Failed to create bank account",
      details: error.message,
    });
  }
});

// Get all bank details
const getBankDetails = asyncHandler(async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const filter = includeInactive ? {} : { isActive: true };

    const bankDetails = await BankDetail.find(filter)
      .sort({ createdAt: -1 })
      .select("-__v");

    res.status(200).json({
      success: true,
      count: bankDetails.length,
      bankDetails,
    });
  } catch (error) {
    console.error("Error fetching bank details:", error);
    res.status(500).json({
      error: "Failed to fetch bank accounts",
      details: error.message,
    });
  }
});

// Get single bank detail by ID
const getBankDetailById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid bank detail ID format" });
    }

    const bankDetail = await BankDetail.findById(id).select("-__v");

    if (!bankDetail) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    res.status(200).json({
      success: true,
      bankDetail,
    });
  } catch (error) {
    console.error("Error fetching bank detail:", error);
    res.status(500).json({
      error: "Failed to fetch bank account",
      details: error.message,
    });
  }
});

// Update a bank detail
const updateBankDetail = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid bank detail ID format" });
    }

    const bankDetail = await BankDetail.findById(id);
    if (!bankDetail) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    // If updating account number, check for conflicts
    if (
      req.body.accountNumber &&
      req.body.accountNumber !== bankDetail.accountNumber
    ) {
      const existingAccount = await BankDetail.findOne({
        accountNumber: req.body.accountNumber.trim(),
        _id: { $ne: id },
        isActive: true,
      });

      if (existingAccount) {
        return res.status(409).json({
          error: "An active account with this account number already exists",
        });
      }
    }

    // Prepare update data
    const updateData = {
      ...(req.body.bankName && { bankName: req.body.bankName.trim() }),
      ...(req.body.accountName && { accountName: req.body.accountName.trim() }),
      ...(req.body.accountNumber && {
        accountNumber: req.body.accountNumber.trim(),
      }),
      ...(req.body.ifscCode && {
        ifscCode: req.body.ifscCode.trim().toUpperCase(),
      }),
      ...(req.body.swiftCode !== undefined && {
        swiftCode: req.body.swiftCode
          ? req.body.swiftCode.trim().toUpperCase()
          : "",
      }),
      ...(req.body.branchName !== undefined && {
        branchName: req.body.branchName ? req.body.branchName.trim() : "",
      }),
      ...(req.body.branchAddress !== undefined && {
        branchAddress: req.body.branchAddress
          ? req.body.branchAddress.trim()
          : "",
      }),
      ...(req.body.isActive !== undefined && { isActive: req.body.isActive }),
      updatedAt: new Date(),
    };

    const updatedBankDetail = await BankDetail.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select("-__v");

    console.log("Bank detail updated:", {
      id: updatedBankDetail._id,
      bankName: updatedBankDetail.bankName,
      accountNumber: updatedBankDetail.accountNumber,
    });

    res.status(200).json({
      success: true,
      message: "Bank account updated successfully",
      bankDetail: updatedBankDetail,
    });
  } catch (error) {
    console.error("Error updating bank detail:", error);
    res.status(500).json({
      error: "Failed to update bank account",
      details: error.message,
    });
  }
});

// Soft delete a bank detail (set isActive to false)
const deleteBankDetail = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid bank detail ID format" });
    }

    const bankDetail = await BankDetail.findById(id);
    if (!bankDetail) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    // Soft delete by setting isActive to false
    bankDetail.isActive = false;
    bankDetail.updatedAt = new Date();
    await bankDetail.save();

    console.log("Bank detail soft deleted:", {
      id: bankDetail._id,
      bankName: bankDetail.bankName,
      accountNumber: bankDetail.accountNumber,
    });

    res.status(200).json({
      success: true,
      message: "Bank account deactivated successfully",
      bankDetail: {
        id: bankDetail._id,
        bankName: bankDetail.bankName,
        accountNumber: bankDetail.accountNumber,
        isActive: bankDetail.isActive,
      },
    });
  } catch (error) {
    console.error("Error deleting bank detail:", error);
    res.status(500).json({
      error: "Failed to delete bank account",
      details: error.message,
    });
  }
});

// Hard delete a bank detail (permanently remove from database)
const hardDeleteBankDetail = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid bank detail ID format" });
    }

    const bankDetail = await BankDetail.findById(id);
    if (!bankDetail) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    await BankDetail.findByIdAndDelete(id);

    console.log("Bank detail hard deleted:", {
      id: bankDetail._id,
      bankName: bankDetail.bankName,
      accountNumber: bankDetail.accountNumber,
    });

    res.status(200).json({
      success: true,
      message: "Bank account permanently deleted",
      deletedBankDetail: {
        id: bankDetail._id,
        bankName: bankDetail.bankName,
        accountNumber: bankDetail.accountNumber,
      },
    });
  } catch (error) {
    console.error("Error hard deleting bank detail:", error);
    res.status(500).json({
      error: "Failed to permanently delete bank account",
      details: error.message,
    });
  }
});

// Activate/Deactivate a bank detail
const toggleBankDetailStatus = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid bank detail ID format" });
    }

    const bankDetail = await BankDetail.findById(id);
    if (!bankDetail) {
      return res.status(404).json({ error: "Bank account not found" });
    }

    bankDetail.isActive = !bankDetail.isActive;
    bankDetail.updatedAt = new Date();
    await bankDetail.save();

    console.log("Bank detail status toggled:", {
      id: bankDetail._id,
      bankName: bankDetail.bankName,
      isActive: bankDetail.isActive,
    });

    res.status(200).json({
      success: true,
      message: `Bank account ${
        bankDetail.isActive ? "activated" : "deactivated"
      } successfully`,
      bankDetail: {
        id: bankDetail._id,
        bankName: bankDetail.bankName,
        accountNumber: bankDetail.accountNumber,
        isActive: bankDetail.isActive,
      },
    });
  } catch (error) {
    console.error("Error toggling bank detail status:", error);
    res.status(500).json({
      error: "Failed to toggle bank account status",
      details: error.message,
    });
  }
});

module.exports = {
  createBankDetail,
  getBankDetails,
  getBankDetailById,
  updateBankDetail,
  deleteBankDetail,
  hardDeleteBankDetail,
  toggleBankDetailStatus,
};

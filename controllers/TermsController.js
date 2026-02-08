// Note: Terms are currently stored as part of Bill documents
// This controller provides endpoints for managing shared/template terms

const Bill = require("../models/Bill");

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Create a term template (stored in Bills for reference)
 * Terms are typically managed within Bill objects
 */
const createTerms = asyncHandler(async (req, res) => {
  const { terms } = req.body;
  
  if (!terms || !Array.isArray(terms) || terms.length === 0) {
    return res.status(400).json({
      error: "Terms must be a non-empty array of strings",
    });
  }

  // Validate all terms are strings
  if (!terms.every((term) => typeof term === "string" && term.trim().length > 0)) {
    return res.status(400).json({
      error: "All terms must be non-empty strings",
    });
  }

  res.status(201).json({
    success: true,
    message: "Terms validated successfully. Use these terms when creating a bill.",
    terms: terms.map((t) => t.trim()),
  });
});

/**
 * Get default terms used by the system
 */
const getTerms = asyncHandler(async (req, res) => {
  const defaultTerms = [
    "Supply shall commence only after pre-shipment samples are approved in writing by Proingredientz.",
    "Supplier guarantees that goods conform to agreed specifications and applicable Indian/International quality standards.",
    "Proingredientz reserves the right to reject goods not meeting quality standards. All costs shall be borne by supplier.",
    "Each consignment must be accompanied by Invoice, Packing List, COA, and relevant regulatory documents.",
    "All disputes subject to Mumbai, Maharashtra jurisdiction.",
    "Supplier shall not disclose Proingredientz's order details or client information to third parties without written approval.",
  ];

  res.json({
    success: true,
    count: defaultTerms.length,
    terms: defaultTerms,
  });
});

/**
 * Update terms (utility endpoint)
 */
const updateTerms = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { terms } = req.body;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }

  if (!terms || !Array.isArray(terms)) {
    return res.status(400).json({
      error: "Terms must be a non-empty array of strings",
    });
  }

  try {
    const bill = await Bill.findByIdAndUpdate(
      id,
      { termsAndConditions: terms },
      { new: true, runValidators: true }
    );

    if (!bill) {
      return res.status(404).json({ error: "Bill not found" });
    }

    res.json({
      success: true,
      message: "Bill terms updated successfully",
      termsAndConditions: bill.termsAndConditions,
    });
  } catch (error) {
    console.error("Error updating terms:", error.message);
    res.status(500).json({
      error: "Failed to update bill terms",
      details: error.message,
    });
  }
});

/**
 * Delete terms from a bill
 */
const deleteTerms = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }

  try {
    const bill = await Bill.findByIdAndUpdate(
      id,
      { termsAndConditions: [] },
      { new: true }
    );

    if (!bill) {
      return res.status(404).json({ error: "Bill not found" });
    }

    res.json({
      success: true,
      message: "Terms removed from bill successfully",
      bill,
    });
  } catch (error) {
    console.error("Error deleting terms:", error.message);
    res.status(500).json({
      error: "Failed to delete bill terms",
      details: error.message,
    });
  }
});

module.exports = {
  createTerms,
  getTerms,
  updateTerms,
  deleteTerms,
};

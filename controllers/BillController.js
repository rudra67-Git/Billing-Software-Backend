const Counter = require("../models/Counter");
const Bill = require("../models/Bill");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const pdfServiceInstance = require("../services/pdf.service");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const { uploadBufferToCloudinary } = require("../middleware/upload");
const BankDetail = require("../models/BankDetail");
const Company = require("../models/Company");

/**
 * Format bill number depending on document type
 * types: purchase_order, proforma_invoice, invoice
 */
function formatBillNo(type, seq) {
  // Calculate year range dynamically
  const now = new Date();
  const currentYear = now.getFullYear();
  const shortYear = currentYear % 100; // Get last 2 digits (e.g., 2025 -> 25)
  const nextYear = (shortYear + 1) % 100; // Handle year rollover (99->00)
  const yearRange = `${shortYear}-${nextYear}`;

  // Format sequence number with padding
  const s = String(seq).padStart(3, "0");

  const prefixes = {
    purchase_order: process.env.COMPANY_PREFIX_PO || "INGPO",
    proforma_invoice: process.env.COMPANY_PREFIX_PI || "INGPI",
    invoice: process.env.COMPANY_PREFIX_INV || "INGINV",
  };

  const prefix = prefixes[type] || "INGPO";
  return `${prefix}/${yearRange}/${s}`;
}

// Normalize a variety of possible incoming type strings to our canonical types
function normalizeBillType(rawType) {
  if (!rawType || typeof rawType !== "string") return "purchase_order";
  const t = rawType.toLowerCase().trim();
  const map = {
    po: "purchase_order",
    p_o: "purchase_order",
    purchase: "purchase_order",
    purchaseorder: "purchase_order",
    "purchase-order": "purchase_order",
    purchase_order: "purchase_order",
    pi: "proforma_invoice",
    proforma: "proforma_invoice",
    proforma_invoice: "proforma_invoice",
    "proforma-invoice": "proforma_invoice",
    proformainvoice: "proforma_invoice",
    invoice: "invoice",
    inv: "invoice",
  };

  return (
    map[t] ||
    (["purchase_order", "proforma_invoice", "invoice"].includes(t)
      ? t
      : "purchase_order")
  );
}

/**
 * Converts an image file to a Base64 string with proper data URL format.
 */
const imageToBase64 = (imagePath) => {
  try {
    const filePath = path.resolve(imagePath);
    const fileData = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    let mimeType = "image/png";

    switch (ext) {
      case ".jpg":
      case ".jpeg":
        mimeType = "image/jpeg";
        break;
      case ".png":
        mimeType = "image/png";
        break;
      case ".gif":
        mimeType = "image/gif";
        break;
      case ".svg":
        mimeType = "image/svg+xml";
        break;
      default:
        mimeType = "image/png";
    }

    return `data:${mimeType};base64,${fileData.toString("base64")}`;
  } catch (error) {
    console.error("Error converting image to Base64:", error.message);
    return "";
  }
};

/**
 * Get next sequence for a specific bill type
 * Each type has its own independent counter
 */
async function getNextSequence(type = "purchase_order") {
  const id = `bill_${type}`; // Separate counter for each type
  console.log(`Getting next sequence for counter: ${id}`);

  const counter = await Counter.findOneAndUpdate(
    { _id: id },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  console.log(`Generated sequence ${counter.seq} for type ${type}`);
  return counter.seq;
}

async function retryWithExponentialBackoff(
  fn,
  maxAttempts = 3,
  baseDelayMs = 1000
) {
  let attempt = 1;
  const execute = async () => {
    try {
      console.log(`Operation attempt ${attempt}/${maxAttempts}`);
      return await fn();
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error.message);
      if (attempt >= maxAttempts) {
        console.error(`All ${maxAttempts} attempts failed`);
        throw new Error(
          `Operation failed after ${maxAttempts} attempts: ${error.message}`
        );
      }
      const delayMs = Math.min(
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
        30000
      );
      console.log(`Retrying after ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      attempt++;
      return execute();
    }
  };
  return execute();
}

/**
 * Calculate item total with unit conversion
 */
const calculateItemTotal = (unitPrice, unit, quantity) => {
  const unitConversions = {
    kg: 1,
    mt: 1000, // 1 MT = 1000 kg
    tons: 1000, // 1 ton = 1000 kg
    grams: 0.001, // 1 gram = 0.001 kg
    lbs: 0.453592, // 1 lb = 0.453592 kg
    oz: 0.0283495, // 1 oz = 0.0283495 kg
    pcs: 1,
    ft: 1,
    m: 1,
    cm: 1,
    inches: 1,
    "sq ft": 1,
    "sq m": 1,
    liters: 1,
    gallons: 1,
    box: 1,
    set: 1,
    pair: 1,
    dozen: 1,
  };

  const isWeightUnit = (unit) => {
    return ["kg", "mt", "tons", "grams", "lbs", "oz"].includes(
      unit.toLowerCase()
    );
  };

  const validUnitPrice = parseFloat(unitPrice) || 0;
  const validQuantity = parseFloat(quantity) || 0;

  if (validUnitPrice <= 0 || validQuantity <= 0) {
    return 0;
  }

  // If it's a weight unit and price is per kg, convert quantity to kg
  if (isWeightUnit(unit)) {
    const conversionFactor = unitConversions[unit.toLowerCase()] || 1;
    const quantityInKg = validQuantity * conversionFactor;
    const total = validUnitPrice * quantityInKg;
    return parseFloat(total.toFixed(2));
  } else {
    // For non-weight units, simple multiplication
    const total = validUnitPrice * validQuantity;
    return parseFloat(total.toFixed(2));
  }
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const createBill = asyncHandler(async (req, res) => {
  const payload = req.body;
  console.log("Creating bill with payload:", JSON.stringify(payload, null, 2));

  // Parse `items` if sent as a string
  if (req.body.items && typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch (error) {
      return res.status(400).json({ error: "Invalid items format" });
    }
  }

  // Parse emails if sent as a string
  let emails = [];
  if (req.body.emails) {
    if (typeof req.body.emails === "string") {
      try {
        emails = JSON.parse(req.body.emails);
      } catch {
        emails = req.body.emails
          .split(",")
          .map((email) => email.trim())
          .filter((email) => email.length > 0);
      }
    } else if (Array.isArray(req.body.emails)) {
      emails = req.body.emails.filter(
        (email) => email && email.trim().length > 0
      );
    }
  }

  // Validate emails
  if (emails.length === 0) {
    emails = ["sales@ingredientz.co", "procurement@ingredientz.co"];
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  emails = emails.filter((email) => emailRegex.test(email));
  if (emails.length === 0) {
    return res.status(400).json({
      error: "At least one valid email address is required",
    });
  }

  // Handle image upload and convert to Base64 with proper validation
  let logoBase64 = "";
  if (req.file && req.file.buffer) {
    try {
      console.log("Processing uploaded image...");
      console.log("File info:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.buffer.length,
      });

      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
      ];
      if (!allowedTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          error:
            "Invalid file type. Please upload JPG, PNG, or GIF images only.",
        });
      }

      const maxSize = 5 * 1024 * 1024; // 5MB
      if (req.file.buffer.length > maxSize) {
        return res.status(400).json({
          error: "File too large. Please upload images smaller than 5MB.",
        });
      }

      logoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString(
        "base64"
      )}`;
      console.log(
        "Image converted to Base64 successfully. Size:",
        logoBase64.length
      );
    } catch (error) {
      console.error("Failed to convert image to Base64:", error.message);
      return res.status(400).json({
        error: "Failed to process uploaded image",
        details: error.message,
      });
    }
  } else {
    console.log("No image uploaded, using default logo...");
    try {
      const possiblePaths = [
        path.resolve(__dirname, "../assets/logo.png"),
        path.resolve(__dirname, "../../assets/logo.png"),
        path.resolve(process.cwd(), "assets/logo.png"),
        path.resolve(process.cwd(), "public/images/logo.png"),
      ];

      let defaultLogoFound = false;
      for (const logoPath of possiblePaths) {
        if (fs.existsSync(logoPath)) {
          console.log("Found default logo at:", logoPath);
          logoBase64 = imageToBase64(logoPath);
          defaultLogoFound = true;
          break;
        }
      }

      if (!defaultLogoFound) {
        console.log("No default logo found at any expected paths");
        logoBase64 = "";
      }
    } catch (error) {
      console.error("Error loading default logo:", error.message);
      logoBase64 = "";
    }
  }

  // Enhanced Validation
  if (
    !payload.items ||
    !Array.isArray(payload.items) ||
    payload.items.length === 0
  ) {
    return res.status(400).json({
      error: "Items array is required and must not be empty",
    });
  }

  if (!payload.customerName || !payload.customerAddress) {
    return res.status(400).json({
      error: "Customer name and address are required",
    });
  }

  // Validate currency
  const supportedCurrencies = [
    "USD",
    "EUR",
    "GBP",
    "JPY",
    "AUD",
    "CAD",
    "CHF",
    "CNY",
    "SEK",
    "NZD",
    "MXN",
    "SGD",
    "HKD",
    "NOK",
    "INR",
    "BRL",
    "ZAR",
    "RUB",
  ];
  const currency =
    payload.currency && supportedCurrencies.includes(payload.currency)
      ? payload.currency
      : "INR";

  // BACKEND CALCULATION: Process items with enhanced validation and calculation
  const items = payload.items.map((it, index) => {
    const qty = Number(it.quantity);
    const up = Number(it.unitPrice);

    if (isNaN(qty) || qty <= 0) {
      throw new Error(`Invalid quantity for item ${index + 1}: ${it.quantity}`);
    }
    if (isNaN(up) || up <= 0) {
      throw new Error(
        `Invalid unit price for item ${index + 1}: ${it.unitPrice}`
      );
    }

    // BACKEND CALCULATION: Calculate total using backend logic
    const calculatedTotal = calculateItemTotal(up, it.unit, qty);

    return {
      description: (it.description || `Item ${index + 1}`).trim(),
      hsn: (it.hsn || "").trim(),
      quantity: qty,
      unit: (it.unit || "pcs").trim(),
      unitPrice: parseFloat(up.toFixed(2)),
      total: calculatedTotal, // Backend calculated total
    };
  });

  // BACKEND CALCULATION: Calculate totals with proper decimal precision
  const subTotal = parseFloat(
    items.reduce((s, it) => s + it.total, 0).toFixed(2)
  );

  const taxPercent =
    payload.taxPercent != null ? parseFloat(payload.taxPercent) : 0;
  const taxes = parseFloat(((subTotal * taxPercent) / 100).toFixed(2));
  const grandTotal = parseFloat((subTotal + taxes).toFixed(2));

  console.log("Backend Calculations:", {
    subTotal,
    taxPercent,
    taxes,
    grandTotal,
    currency,
  });

  // Normalize the bill type FIRST
  const billType = normalizeBillType(payload.type);
  console.log("Normalized bill type:", billType);

  // Get sequence for THIS specific type
  const seq = await getNextSequence(billType);
  console.log(`Generated sequence ${seq} for type ${billType}`);

  // Format bill number with type-specific prefix
  const poNo = formatBillNo(billType, seq);
  console.log("Generated Bill Number:", poNo);

  // Handle bank details - could be an ID reference or direct object
  let bankDetails = null;
  if (payload.bankId) {
    try {
      bankDetails = await BankDetail.findById(payload.bankId);
      if (!bankDetails || !bankDetails.isActive) {
        console.warn("Bank details not found or inactive, using default");
        bankDetails = null;
      }
    } catch (error) {
      console.warn("Error fetching bank details:", error.message);
    }
  }

  // Default bank details if none provided
  if (!bankDetails) {
    bankDetails = {
      bankName: "ICICI Bank",
      accountName: "PROINGREDIENTZ CONNECTIONS PRIVATE LIMITED",
      accountNumber: "004105022131",
      ifscCode: "ICIC0000041",
      swiftCode: "ICICINBBCTS",
    };
  }

  // Fetch company details if provided (company management)
  let companyDetails = null;
  if (payload.companyId) {
    try {
      companyDetails = await Company.findById(payload.companyId).select("-__v");
      if (!companyDetails || !companyDetails.isActive) {
        console.warn("Company not found or inactive, using defaults");
        companyDetails = null;
      }
    } catch (error) {
      console.warn("Error fetching company details:", error.message);
      companyDetails = null;
    }
  }

  // Default company values if none provided
  if (!companyDetails) {
    companyDetails = {
      name: "PROINGREDIENTZ CONNECTIONS PVT. LTD.",
      registeredOffice:
        "Flat No. 609, C Wing, 6th Floor, Raga Bldg, Vasantrao Naik Marg, Shram Jivi Nagar, Chembur, Mumbai – 400071, India",
      principalPlaceOfBusiness:
        "Khasra No. 594, Ganesh Nagar, Indore – 452010, Madhya Pradesh, India",
      gstin: "23AAPCP3793B1ZC",
      pan: "AAPCP3793B",
      iec: "AAPCP3793B",
      emails: ["sales@ingredientz.co", "procurement@ingredientz.co"],
    };
  }

  // Create bill with backend-calculated values
  const bill = new Bill({
    poNo,
    billNumber: poNo,
    type: billType,
    companyId: payload.companyId || null,
    date: payload.date ? new Date(payload.date) : new Date(),
    customerName: payload.customerName.trim(),
    customerAddress: payload.customerAddress.trim(),
    customerGSTIN: (payload.customerGSTIN || "").trim(),
    deliveryAddress: (
      payload.deliveryAddress || payload.customerAddress
    ).trim(),
    items,
    subTotal, // Backend calculated
    taxes, // Backend calculated
    taxPercent, // Store tax percentage used
    grandTotal, // Backend calculated

    // Enhanced dynamic fields
    emails: emails,
    website: (payload.website || "www.ingredientz.co").trim(),
    currency: currency,
    paymentTerms: (payload.paymentTerms || "50% Advance").trim(),
    deliveryTerms: (payload.deliveryTerms || "1 Week").trim(),
    modeOfDispatch: (payload.modeOfDispatch || "").trim(),
    billingInstructions: (payload.billingInstructions || "").trim(),
    remarks: (payload.remarks || "").trim(),

    imageUrl: req.file ? `Uploaded: ${req.file.originalname}` : "Default Logo",
    deliveryDate: payload.deliveryDate ? new Date(payload.deliveryDate) : null,
    termsAndConditions: (() => {
      let processedTerms = [];
      if (payload.termsAndConditions) {
        if (typeof payload.termsAndConditions === "string") {
          try {
            // Try to parse as JSON first
            const parsed = JSON.parse(payload.termsAndConditions);
            if (Array.isArray(parsed)) {
              processedTerms = parsed;
            } else {
              processedTerms = [payload.termsAndConditions];
            }
          } catch {
            // If not JSON, treat as delimited string
            processedTerms = payload.termsAndConditions
              .split(/\s*\+\s*|\s*\n\s*/) // Split by + or newlines
              .map((term) => term.trim())
              .filter((term) => term.length > 0)
              .map((term) =>
                term
                  .replace(/^\[|\]$/g, "")
                  .replace(/^["']|["']$/g, "")
                  .trim()
              );
          }
        } else if (Array.isArray(payload.termsAndConditions)) {
          processedTerms = payload.termsAndConditions
            .filter(
              (term) => typeof term === "string" && term.trim().length > 0
            )
            .map((term) =>
              term
                .trim()
                .replace(/^\[|\]$/g, "")
                .replace(/^["']|["']$/g, "")
                .trim()
            );
        }
      }

      // Return default terms if none provided
      if (processedTerms.length === 0) {
        return [
          "Supply shall commence only after pre-shipment samples are approved in writing by Proingredientz. If samples fail, all advances must be refunded immediately in full.",
          "Supplier guarantees that goods conform to agreed specifications, COA (Certificate of Analysis), and applicable Indian/International quality standards. Any deviation or misrepresentation will be treated as breach of contract.",
          "Proingredientz reserves the right to reject goods not meeting quality, specifications, or agreed delivery timelines. All costs of return/replacement shall be borne by the supplier.",
          "Each consignment must be accompanied by Invoice, Packing List, COA, and relevant regulatory documents. Non-compliance can result in rejection.",
          "All disputes subject to Mumbai, Maharashtra jurisdiction.",
          "Supplier shall not disclose Proingredientz's order details, product specifications, or client information to third parties without written approval.",
        ];
      }

      return processedTerms;
    })(),
    bankId: payload.bankId || null,
  });

  console.log("Bill object created with backend calculations:", {
    poNo: bill.poNo,
    customerName: bill.customerName,
    subTotal: bill.subTotal,
    taxes: bill.taxes,
    grandTotal: bill.grandTotal,
    currency: bill.currency,
    taxPercent: bill.taxPercent,
    emails: bill.emails,
    logoBase64Length: logoBase64.length,
  });

  // Prepare comprehensive PDF data with backend calculations
  const pdfData = {
    // Basic bill information with backend-calculated values
    ...bill.toObject(),
    billNumber: poNo,
    date: bill.date,
    // Company information (from provided company or defaults)
    companyName: companyDetails.name,
    companyRegisteredOffice: companyDetails.registeredOffice,
    companyBusinessAddress: companyDetails.principalPlaceOfBusiness,
    companyGSTIN: companyDetails.gstin,
    companyPAN: companyDetails.pan,
    companyIEC: companyDetails.iec,
    companyEmails: companyDetails.emails || [],

    logoBase64: logoBase64,

    // Dynamic fields from bill
    emails: bill.emails,
    website: bill.website,
    currency: bill.currency,
    documentType: bill.type,

    // Customer/Supplier details
    supplier: {
      name: bill.customerName,
      address: bill.customerAddress,
      gstin: bill.customerGSTIN,
    },
    customerName: bill.customerName,
    customerAddress: bill.customerAddress,
    customerGSTIN: bill.customerGSTIN,

    // Delivery details
    deliveryAddress: bill.deliveryAddress,

    // Items with backend-calculated totals
    items: bill.items.map((it) => ({
      description: it.description,
      hsn: it.hsn,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      totalValue: it.total, // Backend calculated
      total: it.total, // For backward compatibility
    })),

    // Backend calculated totals
    subTotal: bill.subTotal,
    gstAmount: bill.taxes,
    taxes: bill.taxes, // For backward compatibility
    totalAmount: bill.grandTotal,
    grandTotal: bill.grandTotal, // For backward compatibility
    taxPercent: bill.taxPercent, // Include tax percentage in PDF data

    // Terms and conditions
    paymentTerms: bill.paymentTerms,
    deliveryTerms: bill.deliveryTerms,
    modeOfDispatch: bill.modeOfDispatch,
    billingInstructions: bill.billingInstructions,
    remarks: bill.remarks,
    termsAndConditions: bill.termsAndConditions,

    // Bank details
    bankDetails: {
      bankName: bankDetails.bankName,
      accountName: bankDetails.accountName,
      accountNumber: bankDetails.accountNumber,
      ifscCode: bankDetails.ifscCode || bankDetails.ifsc,
      swiftCode: bankDetails.swiftCode || bankDetails.swift,
    },

    // Additional metadata
    jurisdiction: "Mumbai, Maharashtra",
  };

  console.log("Comprehensive PDF data prepared with backend calculations:", {
    currency: currency,
    subTotal: pdfData.subTotal,
    taxes: pdfData.taxes,
    grandTotal: pdfData.grandTotal,
    taxPercent: pdfData.taxPercent,
    logoBase64Length: pdfData.logoBase64.length,
    hasLogo: !!pdfData.logoBase64,
  });

  // Enhanced PDF Generation with retry logic
  let pdfBuffer;
  try {
    console.log(
      "Starting enhanced PDF generation with backend calculations..."
    );
    pdfBuffer = await retryWithExponentialBackoff(
      async () => {
        return await pdfServiceInstance.generatePurchaseOrderPDF(pdfData);
      },
      3,
      1000
    );
    console.log(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
  } catch (pdfError) {
    console.error("PDF generation error:", pdfError.message);
    return res.status(500).json({
      error: "Failed to generate PDF",
      details: pdfError.message,
    });
  }

  // Upload PDF to Cloudinary with enhanced error handling
  let uploadResult;
  try {
    console.log("Uploading PDF to Cloudinary...");
    uploadResult = await retryWithExponentialBackoff(
      async () => {
        return await uploadBufferToCloudinary(pdfBuffer, {
          folder: "bills",
          resource_type: "raw",
          public_id: poNo.replace(/\//g, "_"),
          timeout: 120000,
          tags: ["purchase-order", currency.toLowerCase()],
          context: {
            currency: currency,
            customer: bill.customerName,
            total: grandTotal.toString(),
          },
        });
      },
      3,
      2000
    );

    console.log(
      "PDF uploaded to Cloudinary successfully:",
      uploadResult.secure_url
    );
  } catch (uploadError) {
    console.error("Cloudinary upload error:", uploadError.message);
    return res.status(500).json({
      error: "Failed to upload PDF to cloud storage",
      details: uploadError.message,
    });
  }

  bill.pdfUrl = uploadResult.secure_url;
  bill.pdfPublicId = uploadResult.public_id;

  // Save bill to database with enhanced error handling
  try {
    await bill.save();
    console.log(
      `Bill ${poNo} saved successfully to database with backend calculations`
    );
  } catch (saveError) {
    console.error("Database save error:", saveError.message);

    // Try to clean up uploaded PDF if database save fails
    try {
      await cloudinary.uploader.destroy(uploadResult.public_id, {
        resource_type: "raw",
      });
      console.log("Cleaned up uploaded PDF due to database error");
    } catch (cleanupError) {
      console.error("Failed to cleanup uploaded PDF:", cleanupError.message);
    }

    return res.status(500).json({
      error: "Failed to save bill to database",
      details: saveError.message,
    });
  }

  console.log(
    "Enhanced bill creation with backend calculations completed successfully"
  );
  return res.status(201).json({
    success: true,
    bill: {
      id: bill._id,
      poNo: bill.poNo,
      pdfUrl: bill.pdfUrl,
      customerName: bill.customerName,
      subTotal: bill.subTotal, // Backend calculated
      taxes: bill.taxes, // Backend calculated
      grandTotal: bill.grandTotal, // Backend calculated
      taxPercent: bill.taxPercent, // Tax percentage used
      currency: bill.currency,
      date: bill.date,
      emails: bill.emails,
      website: bill.website,
      paymentTerms: bill.paymentTerms,
      deliveryTerms: bill.deliveryTerms,
      remarks: bill.remarks,
      imageUrl: bill.imageUrl,
      hasLogo: !!logoBase64,
      bankId: bill.bankId,
    },
    message: `Purchase Order ${poNo} created successfully with ${currency} currency. Backend calculated totals: Subtotal: ${bill.subTotal}, Tax (${bill.taxPercent}%): ${bill.taxes}, Total: ${bill.grandTotal}`,
    calculations: {
      subTotal: bill.subTotal,
      taxPercent: bill.taxPercent,
      taxes: bill.taxes,
      grandTotal: bill.grandTotal,
      currency: bill.currency,
    },
  });
});

// Rest of the controller functions remain the same
const listBills = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;
  const q = req.query.q || "";
  const filter = {};
  if (q) {
    filter.$or = [
      { poNo: { $regex: q, $options: "i" } },
      { customerName: { $regex: q, $options: "i" } },
      { customerGSTIN: { $regex: q, $options: "i" } },
    ];
  }
  const [bills, total] = await Promise.all([
    Bill.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "poNo customerName grandTotal date pdfUrl createdAt imageUrl currency type"
      ),
    Bill.countDocuments(filter),
  ]);
  res.json({
    bills,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
});

const getPdf = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }
  const bill = await Bill.findById(id);
  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }
  if (bill.pdfUrl && bill.pdfUrl.startsWith("http")) {
    try {
      const response = await axios.get(bill.pdfUrl, {
        responseType: "stream",
      });
      res.setHeader("Content-Type", "application/pdf");
      return response.data.pipe(res);
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to fetch PDF from Cloudinary" });
    }
  }
  return res.status(404).json({ error: "PDF not available" });
});

const downloadPdf = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }
  const bill = await Bill.findById(id);
  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }
  if (bill.pdfUrl && bill.pdfUrl.startsWith("http")) {
    try {
      const response = await axios.get(bill.pdfUrl, {
        responseType: "stream",
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${bill.poNo}.pdf`
      );
      return response.data.pipe(res);
    } catch (error) {
      return res
        .status(500)
        .json({ error: "Failed to fetch PDF from Cloudinary" });
    }
  }
  return res.status(404).json({ error: "PDF not available" });
});

const getBillById = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }
  const bill = await Bill.findById(id);
  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }
  res.json({ bill });
});

const deleteBill = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({ error: "Invalid bill ID format" });
  }
  const bill = await Bill.findById(id);
  if (!bill) {
    return res.status(404).json({ error: "Bill not found" });
  }

  // Handle PDF deletion in Cloudinary if exists
  if (bill.pdfPublicId) {
    try {
      await cloudinary.uploader.destroy(bill.pdfPublicId, {
        resource_type: "raw",
      });
      console.log(`PDF ${bill.pdfPublicId} deleted from Cloudinary`);
    } catch (err) {
      console.warn("Cloudinary delete failed:", err.message);
    }
  }

  // Delete the bill
  await Bill.findByIdAndDelete(id);
  console.log(`Bill ${bill.poNo} deleted successfully`);

  // Delete the counter for this bill type if no other bills of this type exist
  const counterId = `bill_${bill.type}`;
  const otherBillsOfSameType = await Bill.findOne({ type: bill.type });
  if (!otherBillsOfSameType) {
    await Counter.findByIdAndDelete(counterId);
    console.log(
      `Deleted counter ${counterId} as no more bills of type ${bill.type} exist`
    );
  }

  res.json({
    success: true,
    message: "Bill and related data deleted successfully",
    deletedBill: {
      id: bill._id,
      poNo: bill.poNo,
      type: bill.type,
    },
  });
});

const healthCheck = asyncHandler(async (req, res) => {
  let browserHealthy = false;
  try {
    browserHealthy = pdfServiceInstance.browser?.connected || false;
  } catch (error) {
    console.warn("Browser health check error:", error.message);
  }

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      database: "connected",
      pdfService: browserHealthy ? "healthy" : "degraded",
      cloudinary: "connected",
    },
  });
});

module.exports = {
  createBill,
  listBills,
  getPdf,
  getBillById,
  deleteBill,
  healthCheck,
  downloadPdf,
};

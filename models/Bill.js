const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  hsn: { type: String, default: "" },
  quantity: { type: Number, required: true, min: 0 },
  unit: { type: String, default: "pcs" },
  unitPrice: { type: Number, required: true, min: 0 },
  total: { type: Number, required: true, min: 0 },
});

const BillSchema = new mongoose.Schema(
  {
    poNo: { type: String, required: true, unique: true },
    // billNumber is the stored identifier used by some clients/indexes (keeps legacy compatibility)
    // We store formatted PO/INV/PI string here as well to avoid null index insertions.
    billNumber: { type: String, required: true, index: true },
    // type: purchase_order | proforma_invoice | invoice
    type: {
      type: String,
      enum: ["purchase_order", "proforma_invoice", "invoice"],
      default: "purchase_order",
    },
    date: { type: Date, required: true },
    customerName: { type: String, required: true, trim: true },
    customerAddress: { type: String, required: true, trim: true },
    customerGSTIN: { type: String, default: "", trim: true },
    deliveryAddress: { type: String, required: true, trim: true },
    items: [ItemSchema],
    subTotal: { type: Number, required: true, min: 0 },
    taxes: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    pdfUrl: { type: String, default: "" },
    pdfPublicId: { type: String, default: "" },
    billingInstructions: { type: String, default: "" },
    paymentTerms: { type: String, default: "50% Advance" },
    deliveryTerms: { type: String, default: "1 Week" },
    imageUrl: { type: String, default: "" },
    deliveryDate: { type: Date, default: null },
    modeOfDispatch: { type: String, default: "" },
    termsAndConditions: [{ type: String }],
    bankId: { type: mongoose.Schema.Types.ObjectId, ref: "BankDetail" },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company" },

    // New dynamic fields
    emails: [{ type: String, required: true }], // Multiple emails array
    website: { type: String, default: "www.ingredientz.co" },
    currency: {
      type: String,
      default: "INR",
      enum: [
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
      ],
    },
    remarks: { type: String, default: "" }, // New remarks field
  },
  {
    timestamps: true,
  }
);

BillSchema.index({ poNo: 1 });
BillSchema.index({ customerName: 1 });
BillSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Bill", BillSchema);

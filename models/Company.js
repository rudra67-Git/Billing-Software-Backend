const mongoose = require("mongoose");

const CompanySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    registeredOffice: { type: String, default: "", trim: true },
    principalPlaceOfBusiness: { type: String, default: "", trim: true },
    gstin: { type: String, default: "", trim: true, uppercase: true },
    pan: { type: String, default: "", trim: true, uppercase: true },
    iec: { type: String, default: "", trim: true, uppercase: true },
    emails: [{ type: String, trim: true }],
    isActive: { type: Boolean, default: true },
    website: { type: String, default: "", trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

CompanySchema.index({ name: 1 });
CompanySchema.index({ isActive: 1 });

const Company = mongoose.model("Company", CompanySchema);
module.exports = Company;

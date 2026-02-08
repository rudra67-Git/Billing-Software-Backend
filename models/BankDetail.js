const mongoose = require("mongoose");

const bankDetailSchema = new mongoose.Schema(
  {
    bankName: {
      type: String,
      required: [true, "Bank name is required"],
      trim: true,
      maxlength: [100, "Bank name cannot exceed 100 characters"],
    },
    accountName: {
      type: String,
      required: [true, "Account name is required"],
      trim: true,
      maxlength: [200, "Account name cannot exceed 200 characters"],
    },
    accountNumber: {
      type: String,
      required: [true, "Account number is required"],
      trim: true,
      unique: true,
      maxlength: [50, "Account number cannot exceed 50 characters"],
    },
    ifscCode: {
      type: String,
      required: [true, "IFSC code is required"],
      trim: true,
      uppercase: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, "Please provide a valid IFSC code"],
    },
    swiftCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: [11, "SWIFT code cannot exceed 11 characters"],
      match: [
        /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$|^$/,
        "Please provide a valid SWIFT code or leave empty",
      ],
    },
    branchName: {
      type: String,
      trim: true,
      maxlength: [200, "Branch name cannot exceed 200 characters"],
    },
    branchAddress: {
      type: String,
      trim: true,
      maxlength: [500, "Branch address cannot exceed 500 characters"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better query performance
bankDetailSchema.index({ accountNumber: 1 });
bankDetailSchema.index({ isActive: 1 });
bankDetailSchema.index({ bankName: 1, isActive: 1 });

// Virtual for masked account number
bankDetailSchema.virtual("maskedAccountNumber").get(function () {
  if (this.accountNumber && this.accountNumber.length > 4) {
    return "****" + this.accountNumber.slice(-4);
  }
  return this.accountNumber;
});

// Pre-save middleware to handle validation
bankDetailSchema.pre("save", function (next) {
  // Ensure IFSC code is uppercase
  if (this.ifscCode) {
    this.ifscCode = this.ifscCode.toUpperCase();
  }

  // Ensure SWIFT code is uppercase
  if (this.swiftCode) {
    this.swiftCode = this.swiftCode.toUpperCase();
  }

  next();
});

// Static method to find active accounts
bankDetailSchema.statics.findActive = function () {
  return this.find({ isActive: true });
};

// Instance method to toggle status
bankDetailSchema.methods.toggleStatus = function () {
  this.isActive = !this.isActive;
  return this.save();
};

const BankDetail = mongoose.model("BankDetail", bankDetailSchema);

module.exports = BankDetail;

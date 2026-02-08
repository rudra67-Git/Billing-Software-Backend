const Company = require("../models/Company");

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const createCompany = asyncHandler(async (req, res) => {
  const {
    name,
    registeredOffice,
    principalPlaceOfBusiness,
    gstin,
    pan,
    iec,
    emails,
    website,
  } = req.body;
  if (!name) return res.status(400).json({ error: "Company name is required" });

  const company = new Company({
    name: name.trim(),
    registeredOffice: registeredOffice || "",
    principalPlaceOfBusiness: principalPlaceOfBusiness || "",
    gstin: gstin ? gstin.trim().toUpperCase() : "",
    pan: pan ? pan.trim().toUpperCase() : "",
    iec: iec ? iec.trim().toUpperCase() : "",
    emails: Array.isArray(emails) ? emails.map((e) => e.trim()) : [],
    website: website || "",
  });

  await company.save();
  res.status(201).json({ success: true, company });
});

const getCompanies = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const filter = includeInactive ? {} : { isActive: true };
  const companies = await Company.find(filter)
    .select("-__v")
    .sort({ createdAt: -1 });
  res.json({ success: true, count: companies.length, companies });
});

const getCompanyById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id.match(/^[0-9a-fA-F]{24}$/))
    return res.status(400).json({ error: "Invalid ID" });
  const company = await Company.findById(id).select("-__v");
  if (!company) return res.status(404).json({ error: "Company not found" });
  res.json({ success: true, company });
});

const updateCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id.match(/^[0-9a-fA-F]{24}$/))
    return res.status(400).json({ error: "Invalid ID" });
  const updateData = { ...req.body };
  if (updateData.gstin)
    updateData.gstin = updateData.gstin.trim().toUpperCase();
  if (updateData.pan) updateData.pan = updateData.pan.trim().toUpperCase();
  if (updateData.iec) updateData.iec = updateData.iec.trim().toUpperCase();
  if (updateData.emails && !Array.isArray(updateData.emails))
    updateData.emails = [updateData.emails];
  if (updateData.emails)
    updateData.emails = updateData.emails.map((e) => e.trim());

  const updated = await Company.findByIdAndUpdate(id, updateData, {
    new: true,
    runValidators: true,
  }).select("-__v");
  if (!updated) return res.status(404).json({ error: "Company not found" });
  res.json({ success: true, company: updated });
});

const deleteCompany = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!id.match(/^[0-9a-fA-F]{24}$/))
    return res.status(400).json({ error: "Invalid ID" });
  const company = await Company.findById(id);
  if (!company) return res.status(404).json({ error: "Company not found" });
  company.isActive = false;
  await company.save();
  res.json({ success: true, message: "Company deactivated", company });
});

module.exports = {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
};

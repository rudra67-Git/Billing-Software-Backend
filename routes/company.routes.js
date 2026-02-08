const express = require("express");
const {
  createCompany,
  getCompanies,
  getCompanyById,
  updateCompany,
  deleteCompany,
} = require("../controllers/CompanyController");

const router = express.Router();

router.post("/", createCompany);
router.get("/", getCompanies);
router.get("/:id", getCompanyById);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

module.exports = router;

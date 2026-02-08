const express = require("express");
const {
  createTerms,
  getTerms,
  updateTerms,
  deleteTerms,
} = require("../controllers/TermsController");

const router = express.Router();

router.post("/", createTerms);
router.get("/", getTerms);
router.put("/:id", updateTerms);
router.delete("/:id", deleteTerms);

module.exports = router;

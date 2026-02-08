const { body, validationResult } = require("express-validator");

const billValidationRules = () => [
  body("customerName").notEmpty().withMessage("customerName required"),
  body("customerAddress").notEmpty().withMessage("customerAddress required"),
  body("items")
    .isArray({ min: 1 })
    .withMessage("items must be array and not empty"),
  body("items.*.description").notEmpty(),
  body("items.*.quantity").isNumeric(),
  body("items.*.unitPrice").isNumeric(),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });
  next();
};

module.exports = { billValidationRules, validate };

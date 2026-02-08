// utils/currency.js

/**
 * Rounds a number to two decimal places
 * @param {number} num - The number to round
 * @returns {number} - The rounded number
 */
const roundToTwoDecimal = (num) => {
  if (isNaN(num) || num === null || num === undefined) {
    return 0;
  }
  return Math.round((parseFloat(num) + Number.EPSILON) * 100) / 100;
};

/**
 * Formats a number as currency with proper locale formatting
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (default: 'INR')
 * @param {string} locale - The locale for formatting (default: 'en-IN')
 * @returns {string} - Formatted currency string
 */
const formatCurrency = (amount, currency = "INR", locale = "en-IN") => {
  if (isNaN(amount) || amount === null || amount === undefined) {
    amount = 0;
  }

  const currencySymbols = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
    CNY: "¥",
    SEK: "kr",
    NZD: "NZ$",
    MXN: "$",
    SGD: "S$",
    HKD: "HK$",
    NOK: "kr",
    BRL: "R$",
    ZAR: "R",
    RUB: "₽",
  };

  const symbol = currencySymbols[currency] || currency;

  // Use Intl.NumberFormat for proper locale-based formatting
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formatter.format(roundToTwoDecimal(amount))}`;
};

/**
 * Formats currency without decimal places (for whole numbers)
 * @param {number} amount - The amount to format
 * @param {string} currency - The currency code (default: 'INR')
 * @param {string} locale - The locale for formatting (default: 'en-IN')
 * @returns {string} - Formatted currency string without decimals
 */
const formatCurrencyWholeNumber = (
  amount,
  currency = "INR",
  locale = "en-IN"
) => {
  if (isNaN(amount) || amount === null || amount === undefined) {
    amount = 0;
  }

  const currencySymbols = {
    INR: "₹",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    AUD: "A$",
    CAD: "C$",
    CHF: "CHF",
    CNY: "¥",
    SEK: "kr",
    NZD: "NZ$",
    MXN: "$",
    SGD: "S$",
    HKD: "HK$",
    NOK: "kr",
    BRL: "R$",
    ZAR: "R",
    RUB: "₽",
  };

  const symbol = currencySymbols[currency] || currency;

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return `${symbol}${formatter.format(Math.round(amount))}`;
};

/**
 * Returns list of supported currencies
 * @returns {Array} - Array of currency objects with code and name
 */
const getSupportedCurrencies = () => {
  return [
    { code: "USD", name: "US Dollar" },
    { code: "EUR", name: "Euro" },
    { code: "GBP", name: "British Pound" },
    { code: "JPY", name: "Japanese Yen" },
    { code: "AUD", name: "Australian Dollar" },
    { code: "CAD", name: "Canadian Dollar" },
    { code: "CHF", name: "Swiss Franc" },
    { code: "CNY", name: "Chinese Yuan" },
    { code: "SEK", name: "Swedish Krona" },
    { code: "NZD", name: "New Zealand Dollar" },
    { code: "MXN", name: "Mexican Peso" },
    { code: "SGD", name: "Singapore Dollar" },
    { code: "HKD", name: "Hong Kong Dollar" },
    { code: "NOK", name: "Norwegian Krone" },
    { code: "INR", name: "Indian Rupee" },
    { code: "BRL", name: "Brazilian Real" },
    { code: "ZAR", name: "South African Rand" },
    { code: "RUB", name: "Russian Ruble" },
  ];
};

/**
 * Validates if a currency code is supported
 * @param {string} currency - Currency code to validate
 * @returns {boolean} - True if currency is supported
 */
const isSupportedCurrency = (currency) => {
  const supportedCurrencies = getSupportedCurrencies().map((c) => c.code);
  return supportedCurrencies.includes(currency);
};

/**
 * Converts amount from one currency to another (placeholder - requires exchange rate API)
 * @param {number} amount - Amount to convert
 * @param {string} fromCurrency - Source currency code
 * @param {string} toCurrency - Target currency code
 * @param {number} exchangeRate - Exchange rate (temporary parameter)
 * @returns {number} - Converted amount
 */
const convertCurrency = (
  amount,
  fromCurrency,
  toCurrency,
  exchangeRate = 1
) => {
  // This is a placeholder implementation
  // In a real application, you would fetch exchange rates from an API
  if (fromCurrency === toCurrency) {
    return roundToTwoDecimal(amount);
  }

  return roundToTwoDecimal(amount * exchangeRate);
};

module.exports = {
  roundToTwoDecimal,
  formatCurrency,
  formatCurrencyWholeNumber,
  getSupportedCurrencies,
  isSupportedCurrency,
  convertCurrency,
};

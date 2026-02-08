let puppeteer;
let chromium;

// Determine which puppeteer to use based on environment
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV !== 'production';
const onRender = process.env.HOME === '/home/render' || process.env.RENDER === 'true';

if (isDev && !onRender) {
  // Local development: try full puppeteer first, fallback to puppeteer-core
  try {
    puppeteer = require("puppeteer");
    console.log("✅ Using full puppeteer package (development mode)");
  } catch (e) {
    console.log("⚠️ Full puppeteer not available, using puppeteer-core");
    puppeteer = require("puppeteer-core");
    chromium = require("@sparticuz/chromium");
    console.log("✅ Using puppeteer-core with @sparticuz/chromium");
  }
} else {
  // Production (Render) or explicitly set: ALWAYS use puppeteer-core + @sparticuz/chromium
  // This avoids issues with PUPPETEER_SKIP_CHROMIUM_DOWNLOAD
  puppeteer = require("puppeteer-core");
  chromium = require("@sparticuz/chromium");
  console.log("✅ Production mode: Using puppeteer-core with @sparticuz/chromium");
}

const axios = require("axios");
const path = require("path");
const fs = require("fs");
class PDFService {
  constructor() {
    this.browser = null;
    this.isInitializing = false;
    this.initPromise = null;
    this.maxConcurrentPages = 2;
    this.activePages = 0;
    this.browserDisconnected = false;
    this.maxRetries = 3;

    // Currency configurations with symbols and formatting options
    this.currencies = {
      USD: { symbol: "$", name: "US Dollar", position: "left", spacing: false },
      EUR: { symbol: "€", name: "Euro", position: "right", spacing: true },
      GBP: {
        symbol: "£",
        name: "British Pound",
        position: "left",
        spacing: false,
      },
      JPY: {
        symbol: "¥",
        name: "Japanese Yen",
        position: "left",
        spacing: false,
      },
      AUD: {
        symbol: "A$",
        name: "Australian Dollar",
        position: "left",
        spacing: false,
      },
      CAD: {
        symbol: "C$",
        name: "Canadian Dollar",
        position: "left",
        spacing: false,
      },
      CHF: {
        symbol: "Fr",
        name: "Swiss Franc",
        position: "right",
        spacing: true,
      },
      CNY: {
        symbol: "¥",
        name: "Chinese Yuan",
        position: "left",
        spacing: false,
      },
      SEK: {
        symbol: "kr",
        name: "Swedish Krona",
        position: "right",
        spacing: true,
      },
      NZD: {
        symbol: "NZ$",
        name: "New Zealand Dollar",
        position: "left",
        spacing: false,
      },
      MXN: {
        symbol: "$",
        name: "Mexican Peso",
        position: "left",
        spacing: false,
      },
      SGD: {
        symbol: "S$",
        name: "Singapore Dollar",
        position: "left",
        spacing: false,
      },
      HKD: {
        symbol: "HK$",
        name: "Hong Kong Dollar",
        position: "left",
        spacing: false,
      },
      NOK: {
        symbol: "kr",
        name: "Norwegian Krone",
        position: "right",
        spacing: true,
      },
      INR: {
        symbol: "₹",
        name: "Indian Rupee",
        position: "left",
        spacing: false,
      },
      BRL: {
        symbol: "R$",
        name: "Brazilian Real",
        position: "left",
        spacing: false,
      },
      ZAR: {
        symbol: "R",
        name: "South African Rand",
        position: "left",
        spacing: true,
      },
      RUB: {
        symbol: "₽",
        name: "Russian Ruble",
        position: "right",
        spacing: true,
      },
    };

    // Cache for exchange rates (valid for 1 hour)
    this.exchangeRateCache = {
      rates: {},
      lastUpdated: null,
      cacheValidityMs: 3600000, // 1 hour
    };
  }

  // Format amount with proper currency symbol placement
  // NOTE: This function intentionally does NOT convert amounts between currencies.
  // It only formats the numeric value and places the currency symbol according to
  // `this.currencies` configuration. Amounts are displayed as-sent by the frontend/backend.
  formatCurrency(amount, currencyCode = "INR") {
    // Normalize
    const code = (currencyCode || "INR").toUpperCase();

    // Guard against invalid numbers
    const numeric = Number(amount);
    const safeNumber = isNaN(numeric) ? 0 : numeric;

    const cfg = this.currencies[code] || this.currencies.INR;

    // Choose decimal places (some currencies like JPY have no decimals)
    const decimalPlaces = ["JPY", "KRW"].includes(code) ? 0 : 2;

    const formatted = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(safeNumber);

    if (cfg.position === "left") {
      return cfg.spacing
        ? `${cfg.symbol} ${formatted}`
        : `${cfg.symbol}${formatted}`;
    }
    return cfg.spacing
      ? `${formatted} ${cfg.symbol}`
      : `${formatted}${cfg.symbol}`;
  }

  // Fetch real-time exchange rates
  async getExchangeRates(baseCurrency = "INR") {
    try {
      const now = Date.now();

      // Check if cache is valid
      if (
        this.exchangeRateCache.lastUpdated &&
        now - this.exchangeRateCache.lastUpdated <
          this.exchangeRateCache.cacheValidityMs
      ) {
        console.log("Using cached exchange rates");
        return this.exchangeRateCache.rates;
      }

      console.log("Fetching fresh exchange rates...");

      // Using exchangerate-api.com (free tier: 1500 requests/month)
      // You can replace with your preferred API
      const response = await axios.get(
        `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`,
        {
          timeout: 5000,
        }
      );

      if (response.data && response.data.rates) {
        this.exchangeRateCache.rates = response.data.rates;
        this.exchangeRateCache.lastUpdated = now;
        console.log(
          `Exchange rates updated for base currency: ${baseCurrency}`
        );
        return response.data.rates;
      }

      throw new Error("Invalid response from exchange rate API");
    } catch (error) {
      console.warn(
        "Failed to fetch live exchange rates, using fallback:",
        error.message
      );

      // Fallback rates (approximate - update these periodically)
      const fallbackRates = {
        USD: 0.012,
        EUR: 0.011,
        GBP: 0.0096,
        JPY: 1.79,
        AUD: 0.018,
        CAD: 0.016,
        CHF: 0.011,
        CNY: 0.086,
        SEK: 0.13,
        NZD: 0.02,
        MXN: 0.21,
        SGD: 0.016,
        HKD: 0.095,
        NOK: 0.13,
        INR: 1.0,
        BRL: 0.062,
        ZAR: 0.22,
        RUB: 1.15,
      };

      return baseCurrency === "INR"
        ? fallbackRates
        : this.convertRates(fallbackRates, baseCurrency);
    }
  }

  // Convert rates to different base currency
  convertRates(rates, newBase) {
    const baseRate = rates[newBase];
    if (!baseRate) return rates;

    const convertedRates = {};
    Object.keys(rates).forEach((currency) => {
      convertedRates[currency] = rates[currency] / baseRate;
    });

    return convertedRates;
  }

  async _createBrowser() {
    console.log("🔧 Creating new browser instance...");
    const isWindows = process.platform === "win32";
    const isDev = !process.env.NODE_ENV || process.env.NODE_ENV !== "production";
    const usingFullPuppeteer = isDev && !onRender && !chromium;

    console.log("📊 Browser initialization config:", {
      isDev,
      usingFullPuppeteer,
      onRender,
      platform: process.platform,
      nodeEnv: process.env.NODE_ENV,
    });

    const launchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=TranslateUI,BlinkGenPropertyTrees",
        "--disable-extensions",
        "--disable-default-apps",
        "--mute-audio",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-sync",
        "--disable-translate",
        "--hide-scrollbars",
        "--metrics-recording-only",
        "--no-crash-upload",
        "--disable-ipc-flooding-protection",
        "--memory-pressure-off",
        "--max_old_space_size=2048",
        "--disable-software-rasterizer",
        "--disable-component-extensions-with-background-pages",
      ],
      protocolTimeout: 180000,
      timeout: 90000,
      ...(isWindows && { pipe: true, dumpio: false }),
    };

    // In production (Render) or when on Render, use @sparticuz/chromium configuration
    if (!isDev || onRender) {
      if (usingFullPuppeteer) {
        // If using full puppeteer in dev, it has chromium built-in
        console.log("✅ Using built-in puppeteer chromium");
        // No executablePath needed, puppeteer handles it
      } else {
        // Using puppeteer-core with @sparticuz/chromium (production mode)
        try {
          console.log("🔧 Production mode: Configuring @sparticuz/chromium");
          console.log("📝 Environment:", {
            isLinux: process.platform === "linux",
            homeDir: process.env.HOME,
            nodeEnv: process.env.NODE_ENV,
            onRender,
          });

          if (!chromium) {
            throw new Error('@sparticuz/chromium not loaded - check package.json dependencies');
          }

          // Get chromium executable path
          let executablePath;
          
          // Method 1: Try async executablePath()
          if (typeof chromium.executablePath === 'function') {
            try {
              executablePath = await chromium.executablePath();
              if (executablePath) {
                console.log("✅ Got chromium path from async executablePath():", executablePath);
              }
            } catch (e) {
              console.warn("⚠️ Async chromium.executablePath() failed:", e.message);
            }
          }
          
          // Method 2: If not available, use the property directly
          if (!executablePath && chromium.executablePath && typeof chromium.executablePath !== 'function') {
            executablePath = chromium.executablePath;
            console.log("✅ Got chromium path from property:", executablePath);
          }

          if (!executablePath) {
            throw new Error('Unable to determine chromium executable path. Verify @sparticuz/chromium is properly installed.');
          }

          launchOptions.executablePath = executablePath;
          console.log("✅ Chromium executable path configured:", executablePath);

          // Merge chromium args
          if (chromium.args && Array.isArray(chromium.args)) {
            launchOptions.args = chromium.args.concat(launchOptions.args);
            console.log("✅ Added chromium args:", chromium.args.length, "args merged");
          }

          // Set headless mode from chromium config
          if (chromium.headless !== undefined) {
            launchOptions.headless = chromium.headless;
            console.log("✅ Headless mode set from chromium:", chromium.headless);
          }
        } catch (error) {
          console.error("❌ Error configuring chromium:", error.message);
          console.error("🔍 Full error:", error);
          throw new Error(`Failed to initialize chromium in production: ${error.message}`);
        }
      }
    } else {
      // Local dev (not on Render): fallback to system Chrome or default
      console.log("Development mode (local): Using system Chrome or default Chromium");
      const fs = require("fs");
      const paths = [
        "/usr/bin/google-chrome-stable",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ];

      const execPath = paths.find((p) => {
        try {
          return fs.existsSync(p);
        } catch {
          return false;
        }
      });

      if (execPath) {
        launchOptions.executablePath = execPath;
        console.log("✅ System chrome found at:", execPath);
      } else {
        console.log("ℹ️ No system chrome found, using default puppeteer Chromium");
      }
    }

    console.log("📋 Launching browser with options:", {
      headless: launchOptions.headless,
      hasExecPath: !!launchOptions.executablePath,
      execPath: launchOptions.executablePath || "using default",
      isDev: isDev,
      onRender: onRender,
      platform: process.platform,
    });

    // Validate configuration before launch
    if ((!isDev || onRender) && !launchOptions.executablePath) {
      throw new Error('CRITICAL: Production mode requires executablePath! Ensure @sparticuz/chromium is installed and properly configured.');
    }

    try {
      const browser = await puppeteer.launch(launchOptions);
      console.log("✅ Browser launched successfully");
      return browser;
    } catch (error) {
      console.error("❌ Failed to launch browser:", error.message);
      if (!launchOptions.executablePath && !isDev) {
        console.error("❌ CRITICAL: Production mode requires executablePath!");
        console.error("❌ Ensure @sparticuz/chromium is installed and NODE_ENV=production");
      }
      throw error;
    }
  }

  async initBrowser() {
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    if (!this.browser || !this.browser.connected || this.browserDisconnected) {
      this.isInitializing = true;
      this.browserDisconnected = false;

      try {
        this.initPromise = this._createBrowser();
        this.browser = await this.initPromise;
        this.isInitializing = false;

        this.browser.on("disconnected", () => {
          console.warn("Browser disconnected unexpectedly");
          this.browserDisconnected = true;
          this.browser = null;
        });
      } catch (error) {
        this.isInitializing = false;
        this.browserDisconnected = true;
        throw error;
      }
    }
    return this.browser;
  }

  async generatePurchaseOrderPDF(billData) {
    if (this.activePages >= this.maxConcurrentPages) {
      throw new Error(
        `Too many concurrent PDF operations (${this.activePages}/${this.maxConcurrentPages})`
      );
    }

    let page;
    let attempt = 0;

    // Fetch exchange rates first
    const currency = billData.currency || "INR";
    const exchangeRates = await this.getExchangeRates("INR");

    while (attempt < this.maxRetries) {
      attempt++;

      try {
        console.log(`PDF generation attempt ${attempt}/${this.maxRetries}`);

        const browser = await this.initBrowser();
        if (!browser.connected) {
          throw new Error("Browser is not connected");
        }

        this.activePages++;
        page = await browser.newPage();

        await page.setViewport({ width: 1200, height: 1600 });
        page.setDefaultTimeout(120000);
        page.setDefaultNavigationTimeout(120000);

        // FIXED: Only block specific resource types, not images for base64
        await page.setRequestInterception(true);
        page.on("request", (req) => {
          const resourceType = req.resourceType();
          const url = req.url();

          if (
            url.startsWith("data:") ||
            resourceType === "document" ||
            resourceType === "script"
          ) {
            req.continue();
          } else if (["stylesheet", "font", "media"].includes(resourceType)) {
            req.abort();
          } else {
            req.continue();
          }
        });

        const html = this.generateHTML(billData, exchangeRates);
        console.log("HTML generated, length:", html.length);
        console.log("Logo Base64 length:", billData.logoBase64?.length || 0);

        await page.setContent(html, {
          waitUntil: "domcontentloaded",
          timeout: 90000,
        });

        await new Promise((resolve) => setTimeout(resolve, 3000));

        const pdf = await page.pdf({
          format: "A4",
          printBackground: true,
          margin: { top: "20mm", right: "15mm", bottom: "20mm", left: "15mm" },
          timeout: 0,
          preferCSSPageSize: false,
          displayHeaderFooter: false,
          omitBackground: false,
          scale: 1,
          landscape: false,
        });

        console.log(`PDF generated successfully (${pdf.length} bytes)`);

        if (page) {
          try {
            await page.close();
            page = null;
          } catch (closeError) {
            console.warn("Page close warning:", closeError.message);
          }
        }

        this.activePages--;
        return pdf;
      } catch (error) {
        console.error(
          `PDF generation attempt ${attempt} failed:`,
          error.message
        );

        if (page) {
          try {
            await page.close();
          } catch {}
        }
        this.activePages = Math.max(0, this.activePages - 1);

        if (
          error.message.includes("Target closed") ||
          error.message.includes("Connection closed") ||
          error.message.includes("Protocol error")
        ) {
          await this.closeBrowser();
          this.browserDisconnected = true;
        }

        if (attempt >= this.maxRetries) {
          throw new Error(
            `PDF generation failed after ${this.maxRetries} attempts: ${error.message}`
          );
        }

        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  generateHTML(billData, exchangeRates = {}) {
    // Initialize currency
    const currency = billData.currency || "INR";

    // Add money formatting helper

    const formatDate = (date) => {
      return new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    };

    // Add money formatting helper
    const formatMoney = (amount) =>
      this.formatCurrency(Number(amount), currency);

    // Currency symbol for display (no conversion performed)
    const currencySymbol = this.currencies[currency]?.symbol || currency;
    const currencyName = this.currencies[currency]?.name || currency;

    // Support both a nested company object (billData.company) and legacy flat fields
    const companyObj = billData.company || billData.companyDetails || {};

    const {
      // legacy flat fields (kept for backward compatibility)
      companyName: legacyCompanyName,
      companyRegisteredOffice: legacyCompanyRegisteredOffice,
      companyBusinessAddress: legacyCompanyBusinessAddress,
      companyGSTIN: legacyCompanyGSTIN,
      companyPAN: legacyCompanyPAN,
      companyIEC: legacyCompanyIEC,
      emails: legacyEmails,
      companyEmails: legacyCompanyEmails,
      website: legacyWebsite,
      poNo = "INGPO/25-26/001",
      date = new Date().toISOString(),
      customerName = "DR WILLMAR SCHWABE INDIA PRIVATE LIMITED",
      customerAddress = "VIZAG",
      customerGSTIN = "09AAACDO463D2Z3",
      deliveryAddress = "CUTTACK",
      items = [],
      subTotal = 0,
      gstAmount = 0,
      grandTotal = 0,
      paymentTerms = "50% Advance",
      deliveryTerms = "1 Week",
      modeOfDispatch = "",
      billingInstructions = "",
      remarks = "",
      bankDetails = {},
      termsAndConditions = [],
      logoBase64 = "",
    } = billData;

    // Merge company source precedence: nested company object -> legacy flat fields -> built-in defaults
    const companyName =
      (companyObj && (companyObj.name || companyObj.companyName)) ||
      legacyCompanyName ||
      "PROINGREDIENTZ CONNECTIONS PVT. LTD.";

    const companyRegisteredOffice =
      (companyObj &&
        (companyObj.registeredOffice || companyObj.registered_office)) ||
      legacyCompanyRegisteredOffice ||
      "Flat No. 609, C Wing, 6th Floor, Raga Bldg, Vasantrao Naik Marg, Shram Jivi Nagar, Chembur, Mumbai – 400071, India";

    const companyBusinessAddress =
      (companyObj &&
        (companyObj.principalPlaceOfBusiness ||
          companyObj.businessAddress ||
          companyObj.principal_place)) ||
      legacyCompanyBusinessAddress ||
      "Khasra No. 594, Ganesh Nagar, Indore – 452010, Madhya Pradesh, India";

    const companyGSTIN =
      (companyObj && (companyObj.gstin || companyObj.GSTIN)) ||
      legacyCompanyGSTIN ||
      "23AAPCP3793B1ZC";

    const companyPAN =
      (companyObj && companyObj.pan) || legacyCompanyPAN || "AAPCP3793B";

    const companyIEC =
      (companyObj && companyObj.iec) || legacyCompanyIEC || "AAPCP3793B";

    const companyEmails =
      (companyObj && companyObj.emails) || legacyCompanyEmails || [];
    const emails = legacyEmails || [
      "sales@ingredientz.co",
      "procurement@ingredientz.co",
    ];
    const website =
      (companyObj && companyObj.website) ||
      legacyWebsite ||
      "www.ingredientz.co";

    const documentType =
      billData.documentType || billData.type || "purchase_order";

    // Prefer company emails if provided, otherwise use provided emails
    const finalEmails =
      Array.isArray(companyEmails) && companyEmails.length
        ? companyEmails
        : emails;
    const primaryEmail = emails[0] || "sales@ingredientz.co";

    const gstPercentage =
      gstAmount > 0 && subTotal > 0
        ? ((gstAmount / subTotal) * 100).toFixed(1)
        : 0;

    const titleMap = {
      purchase_order: "PURCHASE ORDER",
      proforma_invoice: "PROFORMA INVOICE",
      invoice: "INVOICE",
    };
    const poTitle = titleMap[documentType] || "PURCHASE ORDER";

    // Enhanced Terms & Conditions processing
    const processTermsAndConditions = (terms) => {
      console.log("Raw terms input:", terms, "Type:", typeof terms);

      if (!terms) {
        return [];
      }

      let processedTerms = [];

      if (Array.isArray(terms)) {
        // Handle array input
        terms.forEach((term) => {
          if (typeof term === "string" && term.trim().length > 0) {
            // Clean up individual terms
            const cleanTerm = term
              .replace(/^["'\[\]]+|["'\[\]]+$/g, "") // Remove surrounding quotes/brackets
              .replace(/\\"/g, '"') // Fix escaped quotes
              .trim();

            // Check for numbered terms like "1. Term one 2. Term two"
            if (cleanTerm.match(/\d+\./)) {
              // Handle numbered terms like "1. Term one 2. Term two"
              const numberedSplit = cleanTerm.split(/\s*\d+\.\s*/);
              if (numberedSplit.length > 1) {
                const splitTerms = numberedSplit
                  .slice(1) // Remove first empty element
                  .map((t) => t.trim())
                  .filter((t) => t.length > 0);
                processedTerms.push(...splitTerms);
              } else {
                processedTerms.push(cleanTerm);
              }
            } else {
              processedTerms.push(cleanTerm);
            }
          }
        });
      } else if (typeof terms === "string") {
        let cleanString = terms;

        // Handle JSON array strings
        if (terms.startsWith("[") && terms.endsWith("]")) {
          try {
            const parsedArray = JSON.parse(terms);
            if (Array.isArray(parsedArray)) {
              return processTermsAndConditions(parsedArray);
            }
          } catch (e) {
            // Remove array brackets manually if JSON parse fails
            cleanString = terms.replace(/^\[|\]$/g, "");
          }
        }

        // Clean up common artifacts from string concatenation
        cleanString = cleanString
          .replace(/","/g, " ") // Remove quote-comma-quote patterns
          .replace(/^["'\[\]]+|["'\[\]]+$/g, "") // Remove surrounding quotes/brackets
          .replace(/\\"/g, '"') // Fix escaped quotes
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();

        console.log("Cleaned string:", cleanString);

        if (cleanString.length === 0) {
          return [];
        }

        // Split by numbered patterns like "1.", "2.", etc.
        if (cleanString.match(/\d+\./)) {
          // Split by numbered patterns like "1.", "2.", etc.
          const numberedSplit = cleanString.split(/\s*\d+\.\s*/);
          if (numberedSplit.length > 1) {
            processedTerms = numberedSplit
              .slice(1) // Remove first empty element
              .map((term) => term.trim())
              .filter((term) => term.length > 0);
          } else {
            processedTerms = [cleanString];
          }
        } else {
          // Single term
          processedTerms = [cleanString];
        }
      }

      // Final cleanup - remove any remaining artifacts and empty terms
      processedTerms = processedTerms
        .map((term) => {
          return term
            .replace(/^["',\s]+|["',\s]+$/g, "") // Remove quotes, commas from edges
            .replace(/\s+/g, " ") // Normalize whitespace
            .trim();
        })
        .filter((term) => term.length > 0);

      console.log("Final processed terms:", processedTerms);
      return processedTerms;
    };

    let processedTerms = processTermsAndConditions(termsAndConditions);

    // Default terms per document type (editable on frontend; used when no T&C provided)
    const defaultTermsMap = {
      purchase_order: [
        "Goods supplied as per specifications and delivery schedule mentioned in the Purchase Order.",
        "Prices are exclusive of GST unless otherwise specified.",
        "Delivery to be made to the specified delivery address. Any change in address must be informed in writing.",
        "Payment shall be made against submission of tax invoice within agreed credit terms.",
        "Shortages or damages found at the time of delivery must be reported within 48 hours.",
      ],
      proforma_invoice: [
        "This is a Proforma Invoice and not a demand for payment.",
        "Prices quoted are indicative and valid for 15 days unless otherwise mentioned.",
        "Goods will be dispatched after receipt of advance payment as per agreed terms.",
        "Taxes, duties and freight charges will be extra as applicable.",
      ],
      invoice: [
        "Goods are supplied as per GST rules and tax invoice is issued as per statutory requirements.",
        "Payment due within agreed credit period from invoice date.",
        "Late payment may attract interest as per agreement.",
        "Claims relating to shortages or damages must be raised within 7 days of receipt.",
      ],
    };

    if (!processedTerms || processedTerms.length === 0) {
      processedTerms =
        defaultTermsMap[documentType] || defaultTermsMap.purchase_order;
    }

    // Function to determine if terms need a new page
    const shouldBreakPage = () => {
      // STRICT RULE: Keep on first page if 8 or fewer items
      if (items.length <= 8) {
        return false;
      }

      // Only break to new page if more than 8 items
      return true;
    };

    const generateItemsHTML = () => {
      return items
        .map((item, index) => {
          const unitPrice = parseFloat(item.unitPrice) || 0;
          const qty = parseFloat(item.quantity) || 0;
          const totalVal =
            item.total !== undefined && item.total !== null
              ? parseFloat(item.total)
              : qty * unitPrice;

          return `
        <tr>
          <td>${index + 1}</td>
          <td class="item-description">${item.description || "Item"}</td>
          <td>${item.hsn || "-"}</td>
          <td>${item.quantity || 0}</td>
          <td>${item.unit || "PCS"}</td>
          <td>${this.formatCurrency(unitPrice, currency, exchangeRates)}</td>
          <td>${this.formatCurrency(totalVal, currency, exchangeRates)}</td>
        </tr>`;
        })
        .join("");
    };

    // Enhanced Terms & Conditions HTML generation
    const generateTermsHTML = () => {
      if (processedTerms.length === 0) {
        // Return a message when no terms are available instead of empty list
        return `
      <div class="no-terms">
        No terms and conditions specified.
      </div>
    `;
      }

      return `
    <div class="terms-content">
      <ol class="terms-list">
        ${processedTerms
          .map((term) => `<li class="terms-item">${term}</li>`)
          .join("")}
      </ol>
    </div>
  `;
    };

    // Logo handling
    let logoSrc = "";
    if (logoBase64) {
      if (logoBase64.startsWith("data:")) {
        logoSrc = logoBase64;
      } else {
        logoSrc = `data:image/png;base64,${logoBase64}`;
      }
      console.log("Using uploaded logo (Base64)");
    } else {
      try {
        const defaultLogoPath = path.resolve(__dirname, "../assets/logo.png");
        if (fs.existsSync(defaultLogoPath)) {
          const logoBuffer = fs.readFileSync(defaultLogoPath);
          logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;
          console.log("Using default logo from assets");
        } else {
          logoSrc = "";
          console.log("No logo found, using text placeholder");
        }
      } catch (error) {
        console.error("Error loading default logo:", error.message);
        logoSrc = "";
      }
    }

    return `<!DOCTYPE html>
<html>
<head>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background: white;
    color: #000;
  }

  .purchase-order {
    max-width: 800px;
    margin: 0 auto;
    padding: 15px;
    font-size: 12px;
    line-height: 1.3;
    position: relative;
    overflow: hidden;
    min-height: 1100px;
    box-sizing: border-box;
  }

  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 400px;
    height: 400px;
    opacity: 0.08;
    transform: translate(-50%, -50%) rotate(-15deg);
    z-index: -1;
    pointer-events: none;
    background-repeat: no-repeat;
    background-position: center center;
    background-size: contain;
    ${logoSrc ? `background-image: url('${logoSrc}');` : "display: none;"}
  }

  .page-break {
    page-break-before: always;
    break-before: page;
  }

  .avoid-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .force-page-break {
    page-break-before: always;
    break-before: page;
    margin-top: 0;
  }

  .terms-container {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .dynamic-spacing {
    margin-bottom: 10px;
  }

  .header {
    display: flex;
    align-items: flex-start;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 2px solid #cccccc;
    page-break-after: avoid;
  }

  .logo {
    width: 70px;
    height: 60px;
    margin-right: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .logoimg {
    width: 70px;
    height: 60px;
    object-fit: contain;
    display: block;
  }

  .logo-placeholder {
    width: 70px;
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #2664eb, #4299e1);
    color: white;
    font-weight: 600;
    font-size: 13px;
    border-radius: 4px;
    text-align: center;
    line-height: 1.2;
  }

  .company-info {
    flex: 1;
    min-width: 0;
    overflow-wrap: break-word;
    word-wrap: break-word;
  }

  .company-name {
    color: #2664eb;
    font-size: 15px;
    font-weight: 600; 
    margin-bottom: 6px;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .currency-badge {
    display: inline-block;
    margin-left: 8px;
    background: #f1f5f9;
    color: #0f172a;
    padding: 4px 8px;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12px;
    vertical-align: middle;
    box-shadow: 0 1px 0 rgba(0,0,0,0.05);
  }

  .company-details {
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .company-details strong {
    color: #333333;
  }

  .po-title {
    text-align: center;
    color: #2664eb;
    background-color: #f7f9fa;
    font-size: 20px;
    font-weight: 600;
    padding: 4px;
    margin: 6px 0;
    letter-spacing: 0.5px;
    border-top: 2px solid #cccccc;
    border-bottom: 2px solid #cccccc;
    page-break-after: avoid;
  }

  .po-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    background-color: #f7f9fa;
    border: 1px solid #dedede;
    padding: 4px;
    page-break-after: avoid;
  }

  .po-header > div {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .two-column {
    display: flex;
    gap: 15px;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }

  .columnone {
    flex: 1;
    border: 2px solid #dedede;
    padding: 10px;
    border-radius: 5px;
    background-color: #f7f9fa;
    min-width: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .columntwo {
    flex: 1;
    padding: 10px;
    min-width: 0;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .section-title {
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 13px;
    text-decoration: underline 1.5px #2664eb;
    color: #2d3747;
  }

  .order-details {
    margin-bottom: 12px;
    page-break-inside: avoid;
    overflow-x: auto;
  }

  .order-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    border: 2px solid #4a5569;
    page-break-inside: avoid;
    table-layout: fixed;
  }

  .order-table th {
    background: #2664eb;
    color: white;
    font-size: 10px;
    padding: 8px;
    text-align: start;
    font-weight: bold;
    border: 2px solid #4a5569;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .order-table td {
    padding: 8px;
    font-size: 10px;
    text-align: center;
    border: 2px solid #4a5569;
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  .order-table th:nth-child(1), .order-table td:nth-child(1) { width: 8%; }
  .order-table th:nth-child(2), .order-table td:nth-child(2) { width: 30%; }
  .order-table th:nth-child(3), .order-table td:nth-child(3) { width: 12%; }
  .order-table th:nth-child(4), .order-table td:nth-child(4) { width: 10%; }
  .order-table th:nth-child(5), .order-table td:nth-child(5) { width: 8%; }
  .order-table th:nth-child(6), .order-table td:nth-child(6) { width: 16%; }
  .order-table th:nth-child(7), .order-table td:nth-child(7) { width: 16%; }

  .item-description {
    text-align: left !important;
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
    max-width: 0;
  }

  .total-row {
    background: #f7fafc;
    font-weight: bold;
  }

  .terms-section {
  margin: 10px 0;
  padding: 0;
  border: none;
  box-shadow: none;
}

.terms-section.new-page {
  page-break-before: always;
  break-before: page;
  margin-top: 0;
  padding-top: 10px;
}

.terms-section .section-title {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 12px;
  text-decoration: underline 1.5px #2664eb;
  color: #2d3747;
  text-align: left;
  text-transform: none;
  letter-spacing: normal;
  padding-bottom: 0;
}

.terms-content {
  font-size: 10px;
  line-height: 1.5;
  margin-top: 5px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  color: #000;
}

/* Simple ordered list with plain numbers */
.terms-list {
  padding-left: 18px;
  margin: 0;
  list-style-type: decimal;
  list-style-position: outside;
}

/* Simple terms items with plain numbers */
.terms-item {
  margin-bottom: 6px;
  padding-left: 5px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  text-align: justify;
  line-height: 1.5;
  font-size: 10px;
}

.terms-item:last-child {
  margin-bottom: 0;
}

.no-terms {
  text-align: center;
  font-style: italic;
  color: #718096;
  font-size: 10px;
  padding: 10px 0;
  border: none;
}

@media print {
  .terms-section {
    border: none !important;
    box-shadow: none !important;
  }

  .terms-section.new-page {
    border: none !important;
  }

  .terms-list {
    list-style-type: decimal !important;
  }

  .terms-item {
    color: #000 !important;
  }
}

  .footer {
    display: flex;
    justify-content: space-between;
    margin-top: 15px;
    font-size: 10px;
    page-break-before: avoid;
  }

  .footer > div {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .signature-section {
    text-align: right;
  }

  .address-text {
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
    text-align: justify;
  }

  .nowrap-label {
    white-space: nowrap;
  }

  .wrap-content {
    word-wrap: break-word;
    overflow-wrap: break-word;
    hyphens: auto;
  }

  @media screen and (max-width: 800px) {
    .two-column {
      flex-direction: column;
      gap: 10px;
    }
    
    .header {
      flex-direction: column;
      text-align: center;
    }
    
    .logo {
      margin: 0 auto 15px auto;
    }
  }

  @media print {
    .purchase-order {
      padding: 0;
      margin: 0;
      max-width: none;
      min-height: auto;
    }

    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-15deg);
      opacity: 0.08;
      z-index: -1;
    }

    .page-break, .force-page-break {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    .new-page {
      page-break-before: always;
      break-before: page;
      margin-top: 0;
    }

    .terms-section {
      border: none !important;
      box-shadow: none !important;
    }

    .terms-section.new-page {
      border: none !important;
    }

    .terms-item::before {
      color: #000 !important;
      border-color: #000 !important;
    }

    .order-table {
      page-break-inside: auto;
    }
    
    .order-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .terms-container {
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .footer {
      page-break-before: avoid;
      break-before: avoid;
      margin-top: 15px;
    }
  }
</style>
</head>
<body>
  <div class="watermark"></div>

  <div class="purchase-order">
    <div class="header">
      <div class="logo">
        ${
          logoSrc
            ? `<img class="logoimg" src="${logoSrc}" alt="Company Logo" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'logo-placeholder\\'>PRO<br>ING</div>';" />`
            : `<div class="logo-placeholder">PRO<br>ING</div>`
        }
      </div>
      <div class="company-info">
  <div class="company-name">${companyName} </div>
        <div class="company-details">
          <strong>Registered Office :</strong> <span class="address-text">${companyRegisteredOffice}</span><br>
          <strong>GST Principal Place of Business :</strong> <span class="address-text">${companyBusinessAddress}</span><br>
          <span class="nowrap-label"><strong>GSTIN:</strong> ${companyGSTIN}</span> | <span class="nowrap-label"><strong>PAN:</strong> ${companyPAN}</span> | <span class="nowrap-label"><strong>IEC:</strong> ${companyIEC}</span><br>
          <strong>Email:</strong> <span class="wrap-content">${emails.join(
            ", "
          )}</span>
        </div>
      </div>
    </div>

  <div class="po-title">${poTitle}</div>

    <div class="po-header">
      <div>
        <strong>${poTitle} No.:</strong><br>
        <span class="wrap-content">${poNo}</span>
      </div>
      <div style="text-align: right;">
        <strong>Date:</strong><br>
        ${formatDate(date)}
      </div>
    </div>

    <div class="two-column">
      <div class="columnone">
        <div class="section-title">${
          {
            purchase_order: "Supplier Details",
            proforma_invoice: "Customer Details",
            invoice: "Bill To",
          }[documentType] || "Supplier Details"
        }</div>
        <div>
          <strong>Name:</strong> <span class="wrap-content">${customerName}</span>
        </div>
        <div><strong>Address:</strong> <span class="address-text">${customerAddress}</span></div>
        <div><strong>GSTIN:</strong> <span class="wrap-content">${customerGSTIN}</span></div>
      </div>

      <div class="columnone">
        <div class="section-title">Delivery Address</div>
        <span class="address-text">${deliveryAddress}</span>
      </div>
    </div>

    <div class="order-details avoid-break">
      <div class="section-title">Order Details</div>
      <table class="order-table">
        <thead>
          <tr>
            <th>Sr. No.</th>
            <th>Description of Goods/Services</th>
            <th>HSN/SAC</th>
            <th>Quantity</th>
            <th>Unit</th>
            <th>Unit Price (${currency})</th>
            <th>Total Value (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${generateItemsHTML()}
          <tr class="total-row">
            <td colspan="6" style="text-align: right; padding-right: 20px;">GST (${gstPercentage}%)</td>
            <td>${this.formatCurrency(gstAmount, currency, exchangeRates)}</td>
          </tr>
          <tr class="total-row">
            <td colspan="6" style="text-align: right; padding-right: 20px;"><strong>Total</strong></td>
            <td><strong>${this.formatCurrency(
              grandTotal,
              currency,
              exchangeRates
            )}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="two-column avoid-break dynamic-spacing">
      <div class="columntwo">
        <div class="section-title">Payment & Delivery Terms</div>
        <strong style="display: inline-block; margin-bottom: 5px;">Delivery Date / Lead Time:</strong> <span class="wrap-content">${deliveryTerms}</span><br>
        <strong style="display: inline-block; margin-bottom: 5px;">Mode of Dispatch:</strong> <span class="wrap-content">${modeOfDispatch}</span><br>
        <strong style="display: inline-block; margin-bottom: 5px;">Payment Terms:</strong> <span class="wrap-content">${paymentTerms}</span><br>
        <strong style="display: inline-block; margin-bottom: 5px;">Billing Instructions:</strong> <span class="wrap-content">${billingInstructions}</span><br>
        <strong style="display: inline-block; margin-bottom: 5px;">Remarks:</strong> <span class="wrap-content">${remarks}</span>
      </div>
      <div class="columntwo">
        <div class="section-title">Bank Details for Payment</div>
        <div style="margin-bottom: 2px;"><strong class="wrap-content">${
          bankDetails.bankName || ""
        }</strong></div>
        <div style="margin-bottom: 2px;">
          <strong>Account Name:</strong> <span class="wrap-content">${
            bankDetails.accountName || ""
          }</span>
        </div>
        <div style="margin-bottom: 2px;"><strong>Account Number:</strong> <span class="wrap-content">${
          bankDetails.accountNumber || ""
        }</span></div>
        <div style="margin-bottom: 2px;"><strong>IFSC Code:</strong> <span class="wrap-content">${
          bankDetails.ifscCode || ""
        }</span></div>
        <div style="margin-bottom: 2px;"><strong>SWIFT Code:</strong> <span class="wrap-content">${
          bankDetails.swiftCode || ""
        }</span></div>
      </div>
    </div>

    <!-- ENHANCED Terms and Conditions with smart page break -->
    <div class="terms-container">
      <div class="terms-section ${shouldBreakPage() ? "new-page" : ""}">
        <div class="section-title">Terms &amp; Conditions</div>
        ${generateTermsHTML()}
      </div>
    </div>

    <hr/>

    <div class="footer">
      <div>
        <strong>For more information contact:</strong><br>
        <strong>Email:</strong> <span class="wrap-content">${primaryEmail}</span> | <strong>Website:</strong> <span class="wrap-content">${website}</span>
      </div>
      <div class="signature-section">
        <strong>Authorized Signatory</strong><br><br>
        <span class="wrap-content">For ${companyName}</span><br>
        (Stamp & Signature)
      </div>
    </div>
  </div>

  <script>
    // Minimal JavaScript - let server-side logic handle page breaks
    document.addEventListener('DOMContentLoaded', function() {
      // Only for visual polish, no page break logic
      const termsList = document.querySelector('.terms-list');
      if (termsList) {
        const termsItems = termsList.querySelectorAll('.terms-item');
        // Terms are already processed server-side
      }
    });

    // No automatic page breaks in print - respect server-side decision
    window.addEventListener('beforeprint', function() {
      const termsList = document.querySelector('.terms-list');
      if (termsList) {
        termsList.style.counterReset = 'terms-counter';
      }
    });
  </script>
</body>
</html>`;
  }

  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
        console.log("Browser closed successfully");
      } catch (error) {
        console.warn("Browser close warning:", error.message);
      } finally {
        this.browser = null;
        this.browserDisconnected = true;
      }
    }
  }

  async cleanup() {
    await this.closeBrowser();
    this.activePages = 0;
  }
}

// Utility functions
function formatPONo(seq) {
  const prefix = process.env.COMPANY_PREFIX || "INGPO";
  const yearRange = process.env.YEAR_RANGE || "25-26";
  const s = String(seq).padStart(3, "0");
  return `${prefix}/${yearRange}/${s}`;
}

/**
 * Converts an image file to a Base64 string.
 * @param {string} imagePath - The path to the image file.
 * @returns {string} - The Base64-encoded string of the image.
 */
function imageToBase64(imagePath) {
  try {
    const filePath = path.resolve(imagePath);
    const fileData = fs.readFileSync(filePath);
    return fileData.toString("base64");
  } catch (error) {
    console.error("Error converting image to Base64:", error.message);
    return "";
  }
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

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const pdfServiceInstance = new PDFService();
module.exports = pdfServiceInstance;
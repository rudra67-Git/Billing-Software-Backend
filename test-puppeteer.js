// test-puppeteer.js - Test PDF generation with chromium configuration
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

async function testChrome() {
  try {
    console.log("=== PDF Generation Test ===");
    console.log("Platform:", process.platform);
    console.log("NODE_ENV:", process.env.NODE_ENV);
    
    const isDev = process.env.NODE_ENV !== "production";
    console.log("Development mode:", isDev);

    const launchOptions = {
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    };

    if (!isDev) {
      console.log("Using @sparticuz/chromium...");
      const execPath = await chromium.executablePath();
      console.log("Chromium executable path:", execPath);
      launchOptions.executablePath = execPath;
      launchOptions.args = chromium.args.concat(launchOptions.args);
    } else {
      console.log("Using system Chrome...");
    }

    const browser = await puppeteer.launch(launchOptions);
    console.log("✅ Browser launched successfully");

    const page = await browser.newPage();
    await page.setContent("<h1>Test PDF Generation</h1><p>If you see this PDF, the setup is working!</p>");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    console.log("✅ PDF generated successfully, size:", pdf.length, "bytes");

    await browser.close();
    console.log("✅ Test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    console.error("Full error:", error);
  }
}

testChrome();

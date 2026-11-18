// Turns the "how to open" guide into a PDF: node docs/how-to-open/make-pdf.cjs
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../e2e/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage();
  await p.goto('file://' + path.join(__dirname, 'how-to-open.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  // The page sets its own size (A4) and margins with @page.
  await p.pdf({ path: path.join(__dirname, '../How-to-Open-GoldenDose.pdf'), preferCSSPageSize: true, printBackground: true });
  await browser.close();
})();

// Turns the preparation card into a PDF: node docs/prep-card/make-pdf.cjs
const path = require('path');
const { chromium } = require(path.join(__dirname, '../../e2e/node_modules/playwright'));
(async () => {
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await p.goto('file://' + path.join(__dirname, 'prep-card.html'), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: path.join(__dirname, '../Preparation-Strategy.pdf'), width: '1920px', height: '1080px', printBackground: true });
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] });
  await browser.close();
})();

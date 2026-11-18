// Turns the "Why GoldenDose" slides into one PDF: node docs/why-deck/make-pdf.cjs
// (The work is done by docs/deck-pdf.cjs, which the click-by-click guide uses too.)
require("child_process").execFileSync(process.execPath, [require("path").join(__dirname, "../deck-pdf.cjs"), "why"], { stdio: "inherit" });

// The blood and urine tests older people in India most often have, so the family can pick one from a list
// instead of typing its name. Only names and the units Indian labs usually print: GoldenDose has no "normal
// ranges" of its own. A result is "outside the range" only against the range printed on that very report.

export const TESTS = [
  // Sugar
  { key: "hba1c", name: "HbA1c", unit: "%", group: "Sugar" },
  { key: "fbs", name: "Fasting blood sugar", unit: "mg/dL", group: "Sugar" },
  { key: "ppbs", name: "Blood sugar after a meal (PPBS)", unit: "mg/dL", group: "Sugar" },
  { key: "rbs", name: "Random blood sugar", unit: "mg/dL", group: "Sugar" },
  // Kidneys
  { key: "creatinine", name: "Creatinine", unit: "mg/dL", group: "Kidneys" },
  { key: "egfr", name: "eGFR", unit: "mL/min/1.73m²", group: "Kidneys" },
  { key: "urea", name: "Blood urea", unit: "mg/dL", group: "Kidneys" },
  { key: "uacr", name: "Urine albumin (ACR)", unit: "mg/g", group: "Kidneys" },
  { key: "uric_acid", name: "Uric acid", unit: "mg/dL", group: "Kidneys" },
  // Salts
  { key: "sodium", name: "Sodium", unit: "mmol/L", group: "Salts" },
  { key: "potassium", name: "Potassium", unit: "mmol/L", group: "Salts" },
  // Heart and cholesterol
  { key: "total_chol", name: "Total cholesterol", unit: "mg/dL", group: "Cholesterol" },
  { key: "ldl", name: "LDL cholesterol", unit: "mg/dL", group: "Cholesterol" },
  { key: "hdl", name: "HDL cholesterol", unit: "mg/dL", group: "Cholesterol" },
  { key: "tg", name: "Triglycerides", unit: "mg/dL", group: "Cholesterol" },
  // Blood
  { key: "hb", name: "Haemoglobin", unit: "g/dL", group: "Blood count" },
  { key: "platelets", name: "Platelets", unit: "lakh/µL", group: "Blood count" },
  { key: "wbc", name: "White blood cells (WBC)", unit: "/µL", group: "Blood count" },
  // Thyroid
  { key: "tsh", name: "TSH (thyroid)", unit: "µIU/mL", group: "Thyroid" },
  { key: "t4", name: "Free T4", unit: "ng/dL", group: "Thyroid" },
  // Liver
  { key: "sgpt", name: "SGPT (ALT)", unit: "U/L", group: "Liver" },
  { key: "sgot", name: "SGOT (AST)", unit: "U/L", group: "Liver" },
  { key: "bilirubin", name: "Bilirubin (total)", unit: "mg/dL", group: "Liver" },
  // Vitamins and bones
  { key: "vitd", name: "Vitamin D", unit: "ng/mL", group: "Vitamins" },
  { key: "b12", name: "Vitamin B12", unit: "pg/mL", group: "Vitamins" },
  { key: "calcium", name: "Calcium", unit: "mg/dL", group: "Vitamins" },
  // Blood thinners
  { key: "inr", name: "INR (for blood thinners)", unit: "", group: "Blood thinners" },
];

export const testByKey = (key) => TESTS.find((t) => t.key === key) ?? null;

// "high", "low", "in range", or null when the report printed no range
export function flagFor(value, low, high) {
  if (low === null && high === null) return null;
  if (high !== null && value > high) return "high";
  if (low !== null && value < low) return "low";
  return "in range";
}

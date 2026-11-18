// "What is this medicine usually for?" A short list of medicines commonly taken by older people in
// India, by generic name and by common Indian brand names.
//
// This is GENERAL information to help the family fill in the "What it's for" box. It is not medical
// advice: a doctor may prescribe a medicine for a different reason, so the family always confirms
// what their doctor said. GoldenDose never suggests doses, changes or substitutes.
//
// Each entry: generic name, what it's usually used for (in plain words), and other names it's sold under.
// Note: the list should be checked by a pharmacist before real families use it.

const MEDICINES = [
  // Diabetes (blood sugar)
  ["Metformin", "Diabetes (blood sugar)", ["Glycomet", "Glyciphage", "Gluconorm", "Obimet", "Riomet"]],
  ["Glimepiride", "Diabetes (blood sugar)", ["Amaryl", "Glimestar", "Glimy"]],
  ["Gliclazide", "Diabetes (blood sugar)", ["Diamicron", "Glizid", "Reclide"]],
  ["Glimepiride + Metformin", "Diabetes (blood sugar)", ["Glycomet GP", "Amaryl M", "Gemer"]],
  ["Sitagliptin", "Diabetes (blood sugar)", ["Januvia", "Istavel", "Zita"]],
  ["Sitagliptin + Metformin", "Diabetes (blood sugar)", ["Janumet", "Istamet", "Zitamet"]],
  ["Vildagliptin", "Diabetes (blood sugar)", ["Galvus", "Jalra", "Zomelis"]],
  ["Vildagliptin + Metformin", "Diabetes (blood sugar)", ["Galvus Met", "Jalra M", "Zomelis Met"]],
  ["Teneligliptin", "Diabetes (blood sugar)", ["Tenepride", "Teneza", "Dynaglipt"]],
  ["Dapagliflozin", "Diabetes (blood sugar); sometimes heart or kidney problems", ["Forxiga", "Oxra"]],
  ["Empagliflozin", "Diabetes (blood sugar); sometimes heart or kidney problems", ["Jardiance", "Gibtulio"]],
  ["Voglibose", "Diabetes (blood sugar after meals)", ["Volix", "Voglitor"]],
  ["Insulin", "Diabetes (blood sugar)", ["Mixtard", "Huminsulin", "Lantus", "Basalog", "NovoRapid", "Ryzodeg"]],

  // Blood pressure and heart
  ["Telmisartan", "High blood pressure", ["Telma", "Telmikind", "Telsar", "Tazloc"]],
  ["Telmisartan + Hydrochlorothiazide", "High blood pressure", ["Telma H", "Telmikind H", "Tazloc H"]],
  ["Telmisartan + Amlodipine", "High blood pressure", ["Telma AM", "Telmikind AM"]],
  ["Amlodipine", "High blood pressure", ["Amlong", "Amlokind", "Stamlo", "Amlopres", "Amlodac"]],
  ["Losartan", "High blood pressure", ["Losar", "Repace", "Covance", "Losacar"]],
  ["Olmesartan", "High blood pressure", ["Olmezest", "Olmat", "Benitec"]],
  ["Cilnidipine", "High blood pressure", ["Cilacar", "Cinod", "Cilaheart"]],
  ["Ramipril", "High blood pressure; heart protection", ["Cardace", "Hopace"]],
  ["Enalapril", "High blood pressure; heart failure", ["Envas", "Enam"]],
  ["Metoprolol", "High blood pressure; heart rhythm or angina", ["Metolar", "Met XL", "Betaloc", "Starpress", "Revelol"]],
  ["Bisoprolol", "High blood pressure; heart rhythm or heart failure", ["Concor", "Corbis"]],
  ["Atenolol", "High blood pressure; heart rhythm", ["Aten", "Tenormin", "Betacard"]],
  ["Carvedilol", "Heart failure; high blood pressure", ["Carca", "Cardivas", "Carloc"]],
  ["Nebivolol", "High blood pressure", ["Nebicard", "Nebistar", "Nodon"]],
  ["Hydrochlorothiazide", "High blood pressure; water retention", ["Aquazide"]],
  ["Chlorthalidone", "High blood pressure; water retention", ["Thalizide"]],
  ["Furosemide", "Water retention (swelling); heart failure", ["Lasix", "Frusemide", "Frusenex"]],
  ["Torsemide", "Water retention (swelling); heart failure", ["Dytor", "Tide"]],
  ["Spironolactone", "Heart failure; water retention", ["Aldactone"]],
  ["Isosorbide mononitrate", "Angina (chest pain from the heart)", ["Monotrate", "Ismo", "Solotrate"]],
  ["Nitroglycerin", "Angina (chest pain from the heart)", ["Sorbitrate", "Angised", "Nitrocontin"]],
  ["Ranolazine", "Angina (chest pain from the heart)", ["Ranozex", "Ranexa"]],
  ["Digoxin", "Heart failure; heart rhythm", ["Lanoxin"]],
  ["Amiodarone", "Heart rhythm", ["Cordarone", "Tachyra"]],

  // Cholesterol
  ["Atorvastatin", "High cholesterol; heart and stroke protection", ["Atorva", "Lipitor", "Storvas", "Atocor", "Tonact"]],
  ["Rosuvastatin", "High cholesterol; heart and stroke protection", ["Rosuvas", "Rozat", "Crestor", "Rozucor"]],
  ["Fenofibrate", "High triglycerides (blood fats)", ["Lipicard", "Fenolip", "Tricor"]],
  ["Ezetimibe", "High cholesterol", ["Ezedoc", "Zetia"]],

  // Blood thinners
  ["Aspirin (low dose)", "Blood thinner: heart and stroke protection", ["Ecosprin", "Loprin"]],
  ["Clopidogrel", "Blood thinner: heart and stroke protection", ["Clopilet", "Plavix", "Deplatt", "Clavix"]],
  ["Aspirin + Clopidogrel", "Blood thinner: heart and stroke protection", ["Clopilet A", "Deplatt A", "Ecosprin Gold"]],
  ["Aspirin + Atorvastatin", "Blood thinner and cholesterol", ["Ecosprin AV", "Atorva Asp"]],
  ["Ticagrelor", "Blood thinner after a heart attack or stent", ["Brilinta", "Axcer"]],
  ["Warfarin", "Blood thinner: prevents clots", ["Warf", "Uniwarfin"]],
  ["Acenocoumarol", "Blood thinner: prevents clots", ["Acitrom", "Sintrom"]],
  ["Apixaban", "Blood thinner: prevents clots and stroke", ["Eliquis"]],
  ["Rivaroxaban", "Blood thinner: prevents clots and stroke", ["Xarelto"]],
  ["Dabigatran", "Blood thinner: prevents clots and stroke", ["Pradaxa"]],

  // Thyroid
  ["Levothyroxine", "Underactive thyroid (hypothyroidism)", ["Thyronorm", "Eltroxin", "Thyrox", "Lethyrox"]],
  ["Carbimazole", "Overactive thyroid (hyperthyroidism)", ["Neo-Mercazole", "Thyrocab"]],

  // Stomach
  ["Pantoprazole", "Acidity, heartburn; protects the stomach", ["Pan", "Pantocid", "Pantop", "Nupenta"]],
  ["Pantoprazole + Domperidone", "Acidity with nausea or bloating", ["Pan D", "Pantocid DSR", "Pantop D"]],
  ["Omeprazole", "Acidity, heartburn; protects the stomach", ["Omez", "Ocid", "Omee"]],
  ["Rabeprazole", "Acidity, heartburn; protects the stomach", ["Rablet", "Razo", "Rabicip"]],
  ["Esomeprazole", "Acidity, heartburn; protects the stomach", ["Nexpro", "Esoz", "Raciper"]],
  ["Famotidine", "Acidity, heartburn", ["Famocid", "Pepcid"]],
  ["Domperidone", "Nausea, vomiting, bloating", ["Domstal", "Vomistop"]],
  ["Ondansetron", "Nausea and vomiting", ["Emeset", "Vomikind", "Ondem"]],
  ["Lactulose", "Constipation", ["Duphalac", "Looz", "Evict"]],
  ["Isabgol (psyllium husk)", "Constipation", ["Sat Isabgol", "Naturolax", "Fybogel"]],

  // Pain, joints and bones
  ["Paracetamol", "Pain and fever", ["Dolo", "Crocin", "Calpol", "Pacimol", "P-500"]],
  ["Diclofenac", "Pain and swelling (joints, muscles)", ["Voveran", "Dynapar", "Reactin"]],
  ["Aceclofenac", "Pain and swelling (joints, muscles)", ["Hifenac", "Zerodol", "Aceclo"]],
  ["Etoricoxib", "Joint pain and swelling (arthritis)", ["Etoshine", "Nucoxia", "Arcoxia"]],
  ["Tramadol", "Moderate to severe pain", ["Ultracet", "Contramal", "Tramazac"]],
  ["Pregabalin", "Nerve pain (burning or tingling); sometimes anxiety", ["Pregalin", "Lyrica", "Pregeb"]],
  ["Gabapentin", "Nerve pain; fits (seizures)", ["Gabapin", "Neurontin", "Gabantin"]],
  ["Calcium + Vitamin D3", "Bone strength (calcium supplement)", ["Shelcal", "Calcimax", "CCM", "Ostocalcium", "Gemcal"]],
  ["Vitamin D3 (cholecalciferol)", "Vitamin D deficiency; bone strength", ["Uprise D3", "Calcirol", "D-Rise", "Tayo"]],
  ["Alendronate", "Weak bones (osteoporosis)", ["Osteofos", "Fosamax"]],
  ["Glucosamine", "Joint support (supplement)", ["Jointace", "Cartigen"]],
  ["Allopurinol", "Gout (high uric acid)", ["Zyloric", "Zyloprim"]],
  ["Febuxostat", "Gout (high uric acid)", ["Febutaz", "Zurig", "Febuget"]],
  ["Colchicine", "Gout attacks", ["Zycolchin", "Goutnil"]],
  ["Hydroxychloroquine", "Rheumatoid arthritis and some joint diseases", ["HCQS", "Plaquenil"]],
  ["Methotrexate", "Rheumatoid arthritis (taken once a week)", ["Folitrax", "Imutrex"]],
  ["Folic acid", "Vitamin supplement; often with methotrexate", ["Folvite", "Folet"]],

  // Vitamins and blood
  ["Vitamin B12 (methylcobalamin)", "Vitamin B12 deficiency; nerve health", ["Methycobal", "Nurokind", "Neurobion"]],
  ["Iron", "Anaemia (low haemoglobin)", ["Livogen", "Orofer", "Ferium", "Autrin", "Dexorange"]],
  ["Multivitamin", "Vitamin supplement", ["Becosules", "Supradyn", "Zincovit", "Revital", "A to Z"]],

  // Brain, mood and sleep
  ["Donepezil", "Memory problems (dementia)", ["Donep", "Aricept", "Dopezil"]],
  ["Memantine", "Memory problems (dementia)", ["Admenta", "Namenda"]],
  ["Levodopa + Carbidopa", "Parkinson's disease", ["Syndopa", "Sinemet", "Tidomet"]],
  ["Pramipexole", "Parkinson's disease; restless legs", ["Pramipex", "Parpex"]],
  ["Escitalopram", "Depression or anxiety", ["Nexito", "Cipralex", "Stalopam"]],
  ["Sertraline", "Depression or anxiety", ["Daxid", "Serta", "Zoloft"]],
  ["Mirtazapine", "Depression; sometimes sleep and appetite", ["Mirtaz"]],
  ["Alprazolam", "Anxiety (short-term)", ["Alprax", "Restyl", "Trika"]],
  ["Clonazepam", "Anxiety; fits (seizures)", ["Clonotril", "Rivotril", "Lonazep"]],
  ["Zolpidem", "Sleep problems (short-term)", ["Zolfresh", "Stilnoct"]],
  ["Levetiracetam", "Fits (seizures)", ["Levipil", "Keppra", "Levroxa"]],
  ["Sodium valproate", "Fits (seizures); sometimes mood", ["Valparin", "Encorate"]],
  ["Phenytoin", "Fits (seizures)", ["Eptoin", "Dilantin"]],
  ["Betahistine", "Dizziness and vertigo", ["Vertin", "Betaserc"]],
  ["Cinnarizine", "Dizziness, vertigo, motion sickness", ["Stugeron", "Vertigon"]],

  // Lungs and allergy
  ["Montelukast", "Asthma; allergies", ["Montair", "Montek", "Romilast"]],
  ["Montelukast + Levocetirizine", "Allergies (sneezing, runny nose)", ["Montair LC", "Montek LC", "Levocet M"]],
  ["Cetirizine", "Allergies (sneezing, itching)", ["Cetzine", "Okacet", "Alerid"]],
  ["Levocetirizine", "Allergies (sneezing, itching)", ["Levocet", "Teczine", "Xyzal"]],
  ["Salbutamol", "Asthma or COPD (opens the airways)", ["Asthalin", "Ventolin"]],
  ["Budesonide + Formoterol", "Asthma or COPD (inhaler)", ["Foracort", "Budamate", "Symbicort"]],
  ["Tiotropium", "COPD (inhaler)", ["Tiova", "Spiriva"]],
  ["Doxofylline", "Asthma or COPD", ["Doxolin", "Synasma"]],
  ["Theophylline", "Asthma or COPD", ["Deriphyllin", "Theo-Asthalin"]],

  // Kidney, bladder and prostate
  ["Tamsulosin", "Enlarged prostate (trouble passing urine)", ["Urimax", "Veltam", "Contiflo"]],
  ["Tamsulosin + Dutasteride", "Enlarged prostate", ["Urimax D", "Veltam Plus", "Dutas T"]],
  ["Silodosin", "Enlarged prostate", ["Silodal", "Silofast", "Rapilif"]],
  ["Finasteride", "Enlarged prostate", ["Finast", "Fincar", "Proscar"]],
  ["Tolterodine", "Overactive bladder (urgent or frequent urine)", ["Roliflo"]],
  ["Sodium bicarbonate", "Kidney disease (acid balance)", ["Sodamint"]],

  // Eyes
  ["Timolol eye drops", "Glaucoma (eye pressure)", ["Iotim", "Glucomol", "Timolet"]],
  ["Latanoprost eye drops", "Glaucoma (eye pressure)", ["Xalatan", "Latoprost", "9 PM"]],
  ["Carboxymethylcellulose eye drops", "Dry eyes", ["Refresh Tears", "Tears Naturale", "Lubrex"]],

  // Infections and other
  ["Amoxicillin + Clavulanic acid", "Bacterial infections (antibiotic)", ["Augmentin", "Moxikind CV", "Clavam"]],
  ["Azithromycin", "Bacterial infections (antibiotic)", ["Azithral", "Azee", "Zithromax"]],
  ["Nitrofurantoin", "Urine infection (antibiotic)", ["Martifur", "Niftas"]],
  ["Prednisolone", "Inflammation, allergies, asthma and more (steroid)", ["Wysolone", "Omnacortil"]],
];

// Lower case, without spaces or punctuation, so "Glycomet-GP 1" and "glycomet gp1" match.
const squash = (text) => text.toLowerCase().replace(/[^a-z0-9]/g, "");

const INDEX = [];
for (const [generic, usedFor, brands] of MEDICINES) {
  for (const name of [generic, ...brands]) INDEX.push({ key: squash(name), name, generic, usedFor });
}
// Longest names first, so "Glycomet GP" is found before "Glycomet", and "Telma H" before "Telma".
INDEX.sort((a, b) => b.key.length - a.key.length);

// Finds what a medicine is usually used for from the name the family typed ("Glycomet 500", "Telma-40").
// Returns { generic, usedFor, matched } or null if it isn't on the list.
export function lookUpMedicine(typed) {
  const key = squash(String(typed ?? ""));
  if (key.length < 3) return null;
  // The typed name starts with a known name ("telma40" starts with "telma"), ignoring the strength after it.
  const hit = INDEX.find((entry) => key.startsWith(entry.key) && !/^[a-z]/.test(key.slice(entry.key.length)));
  if (!hit) return null;
  return { generic: hit.generic, usedFor: hit.usedFor, matched: hit.name };
}

export const MEDICINE_INFO_NOTE =
  "General information only, not medical advice. The doctor may have prescribed it for a different reason: write what the doctor said.";

export const INDUSTRY_IDS = ["chemical", "automobile", "pharma", "agriculture"] as const;
export type IndustryId = (typeof INDUSTRY_IDS)[number];

export const INDUSTRY_COOKIE = "opsmind.industry";
export const DEFAULT_INDUSTRY: IndustryId = "chemical";

export type IndustryMeta = {
  id: IndustryId;
  label: string;
  shortLabel: string;
  companyName: string;
  currency: "INR" | "USD";
  currencySymbol: string;
  locale: string;
  unit: string;
  jargon: string;
  exampleOrders: string[];
  exampleSkus: string[];
  exampleCustomers: string[];
  capabilities: string[];
};

export const INDUSTRIES: Record<IndustryId, IndustryMeta> = {
  chemical: {
    id: "chemical",
    label: "Chemical",
    shortLabel: "Chemical",
    companyName: "Meridian Specialty Chem",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    unit: "kg / drums",
    jargon:
      "Talk like a chemical distribution ops lead: CAS-style SKUs, packing (drums/IBCs), kg on hand, plant & distributor orders, hazardous-goods dispatch windows.",
    exampleOrders: ["CHEM-1042", "CHEM-2187", "CHEM-3301"],
    exampleSkus: ["CHEM-ACID-003", "CHEM-ACID-004", "CHEM-ACID-015"],
    exampleCustomers: ["Bharat Fine Chemicals", "Gujarat Solvents Pvt Ltd", "Eastern Specialty Chem"],
    capabilities: [
      "delayed chemical shipments",
      "low drum/kg stock by hub",
      "overdue distributor invoices",
      "top solvent buyers",
      "warehouse inventory for Mumbai Hub",
      "order details for CHEM-1042",
      "inactive distributors",
      "revenue trends",
    ],
  },
  automobile: {
    id: "automobile",
    label: "Automobile",
    shortLabel: "Auto",
    companyName: "OpsMind Auto Parts",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    unit: "pcs",
    jargon:
      "Talk like an auto spare-parts distributor ops lead: OEM numbers, dealer orders, SKU fitment, hub stock, dispatch SLAs.",
    exampleOrders: ["AUTO-1042", "AUTO-2187", "AUTO-3301"],
    exampleSkus: ["AUTO-BODY-009", "AUTO-BODY-029", "AUTO-BODY-049"],
    exampleCustomers: ["Bharat Auto Parts Distributors", "Chennai Motor Components", "Delhi Automotive Traders"],
    capabilities: [
      "delayed dealer orders",
      "low stock brake pads",
      "overdue invoices",
      "top dealers by revenue",
      "warehouse stock for Western Region Hub",
      "order details for AUTO-1042",
      "inactive dealers",
      "revenue trends",
    ],
  },
  pharma: {
    id: "pharma",
    label: "Pharma",
    shortLabel: "Pharma",
    companyName: "OpsMind Pharma Supply",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    unit: "packs / vials",
    jargon:
      "Talk like a pharma distribution ops lead: hospital & distributor orders, pack counts, cold-chain dispatch windows, expiry-sensitive replenishment (demo labels only).",
    exampleOrders: ["PHAR-1042", "PHAR-2187", "PHAR-3301"],
    exampleSkus: ["PHAR-ALLE-005", "PHAR-ALLE-025", "PHAR-ALLE-045"],
    exampleCustomers: ["City Care Hospitals", "MediLink Distributors", "Arogya Pharmacy Chain"],
    capabilities: [
      "delayed hospital shipments",
      "low stock formulations",
      "overdue invoices",
      "top hospital buyers",
      "warehouse inventory for Mumbai Pharma Hub",
      "order details for PHAR-1042",
      "inactive accounts",
      "revenue trends",
    ],
  },
  agriculture: {
    id: "agriculture",
    label: "Agriculture",
    shortLabel: "Agri",
    companyName: "OpsMind Agri Inputs",
    currency: "INR",
    currencySymbol: "₹",
    locale: "en-IN",
    unit: "bags / litres",
    jargon:
      "Talk like an agri-inputs ops lead: dealer & co-op orders, fertilizer grades, seed lots (demo), seasonal demand, hub stock.",
    exampleOrders: ["AGRI-1042", "AGRI-2187", "AGRI-3301"],
    exampleSkus: ["AGRI-BIO-012", "AGRI-BIO-020", "AGRI-BIO-032"],
    exampleCustomers: ["Punjab Krishi Co-op", "Deccan Agri Dealers", "GreenField Inputs Ltd"],
    capabilities: [
      "delayed dealer shipments",
      "low fertilizer stock",
      "overdue invoices",
      "top co-op buyers",
      "warehouse inventory for Punjab Agri Hub",
      "order details for AGRI-1042",
      "inactive dealers",
      "revenue trends",
    ],
  },
};

export function isIndustryId(value: unknown): value is IndustryId {
  return typeof value === "string" && (INDUSTRY_IDS as readonly string[]).includes(value);
}

export function parseIndustry(value: unknown): IndustryId {
  return isIndustryId(value) ? value : DEFAULT_INDUSTRY;
}

export function getIndustryMeta(id: IndustryId = DEFAULT_INDUSTRY): IndustryMeta {
  return INDUSTRIES[parseIndustry(id)];
}

export function formatIndustryMoney(amount: number, industry: IndustryId = DEFAULT_INDUSTRY): string {
  const meta = getIndustryMeta(industry);
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Domain block injected into the chat system prompt for the active industry. */
export function buildIndustryPromptBlock(industry: IndustryId): string {
  const meta = getIndustryMeta(industry);
  return `
## Active industry dataset
- Industry: ${meta.label} (${meta.companyName})
- Currency: ${meta.currencySymbol} (${meta.currency}) — always format money this way
- Units: ${meta.unit}
- ${meta.jargon}
- Example orders users may ask about: ${meta.exampleOrders.join(", ")}
- Example SKUs: ${meta.exampleSkus.join(", ")}
- Example customers: ${meta.exampleCustomers.join(", ")}
- If the user is vague, offer to help with: ${meta.capabilities.join("; ")}.
- All tools already filter to this industry — never mix in other industries.
`.trim();
}

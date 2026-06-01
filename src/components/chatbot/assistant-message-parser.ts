/**
 * Parse common assistant reply shapes (markdown-ish) into rows for tabular Quick view.
 */

export function stripMarkdownEmphasis(value: string): string {
  return value.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1").trim();
}

export interface MetaRow {
  key: string;
  value: string;
}

export interface ItemRow {
  no: string;
  product: string;
  sku: string;
  quantity: string;
  lineTotal: string;
}

export interface MarkdownTable {
  headers: string[];
  rows: string[][];
}

export interface ParsedAssistantTables {
  metaRows: MetaRow[];
  itemRows: ItemRow[];
  invoiceRows: MetaRow[];
  markdownTables: MarkdownTable[];
  /** True if we extracted at least one table worth showing */
  hasTables: boolean;
}

/**
 * Extract `- **Key:** value` pairs before "Items in the Order" / "Linked Invoices".
 */
function parseMetaRows(text: string): MetaRow[] {
  const rows: MetaRow[] = [];
  const itemsMarker = /\*\*Items in the Order:\*\*/i;
  const idx = text.search(itemsMarker);
  const segment = idx >= 0 ? text.slice(0, idx) : text;
  const re = /-\s*\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\s+-\s+\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    const key = stripMarkdownEmphasis(m[1]).trim();
    const value = stripMarkdownEmphasis(m[2]).trim();
    if (key && value) rows.push({ key, value });
  }
  return rows;
}

/**
 * Numbered lines: `1. **Product** - SKU: x - Quantity: y - Line Total: z`
 * Split on each `N. **` so the last line item still parses (no fragile lookahead before Linked Invoices).
 */
function parseItemRows(text: string): ItemRow[] {
  const itemsIdx = text.search(/\*\*Items in the Order:\*\*/i);
  if (itemsIdx < 0) return [];
  const afterItems = text.slice(itemsIdx).replace(/^\s*\*\*Items in the Order:\*\*\s*/i, "");
  const linkedIdx = afterItems.search(/\*\*Linked Invoices:\*\*/i);
  const block = linkedIdx >= 0 ? afterItems.slice(0, linkedIdx) : afterItems;
  const normalized = block.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const trimmed = normalized.trim();
  if (!trimmed) return [];

  // Split before each numbered item `1. **` `2. **` (keep all segments)
  const parts = trimmed
    .split(/(?=\d+\.\s+\*\*)/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const rows: ItemRow[] = [];
  // One line per item; SKU may contain hyphens (PACK-1683)
  // Use [\s\S] instead of .+ with /s (ES2018) for older TS targets
  const lineRe =
    /^(\d+)\.\s+\*\*([^*]+)\*\*\s*-\s*SKU:\s*([\s\S]+?)\s*-\s*Quantity:\s*(\d+)\s*-\s*Line Total:\s*([\s\S]+)$/i;
  for (const part of parts) {
    const m = part.match(lineRe);
    if (m) {
      rows.push({
        no: m[1].trim(),
        product: stripMarkdownEmphasis(m[2]).trim(),
        sku: stripMarkdownEmphasis(m[3]).trim(),
        quantity: stripMarkdownEmphasis(m[4]).trim(),
        lineTotal: stripMarkdownEmphasis(m[5]).trim(),
      });
    }
  }
  return rows;
}

/**
 * After "Linked Invoices:" — e.g. `1 - **Invoice Number:** … - **Invoice Date:** …`
 */
function parseInvoiceRows(text: string): MetaRow[] {
  const linkedIdx = text.search(/\*\*Linked Invoices:\*\*/i);
  if (linkedIdx < 0) return [];
  let after = text.slice(linkedIdx).replace(/^\s*\*\*Linked Invoices:\*\*\s*/i, "");
  const stop = after.search(/\bIf you need more information/i);
  if (stop >= 0) after = after.slice(0, stop);
  let segment = after.trim();
  // Drop leading "1 - " before first **Key:**
  segment = segment.replace(/^\d+\s*-\s*/, "");
  const rows: MetaRow[] = [];
  // First pair may start at beginning: **Invoice Number:** x - **Invoice Date:** y
  const firstHead = segment.match(/^\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\s+-\s+\*\*|$)/);
  if (firstHead) {
    rows.push({
      key: stripMarkdownEmphasis(firstHead[1]).trim(),
      value: stripMarkdownEmphasis(firstHead[2]).trim(),
    });
    segment = segment.slice(firstHead[0].length).trim();
  }
  const re = /-\s*\*\*([^*]+)\*\*:\s*([\s\S]*?)(?=\s+-\s+\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(segment)) !== null) {
    rows.push({
      key: stripMarkdownEmphasis(m[1]).trim(),
      value: stripMarkdownEmphasis(m[2]).trim(),
    });
  }
  return rows;
}

export function parseMarkdownTables(text: string): MarkdownTable[] {
  const tables: MarkdownTable[] = [];
  const lines = text.split(/\r?\n/);
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      const headerLine = line;
      if (i + 1 < lines.length) {
        const separatorLine = lines[i+1].trim();
        // check if separator only contains |- : and spaces
        if (separatorLine.startsWith('|') && separatorLine.endsWith('|') && /^[|\s:-]+$/.test(separatorLine)) {
          const headers = headerLine.split('|').slice(1, -1).map(h => stripMarkdownEmphasis(h).trim());
          const rows: string[][] = [];
          
          let j = i + 2;
          while (j < lines.length) {
            const rowLine = lines[j].trim();
            if (!rowLine) {
              j++;
              continue;
            }
            if (rowLine.startsWith('|') && rowLine.endsWith('|')) {
              const cells = rowLine.split('|').slice(1, -1).map(c => stripMarkdownEmphasis(c).trim());
              rows.push(cells);
              j++;
            } else {
              break;
            }
          }
          tables.push({ headers, rows });
          i = j - 1; // offset because the outer loop increments i
        }
      }
    }
    i++;
  }
  return tables;
}

export function parseAssistantMessageToTables(text: string): ParsedAssistantTables {
  const metaRows = parseMetaRows(text);
  const itemRows = parseItemRows(text);
  const invoiceRows = parseInvoiceRows(text);
  const markdownTables = parseMarkdownTables(text);
  const hasTables = metaRows.length > 0 || itemRows.length > 0 || invoiceRows.length > 0 || markdownTables.length > 0;
  return { metaRows, itemRows, invoiceRows, markdownTables, hasTables };
}

/**
 * Small dependency-free markdown parser for assistant replies.
 *
 * Kept in a plain .ts file (no JSX) so it can be unit tested by vitest, whose
 * include pattern only picks up .test.ts files. The React renderer lives in
 * markdown-text.tsx and consumes these nodes.
 *
 * Scope is deliberately limited to what the assistant actually emits:
 * headings, paragraphs, bullet/numbered lists, blockquotes, dividers,
 * fenced code, tables and inline **bold** / *italic* / `code`.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; content: Inline[] }
  | { type: "italic"; content: Inline[] }
  | { type: "code"; value: string };

export type Block =
  | { type: "heading"; level: number; content: Inline[] }
  | { type: "paragraph"; content: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "quote"; content: Inline[] }
  | { type: "divider" }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; code: string };

const HEADING_RE = /^(#{1,4})\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+/;
const UNORDERED_RE = /^\s*[-*+]\s+/;
const QUOTE_RE = /^\s*>\s?/;
const DIVIDER_RE = /^\s*(?:-{3,}|\*{3,})\s*$/;
const FENCE_RE = /^\s*```/;

function isTableLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 1;
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && /^[|\s:-]+$/.test(t) && t.includes("-");
}

function splitRow(line: string): string[] {
  const t = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return t.split("|").map((c) => c.trim());
}

/**
 * Inline scanner. `**` is checked before `*` so bold wins over italic.
 * Underscore is intentionally NOT treated as italic — identifiers like
 * warehouse_id would otherwise produce phantom emphasis.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ type: "text", value: buf });
      buf = "";
    }
  };

  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out.push({ type: "bold", content: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      // Guard against swallowing the rest of a line (e.g. "2 * 3").
      if (end > i + 1 && end - i <= 120 && !text.slice(i + 1, end).includes("\n")) {
        flush();
        out.push({ type: "italic", content: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }
    buf += text[i];
    i += 1;
  }

  flush();
  return out;
}

export function parseMarkdown(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let i = 0;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", content: parseInline(paragraph.join(" ").trim()) });
      paragraph = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      i += 1;
      continue;
    }

    if (FENCE_RE.test(trimmed)) {
      flushParagraph();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i].trim())) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // closing fence (or EOF)
      blocks.push({ type: "code", code: code.join("\n") });
      continue;
    }

    const heading = trimmed.match(HEADING_RE);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        content: parseInline(heading[2].trim()),
      });
      i += 1;
      continue;
    }

    if (DIVIDER_RE.test(trimmed) && !ORDERED_RE.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      i += 1;
      continue;
    }

    if (isTableLine(trimmed) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      const headers = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableLine(lines[i].trim())) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }

    if (QUOTE_RE.test(line)) {
      flushParagraph();
      const quoted: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoted.push(lines[i].replace(QUOTE_RE, ""));
        i += 1;
      }
      blocks.push({ type: "quote", content: parseInline(quoted.join(" ").trim()) });
      continue;
    }

    const ordered = ORDERED_RE.test(line);
    const unordered = !ordered && UNORDERED_RE.test(line);
    if (ordered || unordered) {
      flushParagraph();
      const items: Inline[][] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (ordered && ORDERED_RE.test(l)) {
          items.push(parseInline(l.replace(ORDERED_RE, "").trim()));
          i += 1;
        } else if (!ordered && UNORDERED_RE.test(l)) {
          items.push(parseInline(l.replace(UNORDERED_RE, "").trim()));
          i += 1;
        } else if (l.trim() && items.length && /^\s{2,}\S/.test(l)) {
          // Lazy continuation of the previous item.
          const last = items[items.length - 1];
          items[items.length - 1] = [...last, ...parseInline(" " + l.trim())];
          i += 1;
        } else {
          break;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    paragraph.push(trimmed);
    i += 1;
  }

  flushParagraph();
  return blocks;
}

/** True when the text contains block-level markdown worth rendering structurally. */
export function hasBlockMarkdown(text: string): boolean {
  return parseMarkdown(text).some((b) => b.type !== "paragraph");
}

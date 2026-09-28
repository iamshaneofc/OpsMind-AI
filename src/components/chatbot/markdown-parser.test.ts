import { describe, expect, it } from "vitest";
import { hasBlockMarkdown, parseInline, parseMarkdown } from "./markdown-parser";

const inlineText = (nodes: ReturnType<typeof parseInline>): string =>
  nodes
    .map((n) => (n.type === "text" || n.type === "code" ? n.value : inlineText(n.content)))
    .join("");

describe("parseInline", () => {
  it("keeps plain text intact", () => {
    expect(inlineText(parseInline("Revenue is up"))).toBe("Revenue is up");
  });

  it("parses bold", () => {
    expect(parseInline("**$1.2M**")).toEqual([
      { type: "bold", content: [{ type: "text", value: "$1.2M" }] },
    ]);
  });

  it("parses bold with nested plain text", () => {
    expect(inlineText(parseInline("Total **42** orders"))).toBe("Total 42 orders");
  });

  it("parses inline code", () => {
    expect(parseInline("`ORD-1001`")).toEqual([{ type: "code", value: "ORD-1001" }]);
  });

  it("parses italic from single asterisks", () => {
    expect(parseInline("*pending*")).toEqual([
      { type: "italic", content: [{ type: "text", value: "pending" }] },
    ]);
  });

  it("does not treat snake_case identifiers as italic", () => {
    expect(inlineText(parseInline("warehouse_id is null"))).toBe("warehouse_id is null");
  });

  it("leaves arithmetic alone", () => {
    expect(inlineText(parseInline("2 * 3 = 6"))).toBe("2 * 3 = 6");
  });

  it("does not run bold across a newline", () => {
    const text = "**open\nstill open";
    expect(inlineText(parseInline(text))).toContain("still open");
  });
});

describe("parseMarkdown", () => {
  it("returns a single paragraph for prose", () => {
    const blocks = parseMarkdown("Here is your summary of today's orders.");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("parses headings and their level", () => {
    const blocks = parseMarkdown("## Order health\nBody");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 2 });
    expect(inlineText((blocks[0] as any).content)).toBe("Order health");
  });

  it("parses an unordered list", () => {
    const blocks = parseMarkdown("- First item\n- Second item");
    expect(blocks[0].type).toBe("list");
    expect((blocks[0] as any).ordered).toBe(false);
    expect((blocks[0] as any).items).toHaveLength(2);
    expect(inlineText((blocks[0] as any).items[1])).toBe("Second item");
  });

  it("parses an ordered list", () => {
    const blocks = parseMarkdown("1. Reconcile invoices\n2. Chase overdue");
    expect(blocks[0]).toMatchObject({ type: "list", ordered: true });
    expect((blocks[0] as any).items).toHaveLength(2);
  });

  it("parses a table with header and rows", () => {
    const md = "| Order | Total |\n| --- | --- |\n| 1001 | $500 |\n| 1002 | $750 |";
    const blocks = parseMarkdown(md);
    expect(blocks[0]).toEqual({
      type: "table",
      headers: ["Order", "Total"],
      rows: [
        ["1001", "$500"],
        ["1002", "$750"],
      ],
    });
  });

  it("separates paragraphs on blank lines", () => {
    const blocks = parseMarkdown("Intro line.\n\nSecond paragraph.");
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.type === "paragraph")).toBe(true);
  });

  it("parses blockquotes", () => {
    const blocks = parseMarkdown("> Warehouse B is below reorder point.");
    expect(blocks[0].type).toBe("quote");
  });

  it("parses a divider", () => {
    const blocks = parseMarkdown("---");
    expect(blocks[0].type).toBe("divider");
  });

  it("keeps fenced code out of paragraphs", () => {
    const blocks = parseMarkdown("Before\n```json\n{\"a\":1}\n```\nAfter");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "code", "paragraph"]);
    expect((blocks[1] as any).code).toBe('{"a":1}');
  });
});

describe("hasBlockMarkdown", () => {
  it("is false for plain prose", () => {
    expect(hasBlockMarkdown("No orders were placed today.")).toBe(false);
  });

  it("is true when headings or lists are present", () => {
    expect(hasBlockMarkdown("## Summary\n- one")).toBe(true);
  });
});

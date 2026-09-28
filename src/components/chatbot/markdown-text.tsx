import { parseInline, parseMarkdown, type Block, type Inline } from "./markdown-parser";

/**
 * Renders assistant markdown as real structure (headings, lists, quotes,
 * tables, emphasis) instead of the flat plain text the panel used to emit.
 */

function InlineText({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "bold":
            return (
              <strong key={i} className="font-semibold text-white">
                <InlineText nodes={node.content} />
              </strong>
            );
          case "italic":
            return (
              <em key={i} className="italic text-white/90">
                <InlineText nodes={node.content} />
              </em>
            );
          case "code":
            return (
              <code
                key={i}
                className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[12.5px] text-primary"
              >
                {node.value}
              </code>
            );
          default:
            return <span key={i}>{node.value}</span>;
        }
      })}
    </>
  );
}

function MarkdownTable({ block }: { block: Extract<Block, { type: "table" }> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            {block.headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <InlineText nodes={parseInline(h)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-b border-white/5 last:border-0 hover:bg-white/[0.03]">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2.5 align-top text-foreground/85">
                  <InlineText nodes={parseInline(cell)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = (block.level <= 1 ? "h2" : block.level === 2 ? "h3" : "h4") as
        | "h2"
        | "h3"
        | "h4";
      const cls =
        block.level <= 2
          ? "mt-1 text-[17px] font-semibold leading-snug text-white"
          : "mt-1 text-sm font-semibold uppercase tracking-wider text-primary";
      return <Tag className={cls}><InlineText nodes={block.content} /></Tag>;
    }
    case "paragraph":
      return (
        <p className="text-[15px] leading-relaxed text-white/90">
          <InlineText nodes={block.content} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i} className="relative pl-5 text-[15px] leading-relaxed text-white/90">
          <span className="absolute left-0 top-0 text-primary" aria-hidden>
            {block.ordered ? `${i + 1}.` : "•"}
          </span>
          <InlineText nodes={item} />
        </li>
      ));
      return block.ordered ? (
        <ol className="space-y-1.5">{items}</ol>
      ) : (
        <ul className="space-y-1.5">{items}</ul>
      );
    }
    case "quote":
      return (
        <blockquote className="border-l-2 border-primary/60 bg-white/[0.03] py-2 pl-4 text-[15px] leading-relaxed text-white/85 italic">
          <InlineText nodes={block.content} />
        </blockquote>
      );
    case "divider":
      return <hr className="border-white/10" />;
    case "table":
      return <MarkdownTable block={block} />;
    case "code":
      return (
        <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-[13px] leading-relaxed text-white/85">
          <code>{block.code}</code>
        </pre>
      );
    default:
      return null;
  }
}

export function MarkdownText({ text, className = "" }: { text: string; className?: string }) {
  if (!text?.trim()) return null;
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;

  return (
    <div className={`space-y-3 ${className}`}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

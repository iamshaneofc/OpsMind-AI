"use client";

import { FormEvent, useEffect, useMemo, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SendHorizontal, Sparkles, Trash2, Loader2, ChevronDown, Square, RefreshCw } from "lucide-react";
import { BotAvatar } from "@/components/bot-avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useChatStore, type ChatMessage } from "@/store/chat-store";
import { StructuredDataRenderer } from "./structured-data-renderer";
import {
  parseAssistantMessageToTables,
  stripMarkdownEmphasis,
  type MarkdownTable,
} from "./assistant-message-parser";
import { getComposerSuggestionChips } from "./chat-follow-up-suggestions";
import { parseAssistantJsonBlocks } from "./parse-assistant-json";
import { LaneAQuickView } from "./lane-a-quick-view";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupabaseBrowserClient } from "@/supabase/client";
import type { AppRole } from "@/types/auth";

interface ChatbotPanelProps {
  initialMessages: ChatMessage[];
  userRole: AppRole;
}

function parseNumberedItems(text: string): string[] {
  const normalized = text.replace(/\r/g, " ").replace(/\n/g, " ").trim();
  const regex = /(?:^|\s)(\d+)[.)]\s+(.+?)(?=(?:\s+\d+[.)]\s+)|$)/g;
  const matches: Array<{ idx: number; value: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(normalized)) !== null) {
    matches.push({ idx: Number(m[1]), value: stripMarkdownEmphasis(m[2]) });
  }

  // Strip any trailing clarifying question or follow-up sentence from the last item.
  // These phrases don't belong inside a table row — they belong below the Quick View.
  const TRAILING_PHRASE_RE = /\s*(could you (please )?|please (let me know|specify|clarify)|which one|this will help|let me know which|do you (know|want)|would you like).+[.?!]?\s*$/i;

  const items = matches
    .sort((a, b) => a.idx - b.idx)
    .map((x) => x.value)
    .filter(Boolean);

  if (items.length > 0) {
    items[items.length - 1] = items[items.length - 1].replace(TRAILING_PHRASE_RE, "").trim();
    // If after stripping the last item is empty, drop it
    if (!items[items.length - 1]) items.pop();
  }

  return items;
}
function stripBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*\*/g, '');
}

function sanitizeAssistantText(text: string): string {
  return text
    .replace(/```json[\s\S]*?```/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*[\[{].*[\]}]\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isInvoiceNumberedLine(value: string): boolean {
  const v = value.trim();
  if (/invoice\s*number|invoice\s*date|invoice\s*total|tax\s*invoice/i.test(v)) return true;
  if (/\b\d{2}\.\d{3}\.\d+\.\d+\b/.test(v) && /invoice/i.test(v)) return true;
  return false;
}

function parseSummaryLine(text: string): string | null {
  const match = text.match(/(showing first\s+\d+\s+of\s+\d+.*?)(?:$|\n)/i);
  return match?.[1] ? stripMarkdownEmphasis(match[1]) : null;
}

/** First N table rows visible before expanding details. */
const QUICK_VIEW_MARKDOWN_TABLE_INITIAL_ROWS = 20;
/** Cap rendered rows to super-admin order-tab scope (first 100). */
const QUICK_VIEW_MARKDOWN_TABLE_MAX_ROWS = 100;

/** Plain-text lines under `<details>`; avoid unbounded DOM on huge replies. */
const SHOW_DETAILS_PLAIN_TEXT_MAX_LINES = 120;

function QuickViewMarkdownTable({
  table,
  compact,
}: {
  table: MarkdownTable;
  /** Smaller type in the "rest" strip below intro when Quick View is off. */
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = table.rows.length;
  const cappedRows = table.rows.slice(0, QUICK_VIEW_MARKDOWN_TABLE_MAX_ROWS);
  const cappedTotal = cappedRows.length;
  const truncatedCount = Math.max(0, total - cappedTotal);
  const needsToggle = cappedTotal > QUICK_VIEW_MARKDOWN_TABLE_INITIAL_ROWS;
  const visibleRows =
    expanded || !needsToggle ? cappedRows : cappedRows.slice(0, QUICK_VIEW_MARKDOWN_TABLE_INITIAL_ROWS);
  const hiddenCount = needsToggle ? cappedTotal - QUICK_VIEW_MARKDOWN_TABLE_INITIAL_ROWS : 0;
  const thClass = compact ? "text-muted-foreground text-xs" : "text-muted-foreground";
  const tdClass = compact ? "text-foreground/80 text-sm" : "text-foreground/80";

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            {table.headers.map((h, i) => (
              <TableHead key={i} className={thClass}>
                {stripBold(h)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, rIdx) => (
            <TableRow key={rIdx} className="border-border/40 hover:bg-muted/30">
              {row.map((cell, cIdx) => (
                <TableCell key={cIdx} className={tdClass}>
                  {stripBold(cell)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {needsToggle && !expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(true)}
        >
          Show {hiddenCount} more
        </Button>
      ) : null}
      {truncatedCount > 0 ? (
        <p className="text-xs text-muted-foreground">
          Showing first {QUICK_VIEW_MARKDOWN_TABLE_MAX_ROWS} rows. Ask to refine if you need more.
        </p>
      ) : null}
    </div>
  );
}

function parseKeyValueRows(text: string): Array<{ key: string; value: string }> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => stripMarkdownEmphasis(line))
    .map((line) => {
      const i = line.indexOf(":");
      if (i <= 0 || i >= line.length - 1) return null;
      return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() };
    })
    .filter((row): row is { key: string; value: string } => !!row);
}

const AssistantQuickView = ({ text }: { text: string }) => {
  const parsed = useMemo(() => parseAssistantMessageToTables(text), [text]);
  const numberedItems = parseNumberedItems(text);
  const summary = parseSummaryLine(text);
  const keyValueRows = parseKeyValueRows(text);
  const isProductCardLikeText = /product catalog|availability overview|latest orders/i.test(text);

  // Product-card responses should render via StructuredDataRenderer only.
  // Guard against transient parser states that can duplicate a malformed quick-view table.
  if (isProductCardLikeText) return null;

  if (parsed.hasTables) {
    return (
      <div className="space-y-4 rounded-xl border border-border bg-muted/20 px-4 py-4 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Quick view</p>

        {parsed.metaRows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/80">Order details</p>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[32%] text-muted-foreground">Field</TableHead>
                  <TableHead className="text-muted-foreground">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.metaRows.map((row) => (
                  <TableRow key={`${row.key}-${row.value}`} className="border-border/40 hover:bg-muted/30">
                    <TableCell className="align-top font-medium text-foreground">{row.key}</TableCell>
                    <TableCell className="text-foreground/80">{row.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {parsed.itemRows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/80">Line items</p>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-10 text-muted-foreground">#</TableHead>
                  <TableHead className="text-muted-foreground">Product</TableHead>
                  <TableHead className="text-muted-foreground">SKU</TableHead>
                  <TableHead className="w-20 text-muted-foreground">Qty</TableHead>
                  <TableHead className="min-w-[7rem] text-muted-foreground">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.itemRows.map((row, idx) => (
                  <TableRow key={`item-${row.no}-${idx}-${row.sku}`} className="border-border/40 hover:bg-muted/30">
                    <TableCell className="text-foreground/70">{row.no}</TableCell>
                    <TableCell className="font-medium text-foreground">{row.product}</TableCell>
                    <TableCell className="text-muted-foreground">{row.sku}</TableCell>
                    <TableCell className="text-foreground/80">{row.quantity}</TableCell>
                    <TableCell className="text-foreground/80">{row.lineTotal}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {parsed.invoiceRows.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground/80">Linked invoices</p>
            <Table>
              <TableHeader>
                <TableRow className="border-border/50 hover:bg-transparent">
                  <TableHead className="w-[32%] text-muted-foreground">Field</TableHead>
                  <TableHead className="text-muted-foreground">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsed.invoiceRows.map((row) => (
                  <TableRow key={`${row.key}-${row.value}`} className="border-border/40 hover:bg-muted/30">
                    <TableCell className="align-top font-medium text-foreground">{row.key}</TableCell>
                    <TableCell className="text-foreground/80">{row.value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {parsed.markdownTables.length > 0 ? (
          <div className="space-y-4 pt-2">
            {parsed.markdownTables.map((table, tIdx) => (
              <QuickViewMarkdownTable key={tIdx} table={table} />
            ))}
          </div>
        ) : null}

        {summary ? <p className="text-xs text-muted-foreground">{summary}</p> : null}
      </div>
    );
  }

  // Try to smartly parse numbered items into a real Table if they're formatted rigidly by the AI
  const smartTableHeaders: string[] = [];
  const smartTableRows: string[][] = [];
  let isSmartTableValid = false;

  if (numberedItems.length > 0 && !numberedItems.some(isInvoiceNumberedLine)) {
    // Check if the first item has ` - ` separated Key: Value structure
    const firstItemParts = numberedItems[0].split(" - ").map(s => s.trim()).filter(Boolean);
    if (firstItemParts.length >= 2 && firstItemParts.every(p => p.includes(":"))) {
      firstItemParts.forEach(p => {
        const [k] = p.split(":");
        smartTableHeaders.push(k.trim());
      });
      // Extract rows
      let allValid = true;
      for (const item of numberedItems) {
        const parts = item.split(" - ").map(s => s.trim()).filter(Boolean);
        if (parts.length === smartTableHeaders.length && parts.every(p => p.includes(":"))) {
          const rowVals = parts.map(p => {
            const idx = p.indexOf(":");
            return p.substring(idx + 1).trim();
          });
          smartTableRows.push(rowVals);
        } else {
          allValid = false;
          break;
        }
      }
      isSmartTableValid = allValid && smartTableRows.length > 0;
    }
  }

  const renderSmartTable = () => (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            {smartTableHeaders.map((h, i) => (
              <TableHead key={i} className="text-muted-foreground whitespace-nowrap">{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {smartTableRows.map((row, rIdx) => (
            <TableRow key={rIdx} className="border-border/40 hover:bg-muted/30">
              {row.map((cell, cIdx) => (
                <TableCell key={cIdx} className="text-foreground/80 font-medium">{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  const invoiceNumbered = numberedItems.filter(isInvoiceNumberedLine);
  const productNumbered = numberedItems.filter((s) => !isInvoiceNumberedLine(s));

  if (!numberedItems.length && keyValueRows.length < 2) return null;

  const renderNumberedTable = (items: string[], heading: string, colLabel: string) => (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-foreground/80">{heading}</p>
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="w-12 text-muted-foreground">#</TableHead>
            <TableHead className="text-muted-foreground">{colLabel}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item, idx) => (
            <TableRow key={`${heading}-${idx}-${item.slice(0, 24)}`} className="border-border/40 hover:bg-muted/30">
              <TableCell className="text-foreground/70">{idx + 1}</TableCell>
              <TableCell className="text-sm font-medium text-foreground">{item}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="rounded-xl border border-border bg-muted/20 px-4 py-4 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Quick view
      </p>
      {invoiceNumbered.length > 0 && productNumbered.length > 0 ? (
        <div className="space-y-4">
          {renderNumberedTable(productNumbered, "Line items", "Product")}
          {renderNumberedTable(invoiceNumbered, "Linked invoices", "Details")}
        </div>
      ) : invoiceNumbered.length > 0 && productNumbered.length === 0 ? (
        renderNumberedTable(invoiceNumbered, "Linked invoices", "Details")
      ) : isSmartTableValid ? (
        renderSmartTable()
      ) : numberedItems.length ? (
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-12 text-muted-foreground">#</TableHead>
              <TableHead className="text-muted-foreground">Item</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {numberedItems.map((item, idx) => (
              <TableRow key={`${idx}-${item}`} className="border-border/40 hover:bg-muted/30">
                <TableCell className="text-foreground/70">{idx + 1}</TableCell>
                <TableCell className="text-sm font-medium text-foreground">{item}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-[32%] text-muted-foreground">Field</TableHead>
              <TableHead className="text-muted-foreground">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keyValueRows.map((row) => (
              <TableRow key={`${row.key}-${row.value}`} className="border-border/40 hover:bg-muted/30">
                <TableCell className="font-medium text-foreground">{row.key}</TableCell>
                <TableCell className="text-foreground/80">{row.value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {summary ? (
        <p className="mt-2 text-xs text-muted-foreground">{summary}</p>
      ) : null}
    </div>
  );
};

const MessageBubble = ({
  message,
  index,
}: {
  message: ChatMessage;
  index: number;
}) => {
  const parsedAssistant = useMemo(() => {
    if (message.role !== "assistant" || !message.content) return null;
    return parseAssistantJsonBlocks(message.content);
  }, [message.content, message.role]);

  const textContent =
    message.role === "assistant"
      ? sanitizeAssistantText(parsedAssistant?.text ?? message.content)
      : message.content;
  const hasStructuredCard = Boolean(parsedAssistant?.structuredData || parsedAssistant?.laneA);
  const hasStructuredData = Boolean(parsedAssistant?.structuredData);

  const collapseFullResponse = useMemo(() => {
    if (!textContent?.trim()) return false;
    const { hasTables } = parseAssistantMessageToTables(textContent);
    return hasTables || textContent.length > 220;
  }, [textContent]);
  const showAssistantQuickView = Boolean(!hasStructuredCard && collapseFullResponse);

  const introAndRest = useMemo(() => {
    if (!textContent) return { intro: "", rest: "", closing: "" };
    if (!collapseFullResponse) return { intro: textContent, rest: "", closing: "" };

    // Helper: detect if a paragraph is a short closing/clarifying sentence (not a list, not a table)
    const isClosingPara = (p: string) => {
      const t = p.trim();
      return (
        t.length > 0 &&
        t.length < 350 &&
        !/^\d+[.)]/.test(t) &&       // not a numbered list item
        !t.startsWith("|") &&         // not a table row
        !t.startsWith("#") &&         // not a heading
        !/^invoice\s+\S+\s+line\s+items\s*:/i.test(t) && // not a section label
        /[.?!]$/.test(t)              // ends like a sentence
      );
    };

    const paragraphs = textContent.split(/\n\n+/);

    // Pull out the last paragraph as a closing line if it looks like a standalone sentence
    let closingPara = "";
    let bodyParas = paragraphs;
    if (paragraphs.length > 2) {
      const last = paragraphs[paragraphs.length - 1];
      if (isClosingPara(last)) {
        closingPara = last.trim();
        bodyParas = paragraphs.slice(0, -1);
      }
    }

    if (bodyParas.length > 1 && bodyParas[0].length < 400) {
      return { intro: bodyParas[0], rest: bodyParas.slice(1).join("\n\n"), closing: closingPara };
    }

    const lines = textContent.split(/\n+/);
    if (lines.length > 1 && lines[0].length < 400) {
      return { intro: lines[0], rest: lines.slice(1).join("\n"), closing: closingPara };
    }

    // Fallback: Split by first sentence if it's not too long
    const firstPeriod = textContent.indexOf(".");
    if (firstPeriod > 0 && firstPeriod < 300) {
      return {
        intro: textContent.slice(0, firstPeriod + 1),
        rest: textContent.slice(firstPeriod + 1).trim(),
        closing: closingPara,
      };
    }

    return { intro: "", rest: textContent, closing: closingPara };
  }, [textContent, collapseFullResponse]);

  return (
    <motion.div
      key={`${message.role}-${index}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col gap-2 w-full max-w-3xl ${message.role === "user" ? "ml-auto" : "mr-auto"}`}
    >
      <div
        className={
          message.role === "user"
            ? "self-end rounded-2xl rounded-tr-sm bg-muted border border-border/40 px-5 py-3 text-[15px] leading-relaxed text-foreground shadow-sm max-w-[85%]"
            : "self-start w-full space-y-3"
        }
      >
        {message.role === "user" ? (
          <div className="break-words font-medium">{message.content}</div>
        ) : (
          <>
            {parsedAssistant?.laneA ? (
              <LaneAQuickView snapshot={parsedAssistant.laneA} orderNumber={parsedAssistant.orderNumberFromJson} />
            ) : null}
            {textContent?.trim() && !hasStructuredData ? (
              <div className="space-y-3">
                {collapseFullResponse ? (
                  <>
                    {introAndRest.intro && (
                      <div className="text-[15px] break-words leading-relaxed text-foreground/90 px-1 mb-2">
                        {stripBold(introAndRest.intro)}
                      </div>
                    )}
                    {showAssistantQuickView ? <AssistantQuickView text={textContent} /> : null}
                    {introAndRest.closing && (
                      <div className="text-[14px] break-words leading-relaxed text-foreground/80 px-1 pt-1">
                        {stripBold(introAndRest.closing)}
                      </div>
                    )}
                    {(() => {
                      const rawRest = introAndRest.rest.trim();
                      if (!rawRest) return null;

                      // Parse the rest into: non-table text and markdown tables
                      const parsedRest = parseAssistantMessageToTables(rawRest);
                      
                      // Get non-table text lines (strip table rows and separator rows)
                      const plainTextLines = rawRest
                        .split('\n')
                        .filter(line => (line.match(/\|/g) || []).length < 2 && !/^\s*[-|]+\s*$/.test(line))
                        .map(l => stripBold(l.replace(/\*\*/g, '').replace(/`/g, "").trim()))
                        .filter((line) => !/^\s*[\[{].*[\]}]\s*$/.test(line))
                        .filter(Boolean);

                      // If Quick View is already active, it already renders markdown tables.
                      // Avoid rendering identical table data again in the "rest" section.
                      const hasTables = !showAssistantQuickView && (parsedRest.markdownTables.length > 0 || parsedRest.hasTables);
                      const hasPlainText = plainTextLines.length > 0;

                      if (!hasTables && !hasPlainText) return null;

                      return (
                        <>
                          {!showAssistantQuickView && parsedRest.markdownTables.length > 0 && (
                            <div className="space-y-4 pt-1 pb-3">
                              {parsedRest.markdownTables.map((tbl, tIdx) => (
                                <QuickViewMarkdownTable key={tIdx} table={tbl} compact />
                              ))}
                            </div>
                          )}
                          
                          {hasPlainText && (
                            <details className="mt-2 rounded-xl border border-border/50 bg-background/50 shadow-sm px-4 py-3">
                              <summary className="cursor-pointer select-none text-sm font-medium text-foreground/80">
                                Show details
                              </summary>
                              <p className="mt-3 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">
                                {plainTextLines.slice(0, SHOW_DETAILS_PLAIN_TEXT_MAX_LINES).join("\n")}
                              </p>
                              {plainTextLines.length > SHOW_DETAILS_PLAIN_TEXT_MAX_LINES ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Long reply — only part is shown here. Ask in chat if you need more.
                                </p>
                              ) : null}
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div className="text-[15px] break-words leading-relaxed text-foreground/90 px-1">
                      {stripBold(textContent)}
                    </div>
                    {!hasStructuredCard ? <AssistantQuickView text={textContent} /> : null}
                  </>
                )}
              </div>
            ) : null}
            {parsedAssistant?.structuredData ? (
              <StructuredDataRenderer data={parsedAssistant.structuredData} />
            ) : null}
            {message.role === "assistant" &&
            message.content.trim() &&
            !textContent?.trim() &&
            !parsedAssistant?.laneA &&
            !parsedAssistant?.structuredData ? (
              <div className="text-[15px] break-words leading-relaxed text-foreground/90 px-1">
                {message.content}
              </div>
            ) : null}
          </>
        )}
      </div>
    </motion.div>
  );
};

export function ChatbotPanel({ initialMessages, userRole }: ChatbotPanelProps) {
  const [prompt, setPrompt] = useState("");
  const { messages, loading, setMessages, addMessage, setLoading, updateLastAssistantMessage, clearMessages, setCurrentUserId, loadMessages } =
    useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  // Monotonic counter: each submitted message gets its own sequence number.
  // Streaming callbacks capture the number at submission time and skip updates
  // if a newer request has already started (stale-response guard).
  const requestSequenceRef = useRef<number>(0);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setLoading(false);
    }
  }, [abortController, setLoading]);

  const hydratedMessages = useMemo(() => {
    return messages;
  }, [messages]);

  const composerPicks = useMemo(
    () => getComposerSuggestionChips(hydratedMessages, userRole, loading),
    [hydratedMessages, userRole, loading],
  );

  const inlineSuggestions = useMemo(() => {
    const q = prompt.trim().toLowerCase();
    if (!q) return [];
    return composerPicks
      .filter((s) => s.toLowerCase().includes(q))
      .slice(0, 5);
  }, [prompt, composerPicks]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      const userId = user?.id || null;
      setCurrentUserId(userId);
      setTimeout(() => loadMessages(), 100);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        clearMessages();
        setMessages([]);
        setCurrentUserId(null);
      } else if (event === "SIGNED_IN") {
        const userId = session?.user?.id || null;
        setCurrentUserId(userId);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearMessages, setMessages, setCurrentUserId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [hydratedMessages, loading]);

  const handleSubmit = useCallback(
    async (event: FormEvent, suggestion?: string) => {
      event.preventDefault();
      const input = suggestion ?? prompt;
      if (!input.trim() || loading) return;

      // Cancel any in-flight request before starting a new one.
      // This prevents the previous stream from writing into the new message bubble.
      if (abortController) {
        abortController.abort();
        setAbortController(null);
        setLoading(false);
      }

      // Bump the sequence so previous async chunks become no-ops.
      const mySequence = ++requestSequenceRef.current;

      addMessage({ role: "user", content: input });
      addMessage({ role: "assistant", content: "" });
      setPrompt("");
      setLoading(true);
      const controller = new AbortController();
      setAbortController(controller);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
          body: JSON.stringify({ messages: [...hydratedMessages, { role: "user", content: input }] }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          if (mySequence === requestSequenceRef.current) {
            updateLastAssistantMessage("Unable to process request right now. Please try again.");
          }
          setLoading(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let done = false;
        let result = "";

        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          if (chunk.value) {
            result += decoder.decode(chunk.value, { stream: true });
            // Guard: only update the UI if this is still the active request.
            if (mySequence === requestSequenceRef.current) {
              updateLastAssistantMessage(result);
            }
          }
        }
      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log("Chat generation stopped by user");
        } else {
          console.error("Chat error:", error);
          if (mySequence === requestSequenceRef.current) {
            updateLastAssistantMessage("Unable to process request right now. Please try again.");
          }
        }
      } finally {
        if (mySequence === requestSequenceRef.current) {
          setLoading(false);
          setAbortController(null);
        }
      }
    },
    [prompt, loading, abortController, addMessage, setLoading, updateLastAssistantMessage],
  );

  const handleClearChat = useCallback(() => {
    clearMessages();
    setMessages([]);
  }, [clearMessages, setMessages]);

  const handleRefreshChat = useCallback(async () => {
    if (loading) return;
    await loadMessages();
  }, [loading, loadMessages]);

  return (
    <div className="flex h-[calc(100dvh-6rem)] w-full flex-col overflow-hidden bg-transparent">
      {/* HEADER SIMPLIFICATION - Header moved to layout TopNav */}

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent">
        {hydratedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center pb-10">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-500 ring-1 ring-teal-500/20 shadow-lg shadow-teal-500/5">
              <Sparkles size={32} />
            </div>
            <h3 className="mb-2 text-2xl font-bold tracking-tight text-foreground/90">How can I help you today?</h3>
            <p className="max-w-md text-[15px] text-muted-foreground">
              Ask about orders, inventory, or operations. I&apos;m here to streamline your workflow.
            </p>
          </div>
        ) : (
          <div className="flex flex-col space-y-8 items-center">
            <AnimatePresence mode="popLayout">
              {hydratedMessages.map((message, index) => (
                <MessageBubble
                  key={`${message.role}-${index}-${message.content.slice(0, 20)}`}
                  message={message}
                  index={index}
                />
              ))}
            </AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="self-start flex items-center gap-3 w-fit rounded-2xl rounded-tl-sm bg-muted/40 px-5 py-3 text-sm text-muted-foreground border border-border/30"
              >
                <span>OpsMind AI is analyzing</span>
                <span className="flex gap-0.5 mt-1">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0 }} className="h-1 w-1 bg-muted-foreground rounded-full"></motion.span>
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.2 }} className="h-1 w-1 bg-muted-foreground rounded-full"></motion.span>
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.4, delay: 0.4 }} className="h-1 w-1 bg-muted-foreground rounded-full"></motion.span>
                </span>
              </motion.div>
            )}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* INPUT AREA */}
      <div className="mt-auto shrink-0 bg-transparent px-2 pb-2 pt-4 sm:px-4 sm:pb-4">
        <div className="mx-auto max-w-4xl">
          {/* Contextual quick picks (empty input): role starters or follow-ups from the latest turn */}
          {!prompt.trim() && !loading && (
            <div className="mb-3 flex flex-wrap gap-2">
              {composerPicks.map((item) => (
                <Button
                  key={item}
                  variant="outline"
                  size="sm"
                  onClick={(e) => handleSubmit(e, item)}
                  className="rounded-full h-8 px-4 text-xs font-medium bg-muted/30 border-border/60 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-all"
                >
                  <Sparkles size={12} className="mr-1.5 text-teal-500/70" />
                  {item}
                </Button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="relative flex items-end gap-2 rounded-2xl border border-border/60 bg-muted/20 p-2 shadow-sm transition-colors focus-within:border-teal-500/40 focus-within:bg-muted/30 focus-within:ring-1 focus-within:ring-teal-500/20">
            {hydratedMessages.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="ghost" className="mb-0.5 ml-1 h-[36px] w-[36px] shrink-0 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 p-0 flex items-center justify-center rounded-xl transition-colors">
                    <Trash2 size={16} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-background border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Chat History?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove all messages from the current conversation.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-border">Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearChat} className="bg-rose-500 hover:bg-rose-600">
                      Clear Chat
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {hydratedMessages.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleRefreshChat}
                className="mb-0.5 h-[36px] w-[36px] shrink-0 text-muted-foreground hover:text-cyan-400 hover:bg-cyan-500/10 p-0 flex items-center justify-center rounded-xl transition-colors"
                title="Refresh chat"
              >
                <RefreshCw size={16} />
              </Button>
            )}

            <div className="flex flex-col flex-1 min-h-[44px]">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Ask about orders, inventory, dispatch..."
                disabled={loading}
                className="flex-1 w-full border-0 bg-transparent px-3 py-3 text-[15px] shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                onKeyDown={(e) => {
                  if (inlineSuggestions.length) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setActiveSuggestionIndex((i) => Math.min(i + 1, inlineSuggestions.length - 1));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setActiveSuggestionIndex((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (e.key === "Tab" || e.key === "ArrowRight") {
                      if (activeSuggestionIndex >= 0 && inlineSuggestions[activeSuggestionIndex]) {
                        e.preventDefault();
                        setPrompt(inlineSuggestions[activeSuggestionIndex]);
                        setActiveSuggestionIndex(-1);
                        return;
                      }
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSubmit(e as any);
                  }
                }}
              />
              
              {inlineSuggestions.length > 0 && prompt.trim() && !loading && (
                <div className="absolute bottom-full left-0 mb-2 w-full max-w-sm rounded-xl border border-border/60 bg-background p-2 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80 z-10">
                  <div className="flex flex-col gap-1">
                    {inlineSuggestions.map((s, idx) => (
                      <Button
                        key={s}
                        type="button"
                        variant={idx === activeSuggestionIndex ? "outline" : "ghost"}
                        className="justify-start h-9 px-3 text-sm font-normal text-muted-foreground hover:text-foreground"
                        onMouseEnter={() => setActiveSuggestionIndex(idx)}
                        onClick={(e) => handleSubmit(e as any, s)}
                      >
                        <Sparkles size={14} className="mr-2 text-teal-400" />
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {loading ? (
              <Button
                type="button"
                onClick={handleStop}
                className="h-[44px] w-[44px] shrink-0 rounded-xl transition-all p-0 flex items-center justify-center bg-zinc-800 text-zinc-200 hover:bg-zinc-700 shadow-md border border-zinc-700/50"
              >
                <div className="h-3 w-3 bg-current rounded-sm" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={!prompt.trim()}
                className={`h-[44px] w-[44px] shrink-0 rounded-xl transition-all p-0 flex items-center justify-center ${
                  prompt.trim()
                    ? "bg-teal-500 text-teal-50 hover:bg-teal-600 shadow-md shadow-teal-500/20"
                    : "bg-muted text-muted-foreground hover:bg-muted"
                }`}
              >
                <SendHorizontal size={18} className={prompt.trim() ? "" : "-ml-0.5"} />
              </Button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}

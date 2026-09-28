
/** Normalize API key: trim and strip Windows CRLF so key is valid on all platforms. */
export function normalizeApiKey(raw: string | undefined): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\r\n|\r|\n/g, "").trim();
}

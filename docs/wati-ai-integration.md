# Wati AI Integration

This document describes how WhatsApp messages flow through the existing OpsMind AI chatbot engine.

## Core Principle

> **DO NOT duplicate chatbot logic.**
> WhatsApp messages are converted to match what the existing chat API expects, then processed through the same AI orchestration.

## Reused Services

| Module | Location | Purpose |
|--------|----------|---------|
| `getOpenAIClient()` | `src/ai/openai.ts` | OpenAI API client |
| `aiTools` | `src/ai/tools.ts` | ERP tool definitions |
| `executeTool()` | `src/ai/tools.ts` | Execute ERP queries |
| `loadCompanyErpAccounts()` | `src/services/auth.ts` | Load ERP account mapping |
| `mapRoleIdToAppRole()` | `src/services/auth.ts` | Role mapping |
| `createSupabaseServerClient()` | `src/supabase/server.ts` | Supabase client |
| `UserProfile` | `src/types/auth.ts` | User profile type |

## Full Request Lifecycle

```
WhatsApp User
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  POST /api/wati/webhook                                                   │
│  (src/app/api/wati/webhook/route.ts)                                     │
│                                                                          │
│  1. Validate payload                                                     │
│  2. Normalize message                                                    │
│  3. Log request                                                          │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  authenticateWhatsAppUser()                                             │
│  (src/integrations/wati/whatsapp-auth.ts)                               │
│                                                                          │
│  1. Normalize phone number                                              │
│  2. Lookup in user_whatsapp_accounts                                    │
│  3. Fallback to users.phone                                             │
│  4. Load ERP accounts via loadCompanyErpAccounts()                      │
│  5. Return WatiUserProfile                                               │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  createSession()                                                         │
│  (src/integrations/wati/session-manager.ts)                              │
│                                                                          │
│  1. Create session with user context                                    │
│  2. Store profile, role, company, ERP accounts                           │
│  3. Set state: AUTHENTICATED → ACTIVE                                   │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  processWatiChatMessage()                                                │
│  (src/integrations/wati/wati-chat-adapter.ts)                           │
│                                                                          │
│  1. Build UserProfile from session context                               │
│  2. Prepare messages in OpenAI format                                   │
│  3. Call OpenAI with system prompt + tools (SAME as web chat)          │
│  4. Execute any tool calls via executeTool()                            │
│  5. Get final response                                                  │
│  6. Format for WhatsApp                                                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  executeTool()                                                           │
│  (src/ai/tools.ts) — REUSED, NOT DUPLICATED                             │
│                                                                          │
│  Tool executions use EXACT same logic as web chat:                      │
│  • getOrderStatus → SQL Server ERP                                      │
│  • getWarehouseInventory → SQL Server ERP                              │
│  • getInvoiceDetails → SQL Server ERP                                   │
│  • getProductTrackingAndInventory → SQL Server ERP                      │
│  • getDistributors → SQL Server ERP                                     │
│  • etc.                                                                 │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  formatForWhatsApp()                                                    │
│  (src/integrations/wati/wati-chat-adapter.ts)                          │
│                                                                          │
│  1. Remove code blocks                                                  │
│  2. Simplify markdown links                                             │
│  3. Convert bold → underline                                            │
│  4. Truncate if too long                                                │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  sendWatiMessage()                                                       │
│  (src/integrations/wati/wati-client.ts)                                 │
│                                                                          │
│  1. Send response via Wati API                                          │
│  2. Return to WhatsApp user                                             │
└─────────────────────────────────────────────────────────────────────────┘
```

## Integration Diagram

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        WhatsApp User                                      │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      Wati Platform                                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │ POST /api/wati/webhook
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               API Route (route.ts)                                       │
│               • Validate payload                                         │
│               • Normalize message                                        │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               WhatsApp Auth (whatsapp-auth.ts)                          │
│               • authenticateWhatsAppUser()                              │
│               • loadCompanyErpAccounts() ← REUSE                         │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               Session Manager (session-manager.ts)                       │
│               • createSession()                                          │
│               • Store user context                                       │
└───────────────────────────────┬───────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────┐
│           ┌──────────────────────────────────────────────────────┐        │
│           │     Wati Chat Adapter (wati-chat-adapter.ts)         │        │
│           │                                                      │        │
│           │  1. Build UserProfile                                │        │
│           │  2. prepareMessages() → OpenAI format                │        │
│           │  3. Call OpenAI with SAME prompt as web chat         │        │
│           │  4. Execute tools via executeTool() ← REUSE         │        │
│           │  5. Format response for WhatsApp                    │        │
│           └──────────────┬───────────────────────────────────────┘        │
└───────────────────────────────┼───────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  src/ai/openai  │  │  src/ai/tools    │  │ src/services/    │
│                 │  │                 │  │ auth.ts │
│  • getOpenAI    │  │  • aiTools      │  │                 │
│    Client()     │  │  • executeTool()│  │  • loadCompany  │
│                 │  │                 │  │    ErpAccounts  │
│  ← REUSE        │  │  ← REUSE        │  │                 │
│                 │  │                 │  │  ← REUSE        │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                               │
                               ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    SQL Server ERP                                         │
│                    • sales_order_header                                   │
│                    • ACCOUNT_MASTER                                       │
│                    • Location                                             │
│                    • Product_Master                                       │
│                    • etc.                                                 │
└───────────────────────────────────────────────────────────────────────────┘
```

## Authorization Chain

```
WhatsApp Message
     │
     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Phone Lookup                                                            │
│  ├── user_whatsapp_accounts.whatsapp_number (primary)                    │
│  └── users.phone / users.telephone (fallback)                           │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Role Validation                                                           │
│  Valid roles: super_admin, distributor, warehouse                         │
│  Invalid roles are rejected                                               │
└──────────────────────────────┬────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  ERP Scope Loading                                                        │
│  ├── loadCompanyErpAccounts() → erp_account_ids[]                         │
│  ├── base_warehouse_id from companies table                              │
│  └── Role-based access filtering via profile.role                         │
└──────────────────────────────┬─────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Tool-Level Authorization                                                 │
│  └── executeTool() checks profile.role before executing                  │
│      • Distributors: Can only see their company orders/invoices          │
│      • Warehouse: Can only see their warehouse data                       │
│      • Super Admin: Can see all data                                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Same Prompts, Same Behavior

The WhatsApp channel uses the **exact same system prompt** as the web chat:

```typescript
// In wati-chat-adapter.ts
const WHATSAPP_SYSTEM_PROMPT = `You are OpsMind Operations AI...`;
// This is a subset of the full web chat prompt
// Full prompt: src/app/api/chat/route.ts SYSTEM_PROMPT
```

### Shared Prompt Rules

1. **Access Control** - Distributors vs Warehouse vs Super Admin rules are enforced
2. **Warehouse Context** - Warehouse users get their warehouse_id from profile automatically
3. **Inventory Queries** - Super Admin/Distributor without warehouse → getAllInventory
4. **Order Format** - Markdown tables for order lists
5. **List Formatting** - No bullet points for lists, must use markdown tables
6. **Typo Handling** - Same product name typo detection
7. **Lane A** - Same order status explanation formatting

## Same Tools, Same Results

```
┌────────────────────────────────────────────────┐
│  WhatsApp User asks: "Status of order 6.105..." │
└────────────────────┬───────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────┐
│  processWatiChatMessage()                       │
│  │                                              │
│  │  assistantMessage = await openai.chat...    │
│  │  tool_calls = [getOrderStatus]              │
│  │                                              │
│  │  result = executeTool('getOrderStatus',    │
│  │    {orderNumber: '6.105...'}, profile)     │
│  │           │                                 │
└───────────────┼─────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│  executeTool() in src/ai/tools.ts               │
│  │ (SAME function as web chat!)               │
│  │                                              │
│  if (toolName === 'getOrderStatus')           │
│    return sqlServerOps.sqlServerGetOrder...   │
│  │                                              │
└───────────────┬─────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│  Same SQL Server query, same results           │
└────────────────────────────────────────────────┘
```

## Message Formatting

WhatsApp doesn't support markdown formatting like the web UI, so responses are adapted:

| Web Chat Format | WhatsApp Format |
|-----------------|-----------------|
| `**bold**` | `_underline_` |
| `*italic*` | `_italic_` |
| `[text](url)` | `text` |
| ` ```code``` ` | (removed) |
| `\`inline code\`` | `code` |
| Markdown tables | WhatsApp tables (supported) |

## Logging

All WhatsApp chat interactions are logged to the `chatbot_messages` table:

```typescript
logWatiChatInteraction(
  phoneNumber,
  userId,
  message,
  response,
  toolCalls,
  error
);
```

The `role` field is set to `'whatsapp'` to distinguish from web chat logs.

## Error Handling

| Error | Response |
|-------|----------|
| OpenAI API error | "I apologize, but I encountered an error processing your request. Please try again." |
| Tool execution error | Tool-specific error message from ERP |
| Session not found | Trigger re-authentication flow |
| Invalid role | "WhatsApp access is not enabled for your account." |

## Files Structure

```
src/integrations/wati/
├── wati-chat-adapter.ts     ← NEW: Bridge to existing AI engine
├── whatsapp-auth.ts         ← NEW: Phone-based authentication
├── session-manager.ts       ← NEW: Session state management
├── wati-client.ts           ← NEW: Wati API client
├── types.ts                ← UPDATED: Shared types
├── constants.ts            ← NEW: Configuration
├── webhook-handler.ts      ← UPDATED: Uses new auth + adapter
├── onboarding-flow.ts      ← NEW: Optional onboarding
│
src/ai/
├── openai.ts               ← REUSED (unchanged)
├── tools.ts                ← REUSED (unchanged)
│
src/services/
├── auth.ts                 ← REUSED (unchanged)
│
src/supabase/
├── server.ts               ← REUSED (unchanged)
```

## Key Principle

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   Web Chat  ─────┐                                  │
│                  ├──▶  AI Engine (SAME)  ──▶  ERP   │
│   WhatsApp ─────┘                                  │
│                                                     │
│   Both channels use:                                │
│   • Same OpenAI client                              │
│   • Same system prompt                              │
│   • Same tools (aiTools)                           │
│   • Same executeTool()                             │
│   • Same ERP queries                               │
│   • Same authorization logic                       │
│                                                     │
└─────────────────────────────────────────────────────┘
```
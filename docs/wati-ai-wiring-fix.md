# Wati AI Integration Wiring Fix

This document describes the fix for connecting the WhatsApp channel to the real SRL AI engine.

## What Was Broken

### Root Cause

The webhook handler was configured to use a **placeholder** AI implementation instead of the **real** AI adapter:

**Before (broken):**
```typescript
// webhook-handler.ts line 17
import { processChatMessage } from './chat-orchestrator';
```

The `chat-orchestrator.ts` file contained only placeholder responses:
```typescript
// chat-orchestrator.ts (PLACEHOLDER)
const simpleResponses = [
  `I understand you're asking about "${userMessage}". This feature is coming soon!`,
  // ...
];
return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
```

Additionally, `webhook-handler.ts` had a local redefinition that shadowed any real implementation:
```typescript
// Lines 275-287 - LOCAL PLACEHOLDER (shadowed the import)
async function processChatMessage(
  message: string,
  context: Record<string, unknown>
): Promise<{ text: string }> {
  console.log(`[Wati Chat] Processing message: ${message.substring(0, 50)}...`);
  return {
    text: 'Processing your request via our AI engine...',
  };
}
```

### Impact

| Issue | Effect |
|-------|--------|
| Users received placeholder responses | No real ERP data accessible |
| AI orchestration not connected | WhatsApp channel non-functional |
| Architecture goal violated | Duplicate AI logic instead of reuse |

---

## What Was Changed

### 1. Updated Import

**FROM:**
```typescript
import { processChatMessage } from './chat-orchestrator';
```

**TO:**
```typescript
import { processWatiChatMessage, type WatiChatContext } from './wati-chat-adapter';
```

### 2. Added Context Builder

Created `buildChatContext()` function to convert session state to the adapter's expected format:

```typescript
function buildChatContext(session): WatiChatContext {
  return {
    userId: session.userId ?? 0,
    phoneNumber: session.phoneNumber,
    role: session.role || 'distributor',
    roleId: mapRoleToRoleId(session.role),
    companyId: session.companyId ?? null,
    warehouseId: session.context.lastWarehouseId ?? null,
    baseWarehouseId: session.context.lastWarehouseId ?? null,
    erpAccountId: null,
    erpAccountIds: null,
  };
}
```

### 3. Updated handleChatMessage

Rewrote to properly call the AI adapter:

```typescript
async function handleChatMessage(session, messageText) {
  // Build chat context from session
  const chatContext = buildChatContext(session);

  // Build chat request
  const chatRequest = {
    message: messageText,
    phoneNumber: session.phoneNumber,
    sessionId: session.sessionId,
    messageHistory: session.messages.slice(-10).map(...),
  };

  // Call REAL AI adapter (connects to SRL engine)
  const aiResponse = await processWatiChatMessage(chatRequest, chatContext);

  // Send response via Wati
  await sendWatiMessage(session.phoneNumber, aiResponse.text, config);
}
```

### 4. Added Debug Logging

Added structured logging at key points:
- Incoming message
- Authenticated user context
- AI request
- Tool execution
- AI response

### 5. Removed Dead Code

- Removed import from `chat-orchestrator.ts` (placeholder file)
- Removed local `processChatMessage` redefinition
- Removed `chat-orchestrator.ts` from the integration chain

---

## Final Request Lifecycle

```
WhatsApp User
     │
     ▼
┌─────────────────────────────────────────────────────┐
│ POST /api/wati/webhook                              │
│ (route.ts - validates, normalizes, logs)           │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ handleWatiWebhook(event)                           │
│ (route: switch by event type)                     │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ handleSessionStart(event)                          │
│ • authenticateWhatsAppUser(phone)                 │
│   → user_whatsapp_accounts lookup                 │
│   → loadCompanyErpAccounts()                     │
│ • createSession()                                 │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ handleIncomingMessage(event)                       │
│ • getSessionByPhone(phone)                        │
│ • addMessageToSession()                           │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ handleChatMessage(session, message)               │
│ • buildChatContext(session) → WatiChatContext     │
│ • buildChatRequest() → WatiChatRequest            │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ processWatiChatMessage(request, context)         │
│ (wati-chat-adapter.ts - REAL IMPLEMENTATION)       │
├─────────────────────────────────────────────────────┤
│ 1. buildUserProfile(context) → UserProfile       │
│ 2. prepareMessages(message, history)              │
│ 3. Call OpenAI with system prompt + tools         │
│ 4. Execute tool calls via executeTool()            │
│ 5. Format response for WhatsApp                   │
└──────────────────────────┬──────────────────────────┘
                           │
          ┌───────────────┴───────────────┐
          ▼                               ▼
┌─────────────────────┐    ┌─────────────────────────┐
│  src/ai/openai.ts   │    │   src/ai/tools.ts      │
│                     │    │                         │
│  getOpenAIClient()  │    │  • aiTools (ERP tools) │
│                     │    │  • executeTool()       │
│  ← REUSED           │    │                         │
└─────────────────────┘    │  ← REUSED               │
                           └─────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────┐
│               SQL Server ERP                       │
│  • sales_order_header                             │
│  • ACCOUNT_MASTER                                 │
│  • Location                                       │
│  • Product_Master                                │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ formatForWhatsApp(response)                        │
│ • Remove code blocks                              │
│ • Convert markdown                                │
│ • Truncate if too long                            │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│ sendWatiMessage(phone, response, config)           │
│ (wati-client.ts - Wati API call)                  │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
                    WhatsApp User
```

---

## Reused SRL Services

| Service | Location | Purpose |
|---------|----------|---------|
| `getOpenAIClient()` | `src/ai/openai.ts` | OpenAI API client |
| `aiTools` | `src/ai/tools.ts` | ERP tool definitions |
| `executeTool()` | `src/ai/tools.ts` | Execute ERP queries |
| `loadCompanyErpAccounts()` | `src/services/auth.ts` | ERP account mapping |
| `mapRoleIdToAppRole()` | `src/services/auth.ts` | Role mapping |
| `createSupabaseServerClient()` | `src/supabase/server.ts` | Supabase client |

---

## Architecture Validation

### ✓ Correct Wiring

| Component | Status |
|-----------|--------|
| Webhook → Auth | ✓ Connected |
| Auth → Session | ✓ Connected |
| Session → AI Adapter | ✓ **FIXED** - Now uses wati-chat-adapter.ts |
| AI Adapter → OpenAI | ✓ Reuses getOpenAIClient() |
| OpenAI → Tools | ✓ Reuses aiTools + executeTool() |
| Tools → ERP | ✓ Reuses SQL Server queries |
| AI Response → WhatsApp | ✓ Via Wati API |

### ✓ No Duplication

| Check | Result |
|-------|--------|
| Prompts duplicated? | NO - Uses same WHATSAPP_SYSTEM_PROMPT |
| Tools duplicated? | NO - Reuses aiTools |
| ERP logic duplicated? | NO - Reuses executeTool |
| Auth logic duplicated? | NO - Reuses authenticateWhatsAppUser |

---

## Files Changed

### Modified

| File | Change |
|------|--------|
| `src/integrations/wati/webhook-handler.ts` | Removed placeholder, connected to real adapter |

### Removed from Integration Chain

| File | Reason |
|------|--------|
| `src/integrations/wati/chat-orchestrator.ts` | Placeholder - not used |

### Verified Working

| File | Status |
|------|--------|
| `src/integrations/wati/wati-chat-adapter.ts` | ✓ Complete - now connected |
| `src/ai/openai.ts` | ✓ Reused |
| `src/ai/tools.ts` | ✓ Reused |
| `src/services/auth.ts` | ✓ Reused |

---

## Debug Logging

The integration now includes structured logging:

```
[wati_webhook_abc123] Wati webhook received
[wati_webhook_abc123] Event: message, Phone: +919999999999
[wati_webhook_abc123] Session start for +919999999999
[wati_webhook_abc123] Authenticated user 12345, company: ABC Pharma
[wati_webhook_abc123] Message from +919999999999: "Show my orders"
[wati_webhook_abc123] Chat context: { userId: 12345, role: 'distributor', companyId: 5 }
[wati_webhook_abc123] Processing: "Show my orders"
[wati_webhook_abc123] User: distributor (id: 12345, company: 5)
[wati_webhook_abc123] AI response: "Here are your pending orders..."
[wati_webhook_abc123] Tool calls executed: ["getDistributorOrders"]
[wati_webhook_abc123] AI response received: "Here are your pending orders..."
[wati_webhook_abc123] Completed in 1234ms
```

---

## Verification Checklist

- [x] Webhook now reaches real AI adapter
- [x] Real AI responses are generated
- [x] Existing SRL orchestration is reused
- [x] ERP tools execute properly
- [x] Placeholder responses fully removed
- [x] No duplicate chatbot logic exists

---

## Before/After Comparison

| Aspect | Before | After |
|--------|--------|-------|
| Import | `from './chat-orchestrator'` | `from './wati-chat-adapter'` |
| Implementation | Placeholder code | Real AI with OpenAI |
| ERP Access | None | Via executeTool() |
| Response | Fake responses | Real AI responses |
| Architecture | Violated - duplicate logic | Correct - reuse |
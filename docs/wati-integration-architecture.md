# Wati WhatsApp Integration Architecture

This document outlines the architecture for adding WhatsApp as a communication channel via Wati, while reusing the existing OpsMind AI/chatbot engine.

## Overview

The Wati integration adds WhatsApp as an additional channel that uses the **same AI engine, ERP services, and authentication logic** as the existing web chatbot. This avoids duplicating AI orchestration and keeps ERP query logic centralized.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        WhatsApp Users                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Wati Webhook Handler                          │
│                   (src/integrations/wati/                       │
│                    webhook-handler.ts)                          │
└──────────────┬─────────────────────────┬───────────────────────┘
               │                         │
               ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────────────┐
│  Session Manager         │  │  Authentication Handler          │
│  (session-manager.ts)    │  │  (whatsapp-auth.ts)              │
│                          │  │                                   │
│  - Creates/updates       │  │  - Phone-based auth              │
│    sessions              │  │  - OTP verification (future)     │
│  - Tracks state          │  │  - User profile lookup           │
│  - Stores context        │  │                                   │
└──────────────┬───────────┘  └──────────────┬───────────────────┘
               │                             │
               └──────────────┬──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Chat Orchestrator (NEW)                            │
│              (chat-orchestrator.ts)                             │
│                                                              │
│  - Bridges WhatsApp to existing AI engine                     │
│  - Formats messages for WhatsApp                             │
│  - Handles tool execution                                    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│           REUSE: Existing AI/Chatbot Engine                   │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  src/ai/openai.ts                                      │    │
│  │  - OpenAI client configuration                        │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  src/ai/tools.ts                                        │    │
│  │  - ERP tool definitions                                │    │
│  │  - executeTool() function                              │    │
│  └────────────────────────────────────────────────────────┘    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  src/app/api/chat/route.ts                            │    │
│  │  - System prompt (role-based access)                  │    │
│  │  - Message handling logic                              │    │
│  │  - Response formatting                                 │    │
│  └────────────────────────────────────────────────────────┘    │
└──────────────┬───────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│           REUSE: Existing Services                             │
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐  │
│  │ Auth Service    │  │ ERP Services     │  │ Supabase   │  │
│  │ src/services/   │  │ src/sql-server/  │  │ Client     │  │
│  │ auth.ts         │  │ client.ts        │  │            │  │
│  │                 │  │ operations.ts    │  │            │  │
│  │ - User profile  │  │                  │  │ - Users    │  │
│  │ - ERP accounts  │  │ - Order queries  │  │ - Companies│  │
│  │ - Role mapping  │  │ - Inventory      │  │ - Auth     │  │
│  └──────────────────┘  └──────────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Webhook Handler (`webhook-handler.ts`)

**Responsibility**: Receives and routes Wati webhook events

**Flow**:
1. Receive webhook events (sessionStart, message, sessionEnd, etc.)
2. Route to appropriate handler based on event type
3. Manage session lifecycle
4. Send responses back via Wati API

**Key Functions**:
- `handleWatiWebhook()` - main entry point
- `handleIncomingMessage()` - process user messages
- `handleSessionStart()` - new user welcome flow

### 2. Session Manager (`session-manager.ts`)

**Responsibility**: Maintains conversation state per WhatsApp user

**State Machine**:
```
NEW_USER → AUTHENTICATING → AUTHENTICATED → [ONBOARDING] → ACTIVE
                                                      ↓
                                              AWAITING_RESPONSE
```

**Data Stored**:
- Session ID, phone number
- User ID, company ID, role (if authenticated)
- Current state
- Conversation context (last order, warehouse, product)
- Message history (last 50 messages)

### 3. Authentication Handler (`whatsapp-auth.ts`)

**Responsibility**: Authenticate WhatsApp users via phone number

**Flow**:
1. Look up user by phone in Supabase `users` table
2. Load ERP account mapping via existing `loadCompanyErpAccounts()`
3. Return profile for session creation

**Reuses**:
- `loadCompanyErpAccounts()` from `src/services/auth.ts`
- `createSupabaseServerClient()` from `src/supabase/server.ts`
- Role mapping from `mapRoleIdToAppRole()`

### 4. Onboarding Flow (`onboarding-flow.ts`)

**Responsibility**: Collect additional info for new users (if enabled)

**Steps**:
1. Company name
2. Contact name
3. Email (for account linking)

**Config**: Can be disabled via `WATI_ONBOARDING_ENABLED` env var

### 5. Chat Orchestrator (`chat-orchestrator.ts`)

**Responsibility**: Bridge WhatsApp messages to existing AI engine

**Key Functions**:
- `processChatMessage()` - main entry point
- `formatForWhatsApp()` - adapt AI responses for WhatsApp
- `executeToolForWhatsApp()` - run ERP tools and format results

### 6. Wati Client (`wati-client.ts`)

**Responsibility**: Send messages via Wati API

**Functions**:
- `sendWatiMessage()` - text message
- `sendWatiInteractiveMessage()` - with buttons
- `sendWatiTemplate()` - template message
- `sendOrderStatusNotification()` - order alerts
- `sendInventoryAlertNotification()` - inventory alerts

## Reusable Modules

| Module | Location | Reused By |
|--------|----------|-----------|
| OpenAI client | `src/ai/openai.ts` | Chat orchestrator |
| AI tools definition | `src/ai/tools.ts` | Chat orchestrator |
| executeTool function | `src/ai/tools.ts` | Chat orchestrator |
| Auth service | `src/services/auth.ts` | WhatsApp auth |
| loadCompanyErpAccounts | `src/services/auth.ts` | WhatsApp auth |
| SQL Server client | `src/sql-server/client.ts` | ERP queries |
| SQL Server operations | `src/sql-server/operations.ts` | ERP queries |
| Supabase client | `src/supabase/server.ts` | Auth, user lookup |
| Supabase admin | `src/supabase/admin.ts` | Session storage |

## Webhook Flow

```
WhatsApp User
     │
     ▼
Wati Platform
     │
     │ POST /api/wati/webhook
     ▼
Webhook Handler
     │
     ├─→ sessionStart → Auth → Session → Active
     │
     ├─→ message → Find Session
     │                 │
     │                 ├─→ NEW_USER → Auth
     │                 │
     │                 ├─→ AUTHENTICATED → AI Engine
     │                 │
     │                 └─→ ONBOARDING → Collect Info
     │
     ├─→ sessionEnd → Archive Session
     │
     └─→ optIn/optOut → Update Preferences
```

## Auth Flow

```
User messages via WhatsApp
         │
         ▼
  ┌─────────────────┐
  │ Auth by phone   │─────────→ Not found → Prompt web registration
  └────────┬────────┘
           │
           ▼
  ┌─────────────────────────┐
  │ Lookup in Supabase      │
  │ users table (phone)     │
  └────────┬────────────────┘
           │
           ▼
  ┌─────────────────────────┐
  │ Load ERP accounts       │
  │ (reuse auth.ts)         │
  └────────┬────────────────┘
           │
           ▼
  Create authenticated session
           │
           ▼
  Check onboarding needed?
           │
           ├─→ Yes → Onboarding flow
           │
           └─→ No → Active chat
```

## ERP Scope Flow

```
WhatsApp Message
         │
         ▼
Chat Orchestrator
         │
         ▼
┌─────────────────────┐
│ Build user profile  │
│ (from session)      │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Call executeTool()  │─────── Reuses existing AI tools!
│ from src/ai/tools   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Tool executes ERP   │
│ queries via         │
│ src/sql-server/     │
└──────────┬──────────┘
           │
           ▼
Response formatted for
WhatsApp (no markdown)
```

## Onboarding Flow (Optional)

```
AUTHENTICATED (no company)
         │
         ▼
State → ONBOARDING
         │
         ▼
Step 1: "Enter company name"
         │
         ▼
User replies with company name
         │
         ▼
Step 2: "Enter your name"
         │
         ▼
User replies
         │
         ▼
Step 3: "Enter email"
         │
         ▼
User replies
         │
         ▼
Validate & Save to user record
         │
         ▼
State → ACTIVE
```

## Future: Notification Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Notification Triggers                    │
├─────────────────────────────────────────────────────────────┤
│  Order Status Changes   →  sendOrderStatusNotification()   │
│  Inventory Low Stock    →  sendInventoryAlertNotification()│
│  Invoice Generated      →  sendInvoiceNotification()       │
│  Delivery Updates       →  sendDeliveryNotification()      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Notification Queue                       │
│  (Future: Redis/Bull for reliable delivery)                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Wati Send API                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    WhatsApp User
```

## Environment Variables

### Required
```env
WATI_API_KEY=your_wati_api_key
WATI_PHONE_NUMBER=+91XXXXXXXXXX
WATI_WEBHOOK_SECRET=your_webhook_secret
```

### Optional
```env
WATI_API_BASE_URL=https://wati-api.wati.io
WATI_SESSION_TIMEOUT_MINUTES=30
WATI_ONBOARDING_ENABLED=true
WATI_MAX_MESSAGE_LENGTH=4096
```

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Session timeout | User needs to re-authenticate | Use longer timeout (30 min), store session in Redis |
| Auth by phone fails | Users can't access | Fallback to OTP flow |
| WhatsApp message length | Long responses truncated | Format appropriately, use multi-part |
| No webhook retry | Lost messages | Implement retry queue |
| Different user experience | Inconsistent with web | Align prompts and responses |

## Recommended Next Steps

1. **Add Wati API route**: Create `src/app/api/wati/webhook/route.ts` to receive webhooks
2. **Integrate AI engine**: Complete `chat-orchestrator.ts` to call existing chat logic
3. **Test auth flow**: Verify phone-based lookup works correctly
4. **Add signature verification**: Secure webhook endpoint
5. **Enable notifications**: Add order/inventory alert sending

## Files Structure

```
src/integrations/wati/
├── types.ts              # Type definitions
├── constants.ts          # Configuration constants
├── wati-client.ts        # Wati API client
├── whatsapp-auth.ts      # Authentication handler
├── session-manager.ts    # Session state management
├── onboarding-flow.ts    # Onboarding (optional)
├── webhook-handler.ts    # Main webhook processor
└── chat-orchestrator.ts  # Bridge to existing AI engine
```
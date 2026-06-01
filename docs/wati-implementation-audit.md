# Wati Integration Audit Report

**Date:** 2026-05-15
**Branch:** feature/wati-integration
**Auditor:** Claude Code

---

## Executive Summary

This audit evaluates the Wati WhatsApp integration implementation against the project goals of reusing existing SRL AI/chatbot orchestration, avoiding duplicate AI logic, and enabling secure WhatsApp access.

| Aspect | Status | Completion |
|--------|--------|------------|
| **Architecture** | Sound | 90% |
| **Webhook Implementation** | Complete | 95% |
| **Authentication Flow** | Complete | 85% |
| **OTP Onboarding** | Partially Complete | 75% |
| **AI Integration** | **CRITICAL ISSUE** | 40% |
| **Database/Schema** | Complete | 95% |
| **Security** | Partial | 70% |
| **Overall** | **Major Issue Found** | **70%** |

**CRITICAL FINDING:** The AI orchestration integration is NOT properly connected. The webhook handler uses a placeholder `processChatMessage` function that was locally redefined, bypassing the actual implementation in `wati-chat-adapter.ts`.

---

## Current Architecture

### Folder Structure

```
src/integrations/wati/
├── types.ts              ✓ Complete (types defined)
├── constants.ts          ✓ Complete (config, OTP settings)
├── session-manager.ts    ✓ Complete (in-memory sessions)
├── whatsapp-auth.ts      ✓ Complete (phone lookup, ERP scope)
├── wati-client.ts        ⚠ Placeholder (mock responses)
├── wati-chat-adapter.ts  ✓ COMPLETE (real AI integration - NOT USED!)
├── chat-orchestrator.ts  ✗ PLACEHOLDER (not connected)
├── webhook-handler.ts    ⚠ BUGGY (uses placeholder, not adapter)
├── onboarding-flow.ts    ✓ Complete (OTP flow states)
└── otp-service.ts       ✓ Complete (OTP generation/verification)

src/app/api/wati/
└── webhook/
    └── route.ts         ✓ Complete (webhook receiver)
```

### Architecture Assessment

**Strengths:**
- Clean separation of concerns
- Reuses existing SRL services (auth, ERP tools, OpenAI client)
- Types well-defined
- Configuration centralized in constants.ts
- Documentation complete

**Issues:**
- `wati-chat-adapter.ts` (real implementation) is not connected
- `chat-orchestrator.ts` (placeholder) is being used
- Webhook handler redefines imported function (shadowing bug)
- In-memory storage for sessions/OTP (not production-ready)

---

## Implemented Components

### 1. Webhook Implementation ✓

**Status:** COMPLETE

| Component | Status | Notes |
|-----------|--------|-------|
| Endpoint | ✓ | `POST /api/wati/webhook` |
| GET Health Check | ✓ | `GET /api/wati/webhook` |
| Request Validation | ✓ | Validates event, phone fields |
| JSON Parsing | ✓ | Error handling for invalid JSON |
| Payload Normalization | ✓ | Text, image, audio, document, location |
| Logging | ✓ | Request ID for tracing |
| Error Handling | ✓ | 400/500 responses |

**Endpoint Path:** `/api/wati/webhook`

**Sample Wati Payload:**
```json
{
  "event": "message",
  "phone": "+919999999999",
  "waId": "919999999999",
  "profileName": "John",
  "message": { "text": "Show my orders" },
  "timestamp": 1715678000000
}
```

**Normalized Object:**
```json
{
  "channel": "whatsapp",
  "phoneNumber": "+919999999999",
  "message": "Show my orders",
  "messageType": "text",
  "timestamp": "2024-05-14T10:33:20.000Z",
  "waId": "919999999999"
}
```

---

### 2. Authentication Flow ✓

**Status:** 85% COMPLETE

| Function | Status | Location |
|----------|--------|----------|
| Phone lookup (primary) | ✓ | `user_whatsapp_accounts` table |
| Phone lookup (fallback) | ✓ | `users.phone` / `users.telephone` |
| ERP scope loading | ✓ | `loadCompanyErpAccounts()` |
| Role mapping | ✓ | `mapRoleIdToAppRole()` |
| Company loading | ✓ | Via Supabase |
| Authorization check | ✓ | Role validation |

**Auth Flow:**
```
WhatsApp message → Normalize phone
                      ↓
         user_whatsapp_accounts (primary)
                      ↓ (if not found)
              users.phone (fallback)
                      ↓
         Check role for WhatsApp access
                      ↓
         Load ERP accounts via loadCompanyErpAccounts()
                      ↓
         Return WatiUserProfile
```

**Reused Services:**
- `loadCompanyErpAccounts()` from `src/services/auth.ts` ✓
- `mapRoleIdToAppRole()` from `src/services/auth.ts` ✓
- `createSupabaseServerClient()` from `src/supabase/server.ts` ✓

---

### 3. OTP Onboarding Flow ⚠

**Status:** 75% COMPLETE

**Implemented:**
- ✓ Onboarding state machine (WAITING_FOR_EMAIL → OTP_SENT → COMPLETED)
- ✓ OTP generation (6-digit)
- ✓ OTP hashing (simple hash - needs improvement)
- ✓ OTP expiry (5 minutes)
- ✓ Rate limiting (5/hour)
- ✓ Retry protection (max 3 attempts)
- ✓ Brute-force lockout (15 minutes)
- ✓ Email validation
- ✓ User existence check
- ✓ WhatsApp linking (via upsert to user_whatsapp_accounts)

**Not Implemented:**
- ✗ Actual Resend API integration (only logs code in test mode)
- ✗ Proper crypto for OTP hashing (uses simple hash)
- ✗ Redis storage (in-memory only)

**Onboarding Lifecycle:**
```
User not found → WAITING_FOR_EMAIL
      ↓ (enters email)
processEmailSubmission() → verify user exists → send OTP
      ↓
OTP_SENT → User enters code
      ↓
processOtpVerification() → verify OTP → link WhatsApp
      ↓ (success)
COMPLETED → user_whatsapp_accounts updated
```

---

### 4. AI Orchestration Integration ✗

**Status:** CRITICAL ISSUE - NOT CONNECTED

**The Problem:**

There are TWO implementations:
1. `src/integrations/wati/chat-orchestrator.ts` - **PLACEHOLDER** (not connected)
2. `src/integrations/wati/wati-chat-adapter.ts` - **COMPLETE** (has real AI integration)

The webhook handler imports from the PLACEHOLDER:

```typescript
// webhook-handler.ts line 17
import { processChatMessage } from './chat-orchestrator';
```

But then REDEFINES it locally (bug):

```typescript
// webhook-handler.ts lines 275-287
async function processChatMessage(
  message: string,
  context: Record<string, unknown>
): Promise<{ text: string }> {
  // This is a STUB that returns placeholder!
  console.log(`[Wati Chat] Processing message: ${message.substring(0, 50)}...`);
  return {
    text: 'Processing your request via our AI engine...',
  };
}
```

**What wati-chat-adapter.ts HAS (but is not used):**
```typescript
import { getOpenAIClient } from '@/ai/openai';       // ✓ Reuses
import { aiTools, executeTool } from '@/ai/tools';  // ✓ Reuses
import { loadCompanyErpAccounts } from '@/services/auth'; // ✓ Reuses
import type { UserProfile } from '@/types/auth';     // ✓ Reuses

// Proper implementation:
// 1. Builds UserProfile from context
// 2. Prepares messages in OpenAI format
// 3. Calls OpenAI with WHATSAPP_SYSTEM_PROMPT
// 4. Executes tools via executeTool()
// 5. Formats response for WhatsApp
```

**What chat-orchestrator.ts HAS (current):**
```typescript
// Just returns placeholder responses
const simpleResponses = [
  `I understand you're asking about "${userMessage}". This feature is coming soon!`,
  // ...
];
return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
```

---

### 5. Database & Schema ✓

**Status:** 95% COMPLETE

**Migration:** `supabase/migrations/20260514000000_add_user_whatsapp_accounts.sql`

```sql
CREATE TABLE public.user_whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  whatsapp_number text NOT NULL UNIQUE,
  is_verified boolean DEFAULT false,
  is_active boolean DEFAULT true,
  linked_at timestamptz DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Indexes:**
- ✓ `idx_whatsapp_number` (WHERE is_active = true)
- ✓ `idx_whatsapp_user_id` (WHERE is_active = true)

**RLS Policies:**
- ✓ Users can read own WhatsApp accounts
- ✓ Users can insert own account
- ✓ Users can update own account
- ✓ Super admins can manage all

**Helper Functions:**
- ✓ `get_user_whatsapp_accounts(user_uuid)`
- ✓ `lookup_user_by_whatsapp(phone)`

**Schema Issues:**
- ⚠ Unique constraint `user_whatsapp_accounts_user_unique` uses user_id - this means ONE WhatsApp per user (correct)
- ⚠ Unique constraint on whatsapp_number prevents users from having multiple WhatsApp numbers (may need to revisit)

---

## Security Review

### Implemented ✓

| Security Feature | Status | Implementation |
|------------------|--------|----------------|
| OTP Expiry | ✓ | 5 minutes |
| Max Attempts | ✓ | 3 per OTP |
| Rate Limiting | ✓ | 5 OTP/hour per email |
| Lockout | ✓ | 15 minutes after 3 failures |
| Session Expiry | ✓ | 30 minutes inactivity |
| Phone Normalization | ✓ | Consistent format |
| RLS Policies | ✓ | Proper isolation |

### Missing/Risky ⚠

| Issue | Severity | Details |
|-------|----------|---------|
| **Webhook Signature** | HIGH | No signature verification (`TODO` in code) |
| **OTP Hash** | MEDIUM | Simple hash function, not production-grade |
| **In-Memory Storage** | MEDIUM | Sessions/OTP lost on restart |
| **Sensitive Logging** | MEDIUM | Full phone numbers in logs |
| **No Retry Queue** | LOW | Failed message sends not retried |

---

## Missing Components

### Critical (Blocking)

| Component | Status | Impact |
|-----------|--------|--------|
| AI Integration Connection | ✗ NOT CONNECTED | WhatsApp users get placeholder responses |
| Webhook Signature Verification | ✗ NOT IMPLEMENTED | Security vulnerability |

### High Priority

| Component | Status | Impact |
|-----------|--------|--------|
| Wati API Client Implementation | ⚠ Placeholder only | Cannot send real messages |
| Redis for Sessions/OTP | ✗ Not implemented | Not production-ready |
| Proper Crypto for OTP | ⚠ Simple hash | Security concern |

### Medium Priority

| Component | Status | Impact |
|-----------|--------|--------|
| Message Retry Logic | ✗ Not implemented | Failed messages lost |
| Notification Queue | ✗ Not implemented | Can't send order alerts |
| Session Analytics | ✗ Not implemented | No observability |

---

## Risks

### 1. AI Integration Not Connected (CRITICAL)

**Issue:** Webhook handler uses placeholder `processChatMessage` instead of `wati-chat-adapter.ts`

**Impact:** WhatsApp users cannot access ERP data - only get placeholder responses

**Root Cause:**
- `webhook-handler.ts` imports from `chat-orchestrator.ts` (placeholder)
- `webhook-handler.ts` redefines `processChatMessage` locally, shadowing the import
- `wati-chat-adapter.ts` has proper implementation but is not imported/used

**Fix Required:**
1. Change import in `webhook-handler.ts`:
   ```typescript
   // FROM:
   import { processChatMessage } from './chat-orchestrator';
   // TO:
   import { processWatiChatMessage } from './wati-chat-adapter';
   ```
2. Update the function call to use the adapter's format
3. Remove the local placeholder function redefinition

### 2. Webhook Signature Not Verified (HIGH)

**Issue:** No validation of `X-Wati-Signature` header

**Risk:** Attackers could send fake webhook events

**Recommendation:** Add signature verification before production

### 3. In-Memory Storage (MEDIUM)

**Issue:** Sessions and OTPs stored in Map()

**Risk:** Lost on server restart, no horizontal scaling

**Recommendation:** Add Redis for production

---

## Testing Readiness

### What's Ready for Testing

| Test Case | Status | Notes |
|-----------|--------|-------|
| Webhook endpoint | ✓ Ready | Validates, normalizes, logs |
| Auth flow (existing user) | ✓ Ready | Phone lookup + ERP scope |
| Auth flow (new user) | ✓ Ready | Redirects to web |
| Session management | ✓ Ready | In-memory storage |
| OTP generation | ✓ Ready | 6-digit, 5-min expiry |
| OTP verification | ✓ Ready | Rate limiting, lockout |
| State transitions | ✓ Ready | All states implemented |

### What Needs Implementation Before Testing

| Component | Required Action |
|-----------|-----------------|
| AI Integration | Connect wati-chat-adapter.ts to webhook handler |
| Wati API Client | Implement actual Wati API calls (not placeholder) |
| Webhook Signature | Add signature verification |

### Environment Variables Required

```env
# Required
WATI_API_KEY=your_wati_api_key
WATI_PHONE_NUMBER=+91XXXXXXXXXX
WATI_WEBHOOK_SECRET=your_webhook_secret

# Optional
WATI_API_BASE_URL=https://wati-api.wati.io
WATI_SESSION_TIMEOUT_MINUTES=30

# For OTP (optional - currently in test mode)
RESEND_API_KEY=re_123456789

# For existing functionality
OPENAI_API_KEY=sk-...
DATABASE_URL=...
```

---

## Operational Readiness

### Logging ✓

- Request ID for tracing
- Event type logging
- Session lifecycle logging
- Error logging

### Error Handling ⚠

- HTTP status codes (400, 500)
- Error messages returned
- No retry mechanism

### Missing

- No metrics/monitoring
- No alerting
- No distributed tracing

---

## Recommended Next Steps

### Immediate (Before Testing)

1. **FIX AI INTEGRATION** (CRITICAL)
   - Update `webhook-handler.ts` to import from `wati-chat-adapter.ts`
   - Remove local `processChatMessage` redefinition
   - Verify real AI responses work

2. **ADD WEBHOOK SIGNATURE**
   - Verify `X-Wati-Signature` header
   - Reject invalid signatures

3. **IMPLEMENT WATI API**
   - Replace placeholder in `wati-client.ts`
   - Test actual message sending

### Before Production

1. Add Redis for session/OTP storage
2. Implement message retry queue
3. Add proper crypto for OTP (bcrypt/argon2)
4. Add metrics and monitoring
5. Implement notification queue

---

## Final Assessment

| Metric | Percentage |
|--------|-------------|
| **Implementation Completion** | 70% |
| **Production Readiness** | 40% |
| **Architecture Compliance** | 85% |
| **Security Readiness** | 60% |

### Overall: NOT READY FOR TESTING

**Reason:** The AI integration - the core purpose of the WhatsApp channel - is not connected. Users would receive placeholder responses instead of actual ERP data.

### Highest-Risk Issue

**AI Integration Not Connected** - This defeats the entire purpose of the integration. The architecture is correct, the implementation in `wati-chat-adapter.ts` is complete, but it's not wired up.

### Immediate Action Required

Fix the import in `webhook-handler.ts` to use `wati-chat-adapter.ts` instead of `chat-orchestrator.ts`:

```typescript
// In webhook-handler.ts, change:
import { processChatMessage } from './chat-orchestrator';

// To:
import { processWatiChatMessage } from './wati-chat-adapter';

// And update the call at line 222 from:
const aiResponse = await processChatMessage(message, context);

// To match the adapter's interface
```

---

## Documentation Files

| File | Status |
|------|--------|
| `docs/wati-integration-architecture.md` | ✓ Complete |
| `docs/wati-webhook-flow.md` | ✓ Complete |
| `docs/wati-auth-flow.md` | ✓ Complete |
| `docs/wati-ai-integration.md` | ✓ Complete |
| `docs/wati-onboarding-flow.md` | ✓ Complete |
| `docs/wati-implementation-audit.md` | This file |
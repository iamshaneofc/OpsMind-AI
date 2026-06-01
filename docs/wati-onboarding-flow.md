# Wati Onboarding Flow

This document describes the OTP-based onboarding flow for unregistered WhatsApp users.

## Overview

When a user messages the WhatsApp bot and is not found in the system, they go through an onboarding flow to link their WhatsApp number to an existing web account.

## Flow Diagram

```
WhatsApp User
     │
     ▼
┌─────────────────────────────────────────────────────────────────────┐
│  User sends message                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  authenticateWhatsAppUser()                                         │
│  - Lookup in user_whatsapp_accounts table                           │
│  - Fallback: lookup in users.phone                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
       ┌───────────────┐                  ┌───────────────┐
       │ User Found    │                  │ User NOT FOUND│
       │               │                  │               │
       │ → ACTIVE      │                  │ → ONBOARDING  │
       │   CHAT        │                  └───────┬───────┘
       └───────────────┘                          │
                                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  startOnboarding()                                                  │
│  - Create onboarding session                                        │
│  - Request email                                                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  User enters email                                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  processEmailSubmission()                                          │
│  - Validate email format                                            │
│  - Check user exists in Supabase                                   │
│  - Check rate limiting                                             │
│  - Generate & send OTP via Resend                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  OTP sent to user's email                                          │
│  Message: "OTP sent to u***@example.com"                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  User enters OTP code                                              │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  processOtpVerification()                                          │
│  - Verify OTP (check expiry, hash)                                  │
│  - Check attempts (max 3)                                          │
│  - Link WhatsApp to user                                           │
│  - Update user_whatsapp_accounts table                             │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
       ┌───────────────┐                  ┌───────────────┐
       │ OTP Valid    │                  │ OTP Invalid   │
       │              │                  │               │
       │ → COMPLETED  │                  │ → Retry/      │
       │              │                  │   Lockout     │
       └───────────────┘                  └───────────────┘
```

## OTP Lifecycle

### 1. OTP Generation

```
User submits email
       │
       ▼
Check rate limit (max 5/hour)
       │
       ▼
Generate 6-digit code
       │
       ▼
Hash code (SHA-like simple hash)
       │
       ▼
Store hash with expiry (5 min)
       │
       ▼
Increment rate limit counter
```

### 2. OTP Delivery

```
Code generated
       │
       ▼
Check RESEND_API_KEY env var
       │
       ├─→ Present: Send via Resend API
       │
       └─→ Missing: Log code (TEST MODE)
              └── Remove in production!
       │
       ▼
Email sent to user
```

### 3. OTP Verification

```
User enters code
       │
       ▼
Check OTP exists
       │
       ▼
Check expiry (5 minutes)
       │
       ▼
Check phone number match
       │
       ▼
Verify hash
       │
       ├─→ Valid: Delete OTP, complete onboarding
       │
       └─→ Invalid: Increment attempts
              └── 3 failures → Lockout 15 min
```

### 4. OTP Cleanup

- Expired OTPs cleaned up every hour
- Rate limit windows reset after 1 hour

## Security Protections

### Rate Limiting

| Protection | Limit |
|------------|-------|
| OTP requests per email | 5 per hour |
| Resend cooldown | 30 seconds |
| Verification attempts | 3 per OTP |
| Lockout after failures | 15 minutes |

### Attack Scenarios

```
Scenario: Brute-force OTP
├── Detection: After 3 failed attempts
├── Action: Delete OTP, lock session 15 min
└── Recovery: Wait or start fresh

Scenario: Mass OTP requests
├── Detection: Rate limit (5/hour)
├── Action: Reject new OTP requests
└── Recovery: Wait for window reset

Scenario: Stale sessions
├── Detection: 24-hour session age
├── Action: Auto-cleanup
└── Recovery: Start fresh
```

### Security Code Flow

```typescript
// In otp-service.ts

// 1. Rate limiting check
if (isRateLimited(email)) {
  return { success: false, error: 'Too many OTP requests' };
}

// 2. OTP creation with expiry
const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

// 3. Verification with attempt tracking
if (!verifyOtpHash(code, storedHash)) {
  record.attempts++;
  if (record.attempts >= 3) {
    lockout(15 minutes);
  }
}
```

## Onboarding States

| State | Description | Next State |
|-------|-------------|------------|
| `NEW_USER` | Initial state, not found in system | `WAITING_FOR_EMAIL` |
| `WAITING_FOR_EMAIL` | Waiting for email input | `OTP_SENT` |
| `OTP_SENT` | OTP sent, waiting for code | `OTP_VERIFIED` or `FAILED` |
| `OTP_VERIFIED` | OTP validated successfully | `COMPLETED` |
| `COMPLETED` | WhatsApp linked to user | N/A (session ends) |
| `FAILED` | Too many failures or error | N/A (session ends) |

## API Reference

### startOnboarding(phoneNumber, sessionId)

```typescript
const result = await startOnboarding('+919999999999', 'wati_session_123');

result = {
  success: true,
  message: 'Welcome to OpsMind Operations AI! To link your WhatsApp, please enter your email...',
  nextState: 'WAITING_FOR_EMAIL'
};
```

### processEmailSubmission(sessionId, email)

```typescript
const result = await processEmailSubmission('wati_session_123', 'user@example.com');

result = {
  success: true,
  message: 'OTP sent to u***@example.com! Enter the 6-digit code.',
  nextState: 'OTP_SENT'
};
```

### processOtpVerification(sessionId, otpCode)

```typescript
const result = await processOtpVerification('wati_session_123', '123456');

result = {
  success: true,
  message: 'WhatsApp successfully linked! You can now ask about orders...',
  nextState: 'COMPLETED',
  linkedUserId: 12345
};
```

## Database Updates

After successful verification, the WhatsApp number is linked:

```sql
INSERT INTO user_whatsapp_accounts (
  user_id,
  whatsapp_number,
  is_verified,
  is_active,
  linked_at,
  last_verified_at
) VALUES (
  'uuid-of-user',
  '919999999999',
  true,
  true,
  NOW(),
  NOW()
)
ON CONFLICT (whatsapp_number) DO UPDATE SET
  is_verified = true,
  is_active = true,
  last_verified_at = NOW();
```

## Error Messages

| Error | Cause | User Message |
|-------|-------|--------------|
| `Invalid email format` | Not a valid email | "Please enter a valid email (e.g., user@example.com)" |
| `User not found` | No account with email | "No account found with email. Please register via web first." |
| `Rate limited` | Too many OTPs | "Too many OTP requests. Please try again later." |
| `Invalid OTP` | Wrong code | "Invalid OTP. X attempts remaining." |
| `OTP expired` | 5 min passed | "OTP expired. Please request a new one." |
| `Too many attempts` | 3 failures | "Too many attempts. Please try again in 15 minutes." |

## Environment Variables

```env
# Required for OTP email delivery
RESEND_API_KEY=re_123456789

# Optional: Custom sender email
OTP_FROM_EMAIL=whatsapp@opsmindoperations.ai
```

## Files

| File | Purpose |
|------|---------|
| [onboarding-flow.ts](src/integrations/wati/onboarding-flow.ts) | Main onboarding state machine |
| [otp-service.ts](src/integrations/wati/otp-service.ts) | OTP generation, storage, verification |
| [constants.ts](src/integrations/wati/constants.ts) | OTP configuration |

## What Is NOT Implemented

- ❌ Push notifications (order status updates)
- ❌ Inventory alert notifications
- ❌ Two-factor authentication flow
- ❌ SMS-based OTP (email only)
- ❌ WhatsApp template messages for onboarding

These will be implemented in future phases.
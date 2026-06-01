# Wati Authentication Flow

This document describes the WhatsApp authentication flow for the Wati integration.

## Overview

The WhatsApp authentication layer maps WhatsApp phone numbers to SRL users, enabling secure access to ERP data through WhatsApp while reusing existing authentication and authorization logic.

## Auth Flow Diagram

```
WhatsApp User
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│              POST /api/wati/webhook                     │
│         (src/app/api/wati/webhook/route.ts)             │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│         authenticateWhatsAppUser()                      │
│    (src/integrations/wati/whatsapp-auth.ts)            │
├─────────────────────────────────────────────────────────┤
│  1. Normalize phone number (+919999999999 → 91999999..) │
│  2. Lookup in user_whatsapp_accounts table             │
│  3. If not found, fallback to users.phone field        │
│  4. Validate user role for WhatsApp access             │
│  5. Load ERP account mapping from companies            │
└───────────────────────┬─────────────────────────────────┘
                        │
          ┌─────────────┴─────────────┐
          ▼                           ▼
   ┌───────────────┐          ┌───────────────┐
   │ User Found    │          │ User Not Found│
   │               │          │               │
   │ - Get profile │          │ - Return error│
   │ - Load ERP    │          │ - Suggest web │
   │ - Create auth │          │   registration│
   │   context     │          └───────────────┘
   └───────┬───────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│         createSession()                                 │
│    (src/integrations/wati/session-manager.ts)          │
├─────────────────────────────────────────────────────────┤
│  - Create session with user context                    │
│  - Set state: AUTHENTICATED                            │
│  - Store for downstream handlers                       │
└─────────────────────────────────────────────────────────┘
```

## Database Tables

### user_whatsapp_accounts

```sql
CREATE TABLE public.user_whatsapp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  whatsapp_number text NOT NULL UNIQUE,
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  linked_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Indexes

```sql
-- Fast lookup by phone number
CREATE INDEX idx_whatsapp_number
  ON public.user_whatsapp_accounts(whatsapp_number)
  WHERE is_active = true;

-- Fast lookup by user ID
CREATE INDEX idx_whatsapp_user_id
  ON public.user_whatsapp_accounts(user_id)
  WHERE is_active = true;
```

## Phone Number Normalization

The system normalizes phone numbers to a consistent format for storage and lookup:

| Input | Normalized | Reason |
|-------|------------|--------|
| `+91 99999 99999` | `919999999999` | Remove spaces, +, keep country code |
| `09999999999` | `919999999999` | Add country code for 10-digit numbers |
| `9999999999` | `919999999999` | Add country code for 10-digit numbers |
| `+919999999999` | `919999999999` | Remove + prefix |

## Authentication Functions

### authenticateWhatsAppUser(phoneNumber)

Main authentication function that:

1. **Normalizes** the phone number
2. **Looks up** in `user_whatsapp_accounts` table
3. **Falls back** to legacy `users.phone` field if not found
4. **Validates** user role for WhatsApp access
5. **Loads** ERP account mapping from companies
6. **Returns** user profile with role and company scope

```typescript
// Example call
const result = await authenticateWhatsAppUser('+919999999999');

if (result.success && result.profile) {
  console.log('Authenticated:', result.profile.companyName);
  // Create session with profile
} else {
  console.error('Auth failed:', result.error);
}
```

### getUserByWhatsApp(phoneNumber)

Lightweight lookup returning basic user info without full profile:

```typescript
const user = await getUserByWhatsApp('+919999999999');

if (user) {
  // Returns: { userId, email, fullName, role, companyId, isVerified }
}
```

### validateWhatsAppAccess(userId)

Validates if a user can access WhatsApp features:

```typescript
const validation = await validateWhatsAppAccess('user-uuid');

if (!validation.valid) {
  console.log('Reason:', validation.reason);
}
```

### linkWhatsAppAccount(userId, phoneNumber)

Links a WhatsApp number to an existing user (for future web UI):

```typescript
const result = await linkWhatsAppAccount('user-uuid', '+919999999999', false);
// isVerified = false initially, can be updated after OTP
```

## Example Authenticated Response

### Success Response

```json
{
  "success": true,
  "userId": 12345,
  "profile": {
    "userId": 12345,
    "phoneNumber": "919999999999",
    "companyId": 5,
    "companyName": "ABC Pharmaceuticals",
    "role": "distributor",
    "erpAccountIds": [1001, 1002, 1003]
  }
}
```

### User Profile Structure

```typescript
interface WatiUserProfile {
  userId: number;
  phoneNumber: string;
  companyId: number | null;
  companyName: string;
  role: 'super_admin' | 'distributor' | 'warehouse';
  erpAccountIds: number[];
}
```

### Failed Response

```json
{
  "success": false,
  "error": "No account linked to this WhatsApp number. Please register via the web application first."
}
```

## Reused Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `loadCompanyErpAccounts()` | `src/services/auth.ts` | Load ERP account IDs from company |
| `mapRoleIdToAppRole()` | `src/services/auth.ts` | Map role ID to app role string |
| `createSupabaseServerClient()` | `src/supabase/server.ts` | Supabase client for DB queries |
| User profile types | `src/types/auth.ts` | Type definitions |

## Fallback Strategy

1. **Primary**: Lookup in `user_whatsapp_accounts` table (new structure)
2. **Fallback**: Lookup in `users.phone` or `users.telephone` (legacy)

This ensures backward compatibility with existing users while allowing future migration to the new table structure.

## Future Enhancements

### OTP Verification (Not Implemented)

```typescript
// Future: Verify phone number via OTP
await sendWatiOtp('+919999999999');
// User receives OTP via WhatsApp

await verifyWatiOtp('+919999999999', '123456');
// Updates user_whatsapp_accounts.is_verified = true
```

### WhatsApp Linking from Web UI (Not Implemented)

- User visits profile settings in web app
- Clicks "Link WhatsApp"
- Enters phone number
- Receives OTP to verify
- Row inserted into `user_whatsapp_accounts`

## Error Handling

| Error | Cause | Resolution |
|-------|-------|-------------|
| `No account linked` | Phone not in system | Prompt web registration |
| `WhatsApp access not enabled` | Role not allowed | Contact support |
| `User not found` | Deleted user | N/A |
| `Service error` | DB/Supabase error | Retry |

## Security Considerations

1. **Phone normalization** prevents duplicate entries
2. **is_active flag** allows deactivating without deletion
3. **RLS policies** ensure users can only access their own records
4. **Role validation** restricts WhatsApp access to valid roles
5. **Audit trail** via `linked_at`, `last_verified_at` timestamps
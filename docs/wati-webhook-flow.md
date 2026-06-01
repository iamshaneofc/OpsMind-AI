# Wati Webhook Flow

This document describes the webhook flow for receiving WhatsApp messages from Wati.

## Request Flow

```
WhatsApp User
     │
     ▼
Wati Platform
     │
     │ POST /api/wati/webhook
     ▼
┌──────────────────────────────────────────┐
│         API Route Handler                │
│   (src/app/api/wati/webhook/route.ts)   │
├──────────────────────────────────────────┤
│  1. Validate request content-type       │
│  2. Parse JSON body                      │
│  3. Validate payload structure           │
│  4. Normalize to internal format         │
│  5. Log request for debugging            │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│        Webhook Handler                   │
│  (src/integrations/wati/                 │
│   webhook-handler.ts)                   │
├──────────────────────────────────────────┤
│  [FUTURE] Signature verification         │
│  [FUTURE] Auth integration point        │
│  Route by event type                     │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│         Event Handlers                   │
│  • sessionStart → Auth flow              │
│  • message → Session + AI engine         │
│  • sessionEnd → Archive                  │
│  • optIn/optOut → Preferences            │
└──────────────────────────────────────────┘
```

## Payload Structure

### Incoming Wati Payload

```json
{
  "event": "message",
  "phone": "+919999999999",
  "waId": "919999999999",
  "profileName": "John Doe",
  "message": {
    "text": "Hello, I need order status"
  },
  "sessionId": "wati_session_123",
  "timestamp": 1715678000000
}
```

### Full Wati Payload Examples

**Text Message:**
```json
{
  "event": "message",
  "phone": "+919999999999",
  "waId": "919999999999",
  "profileName": "John",
  "message": {
    "type": "text",
    "text": "What's my order status?"
  },
  "timestamp": 1715678000000
}
```

**Image Message:**
```json
{
  "event": "message",
  "phone": "+919999999999",
  "message": {
    "type": "image",
    "image": {
      "url": "https://cdn.wati.io/...",
      "caption": "Screenshot of order"
    }
  },
  "timestamp": 1715678000000
}
```

**Session Start:**
```json
{
  "event": "sessionStart",
  "phone": "+919999999999",
  "waId": "919999999999",
  "timestamp": 1715677000000
}
```

**Opt In:**
```json
{
  "event": "optIn",
  "phone": "+919999999999",
  "waId": "919999999999",
  "timestamp": 1715676000000
}
```

## Normalization Logic

### Normalized Internal Format

```typescript
interface NormalizedWatiMessage {
  channel: 'whatsapp';
  phoneNumber: string;
  message: string;
  messageType: 'text' | 'image' | 'audio' | 'document' | 'location' | 'unknown';
  timestamp: Date;
  waId: string;
  profileName?: string;
  rawPayload: WatiWebhookPayload;
}
```

### Example Normalized Output

**Input (text message):**
```json
{
  "event": "message",
  "phone": "+919999999999",
  "waId": "919999999999",
  "profileName": "John",
  "message": {
    "text": "Show my pending orders"
  },
  "timestamp": 1715678000000
}
```

**Normalized:**
```json
{
  "channel": "whatsapp",
  "phoneNumber": "+919999999999",
  "message": "Show my pending orders",
  "messageType": "text",
  "timestamp": "2024-05-14T10:33:20.000Z",
  "waId": "919999999999",
  "profileName": "John",
  "rawPayload": {
    "event": "message",
    "phone": "+919999999999",
    "waId": "919999999999",
    "profileName": "John",
    "message": { "text": "Show my pending orders" },
    "timestamp": 1715678000000
  }
}
```

**Input (image message):**
```json
{
  "event": "message",
  "phone": "+919999999999",
  "message": {
    "type": "image",
    "image": {
      "url": "https://cdn.wati.io/img123.jpg",
      "caption": "Order invoice"
    }
  }
}
```

**Normalized:**
```json
{
  "channel": "whatsapp",
  "phoneNumber": "+919999999999",
  "message": "Order invoice",
  "messageType": "image",
  "timestamp": "2024-05-14T10:33:20.000Z",
  "waId": "919999999999",
  "rawPayload": { ... }
}
```

## Message Type Mapping

| Wati Message Type | Normalized Type | Content Extraction |
|-------------------|-----------------|---------------------|
| text | text | payload.message.text |
| image | image | payload.message.image.caption (or "[Image]") |
| audio | audio | "[Audio]" |
| document | document | "[Document: filename]" |
| location | location | "[Location: name]" |
| undefined/null | unknown | "" |

## Error Handling

### Invalid JSON (400)
```json
{
  "success": false,
  "error": "Invalid JSON payload"
}
```

### Missing Required Fields (400)
```json
{
  "success": false,
  "error": "Missing required fields: event, phone"
}
```

### Handler Error (500)
```json
{
  "success": false,
  "error": "Internal error message"
}
```

## Future Auth Integration Point

The current implementation receives and normalizes messages. Auth integration will be added at:

```
API Route → Normalize → [FUTURE: Auth Check] → Webhook Handler → Session Manager → Chat Orchestrator
```

### Planned Auth Flow

```typescript
// In src/app/api/wati/webhook/route.ts (future)

async function authenticateRequest(
  normalized: NormalizedWatiMessage
): Promise<AuthResult> {
  // 1. Extract phone number
  const phone = normalized.phoneNumber;

  // 2. Verify webhook signature (X-Wati-Signature header)
  const signature = request.headers.get('X-Wati-Signature');
  if (!verifySignature(payload, signature)) {
    throw new Error('Invalid signature');
  }

  // 3. Lookup user by phone in Supabase
  const user = await lookupUserByPhone(phone);
  if (!user) {
    return { authenticated: false, reason: 'user_not_found' };
  }

  // 4. Return auth context for downstream handlers
  return {
    authenticated: true,
    userId: user.id,
    companyId: user.company_id,
    role: user.role,
  };
}
```

### Required Environment Variables (Future)

```env
# For signature verification
WATI_WEBHOOK_SECRET=your_webhook_secret
```

## Logging

Each request receives a unique request ID for tracing:

```
[wati_1715678000000_a1b2c3] Wati webhook received
[wati_1715678000000_a1b2c3] Event: message, Phone: +919999999999
[wati_1715678000000_a1b2c3] Normalized: { messageType: 'text', ... }
[wati_1715678000000_a1b2c3] Handler result: { success: true }
```

## Endpoint Information

- **Path:** `/api/wati/webhook`
- **Method:** POST
- **Content-Type:** `application/json`
- **Authentication:** Not implemented yet (future: X-Wati-Signature header)

## Health Check

- **Path:** `/api/wati/webhook`
- **Method:** GET
- **Response:**
```json
{
  "status": "ok",
  "endpoint": "Wati Webhook",
  "timestamp": "2024-05-14T10:33:20.000Z"
}
```
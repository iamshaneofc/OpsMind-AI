/**
 * Wati Webhook API Route
 *
 * Receives webhook events from Wati WhatsApp platform.
 * Normalizes incoming payloads and routes to appropriate handlers.
 *
 * Endpoint: POST /api/wati/webhook
 */

import { NextRequest, NextResponse } from 'next/server';
import { handleWatiWebhook } from '@/integrations/wati/webhook-handler';
import type { WatiWebhookEvent } from '@/integrations/wati/types';

/**
 * Wati webhook payload structure
 * Reference: https://docs.wati.io/
 */
export interface WatiWebhookPayload {
  event: string;
  phone: string;
  message?: {
    text?: string;
    type?: string;
    image?: {
      url?: string;
      caption?: string;
    };
    audio?: {
      url?: string;
    };
    document?: {
      url?: string;
      fileName?: string;
    };
    location?: {
      latitude?: number;
      longitude?: number;
      name?: string;
    };
  };
  sessionId?: string;
  timestamp?: number;
  waId?: string;
  profileName?: string;
}

/**
 * Normalized internal message format
 */
export interface NormalizedWatiMessage {
  channel: 'whatsapp';
  phoneNumber: string;
  message: string;
  messageType: 'text' | 'image' | 'audio' | 'document' | 'location' | 'unknown';
  timestamp: Date;
  waId: string;
  profileName?: string;
  rawPayload: WatiWebhookPayload;
}

/**
 * Validate webhook payload
 */
function validatePayload(payload: unknown): payload is WatiWebhookPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;

  if (typeof p.event !== 'string') {
    return false;
  }

  if (typeof p.phone !== 'string') {
    return false;
  }

  return true;
}

/**
 * Normalize Wati payload to internal format
 */
function normalizePayload(payload: WatiWebhookPayload): NormalizedWatiMessage {
  let messageType: NormalizedWatiMessage['messageType'] = 'unknown';
  let messageContent = '';

  if (payload.message) {
    if (payload.message.text) {
      messageType = 'text';
      messageContent = payload.message.text;
    } else if (payload.message.image) {
      messageType = 'image';
      messageContent = payload.message.image.caption || '[Image]';
    } else if (payload.message.audio) {
      messageType = 'audio';
      messageContent = '[Audio]';
    } else if (payload.message.document) {
      messageType = 'document';
      messageContent = `[Document: ${payload.message.document.fileName || 'file'}]`;
    } else if (payload.message.location) {
      messageType = 'location';
      messageContent = `[Location: ${payload.message.location.name || 'shared location'}]`;
    }
  }

  return {
    channel: 'whatsapp',
    phoneNumber: payload.phone,
    message: messageContent,
    messageType,
    timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    waId: payload.waId || payload.phone,
    profileName: payload.profileName,
    rawPayload: payload,
  };
}

/**
 * POST handler for Wati webhooks
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = `wati_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  console.log(`[${requestId}] Wati webhook received`);

  try {
    // Parse request body
    let payload: unknown;

    try {
      payload = await request.json();
    } catch {
      console.error(`[${requestId}] Invalid JSON in request body`);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate payload structure
    if (!validatePayload(payload)) {
      console.error(`[${requestId}] Missing required fields in payload`);
      return NextResponse.json(
        { success: false, error: 'Missing required fields: event, phone' },
        { status: 400 }
      );
    }

    // Log incoming event
    console.log(`[${requestId}] Event: ${payload.event}, Phone: ${payload.phone}`);

    // Normalize the payload
    const normalized = normalizePayload(payload);

    console.log(`[${requestId}] Normalized:`, {
      messageType: normalized.messageType,
      messageLength: normalized.message.length,
      waId: normalized.waId,
    });

    // Convert to WatiWebhookEvent format for handler
    const webhookEvent: WatiWebhookEvent = {
      event: payload.event as 'sessionStart' | 'message' | 'sessionEnd' | 'optIn' | 'optOut',
      phone: payload.phone,
      message: payload.message,
      sessionId: payload.sessionId,
      timestamp: payload.timestamp,
      waId: payload.waId,
      profileName: payload.profileName,
    };

    // Pass to webhook handler (integration point for auth)
    const result = await handleWatiWebhook(webhookEvent);

    console.log(`[${requestId}] Handler result:`, result);

    return NextResponse.json(result);
  } catch (error) {
    console.error(`[${requestId}] Webhook error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler - health check
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Wati Webhook',
    timestamp: new Date().toISOString(),
  });
}
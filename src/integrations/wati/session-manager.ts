/**
 * Session Manager for Wati WhatsApp Integration
 *
 * Manages conversation state and context persistence for WhatsApp sessions.
 * Uses in-memory store with optional Supabase persistence.
 *
 * TODO: Add Redis support for production
 * TODO: Implement session expiry cleanup
 * TODO: Add session analytics tracking
 */

import type {
  WatiChatSession,
  ChatFlowState,
  WatiConversationContext,
  WatiMessageLog,
} from './types';
import { WATI_DEFAULTS } from './constants';

// In-memory session store (replace with Redis in production)
const sessions = new Map<string, WatiChatSession>();

/**
 * Create a new WhatsApp session
 */
export function createSession(
  phoneNumber: string,
  userId?: number,
  companyId?: number,
  role?: string
): WatiChatSession {
  const sessionId = generateSessionId(phoneNumber);

  const session: WatiChatSession = {
    sessionId,
    phoneNumber,
    userId,
    companyId,
    role,
    currentState: userId ? 'AUTHENTICATED' : 'NEW_USER',
    context: {},
    createdAt: new Date(),
    lastActivityAt: new Date(),
    messages: [],
  };

  sessions.set(sessionId, session);
  console.log(`[Wati Session] Created session ${sessionId} for ${phoneNumber}`);

  return session;
}

/**
 * Get session by ID
 */
export function getSession(sessionId: string): WatiChatSession | null {
  const session = sessions.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if session expired
  const now = new Date();
  const lastActivity = new Date(session.lastActivityAt);
  const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

  if (minutesSinceActivity > WATI_DEFAULTS.SESSION_TIMEOUT_MINUTES) {
    console.log(`[Wati Session] Session ${sessionId} expired`);
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

/**
 * Get session by phone number
 */
export function getSessionByPhone(phoneNumber: string): WatiChatSession | null {
  const normalizedPhone = normalizePhoneForLookup(phoneNumber);

  for (const session of sessions.values()) {
    if (session.phoneNumber === normalizedPhone) {
      return getSession(session.sessionId);
    }
  }

  return null;
}

/**
 * Update session state
 */
export function updateSessionState(
  sessionId: string,
  newState: ChatFlowState
): WatiChatSession | null {
  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  session.currentState = newState;
  session.lastActivityAt = new Date();

  console.log(`[Wati Session] Session ${sessionId} state: ${newState}`);
  return session;
}

/**
 * Update session context
 */
export function updateSessionContext(
  sessionId: string,
  context: Partial<WatiConversationContext>
): WatiChatSession | null {
  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  session.context = { ...session.context, ...context };
  session.lastActivityAt = new Date();

  return session;
}

/**
 * Add message to session history
 */
export function addMessageToSession(
  sessionId: string,
  direction: 'inbound' | 'outbound',
  content: string,
  metadata?: Record<string, unknown>
): WatiChatSession | null {
  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  const message: WatiMessageLog = {
    id: `msg_${Date.now()}`,
    direction,
    content,
    timestamp: new Date(),
    metadata,
  };

  session.messages.push(message);
  session.lastActivityAt = new Date();

  // Trim old messages if exceeds limit
  if (session.messages.length > 100) {
    session.messages = session.messages.slice(-50);
  }

  return session;
}

/**
 * Get session context for AI processing
 */
export function getSessionContextForAI(sessionId: string): Record<string, unknown> | null {
  const session = getSession(sessionId);

  if (!session) {
    return null;
  }

  return {
    sessionId: session.sessionId,
    phoneNumber: session.phoneNumber,
    userId: session.userId,
    companyId: session.companyId,
    role: session.role,
    currentState: session.currentState,
    lastOrderNumber: session.context.lastOrderNumber,
    lastWarehouseId: session.context.lastWarehouseId,
    lastProductQuery: session.context.lastProductQuery,
    pendingToolCall: session.context.pendingToolCall,
    messageHistory: session.messages.slice(-10).map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content,
    })),
  };
}

/**
 * Clear session (logout)
 */
export function clearSession(sessionId: string): boolean {
  const deleted = sessions.delete(sessionId);

  if (deleted) {
    console.log(`[Wati Session] Cleared session ${sessionId}`);
  }

  return deleted;
}

/**
 * Get all active sessions count
 */
export function getActiveSessionsCount(): number {
  return sessions.size;
}

/**
 * Clean up expired sessions
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    const lastActivity = new Date(session.lastActivityAt);
    const minutesSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60);

    if (minutesSinceActivity > WATI_DEFAULTS.SESSION_TIMEOUT_MINUTES) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[Wati Session] Cleaned up ${cleaned} expired sessions`);
  }

  return cleaned;
}

// Helper functions

function generateSessionId(phoneNumber: string): string {
  return `wati_${normalizePhoneForLookup(phoneNumber)}_${Date.now()}`;
}

function normalizePhoneForLookup(phone: string): string {
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
}
/**
 * Wati Webhook Handler
 *
 * Handles incoming webhook events from Wati WhatsApp API.
 * Routes events to appropriate handlers and integrates with existing AI engine.
 *
 * Flow: Webhook → Auth → Session → AI Adapter → SRL AI Engine → ERP Tools → Response
 */

import type { WatiWebhookEvent, WatiResponse } from './types';
import { authenticateWhatsAppUser } from './whatsapp-auth';
import { createSession, getSessionByPhone, updateSessionState, addMessageToSession, getSession } from './session-manager';
import { sendWatiMessage, createWatiClientConfig } from './wati-client';
import { processWatiChatMessage, type WatiChatContext } from './wati-chat-adapter';
import { ONBOARDING_STEPS } from './constants';

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

/**
 * Handle incoming Wati webhook event
 */
export async function handleWatiWebhook(event: WatiWebhookEvent): Promise<WatiResponse> {
  console.log(`[Wati Webhook] Event: ${event.event}, Phone: ${event.phone}`);

  try {
    switch (event.event) {
      case 'sessionStart':
        return handleSessionStart(event);

      case 'message':
        return handleIncomingMessage(event);

      case 'sessionEnd':
        return handleSessionEnd(event);

      case 'optIn':
        return handleOptIn(event);

      case 'optOut':
        return handleOptOut(event);

      default:
        console.log(`[Wati Webhook] Unhandled event type: ${event.event}`);
        return { success: true };
    }
  } catch (error) {
    console.error('[Wati Webhook] Error handling event:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// SESSION START HANDLER
// ============================================================================

/**
 * Handle new session start (user initiates conversation)
 */
async function handleSessionStart(event: WatiWebhookEvent): Promise<WatiResponse> {
  console.log(`[Wati Webhook] Session start for ${event.phone}`);

  // Authenticate user by phone number
  const authResult = await authenticateWhatsAppUser(event.phone);

  const config = createWatiClientConfig();

  if (authResult.success && authResult.profile) {
    // Existing user - create authenticated session
    const session = createSession(
      event.phone,
      authResult.profile.userId,
      authResult.profile.companyId,
      authResult.profile.role
    );

    // Send welcome message with user context
    const welcomeMessage = `Welcome back, ${authResult.profile.companyName}! 👋

You can ask me about:
• Order status and tracking
• Inventory availability
• Invoice details
• And more!

What would you like to know?`;

    console.log(`[Wati Webhook] Authenticated user ${authResult.profile.userId}, company: ${authResult.profile.companyName}`);

    if (config) {
      await sendWatiMessage(event.phone, welcomeMessage, config);
    }
  } else {
    // New user - create session and prompt for web registration
    const session = createSession(event.phone);
    updateSessionState(session.sessionId, 'NEW_USER');

    const newUserMessage = `Welcome to SRL Operations AI! 👋

To use WhatsApp access, please register via our web application first.

Visit: ${process.env.NEXT_PUBLIC_APP_URL || 'the SRL portal'}

Existing users: Your account will be automatically linked.`;

    console.log(`[Wati Webhook] New user - no account linked to ${event.phone}`);

    if (config) {
      await sendWatiMessage(event.phone, newUserMessage, config);
    }
  }

  return { success: true };
}

// ============================================================================
// MESSAGE HANDLER (AI INTEGRATION)
// ============================================================================

/**
 * Handle incoming text message
 */
async function handleIncomingMessage(event: WatiWebhookEvent): Promise<WatiResponse> {
  if (!event.message?.text) {
    return { success: true }; // Ignore non-text for now
  }

  const messageText = event.message.text.trim();
  const session = getSessionByPhone(event.phone);

  if (!session) {
    // No session - treat as new user
    return handleSessionStart(event);
  }

  // Log incoming message
  console.log(`[Wati Webhook] Message from ${event.phone}: "${messageText.substring(0, 50)}..."`);

  // Add message to session history
  addMessageToSession(session.sessionId, 'inbound', messageText);

  // Handle based on current state
  if (session.currentState === 'ONBOARDING') {
    return handleOnboardingMessage(session, messageText);
  }

  if (session.currentState === 'NEW_USER') {
    // Check if user tries to authenticate
    return handleNewUserMessage(session, messageText);
  }

  // Normal chat - use AI engine
  return handleChatMessage(session, messageText);
}

/**
 * Handle chat message through the AI engine
 */
async function handleChatMessage(
  session: NonNullable<ReturnType<typeof getSession>>,
  messageText: string
): Promise<WatiResponse> {
  console.log(`[Wati Webhook] Processing chat message for session ${session.sessionId}`);

  // Build chat context from session
  const chatContext = buildChatContext(session);

  console.log(`[Wati Webhook] Chat context:`, {
    userId: chatContext.userId,
    role: chatContext.role,
    companyId: chatContext.companyId,
    hasErpAccounts: !!(chatContext.erpAccountIds?.length),
  });

  // Build chat request
  const chatRequest = {
    message: messageText,
    phoneNumber: session.phoneNumber,
    sessionId: session.sessionId,
    messageHistory: session.messages.slice(-10).map(m => ({
      role: m.direction === 'inbound' ? 'user' as const : 'assistant' as const,
      content: m.content,
    })),
  };

  // Process through the AI adapter (connects to real SRL AI engine)
  const aiResponse = await processWatiChatMessage(chatRequest, chatContext);

  console.log(`[Wati Webhook] AI response received: ${aiResponse.text.substring(0, 100)}...`);
  if (aiResponse.toolCalls?.length) {
    console.log(`[Wati Webhook] Tool calls executed:`, aiResponse.toolCalls);
  }
  if (aiResponse.error) {
    console.error(`[Wati Webhook] AI error:`, aiResponse.error);
  }

  // Add response to session
  addMessageToSession(session.sessionId, 'outbound', aiResponse.text);

  // Send response via Wati
  const config = createWatiClientConfig();
  if (config) {
    await sendWatiMessage(session.phoneNumber, aiResponse.text, config);
  }

  return { success: true };
}

/**
 * Handle message from new user
 */
async function handleNewUserMessage(
  session: NonNullable<ReturnType<typeof getSession>>,
  messageText: string
): Promise<WatiResponse> {
  // Try to authenticate again (in case user registered after session started)
  const authResult = await authenticateWhatsAppUser(session.phoneNumber);

  const config = createWatiClientConfig();

  if (authResult.success && authResult.profile) {
    // User now authenticated - update session
    session.userId = authResult.profile.userId;
    session.companyId = authResult.profile.companyId;
    session.role = authResult.profile.role;
    updateSessionState(session.sessionId, 'ACTIVE');

    const welcomeMessage = `Welcome, ${authResult.profile.companyName}! 🎉

Your WhatsApp has been linked to your account.

You can now ask me about:
• Order status and tracking
• Inventory availability
• Invoice details

What would you like to know?`;

    if (config) {
      await sendWatiMessage(session.phoneNumber, welcomeMessage, config);
    }

    console.log(`[Wati Webhook] User authenticated on retry: ${authResult.profile.userId}`);
  } else {
    // Still not found - redirect to web
    const redirectMessage = `I couldn't find an account linked to this WhatsApp number.

Please register via our web platform first:
${process.env.NEXT_PUBLIC_APP_URL || 'Visit the SRL portal'}

After registering, your WhatsApp will be automatically linked.`;

    if (config) {
      await sendWatiMessage(session.phoneNumber, redirectMessage, config);
    }
  }

  return { success: true };
}

/**
 * Handle onboarding state messages
 */
async function handleOnboardingMessage(
  session: NonNullable<ReturnType<typeof getSession>>,
  messageText: string
): Promise<WatiResponse> {
  // TODO: Connect to onboarding flow when implemented
  console.log(`[Wati Webhook] Onboarding message: "${messageText}"`);

  const config = createWatiClientConfig();
  if (config) {
    await sendWatiMessage(
      session.phoneNumber,
      'Onboarding flow is being set up. Please use the web portal for now.',
      config
    );
  }

  return { success: true };
}

// ============================================================================
// UTILITY HANDLERS
// ============================================================================

/**
 * Handle session end
 */
async function handleSessionEnd(event: WatiWebhookEvent): Promise<WatiResponse> {
  const session = getSessionByPhone(event.phone);
  if (session) {
    console.log(`[Wati Webhook] Session ended for ${event.phone}, duration: ${getSessionDuration(session)}`);
  }
  return { success: true };
}

/**
 * Handle user opt-in to WhatsApp
 */
async function handleOptIn(event: WatiWebhookEvent): Promise<WatiResponse> {
  console.log(`[Wati Webhook] User opted in: ${event.phone}`);

  const config = createWatiClientConfig();
  if (config) {
    const message = `Thanks for opting in to SRL Operations AI WhatsApp! 🎉

You can now receive order updates and query your data via WhatsApp.`;
    await sendWatiMessage(event.phone, message, config);
  }
  return { success: true };
}

/**
 * Handle user opt-out from WhatsApp
 */
async function handleOptOut(event: WatiWebhookEvent): Promise<WatiResponse> {
  console.log(`[Wati Webhook] User opted out: ${event.phone}`);

  // TODO: Update user preferences to disable WhatsApp notifications
  return { success: true };
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

/**
 * Build chat context from session for the AI adapter
 */
function buildChatContext(session: NonNullable<ReturnType<typeof getSession>>): WatiChatContext {
  // Map role string to role_id
  const roleId = mapRoleToRoleId(session.role);

  return {
    userId: session.userId ?? 0,
    phoneNumber: session.phoneNumber,
    role: (session.role as 'super_admin' | 'distributor' | 'warehouse') || 'distributor',
    roleId,
    companyId: session.companyId ?? null,
    warehouseId: session.context.lastWarehouseId ?? null,
    baseWarehouseId: session.context.lastWarehouseId ?? null,
    erpAccountId: null, // Will be loaded from auth if needed
    erpAccountIds: null, // Will be loaded from auth if needed
  };
}

/**
 * Map role string to role_id number
 */
function mapRoleToRoleId(role: string | undefined): number {
  switch (role) {
    case 'super_admin':
      return 1;
    case 'warehouse':
      return 3;
    case 'distributor':
    default:
      return 2;
  }
}

/**
 * Get session duration in minutes
 */
function getSessionDuration(session: NonNullable<ReturnType<typeof getSession>>): string {
  const durationMs = Date.now() - new Date(session.createdAt).getTime();
  const minutes = Math.floor(durationMs / 60000);
  return `${minutes} min`;
}

// ============================================================================
// BACKWARD COMPATIBILITY (deprecated)
// ============================================================================

/**
 * @deprecated Use handleWatiWebhook instead
 */
export async function processChatMessage(
  message: string,
  context: Record<string, unknown>
): Promise<{ text: string }> {
  // Redirect to main handler
  const session = context.sessionId as string;
  const sessionData = getSession(session);

  if (!sessionData) {
    return { text: 'Session not found. Please start a new conversation.' };
  }

  const result = await handleChatMessage(sessionData, message);
  return { text: result.success ? 'Message processed' : 'Failed to process message' };
}
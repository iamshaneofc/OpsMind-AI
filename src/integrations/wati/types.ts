/**
 * Wati WhatsApp Integration Types
 *
 * Types for Wati webhook events and message handling.
 * Used by: webhook-handler.ts, wati-client.ts, session-manager.ts
 */

// ============================================================================
// WATI WEBHOOK EVENT TYPES
// ============================================================================

export interface WatiWebhookEvent {
  event: WatiEventType;
  phone: string;
  timestamp?: number;
  sessionId?: string;
  message?: WatiMessage | WatiIncomingMessage;
  contact?: WatiContact;
  waId?: string;
  profileName?: string;
}

// Extended message type for incoming webhook payloads (more permissive)
export interface WatiIncomingMessage {
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
}

export type WatiEventType =
  | 'sessionStart'
  | 'sessionEnd'
  | 'message'
  | 'messageAck'
  | 'botMessage'
  | 'optIn'
  | 'optOut';

export interface WatiMessage {
  id: string;
  type: WatiMessageType;
  text?: string;
  mediaUrl?: string;
  caption?: string;
  timestamp: string;
}

export type WatiMessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive';

export interface WatiContact {
  name: string;
  phone: string;
  email?: string;
  profilePic?: string;
}

// ============================================================================
// OpsMind SESSION TYPES (for chat context)
// ============================================================================

export interface WatiChatSession {
  sessionId: string;
  phoneNumber: string;
  userId?: number;
  companyId?: number;
  role?: string;
  currentState: ChatFlowState;
  context: WatiConversationContext;
  createdAt: Date;
  lastActivityAt: Date;
  messages: WatiMessageLog[];
}

export type ChatFlowState =
  | 'NEW_USER'
  | 'AUTHENTICATING'
  | 'AUTHENTICATED'
  | 'ONBOARDING'
  | 'ACTIVE'
  | 'AWAITING_RESPONSE';

export interface WatiConversationContext {
  lastOrderNumber?: string;
  lastWarehouseId?: number;
  lastProductQuery?: string;
  pendingToolCall?: string;
  onboardingStep?: number;
  onboardingData?: OnboardingData;
}

export interface OnboardingData {
  companyName?: string;
  contactName?: string;
  email?: string;
}

export interface WatiMessageLog {
  id: string;
  direction: 'inbound' | 'outbound';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AUTH FLOW TYPES
// ============================================================================

export interface WatiAuthRequest {
  phoneNumber: string;
  message: string;
}

export interface WatiAuthResult {
  success: boolean;
  userId?: number;
  profile?: WatiUserProfile;
  error?: string;
}

export interface WatiUserProfile {
  userId: number;
  phoneNumber: string;
  companyId: number;
  companyName: string;
  role: string;
  erpAccountIds: number[];
}

// ============================================================================
// ONBOARDING FLOW TYPES
// ============================================================================

export interface WatiOnboardingRequest {
  sessionId: string;
  step: number;
  data: Record<string, string>;
}

export interface WatiOnboardingResult {
  success: boolean;
  nextStep: number;
  message: string;
  completed?: boolean;
}

export interface OnboardingData {
  companyName?: string;
  contactName?: string;
  email?: string;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface WatiResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface WatiMessageResponse extends WatiResponse {
  messageId?: string;
  sentAt?: Date;
}
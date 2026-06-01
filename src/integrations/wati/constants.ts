/**
 * Wati Integration Constants
 *
 * Configuration constants for Wati WhatsApp integration.
 * Environment variables should be set in .env
 */

// ============================================================================
// WATI API CONFIGURATION
// ============================================================================

export const WATI_API_BASE_URL = process.env.WATI_API_BASE_URL || 'https://wati-api.wati.io';
export const WATI_API_VERSION = 'v1';

// Wati API endpoints
export const WATI_ENDPOINTS = {
  SEND_MESSAGE: '/sendMessage',
  SEND_TEMPLATE: '/sendTemplateMessage',
  GET_SESSION: '/session',
  WEBHOOK: '/webhook',
} as const;

// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

// Required environment variables
export const WATI_REQUIRED_ENV = [
  'WATI_API_KEY',
  'WATI_PHONE_NUMBER',
  'WATI_WEBHOOK_SECRET',
] as const;

// Optional environment variables
export const WATI_OPTIONAL_ENV = {
  API_BASE_URL: 'WATI_API_BASE_URL',
  SESSION_TIMEOUT_MINUTES: 'WATI_SESSION_TIMEOUT_MINUTES',
  ONBOARDING_ENABLED: 'WATI_ONBOARDING_ENABLED',
  MAX_MESSAGE_LENGTH: 'WATI_MAX_MESSAGE_LENGTH',
} as const;

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const WATI_DEFAULTS = {
  SESSION_TIMEOUT_MINUTES: 30,
  MAX_MESSAGE_LENGTH: 4096,
  ONBOARDING_ENABLED: true,
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  TYPING_INDICATOR_DELAY_MS: 2000,
} as const;

// ============================================================================
// MESSAGE TEMPLATES
// ============================================================================

export const WATI_MESSAGE_TEMPLATES = {
  WELCOME: 'welcome_message',
  AUTH_OTP: 'auth_otp',
  AUTH_SUCCESS: 'auth_success',
  AUTH_FAILED: 'auth_failed',
  ONBOARDING_START: 'onboarding_start',
  ONBOARDING_COMPLETE: 'onboarding_complete',
  HELP: 'help_message',
  ERROR: 'error_message',
  ORDER_STATUS: 'order_status_template',
  INVENTORY_ALERT: 'inventory_alert_template',
} as const;

// ============================================================================
// SESSION STATE MACHINE
// ============================================================================

export const CHAT_FLOW_STATES = {
  NEW_USER: {
    next: ['AUTHENTICATING'],
    timeout: 300000, // 5 minutes
  },
  AUTHENTICATING: {
    next: ['AUTHENTICATED', 'NEW_USER'],
    timeout: 120000, // 2 minutes
  },
  AUTHENTICATED: {
    next: ['ONBOARDING', 'ACTIVE'],
    timeout: 60000, // 1 minute
  },
  ONBOARDING: {
    next: ['ACTIVE', 'AUTHENTICATED'],
    timeout: 300000, // 5 minutes
  },
  ACTIVE: {
    next: ['ACTIVE', 'AWAITING_RESPONSE'],
    timeout: 1800000, // 30 minutes
  },
  AWAITING_RESPONSE: {
    next: ['ACTIVE'],
    timeout: 300000, // 5 minutes
  },
} as const;

// ============================================================================
// ERROR CODES
// ============================================================================

export const WATI_ERROR_CODES = {
  // Authentication errors (1xxx)
  AUTH_INVALID_PHONE: 1001,
  AUTH_OTP_MISMATCH: 1002,
  AUTH_SESSION_EXPIRED: 1003,
  AUTH_USER_NOT_FOUND: 1004,

  // Session errors (2xxx)
  SESSION_NOT_FOUND: 2001,
  SESSION_EXPIRED: 2002,
  SESSION_INVALID_STATE: 2003,

  // Onboarding errors (3xxx)
  ONBOARDING_INVALID_STEP: 3001,
  ONBOARDING_MISSING_DATA: 3002,
  ONBOARDING_COMPLETED: 3003,

  // API errors (4xxx)
  API_WATI_UNAVAILABLE: 4001,
  API_WATI_RATE_LIMIT: 4002,
  API_WATI_AUTH_FAILED: 4003,

  // General errors (5xxx)
  UNKNOWN_ERROR: 5001,
  INVALID_MESSAGE: 5002,
  MESSAGE_TOO_LONG: 5003,
} as const;

// ============================================================================
// ONBOARDING STEPS (if enabled)
// Note: For OTP-based onboarding, use the flow in onboarding-flow.ts
// These steps are kept for future company-info collection if needed
// ============================================================================

export const ONBOARDING_STEPS = [
  { step: 1, key: 'company_name', prompt: 'Please enter your company name:', required: true },
  { step: 2, key: 'contact_name', prompt: 'What is your name?', required: true },
  { step: 3, key: 'email', prompt: 'Please share your email for account verification:', required: true },
] as const;

// ============================================================================
// OTP CONFIGURATION
// ============================================================================

export const OTP_CONFIG = {
  EXPIRY_MINUTES: 5,
  CODE_LENGTH: 6,
  MAX_ATTEMPTS: 3,
  MAX_PER_HOUR: 5,
  RESEND_COOLDOWN_SECONDS: 30,
  LOCKOUT_MINUTES: 15,
} as const;

// ============================================================================
// REGEX PATTERNS
// ============================================================================

export const WATI_PATTERNS = {
  PHONE_NUMBER: /^\+?[1-9]\d{1,14}$/, // E.164 format
  OTP_CODE: /^\d{4,6}$/, // 4-6 digit OTP
  ORDER_NUMBER: /\b(\d+\.\d+\.\d+\.\d+(?:\.\d+)?|\d{5,9})\b/, // ERP order format
  SKU_CODE: /\b[A-Z]-\d{5}\b/i, // SKU format like A-00101
} as const;
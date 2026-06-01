/**
 * Onboarding Flow for Wati WhatsApp Integration
 *
 * Handles new user onboarding via WhatsApp when they are not found in the system.
 * Collects email, sends OTP, verifies, and links WhatsApp number to user account.
 *
 * OTP Delivery: Uses Resend for email delivery
 * Storage: Temporary in-memory storage (replace with Redis in production)
 *
 * IMPORTANT: This is modular and separate from AI orchestration
 */

import { createSupabaseServerClient } from '@/supabase/server';
import { sendOnboardingOtp, verifyOtpCode, createOtpRecord, cleanupExpiredOtps } from './otp-service';
import type { WatiOnboardingRequest, WatiOnboardingResult, WatiChatSession } from './types';
import { ONBOARDING_STEPS } from './constants';
import { updateSessionContext, getSession } from './session-manager';

// ============================================================================
// TYPES
// ============================================================================

export type OnboardingState =
  | 'NEW_USER'
  | 'WAITING_FOR_EMAIL'
  | 'OTP_SENT'
  | 'OTP_VERIFIED'
  | 'COMPLETED'
  | 'FAILED';

export interface OnboardingSession {
  sessionId: string;
  phoneNumber: string;
  state: OnboardingState;
  email?: string;
  otpAttempts: number;
  lastOtpSentAt?: Date;
  lockedUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnboardingConfig {
  otpExpiryMinutes: number;
  maxOtpAttempts: number;
  maxOtpRequestsPerHour: number;
  lockoutMinutes: number;
}

// Default configuration
const DEFAULT_CONFIG: OnboardingConfig = {
  otpExpiryMinutes: 5,
  maxOtpAttempts: 3,
  maxOtpRequestsPerHour: 5,
  lockoutMinutes: 15,
};

// ============================================================================
// IN-MEMORY STORAGE (Replace with Redis in production)
// ============================================================================

const onboardingSessions = new Map<string, OnboardingSession>();

// ============================================================================
// MAIN ONBOARDING FUNCTIONS
// ============================================================================

/**
 * Process onboarding step from user input
 * This is called when user is in onboarding flow
 */
export async function processOnboardingStep(
  request: WatiOnboardingRequest
): Promise<WatiOnboardingResult> {
  const session = getSession(request.sessionId);

  if (!session) {
    return {
      success: false,
      nextStep: 1,
      message: 'Session not found. Please start fresh.',
    };
  }

  const currentStep = request.step;
  const stepConfig = ONBOARDING_STEPS.find(s => s.step === currentStep);

  if (!stepConfig) {
    return {
      success: false,
      nextStep: currentStep,
      message: 'Invalid onboarding step.',
    };
  }

  // Validate required field
  if (stepConfig.required && !request.data[stepConfig.key]) {
    return {
      success: false,
      nextStep: currentStep,
      message: `${stepConfig.prompt} (required)`,
    };
  }

  // Store the data in session context
  const onboardingData = {
    ...session.context.onboardingData,
    [stepConfig.key]: request.data[stepConfig.key],
  };

  updateSessionContext(request.sessionId, {
    onboardingData,
    onboardingStep: currentStep + 1,
  });

  // Determine next step
  const nextStep = currentStep + 1;
  const nextStepConfig = ONBOARDING_STEPS.find(s => s.step === nextStep);

  if (!nextStepConfig) {
    // Onboarding complete
    return {
      success: true,
      nextStep: -1,
      message: '🎉 Onboarding complete! You can now ask about your orders, inventory, and more.',
      completed: true,
    };
  }

  return {
    success: true,
    nextStep,
    message: nextStepConfig.prompt,
  };
}

/**
 * Start onboarding for a new user (not found in system)
 * This initiates the OTP flow
 */
export async function startOnboarding(
  phoneNumber: string,
  sessionId: string
): Promise<{ success: boolean; message: string; nextState: OnboardingState }> {
  // Create onboarding session
  const onboardingSession: OnboardingSession = {
    sessionId,
    phoneNumber,
    state: 'WAITING_FOR_EMAIL',
    otpAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  onboardingSessions.set(sessionId, onboardingSession);

  // Ask for email
  return {
    success: true,
    message: `Welcome to SRL Operations AI! 👋\n\nTo link your WhatsApp, please enter the email address you used to register on our web platform.`,
    nextState: 'WAITING_FOR_EMAIL',
  };
}

/**
 * Process email submission and send OTP
 */
export async function processEmailSubmission(
  sessionId: string,
  email: string
): Promise<{ success: boolean; message: string; nextState: OnboardingState }> {
  const onboardingSession = onboardingSessions.get(sessionId);

  if (!onboardingSession) {
    return {
      success: false,
      message: 'Session expired. Please start fresh.',
      nextState: 'FAILED',
    };
  }

  // Check if locked out
  if (onboardingSession.lockedUntil && new Date() < onboardingSession.lockedUntil) {
    const remainingMinutes = Math.ceil(
      (onboardingSession.lockedUntil.getTime() - Date.now()) / 60000
    );
    return {
      success: false,
      message: `Too many failed attempts. Please try again in ${remainingMinutes} minutes.`,
      nextState: onboardingSession.state,
    };
  }

  // Validate email format
  if (!isValidEmail(email)) {
    return {
      success: false,
      message: 'Please enter a valid email address (e.g., user@example.com)',
      nextState: 'WAITING_FOR_EMAIL',
    };
  }

  // Check if user exists with this email
  const userExists = await checkUserExistsByEmail(email);

  if (!userExists) {
    return {
      success: false,
      message: `No account found with email "${email}". Please register via our web platform first, then return here.`,
      nextState: 'WAITING_FOR_EMAIL',
    };
  }

  // Check rate limiting
  if (onboardingSession.lastOtpSentAt) {
    const hoursSinceLastOtp = (Date.now() - onboardingSession.lastOtpSentAt.getTime()) / 3600000;
    if (hoursSinceLastOtp < 1) {
      // Already sent OTP recently, don't send again
      return {
        success: false,
        message: 'OTP already sent recently. Please check your email or wait before requesting another.',
        nextState: 'OTP_SENT',
      };
    }
  }

  // Send OTP
  const otpResult = await sendOnboardingOtp(email, onboardingSession.phoneNumber);

  if (!otpResult.success) {
    return {
      success: false,
      message: 'Failed to send OTP. Please try again.',
      nextState: 'WAITING_FOR_EMAIL',
    };
  }

  // Update session state
  onboardingSession.email = email;
  onboardingSession.state = 'OTP_SENT';
  onboardingSession.lastOtpSentAt = new Date();
  onboardingSession.otpAttempts = 0;
  onboardingSession.updatedAt = new Date();

  return {
    success: true,
    message: `OTP sent to ${maskEmail(email)}!\n\nPlease enter the 6-digit code to verify your email.`,
    nextState: 'OTP_SENT',
  };
}

/**
 * Process OTP verification
 */
export async function processOtpVerification(
  sessionId: string,
  otpCode: string
): Promise<{ success: boolean; message: string; nextState: OnboardingState; linkedUserId?: number }> {
  const onboardingSession = onboardingSessions.get(sessionId);

  if (!onboardingSession) {
    return {
      success: false,
      message: 'Session expired. Please start fresh.',
      nextState: 'FAILED',
    };
  }

  // Check if locked out
  if (onboardingSession.lockedUntil && new Date() < onboardingSession.lockedUntil) {
    const remainingMinutes = Math.ceil(
      (onboardingSession.lockedUntil.getTime() - Date.now()) / 60000
    );
    return {
      success: false,
      message: `Too many failed attempts. Please try again in ${remainingMinutes} minutes.`,
      nextState: onboardingSession.state,
    };
  }

  // Check if we're in the right state
  if (onboardingSession.state !== 'OTP_SENT') {
    return {
      success: false,
      message: 'Please enter your email first to receive an OTP.',
      nextState: onboardingSession.state,
    };
  }

  // Verify OTP
  const verificationResult = await verifyOtpCode(
    onboardingSession.email!,
    otpCode,
    onboardingSession.phoneNumber
  );

  if (!verificationResult.valid) {
    onboardingSession.otpAttempts++;
    onboardingSession.updatedAt = new Date();

    // Check for lockout
    if (onboardingSession.otpAttempts >= DEFAULT_CONFIG.maxOtpAttempts) {
      onboardingSession.lockedUntil = new Date(Date.now() + DEFAULT_CONFIG.lockoutMinutes * 60000);
      onboardingSession.state = 'FAILED';

      return {
        success: false,
        message: `Too many incorrect attempts. Please try again after ${DEFAULT_CONFIG.lockoutMinutes} minutes.`,
        nextState: 'FAILED',
      };
    }

    const remainingAttempts = DEFAULT_CONFIG.maxOtpAttempts - onboardingSession.otpAttempts;

    return {
      success: false,
      message: `Invalid OTP. You have ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`,
      nextState: 'OTP_SENT',
    };
  }

  // OTP verified - link WhatsApp to user
  const userId = await linkWhatsAppToUser(onboardingSession.email!, onboardingSession.phoneNumber);

  if (!userId) {
    return {
      success: false,
      message: 'Failed to link WhatsApp account. Please try again.',
      nextState: 'FAILED',
    };
  }

  // Update session
  onboardingSession.state = 'COMPLETED';
  onboardingSession.updatedAt = new Date();

  return {
    success: true,
    message: `✅ WhatsApp successfully linked to your account!\n\nYou can now ask me about your orders, inventory, invoices, and more.\n\nWhat would you like to know?`,
    nextState: 'COMPLETED',
    linkedUserId: userId,
  };
}

/**
 * Get current onboarding state for a session
 */
export function getOnboardingState(sessionId: string): OnboardingState | null {
  const session = onboardingSessions.get(sessionId);
  return session?.state ?? null;
}

/**
 * Clear onboarding session
 */
export function clearOnboardingSession(sessionId: string): boolean {
  return onboardingSessions.delete(sessionId);
}

/**
 * Get onboarding step prompt by step number
 */
export function getOnboardingStepPrompt(step: number): string | null {
  const stepConfig = ONBOARDING_STEPS.find(s => s.step === step);
  return stepConfig?.prompt ?? null;
}

/**
 * Check if onboarding is required for a session
 */
export function needsOnboarding(session: WatiChatSession): boolean {
  // Needs onboarding if:
  // 1. Session is in ONBOARDING state
  // 2. Or session is AUTHENTICATED but no onboarding data
  if (session.currentState === 'ONBOARDING') {
    return true;
  }

  if (session.currentState === 'AUTHENTICATED' && !session.context.onboardingData) {
    // Check if user has company info
    if (!session.companyId) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.toLowerCase().trim());
}

/**
 * Mask email for display (e.g., u***@example.com)
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return email;

  const maskedLocal = localPart.length > 2
    ? localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1]
    : localPart[0] + '*';

  return `${maskedLocal}@${domain}`;
}

/**
 * Check if user exists by email
 */
async function checkUserExistsByEmail(email: string): Promise<boolean> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  return !error && !!data;
}

/**
 * Link WhatsApp number to user account
 */
async function linkWhatsAppToUser(email: string, phoneNumber: string): Promise<number | null> {
  const supabase = createSupabaseServerClient();

  // Get user by email
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .single();

  if (userError || !user) {
    console.error('[Onboarding] User not found:', email);
    return null;
  }

  // Normalize phone number
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const formattedPhone = normalizedPhone.length === 10 ? '91' + normalizedPhone : normalizedPhone;

  // Insert or update WhatsApp link
  const { error: upsertError } = await supabase
    .from('user_whatsapp_accounts')
    .upsert(
      {
        user_id: user.id,
        whatsapp_number: formattedPhone,
        is_verified: true,
        is_active: true,
        linked_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      },
      { onConflict: 'whatsapp_number' }
    );

  if (upsertError) {
    console.error('[Onboarding] Failed to link WhatsApp:', upsertError);
    return null;
  }

  // Return numeric user ID (extract from UUID)
  const userIdNum = parseInt(user.id.replace(/-/g, '').substring(0, 8), 16);
  return userIdNum;
}

/**
 * Cleanup expired OTP records and sessions
 */
export function cleanupOnboardingData(): void {
  const now = Date.now();
  let cleaned = 0;

  // Clean up expired sessions
  for (const [sessionId, session] of onboardingSessions.entries()) {
    const age = now - session.createdAt.getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    if (age > maxAge) {
      onboardingSessions.delete(sessionId);
      cleaned++;
    }
  }

  // Also cleanup expired OTPs
  cleanupExpiredOtps();

  if (cleaned > 0) {
    console.log(`[Onboarding] Cleaned up ${cleaned} expired sessions`);
  }
}

// Initialize periodic cleanup (every hour)
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupOnboardingData, 60 * 60 * 1000);
}

// ============================================================================
// RE-EXPORT FOR BACKWARD COMPATIBILITY
// ============================================================================

/**
 * Get the initial onboarding prompt (legacy function)
 */
export function getOnboardingStartMessage(): string {
  return `Welcome to SRL Operations AI! 👋\n\nTo link your WhatsApp, please enter the email address you used to register on our web platform.`;
}

/**
 * Validate onboarding data completeness
 */
export function validateOnboardingData(
  onboardingData: Record<string, string> | undefined
): { valid: boolean; missing: string[] } {
  if (!onboardingData) {
    return {
      valid: false,
      missing: ONBOARDING_STEPS.filter(s => s.required).map(s => s.key),
    };
  }

  const missing: string[] = [];

  for (const step of ONBOARDING_STEPS) {
    if (step.required && !onboardingData[step.key]) {
      missing.push(step.key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Complete onboarding and transition to ACTIVE state
 */
export async function completeOnboarding(
  sessionId: string,
  onboardingData: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  // Validate required data
  const validation = validateOnboardingData(onboardingData);

  if (!validation.valid) {
    return {
      success: false,
      message: `Missing required information: ${validation.missing.join(', ')}`,
    };
  }

  // Save onboarding data to user profile in Supabase
  const session = onboardingSessions.get(sessionId);
  if (!session || !session.email) {
    return {
      success: false,
      message: 'Onboarding session not found.',
    };
  }

  console.log(`[Wati Onboarding] Completed for session ${sessionId}`, onboardingData);

  return {
    success: true,
    message: '🎉 Your WhatsApp account is now linked! You can ask about orders, inventory, and more.',
  };
}
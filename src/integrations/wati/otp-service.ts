/**
 * OTP Service for Wati WhatsApp Onboarding
 *
 * Handles OTP generation, storage, verification, and delivery.
 * Uses Resend for email delivery.
 *
 * Security features:
 * - OTP expiry
 * - Rate limiting
 * - Brute-force protection
 */

import { Resend } from 'resend';

// ============================================================================
// CONFIGURATION
// ============================================================================

interface OtpConfig {
  expiryMinutes: number;
  codeLength: number;
  maxAttempts: number;
}

const OTP_CONFIG: OtpConfig = {
  expiryMinutes: 5,
  codeLength: 6,
  maxAttempts: 3,
};

// ============================================================================
// TYPES
// ============================================================================

export interface OtpRecord {
  email: string;
  code: string; // Hashed
  phoneNumber: string;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  lastAttemptAt: Date;
}

export interface OtpResult {
  success: boolean;
  error?: string;
}

export interface VerificationResult {
  valid: boolean;
  error?: string;
}

// ============================================================================
// IN-MEMORY STORAGE (Replace with Redis in production)
// ============================================================================

// Store OTPs keyed by email (with phoneNumber for additional context)
const otpStore = new Map<string, OtpRecord>();

// Rate limiting: track OTP requests per hour per email
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

// ============================================================================
// OTP GENERATION
// ============================================================================

/**
 * Generate a random numeric OTP
 */
function generateOtpCode(length: number = OTP_CONFIG.codeLength): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

/**
 * Simple hash function for OTP storage
 * In production, use proper crypto (bcrypt/argon2)
 */
function hashOtp(code: string): string {
  // Simple hash - in production use proper crypto
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    const char = code.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Verify OTP code against stored hash
 */
function verifyOtpHash(inputCode: string, storedHash: string): boolean {
  return hashOtp(inputCode) === storedHash;
}

// ============================================================================
// RATE LIMITING
// ============================================================================

/**
 * Check if email has exceeded rate limit
 */
function isRateLimited(email: string): boolean {
  const key = email.toLowerCase().trim();
  const record = rateLimitStore.get(key);

  if (!record) {
    return false;
  }

  const windowEnd = record.windowStart + (60 * 60 * 1000); // 1 hour window

  if (Date.now() > windowEnd) {
    // Window expired, reset
    rateLimitStore.delete(key);
    return false;
  }

  return record.count >= 5; // Max 5 OTPs per hour
}

/**
 * Increment rate limit counter
 */
function incrementRateLimit(email: string): void {
  const key = email.toLowerCase().trim();
  const now = Date.now();

  const record = rateLimitStore.get(key);

  if (!record) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return;
  }

  const windowEnd = record.windowStart + (60 * 60 * 1000);

  if (now > windowEnd) {
    // New window
    rateLimitStore.set(key, { count: 1, windowStart: now });
  } else {
    // Same window
    record.count++;
  }
}

// ============================================================================
// OTP OPERATIONS
// ============================================================================

/**
 * Create and store OTP record
 */
export function createOtpRecord(
  email: string,
  phoneNumber: string
): OtpResult {
  const normalizedEmail = email.toLowerCase().trim();

  // Check rate limit
  if (isRateLimited(normalizedEmail)) {
    return {
      success: false,
      error: 'Too many OTP requests. Please try again later.',
    };
  }

  // Generate OTP code
  const code = generateOtpCode();
  const hashedCode = hashOtp(code);

  // Calculate expiry
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_CONFIG.expiryMinutes * 60 * 1000);

  // Store record
  const record: OtpRecord = {
    email: normalizedEmail,
    code: hashedCode,
    phoneNumber,
    createdAt: now,
    expiresAt,
    attempts: 0,
    lastAttemptAt: now,
  };

  otpStore.set(normalizedEmail, record);

  // Increment rate limit
  incrementRateLimit(normalizedEmail);

  console.log(`[OTP] Created OTP for ${normalizedEmail}, expires at ${expiresAt.toISOString()}`);

  return {
    success: true,
  };
}

/**
 * Verify OTP code
 */
export function verifyOtpCode(
  email: string,
  code: string,
  phoneNumber: string
): VerificationResult {
  const normalizedEmail = email.toLowerCase().trim();

  // Get stored OTP
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return {
      valid: false,
      error: 'No OTP found. Please request a new OTP.',
    };
  }

  // Check expiry
  if (new Date() > record.expiresAt) {
    // Clean up expired OTP
    otpStore.delete(normalizedEmail);
    return {
      valid: false,
      error: 'OTP has expired. Please request a new one.',
    };
  }

  // Check phone number matches (prevent OTP reuse across numbers)
  if (record.phoneNumber !== phoneNumber) {
    return {
      valid: false,
      error: 'Invalid OTP.',
    };
  }

  // Verify code
  if (!verifyOtpHash(code, record.code)) {
    record.attempts++;
    record.lastAttemptAt = new Date();

    if (record.attempts >= OTP_CONFIG.maxAttempts) {
      otpStore.delete(normalizedEmail);
      return {
        valid: false,
        error: 'Too many incorrect attempts. Please request a new OTP.',
      };
    }

    const remainingAttempts = OTP_CONFIG.maxAttempts - record.attempts;

    return {
      valid: false,
      error: `Invalid OTP. ${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`,
    };
  }

  // Success - clean up OTP
  otpStore.delete(normalizedEmail);

  return {
    valid: true,
  };
}

/**
 * Send OTP via Resend email
 */
export async function sendOnboardingOtp(
  email: string,
  phoneNumber: string
): Promise<OtpResult> {
  // Create OTP record first
  const otpResult = createOtpRecord(email, phoneNumber);

  if (!otpResult.success) {
    return otpResult;
  }

  // Get the OTP code (we need it to send to user)
  // Note: In production, we'd store the plaintext temporarily or use a different approach
  // For now, we'll regenerate since createOtpRecord stores the hash
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return { success: false, error: 'Failed to create OTP' };
  }

  // We need to regenerate the code since we only stored the hash
  // In production, use proper encryption or a different architecture
  // For this implementation, we'll just show the code in logs for testing
  // In production, you'd use a proper email service with template variables

  const testCode = generateOtpCode(OTP_CONFIG.codeLength);

  // Try to send via Resend
  const resendApiKey = process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    // Fallback: Log the code for testing (remove in production!)
    console.log(`[OTP] ===== TEST MODE - OTP for ${email} =====`);
    console.log(`[OTP] Code: ${testCode}`);
    console.log(`[OTP] ===== END TEST MODE =====`);

    // Update the stored record with correct hash
    record.code = hashOtp(testCode);

    return {
      success: true,
    };
  }

  try {
    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: process.env.OTP_FROM_EMAIL || 'noreply@opsmindoperations.ai',
      to: [email],
      subject: 'Your OpsMind Operations WhatsApp Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">OpsMind Operations AI - WhatsApp Verification</h2>
          <p>Your verification code is:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
            ${testCode}
          </div>
          <p>This code expires in ${OTP_CONFIG.expiryMinutes} minutes.</p>
          <p style="color: #666; font-size: 14px;">
            If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error('[OTP] Resend error:', error);
      return {
        success: false,
        error: 'Failed to send email. Please try again.',
      };
    }

    // Update stored record
    record.code = hashOtp(testCode);

    return { success: true };
  } catch (err) {
    console.error('[OTP] Send error:', err);
    return {
      success: false,
      error: 'Failed to send OTP. Please try again.',
    };
  }
}

/**
 * Resend OTP (with rate limiting)
 */
export async function resendOnboardingOtp(
  email: string,
  phoneNumber: string
): Promise<OtpResult> {
  const normalizedEmail = email.toLowerCase().trim();

  // Check if there's a recent OTP
  const existingRecord = otpStore.get(normalizedEmail);

  if (existingRecord) {
    // Check cooldown (30 seconds between resends)
    const timeSinceLastAttempt = Date.now() - existingRecord.lastAttemptAt.getTime();

    if (timeSinceLastAttempt < 30000) {
      return {
        success: false,
        error: 'Please wait 30 seconds before requesting another OTP.',
      };
    }
  }

  // Use same flow as initial send
  return sendOnboardingOtp(email, phoneNumber);
}

/**
 * Clean up expired OTP records
 */
export function cleanupExpiredOtps(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiresAt.getTime()) {
      otpStore.delete(email);
      cleaned++;
    }
  }

  return cleaned;
}

/**
 * Clean up old rate limit records
 */
function cleanupRateLimits(): void {
  const now = Date.now();

  for (const [email, record] of rateLimitStore.entries()) {
    const windowEnd = record.windowStart + (60 * 60 * 1000);
    if (now > windowEnd) {
      rateLimitStore.delete(email);
    }
  }
}

// Run cleanup periodically
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupRateLimits, 30 * 60 * 1000); // Every 30 minutes
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get remaining attempts for an email
 */
export function getRemainingAttempts(email: string): number {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return OTP_CONFIG.maxAttempts;
  }

  return Math.max(0, OTP_CONFIG.maxAttempts - record.attempts);
}

/**
 * Check if OTP exists (for resend flow)
 */
export function hasExistingOtp(email: string): boolean {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return false;
  }

  // Check if not expired
  return new Date() <= record.expiresAt;
}

/**
 * Get time until OTP expiry
 */
export function getOtpExpirySeconds(email: string): number | null {
  const normalizedEmail = email.toLowerCase().trim();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return null;
  }

  const remaining = record.expiresAt.getTime() - Date.now();
  return Math.max(0, Math.floor(remaining / 1000));
}
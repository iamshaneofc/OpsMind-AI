/**
 * WhatsApp Authentication Handler
 *
 * Handles authentication for WhatsApp users via phone number lookup.
 * Uses the user_whatsapp_accounts table for verified WhatsApp links.
 *
 * Reuses:
 * - loadCompanyErpAccounts from @/services/auth
 * - mapRoleIdToAppRole from @/services/auth
 * - createSupabaseServerClient from @/supabase/server
 */

import { loadCompanyErpAccounts, mapRoleIdToAppRole } from '@/services/auth';
import { createSupabaseServerClient } from '@/supabase/server';
import type { WatiAuthResult, WatiUserProfile } from './types';
import type { UserProfile } from '@/types/auth';

// ============================================================================
// TYPES
// ============================================================================

export interface WhatsAppUserInfo {
  userId: string;
  email: string;
  fullName: string | null;
  role: string;
  companyId: string | null;
  isVerified: boolean;
}

export interface WhatsAppAuthContext {
  userId: string;
  phoneNumber: string;
  isVerified: boolean;
  profile: UserProfile;
}

// ============================================================================
// PHONE NUMBER NORMALIZATION
// ============================================================================

/**
 * Normalize phone number to consistent format for storage/lookup
 * Format: E.164 without + prefix (e.g., "919999999999")
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/\D/g, '');

  // If it starts with 0, remove it
  if (normalized.startsWith('0')) {
    normalized = normalized.substring(1);
  }

  // Add India country code (91) if it's a 10-digit number
  if (normalized.length === 10) {
    normalized = '91' + normalized;
  }

  // If it doesn't start with country code and is longer than 10, might be international
  // Keep as-is if already has country code

  return normalized;
}

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  if (normalized.length === 12 && normalized.startsWith('91')) {
    return `+${normalized.substring(0, 2)} ${normalized.substring(2, 7)} ${normalized.substring(7)}`;
  }
  return phone;
}

// ============================================================================
// AUTHENTICATION FUNCTIONS
// ============================================================================

/**
 * Authenticate a WhatsApp user by phone number
 *
 * Flow:
 * 1. Normalize phone number
 * 2. Look up in user_whatsapp_accounts table
 * 3. Load ERP account mapping from companies
 * 4. Return user profile
 */
export async function authenticateWhatsAppUser(
  phoneNumber: string
): Promise<WatiAuthResult> {
  const supabase = createSupabaseServerClient();

  try {
    // Normalize phone number
    const normalizedPhone = normalizePhoneNumber(phoneNumber);

    // Look up user by WhatsApp number using the new table
    const { data: waAccount, error: waError } = await supabase
      .from('user_whatsapp_accounts')
      .select(`
        id,
        user_id,
        whatsapp_number,
        is_verified,
        is_active
      `)
      .eq('whatsapp_number', normalizedPhone)
      .eq('is_active', true)
      .maybeSingle();

    if (waError) {
      console.error('[Wati Auth] WhatsApp account lookup error:', waError);
      return {
        success: false,
        error: 'Authentication service error. Please try again.',
      };
    }

    if (!waAccount) {
      // Fallback: try legacy phone lookup in users table
      return await authenticateViaLegacyPhone(supabase, normalizedPhone);
    }

    // Get user details from users table
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, role, company_id, warehouse_id')
      .eq('id', waAccount.user_id)
      .maybeSingle();

    if (userError || !user) {
      console.error('[Wati Auth] User lookup error:', userError);
      return {
        success: false,
        error: 'User account not found.',
      };
    }

    // Check if WhatsApp access is allowed
    const isAuthorized = await checkWhatsAppAuthorization(user.id, supabase);
    if (!isAuthorized) {
      return {
        success: false,
        error: 'WhatsApp access is not enabled for your account. Please contact support.',
      };
    }

    // Load ERP account mapping
    const companyId = user.company_id ? parseInt(user.company_id.replace(/-/g, '').substring(0, 8), 16) : null;
    const erp = await loadCompanyErpAccounts(supabase, companyId);

    // Get company name
    let companyName = 'Unknown';
    if (user.company_id) {
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', user.company_id)
        .maybeSingle();

      companyName = company?.name ?? 'Unknown';
    }

    // Map role from text to role_id for profile
    const roleId = roleTextToId(user.role);

    const profile: WatiUserProfile = {
      userId: parseInt(user.id.replace(/-/g, '').substring(0, 8), 16),
      phoneNumber: normalizedPhone,
      companyId: companyId,
      companyName,
      role: user.role as 'super_admin' | 'distributor' | 'warehouse',
      erpAccountIds: erp.erp_account_ids ?? [],
    };

    return {
      success: true,
      userId: profile.userId,
      profile,
    };
  } catch (error) {
    console.error('[Wati Auth] Unexpected error:', error);
    return {
      success: false,
      error: 'Authentication failed. Please try again.',
    };
  }
}

/**
 * Legacy authentication via users.phone or users.telephone field
 * Fallback for users not yet migrated to user_whatsapp_accounts
 */
async function authenticateViaLegacyPhone(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  normalizedPhone: string
): Promise<WatiAuthResult> {
  // Try direct phone lookup in users table
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id, warehouse_id, phone')
    .or(`phone.eq.${normalizedPhone},telephone.eq.${normalizedPhone}`)
    .maybeSingle();

  if (userError || !user) {
    return {
      success: false,
      error: 'No account linked to this WhatsApp number. Please register via the web application first.',
    };
  }

  // Check WhatsApp authorization
  const isAuthorized = await checkWhatsAppAuthorization(user.id, supabase);
  if (!isAuthorized) {
    return {
      success: false,
      error: 'WhatsApp access is not enabled for your account. Please contact support.',
    };
  }

  // Load ERP account mapping
  const companyId = user.company_id ? parseInt(user.company_id.replace(/-/g, '').substring(0, 8), 16) : null;
  const erp = await loadCompanyErpAccounts(supabase, companyId);

  // Get company name
  let companyName = 'Unknown';
  if (user.company_id) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', user.company_id)
      .maybeSingle();

    companyName = company?.name ?? 'Unknown';
  }

  const profile: WatiUserProfile = {
    userId: parseInt(user.id.replace(/-/g, '').substring(0, 8), 16),
    phoneNumber: normalizedPhone,
    companyId: companyId,
    companyName,
    role: user.role as 'super_admin' | 'distributor' | 'warehouse',
    erpAccountIds: erp.erp_account_ids ?? [],
  };

  return {
    success: true,
    userId: profile.userId,
    profile,
  };
}

/**
 * Check if user is authorized for WhatsApp access
 */
async function checkWhatsAppAuthorization(
  userId: string,
  supabase: ReturnType<typeof createSupabaseServerClient>
): Promise<boolean> {
  const { data: user } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (!user) return false;

  // All valid roles can access WhatsApp (super_admin, distributor, warehouse)
  const validRoles = ['super_admin', 'distributor', 'warehouse'];
  return validRoles.includes(user.role);
}

/**
 * Get user by WhatsApp number
 * Returns user info without full profile (lighter query)
 */
export async function getUserByWhatsApp(
  phoneNumber: string
): Promise<WhatsAppUserInfo | null> {
  const supabase = createSupabaseServerClient();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Try new table first
  const { data: waAccount } = await supabase
    .from('user_whatsapp_accounts')
    .select('user_id, is_verified, is_active')
    .eq('whatsapp_number', normalizedPhone)
    .eq('is_active', true)
    .maybeSingle();

  let userId = waAccount?.user_id;

  // Fallback to legacy phone field
  if (!userId) {
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .or(`phone.eq.${normalizedPhone},telephone.eq.${normalizedPhone}`)
      .maybeSingle();

    userId = user?.id;
  }

  if (!userId) return null;

  // Get full user details
  const { data: user } = await supabase
    .from('users')
    .select('id, email, full_name, role, company_id')
    .eq('id', userId)
    .maybeSingle();

  if (!user) return null;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.full_name,
    role: user.role,
    companyId: user.company_id,
    isVerified: waAccount?.is_verified ?? false,
  };
}

/**
 * Validate WhatsApp access for a user
 * Returns true if user can access WhatsApp features
 */
export async function validateWhatsAppAccess(userId: string): Promise<{
  valid: boolean;
  reason?: string;
}> {
  const supabase = createSupabaseServerClient();

  const { data: user } = await supabase
    .from('users')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (!user) {
    return { valid: false, reason: 'User not found' };
  }

  if (user.is_active === false) {
    return { valid: false, reason: 'User account is deactivated' };
  }

  const validRoles = ['super_admin', 'distributor', 'warehouse'];
  if (!validRoles.includes(user.role)) {
    return { valid: false, reason: 'Invalid user role for WhatsApp access' };
  }

  return { valid: true };
}

/**
 * Link WhatsApp number to existing user
 * (For future use when user links their WhatsApp from web UI)
 */
export async function linkWhatsAppAccount(
  userId: string,
  phoneNumber: string,
  isVerified: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  // Check if already linked
  const { data: existing } = await supabase
    .from('user_whatsapp_accounts')
    .select('id')
    .eq('whatsapp_number', normalizedPhone)
    .maybeSingle();

  if (existing) {
    return { success: false, error: 'This WhatsApp number is already linked to another account' };
  }

  // Insert new link
  const { error } = await supabase
    .from('user_whatsapp_accounts')
    .insert({
      user_id: userId,
      whatsapp_number: normalizedPhone,
      is_verified: isVerified,
      is_active: true,
      linked_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[Wati Auth] Failed to link WhatsApp account:', error);
    return { success: false, error: 'Failed to link WhatsApp account' };
  }

  return { success: true };
}

/**
 * Unlink WhatsApp number from user
 */
export async function unlinkWhatsAppAccount(
  userId: string,
  phoneNumber: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const { error } = await supabase
    .from('user_whatsapp_accounts')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('whatsapp_number', normalizedPhone);

  if (error) {
    return { success: false, error: 'Failed to unlink WhatsApp account' };
  }

  return { success: true };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert role text to role_id number
 * (Replicates logic from services/auth.ts)
 */
function roleTextToId(role: string | null): number {
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

// ============================================================================
// RE-EXPORT EXISTING FUNCTIONS (Backward compatibility)
// ============================================================================

/**
 * Authenticate a WhatsApp user by phone number
 * @deprecated Use authenticateWhatsAppUser instead
 */
export async function authenticateWatiUser(
  phoneNumber: string
): Promise<WatiAuthResult> {
  return authenticateWhatsAppUser(phoneNumber);
}

/**
 * Check if user is authorized for WhatsApp access
 * @deprecated Use validateWhatsAppAccess instead
 */
export async function isUserAuthorizedForWhatsApp(
  userId: number
): Promise<boolean> {
  const result = await validateWhatsAppAccess(String(userId));
  return result.valid;
}
/**
 * Chat Orchestrator for Wati Integration
 *
 * Bridges WhatsApp messages to the existing AI engine.
 * Reuses the same AI/chatbot logic from src/app/api/chat/route.ts
 *
 * TODO: Implement actual integration with existing chat API
 * TODO: Add proper message formatting for WhatsApp
 * TODO: Handle tool responses and format for WhatsApp
 */

import type { UserProfile } from '@/types/auth';
import { executeTool, aiTools } from '@/ai/tools';
import { getOpenAIClient } from '@/ai/openai';

/**
 * Process a WhatsApp message through the existing AI engine
 */
export async function processChatMessage(
  message: string,
  context: {
    userId?: number;
    companyId?: number;
    role?: string;
    sessionId: string;
    phoneNumber: string;
    lastOrderNumber?: string;
    lastWarehouseId?: number;
    messageHistory?: Array<{ role: string; content: string }>;
  }
): Promise<{ text: string; toolCalls?: unknown[] }> {
  // Build user profile from context
  const profile: UserProfile = {
    user_id: context.userId ?? 0,
    email: `${context.phoneNumber}@whatsapp.srl`,
    full_name: 'WhatsApp User',
    role_id: mapRoleToRoleId(context.role || 'distributor'),
    role: context.role as 'super_admin' | 'distributor' | 'warehouse' || 'distributor',
    company_id: context.companyId ?? null,
    warehouse_id: context.lastWarehouseId ?? null,
    base_warehouse_id: context.lastWarehouseId ?? null,
    erp_account_id: null,
    erp_account_ids: null,
  };

  try {
    // For now, return a placeholder response
    // TODO: Integrate with actual AI engine from src/app/api/chat/route.ts

    // The integration would look like:
    // 1. Build messages array from history
    // 2. Call OpenAI with system prompt + tools
    // 3. Execute any tool calls
    // 4. Format response for WhatsApp

    const response = await callExistingAIEngine(message, profile, context.messageHistory || []);

    return {
      text: response,
    };
  } catch (error) {
    console.error('[Wati Chat] Error processing message:', error);
    return {
      text: 'Sorry, I encountered an error processing your request. Please try again.',
    };
  }
}

/**
 * Call the existing AI engine (reuses src/app/api/chat/route.ts logic)
 */
async function callExistingAIEngine(
  userMessage: string,
  profile: UserProfile,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  // This is a placeholder that would integrate with the actual chat API
  // In production, this would call the same logic as src/app/api/chat/route.ts

  // TODO: Make an internal API call or directly invoke the chat logic

  console.log(`[Wati Chat] Would call AI engine with: ${userMessage.substring(0, 50)}...`);

  // Placeholder - would be replaced with actual AI call
  const simpleResponses = [
    `I understand you're asking about "${userMessage}". This feature is coming soon!`,
    `Thanks for your message! I'm processing your request about "${userMessage.substring(0, 30)}..."`,
    `I received your message: "${userMessage.substring(0, 30)}...". Let me check that for you.`,
  ];

  return simpleResponses[Math.floor(Math.random() * simpleResponses.length)];
}

/**
 * Map role string to role_id number
 */
function mapRoleToRoleId(role: string): number {
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
 * Format AI response for WhatsApp
 * - Removes markdown that doesn't render well
 * - Shortens long outputs
 * - Adds WhatsApp-friendly formatting
 */
export function formatForWhatsApp(text: string): string {
  // Remove code blocks
  let formatted = text.replace(/```[\s\S]*?```/g, '');

  // Simplify markdown links
  formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Bold to emoji for emphasis (WhatsApp doesn't support markdown)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '★ $1 ★');

  // Shorten if too long (WhatsApp has character limits)
  const maxLength = 1600;
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength) + '\n\n(continued...)';
  }

  return formatted.trim();
}

/**
 * Execute AI tool and format result for WhatsApp
 */
export async function executeToolForWhatsApp(
  toolName: string,
  args: Record<string, string | number>,
  profile: UserProfile
): Promise<string> {
  try {
    const result = await executeTool(toolName, args, profile);

    // Format result based on tool type
    if ('error' in result) {
      return `❌ ${result.error}`;
    }

    // Format based on tool result type
    if ('order_number' in result) {
      return formatOrderStatusForWhatsApp(result);
    }

    if ('orders' in result) {
      return formatOrdersListForWhatsApp(result);
    }

    // Generic formatting
    return JSON.stringify(result, null, 2).substring(0, 500);
  } catch (error) {
    return `Error executing tool: ${error instanceof Error ? error.message : 'Unknown'}`;
  }
}

/**
 * Format order status for WhatsApp
 */
function formatOrderStatusForWhatsApp(result: Record<string, unknown>): string {
  const lines = [
    `📦 Order: ${result.order_number}`,
    `Status: ${result.order_status || result.status}`,
  ];

  if (result.expected_delivery_date) {
    lines.push(`ETA: ${result.expected_delivery_date}`);
  }

  if (result.customer_name) {
    lines.push(`Customer: ${result.customer_name}`);
  }

  if (result.invoice_count) {
    lines.push(`Invoices: ${result.invoice_count}`);
  }

  return lines.join('\n');
}

/**
 * Format orders list for WhatsApp
 */
function formatOrdersListForWhatsApp(result: Record<string, unknown>): string {
  const orders = result.orders as Array<Record<string, unknown>> || [];

  if (orders.length === 0) {
    return 'No orders found.';
  }

  const lines = ['📋 Your Orders:'];

  for (const order of orders.slice(0, 5)) {
    lines.push(`• ${order.order_number} - ${order.status || order.order_status}`);
  }

  if (orders.length > 5) {
    lines.push(`\n...and ${orders.length - 5} more.`);
  }

  return lines.join('\n');
}
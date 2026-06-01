/**
 * Wati Chat Adapter
 *
 * Bridges WhatsApp messages to the existing OpsMind AI chatbot engine.
 * Reuses the SAME AI orchestration, prompts, and ERP tools.
 *
 * Key principle: DO NOT duplicate chatbot logic - adapt WhatsApp input
 * to match what the existing chat API expects.
 *
 * Reuses:
 * - getOpenAIClient from @/ai/openai
 * - aiTools from @/ai/tools
 * - executeTool from @/ai/tools
 * - loadCompanyErpAccounts from @/services/auth
 * - mapRoleIdToAppRole from @/services/auth
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getOpenAIClient } from '@/ai/openai';
import { aiTools, executeTool } from '@/ai/tools';
import { loadCompanyErpAccounts, mapRoleIdToAppRole } from '@/services/auth';
import { createSupabaseServerClient } from '@/supabase/server';
import type { UserProfile } from '@/types/auth';
import type { WatiUserProfile } from './types';

// ============================================================================
// SYSTEM PROMPT - Reused from existing chat route
// ============================================================================

// The WhatsApp channel uses the EXACT same system prompt as the web chat
// This ensures consistent AI behavior across channels
const WHATSAPP_SYSTEM_PROMPT = `You are OpsMind Operations AI, a professional operations assistant for OpsMind Chemicals.

TYPO HANDLING (PRODUCT/ORDER DOMAIN ONLY):
1. Check for likely typos only when the user appears to be asking about a product, order, invoice, inventory, dispatch, or warehouse.
2. If there is a clear typo in a product or chemical name, acknowledge it briefly and continue with the requested action.
3. Do not force typo correction for unrelated/non-product questions and do not let typo handling override the user's intent.

LIST FORMATTING RULE — MANDATORY:
- When you write a numbered list of products (1. product... 2. product...), NEVER append any text, question, or sentence to the last item.
- ALL follow-up questions or clarifying sentences MUST appear on their OWN separate paragraph, AFTER the numbered list ends.

ACCESS CONTROL:
- Distributors can access inventory data in addition to orders and invoices.
- Distributors can: track their orders, check order status, view pending orders, view invoices, and check inventory.
- DISTRIBUTOR BASE WAREHOUSE: When the profile context includes base_warehouse_id, product tracking and default stock for that distributor use that ERP warehouse.
- WAREHOUSE USERS: When a warehouse user asks for "inventory", "orders", "my inventory", "my orders", use their warehouse_id from the profile context automatically.
- SUPER ADMIN/DISTRIBUTOR: When super admin or distributor asks for "inventory" without specifying a warehouse, use getAllInventory.
- INVOICE ACCESS: Super Admin can view all invoices. Company Admin and regular users can only view invoices for their company.

CRITICAL INTELLIGENCE RULES:
1. ALWAYS read previous messages and tool results in this conversation. Extract and remember warehouse_id, order_number from previous tool calls.
2. FOR WAREHOUSE USERS: If user asks for "inventory" without specifying a warehouse, use their profile warehouse_id directly.
3. FOR SUPER ADMIN OR DISTRIBUTOR: If they ask for "inventory" without specifying a warehouse, call getAllInventory.
4. When user mentions a warehouse by NAME (e.g., "Mumbai", "Delhi"), call searchWarehouseByName first, then use the warehouse_id.
5. COMPLETE THE USER'S REQUEST IN ONE TURN.
6. When returning ANY list (orders, inventory, invoices), YOU MUST FORMAT IT EXCLUSIVELY AS A MARKDOWN TABLE.
7. PRODUCT SEARCH VS LISTING: If user asks "what is in this warehouse", use getWarehouseInventory. If they ask about a SPECIFIC product, use getProductTrackingAndInventory.

QUERY RULES:
- ORDER ID SOURCE: Use order identifier ONLY from the current user message.
- ERP number shapes: Sales orders use voucher series 105, Tax invoices use series 106.
- "What should I do next" for an order: call getOrderStatus only. If DELIVERED, say no next step.
- "my distributors", "list distributors" (super admin): use getDistributors
- Product tracking: use getProductTrackingAndInventory
- DEEP SUPPLY VISIBILITY: If stock is 0 or user asks "why" or "when", call getProductSupplyStatus.

RESPONSE FORMAT:
- For order list markdown tables, put up to 20 rows.
- For invoice_card and product_card, render full card contents.
- Never include json code blocks in the final answer.
- Keep responses concise but conversational.
- Use tool results as ground truth.
- Respect role-based access.
- Never ask for info you already have.
- End with helpful closing question to keep conversation going.`;

// ============================================================================
// TYPES
// ============================================================================

export interface WatiChatRequest {
  message: string;
  phoneNumber: string;
  sessionId: string;
  messageHistory?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

export interface WatiChatResponse {
  text: string;
  toolCalls?: string[];
  error?: string;
}

export interface WatiChatContext {
  userId: number;
  phoneNumber: string;
  role: 'super_admin' | 'distributor' | 'warehouse';
  roleId: number;
  companyId: number | null;
  warehouseId: number | null;
  baseWarehouseId: number | null;
  erpAccountId: number | null;
  erpAccountIds: number[] | null;
  companyName?: string;
}

// ============================================================================
// MAIN ADAPTER FUNCTION
// ============================================================================

/**
 * Process a WhatsApp message through the existing OpsMind AI engine
 *
 * This is the bridge that converts WhatsApp input to the format expected
 * by the existing chatbot logic. It:
 * 1. Builds a UserProfile from Wati auth context
 * 2. Prepares message history in OpenAI format
 * 3. Calls OpenAI with the same system prompt as web chat
 * 4. Executes any tool calls using the same executeTool function
 * 5. Returns the AI response adapted for WhatsApp
 */
export async function processWatiChatMessage(
  request: WatiChatRequest,
  context: WatiChatContext
): Promise<WatiChatResponse> {
  const startTime = Date.now();

  try {
    // Build UserProfile from context (same structure as web chat)
    const profile = buildUserProfile(context);

    console.log(`[Wati Chat] Processing: "${request.message.substring(0, 50)}..."`);
    console.log(`[Wati Chat] User: ${context.role} (id: ${context.userId}, company: ${context.companyId})`);

    // Prepare messages for OpenAI
    const messages = prepareMessages(request.message, request.messageHistory || []);

    // Call OpenAI with system prompt and tools (same as web chat)
    const openai = getOpenAIClient();

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: WHATSAPP_SYSTEM_PROMPT },
        ...messages,
      ],
      tools: aiTools,
      tool_choice: 'auto',
      temperature: 0.7,
    });

    const assistantMessage = response.choices[0]?.message;
    const responseText = assistantMessage?.content || '';
    const toolCalls = assistantMessage?.tool_calls || [];

    // Log for debugging
    console.log(`[Wati Chat] AI response: ${responseText.substring(0, 100)}...`);
    if (toolCalls.length > 0) {
      console.log(`[Wati Chat] Tool calls: ${toolCalls.map(tc => tc.function.name).join(', ')}`);
    }

    // Execute tool calls if any
    let toolResults: string[] = [];

    if (toolCalls.length > 0) {
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');

        // Execute using the SAME executeTool function as web chat
        const result = await executeTool(toolName, toolArgs, profile);

        // Add tool result to messages for next iteration
        const toolResultMessage = {
          role: 'tool' as const,
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        };
        messages.push(toolResultMessage);

        toolResults.push(`${toolName}: ${typeof result === 'string' ? result : JSON.stringify(result).substring(0, 200)}`);
      }

      // Get final response after tool execution
      const secondResponse = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: WHATSAPP_SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.7,
      });

      const finalText = secondResponse.choices[0]?.message?.content || responseText;

      // Format for WhatsApp (remove markdown not supported)
      const formattedText = formatForWhatsApp(finalText);

      const duration = Date.now() - startTime;
      console.log(`[Wati Chat] Completed in ${duration}ms`);

      return {
        text: formattedText,
        toolCalls: toolResults,
      };
    }

    // No tool calls - return direct response
    const formattedText = formatForWhatsApp(responseText);

    const duration = Date.now() - startTime;
    console.log(`[Wati Chat] Completed in ${duration}ms`);

    return {
      text: formattedText,
    };
  } catch (error) {
    console.error('[Wati Chat] Error:', error);

    return {
      text: 'I apologize, but I encountered an error processing your request. Please try again.',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build UserProfile from Wati auth context
 * This matches the UserProfile interface used by executeTool
 */
function buildUserProfile(context: WatiChatContext): UserProfile {
  return {
    user_id: context.userId,
    email: `${context.phoneNumber}@whatsapp.opsmind`,
    full_name: 'WhatsApp User',
    role: context.role,
    role_id: context.roleId,
    company_id: context.companyId,
    warehouse_id: context.warehouseId,
    base_warehouse_id: context.baseWarehouseId,
    erp_account_id: context.erpAccountId,
    erp_account_ids: context.erpAccountIds,
  };
}

/**
 * Prepare messages in OpenAI format
 * Includes conversation history for context
 */
function prepareMessages(
  currentMessage: string,
  history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  // Add history (last 10 messages to keep context window manageable)
  const recentHistory = history.slice(-10);

  for (const msg of recentHistory) {
    messages.push({
      role: msg.role,
      content: msg.content,
    });
  }

  // Add current message
  messages.push({
    role: 'user',
    content: currentMessage,
  });

  return messages;
}

/**
 * Format response for WhatsApp
 * Removes markdown not supported by WhatsApp
 */
export function formatForWhatsApp(text: string): string {
  if (!text) return '';

  let formatted = text;

  // Remove code blocks
  formatted = formatted.replace(/```[\s\S]*?```/g, '');

  // Remove inline code markers
  formatted = formatted.replace(/`([^`]+)`/g, '$1');

  // Simplify markdown links
  formatted = formatted.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Convert bold to underline (WhatsApp doesn't support markdown)
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '_$1_');

  // Convert italic
  formatted = formatted.replace(/\*([^*]+)\*/g, '_$1_');

  // Keep markdown tables but simplify
  // Tables are supported in WhatsApp Business API

  // Shorten if too long (WhatsApp has ~4096 char limit per message)
  const maxLength = 4000;
  if (formatted.length > maxLength) {
    formatted = formatted.substring(0, maxLength) + '\n\n_(Response truncated. Please ask for specific details.)_';
  }

  return formatted.trim();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load ERP context for a Wati user
 * Used to populate the chat context before calling AI
 */
export async function loadWatiUserErpContext(
  userId: number,
  companyId: number | null
): Promise<{
  erpAccountId: number | null;
  erpAccountIds: number[] | null;
  baseWarehouseId: number | null;
  companyName: string | null;
}> {
  const supabase = createSupabaseServerClient();

  // Load ERP account mapping (reuses existing function)
  const erp = await loadCompanyErpAccounts(supabase, companyId);

  // Get company name
  let companyName: string | null = null;
  if (companyId) {
    const { data: company } = await supabase
      .from('companies')
      .select('name')
      .eq('id', companyId)
      .maybeSingle();

    companyName = company?.name ?? null;
  }

  return {
    erpAccountId: erp.erp_account_id,
    erpAccountIds: erp.erp_account_ids,
    baseWarehouseId: erp.base_warehouse_id,
    companyName,
  };
}

/**
 * Convert WatiUserProfile (from auth) to WatiChatContext
 * for use in processWatiChatMessage
 */
export function convertProfileToChatContext(
  profile: WatiUserProfile,
  warehouseId?: number | null,
  baseWarehouseId?: number | null
): WatiChatContext {
  const roleId = roleTextToId(profile.role);

  return {
    userId: profile.userId,
    phoneNumber: profile.phoneNumber,
    role: profile.role,
    roleId,
    companyId: profile.companyId,
    warehouseId: warehouseId ?? null,
    baseWarehouseId: baseWarehouseId ?? null,
    erpAccountId: profile.erpAccountIds?.[0] ?? null,
    erpAccountIds: profile.erpAccountIds ?? null,
    companyName: profile.companyName,
  };
}

/**
 * Convert role text to role_id
 */
function roleTextToId(role: string): number {
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
// CONVERSATION LOGGING
// ============================================================================

/**
 * Log WhatsApp chat interaction for debugging/analytics
 */
export async function logWatiChatInteraction(
  phoneNumber: string,
  userId: number,
  message: string,
  response: string,
  toolCalls?: string[],
  error?: string
): Promise<void> {
  try {
    const supabase = createSupabaseServerClient();

    await supabase.from('chatbot_messages').insert({
      user_id: userId,
      role: 'whatsapp', // Mark as WhatsApp source
      message: message.substring(0, 1000),
      response: response.substring(0, 2000),
      // Note: Could add additional columns for WhatsApp-specific data
    });

    console.log('[Wati Chat] Interaction logged');
  } catch (logError) {
    // Don't fail the main request if logging fails
    console.error('[Wati Chat] Logging error:', logError);
  }
}

// ============================================================================
// BACKWARD COMPATIBILITY
// ============================================================================

/**
 * Legacy function name - redirects to new implementation
 * @deprecated Use processWatiChatMessage with WatiChatContext instead
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
  const chatContext: WatiChatContext = {
    userId: context.userId ?? 0,
    phoneNumber: context.phoneNumber,
    role: (context.role as 'super_admin' | 'distributor' | 'warehouse') || 'distributor',
    roleId: roleTextToId(context.role || 'distributor'),
    companyId: context.companyId ?? null,
    warehouseId: context.lastWarehouseId ?? null,
    baseWarehouseId: context.lastWarehouseId ?? null,
    erpAccountId: null,
    erpAccountIds: null,
  };

  const result = await processWatiChatMessage(
    {
      message,
      phoneNumber: context.phoneNumber,
      sessionId: context.sessionId,
      messageHistory: context.messageHistory?.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    },
    chatContext
  );

  return {
    text: result.text,
    toolCalls: result.toolCalls as unknown[],
  };
}
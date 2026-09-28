import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/services/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export interface AuditEvent {
  id: string;
  type: "order" | "chat" | "role" | "provider";
  action: string;
  detail: string;
  actor: string;
  at: string;
}

/**
 * Audit trail composed from tables that already exist — migrations are not
 * permitted, so there is no dedicated audit table. Admins see the whole
 * timeline; everyone else only sees their own activity.
 */
export async function GET() {
  try {
    const auth = await getCurrentUserProfile();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { profile } = auth;
    const isAdmin = profile.role === "admin";

    const [orderEvents, chatEvents, roleEvents, providerEvents] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ id: string; order_number: string; status: string; created_by: string | null; created_at: Date }>>(
        `SELECT osh.id, o.order_number, osh.status, osh.created_by, osh.created_at
           FROM order_status_history osh
           LEFT JOIN orders o ON o.id = osh.order_id
          ORDER BY osh.created_at DESC
          LIMIT 50`,
      ),
      prisma.$queryRawUnsafe<Array<{ id: string; message: string; user_id: string | null; created_at: Date }>>(
        `SELECT id, left(coalesce(message, ''), 140) AS message, user_id, created_at
           FROM chatbot_messages
          ORDER BY created_at DESC
          LIMIT 50`,
      ),
      prisma.userRole.findMany({
        orderBy: { updatedAt: "desc" },
        take: 30,
        select: { id: true, email: true, role: true, updatedAt: true },
      }),
      prisma.aiProviderConfig.findMany({
        orderBy: { updatedAt: "desc" },
        take: 20,
        select: { id: true, provider: true, updatedAt: true },
      }),
    ]);

    const events: AuditEvent[] = [];

    for (const row of orderEvents) {
      if (!isAdmin && row.created_by !== profile.user_id) continue;
      events.push({
        id: `order-${row.id}`,
        type: "order",
        action: "Order status changed",
        detail: `${row.order_number ?? "Order"} → ${row.status}`,
        actor: isAdmin ? row.created_by ?? "system" : "you",
        at: row.created_at.toISOString(),
      });
    }

    for (const row of chatEvents) {
      if (!isAdmin && row.user_id !== profile.user_id) continue;
      events.push({
        id: `chat-${row.id}`,
        type: "chat",
        action: "Assistant query",
        detail: row.message,
        actor: isAdmin ? row.user_id ?? "unknown" : "you",
        at: row.created_at.toISOString(),
      });
    }

    if (isAdmin) {
      for (const row of roleEvents) {
        events.push({
          id: `role-${row.id}`,
          type: "role",
          action: "Role updated",
          detail: `${row.email} → ${row.role}`,
          actor: "admin",
          at: row.updatedAt.toISOString(),
        });
      }
      for (const row of providerEvents) {
        events.push({
          id: `provider-${row.id}`,
          type: "provider",
          action: "AI provider updated",
          detail: `${row.provider} configuration changed`,
          actor: "admin",
          at: row.updatedAt.toISOString(),
        });
      }
    }

    events.sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({ events: events.slice(0, 60), scope: isAdmin ? "all" : "own" });
  } catch (e) {
    console.error("Audit log error:", e);
    return NextResponse.json({ error: "Failed to load audit log" }, { status: 500 });
  }
}

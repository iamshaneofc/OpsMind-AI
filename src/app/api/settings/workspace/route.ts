import { NextResponse } from "next/server";
import { getCurrentUserProfile } from "@/services/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Workspace tab: who you are inside the organisation — company, warehouse,
 * role and headcount. Reads only, from tables that already exist (companies
 * has no Prisma model, hence raw SQL).
 */
export async function GET() {
  try {
    const auth = await getCurrentUserProfile();
    if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { profile } = auth;

    const [companyRows, warehouseRows, warehouses, memberCount, roleCount] = await Promise.all([
      profile.company_id
        ? prisma.$queryRawUnsafe<{ id: string; name: string; code: string | null }[]>(
            `SELECT id, name, code FROM companies WHERE id = $1::uuid LIMIT 1`,
            profile.company_id,
          )
        : Promise.resolve([]),
      profile.warehouse_id
        ? prisma.warehouse.findUnique({ where: { id: profile.warehouse_id } })
        : Promise.resolve(null),
      prisma.warehouse.findMany({ orderBy: { name: "asc" }, take: 50 }),
      prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM users`,
      ),
      prisma.userRole.count(),
    ]);

    return NextResponse.json({
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
      company: companyRows[0] ?? null,
      warehouse: warehouseRows
        ? { id: warehouseRows.id, name: warehouseRows.name, location: warehouseRows.location }
        : null,
      warehouses: warehouses.map((w) => ({
        id: w.id,
        name: w.name,
        location: w.location,
      })),
      stats: {
        memberCount: memberCount[0]?.count ?? 0,
        roleCount,
        warehouseCount: warehouses.length,
      },
    });
  } catch (e) {
    console.error("Workspace settings error:", e);
    return NextResponse.json({ error: "Failed to load workspace" }, { status: 500 });
  }
}

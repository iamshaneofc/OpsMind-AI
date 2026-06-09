import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUserProfile } from "@/services/auth";

// Middleware/Helper to check if caller is admin
async function requireAdmin() {
  const session = await getCurrentUserProfile();
  if (!session || session.profile.role !== "admin") {
    return null;
  }
  return session;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const roles = await prisma.userRole.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return new NextResponse("Missing fields", { status: 400 });
    }

    const validRoles = ["ADMIN", "MANAGER", "ANALYST"];
    if (!validRoles.includes(role)) {
      return new NextResponse("Invalid role", { status: 400 });
    }

    // Upsert the user role
    const updated = await prisma.userRole.upsert({
      where: { email },
      update: { role },
      create: { email, role },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error creating/updating role:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return new NextResponse("Unauthorized", { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");

    if (!email) {
      return new NextResponse("Missing email", { status: 400 });
    }

    // Prevent deleting oneself
    if (email === admin.profile.email) {
       return new NextResponse("Cannot delete your own role", { status: 400 });
    }

    await prisma.userRole.delete({
      where: { email },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting role:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

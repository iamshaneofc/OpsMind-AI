import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { createSupabaseServerClient } from "@/supabase/server";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { profile } = await requireAuthenticatedUser();
    const body = await request.json();
    const { firstName, lastName } = body;

    if (!firstName || typeof firstName !== "string") {
      return NextResponse.json({ error: "First name is required" }, { status: 400 });
    }

    // Collapse runs of whitespace so a pasted "RJ " + " Sherawat" cannot
    // persist a double space into the saved name.
    const fullName = [firstName, lastName]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep public.users.full_name in sync too. getUser() metadata is the
    // primary source, but the scope query and any tool that reads users.full_name
    // should not keep showing a stale value after the user edits their name.
    await prisma.$executeRawUnsafe(
      `UPDATE users SET full_name = $1 WHERE email = $2`,
      fullName,
      profile.email,
    ).catch((e) => console.error("Failed to sync public.users.full_name:", e));

    return NextResponse.json({ success: true, full_name: fullName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

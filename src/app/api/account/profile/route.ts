import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { createSupabaseServerClient } from "@/supabase/server";

export async function POST(request: Request) {
  try {
    const { profile } = await requireAuthenticatedUser();
    const body = await request.json();
    const { firstName, lastName } = body;

    if (!firstName || typeof firstName !== "string") {
      return NextResponse.json({ error: "First name is required" }, { status: 400 });
    }

    const fullName = lastName ? `${firstName} ${lastName}`.trim() : firstName.trim();

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, full_name: fullName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

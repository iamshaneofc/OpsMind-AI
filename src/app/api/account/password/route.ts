import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/services/auth";
import { createSupabaseServerClient } from "@/supabase/server";

const MIN_PASSWORD_LENGTH = 8;

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser();

    const body = await request.json();
    const { password, confirmPassword } = body ?? {};

    if (typeof password !== "string" || !password) {
      return NextResponse.json({ error: "New password is required" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 },
      );
    }
    if (confirmPassword !== undefined && confirmPassword !== password) {
      return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Unauthorized" }, { status: 401 });
  }
}

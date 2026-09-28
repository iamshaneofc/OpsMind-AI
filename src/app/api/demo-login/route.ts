import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const email = process.env.NEXT_PUBLIC_DEMO_EMAIL_ADMIN;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD;

  if (!email || !password) {
    return NextResponse.json({ error: "Demo login not enabled" }, { status: 404 });
  }

  return NextResponse.json(
    { email, password },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

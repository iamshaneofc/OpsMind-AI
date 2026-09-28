export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Warm the Postgres pool before the first request is served. The Supabase
  // pooler is in ap-northeast-1 while this app runs in us-east-1, so the initial
  // connection handshake costs ~2s and must not land on a real login attempt.
  try {
    const { warmPool } = await import("./lib/db");
    await warmPool();
  } catch (e) {
    console.error("instrumentation: pool warm-up failed", e);
  }
}

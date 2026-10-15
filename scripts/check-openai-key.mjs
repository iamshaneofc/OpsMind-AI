import "dotenv/config";

const k = process.env.OPENAI_API_KEY || "";
console.log("len", k.length);
console.log("starts_sk", k.startsWith("sk-"));
console.log("has_space", /\s/.test(k));
console.log("prefix", k.slice(0, 8));
console.log("suffix", k.slice(-4));

if (!k) {
  console.error("OPENAI_API_KEY missing");
  process.exit(1);
}

const res = await fetch("https://api.openai.com/v1/models", {
  headers: { authorization: `Bearer ${k.trim()}` },
});
console.log("models_status", res.status);
if (!res.ok) {
  const text = await res.text();
  console.log("body", text.slice(0, 300));
  process.exit(1);
}
console.log("OpenAI key OK");

"use client";

import { useState } from "react";
import { ShieldCheck, KeyRound, Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SecurityPanel({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = (() => {
    if (!password) return { label: "—", score: 0, cls: "bg-white/10" };
    let s = 0;
    if (password.length >= 8) s++;
    if (password.length >= 12) s++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    const levels = [
      { label: "Too weak", cls: "bg-rose-500" },
      { label: "Weak", cls: "bg-rose-400" },
      { label: "Fair", cls: "bg-amber-400" },
      { label: "Good", cls: "bg-emerald-400" },
      { label: "Strong", cls: "bg-success" },
    ];
    const lvl = levels[Math.min(s, levels.length) - 1] ?? levels[0];
    return { ...lvl, score: Math.max(1, s) };
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword: confirm }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update password.");
        return;
      }
      setPassword("");
      setConfirm("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold text-white">Security</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your credential for {email}.
        </p>
      </div>

      <Card className="glass-card p-6 border-white/10">
        <div className="mb-5 flex items-center gap-2">
          <KeyRound size={16} className="text-primary" />
          <h4 className="text-sm font-semibold uppercase tracking-wider text-white">Change password</h4>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-white">New password</label>
            <div className="relative">
              <Input
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-black/20 border-white/10 text-white pr-10"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {password ? (
              <div className="flex items-center gap-3 pt-1">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${strength.cls}`}
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{strength.label}</span>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-white">Confirm password</label>
            <Input
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-black/20 border-white/10 text-white"
              placeholder="Repeat the new password"
              autoComplete="new-password"
            />
            {confirm && confirm !== password ? (
              <p className="text-xs text-rose-300">Passwords do not match.</p>
            ) : null}
          </div>

          {error ? (
            <p className="flex items-center gap-2 text-sm text-rose-300">
              <AlertCircle size={14} /> {error}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving || saved}
              className={`bg-primary hover:bg-primary/90 text-primary-foreground ${saved ? "bg-success hover:bg-success" : ""}`}
            >
              {saving ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : saved ? (
                <Check size={16} className="mr-2" />
              ) : (
                <ShieldCheck size={16} className="mr-2" />
              )}
              {saving ? "Updating…" : saved ? "Password updated" : "Update password"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

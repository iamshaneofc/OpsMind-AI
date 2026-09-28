"use client";

import { useEffect, useState } from "react";
import { Palette, LayoutGrid, Sparkles, Check, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ACCENTS,
  DEFAULT_PREFERENCES,
  applyPreferences,
  readPreferences,
  savePreferences,
  type Preferences,
} from "@/lib/preferences";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="glass-card p-6 border-white/10">
      <div className="mb-1.5 flex items-center gap-2">
        <Icon size={16} className="text-primary" />
        <h4 className="text-sm font-semibold uppercase tracking-wider text-white">{title}</h4>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{description}</p>
      {children}
    </Card>
  );
}

export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setPrefs(readPreferences());
  }, []);

  const update = (next: Partial<Preferences>) => {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    applyPreferences(merged);
    savePreferences(merged);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const reset = () => {
    setPrefs(DEFAULT_PREFERENCES);
    applyPreferences(DEFAULT_PREFERENCES);
    savePreferences(DEFAULT_PREFERENCES);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold text-white">System Preferences</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Personal display settings. Stored in this browser — no server record is created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved ? (
            <span className="flex items-center gap-1.5 text-xs text-success">
              <Check size={14} /> Saved
            </span>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            onClick={reset}
            className="border-white/10 bg-white/5 hover:bg-white/10 text-xs"
          >
            <RotateCcw size={13} className="mr-1.5" /> Reset
          </Button>
        </div>
      </div>

      <Section
        icon={Palette}
        title="Accent colour"
        description="Applied instantly across buttons, active nav and highlights."
      >
        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => {
            const active = prefs.accent === a.value;
            return (
              <button
                key={a.value}
                type="button"
                onClick={() => update({ accent: a.value })}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: a.swatch }}
                  aria-hidden
                />
                {a.label}
                {active ? <Check size={13} className="text-primary" /> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={LayoutGrid}
        title="Density"
        description="Compact tightens card padding and table rows across the dashboard."
      >
        <div className="flex gap-3">
          {(["comfortable", "compact"] as const).map((d) => {
            const active = prefs.density === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => update({ density: d })}
                className={`rounded-lg border px-4 py-2.5 text-sm capitalize transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                {d}
                {active ? <Check size={13} className="ml-1.5 inline text-primary" /> : null}
              </button>
            );
          })}
        </div>
      </Section>

      <Section
        icon={Sparkles}
        title="Motion"
        description="Reduced motion removes entrance animations and transitions."
      >
        <div className="flex gap-3">
          {(["full", "reduced"] as const).map((m) => {
            const active = prefs.motion === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => update({ motion: m })}
                className={`rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/10 text-white"
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:bg-white/5 hover:text-white"
                }`}
              >
                {m === "full" ? "Full motion" : "Reduced motion"}
                {active ? <Check size={13} className="ml-1.5 inline text-primary" /> : null}
              </button>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

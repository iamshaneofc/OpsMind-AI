export type Accent = "indigo" | "emerald" | "amber" | "rose" | "sky";
export type Density = "comfortable" | "compact";
export type Motion = "full" | "reduced";

export type Preferences = {
  accent: Accent;
  density: Density;
  motion: Motion;
};

export const DEFAULT_PREFERENCES: Preferences = {
  accent: "indigo",
  density: "comfortable",
  motion: "full",
};

export const ACCENTS: Array<{ value: Accent; label: string; swatch: string }> = [
  { value: "indigo", label: "Indigo", swatch: "#4F46E5" },
  { value: "emerald", label: "Emerald", swatch: "#10B981" },
  { value: "amber", label: "Amber", swatch: "#F59E0B" },
  { value: "rose", label: "Rose", swatch: "#F43F5E" },
  { value: "sky", label: "Sky", swatch: "#0EA5E9" },
];

/** localStorage-backed — no migrations are permitted, so prefs stay client-side. */
const STORAGE_KEY = "opsmind.preferences";

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function readPreferences(): Preferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      accent: isOneOf(parsed.accent, ["indigo", "emerald", "amber", "rose", "sky"] as const)
        ? parsed.accent
        : DEFAULT_PREFERENCES.accent,
      density: isOneOf(parsed.density, ["comfortable", "compact"] as const)
        ? parsed.density
        : DEFAULT_PREFERENCES.density,
      motion: isOneOf(parsed.motion, ["full", "reduced"] as const)
        ? parsed.motion
        : DEFAULT_PREFERENCES.motion,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function savePreferences(prefs: Preferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable (private mode) — preferences just won't persist.
  }
}

/** Reflect preferences onto <html> where the CSS rules in globals.css hook in. */
export function applyPreferences(prefs: Preferences): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = prefs.accent;
  root.dataset.density = prefs.density;
  root.dataset.motion = prefs.motion;
}

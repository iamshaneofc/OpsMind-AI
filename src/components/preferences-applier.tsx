"use client";

import { useEffect } from "react";
import { applyPreferences, readPreferences } from "@/lib/preferences";

/**
 * Re-applies stored preferences after hydration so accent/density/motion
 * survive reloads. The attribute is also set by an inline script in
 * globals-adjacent markup where available; this keeps React the source of truth.
 */
export function PreferencesApplier() {
  useEffect(() => {
    applyPreferences(readPreferences());
  }, []);

  return null;
}

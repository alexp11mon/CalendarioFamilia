"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface EventClipboard {
  /** Id of the event copied with Ctrl/⌘+C, or null. */
  copied: string | null;
  copy: (id: string) => void;
}

const Context = createContext<EventClipboard | null>(null);

/**
 * The copied event, in memory and in the app frame so it survives changing
 * the view or opening the detail (spec 017 RF-57, plan D9). The system
 * clipboard is never touched.
 */
export function EventClipboardProvider({ children }: { children: ReactNode }) {
  const [copied, copy] = useState<string | null>(null);
  return (
    <Context.Provider value={{ copied, copy }}>{children}</Context.Provider>
  );
}

export function useEventClipboard() {
  return useContext(Context);
}

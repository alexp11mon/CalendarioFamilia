import type { ReactNode } from "react";
import { EventClipboardProvider } from "@/components/calendar/event-clipboard";
import { ToastProvider } from "@/components/ui/toast";
import type { AccentId } from "@/lib/theme/accents";
import type { ThemeId } from "@/lib/theme/theme";
import { BottomBar } from "./bottom-bar";
import { CalendarHeaderProvider } from "./calendar-header";
import { SideRail } from "./side-rail";
import { ThemeSync } from "./theme-sync";
import { TopBar } from "./top-bar";

/**
 * Frame of every screen with a session: the side rail from 1024 px, the
 * bottom bar from 769 px and the top bar with its drawer on a phone (spec 016 RF-6, RF-7). The accent comes from the profile on the server, so the
 * first HTML already has it (spec 005 RF-9, RF-16, RF-18, plan D2, D3, D7).
 */
export function AppFrame({
  accent,
  theme,
  displayName,
  signOutAction,
  children,
}: {
  accent: AccentId;
  /** For the avatar of the phone header (spec 016 RF-6, plan D13). */
  displayName: string;
  /** The theme of the profile, to fix a device with an old cookie (spec 011 RF-4). */
  theme: ThemeId;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div
      data-app-frame=""
      data-accent={accent}
      className="flex min-h-full flex-1 flex-col"
    >
      <ThemeSync theme={theme} />
      <ToastProvider>
        <EventClipboardProvider>
          <CalendarHeaderProvider>
            <SideRail signOutAction={signOutAction} />
            <TopBar displayName={displayName} signOutAction={signOutAction} />
            <div className="flex flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] tab:pt-0 tab:pb-24 lg:pb-0 lg:pl-20">
              {children}
            </div>
            <BottomBar signOutAction={signOutAction} />
          </CalendarHeaderProvider>
        </EventClipboardProvider>
      </ToastProvider>
    </div>
  );
}

/** Shown while the profile loads: neutral, so red never flashes (RF-9). */
export function FrameSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <p role="status" className="text-muted">
        Cargando…
      </p>
    </div>
  );
}

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EventDetail } from "@/components/calendar/event-detail";
import { CalendarList } from "@/components/dashboard/calendar-list";
import { canMerge, canWriteEvents } from "@/lib/sync/read-only";

// Spec 007, T11: synced calendars are read-only in the existing screens and
// show where they come from (RF-20, RF-21, RF-26, RF-44, RF-45).
const SYNCED = {
  lastSyncedAt: "2026-10-27T10:05:00Z",
  accountEmail: null,
  connectionId: "conn-1",
  canWrite: false,
  googleAccess: null,
  provider: "google" as const,
};

describe("canWriteEvents (RF-20, RF-21)", () => {
  it("offers a calendar as a destination only to owners and editors when it is not synced", () => {
    expect(canWriteEvents({ role: "owner", synced: null })).toBe(true);
    expect(canWriteEvents({ role: "editor", synced: null })).toBe(true);
    expect(canWriteEvents({ role: "viewer", synced: null })).toBe(false);
    expect(canWriteEvents({ role: "owner", synced: SYNCED })).toBe(false);
    expect(canWriteEvents({ role: "editor", synced: SYNCED })).toBe(false);
  });
});

describe("canMerge (RF-45)", () => {
  it("leaves out synced calendars; a kept one is normal again", () => {
    expect(canMerge({ role: "owner", synced: SYNCED })).toBe(false);
    expect(canMerge({ role: "owner", synced: null })).toBe(true);
    expect(canMerge({ role: "editor", synced: null })).toBe(false);
  });
});

describe("EventDetail of a read-only synced event (spec 009 RF-8)", () => {
  it.each([
    ["reconnect", /volver a conectar/i],
    // Spec 018 T4: "google" became "provider", named in the text.
    ["provider", /solo puede ver este calendario/i],
  ] as const)("has no buttons and says why (%s)", (readOnly, text) => {
    render(
      <EventDetail
        event={{
          id: "e1",
          title: "Reunión",
          startsAt: "2026-11-02T07:00:00Z",
          endsAt: "2026-11-02T08:00:00Z",
          allDay: false,
          description: null,
          location: null,
          color: null,
          calendarName: "Trabajo (Google)",
          calendarColor: "#A0C4FF",
          categoryName: null,
          author: "Ana",
          readOnly,
        }}
        timeZone="Europe/Madrid"
        canEdit={false}
        deleteAction={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("CalendarList with synced calendars (RF-26, RF-44)", () => {
  const base = { id: "c1", name: "Trabajo (Google)", color: "#A0C4FF" };

  it("shows the last update to every member and the account only to the owner", () => {
    render(
      <CalendarList
        timeZone="Europe/Madrid"
        leaveAction={vi.fn()}
        calendars={[
          {
            ...base,
            role: "owner",
            synced: { ...SYNCED, accountEmail: "ana@gmail.com" },
          },
          { ...base, id: "c2", role: "viewer", synced: SYNCED },
        ]}
      />,
    );

    const [mine, shared] = screen.getAllByRole("listitem");
    expect(mine).toHaveTextContent("27 oct");
    expect(mine).toHaveTextContent("11:05");
    expect(mine).toHaveTextContent("ana@gmail.com");
    // The owner still renames, recolors and shares it (RF-44).
    expect(
      within(mine).getByRole("link", { name: /editar/i }),
    ).toBeInTheDocument();
    expect(
      within(mine).getByRole("link", { name: /compartir/i }),
    ).toBeInTheDocument();
    expect(shared).toHaveTextContent("11:05");
    expect(shared).not.toHaveTextContent("@");
  });

  it("says when a synced calendar has not been updated yet", () => {
    render(
      <CalendarList
        timeZone="Europe/Madrid"
        leaveAction={vi.fn()}
        calendars={[
          {
            ...base,
            role: "owner",
            synced: { ...SYNCED, lastSyncedAt: null },
          },
        ]}
      />,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent(/todavía no/i);
  });
});

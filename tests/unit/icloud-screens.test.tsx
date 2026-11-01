import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NoticeList } from "@/components/account/notice-list";
import { CalendarPicker } from "@/components/connections/calendar-picker";
import { DisconnectDialog } from "@/components/connections/disconnect-dialog";
import { UploadForm } from "@/components/connections/upload-form";
import type { AccountNotice } from "@/lib/account/queries";
import { RECURRENCE_MESSAGES } from "@/lib/recurrence/error-messages";

// Spec 018, T13: the account screens with iCloud (RF-16, RF-20, RF-28, RF-57,
// RF-62, RF-65, RF-67, RF-68).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const CONNECTION = "6f1c2a9e-1f0e-4c38-9d43-2a3b5c6d7e8f";

describe("NoticeList: an iCloud password no longer valid (RF-61, RF-62)", () => {
  const NOTICE: AccountNotice = {
    id: "s1",
    kind: "sync_revoked",
    personName: "",
    calendarName: "ana@icloud.com",
    createdAt: "2026-11-04T10:00:00Z",
    provider: "icloud",
    connectionId: CONNECTION,
  };

  it("explains the Apple ID password and reconnects that account", () => {
    render(<NoticeList notices={[NOTICE]} dismissAction={vi.fn()} />);

    expect(
      screen.getByText(/iCloud ya no acepta la contraseña.*ana@icloud\.com/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cambiar la contraseña del Apple ID/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Volver a conectar" }),
    ).toHaveAttribute(
      "href",
      `/dashboard/connections/new?provider=icloud&reconnect=${CONNECTION}`,
    );
  });
});

describe("CalendarPicker (RF-20)", () => {
  it("marks the calendars iCloud only lets read", () => {
    render(
      <CalendarPicker
        connectionId={CONNECTION}
        provider="icloud"
        action={vi.fn()}
        calendars={[
          {
            id: "https://p42-caldav.icloud.com/1/calendars/f/",
            name: "Familia",
            color: null,
            synced: false,
            access: "reader",
          },
        ]}
      />,
    );
    expect(screen.getByText("Solo lectura en iCloud")).toBeInTheDocument();
  });
});

describe("DisconnectDialog with iCloud (RF-65, RF-67, RF-68)", () => {
  it("reminds to revoke the password at Apple and says nothing is deleted there", async () => {
    render(
      <DisconnectDialog
        email="ana@icloud.com"
        provider="icloud"
        calendars={[{ name: "Casa", sharedWith: 0 }]}
        action={vi.fn(async () => ({}))}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent("¿Desconectar la cuenta de iCloud?");
    expect(dialog).toHaveTextContent(
      /revoca la contraseña específica de app en account\.apple\.com/,
    );
    expect(dialog).toHaveTextContent(/En iCloud no se borra nada/);
  });

  it("keeps Google's text for Google", async () => {
    render(
      <DisconnectDialog
        email="ana@gmail.com"
        calendars={[]}
        action={vi.fn(async () => ({}))}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Desconectar" }));
    expect(screen.getByRole("dialog")).not.toHaveTextContent(/apple/i);
  });
});

describe("UploadForm with iCloud accounts (RF-57)", () => {
  it("names the provider of the chosen account", async () => {
    render(
      <UploadForm
        accounts={[
          { id: "g", email: "ana@gmail.com", provider: "google" },
          { id: "i", email: "ana@icloud.com", provider: "icloud" },
        ]}
        toGoogle={12}
        onlyCafam={0}
        action={vi.fn()}
      />,
    );
    expect(screen.getByText(/Se copiarán a Google/)).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Cuenta"), "i");

    expect(screen.getByText(/Se copiarán a iCloud/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Subir a iCloud" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "iCloud: ana@icloud.com" }),
    ).toBeInTheDocument();
  });
});

describe("Repetir in synced calendars (RF-28)", () => {
  it("gives a reason that holds for Google and iCloud", () => {
    expect(RECURRENCE_MESSAGES.synced).toBe(
      "Los calendarios traídos de Google o iCloud no admiten repeticiones en CaFam.",
    );
  });
});

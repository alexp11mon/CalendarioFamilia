import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionList } from "@/components/connections/connection-list";
import { ProviderNotice } from "@/components/connections/provider-notice";
import { CONNECT_ERRORS } from "@/lib/sync/error-messages";
import { NAV_ITEMS } from "@/lib/shell/nav";

// Spec 007, T9: the accounts screen and the notice before Google (RF-1, RF-3,
// RF-4, RF-5, RF-8, RF-47, RF-48).
const CONNECTIONS = [
  {
    id: "c1",
    provider: "google" as const,
    email: "ana@gmail.com",
    status: "active" as const,
    canWrite: true,
  },
  {
    id: "c2",
    provider: "google" as const,
    email: "ana.trabajo@gmail.com",
    status: "needs_reauth" as const,
    canWrite: true,
  },
];

describe("ConnectionList", () => {
  it("shows provider, email and status of each account", () => {
    render(<ConnectionList connections={CONNECTIONS} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("ana@gmail.com")).toBeInTheDocument();
    expect(within(items[0]).getByText("Google")).toBeInTheDocument();
    expect(within(items[0]).getByText("Conectada")).toBeInTheDocument();
    expect(
      within(items[1]).getByText(/hay que volver a conectarla/i),
    ).toBeInTheDocument();
    expect(
      within(items[0]).getByRole("link", { name: /gestionar ana@gmail.com/i }),
    ).toHaveAttribute("href", "/dashboard/connections/c1");
  });

  it("offers to connect Google through the notice page and links the import", () => {
    render(<ConnectionList connections={[]} />);

    expect(screen.getByText(/aún no has conectado/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Conectar Google" }),
    ).toHaveAttribute("href", "/dashboard/connections/new?provider=google");
    // Spec 018 RF-1: iCloud next to Google.
    expect(
      screen.getByRole("link", { name: "Conectar iCloud" }),
    ).toHaveAttribute("href", "/dashboard/connections/new?provider=icloud");
    expect(
      screen.getByRole("link", { name: /importar un \.ics/i }),
    ).toHaveAttribute("href", "/dashboard/import");
  });

  it.each(["cancelled", "failed", "max"] as const)(
    "announces the %s return code in Spanish",
    (code) => {
      render(<ConnectionList connections={[]} error={code} />);
      expect(screen.getByRole("alert")).toHaveTextContent(CONNECT_ERRORS[code]);
    },
  );

  it("ignores an unknown return code", () => {
    render(<ConnectionList connections={[]} error="<script>" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ProviderNotice (RF-48)", () => {
  it("explains the unverified app warning before going to Google", () => {
    render(<ProviderNotice />);

    expect(screen.getByText(/no ha verificado/i)).toBeInTheDocument();
    expect(screen.getByText(/sin ánimo de lucro/i)).toBeInTheDocument();
    // Spec 009: the write permission and the privacy policy (RF-40, R7).
    expect(screen.getByText(/crear, cambiar y borrar/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/nunca para cambiarlos/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Política de privacidad" }),
    ).toHaveAttribute("href", "/privacy");
    expect(
      screen.getByRole("link", { name: "Continuar a Google" }),
    ).toHaveAttribute("href", "/api/oauth/google/start");
  });
});

describe("navigation", () => {
  it("has a section for connected accounts", () => {
    expect(NAV_ITEMS).toContainEqual({
      section: "connections",
      href: "/dashboard/connections",
      label: "Cuentas conectadas",
    });
  });
});

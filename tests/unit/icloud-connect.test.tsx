import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { IcloudConnectForm } from "@/components/connections/icloud-connect-form";
import { IcloudNotice } from "@/components/connections/icloud-notice";

// Spec 018, T12: the notice and the form to connect iCloud (RF-2 to RF-4,
// RF-6, RF-7, RF-12).
describe("IcloudNotice (RF-2 to RF-4)", () => {
  it("explains the app-specific password, two-factor and the steps at Apple", () => {
    render(<IcloudNotice />);
    expect(
      screen.getAllByText(/contraseña específica de app/).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/verificación en dos pasos/)).toBeInTheDocument();
    const steps = screen.getByRole("list");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(4);
    expect(
      screen.getByRole("link", { name: /account\.apple\.com/ }),
    ).toHaveAttribute("href", "https://account.apple.com/");
  });

  it("says what else the password opens, that CaFam only uses calendars and how to revoke it", () => {
    render(<IcloudNotice />);
    expect(screen.getByText(/correo y a tus contactos/)).toBeInTheDocument();
    expect(screen.getByText(/solo usa los calendarios/)).toBeInTheDocument();
    expect(screen.getByText(/revocarla/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Política de privacidad" }),
    ).toHaveAttribute("href", "/privacy");
  });
});

describe("IcloudConnectForm (RF-6, RF-7, RF-12)", () => {
  it("has labelled fields and a password that the browser does not fill", () => {
    render(<IcloudConnectForm action={vi.fn()} />);
    expect(screen.getByLabelText("Apple ID")).toHaveAttribute("type", "email");
    const password = screen.getByLabelText("Contraseña específica de app");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "off");
    expect(
      screen.getByRole("button", { name: "Conectar iCloud" }),
    ).toBeInTheDocument();
  });

  it("starts with the Apple ID of the account to reconnect", () => {
    render(<IcloudConnectForm action={vi.fn()} appleId="ana@icloud.com" />);
    expect(screen.getByLabelText("Apple ID")).toHaveValue("ana@icloud.com");
  });

  it("keeps the Apple ID and empties the password after an error", async () => {
    const action = vi.fn(async () => ({
      formError: "iCloud no ha aceptado el Apple ID o la contraseña.",
      values: { appleId: "ana@icloud.com", password: "" },
    }));
    render(<IcloudConnectForm action={action} />);

    await userEvent.type(screen.getByLabelText("Apple ID"), "ana@icloud.com");
    await userEvent.type(
      screen.getByLabelText("Contraseña específica de app"),
      "abcd-efgh-ijkl-mnop",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Conectar iCloud" }),
    );

    expect(
      await screen.findByText(/no ha aceptado el Apple ID/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Apple ID")).toHaveValue("ana@icloud.com");
    expect(screen.getByLabelText("Contraseña específica de app")).toHaveValue(
      "",
    );
  });
});

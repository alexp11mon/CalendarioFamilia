import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UploadForm } from "@/components/connections/upload-form";
import { CalendarList } from "@/components/dashboard/calendar-list";

// Spec 009, T11: what is copied before uploading and who may upload (RF-34,
// RF-38, RF-42, RF-43).
describe("UploadForm (RF-43)", () => {
  // Spec 013 RF-30: series go up as single events.
  it("warns that series go as single events and lose the rest", () => {
    render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={30}
        onlyCafam={0}
        series={2}
        occurrences={26}
        action={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "2 series se subirán como 26 eventos sueltos; las repeticiones fuera de la ventana se perderán.",
      ),
    ).toBeInTheDocument();
  });

  it("names one series in singular and says nothing without series", () => {
    const { unmount } = render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={1}
        onlyCafam={0}
        series={1}
        occurrences={1}
        action={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "1 serie se subirá como 1 evento suelto; las repeticiones fuera de la ventana se perderán.",
      ),
    ).toBeInTheDocument();
    unmount();
    render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={1}
        onlyCafam={0}
        action={vi.fn()}
      />,
    );
    expect(screen.queryByText(/series? se/)).not.toBeInTheDocument();
  });

  it("says how many events go to Google and how many stay in CaFam", () => {
    render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={12}
        onlyCafam={3}
        action={vi.fn()}
      />,
    );

    expect(screen.getByText(/12 eventos/)).toBeInTheDocument();
    expect(
      screen.getByText(/3 eventos se quedarán solo en CaFam/),
    ).toBeInTheDocument();
  });

  it("agrees in number with a single CaFam-only event", () => {
    render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={2}
        onlyCafam={1}
        action={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/1 evento se quedará solo en CaFam: está fuera/),
    ).toBeInTheDocument();
  });

  it("hides the CaFam-only line when every event goes", () => {
    render(
      <UploadForm
        accounts={[{ id: "c1", email: "ana@gmail.com" }]}
        toGoogle={1}
        onlyCafam={0}
        action={vi.fn()}
      />,
    );

    expect(screen.getByText(/1 evento\b/)).toBeInTheDocument();
    expect(screen.queryByText(/solo en CaFam/)).not.toBeInTheDocument();
  });

  it("sends the chosen account", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ values: { connectionId: "" } }));
    render(
      <UploadForm
        accounts={[
          { id: "c1", email: "ana@gmail.com" },
          { id: "c2", email: "casa@gmail.com" },
        ]}
        toGoogle={1}
        onlyCafam={0}
        action={action}
      />,
    );

    await user.selectOptions(screen.getByLabelText("Cuenta"), "c2");
    await user.click(screen.getByRole("button", { name: "Subir a Google" }));

    const data = (action.mock.calls[0] as unknown[])[1] as FormData;
    expect(data.get("connectionId")).toBe("c2");
  });
});

describe("Subir a Google in Mis calendarios (RF-38)", () => {
  it("shows the link only when the calendar can be uploaded", () => {
    render(
      <CalendarList
        timeZone="Europe/Madrid"
        leaveAction={vi.fn()}
        calendars={[
          {
            id: "a",
            name: "Mío",
            color: "#A0C4FF",
            role: "owner",
            synced: null,
            canUpload: true,
          },
          {
            id: "b",
            name: "Otro",
            color: "#A0C4FF",
            role: "owner",
            synced: null,
          },
        ]}
      />,
    );

    const [mine, other] = screen.getAllByRole("listitem");
    expect(
      within(mine).getByRole("link", { name: "Subir Mío a Google o iCloud" }),
    ).toHaveAttribute("href", "/dashboard/calendars/a/upload");
    expect(
      within(other).queryByRole("link", { name: /a Google/ }),
    ).not.toBeInTheDocument();
  });
});

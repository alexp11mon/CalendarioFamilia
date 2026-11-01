import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GoToDateDialog } from "@/components/calendar/go-to-date-dialog";

// Spec 017, T13: G opens a dialog to go to a date (RF-56).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

function setup() {
  const onGo = vi.fn();
  const onClose = vi.fn();
  render(<GoToDateDialog date="2026-11-04" onGo={onGo} onClose={onClose} />);
  return { onGo, onClose };
}

describe("GoToDateDialog", () => {
  it("opens with the view's date and goes to the one written", async () => {
    const { onGo } = setup();
    expect(
      screen.getByRole("dialog", { name: "Ir a una fecha" }),
    ).toBeVisible();
    const field = screen.getByLabelText("Fecha");
    expect(field).toHaveValue("2026-11-04");
    expect(field).toHaveFocus();
    await userEvent.clear(field);
    await userEvent.type(field, "2027-01-15");
    await userEvent.click(screen.getByRole("button", { name: "Ir" }));
    expect(onGo).toHaveBeenCalledWith("2027-01-15");
  });

  it("says when the date is not valid", async () => {
    const { onGo } = setup();
    await userEvent.clear(screen.getByLabelText("Fecha"));
    await userEvent.click(screen.getByRole("button", { name: "Ir" }));
    expect(screen.getByText("Escribe una fecha válida.")).toBeVisible();
    expect(screen.getByLabelText("Fecha")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(onGo).not.toHaveBeenCalled();
  });

  it("Cancelar closes it", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalled();
  });
});

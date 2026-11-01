import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ShortcutsHelp } from "@/components/calendar/shortcuts-help";
import { SHORTCUTS } from "@/lib/calendar/shortcuts";

// Spec 017, T13: ? lists every shortcut from the same table (RF-62, plan D16).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});

describe("ShortcutsHelp", () => {
  it("lists every shortcut of the table and closes", async () => {
    const onClose = vi.fn();
    render(<ShortcutsHelp onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "Atajos de teclado" });
    const terms = within(dialog).getAllByRole("term");
    expect(terms).toHaveLength(SHORTCUTS.length);
    for (const shortcut of SHORTCUTS) {
      expect(within(dialog).getByText(shortcut.description)).toBeVisible();
    }
    await userEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalled();
  });
});

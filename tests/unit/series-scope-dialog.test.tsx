import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  lossText,
  SeriesScopeDialog,
} from "@/components/recurrence/series-scope-dialog";

// Spec 013, T12: the scope of a change to an occurrence (RF-15, RF-19, RF-20,
// RF-24b, RF-32, plan D10).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

function setup(props: Partial<React.ComponentProps<typeof SeriesScopeDialog>>) {
  const submit = vi.fn((data: FormData) => data);
  const onChoose = vi.fn();
  const onCancel = vi.fn();
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        submit(new FormData(event.currentTarget, submitter));
      }}
    >
      <SeriesScopeDialog
        open
        verb="save"
        allowThis
        limitReached={false}
        loss={null}
        scope={null}
        onChoose={onChoose}
        onCancel={onCancel}
        {...props}
      />
    </form>,
  );
  return { submit, onChoose, onCancel };
}

describe("SeriesScopeDialog", () => {
  it("offers the three scopes and sends the chosen one (RF-15)", async () => {
    const user = userEvent.setup();
    const { submit, onChoose } = setup({});
    expect(
      screen.getByRole("dialog", { name: "Guardar evento repetido" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Este y los siguientes" }),
    );
    expect(onChoose).toHaveBeenCalledWith("following");
    expect(submit.mock.calls[0]![0].get("scope")).toBe("following");
    expect(
      screen.getByRole("button", { name: "Solo este evento" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Todos los eventos" }),
    ).toBeEnabled();
  });

  it("has no 'Solo este evento' when the calendar changed (D10)", () => {
    setup({ allowThis: false });
    expect(
      screen.queryByRole("button", { name: "Solo este evento" }),
    ).not.toBeInTheDocument();
  });

  it("disables 'Solo este evento' at 100 changes and proposes the next ones (RF-32)", () => {
    setup({ limitReached: true });
    expect(
      screen.getByRole("button", { name: "Solo este evento" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Esta serie ya tiene 100 cambios sueltos. Usa «Este y los siguientes».",
      ),
    ).toBeInTheDocument();
  });

  it("asks to confirm the losses and sends the same scope again (RF-19, RF-24b)", async () => {
    const user = userEvent.setup();
    const { submit } = setup({
      loss: { exceptions: 2, images: 3 },
      scope: "all",
    });
    expect(
      screen.getByText("Se perderán 2 cambios y 3 imágenes."),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Guardar igualmente" }),
    );
    const data = submit.mock.calls[0]![0];
    expect(data.get("scope")).toBe("all");
    expect(data.get("confirmLoss")).toBe("1");
  });

  it("says 'Borrar' when deleting (RF-20)", () => {
    setup({
      verb: "delete",
      loss: { exceptions: 0, images: 1 },
      scope: "this",
    });
    expect(
      screen.getByRole("button", { name: "Borrar igualmente" }),
    ).toBeInTheDocument();
  });

  it("cancels without sending", async () => {
    const user = userEvent.setup();
    const { submit, onCancel } = setup({});
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("lossText", () => {
  it.each([
    [{ exceptions: 1, images: 0 }, "Se perderá 1 cambio."],
    [{ exceptions: 0, images: 1 }, "Se perderá 1 imagen."],
    [{ exceptions: 3, images: 1 }, "Se perderán 3 cambios y 1 imagen."],
    // Spec 014 plan D6: the comments of the exceptions go too.
    [{ exceptions: 0, images: 0, comments: 1 }, "Se perderá 1 comentario."],
    [
      { exceptions: 2, images: 3, comments: 4 },
      "Se perderán 2 cambios, 3 imágenes y 4 comentarios.",
    ],
    [
      { exceptions: 1, images: 0, comments: 2 },
      "Se perderán 1 cambio y 2 comentarios.",
    ],
  ])("%o → %s", (loss, text) => {
    expect(lossText(loss)).toBe(text);
  });
});

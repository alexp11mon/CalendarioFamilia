import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SeriesScopeChoice } from "@/components/recurrence/series-scope-choice";

// Spec 017, T6: the scope dialog outside a form (plan scope-choice, D10).
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

describe("SeriesScopeChoice", () => {
  it("offers the three scopes and answers the one chosen", async () => {
    const onAnswer = vi.fn();
    render(
      <SeriesScopeChoice
        request={{ verb: "delete", loss: null, scope: null }}
        onAnswer={onAnswer}
      />,
    );
    expect(
      screen.getByRole("dialog", { name: "Borrar evento repetido" }),
    ).toBeVisible();
    for (const name of [
      "Solo este evento",
      "Este y los siguientes",
      "Todos los eventos",
    ]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Solo este evento" }),
    );
    expect(onAnswer).toHaveBeenCalledWith({
      scope: "this",
      confirmLoss: false,
    });
  });

  it("cancelling answers null", async () => {
    const onAnswer = vi.fn();
    render(
      <SeriesScopeChoice
        request={{ verb: "save", loss: null, scope: null }}
        onAnswer={onAnswer}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onAnswer).toHaveBeenCalledWith(null);
  });

  it("confirms the losses of the scope chosen", async () => {
    const onAnswer = vi.fn();
    render(
      <SeriesScopeChoice
        request={{
          verb: "delete",
          loss: { exceptions: 0, images: 3, comments: 1 },
          scope: "all",
        }}
        onAnswer={onAnswer}
      />,
    );
    expect(
      screen.getByText("Se perderán 3 imágenes y 1 comentario."),
    ).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Borrar igualmente" }),
    );
    expect(onAnswer).toHaveBeenCalledWith({ scope: "all", confirmLoss: true });
  });

  it("is closed without a request", () => {
    render(<SeriesScopeChoice request={null} onAnswer={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "@/components/ui/toast";

// Spec 008, T4: a short notice after saving, deleting or duplicating (RF-32).
function Trigger({ text }: { text: string }) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(text)}>
      Avisar
    </button>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toast", () => {
  it("announces the message politely and hides it after 4 s", () => {
    render(
      <ToastProvider>
        <Trigger text="Evento creado" />
      </ToastProvider>,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toBeEmptyDOMElement();

    act(() => screen.getByRole("button", { name: "Avisar" }).click());
    expect(region).toHaveTextContent("Evento creado");

    act(() => vi.advanceTimersByTime(3999));
    expect(region).toHaveTextContent("Evento creado");
    act(() => vi.advanceTimersByTime(1));
    expect(region).toBeEmptyDOMElement();
  });

  it("replaces the message and restarts the countdown", () => {
    function Two() {
      const { show } = useToast();
      return (
        <>
          <button type="button" onClick={() => show("Evento creado")}>
            Uno
          </button>
          <button type="button" onClick={() => show("Evento borrado")}>
            Dos
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Two />
      </ToastProvider>,
    );

    act(() => screen.getByRole("button", { name: "Uno" }).click());
    act(() => vi.advanceTimersByTime(3000));
    act(() => screen.getByRole("button", { name: "Dos" }).click());
    act(() => vi.advanceTimersByTime(3000));

    expect(screen.getByRole("status")).toHaveTextContent("Evento borrado");
  });

  it("does nothing outside a provider", () => {
    render(<Trigger text="Evento creado" />);

    expect(() =>
      act(() => screen.getByRole("button", { name: "Avisar" }).click()),
    ).not.toThrow();
  });
});

// Spec 011, T12: the notice fades out for 200 ms before it goes (RF-20).
describe("toast leaving", () => {
  it("marks the notice as leaving 200 ms before removing it", () => {
    render(
      <ToastProvider>
        <Trigger text="Evento creado" />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Avisar" }).click());
    const notice = screen.getByText("Evento creado");
    expect(notice).not.toHaveAttribute("data-leaving");

    act(() => vi.advanceTimersByTime(3800));
    expect(screen.getByText("Evento creado")).toHaveAttribute("data-leaving");

    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
});

// Spec 017, T5: "Deshacer" in the notice for 10 s, only for the last action
// (RF-24 to RF-26, RF-30).
function UndoTrigger({
  text,
  undo,
}: {
  text: string;
  undo: () => Promise<string | null>;
}) {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(text, { undo })}>
      {text}
    </button>
  );
}

describe("toast with Deshacer", () => {
  it("offers Deshacer for 10 s", () => {
    render(
      <ToastProvider>
        <UndoTrigger text="Evento movido" undo={async () => null} />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Evento movido" }).click());
    const undo = screen.getByRole("button", { name: "Deshacer" });
    expect(undo.className).toContain("min-h-11");

    act(() => vi.advanceTimersByTime(9999));
    expect(screen.getByRole("button", { name: "Deshacer" })).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("undoes, then says so", async () => {
    const undo = vi.fn(async () => null);
    render(
      <ToastProvider>
        <UndoTrigger text="Evento movido" undo={undo} />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Evento movido" }).click());
    await act(async () =>
      screen.getByRole("button", { name: "Deshacer" }).click(),
    );

    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Deshecho");
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("shows why it could not undo", async () => {
    render(
      <ToastProvider>
        <UndoTrigger text="Evento movido" undo={async () => "Ha cambiado"} />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Evento movido" }).click());
    await act(async () =>
      screen.getByRole("button", { name: "Deshacer" }).click(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("Ha cambiado");
  });

  it("a new notice drops the Deshacer of the previous one", () => {
    const first = vi.fn(async () => null);
    function Both() {
      const { show } = useToast();
      return (
        <>
          <button type="button" onClick={() => show("Uno", { undo: first })}>
            Uno
          </button>
          <button type="button" onClick={() => show("Dos")}>
            Dos
          </button>
        </>
      );
    }
    render(
      <ToastProvider>
        <Both />
      </ToastProvider>,
    );
    act(() => screen.getByRole("button", { name: "Uno" }).click());
    act(() => screen.getByRole("button", { name: "Dos" }).click());
    expect(screen.queryByRole("button", { name: "Deshacer" })).toBeNull();
  });
});

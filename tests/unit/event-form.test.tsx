import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  EventForm,
  type EventFormValues,
} from "@/components/calendar/event-form";
import type { FormState } from "@/lib/forms/form-state";

type State = FormState<keyof EventFormValues>;

// Spec 012, T11: images chosen while creating are uploaded once the event exists.
const images = vi.hoisted(() => ({
  assign: vi.fn(),
  reserveImages: vi.fn(),
  confirmImage: vi.fn(),
  cancelImage: vi.fn(),
  prepareImage: vi.fn(),
  uploadObject: vi.fn(),
}));
vi.mock("@/app/dashboard/events/image-actions", () => ({
  reserveImages: images.reserveImages,
  confirmImage: images.confirmImage,
  cancelImage: images.cancelImage,
}));
vi.mock("@/lib/images/prepare-image", () => ({
  prepareImage: images.prepareImage,
}));
vi.mock("@/lib/images/upload-object", () => ({
  uploadObject: images.uploadObject,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } } }),
    },
  }),
}));

beforeEach(() => {
  for (const mock of Object.values(images)) mock.mockReset();
  vi.stubGlobal("location", { ...window.location, assign: images.assign });
  images.prepareImage.mockImplementation(async () => ({
    full: new Blob(["full"], { type: "image/jpeg" }),
    thumb: new Blob(["t"], { type: "image/jpeg" }),
    width: 800,
    height: 600,
  }));
  images.reserveImages.mockImplementation(
    async (_event: string, specs: unknown[]) => ({
      ids: specs.map((_, i) => `id-${i}`),
    }),
  );
  images.uploadObject.mockResolvedValue("ok");
  images.confirmImage.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const CALENDARS = [
  { id: "cal-a", name: "Clases Uni", color: "#A0C4FF" },
  { id: "cal-b", name: "Familia", color: "#FFADAD" },
];

const CATEGORIES = [
  { id: "cat-1", name: "Matemáticas", calendarId: "cal-a" },
  { id: "cat-2", name: "Física", calendarId: "cal-a" },
  { id: "cat-3", name: "Cumpleaños", calendarId: "cal-b" },
];

const INITIAL: EventFormValues = {
  title: "",
  calendarId: "cal-a",
  allDay: "",
  startDate: "2026-11-02",
  startTime: "09:00",
  endDate: "2026-11-02",
  endTime: "10:00",
  description: "",
  location: "",
  color: "",
  categoryId: "",
  repeat: "none",
};

function setup(
  implementation?: (prev: State, formData: FormData) => Promise<State>,
  initial: EventFormValues = INITIAL,
  withImages = false,
) {
  const action = vi.fn<(prev: State, formData: FormData) => Promise<State>>(
    implementation ?? (async () => ({ values: INITIAL })),
  );
  render(
    <EventForm
      action={action}
      initial={initial}
      calendars={CALENDARS}
      categories={CATEGORIES}
      submitLabel="Crear evento"
      pendingLabel="Creando…"
      cancelHref="/dashboard"
      withImages={withImages}
    />,
  );
  return action;
}

function optionNames(select: HTMLElement) {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent);
}

describe("EventForm (RF-15, RF-16)", () => {
  it("has every field with a visible label", () => {
    setup();

    for (const label of [
      "Título",
      "Calendario",
      "Todo el día",
      "Fecha de inicio",
      "Hora de inicio",
      "Fecha de fin",
      "Hora de fin",
      "Descripción",
      "Lugar",
      "Categoría",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
    expect(
      screen.getByRole("radiogroup", { name: "Color" }),
    ).toBeInTheDocument();
  });

  it("offers only the calendars it receives (RF-27)", () => {
    setup();

    expect(optionNames(screen.getByLabelText("Calendario"))).toEqual([
      "Clases Uni",
      "Familia",
    ]);
  });

  it("hides the times for all-day events and shows them again (RF-20)", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByLabelText("Todo el día"));

    expect(screen.queryByLabelText("Hora de inicio")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hora de fin")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fecha de inicio")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Todo el día"));
    expect(screen.getByLabelText("Hora de inicio")).toHaveValue("09:00");
  });

  it("filters the categories by the chosen calendar (RF-28)", async () => {
    const user = userEvent.setup();
    setup();

    expect(optionNames(screen.getByLabelText("Categoría"))).toEqual([
      "Sin categoría",
      "Matemáticas",
      "Física",
    ]);

    await user.selectOptions(screen.getByLabelText("Calendario"), "cal-b");

    expect(optionNames(screen.getByLabelText("Categoría"))).toEqual([
      "Sin categoría",
      "Cumpleaños",
    ]);
  });

  it("drops the chosen category when the calendar changes (RF-27)", async () => {
    const user = userEvent.setup();
    setup(undefined, { ...INITIAL, categoryId: "cat-1" });
    expect(screen.getByLabelText("Categoría")).toHaveValue("cat-1");

    await user.selectOptions(screen.getByLabelText("Calendario"), "cal-b");

    expect(screen.getByLabelText("Categoría")).toHaveValue("");
  });

  it("uses the calendar's color unless one is chosen (RF-17)", async () => {
    const user = userEvent.setup();
    setup();

    expect(
      screen.getByRole("radio", { name: "Color del calendario" }),
    ).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Lavanda" }));
    expect(screen.getByRole("radio", { name: "Lavanda" })).toBeChecked();
  });

  it("shows each error next to its field (RF-18, RF-19)", async () => {
    const user = userEvent.setup();
    setup(async () => ({
      fieldErrors: {
        title: "Escribe un título de 1 a 100 caracteres.",
        endTime: "El fin no puede ser anterior al inicio.",
      },
      values: INITIAL,
    }));

    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    await screen.findByText("Escribe un título de 1 a 100 caracteres.");
    expect(screen.getByLabelText("Título")).toHaveAccessibleDescription(
      "Escribe un título de 1 a 100 caracteres.",
    );
    expect(screen.getByLabelText("Hora de fin")).toHaveAccessibleDescription(
      "El fin no puede ser anterior al inicio.",
    );
    expect(screen.getByLabelText("Hora de inicio")).toHaveAttribute(
      "aria-invalid",
      "false",
    );
  });

  it("keeps what was typed after an error", async () => {
    const user = userEvent.setup();
    setup(async () => ({
      formError: "No tienes permiso para hacer esto.",
      values: { ...INITIAL, title: "Examen", location: "Aula 3", allDay: "on" },
    }));

    await user.type(screen.getByLabelText("Título"), "Examen");
    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No tienes permiso",
    );
    expect(screen.getByLabelText("Título")).toHaveValue("Examen");
    expect(screen.getByLabelText("Lugar")).toHaveValue("Aula 3");
    expect(screen.getByLabelText("Todo el día")).toBeChecked();
  });

  it("disables the button while the action is pending", async () => {
    const user = userEvent.setup();
    let finish: (state: State) => void = () => {};
    setup(
      () =>
        new Promise<State>((resolve) => {
          finish = resolve;
        }),
    );

    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    expect(
      await screen.findByRole("button", { name: "Creando…" }),
    ).toBeDisabled();
    finish({ values: INITIAL });
  });

  it("sends every typed value", async () => {
    const user = userEvent.setup();
    const action = setup();

    await user.type(screen.getByLabelText("Título"), "Matemáticas");
    await user.selectOptions(screen.getByLabelText("Categoría"), "cat-2");
    await user.type(screen.getByLabelText("Lugar"), "Aula 3");
    await user.click(screen.getByRole("radio", { name: "Menta" }));
    await user.click(screen.getByRole("button", { name: "Crear evento" }));

    const formData = action.mock.calls[0]![1];
    expect(Object.fromEntries(formData.entries())).toMatchObject({
      title: "Matemáticas",
      calendarId: "cal-a",
      startDate: "2026-11-02",
      startTime: "09:00",
      endDate: "2026-11-02",
      endTime: "10:00",
      location: "Aula 3",
      color: "#CAFFBF",
      categoryId: "cat-2",
    });
    expect(formData.get("allDay")).toBeNull();
  });
});

// Spec 008, T9: hour lists and the automatic end time (RF-17, RF-18, RF-28, RF-30).
describe("EventForm: times (spec 008)", () => {
  const start = () => screen.getByRole("combobox", { name: "Hora de inicio" });
  const end = () => screen.getByRole("combobox", { name: "Hora de fin" });

  it("moves the end keeping the duration when the start changes (RF-17)", async () => {
    setup();

    await userEvent.click(start());
    await userEvent.click(screen.getByRole("option", { name: "10:30" }));

    expect(start()).toHaveValue("10:30");
    expect(end()).toHaveValue("11:30");
  });

  it("stops moving the end once it was changed by hand (RF-18)", async () => {
    setup();
    await userEvent.click(end());
    await userEvent.click(screen.getByRole("option", { name: "12:00 (3 h)" }));

    await userEvent.click(start());
    await userEvent.click(screen.getByRole("option", { name: "08:00" }));

    expect(end()).toHaveValue("12:00");
  });

  it("never moves the end past 23:59 (RF-30)", async () => {
    setup();

    await userEvent.click(start());
    await userEvent.click(screen.getByRole("option", { name: "23:30" }));

    expect(end()).toHaveValue("23:59");
  });

  it("lists the end times with their duration (RF-49)", async () => {
    setup();

    await userEvent.click(end());

    expect(screen.getByRole("option", { name: "10:00 (1 h)" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("puts the cursor in the title when asked (RF-28)", () => {
    render(
      <EventForm
        action={vi.fn(async () => ({ values: INITIAL }))}
        initial={INITIAL}
        calendars={CALENDARS}
        categories={CATEGORIES}
        submitLabel="Crear evento"
        pendingLabel="Creando…"
        cancelHref="/dashboard"
        focusTitle
      />,
    );

    expect(screen.getByLabelText("Título")).toHaveFocus();
  });
});

describe("EventForm with images (spec 012 RF-7, RF-28)", () => {
  const EVENT = "5b8f6c2e-3f0a-4d8e-9a51-2a8f1d7c9e10";

  function fileInput() {
    return document.querySelector<HTMLInputElement>('input[type="file"]')!;
  }

  it("offers Añadir imágenes only when creating with images", () => {
    setup();
    expect(
      screen.queryByRole("button", { name: "Añadir imágenes" }),
    ).toBeNull();
  });

  it("starts without images, also when duplicating (RF-28)", () => {
    setup(undefined, { ...INITIAL, title: "Copia" }, true);
    expect(
      screen.getByRole("button", { name: "Añadir imágenes" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("sends images=1 and uploads to the new event before going to it", async () => {
    const action = setup(
      async () => ({ done: "created", eventId: EVENT, values: INITIAL }),
      INITIAL,
      true,
    );
    await userEvent.type(screen.getByLabelText("Título"), "Viaje");
    await userEvent.upload(fileInput(), [
      new File(["x"], "playa.jpg", { type: "image/jpeg" }),
    ]);
    await screen.findByText("En espera");
    await userEvent.click(screen.getByRole("button", { name: "Crear evento" }));

    const sent = action.mock.calls[0][1] as FormData;
    expect(sent.get("images")).toBe("1");
    await waitFor(() =>
      expect(images.reserveImages).toHaveBeenCalledWith(EVENT, [
        { bytes: 5, width: 800, height: 600 },
      ]),
    );
    await waitFor(() =>
      expect(images.assign).toHaveBeenCalledWith(`/dashboard/events/${EVENT}`),
    );
    expect(images.confirmImage).toHaveBeenCalledWith("id-0");
  });

  it("without images it sends no images field", async () => {
    const action = setup(undefined, INITIAL, true);
    await userEvent.type(screen.getByLabelText("Título"), "Viaje");
    await userEvent.click(screen.getByRole("button", { name: "Crear evento" }));
    expect((action.mock.calls[0][1] as FormData).get("images")).toBeNull();
  });

  it("keeps the saved event and offers Reintentar when an image fails", async () => {
    images.uploadObject.mockResolvedValue("network");
    setup(
      async () => ({ done: "created", eventId: EVENT, values: INITIAL }),
      INITIAL,
      true,
    );
    await userEvent.type(screen.getByLabelText("Título"), "Viaje");
    await userEvent.upload(fileInput(), [
      new File(["x"], "playa.jpg", { type: "image/jpeg" }),
    ]);
    await screen.findByText("En espera");
    await userEvent.click(screen.getByRole("button", { name: "Crear evento" }));

    expect(
      await screen.findByText(
        "El evento se ha guardado, pero alguna imagen no se ha subido.",
      ),
    ).toBeInTheDocument();
    expect(images.assign).not.toHaveBeenCalled();

    images.uploadObject.mockResolvedValue("ok");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(images.assign).toHaveBeenCalledWith(`/dashboard/events/${EVENT}`),
    );
  });

  it("lets the user go on without the failed images", async () => {
    images.uploadObject.mockResolvedValue("network");
    setup(
      async () => ({ done: "created", eventId: EVENT, values: INITIAL }),
      INITIAL,
      true,
    );
    await userEvent.type(screen.getByLabelText("Título"), "Viaje");
    await userEvent.upload(fileInput(), [
      new File(["x"], "playa.jpg", { type: "image/jpeg" }),
    ]);
    await screen.findByText("En espera");
    await userEvent.click(screen.getByRole("button", { name: "Crear evento" }));
    await userEvent.click(
      await screen.findByRole("button", { name: "Continuar sin ellas" }),
    );
    expect(images.assign).toHaveBeenCalledWith(`/dashboard/events/${EVENT}`);
  });
});

describe("EventForm: Repetir (spec 013 RF-1, RF-2, RF-29)", () => {
  it("sends the chosen repetition with the form", async () => {
    const user = userEvent.setup();
    const action = setup();
    const repeat = screen.getByLabelText("Repetir");
    expect(repeat).toHaveDisplayValue("No se repite");
    expect(optionNames(repeat)).toContain("Cada semana el lunes");
    await user.selectOptions(repeat, "weekly");
    await user.type(screen.getByLabelText("Título"), "Clase");
    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]![1].get("repeat")).toBe("weekly");
  });

  it("is disabled with its reason in a calendar of Google", async () => {
    const user = userEvent.setup();
    render(
      <EventForm
        action={vi.fn(async () => ({ values: INITIAL }))}
        initial={INITIAL}
        calendars={[
          ...CALENDARS,
          { id: "cal-g", name: "Google", color: "#CAFFBF", synced: true },
        ]}
        categories={CATEGORIES}
        submitLabel="Crear evento"
        pendingLabel="Creando…"
        cancelHref="/dashboard"
      />,
    );
    expect(screen.getByLabelText("Repetir")).toBeEnabled();
    await user.selectOptions(screen.getByLabelText("Calendario"), "cal-g");
    expect(screen.getByLabelText("Repetir")).toBeDisabled();
    expect(
      screen.getByText(
        "Los calendarios traídos de Google o iCloud no admiten repeticiones en CaFam.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the error of the server next to the field (RF-8)", async () => {
    const user = userEvent.setup();
    const message = "Con este final la serie no tiene ninguna repetición.";
    setup(async () => ({
      values: { ...INITIAL, repeat: "daily" },
      fieldErrors: { repeat: message },
    }));
    await user.click(screen.getByRole("button", { name: "Crear evento" }));
    await screen.findByText(message);
    expect(screen.getByLabelText("Repetir")).toHaveAccessibleDescription(
      message,
    );
    expect(screen.getByLabelText("Repetir")).toHaveDisplayValue("Cada día");
  });
});

// Spec 013, T12: saving an occurrence asks the scope first (RF-15, RF-19, D10).
describe("EventForm on an occurrence", () => {
  const SERIES_INITIAL = {
    ...INITIAL,
    title: "Natación",
    repeat: "custom:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO",
  };

  function renderSeries(
    implementation: (prev: State, formData: FormData) => Promise<State>,
    limitReached = false,
  ) {
    const action = vi.fn(implementation);
    render(
      <EventForm
        action={action}
        initial={SERIES_INITIAL}
        calendars={CALENDARS}
        categories={CATEGORIES}
        submitLabel="Guardar cambios"
        pendingLabel="Guardando…"
        cancelHref="/dashboard"
        series={{ limitReached }}
      />,
    );
    return action;
  }

  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
  });

  it("opens the scope dialog instead of saving, then saves with the scope", async () => {
    const user = userEvent.setup();
    const action = renderSeries(async () => ({ values: SERIES_INITIAL }));
    expect(screen.getByLabelText("Repetir")).toHaveDisplayValue(
      "Cada semana el lunes",
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Solo este evento" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    expect(action.mock.calls[0]![1].get("scope")).toBe("this");
  });

  it("asks to confirm the losses and sends confirmLoss (RF-19)", async () => {
    const user = userEvent.setup();
    const action = renderSeries(async (_prev, data) =>
      data.get("confirmLoss") === "1"
        ? { values: SERIES_INITIAL, formError: "guardado" }
        : { values: SERIES_INITIAL, loss: { exceptions: 1, images: 2 } },
    );
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await user.click(screen.getByRole("button", { name: "Todos los eventos" }));
    await screen.findByText("Se perderán 1 cambio y 2 imágenes.");
    await user.click(
      screen.getByRole("button", { name: "Guardar igualmente" }),
    );
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    const second = action.mock.calls[1]![1];
    expect(second.get("scope")).toBe("all");
    expect(second.get("confirmLoss")).toBe("1");
  });

  it("hides 'Solo este evento' once the calendar changes (D10)", async () => {
    const user = userEvent.setup();
    renderSeries(async () => ({ values: SERIES_INITIAL }));
    await user.selectOptions(screen.getByLabelText("Calendario"), "cal-b");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(
      screen.queryByRole("button", { name: "Solo este evento" }),
    ).not.toBeInTheDocument();
  });
});

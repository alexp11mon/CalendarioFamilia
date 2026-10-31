import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CommentForm } from "@/components/comments/comment-form";
import { COMMENT_MESSAGES } from "@/lib/comments/error-messages";

// Spec 014, T7: the "Comentar" form (RF-7 to RF-10, RF-12, plan D8).
type Send = (
  body: string,
  clientId: string,
) => Promise<{ ok: boolean; error?: string; fieldError?: string }>;

function setup(onSend = vi.fn<Send>().mockResolvedValue({ ok: true })) {
  const user = userEvent.setup();
  render(<CommentForm onSend={onSend} />);
  return {
    user,
    onSend,
    field: screen.getByLabelText("Escribe un comentario"),
    button: screen.getByRole("button", { name: "Comentar" }),
  };
}

const UUID = /^[0-9a-f-]{36}$/;

describe("CommentForm", () => {
  it("has a visible label and a Comentar button", () => {
    const { button } = setup();
    expect(button).toHaveClass("min-h-11");
  });

  it("sends the text with a new client id and empties the field", async () => {
    const { user, field, button, onSend } = setup();
    await user.type(field, "Llevo la tarta");
    await user.click(button);
    expect(onSend).toHaveBeenCalledWith(
      "Llevo la tarta",
      expect.stringMatching(UUID),
    );
    expect(field).toHaveValue("");

    await user.type(field, "Y las velas");
    await user.click(button);
    expect(onSend.mock.calls[1][1]).not.toBe(onSend.mock.calls[0][1]);
  });

  it("does not send an empty or too long text and says why", async () => {
    const { user, field, button, onSend } = setup();
    await user.type(field, "   ");
    await user.click(button);
    expect(await screen.findByText(COMMENT_MESSAGES.empty)).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toBeTruthy();

    await user.clear(field);
    await user.click(field);
    await user.paste("a".repeat(1001));
    await user.click(button);
    expect(
      await screen.findByText(COMMENT_MESSAGES.tooLong),
    ).toBeInTheDocument();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("shows the counter near the limit", async () => {
    const { user, field } = setup();
    await user.click(field);
    await user.paste("a".repeat(950));
    expect(screen.getByText("950 / 1.000")).toBeInTheDocument();
  });

  it("keeps the text and shows the error when sending fails", async () => {
    const onSend = vi
      .fn<Send>()
      .mockResolvedValue({ ok: false, error: COMMENT_MESSAGES.connection });
    const { user, field, button } = setup(onSend);
    await user.type(field, "Llego tarde");
    await user.click(button);
    expect(
      await screen.findByText(COMMENT_MESSAGES.connection),
    ).toBeInTheDocument();
    expect(field).toHaveValue("Llego tarde");
  });

  it("retries the same text with the same client id, a new text with a new one", async () => {
    const onSend = vi
      .fn<Send>()
      .mockResolvedValue({ ok: false, error: COMMENT_MESSAGES.connection });
    const { user, field, button } = setup(onSend);
    await user.type(field, "Hola");
    await user.click(button);
    await user.click(button);
    expect(onSend.mock.calls[1][1]).toBe(onSend.mock.calls[0][1]);
    await user.type(field, "!");
    await user.click(button);
    expect(onSend.mock.calls[2][1]).not.toBe(onSend.mock.calls[0][1]);
  });

  it("disables the button while sending", async () => {
    let finish: (value: { ok: boolean }) => void = () => {};
    const onSend = vi
      .fn<Send>()
      .mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { user, field, button } = setup(onSend);
    await user.type(field, "Hola");
    await user.click(button);
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await vi.waitFor(() => expect(button).not.toBeDisabled());
  });

  it("sends with Ctrl+Intro and keeps Intro for new lines", async () => {
    const { user, field, onSend } = setup();
    await user.type(field, "Uno{Enter}dos");
    expect(onSend).not.toHaveBeenCalled();
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(onSend).toHaveBeenCalledWith(
      "Uno\ndos",
      expect.stringMatching(UUID),
    );
  });
});

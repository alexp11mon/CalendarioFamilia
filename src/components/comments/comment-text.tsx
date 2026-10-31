import { linkify } from "@/lib/comments/linkify";

/** Plain text with clickable https links; nothing is read as HTML (RF-11, plan D7). */
export function CommentText({ text }: { text: string }) {
  return (
    <p className="whitespace-pre-wrap break-words text-base text-ink">
      {linkify(text).map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-ink/40 underline-offset-2 hover:decoration-ink"
          >
            {segment.href}
          </a>
        ) : (
          segment.text
        ),
      )}
    </p>
  );
}

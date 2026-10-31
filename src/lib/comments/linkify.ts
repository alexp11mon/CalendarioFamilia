// Plain text with clickable https links and nothing else (RF-11, plan D7):
// the segments are drawn as text nodes and anchors, never as HTML.
export type TextSegment =
  { type: "text"; text: string } | { type: "link"; href: string };

const URL = /https:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?]+$/;

/** Drops the punctuation that ends the sentence, not the link. */
function trimLink(raw: string): string {
  let link = raw.replace(TRAILING, "");
  while (
    link.endsWith(")") &&
    link.split(")").length > link.split("(").length
  ) {
    link = link.slice(0, -1).replace(TRAILING, "");
  }
  return link;
}

export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  const push = (plain: string) => {
    if (plain) segments.push({ type: "text", text: plain });
  };
  for (const match of text.matchAll(URL)) {
    const href = trimLink(match[0]);
    // "https://" alone is not a link.
    if (href.length <= "https://".length) continue;
    push(text.slice(last, match.index));
    segments.push({ type: "link", href });
    last = match.index + href.length;
  }
  push(text.slice(last));
  // Merge neighbouring text pieces left by skipped matches.
  return segments.reduce<TextSegment[]>((merged, segment) => {
    const previous = merged.at(-1);
    if (previous?.type === "text" && segment.type === "text") {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
    return merged;
  }, []);
}

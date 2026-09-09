import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Icon, type IconName } from "./icon";

const iconNames: IconName[] = [
  "cash",
  "caution",
  "close",
  "critical",
  "info",
  "investment",
  "monii",
];

describe("Icon", () => {
  test.each(iconNames)("renders the %s glyph as decorative by default", (name) => {
    const markup = renderToStaticMarkup(<Icon name={name} />);

    expect(markup).toContain("<svg");
    expect(markup).toContain('aria-hidden="true"');
  });

  test("exposes a labelled icon as an image", () => {
    const markup = renderToStaticMarkup(<Icon label="Information" name="info" />);

    expect(markup).toContain('aria-label="Information"');
    expect(markup).toContain('role="img"');
    expect(markup).not.toContain("aria-hidden");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Spinner } from ".";

describe("Spinner", () => {
  test.each([
    ["small", "size-3.5"],
    ["medium", "size-4"],
    ["large", "size-5"],
  ] as const)("renders the %s size", (size, className) => {
    const markup = renderToStaticMarkup(<Spinner size={size} />);

    expect(markup).toContain(className);
    expect(markup).toContain('aria-hidden="true"');
  });

  test("can expose an accessible loading status", () => {
    const markup = renderToStaticMarkup(<Spinner label="Loading accounts" />);

    expect(markup).toContain('aria-label="Loading accounts"');
    expect(markup).toContain('role="status"');
    expect(markup).not.toContain("aria-hidden");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Banner } from ".";

function renderBanner(
  type?: "default" | "critical" | "caution",
  onDismiss?: () => void,
) {
  return renderToStaticMarkup(
    <Banner
      actions={<button type="button">Act</button>}
      description="Banner description"
      onDismiss={onDismiss}
      title="Banner title"
      type={type}
    />,
  );
}

describe("Banner", () => {
  test.each([
    [undefined, "border-info-outline"],
    ["critical", "border-danger-outline"],
    ["caution", "border-warning/25"],
  ] as const)("renders the %s treatment and supplied content", (type, tone) => {
    const markup = renderBanner(type);

    expect(markup).toContain(tone);
    expect(markup).toContain("Banner title");
    expect(markup).toContain("Banner description");
    expect(markup).toContain(">Act</button>");
  });

  test("only renders the dismiss control when onDismiss is provided", () => {
    expect(renderBanner()).not.toContain('aria-label="Dismiss banner"');
    expect(renderBanner("default", () => {})).toContain(
      'aria-label="Dismiss banner"',
    );
  });
});

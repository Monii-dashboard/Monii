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
    { name: "default", tone: "border-info-outline", type: undefined },
    { name: "critical", tone: "border-danger-outline", type: "critical" },
    { name: "caution", tone: "border-warning/25", type: "caution" },
  ] as const)("renders the $name treatment", ({ type, tone }) => {
    const markup = renderBanner(type);

    expect(markup).toContain(tone);
  });

  test("renders the supplied title, description, and action", () => {
    const markup = renderBanner();

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

import { describe, expect, test } from "vitest";

import {
  decimalFromScaledInteger,
  decimalToScaledInteger,
} from "./account-valuation";

describe("decimal amount conversion", () => {
  test.each([
    { amount: "0", scaled: 0n },
    { amount: "0.00000001", scaled: 1n },
    { amount: "-999.99999999", scaled: -99_999_999_999n },
    { amount: "0001.23000000", scaled: 123_000_000n },
  ])("parses $amount as $scaled scale-eight units", ({ amount, scaled }) => {
    expect(decimalToScaledInteger(amount)).toBe(scaled);
  });

  test.each([
    { formatted: "0", scaled: 0n },
    { formatted: "0.00000001", scaled: 1n },
    { formatted: "-0.00000001", scaled: -1n },
    { formatted: "1.23", scaled: 123_000_000n },
  ])("formats $scaled scale-eight units as $formatted", ({ formatted, scaled }) => {
    expect(decimalFromScaledInteger(scaled)).toBe(formatted);
  });

  test.each([
    "",
    " 1",
    "+1",
    ".5",
    "1.",
    "1.000000001",
    "1e2",
    "NaN",
  ])("rejects invalid decimal syntax %s", (amount) => {
    expect(() => decimalToScaledInteger(amount)).toThrow(
      `Invalid decimal amount: ${amount}`,
    );
  });
});

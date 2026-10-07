import { expect, test } from "bun:test";
import { tooFull } from "./jobs";

test("a full stomach: less than half of it still fits", () => {
  expect(tooFull(98.6, "snoep")).toBe(true);
  expect(tooFull(93, "snoep")).toBe(true);
  expect(tooFull(85, "snoep")).toBe(false);
  expect(tooFull(96, "koffie")).toBe(true);
  expect(tooFull(94, "koffie")).toBe(false);
  expect(tooFull(70, "dagschotel")).toBe(true);
  expect(tooFull(50, "dagschotel")).toBe(false);
  expect(tooFull(99, "water")).toBe(true);
  expect(tooFull(97, "water")).toBe(false);
});

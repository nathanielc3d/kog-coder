import test from "node:test";
import assert from "node:assert/strict";
import { plainAmount } from "./plain-amount.ts";

test("Q1 basic positive formatting", () => {
  const result = plainAmount("1234567", 2, "USDC");
  assert.strictEqual(result, "12,345.67 USDC");
});

test("Q1 trailing zeros trimmed to minimum two decimals", () => {
  const result = plainAmount("1234500", 2, "USDC");
  assert.strictEqual(result, "12,345.00 USDC");
});

test("Q1 full decimals kept when no trailing zeros", () => {
  const result = plainAmount("123456789", 6, "USDC");
  assert.strictEqual(result, "123.456789 USDC");
});

test("Q1 negative value uses word minus", () => {
  const result = plainAmount("-1234567", 2, "USDC");
  assert.strictEqual(result, "minus 12,345.67 USDC");
});

test("Q1 Arabic-Indic digits accepted", () => {
  const arabicIndic = "١٢٣٤٥٦٧"; // U+0660-U+0669
  const result = plainAmount(arabicIndic, 2, "USDC");
  assert.strictEqual(result, "12,345.67 USDC");
});

test("Q1 Extended Arabic-Indic digits accepted", () => {
  const extendedIndic = "۰۱۲۳۴۵۶۷"; // U+06F0-U+06F9
  const result = plainAmount(extendedIndic, 2, "USDC");
  assert.strictEqual(result, "12,345.67 USDC");
});

test("Q1 leading zeros are ignored", () => {
  const result = plainAmount("000001234567", 2, "USDC");
  assert.strictEqual(result, "12,345.67 USDC");
});

test("Q1 zero value formatted with two decimals", () => {
  const result = plainAmount("0", 2, "USDC");
  assert.strictEqual(result, "0.00 USDC");
});

test("Q1 negative zero treated as zero", () => {
  const result = plainAmount("-0", 2, "USDC");
  assert.strictEqual(result, "0.00 USDC");
});

test("Q1 very large integer handled correctly", () => {
  const large = "123456789012345678901234567890";
  const result = plainAmount(large, 6, "USDC");
  assert.strictEqual(
    result,
    "123,456,789,012,345,678,901,234.567890 USDC",
  );
});

test("Q1 invalid characters cause error", () => {
  assert.throws(() => {
    plainAmount("12a34", 2, "USDC");
  }, /Invalid input/);
});

test("Q1 double minus sign causes error", () => {
  assert.throws(() => {
    plainAmount("--123", 2, "USDC");
  }, /Invalid input/);
});

test("Q1 empty string causes error", () => {
  assert.throws(() => {
    plainAmount("", 2, "USDC");
  }, /Invalid input/);
});

test("Q1 negative decimals cause error", () => {
  assert.throws(() => {
    plainAmount("1234", -1, "USDC");
  }, /Invalid input/);
});

test("Q1 non-integer decimals cause error", () => {
  assert.throws(() => {
    // @ts-ignore - intentional misuse for test
    plainAmount("1234", 2.5, "USDC");
  }, /Invalid input/);
});

test("Q1 dash character in input causes error", () => {
  assert.throws(() => {
    // EN DASH character removed
    plainAmount("12\u20133", 2, "USDC");
  }, /Invalid input/);
});


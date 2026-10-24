/**
 * plainAmount formats an integer amount expressed in base units into a human-readable
 * string with Latin digits, thousands separators, and a decimal part.
 *
 * @param value   Integer amount as a string. May start with a minus sign and may use
 *                Arabic-Indic (U+0660-U+0669) or Extended Arabic-Indic (U+06F0-U+06F9)
 *                digits.
 * @param decimals Number of decimal places the asset uses (e.g. 6 for USDC).
 * @param symbol   Currency or token symbol to append.
 *
 * @returns Formatted string, e.g. "minus 1,234.50 USDC".
 *
 * @throws Error on any malformed input.
 */
export function plainAmount(
  value: string,
  decimals: number,
  symbol: string,
): string {
  // ----- basic type validation ------------------------------------------------
  if (
    typeof value !== "string" ||
    typeof symbol !== "string" ||
    typeof decimals !== "number" ||
    !Number.isInteger(decimals) ||
    decimals < 0
  ) {
    throw new Error("Invalid input");
  }

  // ----- reject dash characters (U+2013, U+2014) -------------------------------
  if (value.includes("\u2013") || value.includes("\u2014")) {
    throw new Error("Invalid input");
  }

  // ----- sign handling ---------------------------------------------------------
  let isNegative = false;
  let rest = value;
  if (rest.startsWith("-")) {
    isNegative = true;
    rest = rest.slice(1);
  }

  if (rest.length === 0) {
    throw new Error("Invalid input");
  }

  // ----- map Arabic-Indic digits to Latin digits -------------------------------
  const digitMap: Record<string, string> = {
    "\u0660": "0",
    "\u0661": "1",
    "\u0662": "2",
    "\u0663": "3",
    "\u0664": "4",
    "\u0665": "5",
    "\u0666": "6",
    "\u0667": "7",
    "\u0668": "8",
    "\u0669": "9",
    "\u06F0": "0",
    "\u06F1": "1",
    "\u06F2": "2",
    "\u06F3": "3",
    "\u06F4": "4",
    "\u06F5": "5",
    "\u06F6": "6",
    "\u06F7": "7",
    "\u06F8": "8",
    "\u06F9": "9",
  };

  let latinDigits = "";
  for (const ch of rest) {
    if (ch >= "0" && ch <= "9") {
      latinDigits += ch;
    } else if (digitMap[ch] !== undefined) {
      latinDigits += digitMap[ch];
    } else {
      throw new Error("Invalid input");
    }
  }

  // ----- strip leading zeros ---------------------------------------------------
  latinDigits = latinDigits.replace(/^0+/, "");
  if (latinDigits === "") {
    latinDigits = "0";
  }

  // ----- use BigInt for arbitrary size -----------------------------------------
  const amount = BigInt(latinDigits);
  const divisor = 10n ** BigInt(decimals);
  const integerPart = amount / divisor;
  const fractionPart = amount % divisor;

  // ----- format integer part with commas ---------------------------------------
  const intStr = integerPart.toString();
  const intWithCommas = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  // ----- format fractional part ------------------------------------------------
  // pad to the full decimals length, then trim trailing zeros but keep at least 2
  let fracStr = fractionPart.toString().padStart(decimals, "0");
  while (fracStr.length > 2 && fracStr.endsWith("0")) {
    fracStr = fracStr.slice(0, -1);
  }

  // ----- assemble final string -------------------------------------------------
  const formatted = `${intWithCommas}.${fracStr} ${symbol}`;
  if (isNegative && amount !== 0n) {
    return `minus ${formatted}`;
  }
  return formatted;
}


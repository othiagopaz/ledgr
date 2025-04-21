/**
 * Formats an account type string for display.
 * @param type - The raw account type (e.g., 'CHECKING').
 * @returns A user-friendly string (e.g., 'Conta Corrente').
 */
export function formatAccountType(type: string): string {
  switch (type?.toUpperCase()) {
    case "CHECKING":
      return "Conta Corrente";
    case "SAVINGS":
      return "Poupança";
    // Add other account types as needed
    default:
      return type || "Conta"; // Fallback
  }
}

/**
 * Formats a credit card flag string for display.
 * @param flag - The raw card flag (e.g., 'MASTERCARD').
 * @returns A user-friendly string (e.g., 'Mastercard').
 */
export function formatCardFlag(flag: string): string {
  if (!flag) return "Cartão"; // Fallback if flag is empty
  // Capitalize first letter, lowercase rest
  return flag.charAt(0).toUpperCase() + flag.slice(1).toLowerCase();
}

/**
 * Formats a BRL currency string or number into cents (integer).
 * Handles comma as decimal separator.
 * @param value - The currency value (e.g., "1.234,56" or 1234.56).
 * @returns The value in cents (e.g., 123456).
 */
export function formatCurrencyToCents(
  value: number | string | undefined | null
): number {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  let numericValue: number;

  if (typeof value === "string") {
    // Remove thousands separators (.) and replace comma decimal separator (,) with a dot (.)
    // Ensure regex handles potential whitespace and only replaces the decimal comma
    const cleanedString = value.replace(/\./g, "").replace(/\,/g, ".").trim();
    numericValue = parseFloat(cleanedString);
    if (isNaN(numericValue)) {
      console.warn(`Could not parse currency string: "${value}"`);
      return 0; // Return 0 if parsing fails
    }
  } else if (typeof value === "number") {
    numericValue = value;
  } else {
    console.warn(`Invalid input type for currency formatting: ${typeof value}`);
    return 0; // Return 0 for invalid types
  }

  // Multiply by 100 and round to handle potential floating point issues
  return Math.round(numericValue * 100);
}

// Add other general formatting functions here as needed
// export function formatCurrency(...) {...}
// export function formatDate(...) {...}

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

// Add other general formatting functions here as needed
// export function formatCurrency(...) {...}
// export function formatDate(...) {...}

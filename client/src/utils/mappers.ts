import {
  Account,
  CreditCard,
  FinancialInstrument,
  Category,
} from "@/services/api";
import { formatAccountType, formatCardFlag } from "./formatters";

// --- Interfaces for Select Component Structure ---

/** Represents a single selectable item in the category dropdown. */
export interface CategorySelectItem {
  id: string;
  name: string;
  isGroup: false; // Type discriminator
}

/** Represents a group of selectable items with a label. */
export interface CategoryGroup {
  label: string;
  options: CategorySelectItem[];
  isGroup: true; // Type discriminator
}

/** Type alias for the items rendered in the category select. */
export type CategorySelectOption = CategoryGroup | CategorySelectItem;

/**
 * Maps an Account object to a FinancialInstrument object.
 * @param account - The raw Account data.
 * @returns A FinancialInstrument object ready for UI display.
 */
export function mapAccountToFinancialInstrument(
  account: Account
): FinancialInstrument {
  return {
    id: account.id,
    name: account.name,
    kind: "ACCOUNT",
    displayDetail: formatAccountType(account.type),
  };
}

/**
 * Maps a CreditCard object to a FinancialInstrument object.
 * @param card - The raw CreditCard data.
 * @returns A FinancialInstrument object ready for UI display.
 */
export function mapCreditCardToFinancialInstrument(
  card: CreditCard
): FinancialInstrument {
  return {
    id: card.id,
    name: card.name,
    kind: "CREDIT_CARD",
    displayDetail: formatCardFlag(card.flag),
  };
}

// --- Category Mapper ---

/**
 * Maps an array of Category objects from the API into an array of groups
 * suitable for a Select component.
 * - Only categories with subcategories become non-selectable groups.
 * - Subcategories become selectable items within their group.
 * - Top-level categories without subcategories are ignored.
 * @param categories - The raw Category array from the API.
 * @returns An array of CategoryGroup objects.
 */
export function mapCategoriesToSelectOptions(
  categories: Category[]
): CategoryGroup[] {
  const options: CategoryGroup[] = [];

  categories.forEach((category) => {
    // ONLY create a Group if it has subcategories
    if (category.subcategories && category.subcategories.length > 0) {
      options.push({
        label: category.name,
        isGroup: true, // Technically redundant if the return type is CategoryGroup[] but kept for clarity
        options: category.subcategories.map((sub) => ({
          id: sub.id,
          name: sub.name,
          isGroup: false, // Items are never groups
        })),
      });
    }
    // Ignore categories without subcategories
  });

  return options;
}

// Add other mapping functions as needed

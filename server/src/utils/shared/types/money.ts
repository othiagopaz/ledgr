export class Money {
  readonly value: number;

  /**
   * Creates a Money instance from cents (integers).
   * This is the default constructor - use this when working with integer cents.
   * For decimal values, use Money.fromDecimal()
   */
  constructor(value: number) {
    this.value = value;
  }

  add(other: Money): Money {
    return new Money(this.value + other.value);
  }

  subtract(other: Money): Money {
    return new Money(this.value - other.value);
  }

  equals(other: Money): boolean {
    return this.value === other.value;
  }

  toDecimal(): number {
    return this.value / 100;
  }

  toCents(): number {
    return this.value;
  }

  /**
   * Creates a Money instance from cents (integers).
   * This is an alias for the constructor for better readability.
   */
  static fromCents(cents: number): Money {
    return new Money(cents);
  }

  /**
   * Creates a Money instance from a decimal value.
   * Use this when you have a decimal value (e.g., 10.50).
   */
  static fromDecimal(decimal: number): Money {
    return new Money(Math.round(decimal * 100));
  }

  static zero(): Money {
    return new Money(0);
  }

  isNegative(): boolean {
    return this.value < 0;
  }

  isPositive(): boolean {
    return this.value > 0;
  }

  isZero(): boolean {
    return this.value === 0;
  }

  toString(): string {
    return (this.value / 100).toFixed(2);
  }
}

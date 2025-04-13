export class Money {
  private readonly cents: number;
  value: number;

  /**
   * Creates a Money instance from cents (integers).
   * This is the default constructor - use this when working with integer cents.
   * For decimal values, use Money.fromDecimal()
   */
  constructor(cents: number) {
    this.cents = cents;
    this.value = cents;
  }

  add(other: Money): Money {
    return new Money(this.cents + other.cents);
  }

  subtract(other: Money): Money {
    return new Money(this.cents - other.cents);
  }

  equals(other: Money): boolean {
    return this.cents === other.cents;
  }

  toDecimal(): number {
    return this.cents / 100;
  }

  toCents(): number {
    return this.cents;
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
    return this.cents < 0;
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  isZero(): boolean {
    return this.cents === 0;
  }

  toString(): string {
    return (this.cents / 100).toFixed(2);
  }
}

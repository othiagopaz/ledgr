export class Money {
  private readonly cents: number;

  constructor(amount: number) {
    // Convert from decimal to cents and round to avoid floating-point issues
    this.cents = Math.round(amount * 100);
  }

  add(other: Money): Money {
    return new Money((this.cents + other.cents) / 100);
  }

  subtract(other: Money): Money {
    return new Money((this.cents - other.cents) / 100);
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

  static fromCents(cents: number): Money {
    return new Money(cents / 100);
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
    return this.toDecimal().toFixed(2);
  }
}

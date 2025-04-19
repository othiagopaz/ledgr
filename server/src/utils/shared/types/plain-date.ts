/* eslint-disable @typescript-eslint/restrict-template-expressions */
export class PlainDate {
  private readonly value: string; // format: 'YYYY-MM-DD'

  private constructor(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error(`Invalid PlainDate format: ${value}`);
    }
    this.value = value;
  }

  static fromString(value: string): PlainDate {
    // Se já for no formato ideal, só retorna
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return new PlainDate(value);
    }

    // Se for string ISO ou Date.toString(), tenta converter
    const parsed = new Date(value);
    if (isNaN(parsed.getTime())) {
      throw new Error(`Invalid date string for PlainDate: ${value}`);
    }

    return PlainDate.fromDate(parsed);
  }

  static fromDate(date: Date): PlainDate {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      throw new Error(`Invalid Date passed to PlainDate.fromDate(): ${date}`);
    }

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return new PlainDate(`${yyyy}-${mm}-${dd}`);
  }
  static today(): PlainDate {
    return PlainDate.fromDate(new Date());
  }

  static parse(input: string | Date): PlainDate {
    if (typeof input === 'string') {
      // formato direto 'YYYY-MM-DD'
      if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        return new PlainDate(input);
      }

      // formato ISO ou Date.toISOString()
      if (/^\d{4}-\d{2}-\d{2}T/.test(input)) {
        return new PlainDate(input.substring(0, 10));
      }

      // tenta converter via Date apenas como fallback
      const parsed = new Date(input);
      if (!isNaN(parsed.getTime())) {
        return PlainDate.fromDate(parsed);
      }

      throw new Error(`Invalid string for PlainDate: ${input}`);
    }

    if (input instanceof Date && !isNaN(input.getTime())) {
      return PlainDate.fromDate(input);
    }

    throw new Error(`Invalid input for PlainDate: ${input}`);
  }

  toDate(): Date {
    const [y, m, d] = this.value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  toString(): string {
    return this.value;
  }

  equals(other: PlainDate): boolean {
    return this.value === other.value;
  }

  static fromComponents(year: number, month: number, day: number): PlainDate {
    return PlainDate.fromDate(new Date(year, month - 1, day));
  }
}

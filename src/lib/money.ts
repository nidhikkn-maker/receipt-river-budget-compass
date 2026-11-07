import Decimal from "decimal.js";

// Clone rather than changing another package's global Decimal configuration.
export const FinancialDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type MoneyInput = number | string;

export function decimal(value: MoneyInput) {
  const result = new FinancialDecimal(value);
  if (!result.isFinite()) throw new Error("Financial amount must be finite");
  return result;
}

/** Only cross back into the existing numeric record format at the money boundary. */
export function moneyNumber(value: Decimal): number {
  const rounded = value.toDecimalPlaces(2);
  if (!rounded.isFinite() || rounded.abs().mul(100).gt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Financial amount exceeds the supported precision");
  }
  return rounded.toNumber();
}
export const roundMoney = (value: MoneyInput) => moneyNumber(decimal(value));
export const addMoney = (...values: MoneyInput[]) => moneyNumber(values.reduce<Decimal>((sum, value) => sum.plus(decimal(value)), decimal(0)));
export const subtractMoney = (a: MoneyInput, b: MoneyInput) => moneyNumber(decimal(a).minus(decimal(b)));
export const multiplyMoney = (a: MoneyInput, b: MoneyInput) => moneyNumber(decimal(a).mul(decimal(b)));
export const proportionMoney = (amount: MoneyInput, numerator: MoneyInput, denominator: MoneyInput) => {
  const divisor = decimal(denominator);
  if (divisor.isZero()) throw new Error("Financial allocation divisor cannot be zero");
  return moneyNumber(decimal(amount).mul(decimal(numerator)).div(divisor));
};
export const sumMoney = (values: MoneyInput[]) => addMoney(...values);
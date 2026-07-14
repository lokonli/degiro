export type Transaction = {
  orderId: string;
  date: string;
  time: string;
  product: string;
  isin: string;
  quantity: number;
  price: number;
  localCurrency: string;
  localValue: number;
  valueEUR: number;
  fees: number;
  totalEUR: number;
};

export type Dividend = {
  id: string; // DEGIRO cash-movement id of the gross "Dividend" entry — stable identity
  date: string; // YYYY-MM-DD, Amsterdam local (from the movement's value date)
  isin: string;
  product: string;
  grossEUR: number;
  taxEUR: number; // withholding tax, positive = amount withheld
  netEUR: number; // grossEUR - taxEUR, what actually hit cash
};

export type Instrument = {
  name: string;
  ticker: string;
  currency: string; // ISO code as quoted by the price feed, e.g. "EUR", "USD", "GBP"
  priceScale?: number; // multiply raw ticker price by this to reach `currency` units (handles GBp pence quotes)
  degiroId?: string; // DEGIRO's internal product id, for pricing live via the DEGIRO connector instead of Yahoo
};

export type InstrumentMap = Record<string, Instrument>;

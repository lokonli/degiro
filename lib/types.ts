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

export type Instrument = {
  name: string;
  ticker: string;
  currency: string; // ISO code as quoted by the price feed, e.g. "EUR", "USD", "GBP"
  priceScale?: number; // multiply raw ticker price by this to reach `currency` units (handles GBp pence quotes)
};

export type InstrumentMap = Record<string, Instrument>;

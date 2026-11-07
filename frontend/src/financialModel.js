export const DEFAULT_SCENARIOS = {
  conservative: { churnPct: 12, grossMarginPct: 70, cacInr: 24000, monthlyGrossAdditions: null },
  base: { churnPct: 8, grossMarginPct: 78, cacInr: 18000, monthlyGrossAdditions: null },
  optimistic: { churnPct: 5, grossMarginPct: 82, cacInr: 14000, monthlyGrossAdditions: null },
};

export function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function validateInputs(inputs) {
  const errors = {};
  const positive = ['arrInr', 'customers', 'cacInr'];
  for (const key of positive) {
    const value = finiteNumber(inputs[key]);
    if (value === null || value < 0 || (key === 'customers' && (value === 0 || !Number.isInteger(value)))) errors[key] = key === 'customers' ? 'Enter a whole customer count greater than zero.' : 'Enter a non-negative number.';
  }
  for (const key of ['churnPct', 'grossMarginPct']) {
    const value = finiteNumber(inputs[key]);
    if (value === null || value < 0 || value > 100) errors[key] = 'Enter a percentage from 0 to 100.';
  }
  const additions = finiteNumber(inputs.monthlyGrossAdditions);
  if (additions !== null && (additions < 0 || !Number.isInteger(additions))) errors.monthlyGrossAdditions = 'Enter a whole number of monthly additions.';
  return errors;
}

export function calculateUnitEconomics(inputs) {
  const arr = finiteNumber(inputs.arrInr);
  const customers = finiteNumber(inputs.customers);
  const churnPct = finiteNumber(inputs.churnPct);
  const marginPct = finiteNumber(inputs.grossMarginPct);
  const cac = finiteNumber(inputs.cacInr);
  const validBase = arr !== null && arr >= 0 && customers !== null && customers > 0;
  const monthlyRevenuePerCustomer = validBase ? arr / customers / 12 : null;
  const monthlyGrossProfitPerCustomer = monthlyRevenuePerCustomer !== null && marginPct !== null && marginPct >= 0 && marginPct <= 100 ? monthlyRevenuePerCustomer * marginPct / 100 : null;
  const ltvProxy = monthlyGrossProfitPerCustomer === null || churnPct === null || churnPct < 0 || churnPct > 100 || churnPct === 0
    ? null : monthlyGrossProfitPerCustomer / (churnPct / 100);
  const ltvCac = ltvProxy === null || cac === null || cac <= 0 ? null : ltvProxy / cac;
  const cacPaybackMonths = monthlyGrossProfitPerCustomer === null || monthlyGrossProfitPerCustomer <= 0 || cac === null || cac < 0 ? null : cac / monthlyGrossProfitPerCustomer;
  return { monthlyRevenuePerCustomer, monthlyGrossProfitPerCustomer, ltvProxy, ltvCac, cacPaybackMonths };
}

export function retentionAfterMonths(churnPct, months) {
  const churn = finiteNumber(churnPct);
  const n = finiteNumber(months);
  if (churn === null || churn < 0 || churn > 100 || n === null || n < 0) return null;
  return (1 - churn / 100) ** n;
}

export function projectCustomers(startingCustomers, churnPct, monthlyGrossAdditions, months = 36) {
  const start = finiteNumber(startingCustomers);
  const churn = finiteNumber(churnPct);
  const additions = finiteNumber(monthlyGrossAdditions);
  const duration = finiteNumber(months);
  if (start === null || start < 0 || churn === null || churn < 0 || churn > 100 || additions === null || additions < 0 || duration === null || duration < 0) return [];
  const rows = [];
  let customers = start;
  for (let month = 1; month <= Math.floor(duration); month += 1) {
    const churned = customers * churn / 100;
    const ending = customers - churned + additions;
    rows.push({ month, startingCustomers: customers, churnedCustomers: churned, grossAdditions: additions, endingCustomers: ending });
    customers = ending;
  }
  return rows;
}

export function formatInr(value, options = {}) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: options.decimals ?? 0, notation: options.compact ? 'compact' : 'standard' }).format(value);
}




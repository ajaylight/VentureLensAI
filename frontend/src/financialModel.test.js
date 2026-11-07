import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateUnitEconomics, finiteNumber, formatInr, projectCustomers, retentionAfterMonths, validateInputs } from './financialModel.js';

const inputs = { arrInr: 12000000, customers: 250, churnPct: 8, grossMarginPct: 78, cacInr: 18000, monthlyGrossAdditions: 20 };

test('calculates monthly revenue per customer', () => assert.equal(calculateUnitEconomics(inputs).monthlyRevenuePerCustomer, 4000));
test('calculates monthly gross profit per customer', () => assert.equal(calculateUnitEconomics(inputs).monthlyGrossProfitPerCustomer, 3120));
test('calculates gross-profit LTV proxy from monthly churn', () => assert.equal(calculateUnitEconomics(inputs).ltvProxy, 39000));
test('calculates LTV:CAC', () => assert.equal(calculateUnitEconomics(inputs).ltvCac, 39000 / 18000));
test('calculates CAC payback in months', () => assert.equal(calculateUnitEconomics(inputs).cacPaybackMonths, 18000 / 3120));
test('calculates retention after n months', () => assert.equal(retentionAfterMonths(8, 12), 0.92 ** 12));
test('zero churn returns full retention and an undefined infinite LTV proxy', () => {
  assert.equal(retentionAfterMonths(0, 36), 1);
  assert.equal(calculateUnitEconomics({ ...inputs, churnPct: 0 }).ltvProxy, null);
});
test('projection reports starting, churned, added, and ending customers each month', () => {
  const [one, two] = projectCustomers(250, 8, 20, 2);
  assert.deepEqual(one, { month: 1, startingCustomers: 250, churnedCustomers: 20, grossAdditions: 20, endingCustomers: 250 });
  assert.deepEqual(two, { month: 2, startingCustomers: 250, churnedCustomers: 20, grossAdditions: 20, endingCustomers: 250 });
});
test('projection with no acquisitions makes churn impact explicit', () => assert.equal(projectCustomers(100, 10, 0, 1)[0].endingCustomers, 90));
test('invalid inputs are identified and safely yield unavailable calculations', () => {
  assert.ok(validateInputs({ ...inputs, customers: 0 }).customers);
  assert.ok(validateInputs({ ...inputs, churnPct: 101 }).churnPct);
  assert.equal(calculateUnitEconomics({ ...inputs, customers: 0 }).monthlyRevenuePerCustomer, null);
  assert.deepEqual(projectCustomers(250, 101, 20, 36), []);
});
test('blank and non-finite values do not coerce to plausible numbers', () => {
  assert.equal(finiteNumber(''), null);
  assert.equal(finiteNumber('abc'), null);
  assert.equal(formatInr(null), '—');
});
test('zero gross margin yields zero gross profit and unavailable payback', () => {
  const result = calculateUnitEconomics({ ...inputs, grossMarginPct: 0 });
  assert.equal(result.monthlyGrossProfitPerCustomer, 0);
  assert.equal(result.ltvProxy, 0);
  assert.equal(result.cacPaybackMonths, null);
});
test('100% churn ends retention while 0 months preserves all logos', () => {
  assert.equal(retentionAfterMonths(100, 1), 0);
  assert.equal(retentionAfterMonths(8, 0), 1);
});
test('zero CAC avoids an undefined ratio while zero CAC payback remains zero', () => {
  const result = calculateUnitEconomics({ ...inputs, cacInr: 0 });
  assert.equal(result.ltvCac, null);
  assert.equal(result.cacPaybackMonths, 0);
});
test('fractional customer and gross-addition counts are rejected', () => {
  assert.ok(validateInputs({ ...inputs, customers: 12.5 }).customers);
  assert.ok(validateInputs({ ...inputs, monthlyGrossAdditions: 2.5 }).monthlyGrossAdditions);
});
test('unknown gross additions are valid but do not produce a projection', () => {
  assert.deepEqual(validateInputs({ ...inputs, monthlyGrossAdditions: null }), {});
  assert.deepEqual(projectCustomers(250, 8, null, 36), []);
});

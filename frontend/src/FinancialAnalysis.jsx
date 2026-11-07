import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Gauge, RotateCcw, ShieldAlert, TrendingUp } from 'lucide-react';
import { DEFAULT_SCENARIOS, calculateUnitEconomics, formatInr, projectCustomers, retentionAfterMonths, validateInputs } from './financialModel.js';

const SCENARIOS = [
  { key: 'conservative', label: 'Conservative', color: '#e6b46e' },
  { key: 'base', label: 'Base Case', color: '#a99aff' },
  { key: 'optimistic', label: 'Optimistic', color: '#77d5a6' },
];
const inputSpecs = [
  { key: 'arrInr', label: 'Annual recurring revenue (ARR)', type: 'number', min: 0, step: 10000, suffix: '₹ INR' },
  { key: 'customers', label: 'Paying customers', type: 'number', min: 1, step: 1, suffix: 'logos' },
  { key: 'churnPct', label: 'Monthly logo churn', type: 'number', min: 0, max: 100, step: 0.1, suffix: '%', scenario: true },
  { key: 'grossMarginPct', label: 'Gross margin', type: 'number', min: 0, max: 100, step: 0.1, suffix: '%', scenario: true },
  { key: 'cacInr', label: 'Customer acquisition cost (CAC)', type: 'number', min: 0, step: 100, suffix: '₹ INR', scenario: true },
];
const normalizeOriginal = (metrics = {}) => ({
  arrInr: metrics.arr_inr ?? '',
  customers: metrics.paying_businesses ?? '',
  churnPct: metrics.monthly_logo_churn_pct ?? '',
  grossMarginPct: metrics.gross_margin_pct ?? '',
  cacInr: metrics.cac_inr ?? '',
});

function EvidenceTag({ children, tone = '' }) { return <span className={`evidence-tag ${tone}`}>{children}</span>; }
function ScenarioChart({ data }) {
  if (!data.length) return <div className="scenario-chart-empty">Add a monthly gross additions assumption to calculate the 36-month projection. Acquisition capacity is <b>Unknown</b> until you enter it.</div>;
  const width = 760; const height = 246; const left = 48; const right = 14; const top = 14; const bottom = 28;
  const max = Math.max(1, ...data.flatMap((d) => [d.startingCustomers, d.endingCustomers]));
  const x = (i) => left + (width - left - right) * i / (data.length - 1);
  const y = (v) => top + (height - top - bottom) * (1 - v / max);
  const series = [
    ['Starting customers', (d) => d.startingCustomers, '#9ba7b6'],
    ['Churned customers', (d) => d.churnedCustomers, '#ec9a82'],
    ['Gross additions', (d) => d.grossAdditions, '#75cde0'],
    ['Ending customers', (d) => d.endingCustomers, '#a99aff'],
  ];
  return <div className="projection-chart-wrap"><svg className="projection-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="36-month customer projection showing starting customers, churned customers, gross additions and ending customers">
    {[0, .25, .5, .75, 1].map((fraction) => { const value = Math.round(max * fraction); const yy = y(value); return <g key={fraction}><line x1={left} x2={width - right} y1={yy} y2={yy} className="chart-gridline" /><text x={left - 8} y={yy + 3} textAnchor="end" className="chart-axis-label">{value}</text></g>; })}
    {series.map(([label, value, color]) => <polyline key={label} fill="none" stroke={color} strokeWidth={label === 'Ending customers' ? 2.5 : 1.7} strokeDasharray={label === 'Starting customers' ? '5 4' : undefined} points={data.map((d, i) => `${x(i)},${y(value(d))}`).join(' ')} />)}
    <text x={left} y={height - 5} className="chart-axis-label">Month 1</text><text x={width - right} y={height - 5} textAnchor="end" className="chart-axis-label">Month 36</text>
  </svg><div className="chart-legend">{series.map(([label, , color]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div></div>;
}
function ChurnSensitivity({ scenarios }) {
  return <div className="sensitivity-list">{SCENARIOS.map((scenario) => {
    const churn = Number(scenarios[scenario.key].churnPct);
    const retained = retentionAfterMonths(churn, 12);
    return <div className="sensitivity-row" key={scenario.key}><div className="sensitivity-title"><span><i style={{ background: scenario.color }} />{scenario.label}</span><b>{Number.isFinite(churn) ? `${churn}% monthly churn` : 'Invalid churn'}</b></div><div className="sensitivity-track"><i style={{ width: `${(retained ?? 0) * 100}%`, background: scenario.color }} /></div><div className="sensitivity-caption"><span>12-month logo retention</span><b>{retained === null ? '—' : `${(retained * 100).toFixed(1)}%`}</b></div></div>;
  })}</div>;
}

export default function FinancialAnalysis({ selected }) {
  const founderMetrics = selected?.founder_metrics || {};
  const [original, setOriginal] = useState(() => normalizeOriginal(founderMetrics));
  const [core, setCore] = useState(() => ({ arrInr: founderMetrics.arr_inr ?? '', customers: founderMetrics.paying_businesses ?? '' }));
  const [scenarios, setScenarios] = useState(() => Object.fromEntries(Object.entries(DEFAULT_SCENARIOS).map(([key, value]) => [key, { ...value }])));
  const [scenarioKey, setScenarioKey] = useState('base');
  const [months, setMonths] = useState(12);

  useEffect(() => {
    const nextOriginal = normalizeOriginal(selected?.founder_metrics || {});
    setOriginal(nextOriginal);
    setCore({ arrInr: nextOriginal.arrInr, customers: nextOriginal.customers });
    setScenarios(Object.fromEntries(Object.entries(DEFAULT_SCENARIOS).map(([key, value]) => [key, { ...value }])));
    setScenarioKey('base');
  }, [selected?.id]);

  const activeScenario = scenarios[scenarioKey];
  const values = { ...core, ...activeScenario };
  const errors = validateInputs(values);
  const economics = calculateUnitEconomics(values);
  const projection = useMemo(() => errors.customers || errors.churnPct || errors.monthlyGrossAdditions ? [] : projectCustomers(Number(core.customers), Number(activeScenario.churnPct), Number(activeScenario.monthlyGrossAdditions), 36), [core.customers, activeScenario, errors.customers, errors.churnPct, errors.monthlyGrossAdditions]);
  const retained = retentionAfterMonths(activeScenario.churnPct, months);
  const updateCore = (key, value) => setCore((current) => ({ ...current, [key]: value }));
  const updateScenario = (key, value) => setScenarios((current) => ({ ...current, [scenarioKey]: { ...current[scenarioKey], [key]: value } }));
  const reset = () => {
    setCore({ arrInr: original.arrInr, customers: original.customers });
    setScenarios(Object.fromEntries(Object.entries(DEFAULT_SCENARIOS).map(([key, value]) => [key, { ...value }])));
    setScenarioKey('base');
  };
  const activeName = SCENARIOS.find((item) => item.key === scenarioKey).label;
  const mainSpecs = inputSpecs.filter((field) => !field.scenario);
  const scenarioSpecs = inputSpecs.filter((field) => field.scenario);
  const inputField = (field, value, onChange, error, evidence) => { const tone = evidence === 'Founder-provided' ? 'founder' : evidence === 'Unknown' ? 'unknown' : 'estimate'; return <label className="scenario-input" key={field.key}>
    <span>{field.label}<EvidenceTag tone={tone}>{evidence}</EvidenceTag></span>
    <div className="scenario-input-control"><input aria-label={field.label} type="number" min={field.min} max={field.max} step={field.step} value={value ?? ''} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={!!error} /><small>{field.suffix}</small></div>
    {error && <em>{error}</em>}
  </label>; };

  return <div className="page-content financial-analysis-page">
    <div className="page-intro"><div><div className="eyebrow">INTELLIGENCE / FINANCIALS</div><h1>Financial analysis<span className="period">.</span></h1><p>Explore editable unit economics and customer retention assumptions.</p></div><button className="secondary-btn" onClick={reset}><RotateCcw size={14} /> Reset to original values</button></div>
    <div className="financial-warning"><ShieldAlert size={16} /><div><b>Founder inputs and scenarios are kept separate.</b><span>Founder-provided figures are unverified. Scenario assumptions are illustrative estimates, not verified founder data, forecasts or investment advice.</span></div></div>
    <div className="evidence-legend"><b>Evidence labels</b><EvidenceTag tone="founder">Founder-provided</EvidenceTag><EvidenceTag tone="source">Independently sourced</EvidenceTag><EvidenceTag tone="estimate">Estimate</EvidenceTag><EvidenceTag tone="unknown">Unknown</EvidenceTag><span>No independent company-level financial data is connected to this model.</span></div>
    <section className="panel scenario-assumptions"><div className="panel-heading"><div><h3>Scenario engine</h3><p>Original founder figures remain unchanged while you experiment.</p></div><Gauge size={18} className="heading-accent" /></div>
      <div className="scenario-tabs" role="tablist" aria-label="Financial scenarios">{SCENARIOS.map((item) => <button role="tab" aria-selected={scenarioKey === item.key} className={scenarioKey === item.key ? 'active' : ''} key={item.key} onClick={() => setScenarioKey(item.key)}>{item.label}<EvidenceTag tone="estimate">Illustrative estimate</EvidenceTag></button>)}</div>
      <div className="scenario-assumption-note"><AlertCircle size={14} /> {activeName} assumptions are estimates for exploration and must not be represented as founder-provided or verified data.</div>
      <div className="scenario-form-grid">{mainSpecs.map((field) => { const value = core[field.key]; const baseline = original[field.key]; const evidence = value === '' ? 'Unknown' : String(value) === String(baseline) ? 'Founder-provided' : 'Estimate'; return inputField(field, value, (key, next) => updateCore(key, next), errors[field.key], evidence); })}{scenarioSpecs.map((field) => inputField(field, activeScenario[field.key], updateScenario, errors[field.key], 'Estimate'))}{inputField({ key: 'monthlyGrossAdditions', label: 'Monthly gross additions', type: 'number', min: 0, step: 1, suffix: 'new logos', scenario: true }, activeScenario.monthlyGrossAdditions, updateScenario, errors.monthlyGrossAdditions, activeScenario.monthlyGrossAdditions === null || activeScenario.monthlyGrossAdditions === '' ? 'Unknown' : 'Estimate')}</div>
      <div className="founder-originals"><b>Original founder-provided values</b><span>ARR: {original.arrInr === '' ? 'Unknown' : formatInr(Number(original.arrInr))} · Customers: {original.customers || 'Unknown'} · Churn: {original.churnPct === '' ? 'Unknown' : `${original.churnPct}%`} · Margin: {original.grossMarginPct === '' ? 'Unknown' : `${original.grossMarginPct}%`} · CAC: {original.cacInr === '' ? 'Unknown' : formatInr(Number(original.cacInr))}</span></div>
    </section>

    <div className="financial-grid scenario-metrics">
      <div className="financial-card"><span>MONTHLY REVENUE / CUSTOMER</span><b>{formatInr(economics.monthlyRevenuePerCustomer)}</b><small>ARR ÷ customers ÷ 12 · Estimate from selected inputs</small></div>
      <div className="financial-card"><span>MONTHLY GROSS PROFIT / CUSTOMER</span><b>{formatInr(economics.monthlyGrossProfitPerCustomer)}</b><small>Revenue per customer × gross margin</small></div>
      <div className="financial-card"><span>SIMPLE GROSS-PROFIT LTV PROXY</span><b>{formatInr(economics.ltvProxy)}</b><small>{Number(activeScenario.churnPct) === 0 ? 'Undefined at zero churn' : 'Monthly gross profit ÷ monthly churn'}</small></div>
      <div className="financial-card"><span>LTV:CAC · CAC PAYBACK</span><b>{economics.ltvCac === null ? '—' : `${economics.ltvCac.toFixed(2)}×`}</b><small>{economics.cacPaybackMonths === null ? 'Payback unavailable' : `${economics.cacPaybackMonths.toFixed(1)} months CAC payback`}</small></div>
    </div>
    {Object.keys(errors).length > 0 && <div className="scenario-validation" role="status"><AlertCircle size={14} /> Some results are unavailable until invalid or missing inputs are corrected. Zero churn is valid; the LTV proxy is undefined at zero churn.</div>}
    <div className="financial-main-grid scenario-lower-grid">
      <section className="panel projection-panel"><div className="panel-heading"><div><h3>36-month customer projection</h3><p>Starting customers − churned customers + gross additions = ending customers</p></div><TrendingUp size={18} className="heading-accent" /></div><ScenarioChart data={projection} />{projection.length > 0 && <div className="projection-table-wrap"><table className="projection-table"><thead><tr><th>Month</th><th>Starting</th><th>Churned</th><th>Gross additions</th><th>Ending</th></tr></thead><tbody>{projection.filter((row) => [1, 3, 6, 12, 24, 36].includes(row.month)).map((row) => <tr key={row.month}><td>{row.month}</td><td>{row.startingCustomers.toFixed(0)}</td><td>{row.churnedCustomers.toFixed(1)}</td><td>{row.grossAdditions.toFixed(0)}</td><td>{row.endingCustomers.toFixed(1)}</td></tr>)}</tbody></table></div>}</section>
      <section className="panel retention-panel"><div className="panel-heading"><div><h3>Churn sensitivity</h3><p>Compare 12-month retention across editable scenarios</p></div><TrendingUp size={18} className="heading-accent" /></div><ChurnSensitivity scenarios={scenarios} /><div className="retention-horizon"><label htmlFor="retention-months">Selected {activeName} retention after</label><select id="retention-months" value={months} onChange={(event) => setMonths(Number(event.target.value))}><option value={6}>6 months</option><option value={12}>12 months</option><option value={24}>24 months</option><option value={36}>36 months</option></select><b>{retained === null ? '—' : `${(retained * 100).toFixed(1)}%`}</b></div><div className="formula-note">Retention after n months = (1 − monthly churn)<sup>n</sup>. LTV uses logo churn as a simplified proxy and is not validated lifetime value.</div></section>
    </div>
    <div className="footnote"><ShieldAlert size={14} /> Independently sourced: none. Customer acquisition capacity is Unknown until monthly gross additions are explicitly entered.</div>
  </div>;
}





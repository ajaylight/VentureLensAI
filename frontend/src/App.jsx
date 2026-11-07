import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import FinancialAnalysis from './FinancialAnalysis.jsx';
import {
  Activity, AlertCircle, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight,
  BadgeCheck, BarChart3, Bell, BookOpen, BriefcaseBusiness, Building2,
  Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3,
  CloudUpload, Copy, Download, ExternalLink, FileCheck2, FileText, Filter,
  FolderOpen, Gauge, LayoutDashboard, Link2, LoaderCircle, LogOut,
  MessageSquare, MoreHorizontal, Plus, Printer, RefreshCw, Search, Send, Settings,
  ShieldAlert, ShieldCheck, Sparkles, TrendingUp, Upload, Users, Wallet,
  X, Zap,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, options);
  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try { const body = await response.json(); detail = body.detail || detail; } catch { /* keep default */ }
    throw new Error(detail);
  }
  const type = response.headers.get('content-type') || '';
  return type.includes('text/plain') ? response.text() : response.json();
}

const money = (value, compact = false) => {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('en-IN', compact
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { maximumFractionDigits: 0 }).format(value);
};
const initials = (name = '') => name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function memoSection(markdown, title) {
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)];
  const index = headings.findIndex((heading) => heading[1].trim().toLowerCase() === title.toLowerCase());
  if (index < 0) return '';
  const start = headings[index].index + headings[index][0].length;
  const end = headings[index + 1]?.index ?? markdown.length;
  return markdown.slice(start, end).trim();
}

function numberedLines(section) {
  return section.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*\d+\.\s+(.+)$/);
    if (!match) return [];
    const text = match[1].replace(/\*\*/g, '').trim();
    const severityMatch = text.match(/^(.+?)\s+[—–-]\s+(High|Medium(?:-high)?|Low)\.?(?:\s|$)/i);
    return [{ text: severityMatch ? severityMatch[1].trim() : text, severity: severityMatch?.[2] || '' }];
  });
}

function summarizeMemo(markdown, evaluation) {
  if (!markdown) return null;
  const recommendationSection = memoSection(markdown, 'Preliminary investment recommendation and reasoning');
  const recommendation = recommendationSection.match(/\*\*Recommendation:\s*([^*]+)\*\*/i)?.[1]?.trim() || '';
  const recParagraphs = recommendationSection.replace(/\*\*Recommendation:[^*]+\*\*/i, '').trim().split(/\n\s*\n/).filter(Boolean);
  const riskSection = memoSection(markdown, 'Major investment risks');
  const questionSection = memoSection(markdown, 'Unresolved diligence questions');
  const metrics = evaluation?.founder_metrics || {};
  const arr = Number(metrics.arr_inr);
  const customers = Number(metrics.paying_businesses);
  const churn = Number(metrics.monthly_logo_churn_pct);
  const margin = Number(metrics.gross_margin_pct);
  const cac = Number(metrics.cac_inr);
  const mrr = arr > 0 && customers > 0 ? arr / customers / 12 : null;
  const monthlyGrossProfit = mrr !== null && margin >= 0 ? mrr * margin / 100 : null;
  const ltv = monthlyGrossProfit !== null && churn > 0 ? monthlyGrossProfit / (churn / 100) : null;
  return {
    recommendation: /defer/i.test(recommendation) ? 'DEFER APPROVAL' : recommendation || 'Unknown',
    rationale: 'Further diligence is required before making an investment decision.',
    rationaleFromMemo: recParagraphs.slice(0, 2).join(' ').replace(/\s+/g, ' '),
    risks: numberedLines(riskSection).slice(0, 4),
    questions: numberedLines(questionSection).slice(0, 4),
    financials: [
      arr > 0 ? { label: 'ARR', value: `₹${money(arr / 10000000, true)} Cr`, evidence: 'Founder claim' } : null,
      customers > 0 ? { label: 'Paying customers', value: money(customers), evidence: 'Founder claim' } : null,
      Number.isFinite(churn) ? { label: 'Monthly logo churn', value: `${churn}%`, evidence: 'Founder claim' } : null,
      ltv !== null && cac > 0 ? { label: 'LTV proxy / CAC', value: `${(ltv / cac).toFixed(2)}×`, evidence: 'Estimate' } : null,
      monthlyGrossProfit !== null && cac >= 0 && monthlyGrossProfit > 0 ? { label: 'CAC payback', value: `${(cac / monthlyGrossProfit).toFixed(1)} months`, evidence: 'Estimate' } : null,
    ].filter(Boolean),
    fictional: /fictional.{0,80}unverified|fictional.{0,80}demo/i.test(markdown.slice(0, 3000)) || /fictional/i.test(metrics.data_status || ''),
    evidenceQuality: /fictional/i.test(markdown) ? 'Fictional demo data; operating claims are unverified.' : 'Evidence quality is described in the final memo.',
    reportDate: markdown.match(/^\*\*(?:Prepared|Updated):\*\*\s*(.+)$/mi)?.[1]?.trim() || 'Date not stated',
  };
}

function RecommendationCard({ evaluation, summary, setPage, compact = false }) {
  const riskStatus = evaluation?.report_availability?.risk
    ? evaluation.status === 'validated' ? 'Risk review indicates independent validation.' : 'Risk review exists; validation status is pending or unknown.'
    : 'Unknown — no independent risk review is available.';
  return <section className={`recommendation-card ${compact ? 'compact' : ''}`}>
    <div className="recommendation-head"><div><div className="eyebrow">PRELIMINARY INVESTMENT RECOMMENDATION</div><div className="recommendation-company">{evaluation?.company_name || 'Selected startup'}{summary?.fictional && <span className="demo-badge">FICTIONAL DEMO DATA</span>}</div></div><span className="recommendation-pill">{summary?.recommendation || 'UNKNOWN'}</span></div>
    <p className="recommendation-rationale">{summary ? summary.rationale : 'Final memo unavailable. No recommendation has been inferred.'}</p>
    {summary && <>
      <div className="recommendation-meta"><div><b>Evidence quality</b><span>{summary.evidenceQuality}</span></div><div><b>Independent Risk Analyst</b><span>{riskStatus}</span></div></div>
      <div className="recommendation-details">
        <div><h4>Major investment risks</h4>{summary.risks.length ? <ul>{summary.risks.slice(0, compact ? 3 : 4).map((risk, index) => <li key={index}><b>{risk.text}</b>{risk.severity && <span className="risk-severity">{risk.severity}</span>}</li>)}</ul> : <p>Unknown — not extracted from the memo.</p>}</div>
        <div><h4>Financial indicators <small>Founder claims / estimates</small></h4>{summary.financials.length ? <div className="recommendation-financials">{summary.financials.slice(0, 4).map((item) => <div key={item.label}><span>{item.label}</span><b>{item.value}</b></div>)}</div> : <p>Unknown — no usable financial inputs.</p>}</div>
        <div><h4>Outstanding diligence</h4>{summary.questions.length ? <ul>{summary.questions.slice(0, compact ? 2 : 3).map((item, index) => <li key={index}>{item.text}</li>)}</ul> : <p>Unknown — no unresolved questions found in the memo.</p>}</div>
      </div>
      {!compact && <div className="recommendation-actions"><button className="secondary-btn compact" onClick={() => setPage('reports')}><FileText size={14} /> Open final memo</button><button className="secondary-btn compact" onClick={() => setPage('agent-room')}><MessageSquare size={14} /> Open Agent Room</button></div>}
    </>}
  </section>;
}

function StatusPill({ status }) {
  const config = {
    validated: ['Validated', 'success'], complete: ['Memo ready', 'success'],
    in_review: ['In review', 'amber'], in_progress: ['In progress', 'blue'],
    draft: ['Draft', 'muted'], ready_to_launch: ['Ready to launch', 'amber'],
  }[status] || ['Draft', 'muted'];
  return <span className={`status-pill ${config[1]}`}><i />{config[0]}</span>;
}

function Sidebar({ page, setPage, onNew, config }) {
  const nav = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, section: 'WORKSPACE' },
    { id: 'evaluations', label: 'Evaluations', icon: BriefcaseBusiness },
    { id: 'agent-room', label: 'Agent room', icon: MessageSquare, count: '2' },
    { id: 'reports', label: 'Reports', icon: FileText, section: 'INTELLIGENCE' },
    { id: 'analytics', label: 'Financial analysis', icon: BarChart3 },
  ];
  return <aside className="sidebar">
    <div className="brand-row">
      <div className="brand-mark"><span /><span /><span /></div>
      <div><div className="brand-name">venture<span>lens</span></div><div className="brand-caption">INVESTMENT INTELLIGENCE</div></div>
    </div>
    <button className="workspace-switcher"><div className="workspace-avatar">VL</div><div className="workspace-copy"><b>Personal workspace</b><small>Local environment</small></div><ChevronDown size={15} /></button>
    <div className="nav-block">
      {nav.map((item) => <div key={item.id}>
        {item.section && <div className="nav-section">{item.section}</div>}
        <button className={`nav-item ${page === item.id ? 'active' : ''}`} onClick={() => setPage(item.id)}>
          <item.icon size={17} strokeWidth={1.8} /><span>{item.label}</span>{item.count && <em>{item.count}</em>}
        </button>
      </div>)}
    </div>
    <div className="sidebar-spacer" />
    <div className="sidebar-room">
      <div className="sidebar-room-head"><span className="live-dot" /> SWITCH CONNECTION</div>
      <div className="room-link"><div className="room-icon"><MessageSquare size={14} /></div><div><b>venturelens-diligence</b><small>{config?.mattermost_configured ? 'Mattermost connected' : 'Switch room · manual link'}</small></div><span className="room-live" /></div>
      <div className="agents-mini"><span className="agent-face market">M</span><span className="agent-face risk">R</span><span>2 agents configured</span></div>
    </div>
    <div className="sidebar-bottom">
      <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Settings size={17} /><span>Settings</span><span className={`connection-dot ${config?.mattermost_configured ? 'connected' : ''}`} /></button>
      <div className="profile-row"><div className="profile-avatar">AJ</div><div><b>Workspace owner</b><small>Local administrator</small></div><MoreHorizontal size={17} /></div>
      <div className="sidebar-version">VENTURELENS AI <span>v0.1.0</span></div>
    </div>
  </aside>;
}

function Header({ title, subtitle, onNew, page }) {
  return <header className="topbar">
    <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={13} /><b>{title}</b></div>
    <div className="topbar-actions"><div className="system-status"><span /> LOCAL SYSTEM</div><button className="icon-btn" title="Notifications"><Bell size={17} /><i /></button><button className="avatar-small">AJ</button><button className="primary-btn top-new" onClick={onNew}><Plus size={16} /> New evaluation</button></div>
  </header>;
}

function StatCard({ icon: Icon, label, value, sub, trend, accent = 'violet' }) {
  return <div className="stat-card"><div className={`stat-icon ${accent}`}><Icon size={18} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-foot">{trend ? <span className="trend"><ArrowUpRight size={13} />{trend}</span> : <span className="stat-sub">{sub}</span>}{trend && <span className="stat-sub">{sub}</span>}</div></div>;
}

function EvaluationCard({ item, selected, onClick }) {
  const metrics = item.founder_metrics || {};
  return <button onClick={onClick} className={`evaluation-row ${selected ? 'selected' : ''}`}>
    <div className="company-avatar">{initials(item.company_name)}</div>
    <div className="evaluation-main"><div className="evaluation-title">{item.company_name}<span className="sector-tag">{item.industry || 'Startup'}</span></div><div className="evaluation-meta">{item.geography || '—'} <span>·</span> {item.stage || 'New evaluation'} <span>·</span> Added {formatDate(item.created_at)}</div></div>
    <div className="evaluation-amount"><b>{item.funding_ask || '—'}</b><small>Funding sought</small></div>
    <div className="evaluation-report-count"><FileText size={14} /> {item.reports_ready || 0}/3</div>
    <StatusPill status={item.status} /><ChevronRight size={16} className="row-chevron" />
  </button>;
}

function activityRole(item) {
  const name = (item.username || '').toLowerCase();
  if (!item.is_bot) return { key: 'human', label: item.username || 'Human', tone: 'human' };
  if (name.includes('risk')) return { key: 'risk', label: 'Risk Analyst', tone: 'risk' };
  if (name.includes('market')) return { key: 'market', label: 'Market Analyst', tone: 'market' };
  return { key: 'other', label: item.username || 'Mattermost agent', tone: 'market' };
}

function ActivityPanel({ activity, loading, onRefresh, connected, mattermostUrl, maxItems = 6 }) {
  const [filter, setFilter] = useState('all');
  const items = activity?.items || [];
  const latest = items[items.length - 1];
  const visibleItems = items.slice(-40).filter((item) => filter === 'all' || activityRole(item).key === filter).slice(-maxItems).reverse();
  const latestTime = latest?.created_at ? new Date(latest.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'No activity timestamp';
  return <section className="panel activity-panel">
    <div className="panel-heading"><div><h3>Room activity</h3><p>Latest Mattermost messages · updated {latestTime}</p></div><button className="icon-btn light" onClick={onRefresh} title="Refresh activity"><RefreshCw size={15} className={loading ? 'spin' : ''} /></button></div>
    {!connected && <div className="integration-notice"><Link2 size={15} /><div><b>Live activity unavailable</b><span>{activity?.message || 'Save Mattermost credentials in Settings to read the room. This connection is read-only.'}</span></div></div>}
    {items.length > 0 && <div className="activity-filters" role="group" aria-label="Filter agent room messages">{[['all', 'All'], ['market', 'Market Analyst'], ['risk', 'Risk Analyst'], ['human', 'Human']].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div>}
    {visibleItems.length > 0 ? <div className="activity-list">{visibleItems.map((item) => { const role = activityRole(item); return <div className={`activity-item ${item.root_id ? 'thread-reply' : ''}`} key={item.id}><div className={`activity-avatar ${role.tone}`}>{initials(item.username)}</div><div className="activity-body"><div className="activity-line"><b>{role.label}</b><span className="activity-author">@{item.username || 'unknown'}</span><time>{item.created_at ? new Date(item.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Timestamp unknown'}</time></div>{item.root_id && <div className="thread-context">↳ Thread reply · root {String(item.root_id).slice(0, 8)}</div>}<p>{item.message}</p></div></div>; })}</div> : items.length > 0 ? <div className="activity-filter-empty">No messages match this filter.</div> : <div className="empty-activity"><div className="empty-icon"><Activity size={20} /></div><b>No messages returned</b><span>Activity appears here when Mattermost provides room messages.</span></div>}
    <div className="panel-footer"><span><span className={`tiny-dot ${connected ? 'on' : ''}`} /> {connected ? 'Connected · read-only' : 'Not connected'}</span><button onClick={() => window.open(mattermostUrl || 'http://127.0.0.1:55041', '_blank', 'noopener,noreferrer')}>Open Mattermost <ExternalLink size={12} /></button></div>
  </section>;
}

function DiligenceProgress({ evaluation, activity }) {
  const messages = (activity?.items || []).map((item) => item.message || '').join('\n').toLowerCase();
  const reports = evaluation?.report_availability || {};
  const statusFor = (hasReport, isMentioned, unknown = false) => hasReport ? 'Complete' : unknown ? 'Unknown' : isMentioned ? 'In progress' : 'Pending';
  const steps = [
    ['Market analysis', statusFor(reports.market, /market analysis|market research/.test(messages))],
    ['Independent risk review', statusFor(reports.risk, /risk review|risk analyst/.test(messages))],
    ['Revised market analysis', /revised market analysis|market analysis revised|market revision/.test(messages) ? 'Activity seen' : 'Unknown'],
    ['Final investment memo', statusFor(reports.final, /final investment memo|consolidated investment memo/.test(messages))],
    ['Independent validation', evaluation?.status === 'validated' ? 'Validated' : reports.risk ? 'Pending / unknown' : 'Unknown'],
  ];
  return <section className="panel diligence-progress"><div className="panel-heading"><div><h3>Research progress</h3><p>Based on saved reports and returned room messages</p></div><FileCheck2 size={17} className="heading-accent" /></div><div className="progress-step-list">{steps.map(([label, status]) => <div key={label}><span className={`progress-step-dot ${status === 'Complete' || status === 'Validated' ? 'done' : ''}`} /><b>{label}</b><span className="progress-step-status">{status}</span></div>)}</div></section>;
}

function Overview({ data, selectedId, setSelectedId, onNew, activity, activityLoading, refreshActivity, config, setPage, memoSummary }) {
  const selected = data.items.find((item) => item.id === selectedId) || data.items[0];
  const latest = data.items[0];
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow"><Sparkles size={13} /> YOUR DEALFLOW, AUGMENTED</div><h1>Investment intelligence<span className="period">.</span></h1><p>Evaluate startups with a collaborative team of AI research agents.</p></div><div className="intro-actions"><button className="secondary-btn" onClick={() => setPage('agent-room')}><MessageSquare size={15} /> Open agent room</button><button className="primary-btn" onClick={onNew}><Plus size={16} /> New evaluation</button></div></div>
    <div className="stat-grid">
      <StatCard icon={BriefcaseBusiness} label="Total evaluations" value={data.summary.total} sub="Across your workspace" accent="violet" />
      <StatCard icon={Activity} label="In progress" value={data.summary.in_progress} sub="Research or review underway" accent="blue" />
      <StatCard icon={BadgeCheck} label="Validated memos" value={data.summary.validated} sub="Validation status from saved reports" accent="green" />
      <StatCard icon={FileCheck2} label="Reports generated" value={data.summary.reports_ready} sub="Market · Risk · Final memo" accent="amber" />
    </div>
    {selected && <div className="latest-evaluation-strip"><span>LATEST EVALUATED STARTUP</span><b>{latest?.company_name || selected.company_name}</b><span>{formatDate(latest?.updated_at || latest?.created_at)}</span><StatusPill status={latest?.status || selected.status} /></div>}
    <RecommendationCard evaluation={selected} summary={memoSummary} setPage={setPage} />
    <div className="overview-grid">
      <section className="panel evaluations-panel">
        <div className="panel-heading"><div><h3>Recent evaluations</h3><p>Track the progress of your startup reviews</p></div><button className="text-btn" onClick={() => setPage('evaluations')}>View all <ArrowRight size={14} /></button></div>
        {data.items.length ? <div className="evaluation-list">{data.items.slice(0, 4).map((item) => <EvaluationCard key={item.id} item={item} selected={item.id === selected?.id} onClick={() => { setSelectedId(item.id); setPage('reports'); }} />)}</div> : <div className="empty-state"><Building2 size={23} /><b>No evaluations yet</b><span>Create your first startup evaluation to get started.</span><button className="primary-btn" onClick={onNew}><Plus size={15} /> Create evaluation</button></div>}
        <div className="panel-footer"><span>Showing {Math.min(data.items.length, 4)} of {data.items.length} evaluations</span><button onClick={() => setPage('evaluations')}>All evaluations <ArrowRight size={12} /></button></div>
      </section>
      <div className="right-stack">
        <ActivityPanel activity={activity} loading={activityLoading} onRefresh={refreshActivity} connected={!!activity?.connected} mattermostUrl={config?.mattermost_url} />
        <section className="panel featured-panel"><div className="featured-top"><div className="featured-symbol"><Building2 size={18} /></div><span className="featured-label">SELECTED EVALUATION</span><MoreHorizontal size={17} /></div>{selected ? <><h3>{selected.company_name}</h3><p>{selected.description || 'Startup due diligence workspace'}</p><div className="featured-meta"><div><small>Funding sought</small><b>{selected.funding_ask || 'Not supplied'}</b></div><div><small>Report progress</small><b>{selected.reports_ready || 0} of 3 ready</b></div></div><div className="progress-track"><span style={{ width: `${(selected.reports_ready || 0) / 3 * 100}%` }} /></div><div className="featured-bottom"><StatusPill status={selected.status} /><button className="text-btn" onClick={() => setPage('reports')}>View reports <ArrowRight size={13} /></button></div></> : <div className="empty-small">Select an evaluation to see its overview.</div>}</section>
      </div>
    </div>
    <div className="footnote"><ShieldCheck size={14} /> Founder-provided figures are clearly labeled as unverified until independently evidenced. VentureLens does not make investment decisions.</div>
  </div>;
}
function EvaluationsPage({ data, selectedId, setSelectedId, setPage, onNew }) {
  const [query, setQuery] = useState('');
  const items = data.items.filter((item) => `${item.company_name} ${item.industry} ${item.geography}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">WORKSPACE / DEALFLOW</div><h1>Evaluations<span className="period">.</span></h1><p>Every startup review in one place, from first look to validated memo.</p></div><button className="primary-btn" onClick={onNew}><Plus size={16} /> New evaluation</button></div>
    <div className="filter-bar"><div className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search startups..." /></div><button className="secondary-btn compact"><Filter size={14} /> Filters <ChevronDown size={13} /></button><span className="result-count">{items.length} results</span></div>
    <section className="panel evaluations-page-panel"><div className="table-head"><span>STARTUP</span><span>FUNDING ASK</span><span>REPORTS</span><span>STATUS</span><span /></div>{items.map((item) => <EvaluationCard key={item.id} item={item} selected={item.id === selectedId} onClick={() => { setSelectedId(item.id); setPage('reports'); }} />)}{!items.length && <div className="empty-state"><Search size={22} /><b>No matching evaluations</b><span>Try a different search or create a new evaluation.</span></div>}</section>
  </div>;
}

function AgentRoomPage({ selected, activity, activityLoading, refreshActivity, config, onLaunch, launchLoading, onCopy }) {
  const [launchResult, setLaunchResult] = useState(null);
  const handleLaunch = async () => {
    const result = await onLaunch();
    setLaunchResult(result);
  };
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow"><span className="live-dot" /> SWITCH / MATTERMOST</div><h1>Agent room<span className="period">.</span></h1><p>Your AI research team works together in a shared Switch room.</p></div><button className="secondary-btn" onClick={() => window.open(config?.mattermost_url || 'http://127.0.0.1:55041', '_blank', 'noopener,noreferrer')}><ExternalLink size={15} /> Open Mattermost</button></div>
    <div className="room-banner"><div className="room-banner-icon"><MessageSquare size={19} /></div><div className="room-banner-copy"><b>venturelens-diligence</b><span>Shared workspace · Market Analyst + Risk Analyst · Human approval required</span></div><div className="room-connection"><span className={`tiny-dot ${config?.mattermost_configured ? 'on' : ''}`} />{config?.mattermost_configured ? 'Live connection' : 'Manual connection'}</div></div>
    <div className="agent-grid">
      <div className="agent-card"><div className="agent-card-top"><div className="agent-avatar market">M</div><span className="agent-online"><i /> Configured</span></div><h3>Market Analyst</h3><p>Researches the market, customer segments, competitors and business model.</p><div className="agent-tags"><span>Market sizing</span><span>Competitors</span><span>Research</span></div><div className="agent-card-foot"><span>Codex agent</span><span>market-analyst</span></div></div>
      <div className="agent-card"><div className="agent-card-top"><div className="agent-avatar risk">R</div><span className="agent-online"><i /> Configured</span></div><h3>Risk Analyst</h3><p>Independently challenges evidence, financial assumptions and risk exposure.</p><div className="agent-tags"><span>Unit economics</span><span>Risk review</span><span>Validation</span></div><div className="agent-card-foot"><span>Codex agent</span><span>risk-analyst</span></div></div>
    </div>
    <DiligenceProgress evaluation={selected} activity={activity} />
    <section className="panel room-workflow"><div className="panel-heading"><div><h3>Start a diligence run</h3><p>Prepare a prompt for manual handoff to your existing Switch agents.</p></div><Zap size={19} className="heading-accent" /></div><div className="run-context"><div><span>SELECTED STARTUP</span><b>{selected?.company_name || 'No startup selected'}</b></div><div><span>INPUT BRIEF</span><b>{selected ? `${selected.workspace_relpath || 'Workspace'}/input/startup-brief.md` : '—'}</b></div><div><span>AGENT ROOM</span><b>venturelens-diligence</b></div></div><button className="primary-btn launch-btn" onClick={handleLaunch} disabled={!selected || launchLoading}>{launchLoading ? <LoaderCircle size={16} className="spin" /> : <FileText size={15} />} {launchLoading ? 'Preparing prompt...' : 'Prepare diligence prompt'}</button>{launchResult && <div className={`launch-result ${launchResult.sent ? 'success' : 'notice'}`}><div>{launchResult.sent ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}<span>{launchResult.message}</span></div>{launchResult.launch_prompt && <><pre>{launchResult.launch_prompt}</pre><button className="secondary-btn compact" onClick={() => onCopy(launchResult.launch_prompt)}><Copy size={13} /> Copy launch prompt</button></>}</div>}</section>
    <ActivityPanel activity={activity} loading={activityLoading} onRefresh={refreshActivity} connected={!!activity?.connected} mattermostUrl={config?.mattermost_url} maxItems={40} />
  </div>;
}

function ReportsPage({ selected, reportItems, reportKey, setReportKey, reportText, reportLoading, loadReport, syncReports, onDownload, memoSummary }) {
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">INTELLIGENCE / DOCUMENTS</div><h1>Research reports<span className="period">.</span></h1><p>Evidence, independent challenges and investment conclusions in one workspace.</p></div><button className="secondary-btn" onClick={syncReports}><RefreshCw size={14} /> Refresh reports</button></div>
    <div className="report-company-bar"><div className="company-avatar">{initials(selected?.company_name)}</div><div><b>{selected?.company_name || 'Select a startup'}</b><span>{selected?.industry || 'Startup evaluation'} · {selected?.geography || '—'}</span></div><div className="report-company-status">{selected && <StatusPill status={selected.status} />}</div></div>
    {reportKey === 'final' && memoSummary && <RecommendationCard evaluation={selected} summary={memoSummary} setPage={() => {}} compact />}
    <div className="reports-layout"><div className="report-list panel">{reportItems.map((item) => <button key={item.key} className={`report-nav-item ${reportKey === item.key ? 'active' : ''}`} onClick={() => item.available && loadReport(item.key)} disabled={!item.available}><div className={`report-file-icon ${item.key}`}><FileText size={17} /></div><div className="report-nav-copy"><b>{item.title}</b><span>{item.available ? `${(item.bytes / 1024).toFixed(1)} KB · Markdown` : 'Not generated yet'}</span></div>{item.available ? <CheckCircle2 size={15} className="report-ready" /> : <Clock3 size={15} className="report-pending" />}</button>)}<div className="report-list-note"><ShieldCheck size={14} /> Reports are read from the shared agent workspace. VentureLens does not rewrite agent findings.</div></div>
      <section className="panel report-viewer"><div className="report-viewer-head"><div><div className="eyebrow">{reportItems.find((r) => r.key === reportKey)?.title || 'REPORT PREVIEW'}</div><h3>{selected?.company_name || 'No report selected'}</h3></div><div className="viewer-actions"><button className="icon-btn light" onClick={() => loadReport(reportKey)} title="Reload"><RefreshCw size={15} /></button>{reportKey === 'final' && <button className="secondary-btn compact print-action" disabled={!reportText} onClick={() => window.print()}><Printer size={14} /> Export PDF</button>}<button className="secondary-btn compact" disabled={!reportText} onClick={() => onDownload(reportText, `${selected?.slug || 'startup'}-${reportKey}.md`)}><Download size={14} /> Download</button></div></div>{reportLoading ? <div className="report-loading"><LoaderCircle className="spin" size={22} /> Loading report...</div> : reportText ? <div className="print-document"><div className="print-masthead"><div className="brand-mark"><span /><span /><span /></div><div><b>VENTURELENS AI</b><small>INVESTMENT INTELLIGENCE</small></div></div><div className="print-report-meta"><span>FINAL INVESTMENT MEMO</span><b>{selected?.company_name || 'Startup'}</b><small>Prepared {memoSummary?.reportDate || 'Date not stated'} · {memoSummary?.fictional ? 'Fictional demonstration data' : 'Evidence classifications retained from source memo'}</small></div><article className="markdown-body"><ReactMarkdown>{reportText}</ReactMarkdown></article></div> : <div className="report-empty"><div className="empty-icon"><FolderOpen size={21} /></div><b>Select an available report</b><span>Agent-generated Markdown will appear here when it is saved in the shared reports folder.</span></div>}</section>
    </div>
  </div>;
}

function SettingsPage({ config, onTest, testLoading, testResult, onSave }) {
  const [serverUrl, setServerUrl] = useState(config?.mattermost_url || 'http://127.0.0.1:55041');
  const [username, setUsername] = useState(config?.mattermost_session_configured ? '' : 'user');
  const [password, setPassword] = useState('');
  const [pat, setPat] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setSaveResult(null);
    try { await onSave({ server_url: serverUrl, username, password, pat }); setUsername(''); setPassword(''); setPat(''); setSaveResult({ ok: true, message: 'Connection settings saved on the backend.' }); }
    catch (error) { setSaveResult({ ok: false, message: error.message }); }
    finally { setSaving(false); }
  };
  return <div className="page-content">
    <div className="page-intro"><div><div className="eyebrow">WORKSPACE / CONFIGURATION</div><h1>Settings<span className="period">.</span></h1><p>Local workspace and read-only Switch/Mattermost connection settings.</p></div></div>
    <div className="settings-grid"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Agent workspace</h3><p>Shared local folder used by your Codex agents</p></div><FolderOpen size={18} className="heading-accent" /></div><div className="setting-field"><label>Workspace directory</label><code>{config?.workspace_root || 'Loading...'}</code><small>Must match the working directory configured for both agents in Switch Console.</small></div><div className="setting-field"><label>Market Analyst</label><div className="agent-setting-line"><span className="agent-face market">M</span><b>{config?.market_agent_name || 'market-analyst'}</b><span className="settings-tag">Codex</span></div></div><div className="setting-field"><label>Risk Analyst</label><div className="agent-setting-line"><span className="agent-face risk">R</span><b>{config?.risk_agent_name || 'risk-analyst'}</b><span className="settings-tag">Codex</span></div></div></section>
      <section className="panel settings-panel"><div className="panel-heading"><div><h3>Mattermost connection</h3><p>Username/password session login · read-only channel access</p></div><MessageSquare size={18} className="heading-accent" /></div>
        <div className="integration-status"><div className={`integration-logo ${config?.mattermost_configured ? 'connected' : ''}`}><MessageSquare size={19} /></div><div><b>{config?.mattermost_configured ? 'Mattermost connection configured' : 'Mattermost credentials required'}</b><span>{config?.mattermost_configured ? 'This dashboard reads channel messages only. Passwords remain on the backend.' : 'Save your username and password here. Password and session token are never returned by the API.'}</span></div><span className={`status-pill ${config?.mattermost_configured ? 'success' : 'amber'}`}><i />{config?.mattermost_configured ? (config.mattermost_auth_mode === 'session' ? 'Session auth' : 'PAT fallback') : 'Not connected'}</span></div>
        <form onSubmit={save}>
          <div className="setting-field"><label htmlFor="mm-server-url">Mattermost server URL</label><input id="mm-server-url" type="url" required value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://127.0.0.1:55041" /></div>
          <div className="setting-field"><label htmlFor="mm-username">Username</label><input id="mm-username" autoComplete="off" value={username} onChange={(event) => setUsername(event.target.value)} placeholder={config?.mattermost_session_configured ? "Saved on backend; leave blank to keep it" : "user"} /></div>
          <div className="setting-field"><label htmlFor="mm-password">Password <small>{config?.mattermost_session_configured ? 'Saved on backend; leave blank to keep the current password.' : 'Sent only to the local backend and never returned.'}</small></label><input id="mm-password" type="password" autoComplete="off" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={config?.mattermost_session_configured ? 'Saved on backend' : 'Mattermost password'} /></div>
          <details className="setting-field pat-optional"><summary>Optional Personal Access Token fallback</summary><label htmlFor="mm-pat">Personal Access Token <small>Session login takes priority when username and password are configured.</small></label><input id="mm-pat" type="password" autoComplete="off" value={pat} onChange={(event) => setPat(event.target.value)} placeholder={config?.mattermost_pat_configured ? 'Saved on backend or environment' : 'Leave blank to use session login'} /></details>
          <div className="settings-help"><b>Read-only Mattermost access</b><ol><li>VentureLens logs in through <code>/api/v4/users/login</code>.</li><li>It checks the session with <code>/api/v4/users/me</code>, then finds <code>venturelens-diligence</code> and reads its messages.</li><li>Messages cannot be posted, edited or deleted from VentureLens.</li></ol><div className="sensitive-note"><ShieldCheck size={14} /> Password is saved only in backend data. Session tokens stay in backend memory and are never sent to the browser.</div></div>
          <div className="settings-actions"><button className="primary-btn" disabled={saving}>{saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{saving ? 'Saving...' : 'Save credentials'}</button><button type="button" className="secondary-btn" onClick={onTest} disabled={testLoading || !config?.mattermost_configured}>{testLoading ? <LoaderCircle size={14} className="spin" /> : <CheckCircle2 size={14} />} Test read-only connection</button></div>
        </form>
        {saveResult && <div className={`test-result ${saveResult.ok ? 'success' : 'error'}`}>{saveResult.message}</div>}{testResult && <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>{testResult.message}</div>}
      </section></div>
    <div className="settings-footnote"><AlertCircle size={14} /> Keep this application bound to localhost. Mattermost credentials are stored by the backend and integration API calls are read-only.</div>
  </div>;
}
function NewEvaluationModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ company_name: '', industry: '', geography: 'India', stage: 'Seed', website: '', funding_ask: '', description: '', founder_metrics: {} });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const item = await request('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      if (file) {
        const body = new FormData(); body.append('file', file);
        await request(`/api/evaluations/${item.id}/upload`, { method: 'POST', body });
      }
      await onCreated(item.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card"><div className="modal-head"><div><div className="eyebrow">NEW WORKSPACE</div><h2>Evaluate a startup<span className="period">.</span></h2><p>Set up a company brief and optionally add its pitch deck.</p></div><button className="icon-btn light" onClick={onClose}><X size={18} /></button></div><form onSubmit={submit}><div className="form-grid"><div className="form-field full"><label>Startup name <b>*</b></label><input required minLength={2} value={form.company_name} onChange={(e) => change('company_name', e.target.value)} placeholder="e.g. Acme Technologies" /></div><div className="form-field"><label>Industry</label><input value={form.industry} onChange={(e) => change('industry', e.target.value)} placeholder="e.g. B2B SaaS, FinTech" /></div><div className="form-field"><label>Geography</label><input value={form.geography} onChange={(e) => change('geography', e.target.value)} /></div><div className="form-field"><label>Funding stage</label><select value={form.stage} onChange={(e) => change('stage', e.target.value)}><option>Pre-seed</option><option>Seed</option><option>Series A</option><option>Series B</option><option>Growth</option><option>Bootstrapped</option><option>Unknown</option></select></div><div className="form-field"><label>Funding sought</label><input value={form.funding_ask} onChange={(e) => change('funding_ask', e.target.value)} placeholder="e.g. ₹3 crore" /></div><div className="form-field full"><label>Website</label><input value={form.website} onChange={(e) => change('website', e.target.value)} placeholder="https://company.com" /></div><div className="form-field full"><label>Company description</label><textarea rows="4" value={form.description} onChange={(e) => change('description', e.target.value)} placeholder="What does the startup do? Who are its customers? What problem does it solve?" /></div><div className="form-field full"><label>Pitch deck or company brief <span>OPTIONAL · PDF, DOCX, PPTX, TXT, MD · UP TO 20 MB</span></label><label className={`upload-drop ${file ? 'has-file' : ''}`}><input type="file" accept=".pdf,.docx,.pptx,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} /><CloudUpload size={20} /><span>{file ? file.name : 'Click to upload a pitch deck'}</span><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'The text will be extracted into the agent workspace.'}</small></label></div></div>{error && <div className="form-error"><AlertCircle size={15} />{error}</div>}<div className="modal-footer"><span><ShieldCheck size={14} /> Founder claims remain labeled unverified.</span><div><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />} Create evaluation</button></div></div></form></div></div>;
}

export default function App() {
  const [page, setPage] = useState('overview');
  const [data, setData] = useState({ items: [], summary: { total: 0, in_progress: 0, validated: 0, reports_ready: 0 } });
  const [selectedId, setSelectedId] = useState('');
  const [config, setConfig] = useState(null);
  const [activity, setActivity] = useState({ connected: false, items: [] });
  const [activityLoading, setActivityLoading] = useState(false);
  const [reportItems, setReportItems] = useState([]);
  const [reportKey, setReportKey] = useState('final');
  const [reportText, setReportText] = useState('');
  const [finalMemo, setFinalMemo] = useState('');
  const [reportLoading, setReportLoading] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [launchLoading, setLaunchLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const selected = data.items.find((item) => item.id === selectedId) || data.items[0] || null;
  const memoSummary = useMemo(() => summarizeMemo(finalMemo, selected), [finalMemo, selected?.id, selected?.founder_metrics]);

  const refresh = useCallback(async () => {
    const [evaluations, settings] = await Promise.all([request('/api/evaluations'), request('/api/config')]);
    setData(evaluations); setConfig(settings);
    setSelectedId((current) => current || evaluations.items[0]?.id || '');
  }, []);

  const refreshActivity = useCallback(async () => {
    if (!selected) return;
    setActivityLoading(true);
    try { setActivity(await request(`/api/evaluations/${selected.id}/activity`)); }
    catch (err) { setActivity({ connected: false, items: [], message: err.message }); }
    finally { setActivityLoading(false); }
  }, [selected?.id]);

  const loadReports = useCallback(async () => {
    if (!selected) { setReportItems([]); setReportText(''); return; }
    try {
      const result = await request(`/api/evaluations/${selected.id}/reports`);
      setReportItems(result.items);
      const active = result.items.find((r) => r.key === reportKey && r.available) || result.items.find((r) => r.available);
      if (active) { setReportKey(active.key); await loadReport(active.key, selected.id); }
      else setReportText('');
    } catch (err) { setError(err.message); }
  }, [selected?.id]);

  const loadReport = useCallback(async (key, id = selected?.id) => {
    if (!id) return;
    setReportKey(key); setReportLoading(true);
    try { setReportText(await request(`/api/evaluations/${id}/reports/${key}`)); }
    catch (err) { setReportText(`> ${err.message}`); }
    finally { setReportLoading(false); }
  }, [selected?.id]);

  useEffect(() => { refresh().catch((err) => setError(err.message)); }, [refresh]);
  useEffect(() => { refreshActivity(); const timer = setInterval(refreshActivity, 15000); return () => clearInterval(timer); }, [refreshActivity]);
  useEffect(() => { if (page === 'reports') loadReports(); }, [page, selected?.id]);
  useEffect(() => {
    let active = true;
    if (!selected || !selected.report_availability?.final) { setFinalMemo(''); return () => { active = false; }; }
    request(`/api/evaluations/${selected.id}/reports/final`).then((text) => { if (active) setFinalMemo(text); }).catch(() => { if (active) setFinalMemo(''); });
    return () => { active = false; };
  }, [selected?.id, selected?.report_availability?.final]);

  const launch = async () => {
    if (!selected) return null;
    setLaunchLoading(true);
    try { return await request(`/api/evaluations/${selected.id}/launch`, { method: 'POST' }); }
    catch (err) { return { sent: false, message: err.message }; }
    finally { setLaunchLoading(false); }
  };
  const saveMattermostSettings = async (settings) => {
    const updated = await request('/api/integrations/mattermost/settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
    });
    setConfig((current) => ({ ...current, ...updated }));
    setTestResult(null);
    await refreshActivity();
    return updated;
  };
  const testMattermost = async () => {
    setTestLoading(true); setTestResult(null);
    try { const result = await request('/api/integrations/mattermost/test', { method: 'POST' }); setTestResult({ ok: true, message: 'Mattermost session verified through the read-only API.' }); }
    catch (err) { setTestResult({ ok: false, message: err.message }); }
    finally { setTestLoading(false); }
  };
  const onCreated = async (id) => { setNewOpen(false); await refresh(); setSelectedId(id); setPage('agent-room'); };
  const syncReports = async () => { await refresh(); await loadReports(); };
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); } catch { /* user can select the prompt if clipboard permission is denied */ } };
  const download = (text, filename) => { const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); };
  const pageTitles = { overview: 'Overview', evaluations: 'Evaluations', 'agent-room': 'Agent room', reports: 'Reports', analytics: 'Financial analysis', settings: 'Settings' };

  return <div className="app-shell">
    <Sidebar page={page} setPage={setPage} onNew={() => setNewOpen(true)} config={config} />
    <main className="main-area"><Header title={pageTitles[page] || 'Overview'} onNew={() => setNewOpen(true)} page={page} />
      {error && <div className="global-error"><AlertCircle size={15} />{error}<button onClick={() => setError('')}><X size={14} /></button></div>}
      {page === 'overview' && <Overview data={data} selectedId={selectedId} setSelectedId={setSelectedId} onNew={() => setNewOpen(true)} activity={activity} activityLoading={activityLoading} refreshActivity={refreshActivity} config={config} setPage={setPage} memoSummary={memoSummary} />}
      {page === 'evaluations' && <EvaluationsPage data={data} selectedId={selectedId} setSelectedId={setSelectedId} setPage={setPage} onNew={() => setNewOpen(true)} />}
      {page === 'agent-room' && <AgentRoomPage selected={selected} activity={activity} activityLoading={activityLoading} refreshActivity={refreshActivity} config={config} onLaunch={launch} launchLoading={launchLoading} onCopy={copy} />}
      {page === 'reports' && <ReportsPage selected={selected} reportItems={reportItems} reportKey={reportKey} setReportKey={setReportKey} reportText={reportText} reportLoading={reportLoading} loadReport={loadReport} syncReports={syncReports} onDownload={download} memoSummary={reportKey === 'final' ? summarizeMemo(reportText || finalMemo, selected) : null} />}
      {page === 'analytics' && <FinancialAnalysis selected={selected} />}
      {page === 'settings' && <SettingsPage config={config} onTest={testMattermost} onSave={saveMattermostSettings} testLoading={testLoading} testResult={testResult} />}
      <footer className="main-footer"><span>VENTURELENS AI</span><span>Private local workspace <i /> Built for human-led investment decisions</span></footer>
    </main>
    {newOpen && <NewEvaluationModal onClose={() => setNewOpen(false)} onCreated={onCreated} />}
  </div>;
}








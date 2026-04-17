import React, { useState } from 'react';
import MainLayout from '../components/layout/MainLayout';
import { Card } from '../components/ui/Card';
import { 
  Leaf, Activity, PieChart, Plus, CheckCircle2, 
  Sparkles, TrendingUp, TrendingDown, Target, Zap, ArrowRight 
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../store/authStore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RPieChart, Pie, Cell
} from 'recharts';

const CATEGORY_COLORS: Record<string, string> = {
  Transport: '#10b981',
  Food:      '#3b82f6',
  Utilities: '#f59e0b',
  Travel:    '#8b5cf6',
};
const DEFAULT_COLOR = '#64748b';

function getMonthLabel(month: number, year: number) {
  return new Date(year, month - 1).toLocaleString('default', { month: 'short', year: '2-digit' });
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ category: 'Transport', activityLabel: '', quantity: '' });

  // ── API Queries ──────────────────────────────────────────────────────────
  const { data: score, isLoading: scoreLoading, isError: scoreError } = useQuery({
    queryKey: ['carbonScore'],
    queryFn: () => fetchApi('/carbon-score/current'),
  });

  const { data: emissions, isLoading: loadingEmissions, isError: emissionsError } = useQuery({
    queryKey: ['emissions'],
    queryFn: () => fetchApi('/emissions'),
  });

  const { data: summary, isError: summaryError } = useQuery({
    queryKey: ['emissionSummary'],
    queryFn: () => fetchApi('/emissions/summary'),
  });

  const { data: history, isError: historyError } = useQuery({
    queryKey: ['scoreHistory'],
    queryFn: () => fetchApi('/carbon-score/history'),
  });

  const { data: passport, isError: passportError } = useQuery({
    queryKey: ['passport'],
    queryFn: () => fetchApi('/passport/me'),
  });

  const { data: factors } = useQuery({
    queryKey: ['factors'],
    queryFn: () => fetchApi('/emissions/factors'),
  });

  const { data: insightsData, isLoading: insightsLoading } = useQuery({
    queryKey: ['insights'],
    queryFn: () => fetchApi('/insights/generate'),
  });

  // ── Derived chart data ───────────────────────────────────────────────────
  const pieData = summary?.breakdown?.map((b: any) => ({
    name: b.category,
    value: b.value,
  })) ?? [];

  const trendData = history?.map((s: any) => ({
    label: getMonthLabel(s.month, s.year),
    kg:    Math.round(s.monthlyScore),
  })) ?? [];

  // When a category changes, default activityLabel to first factor in that category
  const factorOptions: string[] = React.useMemo(() => {
    if (!factors) return [];
    const cat = factors.find((c: any) => c.name === form.category);
    return cat ? cat.factors.map((f: any) => f.name) : [];
  }, [factors, form.category]);

  React.useEffect(() => {
    if (factorOptions.length > 0) {
      setForm(f => ({ ...f, activityLabel: factorOptions[0] }));
    }
  }, [factorOptions]);

  // ── Mutation ─────────────────────────────────────────────────────────────
  const addEmission = useMutation({
    mutationFn: (e: React.FormEvent) => {
      e.preventDefault();
      return fetchApi('/emissions/manual', {
        method: 'POST',
        body: JSON.stringify({ ...form, quantity: Number(form.quantity) }),
      });
    },
    onSuccess: async () => {
      await fetchApi('/carbon-score/recalculate', { method: 'POST' });
      queryClient.invalidateQueries({ queryKey: ['emissions'] });
      queryClient.invalidateQueries({ queryKey: ['carbonScore'] });
      queryClient.invalidateQueries({ queryKey: ['emissionSummary'] });
      queryClient.invalidateQueries({ queryKey: ['scoreHistory'] });
      queryClient.invalidateQueries({ queryKey: ['passport'] });
      queryClient.invalidateQueries({ queryKey: ['insights'] }); // Refresh insights on new log
      setShowModal(false);
      setForm({ category: 'Transport', activityLabel: '', quantity: '' });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    },
  });

  const monthlyScore  = score?.monthlyScore  ?? 0;
  const netFootprint  = passport?.netFootprint  ?? 0;
  const totalOffsets  = passport?.totalOffsets  ?? 0;

  return (
    <MainLayout title="Dashboard" subtitle="Your carbon footprint at a glance">
      {/* Success toast */}
      {success && (
        <div className="fixed top-6 right-6 z-50 flex items-center gap-3 bg-emerald-500 text-white px-5 py-3 rounded-2xl shadow-xl animate-bounce-once">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">Emission logged & score updated!</span>
        </div>
      )}

      {/* Log Emission Button */}
      <div className="flex justify-end mb-6">
        <button
          id="log-activity-btn"
          onClick={() => setShowModal(true)}
          className="bg-emerald-500 hover:bg-emerald-400 text-white px-4 py-2 rounded-xl flex items-center font-medium shadow-lg shadow-emerald-500/20 transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> Log Emission
        </button>
      </div>

      {/* ── Log Emission Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-slate-900 border border-slate-700">
            <h3 className="text-xl font-bold mb-5">Log Manual Activity</h3>
            <form onSubmit={addEmission.mutate} className="space-y-4">
              {/* Category */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value, activityLabel: '' })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                >
                  {factors
                    ? factors.map((c: any) => <option key={c.name}>{c.name}</option>)
                    : ['Transport', 'Food', 'Utilities', 'Travel'].map(c => <option key={c}>{c}</option>)
                  }
                </select>
              </div>

              {/* Activity */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">Activity</label>
                {factorOptions.length > 0 ? (
                  <select
                    value={form.activityLabel}
                    onChange={e => setForm({ ...form, activityLabel: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                    required
                  >
                    {factorOptions.map(f => <option key={f}>{f}</option>)}
                  </select>
                ) : (
                  <input
                    type="text" required placeholder="e.g. Flight to Delhi"
                    value={form.activityLabel}
                    onChange={e => setForm({ ...form, activityLabel: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                )}
              </div>

              {/* Quantity */}
              <div>
                <label className="text-sm text-slate-400 block mb-1">
                  Quantity {factors?.find((c: any) => c.name === form.category)?.factors.find((f: any) => f.name === form.activityLabel)
                    ? `(${factors.find((c: any) => c.name === form.category).factors.find((f: any) => f.name === form.activityLabel).unit})`
                    : '(units)'}
                </label>
                <input
                  type="number" required min={0.01} step="any" placeholder="e.g. 50"
                  value={form.quantity}
                  onChange={e => setForm({ ...form, quantity: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="text-slate-400 font-medium px-4 py-2">Cancel</button>
                <button type="submit" disabled={addEmission.isPending} className="bg-emerald-500 font-medium text-white px-5 py-2 rounded-lg disabled:opacity-50">
                  {addEmission.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ── Stat Cards ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="hover:border-emerald-500/30 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
            <Activity className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-slate-400 font-medium mb-1">Monthly Estimate</h3>
          <div className="text-3xl font-bold text-white">
            {scoreError ? (
              <span className="text-base text-rose-400 font-normal">Error loading</span>
            ) : scoreLoading ? (
              '…'
            ) : (
              <>{Math.round(monthlyScore)} <span className="text-base text-slate-500 font-normal">kg CO₂e</span></>
            )}
          </div>
        </Card>

        <Card className="hover:border-emerald-500/30 transition-colors">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
            <Leaf className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-slate-400 font-medium mb-1">Total Offsets Purchased</h3>
          <div className="text-3xl font-bold text-white">
            {passportError ? (
              <span className="text-base text-rose-400 font-normal">Error loading</span>
            ) : (
              <>{Math.round(totalOffsets)} <span className="text-base text-slate-500 font-normal">kg CO₂e</span></>
            )}
          </div>
        </Card>

        <Card className="bg-gradient-to-br from-slate-900 to-slate-800 border-none relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/10 to-transparent pointer-events-none" />
          <div className="relative z-10">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4">
              <PieChart className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-slate-300 font-medium mb-1">Net Footprint</h3>
            <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">
              {passportError ? (
                <span className="text-base text-rose-400 font-normal normal-case">Error loading</span>
              ) : (
                <>{Math.round(netFootprint)} <span className="text-base text-emerald-500 font-medium">kg</span></>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── AI Insights Premium Card ────────────────────────────────────────── */}
      <Card className="mb-8 relative overflow-hidden border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900 to-slate-900">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <Sparkles className="w-48 h-48 text-indigo-400" />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white bg-clip-text text-transparent bg-gradient-to-r from-white to-indigo-200">AI Profile Analysis</h2>
              <p className="text-sm text-indigo-300/80">Generated dynamically based on your latest activity</p>
            </div>
          </div>

          {insightsLoading ? (
            <div className="flex flex-col gap-4 animate-pulse">
              <div className="h-4 bg-slate-800/80 rounded w-3/4"></div>
              <div className="h-4 bg-slate-800/80 rounded w-full"></div>
              <div className="h-4 bg-slate-800/80 rounded w-5/6"></div>
              <div className="h-12 bg-slate-800/60 rounded mt-4 max-w-sm"></div>
            </div>
          ) : !insightsData ? (
            <div className="flex items-center gap-3 text-slate-400 text-sm py-4 bg-slate-900/50 rounded-xl px-4 border border-slate-800">
               <Activity className="w-4 h-4" /> Failed to generate insights.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Summary and Target */}
              <div className="lg:col-span-2 space-y-5">
                <p className="text-slate-300 text-sm leading-relaxed border-l-2 border-indigo-500/50 pl-4 py-1">
                  {insightsData.summary}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                       {insightsData.trend.direction === 'Increased' ? (
                         <TrendingUp className="w-4 h-4 text-rose-400" />
                       ) : insightsData.trend.direction === 'Decreased' ? (
                         <TrendingDown className="w-4 h-4 text-emerald-400" />
                       ) : (
                         <Activity className="w-4 h-4 text-slate-400" />
                       )}
                       <span className="text-sm font-semibold text-white">Trend: {insightsData.trend.direction}</span>
                    </div>
                    <p className="text-xs text-slate-400">{insightsData.trend.reason}</p>
                  </div>

                  <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                       <Target className="w-4 h-4 text-indigo-400" />
                       <span className="text-sm font-semibold text-white">Recommended Target</span>
                    </div>
                    <div className="flex items-end gap-2 text-xs text-slate-400">
                      Offset <strong className="text-white text-base">{insightsData.recommendedOffsetTonnes}</strong> tonnes to reach Net Zero.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action item */}
              <div className="bg-indigo-500/10 rounded-2xl p-5 border border-indigo-500/20 flex flex-col justify-between backdrop-blur-sm">
                 <div>
                   <div className="flex items-center gap-2 mb-3">
                     <Zap className="w-4 h-4 text-amber-400" />
                     <span className="text-sm font-bold text-indigo-300">Action Plan</span>
                   </div>
                   <p className="text-sm text-slate-300 leading-relaxed font-medium">
                     {insightsData.recommendedAction}
                   </p>
                 </div>
                 <button className="mt-4 w-full py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-bold rounded-xl border border-indigo-500/50 transition-colors flex items-center justify-center gap-1.5"
                 onClick={() => document.getElementById('log-activity-btn')?.click()}>
                   Take Action Now <ArrowRight className="w-4 h-4" />
                 </button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ── Charts Row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Trend Chart (2/3 width) */}
        <Card className="col-span-2 min-h-[340px] flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6">Monthly Footprint Trend</h3>
          {historyError ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-rose-700/50 rounded-2xl bg-rose-500/5">
              <p className="text-rose-400 text-sm">Failed to load trend data.</p>
            </div>
          ) : trendData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700/50 rounded-2xl">
              <p className="text-slate-500 text-sm">Log emissions and recalculate to see your trend.</p>
            </div>
          ) : (
            <div className="flex-1">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#f1f5f9' }}
                    formatter={(v: any) => [`${v} kg CO₂e`, 'Monthly']}
                  />
                  <Area type="monotone" dataKey="kg" stroke="#10b981" strokeWidth={2} fill="url(#scoreGrad)" dot={{ fill: '#10b981', r: 4 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Category Breakdown Pie (1/3 width) */}
        <Card className="min-h-[340px] flex flex-col">
          <h3 className="text-lg font-bold text-white mb-6">By Category</h3>
          {summaryError ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-rose-700/50 rounded-2xl bg-rose-500/5">
              <p className="text-rose-400 text-sm text-center px-4">Failed to load category breakdown.</p>
            </div>
          ) : pieData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center border border-dashed border-slate-700/50 rounded-2xl">
              <p className="text-slate-500 text-sm text-center px-4">Log some activities to see category breakdown.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <RPieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[entry.name] || DEFAULT_COLOR} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 12, color: '#f1f5f9' }}
                    formatter={(v: any) => [`${v} kg`, '']}
                  />
                </RPieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-2 justify-center">
                {pieData.map((entry: any) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-400">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: CATEGORY_COLORS[entry.name] || DEFAULT_COLOR }} />
                    {entry.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── Recent Activity ───────────────────────────────────────────────── */}
      <Card>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-white">Recent Activity</h3>
          <span className="text-xs text-slate-500">{emissions?.length ?? 0} entries</span>
        </div>
        <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
          {emissionsError ? (
            <p className="text-sm text-rose-400 text-center py-6 bg-rose-500/5 rounded-2xl border border-dashed border-rose-700/50">
              Failed to load activity feed.
            </p>
          ) : loadingEmissions ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : (!emissions || emissions.length === 0) ? (
            <p className="text-sm text-slate-500 text-center py-6">No activity logged yet. Use the button above to start.</p>
          ) : (
            emissions.map((item: any, i: number) => (
              <div key={i} className="flex justify-between items-center group py-2 border-b border-slate-800/40 last:border-0">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: `${CATEGORY_COLORS[item.category] || DEFAULT_COLOR}20`, color: CATEGORY_COLORS[item.category] || DEFAULT_COLOR }}
                  >
                    {item.category[0]}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-200">{item.activityLabel}</div>
                    <div className="text-xs text-slate-500">{item.category} · {new Date(item.timestamp).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="text-sm font-bold text-slate-300">+{Math.round(item.co2eResult)} kg</div>
              </div>
            ))
          )}
        </div>
      </Card>
    </MainLayout>
  );
}

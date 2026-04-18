import MainLayout from '../components/layout/MainLayout';
import { Card } from '../components/ui/Card';
import { Fingerprint, Share2, Award, Download, BadgeCheck, Leaf, TrendingDown, ShoppingBag } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, useAuthStore } from '../store/authStore';

const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-400',
  'A': 'text-emerald-400',
  'B': 'text-teal-400',
  'C': 'text-yellow-400',
  'D': 'text-orange-400',
  'F': 'text-rose-400',
};

const GRADE_LABELS: Record<string, string> = {
  'A+': 'Carbon Champion — Well below 1.5°C target',
  'A': 'Leading — Below global target',
  'B': 'Progressing — Near 2°C pathway',
  'C': 'Average — Global average range',
  'D': 'Above Average — Needs reduction',
  'F': 'High Impact — Urgent action needed',
};

export default function Passport() {
  const user = useAuthStore(s => s.user);
  const passportRef = useRef<HTMLDivElement>(null);

  const { data: passport, isLoading, isError } = useQuery({
    queryKey: ['passport'],
    queryFn: () => fetchApi('/passport/me'),
    retry: 1,
  });

  const { data: purchases } = useQuery({
    queryKey: ['purchaseHistory'],
    queryFn: () => fetchApi('/projects/history'),
    retry: 1,
  });

  // ── Share: copy a text summary to clipboard ──────────────────────────────
  const handleShare = async () => {
    if (!passport) return;
    const text =
      `My CarbonID Passport\n` +
      `Grade: ${passport.carbonGrade ?? 'N/A'}\n` +
      `Net Footprint: ${Math.round(passport.netFootprint ?? 0)} kg CO₂e\n` +
      `Total Offsets: ${Math.round(passport.totalOffsets ?? 0)} kg CO₂e\n` +
      `This passport is verified on CarbonID.`;
    try {
      await navigator.clipboard.writeText(text);
      alert('Passport summary copied to clipboard!');
    } catch {
      alert('Could not copy — try manually.');
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="Carbon Passport" subtitle="Loading your environmental identity...">
        <div className="animate-pulse flex flex-col lg:flex-row gap-8">
          <div className="w-full lg:w-96 h-[520px] bg-slate-800/50 rounded-[2.5rem]" />
          <div className="flex-1 space-y-6">
            <div className="h-48 bg-slate-800/50 rounded-3xl" />
            <div className="h-64 bg-slate-800/50 rounded-3xl" />
          </div>
        </div>
      </MainLayout>
    );
  }

  if (isError || !passport) {
    return (
      <MainLayout title="Carbon Passport" subtitle="">
        <Card className="p-12 text-center">
          <Fingerprint className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">Passport Not Found</h3>
          <p className="text-slate-400">Complete onboarding to generate your Carbon Passport.</p>
        </Card>
      </MainLayout>
    );
  }

  const gradeColor = GRADE_COLORS[passport.carbonGrade] ?? 'text-slate-400';
  const gradeLabel = GRADE_LABELS[passport.carbonGrade] ?? '';
  const carbonNeutral = passport.netFootprint <= 0;

  return (
    <MainLayout
      title="Carbon Passport"
      subtitle="Your verifiable environmental identity and climate contribution."
    >
      <div className="flex flex-col lg:flex-row gap-8 items-start">

        {/* ── Passport Card ────────────────────────────────────────────────── */}
        <div className="w-full lg:w-96 shrink-0">
          <div
            ref={passportRef}
            className="w-full aspect-[2/3] bg-gradient-to-br from-slate-800 to-slate-900 rounded-[2.5rem] p-8 border hover:border-emerald-500/50 border-slate-700 shadow-2xl relative overflow-hidden transition-all duration-500 hover:shadow-emerald-500/20 group"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/0 via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/10 blur-[50px] rounded-full pointer-events-none" />

            <div className="flex justify-between items-start mb-10 relative z-10">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-4">
                  <Fingerprint className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-widest text-slate-300">CARBON ID</h3>
              </div>
              <div className="flex flex-col items-end gap-2">
                <BadgeCheck className="w-8 h-8 text-emerald-400" />
                {carbonNeutral && (
                  <span className="text-[0.6rem] font-bold uppercase tracking-widest bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Carbon Neutral
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-5 relative z-10">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Citizen</p>
                <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                  {passport?.user?.profile?.fullName || user?.fullName || 'User'}
                </p>
              </div>

              <div className="flex gap-8">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Rating</p>
                  <p className={`text-5xl font-black ${gradeColor}`}>{passport.carbonGrade ?? 'N/A'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Year</p>
                  <p className="text-lg font-bold text-white">{new Date(passport.updatedAt ?? Date.now()).getFullYear()}</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 italic">{gradeLabel}</p>

              <div className="w-full h-px bg-slate-700/50 my-1" />

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/50 rounded-2xl p-3">
                  <p className="text-[0.6rem] text-slate-500 uppercase tracking-widest mb-1">Total Emitted</p>
                  <p className="text-base font-bold text-slate-300">
                    {Math.round(passport.cumulativeFootprint ?? 0).toLocaleString()}
                    <span className="text-xs font-normal text-slate-500 ml-1">kg</span>
                  </p>
                </div>
                <div className="bg-emerald-500/10 rounded-2xl p-3 border border-emerald-500/20">
                  <p className="text-[0.6rem] text-emerald-500 uppercase tracking-widest mb-1">Total Offset</p>
                  <p className="text-base font-bold text-emerald-400">
                    {Math.round(passport.totalOffsets ?? 0).toLocaleString()}
                    <span className="text-xs font-normal text-emerald-500/70 ml-1">kg</span>
                  </p>
                </div>
                <div className="col-span-2 bg-slate-800/30 rounded-2xl p-3 border border-slate-700/50">
                  <p className="text-[0.6rem] text-slate-500 uppercase tracking-widest mb-1">Net Footprint</p>
                  <p className={`text-xl font-black ${carbonNeutral ? 'text-emerald-400' : 'text-white'}`}>
                    {Math.round(passport.netFootprint ?? 0).toLocaleString()}
                    <span className="text-sm font-normal text-slate-400 ml-1">kg CO₂e</span>
                  </p>
                </div>
              </div>
            </div>

            <div className="absolute bottom-5 left-0 w-full text-center">
              <p className="text-[0.6rem] text-slate-600 uppercase tracking-[0.3em]">Verified on Database • Immutable Ledger</p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-4 flex gap-3 w-full">
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              <Share2 className="w-4 h-4" /> Share
            </button>
            <button
              onClick={() => window.print()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-sm font-medium border border-emerald-500/20 transition-colors"
            >
              <Download className="w-4 h-4" /> Print / Save
            </button>
          </div>
        </div>

        {/* ── Right Panel ──────────────────────────────────────────────────── */}
        <div className="flex-1 space-y-6 w-full">

          {/* Achievements */}
          <Card>
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" />
              Impact Achievements
            </h3>
            <div className="space-y-3">
              {carbonNeutral && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xl">🌍</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Carbon Neutral</h4>
                    <p className="text-sm text-slate-400">Your net footprint is zero. You're leading by example.</p>
                  </div>
                </div>
              )}
              {(passport.totalOffsets ?? 0) > 0 && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-teal-500/10 border border-teal-500/20">
                  <div className="w-11 h-11 rounded-full bg-teal-500/20 flex items-center justify-center shrink-0">
                    <span className="text-xl">🌳</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-white">Forest Guardian</h4>
                    <p className="text-sm text-slate-400">
                      You've neutralized {Math.round(passport.totalOffsets).toLocaleString()} kg CO₂e via verified offset projects.
                    </p>
                  </div>
                </div>
              )}
              {(passport.totalOffsets ?? 0) === 0 && (
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-800/50 border border-slate-700/50 opacity-60">
                  <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                    <Leaf className="w-5 h-5 text-slate-500" />
                  </div>
                  <p className="text-sm text-slate-400">Head to the Marketplace to unlock verified impact achievements.</p>
                </div>
              )}
            </div>
          </Card>

          {/* Climate Impact Summary */}
          <Card>
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-emerald-400" />
              Climate Impact Summary
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Cumulative Footprint', value: `${Math.round(passport.cumulativeFootprint ?? 0).toLocaleString()} kg`, sub: 'CO₂e since onboarding' },
                { label: 'Total Offsets', value: `${Math.round(passport.totalOffsets ?? 0).toLocaleString()} kg`, sub: 'CO₂e neutralized', green: true },
                { label: 'Net Footprint', value: `${Math.round(passport.netFootprint ?? 0).toLocaleString()} kg`, sub: 'remaining to offset', bold: true },
              ].map(item => (
                <div key={item.label} className={`p-4 rounded-2xl ${item.green ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-slate-800/50'}`}>
                  <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{item.label}</p>
                  <p className={`text-xl font-bold ${item.green ? 'text-emerald-400' : item.bold ? gradeColor : 'text-white'}`}>{item.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.sub}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Purchase History */}
          <Card>
            <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-400" />
              Offset Purchase History
            </h3>
            {!purchases || purchases.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-slate-700/50 rounded-2xl">
                <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">No purchases yet. Visit the Marketplace to start offsetting.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {purchases.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-slate-800/40 border border-slate-700/40">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <Leaf className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{p.project?.title ?? 'Offset Project'}</p>
                        <p className="text-xs text-slate-500">
                          {p.project?.region} · {new Date(p.transactionDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-400">{p.creditsCount}t</p>
                      <p className="text-xs text-slate-500">${p.totalCost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}

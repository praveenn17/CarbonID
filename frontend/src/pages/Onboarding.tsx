import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchApi } from '../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { Leaf, Globe, Zap, Car, Utensils, Plane, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Onboarding() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    country: 'United States',
    lifestylePreference: 'Average',
    transportHabits: 'Mostly Car (Petrol/Diesel)',
    electricityEstimate: 300,
    dietPreference: 'Omnivore',
    travelFrequency: 'Average (2-3 Flights/yr)',
  });

  // ── Guard: redirect if onboarding already complete ────────────────────
  // Uses enabled:false initially, then refetch — avoids double request on mount
  const { isLoading: checkingOnboarding } = useQuery({
    queryKey: ['onboardingCheck'],
    queryFn: () => fetchApi('/onboarding'),
    retry: false,
    onSuccess: () => {
      // User already has onboarding data → send to dashboard
      navigate('/dashboard', { replace: true });
    },
    // onError means 404 → not onboarded yet → stay on page (do nothing)
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => {
    const { name, value } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: name === 'electricityEstimate' ? Number(value) : value,
    }));
  };

  const handleComplete = async () => {
    setLoading(true);
    setError('');
    try {
      await fetchApi('/onboarding/complete', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      await fetchApi('/carbon-score/recalculate', { method: 'POST' });
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  };

  if (checkingOnboarding) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const fields = [
    {
      name: 'country',
      label: 'Country of Residence',
      icon: Globe,
      type: 'select' as const,
      options: [
        'United States', 'United Kingdom', 'Canada', 'Australia',
        'Germany', 'France', 'India', 'China', 'Brazil', 'Other',
      ],
    },
    {
      name: 'lifestylePreference',
      label: 'General Lifestyle',
      icon: Leaf,
      type: 'select' as const,
      options: ['Low-Impact', 'Average', 'High-Impact'],
      hint: 'How consciously do you try to reduce your footprint?',
    },
    {
      name: 'electricityEstimate',
      label: 'Monthly Electricity Usage',
      icon: Zap,
      type: 'number' as const,
      placeholder: 'e.g. 300',
      suffix: 'kWh / month',
      hint: 'Check your electricity bill or estimate.',
    },
    {
      name: 'transportHabits',
      label: 'Primary Transport',
      icon: Car,
      type: 'select' as const,
      options: [
        'Mostly Car (Petrol/Diesel)',
        'Mostly Car (EV)',
        'Public Transit',
        'Walking/Cycling',
      ],
    },
    {
      name: 'dietPreference',
      label: 'Diet Type',
      icon: Utensils,
      type: 'select' as const,
      options: ['Omnivore', 'Pescatarian', 'Vegetarian', 'Vegan'],
    },
    {
      name: 'travelFrequency',
      label: 'Annual Flight Frequency',
      icon: Plane,
      type: 'select' as const,
      options: [
        'Rare (0-1 Flights/yr)',
        'Average (2-3 Flights/yr)',
        'Frequent (4+ Flights/yr)',
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-500/15 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="w-full max-w-lg relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 mb-5 shadow-lg shadow-emerald-500/30">
            <Leaf className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Set Up Your Carbon Profile
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Answer 6 questions to generate your baseline footprint and carbon grade.
          </p>
        </div>

        {/* Form card */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-3xl p-8 shadow-2xl">
          {error && (
            <div className="mb-5 bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div className="space-y-5">
            {fields.map((field) => {
              const Icon = field.icon;
              const fieldValue = form[field.name as keyof typeof form];

              return (
                <div key={field.name}>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-1.5">
                    <Icon className="w-4 h-4 text-emerald-400" />
                    {field.label}
                    {field.suffix && (
                      <span className="ml-auto text-xs text-slate-500 font-normal">
                        {field.suffix}
                      </span>
                    )}
                  </label>

                  {field.type === 'select' ? (
                    <select
                      name={field.name}
                      value={String(fieldValue)}
                      onChange={handleChange}
                      className="w-full bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    >
                      {field.options!.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      name={field.name}
                      value={Number(fieldValue)}
                      onChange={handleChange}
                      min={0}
                      step={10}
                      placeholder={field.placeholder}
                      className="w-full bg-slate-800/70 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                    />
                  )}

                  {field.hint && (
                    <p className="text-xs text-slate-500 mt-1">{field.hint}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress indicator */}
          <div className="mt-6 flex items-center gap-2 text-xs text-slate-500">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            All fields required to generate an accurate baseline
          </div>

          <button
            onClick={handleComplete}
            disabled={loading || form.electricityEstimate < 0}
            className="mt-5 group w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 transition-all duration-200 shadow-lg shadow-emerald-500/20"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Calculating your baseline…
              </>
            ) : (
              <>
                Generate My Carbon Passport
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

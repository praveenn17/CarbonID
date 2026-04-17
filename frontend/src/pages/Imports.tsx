import React, { useState, useRef } from 'react';
import MainLayout from '../components/layout/MainLayout';
import { Card } from '../components/ui/Card';
import {
  Loader2,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../store/authStore';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export default function Imports() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [importSummary, setImportSummary] = useState<{
    rowsProcessed: number;
    rowsSkipped: number;
    emissionEntriesCreated: number;
  } | null>(null);
  const { token } = useAuthStore();

  const { data: history, isLoading } = useQuery({
    queryKey: ['importsHistory'],
    queryFn: () => fetchApi('/imports/history'),
  });

  const uploadMutation = useMutation({
    mutationFn: async (uploadFile: File) => {
      const formData = new FormData();
      formData.append('file', uploadFile);

      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${API_URL}/imports/csv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to process CSV file');
      }

      return res.json();
    },

    onSuccess: (data) => {
      fetchApi('/carbon-score/recalculate', { method: 'POST' }).finally(() => {
        queryClient.invalidateQueries({ queryKey: ['importsHistory'] });
        queryClient.invalidateQueries({ queryKey: ['emissions'] });
        queryClient.invalidateQueries({ queryKey: ['emissionSummary'] });
        queryClient.invalidateQueries({ queryKey: ['carbonScore'] });
        queryClient.invalidateQueries({ queryKey: ['scoreHistory'] });
        queryClient.invalidateQueries({ queryKey: ['passport'] });
        queryClient.invalidateQueries({ queryKey: ['insights'] });
      });

      setFile(null);
      setErrorMsg('');

      setImportSummary({
        rowsProcessed: data.rowsProcessed || 0,
        rowsSkipped: data.rowsSkipped || 0,
        emissionEntriesCreated: data.emissionEntriesCreated || 0,
      });

      toast.success(
        `Imported ${data.rowsProcessed} transaction${data.rowsProcessed === 1 ? '' : 's'}`
      );

      if (data.rowsSkipped > 0) {
        toast.success(
          `${data.rowsSkipped} duplicate${data.rowsSkipped === 1 ? '' : 's'} skipped`
        );
      }

      if (data.emissionEntriesCreated > 0) {
        toast.success(
          `Generated ${data.emissionEntriesCreated} emission entr${data.emissionEntriesCreated === 1 ? 'y' : 'ies'
          }`
        );
      }
    },

    onError: (err: any) => {
      setErrorMsg(err.message);
      toast.error(err.message || 'Failed to process CSV file');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setErrorMsg('');
    }
  };

  return (
    <MainLayout
      title="Data Imports"
      subtitle="Upload transaction statements to automatically estimate impact"
    >
      <Card className="mb-8 p-1">
        <div className="bg-slate-900 rounded-2xl p-6 sm:p-10 border border-slate-800">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="md:w-1/2 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30 mb-2">
                <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
              </div>
              <h2 className="text-xl font-bold text-white">Import Expenses</h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                CarbonID can securely analyze your CSV expense reports. Our
                ML-based keyword mapping will estimate the carbon impact of your
                purchases automatically, grouping them into Utilities,
                Transport, Food, Travel, and Shopping.
              </p>

              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 mt-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Expected CSV Format
                </h4>
                <div className="font-mono text-xs text-indigo-300 bg-slate-900 p-2 rounded">
                  Date, Description, Amount
                  <br />
                  2026-04-12, Uber Ride, 15.50
                  <br />
                  2026-04-14, Grocery Store, 45.20
                </div>
              </div>
            </div>

            <div className="md:w-1/2 w-full">
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${file
                    ? 'border-indigo-500 bg-indigo-500/5'
                    : 'border-slate-700 hover:border-slate-500 bg-slate-900'
                  }`}
              >
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />

                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
                    </div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>

                    <button
                      onClick={() => setFile(null)}
                      className="text-xs text-rose-400 hover:text-rose-300 mt-2 hover:underline"
                    >
                      Remove file
                    </button>

                    <button
                      onClick={() => uploadMutation.mutate(file)}
                      disabled={uploadMutation.isPending}
                      className="mt-4 bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex items-center gap-2"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          Upload & Analyze <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>

                    {errorMsg && (
                      <div className="mt-4 flex items-start gap-2 bg-rose-500/10 text-rose-400 p-3 rounded-lg text-sm text-left">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center">
                      <UploadCloud className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <p className="text-slate-300 font-medium mb-1">
                        Drag and drop your CSV here
                      </p>
                      <p className="text-slate-500 text-sm mb-4">
                        or click to browse from your computer
                      </p>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl font-medium transition-colors text-sm border border-slate-700"
                      >
                        Select File
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {importSummary && (
        <Card className="mb-8 p-6 border-slate-800">
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/10 via-slate-900 to-slate-900 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Import Summary</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Transactions Imported
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  {importSummary.rowsProcessed}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Duplicates Skipped
                </div>
                <div className="text-2xl font-bold text-yellow-400">
                  {importSummary.rowsSkipped}
                </div>
              </div>

              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                  Emissions Generated
                </div>
                <div className="text-2xl font-bold text-indigo-400">
                  {importSummary.emissionEntriesCreated}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
        Imported Transactions
      </h3>

      <Card className="overflow-hidden p-0 border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300 min-w-[700px]">
            <thead className="bg-slate-900 border-b border-slate-800 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-4 font-semibold rounded-tl-xl">Date</th>
                <th className="px-6 py-4 font-semibold">Description</th>
                <th className="px-6 py-4 font-semibold">Amount</th>
                <th className="px-6 py-4 font-semibold">Category</th>
                <th className="px-6 py-4 font-semibold rounded-tr-xl flex items-center gap-1">
                  Est. Impact{' '}
                  <span className="text-emerald-500 normal-case">
                    (kg CO₂e)
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-8 text-center text-slate-500"
                  >
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading history...
                  </td>
                </tr>
              ) : history && history.length > 0 ? (
                history.map((tx: any) => (
                  <tr
                    key={tx.id}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-slate-400">
                      {new Date(tx.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-200">
                      {tx.description}
                    </td>
                    <td className="px-6 py-4">${tx.amount.toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                        {tx.detectedCategory}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-emerald-400">
                      {tx.estimatedCo2e > 0 ? `+${tx.estimatedCo2e}` : '0'}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-slate-500"
                  >
                    No imported transactions found. Upload a file above to get
                    started.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </MainLayout>
  );
}
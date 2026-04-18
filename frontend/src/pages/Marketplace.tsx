import MainLayout from '../components/layout/MainLayout';
import { Card } from '../components/ui/Card';
import {
  Leaf, ShieldCheck, CheckCircle2, TrendingDown,
  Minus, Plus, CreditCard, AlertCircle, Loader2, XCircle, Clock, FileText, Download
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../store/authStore';
import { useAuthStore } from '../store/authStore';

// Razorpay global is loaded via CDN in index.html
declare const Razorpay: any;

// ── Types ─────────────────────────────────────────────────────────────────────
type CheckoutState = 'idle' | 'creating' | 'paying' | 'verifying' | 'success' | 'error';

interface CheckoutStatus {
  state: CheckoutState;
  message?: string;
  paymentOrderId?: string;
}

// ── Razorpay modal helper ─────────────────────────────────────────────────────
function openRazorpayModal(
  orderData: {
    keyId: string;
    razorpayOrderId: string;
    amountPaise: number;
    currency: string;
    projectTitle: string;
  },
  userName: string,
  onSuccess: (response: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string }) => void,
  onDismiss: () => void,
  onFailure: (error: any) => void,
) {
  const rzp = new Razorpay({
    key: orderData.keyId,
    amount: orderData.amountPaise,
    currency: orderData.currency,
    order_id: orderData.razorpayOrderId,
    name: 'CarbonID',
    description: `Offset: ${orderData.projectTitle}`,
    image: '/favicon.svg',
    prefill: { name: userName },
    theme: { color: '#10b981' },
    handler: (response: any) => {
      onSuccess({
        razorpayPaymentId: response.razorpay_payment_id,
        razorpayOrderId: response.razorpay_order_id,
        razorpaySignature: response.razorpay_signature,
      });
    },
    modal: {
      ondismiss: onDismiss,
      escape: true,
    },
  });

  // Catch frontend failure events directly from the modal
  rzp.on('payment.failed', function (response: any) {
    onFailure(response.error);
  });

  rzp.open();
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Marketplace() {
  const queryClient = useQueryClient();
  const { user, token } = useAuthStore();

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Per-project checkout status map
  const [checkouts, setCheckouts] = useState<Record<string, CheckoutStatus>>({});

  const { data: projects, isLoading, isError: projectsError } = useQuery({
    queryKey: ['projects'],
    queryFn: () => fetchApi('/projects'),
  });

  const { data: passport } = useQuery({
    queryKey: ['passport'],
    queryFn: () => fetchApi('/passport/me'),
  });

  const { data: ordersHistory } = useQuery({
    queryKey: ['paymentOrders'],
    queryFn: () => fetchApi('/payments/orders'),
  });

  const getQty = (id: string) => quantities[id] ?? 1;
  const setQty = (id: string, val: number, max?: number) =>
    setQuantities(q => ({ ...q, [id]: Math.min(max ?? Infinity, Math.max(1, val)) }));

  const setCheckout = (projectId: string, status: CheckoutStatus) =>
    setCheckouts(c => ({ ...c, [projectId]: status }));

  const netFootprint = passport?.netFootprint ?? 0;

  const handleDownloadReceipt = async (orderId: string) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || '/api';
      const response = await fetch(`${API_URL}/payments/${orderId}/receipt`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Could not generate receipt');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CarbonID_Receipt_${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Download failed');
    }
  };

  // ── Full payment flow ───────────────────────────────────────────────────────
  const handleBuy = async (project: any, creditsCount: number) => {
    const projectId = project.id;

    // 1. Create order on our backend
    setCheckout(projectId, { state: 'creating' });
    let orderData: any;
    try {
      orderData = await fetchApi('/payments/create-order', {
        method: 'POST',
        body: JSON.stringify({ projectId, creditsCount }),
      });
      queryClient.invalidateQueries({ queryKey: ['paymentOrders'] }); // Refresh to show new 'pending' order
    } catch (err: any) {
      setCheckout(projectId, { state: 'error', message: err.message || 'Could not create order' });
      return;
    }

    // 2. Open Razorpay modal
    setCheckout(projectId, { state: 'paying' });
    openRazorpayModal(
      orderData,
      user?.fullName || 'CarbonID User',
      // ── onSuccess: user completed payment in modal ──────────────────────────
      async (razorpayResponse) => {
        setCheckout(projectId, { state: 'verifying' });
        try {
          await fetchApi('/payments/verify', {
            method: 'POST',
            body: JSON.stringify({
              paymentOrderId: orderData.paymentOrderId,
              razorpayOrderId: razorpayResponse.razorpayOrderId,
              razorpayPaymentId: razorpayResponse.razorpayPaymentId,
              razorpaySignature: razorpayResponse.razorpaySignature,
            }),
          });
          setCheckout(projectId, { state: 'success', paymentOrderId: orderData.paymentOrderId });
          // Refresh all relevant data
          queryClient.invalidateQueries({ queryKey: ['passport'] });
          queryClient.invalidateQueries({ queryKey: ['projects'] });
          queryClient.invalidateQueries({ queryKey: ['carbonScore'] });
          queryClient.invalidateQueries({ queryKey: ['purchaseHistory'] });
          queryClient.invalidateQueries({ queryKey: ['paymentOrders'] });
          setTimeout(() => setCheckout(projectId, { state: 'idle' }), 6000); // 6s to allow receipt download
        } catch (err: any) {
          setCheckout(projectId, {
            state: 'error',
            message: err.message || 'Payment verification failed',
          });
        }
      },
      // ── onDismiss: user closed the modal without paying ─────────────────────
      () => {
        setCheckout(projectId, { state: 'idle' });
        // The order remains 'pending' in the DB until webhook or timeout. We can refresh the list.
        queryClient.invalidateQueries({ queryKey: ['paymentOrders'] });
      },
      // ── onFailure: payment attempt failed within the modal ─────────────────
      async (errorData) => {
        setCheckout(projectId, {
          state: 'error',
          message: 'Payment failed. Test mode note: some underlying banks simulator failures. Try UPI or the test card instead.',
        });
        try {
          await fetchApi('/payments/fail', {
            method: 'POST',
            body: JSON.stringify({ paymentOrderId: orderData.paymentOrderId, errorData }),
          });
          queryClient.invalidateQueries({ queryKey: ['paymentOrders'] });
        } catch (e) {
          console.error('Failed to log payment failure', e);
        }
      }
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <MainLayout
      title="Offset Marketplace"
      subtitle="Fund verified climate projects to neutralize your footprint."
    >
      {/* Hero banner */}
      <div className="mb-8">
        <Card className="bg-gradient-to-r from-emerald-900/50 to-slate-900 grid md:grid-cols-2 gap-6 items-center border-emerald-500/20">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-sm font-medium border border-emerald-500/20 mb-4">
              <TrendingDown className="w-4 h-4" />
              Net Zero Goal
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              You have <span className="text-emerald-400">{Math.round(netFootprint)} kg</span> CO₂e to neutralize.
            </h2>
            <p className="text-slate-400 text-sm">
              Select a project, choose your quantity, and complete a secure Razorpay checkout.
              Offsets are applied to your passport <strong className="text-slate-300">only after payment is verified</strong>.
            </p>
          </div>
          <div className="hidden md:flex justify-end opacity-30">
            <Leaf className="w-40 h-40 text-emerald-500" />
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          All projects carry validated registry verification. Payments secured by Razorpay.
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* Loading skeletons */}
        {isLoading && [1, 2, 3].map(i => (
          <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-3xl h-[480px] animate-pulse" />
        ))}

        {/* Error state */}
        {projectsError && (
          <div className="col-span-full flex flex-col items-center justify-center py-20 border border-dashed border-rose-700/50 rounded-3xl bg-rose-500/5">
            <AlertCircle className="w-10 h-10 text-rose-400 mb-4 opacity-50" />
            <h3 className="text-xl font-bold text-rose-400 mb-2">Failed to load projects</h3>
            <p className="text-slate-500">Please try again later.</p>
          </div>
        )}

        {/* Project cards */}
        {!isLoading && !projectsError && projects?.map((project: any) => {
          const qty = getQty(project.id);
          const costUSD = (qty * project.pricePerCredit).toFixed(2);
          const costINR = (qty * project.pricePerCredit * 83).toFixed(0);
          const checkout = checkouts[project.id] ?? { state: 'idle' };

          const isDisabled = checkout.state !== 'idle' && checkout.state !== 'error';

          return (
            <div
              key={project.id}
              className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden group hover:border-emerald-500/40 transition-all duration-300 flex flex-col"
            >
              {/* Image */}
              <div className="h-44 overflow-hidden relative">
                <img
                  src={project.imageUrl}
                  alt={project.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                />
                <div className="absolute top-3 left-3">
                  <span className="bg-slate-900/80 backdrop-blur text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-700 text-slate-200">
                    {project.region}
                  </span>
                </div>
                <div className="absolute top-3 right-3">
                  <span className="bg-emerald-500/20 backdrop-blur text-xs font-semibold px-2.5 py-1 rounded-lg border border-emerald-500/30 text-emerald-300">
                    {project.availableCredits.toLocaleString()} t left
                  </span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">{project.registryType}</span>
                </div>

                <h3 className="text-base font-bold text-white leading-snug">{project.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed line-clamp-3 flex-1">{project.description}</p>

                {/* Price + Quantity row */}
                <div className="flex items-center justify-between mt-1">
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Price / tonne</div>
                    <div className="text-xl font-bold text-white">${project.pricePerCredit.toFixed(2)}</div>
                  </div>

                  {/* Qty stepper — capped at available credits */}
                  <div className="flex items-center gap-2 bg-slate-800 rounded-xl px-1 py-1">
                    <button
                      onClick={() => setQty(project.id, qty - 1, project.availableCredits)}
                      disabled={qty <= 1 || isDisabled}
                      className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors disabled:opacity-40"
                    >
                      <Minus className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                    <span className="text-sm font-bold text-white w-6 text-center">{qty}</span>
                    <button
                      onClick={() => setQty(project.id, qty + 1, project.availableCredits)}
                      disabled={qty >= project.availableCredits || isDisabled}
                      className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center transition-colors disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5 text-slate-300" />
                    </button>
                  </div>
                </div>

                {/* Total cost row */}
                <div className="flex items-center justify-between text-xs text-slate-500 -mt-1">
                  <span>Total</span>
                  <span className="font-semibold text-slate-300">${costUSD} ≈ ₹{costINR}</span>
                </div>

                {/* Extended Error display */}
                {checkout.state === 'error' && (
                  <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-900/80 border border-rose-500/30 text-rose-400 text-xs text-left">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span className="leading-relaxed font-medium">{checkout.message}</span>
                    </div>
                  </div>
                )}

                {/* CTA — state-aware */}
                {checkout.state === 'success' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-sm">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      Passport updated!
                    </div>
                    {checkout.paymentOrderId && (
                      <button
                        onClick={() => handleDownloadReceipt(checkout.paymentOrderId as string)}
                        className="flex items-center justify-center gap-2 py-2 rounded-xl text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 transition-colors text-xs font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Download PDF Receipt
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    disabled={isDisabled}
                    onClick={() => handleBuy(project, qty)}
                    className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all shadow-lg flex items-center justify-center gap-2
                      ${checkout.state === 'error'
                        ? 'bg-slate-700 hover:bg-slate-600 shadow-none'
                        : 'bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 shadow-emerald-500/20'}`}
                  >
                    {checkout.state === 'creating' && <><Loader2 className="w-4 h-4 animate-spin" /> Creating order…</>}
                    {checkout.state === 'paying' && <><CreditCard className="w-4 h-4" /> Waiting for payment…</>}
                    {checkout.state === 'verifying' && <><Loader2 className="w-4 h-4 animate-spin" /> Verifying payment…</>}
                    {(checkout.state === 'idle' || checkout.state === 'error') && (
                      <>
                        <CreditCard className="w-4 h-4" />
                        {checkout.state === 'error' ? 'Retry Payment' : `Pay ${qty}t · ₹${costINR}`}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Order history section */}
      <div className="mt-12">
        <h3 className="text-xl font-bold text-white flex items-center gap-2 mb-6">
          <CreditCard className="text-emerald-400 w-5 h-5" />
          Recent Payment Attempts
        </h3>

        {ordersHistory && ordersHistory.length > 0 ? (
          <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
            {ordersHistory.slice(0, 5).map((order: any, idx: number) => {
              const costUSD = ((order.amountPaise / 100) / 83).toFixed(2);
              return (
                <div key={order.id} className={`flex items-center justify-between p-4 ${idx !== 0 ? 'border-t border-slate-800/50' : ''}`}>
                  <div className="flex items-center gap-3">
                    {order.status === 'success' && <CheckCircle2 className="w-8 h-8 text-emerald-500 p-1.5 bg-emerald-500/10 rounded-full" />}
                    {order.status === 'failed' && <XCircle className="w-8 h-8 text-rose-500 p-1.5 bg-rose-500/10 rounded-full" />}
                    {order.status === 'pending' && <Clock className="w-8 h-8 text-amber-500 p-1.5 bg-amber-500/10 rounded-full" />}
                    <div>
                      <p className="text-sm font-semibold text-white">{order.project?.title || 'Unknown Project'}</p>
                      <p className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-200">${costUSD}</p>
                      <p className={`text-xs font-semibold capitalize ${order.status === 'success' ? 'text-emerald-400' :
                          order.status === 'failed' ? 'text-rose-400' : 'text-amber-400'
                        }`}>
                        {order.status}
                      </p>
                    </div>
                    {order.status === 'success' && (
                      <button
                        onClick={() => handleDownloadReceipt(order.id)}
                        title="Download Receipt"
                        className="p-2 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border border-slate-800 border-dashed rounded-2xl text-slate-500 text-sm">
            No payment history yet.
          </div>
        )}
      </div>

    </MainLayout>
  );
}

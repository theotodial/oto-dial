import { useState, useEffect } from 'react';
import API from '../api';

const CreditCardIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
  </svg>
);

const GlobeIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const LockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const DollarIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const creditAmounts = [
  { value: 5, label: '$5', badge: null },
  { value: 10, label: '$10', badge: null },
  { value: 20, label: '$20', badge: 'Most Popular', badgeColor: 'bg-green-500' },
  { value: 50, label: '$50', badge: '5% Free', badgeColor: 'bg-yellow-500' },
  { value: 100, label: '$100', badge: '10% Free', badgeColor: 'bg-yellow-500' },
];

const benefits = [
  { icon: GlobeIcon, text: 'International calls to any country without restrictions.' },
  { icon: ShieldIcon, text: 'Our service works in all countries, no restrictions.' },
  { icon: LockIcon, text: "Privacy first. We don't store your payment information." },
  { icon: CreditCardIcon, text: 'Credit based, no subscription. Pay only for what you use.' },
  { icon: DollarIcon, text: 'No phone number required. Start calling immediately.' },
];

function Billing() {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [customAmount, setCustomAmount] = useState('');
  const [autoTopUp, setAutoTopUp] = useState(false);
  const [taxInvoice, setTaxInvoice] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const user_id = localStorage.getItem('user_id');

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    if (!user_id) {
      setLoading(false);
      return;
    }

    try {
      const response = await API.get(`/api/wallet/${user_id}`);
      setBalance(response.data.balance);
    } catch (err) {
      console.error('Failed to fetch balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAmountSelect = (amount) => {
    setSelectedAmount(amount);
    setCustomAmount('');
  };

  const handleCustomAmountChange = (e) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    setCustomAmount(value);
    if (value) {
      setSelectedAmount(null);
    }
  };

  const getFinalAmount = () => {
    if (customAmount) {
      return parseInt(customAmount) || 0;
    }
    return selectedAmount || 0;
  };

  const handleCheckout = async () => {
    const amount = getFinalAmount();
    
    if (amount < 5) {
      setError('Minimum deposit amount is $5');
      return;
    }

    setProcessing(true);
    setError('');
    setSuccess('');

    try {
      await API.post('/api/wallet/topup', {
        user_id: parseInt(user_id),
        amount: amount
      });

      setSuccess(`Successfully added $${amount} to your wallet!`);
      await fetchBalance();
      setCustomAmount('');
      setSelectedAmount(20);
      setTimeout(() => setSuccess(''), 5000);
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.response?.data?.error || 
        'Failed to process payment'
      );
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-white">
      <div className="max-w-6xl mx-auto p-6 lg:p-8">
        {/* Wallet Balance Card */}
        <div className="mb-8 bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm mb-1">Current Wallet Balance</p>
              <p className="text-4xl font-bold text-white">${balance !== null ? balance.toFixed(2) : '0.00'}</p>
            </div>
            <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center text-white">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Section - Credit Selection */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-gray-200 dark:border-slate-700">
              {/* Header */}
              <div className="flex items-center space-x-3 mb-6">
                <CreditCardIcon />
                <h2 className="text-xl font-semibold">Select Your Credit Amount</h2>
              </div>

              {/* Enterprise Banner */}
              <div className="bg-gray-100 dark:bg-slate-700/50 rounded-xl p-4 mb-6 flex items-center justify-between">
                <span className="text-gray-600 dark:text-gray-300">Need OTO-DIAL for the team?</span>
                <button className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors">
                  See enterprise plans
                </button>
              </div>

              {/* Info text */}
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                Your credits are used to make international calls at competitive rates.{' '}
                <a href="#" className="text-green-600 dark:text-green-400 hover:underline">View our detailed rate calculator →</a>
              </p>

              {/* Alerts */}
              {error && (
                <div className="mb-4 px-4 py-3 bg-red-100 dark:bg-red-500/20 border border-red-300 dark:border-red-500/50 text-red-700 dark:text-red-400 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 px-4 py-3 bg-green-100 dark:bg-green-500/20 border border-green-300 dark:border-green-500/50 text-green-700 dark:text-green-400 rounded-xl text-sm flex items-center">
                  <CheckIcon />
                  <span className="ml-2">{success}</span>
                </div>
              )}

              {/* Amount Selection */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Choose Amount (USD)*
                </label>
                <div className="grid grid-cols-5 gap-3">
                  {creditAmounts.map((amount) => (
                    <button
                      key={amount.value}
                      onClick={() => handleAmountSelect(amount.value)}
                      className={`
                        relative py-4 px-2 rounded-xl border-2 font-semibold transition-all
                        ${selectedAmount === amount.value && !customAmount
                          ? 'border-green-500 bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400'
                          : 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white hover:border-gray-400 dark:hover:border-slate-500'
                        }
                      `}
                    >
                      {amount.badge && (
                        <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 ${amount.badgeColor} text-white text-[10px] font-medium rounded-full whitespace-nowrap`}>
                          {amount.badge}
                        </span>
                      )}
                      {amount.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Or enter custom amount (minimum $5)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="text"
                    value={customAmount}
                    onChange={handleCustomAmountChange}
                    placeholder="20"
                    className="w-full pl-8 pr-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl
                               text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-green-500
                               transition-colors"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-4 mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoTopUp}
                    onChange={(e) => setAutoTopUp(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-green-500 
                               focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Enable Auto Top-up{' '}
                    <span className="text-green-600 dark:text-green-400 text-sm">Avoid interrupting an important call</span>
                  </span>
                </label>

                <label className="flex items-center space-x-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={taxInvoice}
                    onChange={(e) => setTaxInvoice(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-green-500 
                               focus:ring-green-500 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="text-gray-700 dark:text-gray-300">
                    Issue tax-deductible invoice (address required)
                  </span>
                </label>
              </div>

              {/* Promo Code */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Promo Code (Optional)
                </label>
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="Enter promo code"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-xl
                             text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-green-500
                             transition-colors"
                />
              </div>

              {/* Minutes info */}
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-300 mb-6">
                <PhoneIcon />
                <span>Up to <strong className="text-gray-900 dark:text-white">1,000 minutes</strong> of international calling time</span>
              </div>

              {/* Checkout Button */}
              <button
                onClick={handleCheckout}
                disabled={processing || getFinalAmount() < 5}
                className={`
                  w-full py-4 rounded-xl font-semibold text-lg transition-all
                  ${processing || getFinalAmount() < 5
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/25'
                  }
                `}
              >
                {processing ? (
                  <span className="flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Processing...
                  </span>
                ) : (
                  `Secure Checkout - $${getFinalAmount()}`
                )}
              </button>

              {/* Guarantee */}
              <div className="mt-4 flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                <CheckIcon />
                <span className="ml-2 text-green-600 dark:text-green-400">100% Money Back Guarantee. No Questions Asked.</span>
              </div>

              <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-4">
                *VAT may be added depending on your country and payment method
              </p>
            </div>
          </div>

          {/* Right Section - Why OTO-DIAL */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-slate-800/50 rounded-2xl p-6 border border-gray-200 dark:border-slate-700 sticky top-6">
              <h3 className="text-xl font-semibold mb-6">
                Why <span className="text-green-600 dark:text-green-400 italic">OTO-DIAL</span>
              </h3>

              <div className="space-y-5">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0 text-green-600 dark:text-green-400">
                      <benefit.icon />
                    </div>
                    <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">{benefit.text}</p>
                  </div>
                ))}
              </div>

              {/* Testimonial */}
              <div className="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
                <p className="text-gray-500 dark:text-gray-400 text-sm italic mb-3">
                  "After Skype announced they were shutting down, I've been looking for an alternative for ages. I'm so glad I found OTO-DIAL!"
                </p>
                <p className="text-green-600 dark:text-green-400 text-sm font-medium">- Michael T., Canada</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Billing;

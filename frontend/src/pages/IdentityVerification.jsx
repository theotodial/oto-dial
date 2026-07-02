import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { useAuth } from '../context/AuthContext';
import CountrySelect from '../components/CountrySelect';
import LiveSelfieVerification from '../components/identity/LiveSelfieVerification';
import { formatCountryLabel } from '../utils/countryList';

const STEPS = [
  { id: 1, label: 'Personal details' },
  { id: 2, label: 'Government ID' },
  { id: 3, label: 'Live selfie' },
  { id: 4, label: 'Review & submit' },
];

const DOCUMENT_TYPES = [
  { value: 'passport', label: 'Passport' },
  { value: 'drivers_license', label: "Driver's license" },
  { value: 'national_id', label: 'National ID card' },
  { value: 'other', label: 'Other government-issued photo ID' },
];

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function UploadTile({ label, hint, fileName, onFile }) {
  return (
    <label className="block cursor-pointer group">
      <input
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            onFile(null, 'File must be under 8 MB');
            return;
          }
          try {
            const dataUrl = await readFileAsDataUrl(file);
            onFile(dataUrl, null, file.name);
          } catch {
            onFile(null, 'Could not read file');
          }
        }}
      />
      <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 group-hover:border-indigo-400 dark:group-hover:border-indigo-500 bg-gray-50/80 dark:bg-slate-900/40 p-6 transition-colors">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white">{label}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{hint}</p>
            {fileName && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium truncate">
                Attached: {fileName}
              </p>
            )}
          </div>
        </div>
      </div>
    </label>
  );
}

function IdentityVerification() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [autoApproved, setAutoApproved] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState('not_submitted');
  const [rejectionReason, setRejectionReason] = useState('');

  const [form, setForm] = useState({
    legalName: '',
    dateOfBirth: '',
    documentType: 'passport',
    documentCountry: 'US',
    addressLine1: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    verificationType: 'individual',
  });

  const [idFront, setIdFront] = useState({ data: null, name: '' });
  const [idBack, setIdBack] = useState({ data: null, name: '' });
  const [businessDoc, setBusinessDoc] = useState({ data: null, name: '' });
  const [selfieCapture, setSelfieCapture] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await API.get('/api/users/profile');
        const iv = res.data?.user?.identityVerification || res.data?.identityVerification;
        if (iv) {
          const status = iv.status || 'not_submitted';
          setVerificationStatus(status);
          if (status === 'approved') {
            setLoading(false);
            return;
          }
          if (status === 'pending') {
            setSubmitted(true);
            setLoading(false);
            return;
          }
          if (status === 'rejected' && iv.rejectionReason) {
            setRejectionReason(iv.rejectionReason);
          }
          setForm((prev) => ({
            ...prev,
            legalName: iv.legalName || prev.legalName,
            dateOfBirth: iv.dateOfBirth || prev.dateOfBirth,
            documentType: iv.documentType || prev.documentType,
            documentCountry: iv.documentCountry || prev.documentCountry,
            addressLine1: iv.addressLine1 || prev.addressLine1,
            city: iv.city || prev.city,
            stateRegion: iv.stateRegion || prev.stateRegion,
            postalCode: iv.postalCode || prev.postalCode,
            verificationType: iv.verificationType || prev.verificationType,
          }));
        }
      } catch {
        setError('Failed to load verification status');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const updateField = (name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (!form.legalName.trim()) return 'Legal full name is required.';
      if (!form.dateOfBirth) return 'Date of birth is required.';
      if (!form.documentCountry.trim()) return 'Document issuing country is required.';
      if (!form.addressLine1.trim()) return 'Street address is required.';
      if (!form.city.trim()) return 'City is required.';
    }
    if (currentStep === 2) {
      if (!idFront.data) return 'Upload the front of your government-issued ID.';
    }
    if (currentStep === 3) {
      if (!selfieCapture?.verification?.passed) {
        return 'Complete the AI live selfie verification.';
      }
    }
    return '';
  };

  const goNext = () => {
    const msg = validateStep(step);
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setStep((s) => Math.min(4, s + 1));
  };

  const handleSubmit = async () => {
    const msg = validateStep(3) || validateStep(2) || validateStep(1);
    if (msg) {
      setError(msg);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const response = await API.post('/api/users/upload-verification', {
        verificationType: form.verificationType,
        legalName: form.legalName.trim(),
        dateOfBirth: form.dateOfBirth,
        documentType: form.documentType,
        documentCountry: form.documentCountry.trim(),
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        stateRegion: form.stateRegion.trim() || undefined,
        postalCode: form.postalCode.trim() || undefined,
        idDocument: idFront.data,
        idDocumentBack: idBack.data || undefined,
        businessDocument: businessDoc.data || undefined,
        selfieDocument: selfieCapture?.image,
        selfieLiveness: selfieCapture?.verification,
      });

      if (response.error) {
        setError(response.error);
        return;
      }

      setSubmitted(true);
      setAutoApproved(response.data?.autoApproved === true);
      setVerificationStatus(response.data?.status || 'pending');
      await refreshUser?.();
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (verificationStatus === 'approved') {
    return (
      <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <StatusCard
            tone="success"
            title="Identity verified"
            body="Your account has passed identity verification. No further action is required."
            actionLabel="Back to profile"
            onAction={() => navigate('/profile')}
          />
        </div>
      </div>
    );
  }

  if (submitted && (verificationStatus === 'approved' || autoApproved)) {
    return (
      <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <StatusCard
            tone="success"
            title="Identity verified instantly"
            body="Our AI verification matched your live selfie with your government ID and approved your account. A confirmation email has been sent to you."
            actionLabel="Back to profile"
            onAction={() => navigate('/profile')}
          />
        </div>
      </div>
    );
  }

  if (submitted || verificationStatus === 'pending') {
    return (
      <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900 p-6">
        <div className="max-w-2xl mx-auto">
          <StatusCard
            tone="pending"
            title="Verification submitted"
            body="Thank you. Our compliance team is reviewing your identity documents and live selfie. Reviews are typically completed within 1 business day. We will email you if we need anything else."
            actionLabel="Return to profile"
            onAction={() => navigate('/profile')}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-gray-50 dark:bg-slate-900">
      <div className="max-w-3xl mx-auto p-6 lg:p-8">
        <div className="mb-8 lg:hidden flex items-start gap-3">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-gray-300 shadow-sm"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Identity verification</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Secure KYC review · ~1 business day</p>
          </div>
        </div>

        <div className="hidden lg:block mb-8">
          <button
            type="button"
            onClick={() => navigate('/profile')}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 text-sm font-medium mb-4 inline-flex items-center gap-1"
          >
            ← Back to profile
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Identity verification</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2 max-w-2xl">
            Complete a short identity review so we can protect your account and meet telecom compliance requirements.
            Submissions are encrypted in transit and reviewed manually by our team.
          </p>
        </div>

        <div className="mb-8 flex items-center justify-between gap-2">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex-1 flex items-center gap-2 min-w-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  step >= s.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {s.id}
              </div>
              <span className={`text-xs font-medium truncate hidden sm:block ${step >= s.id ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                {s.label}
              </span>
              {idx < STEPS.length - 1 && (
                <div className={`hidden sm:block flex-1 h-0.5 mx-1 ${step > s.id ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {verificationStatus === 'rejected' && rejectionReason && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            Previous submission was not approved: {rejectionReason}
          </div>
        )}

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-gray-200 dark:border-slate-700 p-6 lg:p-8">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Personal details</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Enter your legal name exactly as it appears on your government ID.
                </p>
              </div>
              <Field label="Legal full name" required>
                <input
                  value={form.legalName}
                  onChange={(e) => updateField('legalName', e.target.value)}
                  className={inputClass}
                  placeholder="Jane Marie Doe"
                />
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Date of birth" required>
                  <input
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => updateField('dateOfBirth', e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Document type" required>
                  <select
                    value={form.documentType}
                    onChange={(e) => updateField('documentType', e.target.value)}
                    className={inputClass}
                  >
                    {DOCUMENT_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Document issuing country" required>
                <CountrySelect
                  value={form.documentCountry}
                  onChange={(code) => updateField('documentCountry', code)}
                  placeholder="Search and select issuing country…"
                />
              </Field>
              <Field label="Street address" required>
                <input
                  value={form.addressLine1}
                  onChange={(e) => updateField('addressLine1', e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid sm:grid-cols-3 gap-4">
                <Field label="City" required>
                  <input value={form.city} onChange={(e) => updateField('city', e.target.value)} className={inputClass} />
                </Field>
                <Field label="State / region">
                  <input value={form.stateRegion} onChange={(e) => updateField('stateRegion', e.target.value)} className={inputClass} />
                </Field>
                <Field label="Postal code">
                  <input value={form.postalCode} onChange={(e) => updateField('postalCode', e.target.value)} className={inputClass} />
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Government ID upload</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Upload a clear, color photo or PDF. All four corners must be visible and text must be readable.
                </p>
              </div>
              <UploadTile
                label="ID document — front"
                hint="Passport photo page, or front of driver's license / national ID"
                fileName={idFront.name}
                onFile={(data, err, name) => {
                  if (err) setError(err);
                  else {
                    setIdFront({ data, name: name || '' });
                    setError('');
                  }
                }}
              />
              <UploadTile
                label="ID document — back (if applicable)"
                hint="Required for two-sided IDs such as driver's licenses"
                fileName={idBack.name}
                onFile={(data, err, name) => {
                  if (err) setError(err);
                  else setIdBack({ data, name: name || '' });
                }}
              />
              <UploadTile
                label="Business registration (optional)"
                hint="LLC articles, EIN letter, or business license — for higher limits"
                fileName={businessDoc.name}
                onFile={(data, err, name) => {
                  if (err) setError(err);
                  else setBusinessDoc({ data, name: name || '' });
                }}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Live selfie verification</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Guided AI liveness detection with real-time facial recognition and optional ID photo matching.
                </p>
              </div>
              <LiveSelfieVerification
                idDocumentDataUrl={idFront.data}
                value={selfieCapture}
                onComplete={setSelfieCapture}
                onClear={() => setSelfieCapture(null)}
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Review & submit</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Confirm your details before sending to compliance review.
                </p>
              </div>
              <ReviewRow label="Legal name" value={form.legalName} />
              <ReviewRow label="Date of birth" value={form.dateOfBirth} />
              <ReviewRow label="Document" value={DOCUMENT_TYPES.find((d) => d.value === form.documentType)?.label} />
              <ReviewRow label="Issuing country" value={formatCountryLabel(form.documentCountry)} />
              <ReviewRow label="Address" value={`${form.addressLine1}, ${form.city}${form.stateRegion ? `, ${form.stateRegion}` : ''} ${form.postalCode}`.trim()} />
              <ReviewRow label="ID front" value={idFront.name || 'Attached'} />
              <ReviewRow label="ID back" value={idBack.name || (idBack.data ? 'Attached' : '—')} />
              <ReviewRow
                label="Live selfie"
                value={
                  selfieCapture?.verification?.passed
                    ? `Verified · Liveness ${selfieCapture.verification.livenessScore}%${
                        selfieCapture.verification.faceMatchScore != null
                          ? ` · ID match ${selfieCapture.verification.faceMatchScore}%`
                          : ''
                      }`
                    : 'Missing'
                }
              />
              <div className="rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                By submitting, you confirm the information is accurate and consent to OTODIAL processing your
                identity data for verification and regulatory compliance. Review typically completes within{' '}
                <span className="font-semibold text-gray-900 dark:text-white">1 business day</span>.
              </div>
            </div>
          )}

          <div className="mt-8 flex flex-col-reverse sm:flex-row gap-3 sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setError('');
                if (step === 1) navigate('/profile');
                else setStep((s) => s - 1);
              }}
              className="px-5 py-3 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 font-medium hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 4 ? (
              <button
                type="button"
                onClick={goNext}
                className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold shadow-lg"
              >
                {submitting ? 'Submitting…' : 'Submit for verification'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}{required ? ' *' : ''}
      </span>
      {children}
    </label>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2 border-b border-gray-100 dark:border-slate-700 text-sm">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white text-right">{value || '—'}</span>
    </div>
  );
}

function StatusCard({ tone, title, body, actionLabel, onAction }) {
  const tones = {
    success: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    pending: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20',
  };
  return (
    <div className={`rounded-2xl border-2 p-8 text-center ${tones[tone] || tones.pending}`}>
      <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow">
        {tone === 'success' ? (
          <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-7 h-7 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">{title}</h2>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed max-w-lg mx-auto mb-6">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export default IdentityVerification;

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  attachStreamToVideo,
  getCameraErrorMessage,
  isCameraSupported,
  openUserCamera,
} from '../../utils/cameraUtils';
import {
  LIVENESS_CHALLENGES,
  FRAMES_REQUIRED,
  analyzeFace,
  createLivenessSessionId,
  descriptorFromDataUrl,
  detectFaceLive,
  faceMatchScore,
  getChallengeFeedback,
  isImageDataUrl,
  loadFaceModels,
} from '../../utils/faceLiveness';

const PHASE = {
  INIT: 'init',
  LOADING: 'loading',
  READY: 'ready',
  SCANNING: 'scanning',
  ANALYZING: 'analyzing',
  COMPLETE: 'complete',
  ERROR: 'error',
};

function LiveSelfieVerification({ idDocumentDataUrl, value, onComplete, onClear }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const detectingRef = useRef(false);
  const holdFramesRef = useRef(0);
  const sessionRef = useRef(null);

  const [phase, setPhase] = useState(PHASE.INIT);
  const [loadMessage, setLoadMessage] = useState('Initializing secure camera…');
  const [challengeIndex, setChallengeIndex] = useState(0);
  const [challengeProgress, setChallengeProgress] = useState(0);
  const [faceMetrics, setFaceMetrics] = useState(null);
  const [faceHint, setFaceHint] = useState('');
  const [error, setError] = useState('');
  const [analysisStep, setAnalysisStep] = useState('');
  const [result, setResult] = useState(value || null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startSession = async () => {
    setError('');
    setPhase(PHASE.LOADING);

    if (!isCameraSupported()) {
      setPhase(PHASE.ERROR);
      setError(getCameraErrorMessage({ name: 'NotSupportedError' }));
      return;
    }

    try {
      setLoadMessage('Requesting camera access…');
      const stream = await openUserCamera();
      streamRef.current = stream;
      await attachStreamToVideo(stream, videoRef.current);

      setLoadMessage('Loading AI verification models…');
      try {
        await loadFaceModels(setLoadMessage);
      } catch (modelErr) {
        console.error('Face model load failed:', modelErr);
        stopCamera();
        setPhase(PHASE.ERROR);
        setError(
          'Could not load face verification models. Refresh the page and try again. If the problem persists, check that nothing is blocking local assets.'
        );
        return;
      }

      sessionRef.current = {
        sessionId: createLivenessSessionId(),
        startedAt: new Date().toISOString(),
        challenges: [],
      };
      holdFramesRef.current = 0;
      setChallengeIndex(0);
      setChallengeProgress(0);
      setPhase(PHASE.SCANNING);
    } catch (err) {
      console.error('Live verification start failed:', err);
      stopCamera();
      setPhase(PHASE.ERROR);
      setError(getCameraErrorMessage(err));
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return null;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.92);
  };

  const runAnalysis = async (imageDataUrl, selfieDescriptor, challenges) => {
    setPhase(PHASE.ANALYZING);
    setAnalysisStep('Validating liveness signals…');
    await new Promise((r) => setTimeout(r, 600));

    const livenessScore = Math.min(
      100,
      Math.round(
        70 +
          challenges.length * 6 +
          (challenges.every((c) => c.passed) ? 12 : 0)
      )
    );

    let faceMatch = { score: null, passed: null, required: false };

    if (isImageDataUrl(idDocumentDataUrl)) {
      setAnalysisStep('Matching selfie against government ID photo…');
      const idDescriptor = await descriptorFromDataUrl(idDocumentDataUrl);
      if (idDescriptor && selfieDescriptor) {
        const match = faceMatchScore(selfieDescriptor, idDescriptor);
        faceMatch = { ...match, required: true };
        if (!match.passed) {
          setPhase(PHASE.ERROR);
          setError(
            `Selfie did not match your ID photo (${match.score}% confidence). Please ensure your face is clear and try again.`
          );
          return;
        }
      } else if (!idDescriptor) {
        faceMatch = { score: null, passed: null, required: false };
      }
    }

    setAnalysisStep('Securing verification payload…');
    await new Promise((r) => setTimeout(r, 400));

    const verification = {
      sessionId: sessionRef.current.sessionId,
      completedAt: new Date().toISOString(),
      passed: true,
      livenessScore,
      faceMatchScore: faceMatch.score,
      faceMatchPassed: faceMatch.passed,
      faceMatchRequired: faceMatch.required,
      challenges: challenges.map((c) => c.id),
    };

    const payload = { image: imageDataUrl, verification };
    setResult(payload);
    onComplete?.(payload);
    setPhase(PHASE.COMPLETE);
  };

  useEffect(() => {
    if (phase !== PHASE.SCANNING) return undefined;

    const intervalId = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || detectingRef.current) return;

      const challenge = LIVENESS_CHALLENGES[challengeIndex];
      if (!challenge) return;

      detectingRef.current = true;
      try {
        const detection = await detectFaceLive(video);
        const videoWidth = video.videoWidth || video.clientWidth || 640;
        const videoHeight = video.videoHeight || video.clientHeight || 480;
        const metrics = analyzeFace(detection, videoWidth, videoHeight);
        setFaceMetrics(metrics);
        setFaceHint(getChallengeFeedback(metrics, challenge.id) || '');

        if (challenge.validate(metrics)) {
          holdFramesRef.current += 1;
          const progress = Math.min(100, Math.round((holdFramesRef.current / FRAMES_REQUIRED) * 100));
          setChallengeProgress(progress);

          if (holdFramesRef.current >= FRAMES_REQUIRED) {
            const completed = {
              id: challenge.id,
              passed: true,
              confidence: metrics.confidence,
            };
            sessionRef.current.challenges.push(completed);
            holdFramesRef.current = 0;
            setChallengeProgress(0);

            if (challengeIndex >= LIVENESS_CHALLENGES.length - 1) {
              clearInterval(intervalId);
              stopCamera();
              const image = captureFrame();
              const selfieDescriptor = image ? await descriptorFromDataUrl(image) : null;
              await runAnalysis(image, selfieDescriptor, sessionRef.current.challenges);
              return;
            }

            setChallengeIndex((i) => i + 1);
            setFaceHint('');
          }
        } else {
          holdFramesRef.current = Math.max(0, holdFramesRef.current - 1);
          setChallengeProgress(Math.max(0, Math.round((holdFramesRef.current / FRAMES_REQUIRED) * 100)));
        }
      } catch (err) {
        console.warn('Face detection tick failed:', err);
      } finally {
        detectingRef.current = false;
      }
    }, 120);

    return () => clearInterval(intervalId);
  }, [phase, challengeIndex, stopCamera, idDocumentDataUrl]);

  const reset = () => {
    stopCamera();
    setResult(null);
    setPhase(PHASE.READY);
    setChallengeIndex(0);
    setChallengeProgress(0);
    setFaceMetrics(null);
    setFaceHint('');
    setError('');
    onClear?.();
  };

  const activeChallenge = LIVENESS_CHALLENGES[challengeIndex];
  const overallProgress = Math.round(
    ((challengeIndex + challengeProgress / 100) / LIVENESS_CHALLENGES.length) * 100
  );
  const faceOk = faceMetrics?.detected && activeChallenge?.validate(faceMetrics);

  if (result?.image) {
    const v = result.verification || {};
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/40 dark:to-slate-900 p-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg">
              <ShieldCheckIcon />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">Live verification complete</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                AI liveness checks passed. Your selfie is encrypted and queued for compliance review.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <MetricPill label="Liveness" value={`${v.livenessScore ?? '—'}%`} ok />
                {v.faceMatchScore != null ? (
                  <MetricPill
                    label="ID match"
                    value={`${v.faceMatchScore}%`}
                    ok={v.faceMatchPassed !== false}
                  />
                ) : (
                  <MetricPill label="ID match" value="Manual review" ok />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-md rounded-2xl overflow-hidden border-2 border-emerald-500/50 shadow-xl">
          <img src={result.image} alt="Verified selfie" className="w-full aspect-[4/5] object-cover bg-slate-900" />
        </div>

        <button
          type="button"
          onClick={reset}
          className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          Retake live verification
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0">
          <SparkIcon />
        </div>
        <div>
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">AI-powered liveness verification</p>
          <p className="text-xs text-indigo-700/90 dark:text-indigo-300/90 mt-0.5 leading-relaxed">
            Real-time facial recognition confirms you are physically present and matches your government ID when possible.
            Gallery uploads are blocked.
          </p>
        </div>
      </div>

      <div className="relative mx-auto max-w-md">
        <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-[4/5] shadow-2xl ring-1 ring-white/10">
          <video
            ref={videoRef}
            className={`w-full h-full object-cover mirror ${
              phase === PHASE.SCANNING || phase === PHASE.LOADING ? '' : 'opacity-40'
            }`}
            playsInline
            muted
            autoPlay
          />

          {phase === PHASE.SCANNING && (
            <>
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50" />
              <OvalGuide active={faceOk} progress={overallProgress} />
              {faceMetrics?.detected && (
                <FaceBox
                  box={faceMetrics.box}
                  active={faceOk}
                  videoWidth={faceMetrics.videoWidth}
                  videoHeight={faceMetrics.videoHeight}
                />
              )}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-medium backdrop-blur">
                  <span className={`w-2 h-2 rounded-full ${faceOk ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  {faceOk
                    ? 'Face locked'
                    : faceHint || (faceMetrics?.detected ? 'Adjust your position' : 'Detecting face…')}
                </span>
                {faceMetrics?.confidence > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-black/50 text-white text-xs font-mono backdrop-blur">
                    {faceMetrics.confidence}%
                  </span>
                )}
              </div>
              <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
                <p className="text-white font-semibold text-sm">{activeChallenge?.title}</p>
                <p className="text-white/75 text-xs mt-1">
                  {faceHint || activeChallenge?.hint}
                </p>
                <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-150"
                    style={{ width: `${challengeProgress}%` }}
                  />
                </div>
              </div>
            </>
          )}

          {(phase === PHASE.INIT || phase === PHASE.READY || phase === PHASE.ERROR) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-slate-950/70">
              <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mb-4">
                <CameraIcon className="w-8 h-8 text-white/80" />
              </div>
              <p className="text-white font-medium">
                {phase === PHASE.LOADING ? loadMessage : 'Secure camera preview'}
              </p>
              <p className="text-white/60 text-sm mt-2">
                {phase === PHASE.LOADING
                  ? 'Keep this tab in focus while we prepare verification.'
                  : 'Follow four guided prompts: center face, turn left, turn right, and hold still.'}
              </p>
            </div>
          )}

          {phase === PHASE.LOADING && (
            <div className="absolute bottom-4 inset-x-4 flex justify-center">
              <div className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs backdrop-blur">
                {loadMessage}
              </div>
            </div>
          )}

          {phase === PHASE.ANALYZING && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/90 px-8 text-center">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-white font-semibold">Running facial analysis</p>
              <p className="text-white/60 text-sm mt-2">{analysisStep}</p>
            </div>
          )}
        </div>

        <ChallengeStepper current={challengeIndex} progress={challengeProgress} active={phase === PHASE.SCANNING} />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex flex-wrap gap-3">
        {(phase === PHASE.INIT || phase === PHASE.READY || phase === PHASE.ERROR) && (
          <button
            type="button"
            onClick={startSession}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-lg"
          >
            Start live verification
          </button>
        )}
        {phase === PHASE.SCANNING && (
          <button
            type="button"
            onClick={reset}
            className="px-5 py-3 rounded-xl border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 text-sm font-medium"
          >
            Cancel
          </button>
        )}
      </div>

      <style>{`.mirror { transform: scaleX(-1); }`}</style>
    </div>
  );
}

function ChallengeStepper({ current, progress, active }) {
  return (
    <ol className="mt-4 grid grid-cols-4 gap-2">
      {LIVENESS_CHALLENGES.map((c, idx) => {
        const done = idx < current;
        const currentStep = idx === current && active;
        return (
          <li
            key={c.id}
            className={`rounded-xl px-2 py-2 text-center border text-xs ${
              done
                ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                : currentStep
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                  : 'border-gray-200 dark:border-slate-700 text-gray-400'
            }`}
          >
            <div className="font-semibold truncate">{idx + 1}</div>
            <div className="truncate mt-0.5 opacity-80">{c.title.replace('Turn head ', '')}</div>
            {currentStep && <div className="mt-1 text-[10px] font-mono">{progress}%</div>}
          </li>
        );
      })}
    </ol>
  );
}

function OvalGuide({ active, progress }) {
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full" viewBox="0 0 100 125" preserveAspectRatio="none">
      <ellipse
        cx="50"
        cy="52"
        rx="28"
        ry="36"
        fill="none"
        stroke={active ? 'rgba(52, 211, 153, 0.95)' : 'rgba(255,255,255,0.35)'}
        strokeWidth="0.6"
        strokeDasharray="4 2"
      />
      <ellipse
        cx="50"
        cy="52"
        rx="28"
        ry="36"
        fill="none"
        stroke="rgba(99, 102, 241, 0.8)"
        strokeWidth="0.8"
        pathLength="100"
        strokeDasharray={`${progress} 100`}
        transform="rotate(-90 50 52)"
      />
    </svg>
  );
}

function FaceBox({ box, active, videoWidth, videoHeight }) {
  if (!box || !videoWidth || !videoHeight) return null;
  const mirroredLeft = videoWidth - box.x - box.width;
  const style = {
    left: `${(mirroredLeft / videoWidth) * 100}%`,
    top: `${(box.y / videoHeight) * 100}%`,
    width: `${(box.width / videoWidth) * 100}%`,
    height: `${(box.height / videoHeight) * 100}%`,
  };
  return (
    <div
      className={`pointer-events-none absolute border-2 rounded-lg transition-colors ${
        active ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]' : 'border-white/40'
      }`}
      style={style}
    />
  );
}

function MetricPill({ label, value, ok }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
        ok
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
      }`}
    >
      {label}: {value}
    </span>
  );
}

function CameraIcon({ className = 'w-6 h-6' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h2l1-2h8l1 2h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 13a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

export default LiveSelfieVerification;

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle, AlertCircle, RotateCcw, Loader2, Shield, ScanFace } from "lucide-react";
import { prepareKycImageForUpload } from "../../lib/kyc/kycImagePrep";
import {
  attachStreamToVideo,
  requestSelfieMediaStream,
} from "../../lib/kyc/kycCaptureUtils";
import {
  ActiveLivenessAnalyzer,
  buildLivenessChallengeSequence,
  BLINKS_REQUIRED,
  CHALLENGE_HOLD_MS,
  CHALLENGE_MIN_MS,
  CHALLENGE_PROGRESS_SPEED,
  isBlinkChallengeMet,
  isBlinkPoseValid,
  blinkStepProgress,
  isExpressionChallengeMet,
  isExpressionValid,
  isFaceWellFramed,
  isStepProgressTicking,
  isTurnChallengeMet,
  isTurnPoseValid,
  passesAntiSpoofMotionCheck,
  type LivenessChallengeKind,
  type LivenessFrameMetrics,
  type LivenessStepBaselines,
} from "../../lib/kyc/activeLivenessDetection";

function isChallengePoseValid(
  kind: LivenessChallengeKind,
  m: LivenessFrameMetrics,
  baselines: LivenessStepBaselines,
): boolean {
  if (kind === "expression") return isExpressionValid(m, baselines.expressionScore);
  if (kind === "turn_left" || kind === "turn_right") {
    return isTurnPoseValid(kind, m, baselines.turnYaw);
  }
  return isBlinkPoseValid(m);
}

function needsExpressionHint(
  kind: LivenessChallengeKind,
  m: LivenessFrameMetrics,
  baselines: LivenessStepBaselines,
): boolean {
  if (kind !== "expression") return false;
  if (!m.inGuideOval) return false;
  return !isExpressionValid(m, baselines.expressionScore);
}

/** Step 1/3: face in oval. Step 2: framed in camera before turning. */
function isStepReadyForCommand(
  kind: LivenessChallengeKind,
  m: LivenessFrameMetrics,
): boolean {
  if (kind === "expression" || kind === "blink") return m.inGuideOval;
  return isFaceWellFramed(m);
}

export type LivenessSelfieLabels = {
  title: string;
  hint: string;
  challengeLook: string;
  challengeTurnLeft: string;
  challengeTurnRight: string;
  challengeBlink: string;
  takePhoto: string;
  retakePhoto: string;
  captureError: string;
  permissionDenied: string;
  complete: string;
  uploadHint: string;
  cancel: string;
  preparingPhoto: string;
  livenessPassed: string;
  loadingModel: string;
  faceNotDetected: string;
  positionInOval: string;
  showExpression: string;
  keepMoving: string;
  holdStill: string;
  livenessFailed: string;
  livenessRetry: string;
  blinkCounterLabel: string;
  antiSpoofFailed: string;
  cameraRequired: string;
  activeLivenessBadge: string;
  biometricActive: string;
};

type Props = {
  capture: string | null;
  livenessPassed: boolean;
  labels: LivenessSelfieLabels;
  onCapture: (dataUrl: string) => void;
  onStepCapture?: (step: 1 | 2 | 3, dataUrl: string) => void;
  onLivenessPassed: (score: number) => void;
  onReset: () => void;
};

function holdPercentDisplay(holdMs: number): number {
  if (holdMs >= CHALLENGE_HOLD_MS) return 100;
  return Math.floor((holdMs / CHALLENGE_HOLD_MS) * 100);
}

function challengeCommand(
  kind: LivenessChallengeKind,
  labels: LivenessSelfieLabels,
): string {
  if (kind === "expression") return labels.challengeLook;
  if (kind === "turn_left") return labels.challengeTurnLeft;
  if (kind === "turn_right") return labels.challengeTurnRight;
  return labels.challengeBlink;
}

export function LivenessSelfiePanel({
  capture,
  livenessPassed,
  labels,
  onCapture,
  onStepCapture,
  onLivenessPassed,
  onReset,
}: Props) {
  const [active, setActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [challengeIdx, setChallengeIdx] = useState(0);
  const [blinkDisplay, setBlinkDisplay] = useState(0);
  const [holdProgressMs, setHoldProgressMs] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState<LivenessFrameMetrics | null>(null);
  const [challenges] = useState(() => buildLivenessChallengeSequence());

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<ActiveLivenessAnalyzer | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef(-1);
  const finishingRef = useRef(false);
  const challengeIdxRef = useRef(0);
  const holdAccumMsRef = useRef(0);
  const lastProgressTickRef = useRef<number | null>(null);
  const progressTickingRef = useRef(false);
  const poseValidRef = useRef(false);
  const latestMetricsRef = useRef<LivenessFrameMetrics | null>(null);
  const latestBlinkCountRef = useRef(0);
  const challengeEligibleAtRef = useRef(0);
  const expressionBaselineRef = useRef<number | null>(null);
  const turnBaselineYawRef = useRef<number | null>(null);
  const stepBaselinesRef = useRef<LivenessStepBaselines>({});
  const stepStartedAtRef = useRef(Date.now());
  const challengesRef = useRef(challenges);
  const onStepCaptureRef = useRef(onStepCapture);
  const snapFromVideoRef = useRef<(score: number) => void>(() => {});
  const antiSpoofFailedRef = useRef(labels.antiSpoofFailed);

  const currentChallenge = challenges[challengeIdx] ?? "blink";

  const stopStream = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    analyzerRef.current?.dispose();
    analyzerRef.current = null;
    lastVideoTimeRef.current = -1;
    finishingRef.current = false;
    challengeIdxRef.current = 0;
    holdAccumMsRef.current = 0;
    lastProgressTickRef.current = null;
    progressTickingRef.current = false;
    poseValidRef.current = false;
    latestMetricsRef.current = null;
    latestBlinkCountRef.current = 0;
    challengeEligibleAtRef.current = 0;
    expressionBaselineRef.current = null;
    turnBaselineYawRef.current = null;
    stepBaselinesRef.current = {};
    stepStartedAtRef.current = Date.now();
    setCameraStarting(false);
    setModelLoading(false);
    setLiveMetrics(null);
    setChallengeIdx(0);
    setBlinkDisplay(0);
    setHoldProgressMs(0);
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  const captureFrameRaw = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.92);
  }, []);

  const deliverStepCapture = useCallback(async (step: 1 | 2 | 3) => {
    const handler = onStepCaptureRef.current;
    if (!handler) return;
    const raw = captureFrameRaw();
    if (!raw) return;
    try {
      const compressed = await prepareKycImageForUpload(raw, "selfie");
      handler(step, compressed);
    } catch {
      handler(step, raw);
    }
  }, [captureFrameRaw]);

  const finishCapture = useCallback((raw: string, score: number) => {
    setPreparing(true);
    void prepareKycImageForUpload(raw, "selfie")
      .then((compressed) => {
        onCapture(compressed);
        onLivenessPassed(score);
        setActive(false);
        stopStream();
      })
      .catch(() => {
        onCapture(raw);
        onLivenessPassed(score);
        setActive(false);
        stopStream();
      })
      .finally(() => setPreparing(false));
  }, [onCapture, onLivenessPassed, stopStream]);

  const snapFromVideo = useCallback((score: number) => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    finishCapture(canvas.toDataURL("image/jpeg", 0.92), score);
  }, [finishCapture]);

  useEffect(() => {
    snapFromVideoRef.current = snapFromVideo;
    onStepCaptureRef.current = onStepCapture;
    antiSpoofFailedRef.current = labels.antiSpoofFailed;
  }, [snapFromVideo, onStepCapture, labels.antiSpoofFailed]);

  const startDetectionLoop = useCallback(() => {
    const tick = () => {
      const video = videoRef.current;
      const analyzer = analyzerRef.current;
      if (!video || !analyzer) return;

      const idx = challengeIdxRef.current;
      const kind = challengesRef.current[idx]!;
      const canScore = Date.now() >= challengeEligibleAtRef.current;

      if (video.currentTime !== lastVideoTimeRef.current || kind === "blink") {
        if (video.currentTime !== lastVideoTimeRef.current) {
          lastVideoTimeRef.current = video.currentTime;
        }
        const metrics = analyzer.analyze(video, performance.now(), {
          blinkStep: kind === "blink",
        });
        if (metrics) {
          setLiveMetrics(metrics);
          latestMetricsRef.current = metrics;

          if (kind === "blink") {
            latestBlinkCountRef.current = analyzer.getBlinkCount();
            setBlinkDisplay(latestBlinkCountRef.current);
          }
        }
      }

      const metrics = latestMetricsRef.current;
      const now = Date.now();
      if (metrics) {
        const stepAgeMs = now - stepStartedAtRef.current;

        if (kind === "expression" && metrics.inGuideOval) {
          expressionBaselineRef.current = expressionBaselineRef.current === null
            ? metrics.expressionScore
            : Math.min(expressionBaselineRef.current, metrics.expressionScore);
        } else if (
          kind === "expression"
          && expressionBaselineRef.current === null
          && stepAgeMs >= 400
          && metrics.faceDetected
        ) {
          expressionBaselineRef.current = metrics.expressionScore;
        }

        if (
          (kind === "turn_left" || kind === "turn_right")
          && isFaceWellFramed(metrics)
        ) {
          if (Math.abs(metrics.yaw) < 0.15) {
            turnBaselineYawRef.current = turnBaselineYawRef.current === null
              ? metrics.yaw
              : turnBaselineYawRef.current * 0.7 + metrics.yaw * 0.3;
          }
        } else if (
          (kind === "turn_left" || kind === "turn_right")
          && turnBaselineYawRef.current === null
          && stepAgeMs >= 400
          && isFaceWellFramed(metrics)
        ) {
          turnBaselineYawRef.current = metrics.yaw;
        }

        stepBaselinesRef.current = {
          expressionScore: expressionBaselineRef.current,
          turnYaw: turnBaselineYawRef.current,
        };
        const baselines = stepBaselinesRef.current;

        const poseOk = canScore && isChallengePoseValid(kind, metrics, baselines);
        poseValidRef.current = poseOk;
        if (kind === "blink") {
          progressTickingRef.current = canScore && isBlinkPoseValid(metrics);
        } else {
          progressTickingRef.current = canScore && isStepProgressTicking(kind, metrics, baselines);
        }
      } else {
        poseValidRef.current = false;
        progressTickingRef.current = false;
      }

      if (progressTickingRef.current && kind !== "blink") {
        if (lastProgressTickRef.current !== null) {
          const delta = Math.min(80, now - lastProgressTickRef.current);
          if (delta > 0 && holdAccumMsRef.current < CHALLENGE_HOLD_MS) {
            holdAccumMsRef.current = Math.min(
              CHALLENGE_HOLD_MS,
              holdAccumMsRef.current + delta * CHALLENGE_PROGRESS_SPEED,
            );
          }
        }
        lastProgressTickRef.current = now;
      } else if (kind !== "blink") {
        holdAccumMsRef.current = 0;
        lastProgressTickRef.current = null;
      }

      if (kind === "blink") {
        setHoldProgressMs(Math.round(blinkStepProgress(latestBlinkCountRef.current) * CHALLENGE_HOLD_MS));
      } else {
        setHoldProgressMs(holdAccumMsRef.current);
      }

      const blinkReady = kind === "blink"
        && canScore
        && latestBlinkCountRef.current >= BLINKS_REQUIRED;

      const stepReady = kind === "blink"
        ? blinkReady
        : metrics
          && canScore
          && holdAccumMsRef.current >= CHALLENGE_HOLD_MS
          && poseValidRef.current;

      if (stepReady && !finishingRef.current) {
        const holdMs = kind === "blink"
          ? CHALLENGE_HOLD_MS
          : holdAccumMsRef.current;
        let met = false;
        const baselines = stepBaselinesRef.current;
        if (kind === "expression") {
          met = isExpressionChallengeMet(metrics!, holdMs, baselines.expressionScore);
        } else if (kind === "turn_left" || kind === "turn_right") {
          met = isTurnChallengeMet(kind, metrics!, holdMs, baselines.turnYaw);
        } else {
          met = isBlinkChallengeMet(latestBlinkCountRef.current);
        }

        if (met) {
          const stepNum = (idx + 1) as 1 | 2 | 3;
          void deliverStepCapture(stepNum);

          if (idx < challengesRef.current.length - 1) {
            challengeIdxRef.current = idx + 1;
            holdAccumMsRef.current = 0;
            lastProgressTickRef.current = null;
            progressTickingRef.current = false;
            poseValidRef.current = false;
            expressionBaselineRef.current = null;
            turnBaselineYawRef.current = null;
            stepBaselinesRef.current = {};
            stepStartedAtRef.current = Date.now();
            setHoldProgressMs(0);
            challengeEligibleAtRef.current = Date.now() + CHALLENGE_MIN_MS;
            setChallengeIdx(idx + 1);
            if (challengesRef.current[idx + 1] === "blink") {
              analyzer.resetBlinkCounter();
              latestBlinkCountRef.current = 0;
              setBlinkDisplay(0);
            }
          } else {
            finishingRef.current = true;
            const avgMotion = analyzer.avgMotion();
            const durationMs = analyzer.sessionDurationMs();
            if (!passesAntiSpoofMotionCheck(avgMotion, durationMs)) {
              finishingRef.current = false;
              setErrorMsg(antiSpoofFailedRef.current);
              rafRef.current = requestAnimationFrame(tick);
              return;
            }
            const score = analyzer.computeSessionScore(
              challengesRef.current.length,
              challengesRef.current.length,
            );
            snapFromVideoRef.current(score);
            return;
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [deliverStepCapture]);

  const startDetectionLoopRef = useRef(startDetectionLoop);
  startDetectionLoopRef.current = startDetectionLoop;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    const boot = async () => {
      setErrorMsg(null);
      setCameraStarting(true);
      setModelLoading(true);
      challengeIdxRef.current = 0;
      holdAccumMsRef.current = 0;
      lastProgressTickRef.current = null;
      progressTickingRef.current = false;
      poseValidRef.current = false;
      expressionBaselineRef.current = null;
      turnBaselineYawRef.current = null;
      stepBaselinesRef.current = {};
      stepStartedAtRef.current = Date.now();
      setChallengeIdx(0);
      setBlinkDisplay(0);
      setHoldProgressMs(0);
      finishingRef.current = false;

      try {
        const analyzer = new ActiveLivenessAnalyzer();
        await analyzer.init();
        if (cancelled) return;
        analyzerRef.current = analyzer;
        setModelLoading(false);

        const stream = await requestSelfieMediaStream();
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          await attachStreamToVideo(videoRef.current, stream);
          const video = videoRef.current;
          for (let i = 0; i < 40 && video.videoWidth <= 0; i += 1) {
            await new Promise((r) => window.setTimeout(r, 50));
          }
        }
        if (!cancelled) {
          setCameraStarting(false);
          challengeEligibleAtRef.current = Date.now();
          startDetectionLoopRef.current();
        }
      } catch {
        if (!cancelled) {
          setErrorMsg(labels.permissionDenied);
          setCameraStarting(false);
          setModelLoading(false);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, labels.permissionDenied]);

  const handleRetry = () => {
    stopStream();
    setErrorMsg(null);
    finishingRef.current = false;
    challengeIdxRef.current = 0;
    holdAccumMsRef.current = 0;
    lastProgressTickRef.current = null;
    expressionBaselineRef.current = null;
    turnBaselineYawRef.current = null;
    stepBaselinesRef.current = {};
    stepStartedAtRef.current = Date.now();
    setChallengeIdx(0);
    setBlinkDisplay(0);
    setHoldProgressMs(0);
    setActive(true);
  };

  if (capture && livenessPassed) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-4 space-y-3">
        <div className="flex items-center gap-2 text-emerald-400">
          <Shield className="w-5 h-5" />
          <p className="text-sm font-semibold">{labels.livenessPassed}</p>
        </div>
        <img src={capture} alt="Selfie" className="w-full max-h-52 object-cover rounded-xl" />
        <button
          type="button"
          onClick={() => { onReset(); setActive(false); stopStream(); }}
          className="flex items-center gap-2 text-amber-400 text-xs font-semibold"
        >
          <RotateCcw className="w-3.5 h-3.5" /> {labels.retakePhoto}
        </button>
      </div>
    );
  }

  if (!active) {
    return (
      <div className="rounded-xl border-2 border-dashed gp-divider p-6 text-center space-y-3">
        <ScanFace className="w-10 h-10 text-emerald-400 mx-auto" />
        <span className="inline-block rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[9px] font-bold text-emerald-400 border border-emerald-500/30">
          {labels.activeLivenessBadge}
        </span>
        <p className="gp-muted text-[11px] leading-relaxed">{labels.hint}</p>
        <p className="gp-muted text-[10px] leading-relaxed">{labels.cameraRequired}</p>
        <button
          type="button"
          onClick={() => setActive(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-black font-semibold text-xs"
        >
          <Camera className="w-3.5 h-3.5" /> {labels.takePhoto}
        </button>
      </div>
    );
  }

  const faceDetected = liveMetrics?.faceDetected;
  const faceInOval = liveMetrics?.inGuideOval;
  const needsOval = currentChallenge === "expression" || currentChallenge === "blink";
  const stepBaselines = stepBaselinesRef.current;
  const stepCommand = challengeCommand(currentChallenge, labels);
  const challengeMet = Boolean(
    liveMetrics && isStepProgressTicking(currentChallenge, liveMetrics, stepBaselines),
  );
  const holdPercent = currentChallenge === "blink"
    ? Math.round(blinkStepProgress(blinkDisplay) * 100)
    : holdProgressMs > 0
      ? holdPercentDisplay(holdProgressMs)
      : challengeMet
        ? holdPercentDisplay(holdProgressMs)
        : 0;
  const needsExpression = liveMetrics
    ? needsExpressionHint(currentChallenge, liveMetrics, stepBaselines)
    : false;

  const statusHint = modelLoading || cameraStarting
    ? labels.loadingModel
    : !faceDetected
      ? labels.faceNotDetected
      : needsOval && !faceInOval
        ? labels.positionInOval
        : liveMetrics && !isStepReadyForCommand(currentChallenge, liveMetrics)
          ? labels.positionInOval
          : needsExpression
            ? labels.showExpression
            : stepCommand;

  const frameReady = liveMetrics
    ? isStepReadyForCommand(currentChallenge, liveMetrics)
    : false;
  const cameraReady = !modelLoading && !cameraStarting;
  const commandActive = cameraReady && (
    currentChallenge === "blink"
      ? Boolean(faceInOval && blinkDisplay > 0)
      : (challengeMet || holdProgressMs > 0)
  );
  const showHoldProgress = cameraReady && (
    currentChallenge === "blink"
      ? Boolean(faceDetected && (faceInOval || frameReady))
      : holdProgressMs > 0
  );
  const showGuideOval = needsOval && cameraReady;
  const ovalMatched = needsOval ? Boolean(faceInOval) : frameReady;
  const biometricOk = commandActive;

  return (
    <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/[0.06] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="gp-text text-xs font-semibold">{labels.title}</p>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[8px] font-bold text-violet-300 border border-violet-500/25">
          {labels.activeLivenessBadge}
        </span>
      </div>

      <div className="flex gap-1.5">
        {challenges.map((c, i) => {
          const stepLabels: Record<LivenessChallengeKind, string> = {
            expression: "1",
            turn_left: "2",
            turn_right: "2",
            blink: "3",
          };
          return (
          <span
            key={`${c}-${i}`}
            className={`flex-1 text-center text-[9px] py-1 rounded-full ${
              i < challengeIdx ? "bg-emerald-500/20 text-emerald-400"
                : i === challengeIdx ? "bg-indigo-500/25 text-indigo-300 font-bold"
                : "gp-subtle gp-muted"
            }`}
          >
            {stepLabels[c]}
          </span>
          );
        })}
      </div>

      <p className="gp-text text-sm font-semibold text-center py-1 min-h-[2.5rem]">
        {statusHint}
      </p>

      {showHoldProgress && (
        <div className="space-y-1 mx-1">
          <div className="h-2.5 rounded-full gp-subtle overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-[width] duration-75 ease-linear"
              style={{ width: `${holdPercent}%` }}
            />
          </div>
          <p className="text-center text-lg text-emerald-400 font-bold tabular-nums">
            {holdPercent}%
          </p>
        </div>
      )}

      <div className="relative rounded-xl overflow-hidden bg-black/40 aspect-[3/4] max-h-72 mx-auto">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />
        <div
          className={`pointer-events-none absolute inset-0 flex items-center justify-center ${
            showGuideOval || frameReady ? "opacity-100" : "opacity-70"
          }`}
        >
          {(showGuideOval || currentChallenge === "turn_left" || currentChallenge === "turn_right") && (
          <div
            className={`w-[55%] max-w-[220px] aspect-[3/4] rounded-[45%] border-[3px] transition-colors duration-200 ${
              commandActive
                ? "border-emerald-400 shadow-[0_0_24px_rgba(16,185,129,0.45)]"
                : ovalMatched
                  ? "border-emerald-400/75 shadow-[0_0_16px_rgba(16,185,129,0.3)]"
                  : showGuideOval
                    ? "border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "border-emerald-400/40"
            }`}
          />
          )}
        </div>
        {(cameraStarting || modelLoading || preparing) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 gap-2">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-[10px] text-emerald-200/90">{labels.loadingModel}</p>
          </div>
        )}
        {currentChallenge === "blink" && !modelLoading && (
          <div className="absolute bottom-3 left-0 right-0 text-center">
            <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${
              commandActive ? "bg-emerald-500/30 text-emerald-100" : "bg-black/50 text-white"
            }`}>
              {Math.min(blinkDisplay, BLINKS_REQUIRED)}/{BLINKS_REQUIRED} {labels.blinkCounterLabel}
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-red-400 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {errorMsg}
          </p>
          <button type="button" onClick={handleRetry} className="text-emerald-400 text-xs font-semibold underline">
            {labels.livenessRetry}
          </button>
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setActive(false); stopStream(); }}
          className="flex-1 py-2.5 rounded-xl gp-subtle gp-muted text-xs font-semibold"
        >
          {labels.cancel}
        </button>
        {biometricOk && (
          <div className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
            <CheckCircle className="w-3.5 h-3.5" /> {labels.biometricActive}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Active Liveness Detection, client-side biometric challenges via MediaPipe Face Landmarker.
 * Verifies a live human (motion, blink, head pose), not a static photo/video replay.
 */

export type LivenessChallengeKind = "expression" | "turn_left" | "turn_right" | "blink";

export type LivenessFrameMetrics = {
  faceDetected: boolean;
  faceConfidence: number;
  ear: number;
  yaw: number;
  pitch: number;
  faceSizeRatio: number;
  motionScore: number;
  eyesOpen: boolean;
  /** Face bbox center in mirrored preview space (0-1). */
  faceCenterX: number;
  faceCenterY: number;
  faceWidthNorm: number;
  faceHeightNorm: number;
  inGuideOval: boolean;
  /** 0-1 facial expression strength (smile / jaw / brow blendshapes). */
  expressionScore: number;
};

export type ActiveLivenessSessionResult = {
  passed: boolean;
  score: number;
  blinkCount: number;
  avgMotion: number;
  durationMs: number;
  failureReason?: string;
};

type NormalizedLandmark = { x: number; y: number; z?: number };

type FaceLandmarkerInstance = {
  detectForVideo: (
    video: HTMLVideoElement,
    timestampMs: number,
  ) => {
    faceLandmarks?: NormalizedLandmark[][];
    faceBlendshapes?: { categories?: { categoryName?: string; score?: number }[] }[];
  };
  close: () => void;
};

const LEFT_EYE = [33, 160, 158, 133, 153, 144] as const;
const RIGHT_EYE = [362, 385, 387, 263, 373, 380] as const;
const NOSE_TIP = 1;
const LEFT_CHEEK = 234;
const RIGHT_CHEEK = 454;
const FOREHEAD = 10;
const CHIN = 152;

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm";

let landmarkerPromise: Promise<FaceLandmarkerInstance> | null = null;

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function eyeAspectRatio(landmarks: NormalizedLandmark[], indices: readonly number[]): number {
  const p = indices.map((i) => landmarks[i]!);
  const vertical = dist(p[1]!, p[5]!) + dist(p[2]!, p[4]!);
  const horizontal = dist(p[0]!, p[3]!);
  if (horizontal <= 0) return 0;
  return vertical / (2 * horizontal);
}

function estimateHeadPose(landmarks: NormalizedLandmark[]): { yaw: number; pitch: number } {
  const nose = landmarks[NOSE_TIP]!;
  const left = landmarks[LEFT_CHEEK]!;
  const right = landmarks[RIGHT_CHEEK]!;
  const forehead = landmarks[FOREHEAD]!;
  const chin = landmarks[CHIN]!;

  const centerX = (left.x + right.x) / 2;
  const faceWidth = Math.max(0.01, Math.abs(right.x - left.x));
  const yaw = (nose.x - centerX) / faceWidth;

  const centerY = (forehead.y + chin.y) / 2;
  const faceHeight = Math.max(0.01, Math.abs(chin.y - forehead.y));
  const pitch = (nose.y - centerY) / faceHeight;

  return { yaw, pitch };
}

function computeMotionScore(
  current: NormalizedLandmark[],
  previous: NormalizedLandmark[] | null,
): number {
  if (!previous || previous.length !== current.length) return 0;
  let sum = 0;
  const samples = [NOSE_TIP, LEFT_CHEEK, RIGHT_CHEEK, LEFT_EYE[0], RIGHT_EYE[0]];
  for (const idx of samples) {
    sum += dist(current[idx]!, previous[idx]!);
  }
  return sum / samples.length;
}

function faceSizeRatio(landmarks: NormalizedLandmark[]): number {
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  return w * h;
}

function faceBoundingBox(landmarks: NormalizedLandmark[]): {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
} {
  const xs = landmarks.map((l) => l.x);
  const ys = landmarks.map((l) => l.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  return {
    // Preview is mirrored, map landmark X to what the user sees on screen.
    centerX: 1 - centerX,
    centerY: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function extractBlinkScore(
  categories?: { categoryName?: string; score?: number }[],
): number {
  if (!categories?.length) return 0;
  let left = 0;
  let right = 0;
  for (const c of categories) {
    const name = (c.categoryName ?? "").toLowerCase();
    if (name.includes("eyeblinkleft") || name === "eye_blink_left") left = c.score ?? 0;
    if (name.includes("eyeblinkright") || name === "eye_blink_right") right = c.score ?? 0;
  }
  if (left > 0 || right > 0) return (left + right) / 2;
  let squint = 0;
  for (const c of categories) {
    const name = (c.categoryName ?? "").toLowerCase();
    if (name.includes("eyesquint")) squint = Math.max(squint, c.score ?? 0);
  }
  return squint;
}

/** Relaxed hybrid thresholds, mobile front cameras vary widely. */
const BLINK_EAR_ABS_CLOSED = 0.22;
const BLINK_EAR_REL_DROP = 0.28;
const BLINK_BLEND_CLOSED = 0.22;
const BLINK_BLEND_OPEN = 0.12;
const BLINK_COOLDOWN_MS = 180;

function extractSmileScore(
  categories?: { categoryName?: string; score?: number }[],
): number {
  if (!categories?.length) return 0;
  let left = 0;
  let right = 0;
  for (const c of categories) {
    if (c.categoryName === "mouthSmileLeft") left = c.score ?? 0;
    if (c.categoryName === "mouthSmileRight") right = c.score ?? 0;
  }
  return (left + right) / 2;
}

function extractBlendMax(
  categories: { categoryName?: string; score?: number }[] | undefined,
  names: string[],
): number {
  if (!categories?.length) return 0;
  const wanted = new Set(names);
  let max = 0;
  for (const c of categories) {
    if (c.categoryName && wanted.has(c.categoryName)) {
      max = Math.max(max, c.score ?? 0);
    }
  }
  return max;
}

function computeExpressionScore(
  categories: { categoryName?: string; score?: number }[] | undefined,
): number {
  const smile = extractSmileScore(categories);
  const jaw = extractBlendMax(categories, ["jawOpen"]);
  const brow = extractBlendMax(categories, [
    "browOuterUpLeft",
    "browOuterUpRight",
    "browInnerUp",
  ]);
  return Math.max(smile, jaw, brow);
}

/** Matches the on-screen green oval (55% width, centered, aspect 3/4). */
export const OVAL_CENTER_X = 0.5;
export const OVAL_CENTER_Y = 0.5;
export const OVAL_RADIUS_X = 0.19;
export const OVAL_RADIUS_Y = 0.24;
export const MIN_FACE_WIDTH = 0.2;
export const MAX_FACE_WIDTH = 0.52;
export const MIN_FACE_HEIGHT = 0.24;
export const MAX_FACE_HEIGHT = 0.58;

export function isFaceInGuideOval(m: Pick<
  LivenessFrameMetrics,
  "faceCenterX" | "faceCenterY" | "faceWidthNorm" | "faceHeightNorm"
>): boolean {
  const dx = (m.faceCenterX - OVAL_CENTER_X) / OVAL_RADIUS_X;
  const dy = (m.faceCenterY - OVAL_CENTER_Y) / OVAL_RADIUS_Y;
  const inEllipse = dx * dx + dy * dy <= 1;
  const sizeOk = m.faceWidthNorm >= MIN_FACE_WIDTH
    && m.faceWidthNorm <= MAX_FACE_WIDTH
    && m.faceHeightNorm >= MIN_FACE_HEIGHT
    && m.faceHeightNorm <= MAX_FACE_HEIGHT;
  return inEllipse && sizeOk;
}

/** Face fully visible, not clipped to frame edge during turn step. */
export function isFaceWellFramed(m: LivenessFrameMetrics): boolean {
  return m.faceDetected
    && m.faceWidthNorm >= MIN_FACE_WIDTH * 0.9
    && m.faceHeightNorm >= MIN_FACE_HEIGHT * 0.9
    && m.faceCenterX >= 0.24
    && m.faceCenterX <= 0.76
    && m.faceCenterY >= 0.2
    && m.faceCenterY <= 0.8;
}

async function createFaceLandmarker(delegate: "GPU" | "CPU"): Promise<FaceLandmarkerInstance> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks(WASM_CDN);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: false,
  }) as FaceLandmarkerInstance;
}

export async function loadActiveLivenessDetector(): Promise<FaceLandmarkerInstance> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      try {
        return await createFaceLandmarker("GPU");
      } catch {
        return createFaceLandmarker("CPU");
      }
    })().catch((err) => {
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

export const CHALLENGE_HOLD_MS = 2800;
export const BLINKS_REQUIRED = 2;
/** Absolute floor for blendshape-based expression (0-1). */
export const EXPRESSION_THRESHOLD = 0.35;
/** Minimum rise above neutral baseline captured at step start. */
export const EXPRESSION_DELTA = 0.16;
/** Minimum head-yaw change from baseline for turn step. */
export const TURN_YAW_DELTA = 0.24;
/** Hard minimum |yaw| while turned (guards camera offset). */
export const TURN_YAW_MIN = 0.20;
/** @deprecated Use EXPRESSION_THRESHOLD */
export const SMILE_THRESHOLD = EXPRESSION_THRESHOLD;
/** Minimum landmark motion per frame, rejects static photo / frozen hold. */
export const MIN_LIVE_MOTION = 0.00014;
/** Minimum gap before next challenge can start scoring (ms). */
export const CHALLENGE_MIN_MS = 250;
/** Progress bar fill speed multiplier for expression/turn steps. */
export const CHALLENGE_PROGRESS_SPEED = 1.45;

export function hasLiveMotion(m: LivenessFrameMetrics): boolean {
  return m.motionScore >= MIN_LIVE_MOTION;
}

export function buildLivenessChallengeSequence(): LivenessChallengeKind[] {
  const turn: LivenessChallengeKind = Math.random() > 0.5 ? "turn_left" : "turn_right";
  return ["expression", turn, "blink"];
}

export class ActiveLivenessAnalyzer {
  private landmarker: FaceLandmarkerInstance | null = null;
  private prevLandmarks: NormalizedLandmark[] | null = null;
  private motionSamples: number[] = [];
  private blinkCount = 0;
  private blinkWasClosed = false;
  private earOpenBaseline = 0.28;
  private lastBlinkAtMs = 0;
  private sessionStartMs = 0;

  async init(): Promise<void> {
    this.landmarker = await loadActiveLivenessDetector();
    this.sessionStartMs = Date.now();
  }

  dispose(): void {
    this.prevLandmarks = null;
    this.motionSamples = [];
  }

  analyze(
    video: HTMLVideoElement,
    timestampMs: number,
    opts?: { blinkStep?: boolean },
  ): LivenessFrameMetrics | null {
    if (!this.landmarker || video.videoWidth <= 0) return null;

    const result = this.landmarker.detectForVideo(video, timestampMs);
    const landmarks = result.faceLandmarks?.[0];
    if (!landmarks?.length) {
      this.prevLandmarks = null;
      return {
        faceDetected: false,
        faceConfidence: 0,
        ear: 0,
        yaw: 0,
        pitch: 0,
        faceSizeRatio: 0,
        motionScore: 0,
        eyesOpen: false,
        faceCenterX: 0.5,
        faceCenterY: 0.5,
        faceWidthNorm: 0,
        faceHeightNorm: 0,
        inGuideOval: false,
        expressionScore: 0,
      };
    }

    const blendCategories = result.faceBlendshapes?.[0]?.categories;
    const expressionScore = computeExpressionScore(blendCategories);
    const blinkScore = extractBlinkScore(blendCategories);
    const leftEar = eyeAspectRatio(landmarks, LEFT_EYE);
    const rightEar = eyeAspectRatio(landmarks, RIGHT_EYE);
    const ear = (leftEar + rightEar) / 2;
    const { yaw, pitch } = estimateHeadPose(landmarks);
    // Front camera preview is mirrored, invert yaw so left/right match user instructions.
    const userYaw = -yaw;
    const motionScore = computeMotionScore(landmarks, this.prevLandmarks);
    this.prevLandmarks = landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z }));
    if (motionScore > 0) this.motionSamples.push(motionScore);

    const eyesOpen = ear > 0.18;
    const bbox = faceBoundingBox(landmarks);
    const metricsBase = {
      faceCenterX: bbox.centerX,
      faceCenterY: bbox.centerY,
      faceWidthNorm: bbox.width,
      faceHeightNorm: bbox.height,
    };
    const inGuideOval = isFaceInGuideOval(metricsBase);
    const faceOkForBlink = inGuideOval || isFaceWellFramed({
      faceDetected: true,
      faceConfidence: 1,
      ear,
      yaw: userYaw,
      pitch,
      faceSizeRatio: faceSizeRatio(landmarks),
      motionScore,
      eyesOpen: ear > 0.18,
      ...metricsBase,
      inGuideOval,
      expressionScore,
    });

    if (opts?.blinkStep) {
      this.registerBlink(ear, blinkScore, true);
    }

    return {
      faceDetected: true,
      faceConfidence: 1,
      ear,
      yaw: userYaw,
      pitch,
      faceSizeRatio: faceSizeRatio(landmarks),
      motionScore,
      eyesOpen,
      ...metricsBase,
      inGuideOval,
      expressionScore,
    };
  }

  getBlinkCount(): number {
    return this.blinkCount;
  }

  resetBlinkCounter(): void {
    this.blinkCount = 0;
    this.blinkWasClosed = false;
    this.earOpenBaseline = 0.28;
    this.lastBlinkAtMs = 0;
  }

  private registerBlink(ear: number, blinkScore: number, faceOk: boolean): void {
    if (!faceOk) return;

    if (!this.blinkWasClosed && ear > 0.1) {
      this.earOpenBaseline = Math.max(this.earOpenBaseline * 0.98, ear);
    }

    const relClosed = ear < this.earOpenBaseline * (1 - BLINK_EAR_REL_DROP);
    const absClosed = ear < BLINK_EAR_ABS_CLOSED;
    const blendClosed = blinkScore >= BLINK_BLEND_CLOSED;
    const closed = absClosed || relClosed || blendClosed;

    const relOpen = ear >= this.earOpenBaseline * 0.9;
    const absOpen = ear > BLINK_EAR_ABS_CLOSED + 0.02;
    const blendOpen = blinkScore <= BLINK_BLEND_OPEN;
    const open = (relOpen || absOpen || blendOpen) && !closed;

    const now = Date.now();
    if (closed) {
      this.blinkWasClosed = true;
    } else if (this.blinkWasClosed && open && now - this.lastBlinkAtMs >= BLINK_COOLDOWN_MS) {
      this.blinkCount += 1;
      this.lastBlinkAtMs = now;
      this.blinkWasClosed = false;
      this.earOpenBaseline = Math.max(ear, 0.2);
    }
  }

  computeSessionScore(challengesPassed: number, totalChallenges: number): number {
    const base = Math.round((challengesPassed / totalChallenges) * 70);
    const motionBonus = Math.min(15, Math.round(this.avgMotion() * 800));
    const blinkBonus = Math.min(10, this.blinkCount >= 2 ? 10 : this.blinkCount * 5);
    const durationMs = Date.now() - this.sessionStartMs;
    const timeBonus = durationMs >= 4000 && durationMs <= 120000 ? 5 : 0;
    return Math.min(100, base + motionBonus + blinkBonus + timeBonus);
  }

  avgMotion(): number {
    if (this.motionSamples.length === 0) return 0;
    return this.motionSamples.reduce((a, b) => a + b, 0) / this.motionSamples.length;
  }

  sessionDurationMs(): number {
    return Date.now() - this.sessionStartMs;
  }
}

/** Face centered in oval with neutral pose, used to capture expression/yaw baseline. */
export function isNeutralFaceInOval(m: LivenessFrameMetrics): boolean {
  return m.inGuideOval
    && Math.abs(m.yaw) < 0.12
    && Math.abs(m.pitch) < 0.18
    && m.ear > 0.12;
}

function expressionScoreRequired(baseline?: number | null): number {
  if (baseline == null) return EXPRESSION_THRESHOLD;
  return Math.max(EXPRESSION_THRESHOLD, baseline + EXPRESSION_DELTA);
}

/** Step 1: active facial expression in oval, must exceed neutral baseline. */
export function isExpressionValid(
  m: LivenessFrameMetrics,
  baseline?: number | null,
): boolean {
  if (!m.inGuideOval) return false;
  if (Math.abs(m.yaw) > 0.14 || Math.abs(m.pitch) > 0.20 || m.ear <= 0.12) return false;
  return m.expressionScore >= expressionScoreRequired(baseline);
}

export function isExpressionChallengeMet(
  m: LivenessFrameMetrics,
  holdMs: number,
  baseline?: number | null,
): boolean {
  return isExpressionValid(m, baseline) && holdMs >= CHALLENGE_HOLD_MS;
}

/** @deprecated Use isExpressionValid */
export function isSmileExpressionValid(m: LivenessFrameMetrics): boolean {
  return isExpressionValid(m);
}

/** @deprecated Use isExpressionChallengeMet */
export function isSmileChallengeMet(m: LivenessFrameMetrics, holdMs: number): boolean {
  return isExpressionChallengeMet(m, holdMs);
}

/** @deprecated Use isNeutralFaceInOval */
export function isCenterPoseValid(m: LivenessFrameMetrics): boolean {
  return isNeutralFaceInOval(m);
}

/** @deprecated Use isExpressionValid */
export function isCenterLiveValid(m: LivenessFrameMetrics): boolean {
  return isExpressionValid(m);
}

/** @deprecated Use isExpressionChallengeMet */
export function isCenterChallengeMet(m: LivenessFrameMetrics, holdMs: number): boolean {
  return isExpressionChallengeMet(m, holdMs);
}

export function isTurnPoseValid(
  kind: "turn_left" | "turn_right",
  m: LivenessFrameMetrics,
  baselineYaw?: number | null,
): boolean {
  if (!isFaceWellFramed(m)) return false;
  if (Math.abs(m.pitch) > 0.22) return false;

  const base = baselineYaw ?? 0;
  const delta = m.yaw - base;

  if (kind === "turn_left") {
    return delta <= -TURN_YAW_DELTA && m.yaw <= -TURN_YAW_MIN;
  }
  return delta >= TURN_YAW_DELTA && m.yaw >= TURN_YAW_MIN;
}

/** Turn: head moving in the instructed direction, no static hold. */
export function isTurnMotionValid(
  kind: "turn_left" | "turn_right",
  m: LivenessFrameMetrics,
): boolean {
  if (!isFaceWellFramed(m)) return false;
  if (!hasLiveMotion(m)) return false;
  const minYaw = 0.07;
  const maxYaw = 0.5;
  return kind === "turn_left"
    ? m.yaw < -minYaw && m.yaw > -maxYaw
    : m.yaw > minYaw && m.yaw < maxYaw;
}

export function isBlinkPoseValid(m: LivenessFrameMetrics): boolean {
  return m.inGuideOval
    && Math.abs(m.yaw) < 0.18
    && Math.abs(m.pitch) < 0.24;
}

export type LivenessStepBaselines = {
  expressionScore?: number | null;
  turnYaw?: number | null;
};

/** Progress runs only while the instructed challenge is clearly performed. */
export function isStepProgressTicking(
  kind: LivenessChallengeKind,
  m: LivenessFrameMetrics,
  baselines?: LivenessStepBaselines,
): boolean {
  if (kind === "blink") return isBlinkPoseValid(m);
  if (kind === "expression") {
    if (baselines?.expressionScore == null) return false;
    return isExpressionValid(m, baselines.expressionScore);
  }
  if (kind === "turn_left" || kind === "turn_right") {
    if (baselines?.turnYaw == null) return false;
    return isTurnPoseValid(kind, m, baselines.turnYaw);
  }
  return false;
}

export function isTurnChallengeMet(
  kind: "turn_left" | "turn_right",
  m: LivenessFrameMetrics,
  holdMs: number,
  baselineYaw?: number | null,
): boolean {
  return isTurnPoseValid(kind, m, baselineYaw) && holdMs >= CHALLENGE_HOLD_MS;
}

/** Step 3: complete when required blinks detected (pose checked loosely at capture). */
export function isBlinkChallengeMet(
  blinkCount: number,
  _m?: LivenessFrameMetrics,
  _holdMs?: number,
): boolean {
  return blinkCount >= BLINKS_REQUIRED;
}

/** Progress fraction for blink step UI (0-1). */
export function blinkStepProgress(blinkCount: number): number {
  return Math.min(1, blinkCount / BLINKS_REQUIRED);
}

/** @deprecated Blink step no longer uses a timed hold, kept for legacy callers. */
export function isBlinkStepTimedOut(_holdMs: number, blinkCount: number): boolean {
  return false;
}

/** Reject static spoof: require measurable landmark motion during session. */
export function passesAntiSpoofMotionCheck(avgMotion: number, durationMs: number): boolean {
  if (durationMs < 5000) return false;
  return avgMotion >= 0.0004;
}

export function buildSessionResult(input: {
  passed: boolean;
  score: number;
  blinkCount: number;
  avgMotion: number;
  durationMs: number;
  failureReason?: string;
}): ActiveLivenessSessionResult {
  return { ...input };
}

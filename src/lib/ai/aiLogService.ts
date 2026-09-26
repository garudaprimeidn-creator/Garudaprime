import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, isFirebaseConfigured } from "../firebase/config";

export type AiLogType =
  | "fraud_detection"
  | "risk_analysis"
  | "recommendation"
  | "chatbot"
  | "anomaly";

export type AiLogEntry = {
  type: AiLogType;
  message: string;
  severity: "info" | "warning" | "critical";
  uid?: string;
  metadata?: Record<string, unknown>;
};

const demoLogs: AiLogEntry[] = [];

export async function logAiEvent(entry: AiLogEntry): Promise<void> {
  if (!isFirebaseConfigured || !db) {
    demoLogs.unshift({ ...entry });
    if (demoLogs.length > 100) demoLogs.pop();
    return;
  }
  try {
    await addDoc(collection(db, "ai_logs"), {
      ...entry,
      timestamp: serverTimestamp(),
    });
  } catch {
    /* best effort */
  }
}

export async function logKycRiskAnalysis(uid: string, riskScore: number, factors: string[]): Promise<void> {
  await logAiEvent({
    type: "risk_analysis",
    message: `KYC risk score ${riskScore} for user ${uid.slice(0, 8)}…, ${factors.join(", ")}`,
    severity: riskScore > 50 ? "warning" : "info",
    uid,
    metadata: { riskScore, factors },
  });
}

export async function logFraudAlert(message: string, uid?: string): Promise<void> {
  await logAiEvent({
    type: "fraud_detection",
    message,
    severity: "warning",
    uid,
  });
}

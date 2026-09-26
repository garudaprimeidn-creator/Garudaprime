import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "./firebaseAdmin.js";
import { parseStakeSda } from "./parseStakeSda.js";
import { getValidatorProgramConfig } from "./platformProgramsCore.js";

export type ValidatorApplyBody = {
  walletAddress: string;
  email: string;
  orgName?: string;
  stakeSda?: string;
  message?: string;
};

export const applyValidator = async (body: ValidatorApplyBody, uid: string) => {
  if (!body?.walletAddress?.startsWith("0x") || !body.email?.includes("@")) {
    throw new Error("Invalid application");
  }

  const db = adminDb();
  const existing = await db
    .collection("validator_applications")
    .where("uid", "==", uid)
    .limit(20)
    .get();

  const open = existing.docs.find((doc) => {
    const status = String(doc.data().status ?? "pending");
    return status === "pending" || status === "active";
  });
  if (open) {
    throw new Error(
      open.data().status === "active"
        ? "You already have an active validator application"
        : "You already have a pending validator application",
    );
  }

  const config = await getValidatorProgramConfig();
  if (!config.enabled) throw new Error("Validator program is not open");

  const stake = parseStakeSda(body.stakeSda);
  if (config.minStakeSda > 0 && stake < config.minStakeSda) {
    throw new Error(`Minimum stake is ${config.minStakeSda.toLocaleString()} SDA`);
  }

  const ref = db.collection("validator_applications").doc();
  await ref.set({
    uid,
    walletAddress: body.walletAddress,
    email: body.email.trim().toLowerCase(),
    orgName: body.orgName?.trim() || null,
    stakeSda: body.stakeSda?.trim() || null,
    message: body.message?.trim() || null,
    status: "pending",
    phase: 2,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { id: ref.id, status: "pending" as const };
};

export const verifyAuth = async (header?: string) => {
  if (!header?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return adminAuth().verifyIdToken(header.slice(7));
};

export const validatorErrorStatus = (message: string): number => {
  if (message === "Unauthorized") return 401;
  if (
    message === "Invalid application"
    || message.startsWith("Minimum stake")
    || message.startsWith("You already have")
    || message === "Validator program is not open"
  ) {
    return 400;
  }
  return 500;
};

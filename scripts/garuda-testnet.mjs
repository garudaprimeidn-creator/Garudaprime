#!/usr/bin/env node
/**
 * Start Garuda Chain testnet (Hardhat node) and bootstrap GAT + Bridge Vault.
 * Usage: npm run garuda:testnet
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const CONTRACTS = resolve(ROOT, "contracts");
const RPC_URL = process.env.GARUDA_TESTNET_RPC_URL || "http://127.0.0.1:9745";
const CHAIN_ID = process.env.VITE_GARUDA_CHAIN_ID || "974540";
const PORT = new URL(RPC_URL).port || "9745";

const loadEnv = () => {
  const envPath = resolve(ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
};

loadEnv();

const rpcReady = async (attempts = 30) => {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      const data = await res.json();
      if (data.result === `0x${Number(CHAIN_ID).toString(16)}`) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
};

const run = (cmd, args, cwd) =>
  new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: true, env: process.env });
    child.on("exit", (code) => (code === 0 ? resolveRun() : rejectRun(new Error(`${cmd} exited ${code}`))));
  });

const main = async () => {
  console.log(`\n🦅 Garuda Chain Testnet, chainId ${CHAIN_ID}, port ${PORT}\n`);

  const node = spawn(
    "npx",
    ["hardhat", "node", "--port", PORT, "--hostname", "0.0.0.0"],
    { cwd: CONTRACTS, stdio: "inherit", shell: true, env: process.env },
  );

  process.on("SIGINT", () => {
    node.kill();
    process.exit(0);
  });

  console.log("Waiting for RPC…");
  const ready = await rpcReady();
  if (!ready) {
    console.error("❌ RPC did not become ready in time");
    node.kill();
    process.exit(1);
  }

  console.log(`✓ RPC live → ${RPC_URL}\nBootstrapping contracts…\n`);

  const deploymentFile = resolve(CONTRACTS, "deployments/garuda-testnet-latest.json");
  let skipBootstrap = false;
  if (existsSync(deploymentFile)) {
    try {
      const prev = JSON.parse(readFileSync(deploymentFile, "utf8"));
      const codeRes = await fetch(RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "eth_getCode",
          params: [prev.contracts?.GATToken, "latest"],
        }),
      });
      const codeData = await codeRes.json();
      if (codeData.result && codeData.result !== "0x") {
        skipBootstrap = true;
        console.log("✓ Contracts already bootstrapped, skipping deploy\n");
      }
    } catch { /* redeploy */ }
  }

  try {
    if (!skipBootstrap) {
      await run("npx", ["hardhat", "run", "scripts/bootstrap-testnet.cjs", "--network", "garudaTestnet"], CONTRACTS);
    }
    console.log(`\n✓ Garuda Chain testnet running`);
    console.log(`  RPC: ${RPC_URL}`);
    console.log(`  Chain ID: ${CHAIN_ID}`);
    console.log(`  Press Ctrl+C to stop\n`);
  } catch (e) {
    if (existsSync(deploymentFile)) {
      console.warn("Bootstrap warning (contracts may already exist):", e.message);
    } else {
      console.error(e);
      node.kill();
      process.exit(1);
    }
  }

  node.on("exit", (code) => process.exit(code ?? 0));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

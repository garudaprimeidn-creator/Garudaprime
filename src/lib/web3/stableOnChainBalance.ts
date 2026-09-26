import type { OnChainBalances } from "./tokenBalances";

const MIN_DELTA = 0.000_001;

type Reading = { sda: number | null; gat: number | null };

function readingsMatch(a: Reading, b: Reading): boolean {
  const sameSda = a.sda === null && b.sda === null
    || (a.sda !== null && b.sda !== null && Math.abs(a.sda - b.sda) < MIN_DELTA);
  const sameGat = a.gat === null && b.gat === null
    || (a.gat !== null && b.gat !== null && Math.abs(a.gat - b.gat) < MIN_DELTA);
  return sameSda && sameGat;
}

function decreased(prev: Reading, next: Reading): boolean {
  if (prev.gat !== null && next.gat !== null && next.gat < prev.gat - MIN_DELTA) return true;
  if (prev.sda !== null && next.sda !== null && next.sda < prev.sda - MIN_DELTA) return true;
  return false;
}

function increased(prev: Reading, next: Reading): boolean {
  if (prev.gat !== null && next.gat !== null && next.gat > prev.gat + MIN_DELTA) return true;
  if (prev.sda !== null && next.sda !== null && next.sda > prev.sda + MIN_DELTA) return true;
  return false;
}

/**
 * Stabilize noisy RPC reads without blocking legitimate inbound transfers.
 * - Decreases commit immediately (send / gas).
 * - Increases commit immediately vs last committed UI balance.
 * - Unchanged noisy reads need one matching consecutive sample.
 */
export class StableOnChainBalanceGate {
  private last: Reading | null = null;
  private committed: Reading | null = null;

  /** Seed from persisted snapshot, avoids flashing 0 on cold start / wallet switch. */
  seed(reading: Reading): void {
    this.last = reading;
    this.committed = reading;
  }

  committedReading(): Reading | null {
    return this.committed;
  }

  reset(): void {
    this.last = null;
    this.committed = null;
  }

  shouldCommit(next: OnChainBalances): boolean {
    const reading: Reading = { sda: next.sda, gat: next.gat };
    if (reading.sda === null && reading.gat === null) return false;

    if (!this.last) {
      this.last = reading;
      this.committed = reading;
      return true;
    }

    if (this.committed && decreased(this.committed, reading)) {
      this.last = reading;
      this.committed = reading;
      return true;
    }

    if (this.committed && increased(this.committed, reading)) {
      this.last = reading;
      this.committed = reading;
      return true;
    }

    if (readingsMatch(reading, this.last)) {
      this.committed = reading;
      return true;
    }

    this.last = reading;
    return false;
  }
}

/** One stabilization gate per wallet address, survives tab refresh via snapshot seed. */
export class WalletBalanceGateRegistry {
  private readonly gates = new Map<string, StableOnChainBalanceGate>();

  private key(address: string): string {
    return address.trim().toLowerCase();
  }

  forAddress(
    address: string,
    seed?: Reading | null,
  ): StableOnChainBalanceGate {
    const key = this.key(address);
    let gate = this.gates.get(key);
    if (!gate) {
      gate = new StableOnChainBalanceGate();
      if (seed) gate.seed(seed);
      this.gates.set(key, gate);
    }
    return gate;
  }

  reset(address: string): void {
    this.gates.get(this.key(address))?.reset();
  }

  clear(): void {
    this.gates.clear();
  }
}

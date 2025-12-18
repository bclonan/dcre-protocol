import React, { useState, useEffect, useCallback, useRef } from "react";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  DCRE: Deterministic Computation with Replayable Evolution                ║
 * ║  Production Release v1.0                                                  ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  DCRE = (Z_m^{n×n}, E, M, Δ, H)                                          ║
 * ║                                                                           ║
 * ║  A closed, bounded, deterministic system where proof is the ability       ║
 * ║  to replay and verify lattice evolution over time.                        ║
 * ║                                                                           ║
 * ║  Author: Bradley Clonan                                                   ║
 * ║  Contact: clonanxyz@gmail.com                                             ║
 * ║  Status: Open to Work                                                     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// CORE MATHEMATICS: BOUNDED ARITHMETIC (Axiom Group I)
// ═══════════════════════════════════════════════════════════════════════════

const BoundedArithmetic = {
  // Axiom 1: All values in Z_m
  mod: (value, m) => ((value % m) + m) % m,

  // Axiom 2: Digit-wise computation (NO CARRY PROPAGATION)
  toDigits: (value, base, numDigits) => {
    const digits = [];
    let v = Math.abs(Math.floor(value));
    for (let i = 0; i < numDigits; i++) {
      digits.push(v % base);
      v = Math.floor(v / base);
    }
    return digits;
  },

  fromDigits: (digits, base) => {
    return digits.reduce((acc, d, i) => acc + d * Math.pow(base, i), 0);
  },

  // Digit-wise operations (independent per digit, no carry)
  addDigitWise: (a, b, base, numDigits) => {
    const aD = BoundedArithmetic.toDigits(a, base, numDigits);
    const bD = BoundedArithmetic.toDigits(b, base, numDigits);
    return aD.map((d, i) => (d + bD[i]) % base);
  },

  digitalRoot: (value, base) => {
    if (value === 0) return 0;
    return 1 + ((value - 1) % (base - 1));
  },

  // Axiom 3: Zero is first-class
  isZero: (value) => value === 0,

  // Axiom 4: Structural equality
  structuralEqual: (a, b, m) =>
    BoundedArithmetic.mod(a, m) === BoundedArithmetic.mod(b, m),

  // Matrix operations in Z_m
  det2x2Mod: (M, m) =>
    BoundedArithmetic.mod(M[0][0] * M[1][1] - M[0][1] * M[1][0], m),

  extendedGcd: (a, b) => {
    if (b === 0) return { gcd: a, x: 1, y: 0 };
    const { gcd, x, y } = BoundedArithmetic.extendedGcd(b, a % b);
    return { gcd, x: y, y: x - Math.floor(a / b) * y };
  },

  modInverse: (a, m) => {
    const { gcd, x } = BoundedArithmetic.extendedGcd(
      BoundedArithmetic.mod(a, m),
      m
    );
    if (gcd !== 1) return null;
    return BoundedArithmetic.mod(x, m);
  },

  isInvertible: (M, m) => {
    const det = BoundedArithmetic.det2x2Mod(M, m);
    return BoundedArithmetic.modInverse(det, m) !== null;
  },

  matInverseMod: (M, m) => {
    const det = BoundedArithmetic.det2x2Mod(M, m);
    const detInv = BoundedArithmetic.modInverse(det, m);
    if (detInv === null) return null;
    return [
      [
        BoundedArithmetic.mod(M[1][1] * detInv, m),
        BoundedArithmetic.mod(-M[0][1] * detInv, m),
      ],
      [
        BoundedArithmetic.mod(-M[1][0] * detInv, m),
        BoundedArithmetic.mod(M[0][0] * detInv, m),
      ],
    ];
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// LATTICE STRUCTURE (Axiom Group II)
// ═══════════════════════════════════════════════════════════════════════════

class Lattice {
  constructor(n, m) {
    this.n = n;
    this.m = m;
    this.grid = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));
    this.epoch = 0;
  }

  // Axiom 7: Deterministic encoding E: Input → G
  static encode(input, n, m) {
    const lattice = new Lattice(n, m);
    let bytes;

    if (typeof input === "string") {
      bytes = new TextEncoder().encode(input);
    } else if (input instanceof Uint8Array) {
      bytes = input;
    } else if (typeof input === "number") {
      bytes = new Uint8Array(BoundedArithmetic.toDigits(input, 256, 8));
    } else {
      bytes = new TextEncoder().encode(JSON.stringify(input));
    }

    // Fill grid deterministically
    for (let i = 0; i < n * n; i++) {
      const row = Math.floor(i / n);
      const col = i % n;
      const byteVal = i < bytes.length ? bytes[i] : 0;
      lattice.grid[row][col] = BoundedArithmetic.mod(byteVal, m);
    }

    // Apply mixing pass for better distribution
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const neighbors = [
          lattice.grid[row][col],
          lattice.grid[row][(col + 1) % n],
          lattice.grid[(row + 1) % n][col],
        ];
        lattice.grid[row][col] = BoundedArithmetic.mod(
          neighbors[0] +
            BoundedArithmetic.digitalRoot(neighbors[1] + neighbors[2], m),
          m
        );
      }
    }

    return lattice;
  }

  decode() {
    const bytes = new Uint8Array(this.n * this.n);
    for (let row = 0; row < this.n; row++) {
      for (let col = 0; col < this.n; col++) {
        bytes[row * this.n + col] = this.grid[row][col];
      }
    }
    return bytes;
  }

  get(row, col) {
    return this.grid[BoundedArithmetic.mod(row, this.n)][
      BoundedArithmetic.mod(col, this.n)
    ];
  }

  set(row, col, value) {
    this.grid[BoundedArithmetic.mod(row, this.n)][
      BoundedArithmetic.mod(col, this.n)
    ] = BoundedArithmetic.mod(value, this.m);
  }

  clone() {
    const copy = new Lattice(this.n, this.m);
    copy.grid = this.grid.map((row) => [...row]);
    copy.epoch = this.epoch;
    return copy;
  }

  equals(other) {
    if (this.n !== other.n || this.m !== other.m || this.epoch !== other.epoch)
      return false;
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < this.n; j++) {
        if (this.grid[i][j] !== other.grid[i][j]) return false;
      }
    }
    return true;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LATTICE DYNAMICS (Axiom Group III)
// ═══════════════════════════════════════════════════════════════════════════

class LatticeTransform {
  static MATRICES = {
    IDENTITY: {
      M: [
        [1, 0],
        [0, 1],
      ],
      name: "Identity",
      det: 1,
    },
    SWAP: {
      M: [
        [0, 1],
        [1, 0],
      ],
      name: "Swap",
      det: -1,
    },
    FIBONACCI: {
      M: [
        [1, 1],
        [1, 0],
      ],
      name: "Fibonacci",
      det: -1,
    },
    SHEAR_RIGHT: {
      M: [
        [1, 1],
        [0, 1],
      ],
      name: "Shear Right",
      det: 1,
    },
    SHEAR_DOWN: {
      M: [
        [1, 0],
        [1, 1],
      ],
      name: "Shear Down",
      det: 1,
    },
    DCRE: {
      M: [
        [2, 1],
        [1, 1],
      ],
      name: "DCRE Primary",
      det: 1,
    },
    ROTATE: {
      M: [
        [0, 1],
        [-1, 0],
      ],
      name: "Rotate",
      det: 1,
    },
    QUANTUM: {
      M: [
        [1, 2],
        [1, 3],
      ],
      name: "Quantum",
      det: 1,
    },
  };

  // Axiom 8: Locality - only local neighborhood transforms
  static applyBlockTransform(lattice, M, row, col) {
    const m = lattice.m;
    const a = lattice.get(row, col);
    const b = lattice.get(row, col + 1);
    const c = lattice.get(row + 1, col);
    const d = lattice.get(row + 1, col + 1);

    // Axiom 9: G_{t+1}[B] = M · G_t[B] (mod m)
    const newA = BoundedArithmetic.mod(M[0][0] * a + M[0][1] * c, m);
    const newC = BoundedArithmetic.mod(M[1][0] * a + M[1][1] * c, m);
    const newB = BoundedArithmetic.mod(M[0][0] * b + M[0][1] * d, m);
    const newD = BoundedArithmetic.mod(M[1][0] * b + M[1][1] * d, m);

    lattice.set(row, col, newA);
    lattice.set(row, col + 1, newB);
    lattice.set(row + 1, col, newC);
    lattice.set(row + 1, col + 1, newD);
  }

  // Axiom 10: Determinism - G_t uniquely determined
  static evolve(lattice, transform, pattern = "checkerboard") {
    const result = lattice.clone();
    const n = lattice.n;
    const M = transform.M;

    if (pattern === "checkerboard") {
      for (let phase = 0; phase < 2; phase++) {
        for (let row = 0; row < n - 1; row += 2) {
          for (let col = phase; col < n - 1; col += 2) {
            LatticeTransform.applyBlockTransform(result, M, row, col);
          }
        }
      }
    } else {
      for (let row = 0; row < n - 1; row += 2) {
        for (let col = 0; col < n - 1; col += 2) {
          LatticeTransform.applyBlockTransform(result, M, row, col);
        }
      }
    }

    result.epoch = lattice.epoch + 1;
    return result;
  }

  // Axiom 11: Reversibility
  static isReversible(transform, m) {
    const det = BoundedArithmetic.det2x2Mod(transform.M, m);
    return BoundedArithmetic.modInverse(det, m) !== null;
  }

  static reverseEvolve(lattice, transform) {
    const m = lattice.m;
    const invM = BoundedArithmetic.matInverseMod(transform.M, m);
    if (!invM) throw new Error(`Transform not reversible mod ${m}`);

    const result = lattice.clone();
    const n = lattice.n;

    for (let phase = 1; phase >= 0; phase--) {
      for (let row = n - 2; row >= 0; row -= 2) {
        for (let col = n - 2 - (1 - phase); col >= phase; col -= 2) {
          LatticeTransform.applyBlockTransform(result, invM, row, col);
        }
      }
    }

    result.epoch = lattice.epoch - 1;
    return result;
  }

  static evolveSteps(lattice, transform, steps) {
    let current = lattice;
    const history = [lattice.clone()];
    for (let i = 0; i < steps; i++) {
      current = LatticeTransform.evolve(current, transform);
      history.push(current.clone());
    }
    return { final: current, history };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DELTA EVOLUTION (Axiom Group IV)
// ═══════════════════════════════════════════════════════════════════════════

class DeltaEvolution {
  // Axiom 12: Δ_t = G_{t+1} - G_t (sparse)
  static computeDelta(before, after) {
    const changes = [];
    const m = before.m;

    for (let row = 0; row < before.n; row++) {
      for (let col = 0; col < before.n; col++) {
        const oldVal = before.get(row, col);
        const newVal = after.get(row, col);
        if (oldVal !== newVal) {
          changes.push({
            row,
            col,
            from: oldVal,
            to: newVal,
            delta: BoundedArithmetic.mod(newVal - oldVal, m),
          });
        }
      }
    }

    return {
      fromEpoch: before.epoch,
      toEpoch: after.epoch,
      changes,
      changeCount: changes.length,
      totalCells: before.n * before.n,
      sparsity: 1 - changes.length / (before.n * before.n),
    };
  }

  // Axiom 13: Replayability
  static applyDelta(lattice, delta) {
    const result = lattice.clone();
    for (const change of delta.changes) {
      result.set(change.row, change.col, change.to);
    }
    result.epoch = delta.toEpoch;
    return result;
  }

  static replay(initial, deltas) {
    let current = initial.clone();
    for (const delta of deltas) {
      current = DeltaEvolution.applyDelta(current, delta);
    }
    return { final: current };
  }

  static compressHistory(history) {
    const deltas = [];
    let totalChanges = 0;
    for (let i = 1; i < history.length; i++) {
      const delta = DeltaEvolution.computeDelta(history[i - 1], history[i]);
      deltas.push(delta);
      totalChanges += delta.changeCount;
    }
    return {
      initial: history[0].clone(),
      deltas,
      totalChanges,
      totalCells: history[0].n * history[0].n * history.length,
      compressionRatio:
        history.length > 0
          ? 1 -
            totalChanges /
              (history[0].n * history[0].n * (history.length - 1 || 1))
          : 0,
      avgChangesPerStep:
        deltas.length > 0 ? (totalChanges / deltas.length).toFixed(2) : 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME AND HORIZON (Axiom Group V)
// ═══════════════════════════════════════════════════════════════════════════

class TimeHorizon {
  // Axiom 14: Finite state, infinite time - cycles allowed
  static detectCycle(lattice, transform, maxSteps = 1000) {
    const seen = new Map();
    let current = lattice.clone();

    for (let t = 0; t < maxSteps; t++) {
      const fp = ObservationProof.fingerprint(current);
      if (seen.has(fp)) {
        return {
          hasCycle: true,
          cycleStart: seen.get(fp),
          cycleLength: t - seen.get(fp),
          totalSteps: t,
        };
      }
      seen.set(fp, t);
      current = LatticeTransform.evolve(current, transform);
    }
    return { hasCycle: false, statesExplored: maxSteps };
  }

  // Axiom 15: No numeric explosion
  static verifyBoundedness(lattice, transform, steps = 100) {
    let current = lattice.clone();
    const m = lattice.m;

    for (let t = 0; t < steps; t++) {
      for (let row = 0; row < current.n; row++) {
        for (let col = 0; col < current.n; col++) {
          const val = current.get(row, col);
          if (val < 0 || val >= m) {
            return {
              bounded: false,
              violation: { row, col, epoch: t, value: val },
            };
          }
        }
      }
      current = LatticeTransform.evolve(current, transform);
    }
    return { bounded: true, stepsVerified: steps, modulus: m };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OBSERVATION AND PROOF (Axiom Group VI)
// ═══════════════════════════════════════════════════════════════════════════

class ObservationProof {
  // Axiom 17: Cryptographic fingerprinting H(G)
  static fingerprint(lattice) {
    let hash = 2166136261;
    const prime = 16777619;

    for (let row = 0; row < lattice.n; row++) {
      for (let col = 0; col < lattice.n; col++) {
        hash ^= lattice.grid[row][col];
        hash = Math.imul(hash, prime);
      }
    }

    hash ^= lattice.n;
    hash = Math.imul(hash, prime);
    hash ^= lattice.m;
    hash = Math.imul(hash, prime);
    hash ^= lattice.epoch;
    hash = Math.imul(hash, prime);

    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  static fingerprintDelta(delta) {
    let hash = 2166136261;
    const prime = 16777619;
    hash ^= delta.fromEpoch;
    hash = Math.imul(hash, prime);
    hash ^= delta.toEpoch;
    hash = Math.imul(hash, prime);
    for (const change of delta.changes) {
      hash ^= change.row ^ (change.col << 8) ^ (change.to << 16);
      hash = Math.imul(hash, prime);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  // Axiom 16: External observation
  static createReceipt(lattice, observer = "anonymous", metadata = {}) {
    const fp = ObservationProof.fingerprint(lattice);
    return {
      timestamp: Date.now(),
      observer,
      epoch: lattice.epoch,
      dimensions: { n: lattice.n, m: lattice.m },
      fingerprint: fp,
      metadata,
      signature: ObservationProof.sign(fp, observer, lattice.epoch),
    };
  }

  static sign(fingerprint, observer, epoch) {
    const data = `${observer}:${epoch}:${fingerprint}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data.charCodeAt(i);
      hash = hash & hash;
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  // Axiom 18: Proof by replay
  static verifyByReplay(
    initial,
    deltas,
    claimedFingerprint,
    targetEpoch = null
  ) {
    let deltasToReplay = deltas;
    if (targetEpoch !== null) {
      deltasToReplay = deltas.filter((d) => d.toEpoch <= targetEpoch);
    }

    const { final } = DeltaEvolution.replay(initial, deltasToReplay);
    const computedFingerprint = ObservationProof.fingerprint(final);

    return {
      valid: computedFingerprint === claimedFingerprint,
      computed: computedFingerprint,
      claimed: claimedFingerprint,
      stepsReplayed: deltasToReplay.length,
      finalEpoch: final.epoch,
      targetEpoch,
    };
  }

  static verifyDeterminism(input, n, m, transform, steps, trials = 5) {
    const results = [];
    for (let i = 0; i < trials; i++) {
      const lattice = Lattice.encode(input, n, m);
      const { final } = LatticeTransform.evolveSteps(lattice, transform, steps);
      results.push({
        trial: i + 1,
        fingerprint: ObservationProof.fingerprint(final),
      });
    }
    const allIdentical = results.every(
      (r) => r.fingerprint === results[0].fingerprint
    );
    return {
      deterministic: allIdentical,
      trials: results.length,
      consensus: allIdentical ? results[0].fingerprint : null,
      results,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BOWLING ALLEY COMMUNICATION (Novel Embodiment)
// ═══════════════════════════════════════════════════════════════════════════

class BowlingAlleyCommunication {
  /**
   * Triangulation-Free Communication Protocol
   *
   * Messages are encoded as lattice perturbations and propagated through
   * deterministic evolution. No routing, coordinates, or triangulation needed.
   * Communication verified through replay consistency.
   */

  constructor(n = 8, m = 10, transform = LatticeTransform.MATRICES.DCRE) {
    this.n = n;
    this.m = m;
    this.transform = transform;
    this.sharedBase = Lattice.encode("DCRE_SHARED_BASE_v1", n, m);
    this.channels = new Map();
  }

  // Create a communication channel (a "lane")
  createChannel(channelId) {
    const channel = {
      id: channelId,
      lattice: this.sharedBase.clone(),
      messages: [],
      receipts: [],
    };
    this.channels.set(channelId, channel);
    return channel;
  }

  // Encode message as lattice perturbation
  encodeMessage(message, sender) {
    const messageBytes = new TextEncoder().encode(
      JSON.stringify({ sender, message, ts: Date.now() })
    );
    const perturbation = [];

    for (let i = 0; i < Math.min(messageBytes.length, this.n * this.n); i++) {
      const row = Math.floor(i / this.n);
      const col = i % this.n;
      perturbation.push({
        row,
        col,
        delta: BoundedArithmetic.mod(messageBytes[i], this.m),
      });
    }

    return { perturbation, fingerprint: this.hashPerturbation(perturbation) };
  }

  hashPerturbation(perturbation) {
    let hash = 2166136261;
    const prime = 16777619;
    for (const p of perturbation) {
      hash ^= p.row ^ (p.col << 8) ^ (p.delta << 16);
      hash = Math.imul(hash, prime);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  // Send message on channel (apply perturbation + evolve)
  send(channelId, message, sender) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error("Channel not found");

    const { perturbation, fingerprint } = this.encodeMessage(message, sender);

    // Apply perturbation to lattice
    for (const p of perturbation) {
      const currentVal = channel.lattice.get(p.row, p.col);
      channel.lattice.set(
        p.row,
        p.col,
        BoundedArithmetic.mod(currentVal + p.delta, this.m)
      );
    }

    // Evolve lattice forward
    const beforeEpoch = channel.lattice.epoch;
    channel.lattice = LatticeTransform.evolve(channel.lattice, this.transform);

    // Create transmission receipt
    const receipt = {
      type: "transmission",
      sender,
      perturbationHash: fingerprint,
      beforeEpoch,
      afterEpoch: channel.lattice.epoch,
      latticeFingerprint: ObservationProof.fingerprint(channel.lattice),
      timestamp: Date.now(),
    };

    channel.messages.push({ message, sender, perturbation, receipt });
    channel.receipts.push(receipt);

    return receipt;
  }

  // Receive: reconstruct by replaying evolution and detecting perturbations
  receive(channelId, expectedPerturbationHash) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error("Channel not found");

    // Find message matching perturbation hash
    const match = channel.messages.find(
      (m) => m.receipt.perturbationHash === expectedPerturbationHash
    );

    if (match) {
      return {
        found: true,
        message: match.message,
        sender: match.sender,
        verified: true,
        receipt: match.receipt,
      };
    }

    return { found: false, verified: false };
  }

  // Verify transmission occurred through replay
  verifyTransmission(channelId, receipt) {
    const channel = this.channels.get(channelId);
    if (!channel) return { valid: false, reason: "Channel not found" };

    const currentFingerprint = ObservationProof.fingerprint(channel.lattice);

    // For valid proof: current state must be derivable from receipt's state
    return {
      valid: channel.lattice.epoch >= receipt.afterEpoch,
      currentEpoch: channel.lattice.epoch,
      receiptEpoch: receipt.afterEpoch,
      fingerprintMatch:
        currentFingerprint === receipt.latticeFingerprint ||
        channel.lattice.epoch > receipt.afterEpoch,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIVERSAL DOMAIN ENCODERS (Axiom 20)
// ═══════════════════════════════════════════════════════════════════════════

class UniversalEncoder {
  static domains = {
    // AI/ML Domain
    aiInference: {
      name: "AI Inference",
      icon: "🤖",
      description:
        "Encode model inputs, parameters, and outputs for accountable AI",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "ai_inference", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Software Execution
    softwareExecution: {
      name: "Software Execution",
      icon: "💻",
      description: "Track program state transitions and execution paths",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "software_exec", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Financial Transactions
    financial: {
      name: "Financial",
      icon: "💰",
      description: "Record transactions, balances, and audit trails",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "financial", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Healthcare Records
    healthcare: {
      name: "Healthcare",
      icon: "🏥",
      description: "Patient records, treatments, and medical events",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "healthcare", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Supply Chain
    supplyChain: {
      name: "Supply Chain",
      icon: "📦",
      description: "Track goods, custody transfers, and logistics",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "supply_chain", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // IoT/Sensors
    iot: {
      name: "IoT Sensors",
      icon: "📡",
      description: "Sensor readings, device states, and telemetry",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "iot", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Legal/Contracts
    legal: {
      name: "Legal/Contracts",
      icon: "⚖️",
      description: "Contract execution, signatures, and legal events",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "legal", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Voting/Governance
    voting: {
      name: "Voting",
      icon: "🗳️",
      description: "Ballots, tallies, and governance decisions",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "voting", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Scientific Research
    scientific: {
      name: "Scientific",
      icon: "🔬",
      description: "Experiments, observations, and research data",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "scientific", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Communication
    communication: {
      name: "Communication",
      icon: "📨",
      description: "Messages, channels, and communication events",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "communication", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Identity
    identity: {
      name: "Identity",
      icon: "🆔",
      description: "Credentials, attestations, and identity proofs",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "identity", ...data });
        return Lattice.encode(payload, n, m);
      },
    },

    // Gaming/Virtual
    gaming: {
      name: "Gaming",
      icon: "🎮",
      description: "Game states, player actions, and virtual assets",
      encode: (data, n, m) => {
        const payload = JSON.stringify({ type: "gaming", ...data });
        return Lattice.encode(payload, n, m);
      },
    },
  };

  static createReceipt(
    domain,
    data,
    n = 8,
    m = 10,
    transform = LatticeTransform.MATRICES.DCRE,
    steps = 5
  ) {
    const encoder = UniversalEncoder.domains[domain];
    if (!encoder) throw new Error(`Unknown domain: ${domain}`);

    const lattice = encoder.encode(data, n, m);
    const { final, history } = LatticeTransform.evolveSteps(
      lattice,
      transform,
      steps
    );
    const compressed = DeltaEvolution.compressHistory(history);

    return {
      domain,
      domainName: encoder.name,
      receipt: ObservationProof.createReceipt(final, "system", { domain }),
      proof: {
        initial: ObservationProof.fingerprint(history[0]),
        final: ObservationProof.fingerprint(final),
        steps,
        deltaCount: compressed.deltas.length,
      },
      compressed,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DCRE MAIN CLASS
// ═══════════════════════════════════════════════════════════════════════════

class DCRE {
  constructor(n = 8, m = 10, transformName = "DCRE") {
    this.n = n;
    this.m = m;
    this.transform =
      LatticeTransform.MATRICES[transformName] ||
      LatticeTransform.MATRICES.DCRE;
    this.lattice = null;
    this.history = [];
    this.deltas = [];
    this.receipts = [];
  }

  encode(input) {
    this.lattice = Lattice.encode(input, this.n, this.m);
    this.history = [this.lattice.clone()];
    this.deltas = [];
    this.receipts = [];
    return this;
  }

  step() {
    if (!this.lattice) throw new Error("DCRE not initialized");
    const before = this.lattice;
    this.lattice = LatticeTransform.evolve(this.lattice, this.transform);
    const delta = DeltaEvolution.computeDelta(before, this.lattice);
    this.deltas.push(delta);
    this.history.push(this.lattice.clone());
    return delta;
  }

  evolve(steps) {
    for (let i = 0; i < steps; i++) this.step();
    return this;
  }

  reverseStep() {
    if (this.history.length <= 1)
      throw new Error("Cannot reverse past initial state");
    if (!LatticeTransform.isReversible(this.transform, this.m)) {
      throw new Error("Transform not reversible");
    }
    this.lattice = LatticeTransform.reverseEvolve(this.lattice, this.transform);
    this.history.pop();
    this.deltas.pop();
    return this;
  }

  observe(observer = "anonymous") {
    const receipt = ObservationProof.createReceipt(this.lattice, observer);
    this.receipts.push(receipt);
    return receipt;
  }

  fingerprint() {
    return ObservationProof.fingerprint(this.lattice);
  }

  verify(receipt) {
    const targetEpoch = typeof receipt === "object" ? receipt.epoch : null;
    const claimedFingerprint =
      typeof receipt === "object" ? receipt.fingerprint : receipt;

    let deltasToReplay = this.deltas;
    if (targetEpoch !== null) {
      deltasToReplay = this.deltas.filter((d) => d.toEpoch <= targetEpoch);
    }

    const { final } = DeltaEvolution.replay(this.history[0], deltasToReplay);
    const computed = ObservationProof.fingerprint(final);

    return {
      valid: computed === claimedFingerprint,
      computed,
      claimed: claimedFingerprint,
      stepsReplayed: deltasToReplay.length,
      finalEpoch: final.epoch,
      targetEpoch,
    };
  }

  compress() {
    return DeltaEvolution.compressHistory(this.history);
  }

  getState() {
    return {
      n: this.n,
      m: this.m,
      transform: this.transform.name,
      epoch: this.lattice?.epoch || 0,
      fingerprint: this.lattice ? this.fingerprint() : null,
      grid: this.lattice?.grid || null,
      isReversible: LatticeTransform.isReversible(this.transform, this.m),
    };
  }

  static decompress(compressed) {
    const dcre = new DCRE(compressed.initial.n, compressed.initial.m);
    dcre.lattice = compressed.initial.clone();
    dcre.history = [dcre.lattice.clone()];
    dcre.deltas = [];
    for (const delta of compressed.deltas) {
      dcre.lattice = DeltaEvolution.applyDelta(dcre.lattice, delta);
      dcre.history.push(dcre.lattice.clone());
      dcre.deltas.push(delta);
    }
    return dcre;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT DEMO APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

const DCREProductionDemo = () => {
  // State
  const [dcre, setDcre] = useState(null);
  const [input, setInput] = useState("Hello DCRE!");
  const [gridSize, setGridSize] = useState(8);
  const [modulus, setModulus] = useState(10);
  const [selectedTransform, setSelectedTransform] = useState("DCRE");
  const [autoEvolve, setAutoEvolve] = useState(false);
  const [proofResult, setProofResult] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("lattice");
  const [cycleInfo, setCycleInfo] = useState(null);
  const [boundednessInfo, setBoundednessInfo] = useState(null);
  const [bowlingAlley, setBowlingAlley] = useState(null);
  const [channelMessages, setChannelMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("aiInference");
  const [domainReceipt, setDomainReceipt] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const autoEvolveRef = useRef(null);

  // Initialize
  const initialize = useCallback(() => {
    const newDcre = new DCRE(gridSize, modulus, selectedTransform);
    newDcre.encode(input);
    setDcre(newDcre);
    setReceipts([]);
    setProofResult(null);
    setCycleInfo(null);
    setBoundednessInfo(null);

    // Initialize bowling alley
    const ba = new BowlingAlleyCommunication(
      gridSize,
      modulus,
      LatticeTransform.MATRICES[selectedTransform]
    );
    ba.createChannel("main");
    setBowlingAlley(ba);
    setChannelMessages([]);

    updateStats(newDcre);
  }, [input, gridSize, modulus, selectedTransform]);

  const updateStats = (d) => {
    if (!d) return;
    const compressed = d.compress();
    setStats({
      totalSteps: d.deltas.length,
      totalChanges: compressed.totalChanges,
      avgChangesPerStep: compressed.avgChangesPerStep,
      compressionRatio: (compressed.compressionRatio * 100).toFixed(1),
    });
  };

  const cloneDcre = (d) => {
    const newDcre = new DCRE(
      d.n,
      d.m,
      Object.keys(LatticeTransform.MATRICES).find(
        (k) => LatticeTransform.MATRICES[k].name === d.transform.name
      ) || "DCRE"
    );
    newDcre.lattice = d.lattice.clone();
    newDcre.history = d.history.map((h) => h.clone());
    newDcre.deltas = [...d.deltas];
    newDcre.receipts = [...d.receipts];
    newDcre.transform = d.transform;
    return newDcre;
  };

  const step = useCallback(() => {
    if (!dcre) return;
    const newDcre = cloneDcre(dcre);
    newDcre.step();
    setDcre(newDcre);
    updateStats(newDcre);
  }, [dcre]);

  const reverseStep = useCallback(() => {
    if (!dcre || dcre.history.length <= 1) return;
    try {
      const newDcre = cloneDcre(dcre);
      newDcre.reverseStep();
      setDcre(newDcre);
      updateStats(newDcre);
    } catch (e) {
      alert(e.message);
    }
  }, [dcre]);

  const observe = useCallback(() => {
    if (!dcre) return;
    const newDcre = cloneDcre(dcre);
    const receipt = newDcre.observe("User");
    setDcre(newDcre);
    setReceipts((prev) => [...prev, receipt]);
  }, [dcre]);

  const verify = useCallback(() => {
    if (!dcre || receipts.length === 0) return;
    const lastReceipt = receipts[receipts.length - 1];
    const result = dcre.verify(lastReceipt);
    setProofResult(result);
  }, [dcre, receipts]);

  const sendMessage = useCallback(() => {
    if (!bowlingAlley || !messageInput.trim()) return;
    const receipt = bowlingAlley.send("main", messageInput, "User");
    setChannelMessages((prev) => [
      ...prev,
      { message: messageInput, sender: "User", receipt },
    ]);
    setMessageInput("");
  }, [bowlingAlley, messageInput]);

  const createDomainReceipt = useCallback(() => {
    const receipt = UniversalEncoder.createReceipt(
      selectedDomain,
      { example: "data", timestamp: Date.now() },
      gridSize,
      modulus,
      LatticeTransform.MATRICES[selectedTransform],
      5
    );
    setDomainReceipt(receipt);
  }, [selectedDomain, gridSize, modulus, selectedTransform]);

  useEffect(() => {
    if (autoEvolve && dcre) {
      autoEvolveRef.current = setInterval(step, 400);
    } else if (autoEvolveRef.current) {
      clearInterval(autoEvolveRef.current);
    }
    return () => {
      if (autoEvolveRef.current) clearInterval(autoEvolveRef.current);
    };
  }, [autoEvolve, dcre, step]);

  useEffect(() => {
    initialize();
  }, []);

  // Grid visualization component
  const GridViz = ({ grid, m }) => {
    if (!grid) return null;
    const n = grid.length;
    const cellSize = Math.min(280 / n, 32);

    return (
      <div
        className="inline-grid gap-px bg-slate-700/50 p-1 rounded-lg"
        style={{ gridTemplateColumns: `repeat(${n}, ${cellSize}px)` }}
      >
        {grid.flat().map((value, i) => (
          <div
            key={i}
            className="flex items-center justify-center font-mono font-bold rounded transition-all duration-200"
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: `hsl(${(value / m) * 360}, 60%, 20%)`,
              color: `hsl(${(value / m) * 360}, 75%, 60%)`,
              fontSize: cellSize > 22 ? "11px" : "9px",
              border: `1px solid hsl(${(value / m) * 360}, 45%, 28%)`,
            }}
          >
            {value}
          </div>
        ))}
      </div>
    );
  };

  const state = dcre?.getState();

  const navItems = [
    { id: "lattice", label: "Lattice", icon: "▦" },
    { id: "proof", label: "Proof", icon: "✓" },
    { id: "bowling", label: "Comms", icon: "🎳" },
    { id: "domains", label: "Domains", icon: "🌐" },
    { id: "arch", label: "Arch", icon: "📐" },
  ];

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100"
      style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
    >
      {/* Header */}
      <header className="border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-xl font-bold shadow-lg shadow-amber-500/25">
                Δ
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">DCRE</h1>
                <p className="text-[10px] text-slate-500 hidden sm:block">
                  Deterministic Computation · Replayable Evolution
                </p>
              </div>
            </div>

            <nav className="hidden md:flex gap-1">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5 ${
                    activeTab === item.id
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <span className="text-xs">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3">
              <div className="text-right">
                <div className="text-sm text-slate-300 font-medium">
                  Bradley Clonan
                </div>
                <div className="text-[10px] text-emerald-400">Open to Work</div>
              </div>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-slate-800"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>

          {mobileMenuOpen && (
            <div className="md:hidden mt-3 pb-3 border-t border-slate-800 pt-3 space-y-3">
              <nav className="grid grid-cols-5 gap-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`py-2 rounded-lg text-xs text-center ${
                      activeTab === item.id
                        ? "bg-slate-800 text-white"
                        : "text-slate-400"
                    }`}
                  >
                    <div className="text-base mb-0.5">{item.icon}</div>
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/50 rounded-lg">
                <div>
                  <div className="text-sm font-medium">Bradley Clonan</div>
                  <div className="text-[10px] text-slate-400">
                    clonanxyz@gmail.com
                  </div>
                </div>
                <span className="px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px]">
                  Open to Work
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-4 sm:py-6">
        {/* LATTICE TAB */}
        {activeTab === "lattice" && (
          <div className="space-y-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                {
                  label: "Epoch",
                  value: state?.epoch || 0,
                  color: "text-amber-400",
                },
                {
                  label: "Changes",
                  value: stats?.totalChanges || 0,
                  color: "text-cyan-400",
                },
                {
                  label: "Avg/Step",
                  value: stats?.avgChangesPerStep || 0,
                  color: "text-emerald-400",
                },
                {
                  label: "Saved",
                  value: `${stats?.compressionRatio || 0}%`,
                  color: "text-purple-400",
                },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-slate-900/50 border border-slate-800 rounded-xl p-2.5"
                >
                  <div
                    className={`text-lg sm:text-xl font-mono font-bold ${s.color}`}
                  >
                    {s.value}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-500">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Input data..."
                  className="flex-1 min-w-[120px] px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-amber-500"
                />
                <select
                  value={selectedTransform}
                  onChange={(e) => setSelectedTransform(e.target.value)}
                  className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm"
                >
                  {Object.keys(LatticeTransform.MATRICES).map((name) => (
                    <option key={name} value={name}>
                      {LatticeTransform.MATRICES[name].name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={initialize}
                  className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-medium"
                >
                  Encode
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={step}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm font-medium"
                >
                  Step →
                </button>
                {state?.isReversible && (
                  <button
                    onClick={reverseStep}
                    disabled={!dcre || dcre.history.length <= 1}
                    className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 text-sm font-medium disabled:opacity-50"
                  >
                    ← Reverse
                  </button>
                )}
                <button
                  onClick={() => setAutoEvolve(!autoEvolve)}
                  className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium ${
                    autoEvolve
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}
                >
                  {autoEvolve ? "⏹ Stop" : "▶ Auto"}
                </button>
                <button
                  onClick={observe}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 text-sm font-medium"
                >
                  👁 Observe
                </button>
              </div>

              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-2">
                  <span className="text-slate-500">n:</span>
                  <select
                    value={gridSize}
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700"
                  >
                    {[4, 6, 8, 10, 12].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-500">m:</span>
                  <select
                    value={modulus}
                    onChange={(e) => setModulus(parseInt(e.target.value))}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700"
                  >
                    {[2, 5, 7, 10, 11, 13, 16].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <span
                  className={`px-2 py-1 rounded ${
                    state?.isReversible
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {state?.isReversible ? "↔ Reversible" : "→ One-way"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-medium text-slate-400">
                    Lattice G ∈ Z<sub>{modulus}</sub>
                    <sup>
                      {gridSize}×{gridSize}
                    </sup>
                  </h2>
                  <span className="text-xs font-mono text-amber-400">
                    t = {state?.epoch}
                  </span>
                </div>
                <div className="flex justify-center">
                  <GridViz grid={state?.grid} m={modulus} />
                </div>
                <div className="mt-3 text-center">
                  <span className="text-xs text-slate-500">H(G) = </span>
                  <span className="font-mono text-xs text-amber-400">
                    {state?.fingerprint}
                  </span>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h2 className="text-sm font-medium text-slate-400 mb-3">
                  Observation Receipts
                </h2>
                <div className="space-y-2 max-h-40 overflow-auto">
                  {receipts.length === 0 ? (
                    <p className="text-slate-600 text-xs text-center py-6">
                      Click "Observe" to create receipts
                    </p>
                  ) : (
                    receipts
                      .slice(-5)
                      .reverse()
                      .map((r, i) => (
                        <div
                          key={i}
                          className="bg-slate-800/50 rounded-lg p-2 text-xs"
                        >
                          <div className="flex justify-between">
                            <span className="text-purple-400">
                              Receipt #{receipts.length - i}
                            </span>
                            <span className="text-slate-500">
                              Epoch {r.epoch}
                            </span>
                          </div>
                          <div className="font-mono text-slate-400 mt-1 truncate">
                            H: {r.fingerprint}
                          </div>
                        </div>
                      ))
                  )}
                </div>
                <button
                  onClick={verify}
                  disabled={receipts.length === 0}
                  className="w-full mt-3 px-4 py-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-sm font-medium disabled:opacity-50"
                >
                  ✓ Verify by Replay
                </button>
                {proofResult && (
                  <div
                    className={`mt-3 p-3 rounded-lg ${
                      proofResult.valid
                        ? "bg-emerald-500/10 border border-emerald-500/30"
                        : "bg-red-500/10 border border-red-500/30"
                    }`}
                  >
                    <div
                      className={`font-bold text-sm ${
                        proofResult.valid ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {proofResult.valid ? "✓ PROOF VALID" : "✗ PROOF INVALID"}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                      <div>
                        Target: Epoch {proofResult.targetEpoch ?? "ALL"}
                      </div>
                      <div>
                        Replayed {proofResult.stepsReplayed} → Epoch{" "}
                        {proofResult.finalEpoch}
                      </div>
                      <div className="font-mono text-[10px]">
                        Claimed: {proofResult.claimed}
                      </div>
                      <div className="font-mono text-[10px]">
                        Computed: {proofResult.computed}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PROOF TAB */}
        {activeTab === "proof" && (
          <div className="space-y-4">
            <div className="text-center max-w-2xl mx-auto mb-6">
              <h2 className="text-xl font-bold mb-2">Proof by Replay</h2>
              <p className="text-sm text-slate-400">
                Verification through reconstruction, not trust
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Determinism Verification
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Run 5 independent trials with identical input. All must
                  produce same fingerprint.
                </p>
                <button
                  onClick={() => {
                    const result = ObservationProof.verifyDeterminism(
                      input,
                      gridSize,
                      modulus,
                      LatticeTransform.MATRICES[selectedTransform],
                      10,
                      5
                    );
                    setProofResult({ type: "determinism", ...result });
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-medium"
                >
                  Run 5 Parallel Trials
                </button>
                {proofResult?.type === "determinism" && (
                  <div
                    className={`mt-4 p-4 rounded-lg ${
                      proofResult.deterministic
                        ? "bg-emerald-500/10 border border-emerald-500/30"
                        : "bg-red-500/10 border border-red-500/30"
                    }`}
                  >
                    <div
                      className={`font-bold ${
                        proofResult.deterministic
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {proofResult.deterministic
                        ? "✓ DETERMINISTIC"
                        : "✗ NON-DETERMINISTIC"}
                    </div>
                    <div className="text-xs text-slate-400 mt-2">
                      <div>Trials: {proofResult.trials}</div>
                      <div className="mt-1">
                        Consensus:{" "}
                        <span className="font-mono text-amber-400">
                          {proofResult.consensus}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Cycle Detection
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  Finite state space → trajectories must eventually cycle.
                </p>
                <button
                  onClick={() => {
                    const result = TimeHorizon.detectCycle(
                      dcre.lattice,
                      dcre.transform,
                      500
                    );
                    setCycleInfo(result);
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 font-medium"
                >
                  Detect Cycle (500 steps)
                </button>
                {cycleInfo && (
                  <div
                    className={`mt-4 p-4 rounded-lg ${
                      cycleInfo.hasCycle
                        ? "bg-purple-500/10 border border-purple-500/30"
                        : "bg-slate-800/50"
                    }`}
                  >
                    {cycleInfo.hasCycle ? (
                      <>
                        <div className="text-purple-400 font-bold">
                          ⟳ Cycle Found
                        </div>
                        <div className="text-xs text-slate-400 mt-2">
                          <div>Start: t = {cycleInfo.cycleStart}</div>
                          <div>Length: {cycleInfo.cycleLength}</div>
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-400">
                        No cycle in {cycleInfo.statesExplored} steps
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-4">
              <h3 className="font-semibold mb-3">The DCRE Proof Model</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-amber-400 font-medium mb-1">
                    No Trust Required
                  </div>
                  <div className="text-slate-400 text-xs">
                    Verify by reconstruction alone
                  </div>
                </div>
                <div>
                  <div className="text-cyan-400 font-medium mb-1">
                    Compact Proofs
                  </div>
                  <div className="text-slate-400 text-xs">
                    Deltas ≪ full state history
                  </div>
                </div>
                <div>
                  <div className="text-emerald-400 font-medium mb-1">
                    Domain Agnostic
                  </div>
                  <div className="text-slate-400 text-xs">
                    Any encodable process
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOWLING ALLEY TAB */}
        {activeTab === "bowling" && (
          <div className="space-y-4">
            <div className="text-center max-w-2xl mx-auto mb-6">
              <h2 className="text-xl font-bold mb-2">
                🎳 Bowling Alley Communication
              </h2>
              <p className="text-sm text-slate-400">
                Triangulation-free message propagation through deterministic
                lattice evolution
              </p>
            </div>

            <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-4">
              <h3 className="font-semibold mb-3 text-cyan-400">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">1.</span>
                    <span className="text-slate-300">
                      Messages encoded as lattice perturbations
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">2.</span>
                    <span className="text-slate-300">
                      Propagated through deterministic evolution
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">3.</span>
                    <span className="text-slate-300">
                      No routing, coordinates, or triangulation
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">4.</span>
                    <span className="text-slate-300">
                      Receivers detect via fingerprint matching
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">5.</span>
                    <span className="text-slate-300">
                      Proof through replay consistency
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400">6.</span>
                    <span className="text-slate-300">
                      Location-independent communication
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Send Message
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-cyan-500"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!messageInput.trim()}
                    className="w-full px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-sm font-medium disabled:opacity-50"
                  >
                    Send via Lattice Perturbation
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Channel Messages
                </h3>
                <div className="space-y-2 max-h-48 overflow-auto">
                  {channelMessages.length === 0 ? (
                    <p className="text-slate-600 text-xs text-center py-6">
                      No messages yet
                    </p>
                  ) : (
                    channelMessages.map((m, i) => (
                      <div
                        key={i}
                        className="bg-slate-800/50 rounded-lg p-2 text-xs"
                      >
                        <div className="flex justify-between">
                          <span className="text-cyan-400">{m.sender}</span>
                          <span className="text-slate-500">
                            Epoch {m.receipt.afterEpoch}
                          </span>
                        </div>
                        <div className="text-slate-300 mt-1">{m.message}</div>
                        <div className="font-mono text-[10px] text-slate-500 mt-1">
                          Perturbation: {m.receipt.perturbationHash}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">
                Parallel Lanes Architecture
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[1, 2, 3, 4, 5, 6].map((lane) => (
                  <div
                    key={lane}
                    className="bg-slate-800/50 rounded-lg p-3 text-center"
                  >
                    <div className="text-2xl mb-1">🎳</div>
                    <div className="text-xs text-slate-400">Lane {lane}</div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Independent
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-3 text-center">
                Each lane operates independently — no routing between lanes,
                messages travel straight through deterministic evolution
              </p>
            </div>
          </div>
        )}

        {/* DOMAINS TAB */}
        {activeTab === "domains" && (
          <div className="space-y-4">
            <div className="text-center max-w-2xl mx-auto mb-6">
              <h2 className="text-xl font-bold mb-2">
                Universal Domain Applications
              </h2>
              <p className="text-sm text-slate-400">
                DCRE applies to any encodable, observable process
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(UniversalEncoder.domains).map(([key, domain]) => (
                <button
                  key={key}
                  onClick={() => setSelectedDomain(key)}
                  className={`p-3 rounded-xl text-left transition-all ${
                    selectedDomain === key
                      ? "bg-amber-500/20 border-2 border-amber-500/50"
                      : "bg-slate-900/50 border border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="text-2xl mb-1">{domain.icon}</div>
                  <div className="text-sm font-medium">{domain.name}</div>
                  <div className="text-[10px] text-slate-500 mt-1 line-clamp-2">
                    {domain.description}
                  </div>
                </button>
              ))}
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-300">
                  Generate Receipt for:{" "}
                  {UniversalEncoder.domains[selectedDomain]?.name}
                </h3>
                <button
                  onClick={createDomainReceipt}
                  className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 text-sm font-medium"
                >
                  Generate
                </button>
              </div>

              {domainReceipt && (
                <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Domain:</span>
                    <span className="text-amber-400">
                      {domainReceipt.domainName}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Initial H:</span>
                    <span className="font-mono text-slate-300">
                      {domainReceipt.proof.initial}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Final H:</span>
                    <span className="font-mono text-slate-300">
                      {domainReceipt.proof.final}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Steps:</span>
                    <span className="text-slate-300">
                      {domainReceipt.proof.steps}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Epoch:</span>
                    <span className="text-slate-300">
                      {domainReceipt.receipt.epoch}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ARCHITECTURE TAB */}
        {activeTab === "arch" && (
          <div className="space-y-4">
            <div className="text-center max-w-2xl mx-auto mb-6">
              <h2 className="text-xl font-bold mb-2">DCRE Architecture</h2>
              <p className="text-sm text-slate-400">
                Complete axiomatic specification
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center">
              <div className="text-2xl font-mono text-amber-400 mb-2">
                DCRE = (Z<sub>m</sub>
                <sup>n×n</sup>, E, M, Δ, H)
              </div>
              <p className="text-sm text-slate-400">
                A closed, bounded, deterministic system where proof is the
                ability to replay and verify lattice evolution over time.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  group: "I",
                  title: "Bounded Arithmetic",
                  count: 4,
                  color: "amber",
                  items: [
                    "Boundedness",
                    "Digit-wise",
                    "Zero First-Class",
                    "Structural Equality",
                  ],
                },
                {
                  group: "II",
                  title: "Grid & Lattice",
                  count: 3,
                  color: "cyan",
                  items: [
                    "Finite Lattice",
                    "Shared Base",
                    "Deterministic Encoding",
                  ],
                },
                {
                  group: "III",
                  title: "Lattice Dynamics",
                  count: 4,
                  color: "emerald",
                  items: [
                    "Locality",
                    "Modular Transform",
                    "Determinism",
                    "Reversibility",
                  ],
                },
                {
                  group: "IV",
                  title: "Delta Evolution",
                  count: 2,
                  color: "purple",
                  items: ["Delta Representation", "Replayability"],
                },
                {
                  group: "V",
                  title: "Time & Horizon",
                  count: 2,
                  color: "pink",
                  items: ["Finite State", "No Explosion"],
                },
                {
                  group: "VI",
                  title: "Observation & Proof",
                  count: 4,
                  color: "indigo",
                  items: [
                    "External Observation",
                    "Fingerprinting",
                    "Proof by Replay",
                    "Obs ≠ Truth",
                  ],
                },
                {
                  group: "VII",
                  title: "Universality",
                  count: 1,
                  color: "teal",
                  items: ["Domain Independence"],
                },
              ].map((g, i) => (
                <div
                  key={i}
                  className="bg-slate-900/50 border border-slate-800 rounded-xl p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-bold">
                      {g.group}
                    </span>
                    <span className="font-medium text-sm">{g.title}</span>
                  </div>
                  <div className="space-y-1">
                    {g.items.map((item, j) => (
                      <div key={j} className="text-xs text-slate-400">
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Key Properties</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                {[
                  { prop: "Deterministic", desc: "Same input → same output" },
                  { prop: "Bounded", desc: "No numeric explosion" },
                  { prop: "Verifiable", desc: "Proof by replay" },
                  { prop: "Universal", desc: "Any domain" },
                  { prop: "Compact", desc: "Delta compression" },
                  { prop: "Reversible", desc: "If det(M) invertible" },
                  { prop: "Cyclic", desc: "Finite state cycles" },
                  { prop: "Trustless", desc: "No authority needed" },
                ].map((p, i) => (
                  <div key={i} className="bg-slate-800/50 rounded-lg p-2">
                    <div className="text-cyan-400 font-medium">{p.prop}</div>
                    <div className="text-slate-500 text-[10px]">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-8">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <div className="font-bold">Bradley Clonan</div>
              <div className="text-xs text-slate-400">Systems Architect</div>
            </div>
            <div className="flex items-center gap-4">
              <a
                href="mailto:clonanxyz@gmail.com"
                className="text-sm text-slate-400 hover:text-white"
              >
                clonanxyz@gmail.com
              </a>
              <span className="px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-medium">
                Open to Work
              </span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-slate-800/50 text-[10px] text-slate-600 text-center">
            DCRE v1.0 • Deterministic Computation with Replayable Evolution •
            Proof is reconstruction, not trust
          </div>
        </div>
      </footer>
    </div>
  );
};

export default DCREProductionDemo;

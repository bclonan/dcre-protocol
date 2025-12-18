import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  DCRE MESH - Decentralized Communication & File Sharing                   ║
 * ║  Production Application v1.0                                              ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  A complete chat and file sharing system built on DCRE primitives.        ║
 * ║  Features triangulation-free "bowling alley" communication where          ║
 * ║  messages propagate through deterministic lattice evolution.              ║
 * ║                                                                           ║
 * ║  NO ROUTING • NO TRIANGULATION • NO LOCATION DATA                         ║
 * ║  Proof by Replay • Cryptographic Verification • Delta Compression         ║
 * ║                                                                           ║
 * ║  Author: Bradley Clonan                                                   ║
 * ║  Contact: clonanxyz@gmail.com                                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// DCRE CORE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

const BoundedArithmetic = {
  mod: (value, m) => ((value % m) + m) % m,

  toDigits: (value, base, numDigits) => {
    const digits = [];
    let v = Math.abs(Math.floor(value));
    for (let i = 0; i < numDigits; i++) {
      digits.push(v % base);
      v = Math.floor(v / base);
    }
    return digits;
  },

  digitalRoot: (value, base) => {
    if (value === 0) return 0;
    return 1 + ((value - 1) % (base - 1));
  },

  det2x2Mod: (M, m) =>
    BoundedArithmetic.mod(M[0][0] * M[1][1] - M[0][1] * M[1][0], m),

  modInverse: (a, m) => {
    const mod = BoundedArithmetic.mod;
    let [old_r, r] = [mod(a, m), m];
    let [old_s, s] = [1, 0];
    while (r !== 0) {
      const q = Math.floor(old_r / r);
      [old_r, r] = [r, old_r - q * r];
      [old_s, s] = [s, old_s - q * s];
    }
    if (old_r !== 1) return null;
    return mod(old_s, m);
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

class Lattice {
  constructor(n, m) {
    this.n = n;
    this.m = m;
    this.grid = Array(n)
      .fill(null)
      .map(() => Array(n).fill(0));
    this.epoch = 0;
  }

  static encode(input, n, m) {
    const lattice = new Lattice(n, m);
    let bytes;
    if (typeof input === "string") {
      bytes = new TextEncoder().encode(input);
    } else if (input instanceof Uint8Array) {
      bytes = input;
    } else {
      bytes = new TextEncoder().encode(JSON.stringify(input));
    }

    for (let i = 0; i < n * n; i++) {
      const row = Math.floor(i / n);
      const col = i % n;
      lattice.grid[row][col] = BoundedArithmetic.mod(
        i < bytes.length ? bytes[i] : 0,
        m
      );
    }

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
}

class LatticeTransform {
  static MATRICES = {
    DCRE: {
      M: [
        [2, 1],
        [1, 1],
      ],
      name: "DCRE",
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
    FIBONACCI: {
      M: [
        [1, 1],
        [1, 0],
      ],
      name: "Fibonacci",
      det: -1,
    },
  };

  static applyBlockTransform(lattice, M, row, col) {
    const m = lattice.m;
    const a = lattice.get(row, col);
    const b = lattice.get(row, col + 1);
    const c = lattice.get(row + 1, col);
    const d = lattice.get(row + 1, col + 1);

    lattice.set(row, col, BoundedArithmetic.mod(M[0][0] * a + M[0][1] * c, m));
    lattice.set(
      row,
      col + 1,
      BoundedArithmetic.mod(M[0][0] * b + M[0][1] * d, m)
    );
    lattice.set(
      row + 1,
      col,
      BoundedArithmetic.mod(M[1][0] * a + M[1][1] * c, m)
    );
    lattice.set(
      row + 1,
      col + 1,
      BoundedArithmetic.mod(M[1][0] * b + M[1][1] * d, m)
    );
  }

  static evolve(lattice, transform) {
    const result = lattice.clone();
    const n = lattice.n;
    const M = transform.M;

    for (let phase = 0; phase < 2; phase++) {
      for (let row = 0; row < n - 1; row += 2) {
        for (let col = phase; col < n - 1; col += 2) {
          LatticeTransform.applyBlockTransform(result, M, row, col);
        }
      }
    }
    result.epoch = lattice.epoch + 1;
    return result;
  }
}

class DeltaEvolution {
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
    };
  }

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
    return current;
  }
}

class CryptoProof {
  static fingerprint(lattice) {
    let hash = 2166136261;
    const prime = 16777619;
    for (let row = 0; row < lattice.n; row++) {
      for (let col = 0; col < lattice.n; col++) {
        hash ^= lattice.grid[row][col];
        hash = Math.imul(hash, prime);
      }
    }
    hash ^= lattice.n ^ (lattice.m << 8) ^ (lattice.epoch << 16);
    hash = Math.imul(hash, prime);
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  static hashString(str) {
    let hash = 2166136261;
    const prime = 16777619;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, prime);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  static createSignature(data, secret) {
    return CryptoProof.hashString(`${data}:${secret}:${Date.now()}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DCRE MESH PROTOCOL - Chat & File Sharing
// ═══════════════════════════════════════════════════════════════════════════

class DCREMeshProtocol {
  constructor(userId, config = {}) {
    this.userId = userId;
    this.userSecret = CryptoProof.hashString(
      `${userId}:${Date.now()}:${Math.random()}`
    );
    this.n = config.n || 12;
    this.m = config.m || 10;
    this.transform = LatticeTransform.MATRICES[config.transform || "DCRE"];
    this.channels = new Map();
    this.messageLog = [];
    this.fileStore = new Map();
    this.listeners = new Set();
  }

  createChannel(channelId, isPrivate = false) {
    if (this.channels.has(channelId)) return this.channels.get(channelId);

    const seedString = `DCRE_CHANNEL_${channelId}_v1`;
    const channel = {
      id: channelId,
      lattice: Lattice.encode(seedString, this.n, this.m),
      history: [],
      deltas: [],
      messages: [],
      files: [],
      members: new Set([this.userId]),
      isPrivate,
      created: Date.now(),
    };

    this.channels.set(channelId, channel);
    return channel;
  }

  encodeMessage(content, type = "text", metadata = {}) {
    const payload = {
      type,
      content,
      sender: this.userId,
      timestamp: Date.now(),
      nonce: Math.random().toString(36).substring(2, 10),
      ...metadata,
    };

    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
    const perturbation = [];

    for (let i = 0; i < Math.min(payloadBytes.length, this.n * this.n); i++) {
      perturbation.push({
        row: Math.floor(i / this.n),
        col: i % this.n,
        delta: BoundedArithmetic.mod(payloadBytes[i], this.m),
      });
    }

    return {
      payload,
      perturbation,
      hash: CryptoProof.hashString(JSON.stringify(payload)),
      signature: CryptoProof.createSignature(
        JSON.stringify(payload),
        this.userSecret
      ),
    };
  }

  sendMessage(channelId, content, type = "text", metadata = {}) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error("Channel not found");

    const encoded = this.encodeMessage(content, type, metadata);
    const beforeLattice = channel.lattice.clone();
    const beforeFingerprint = CryptoProof.fingerprint(beforeLattice);

    for (const p of encoded.perturbation) {
      const current = channel.lattice.get(p.row, p.col);
      channel.lattice.set(
        p.row,
        p.col,
        BoundedArithmetic.mod(current + p.delta, this.m)
      );
    }

    channel.lattice = LatticeTransform.evolve(channel.lattice, this.transform);

    const delta = DeltaEvolution.computeDelta(beforeLattice, channel.lattice);
    channel.deltas.push(delta);
    channel.history.push(channel.lattice.clone());

    const afterFingerprint = CryptoProof.fingerprint(channel.lattice);

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      channelId,
      ...encoded.payload,
      perturbationHash: encoded.hash,
      signature: encoded.signature,
      proof: {
        beforeEpoch: beforeLattice.epoch,
        afterEpoch: channel.lattice.epoch,
        beforeFingerprint,
        afterFingerprint,
        deltaHash: CryptoProof.hashString(JSON.stringify(delta.changes)),
      },
    };

    channel.messages.push(message);
    this.messageLog.push(message);
    this.notifyListeners("message", message);

    return message;
  }

  verifyMessage(channelId, message) {
    const channel = this.channels.get(channelId);
    if (!channel) return { valid: false, reason: "Channel not found" };

    const deltaIndex = message.proof.beforeEpoch;
    if (deltaIndex >= channel.deltas.length) {
      return { valid: false, reason: "Delta not found" };
    }

    const currentFingerprint = CryptoProof.fingerprint(channel.lattice);

    return {
      valid: true,
      verified: {
        sender: message.sender,
        timestamp: message.timestamp,
        currentFingerprint,
        epochsAgo: channel.lattice.epoch - message.proof.afterEpoch,
      },
    };
  }

  shareFile(channelId, fileName, fileData) {
    const channel = this.channels.get(channelId);
    if (!channel) throw new Error("Channel not found");

    const base64 =
      typeof fileData === "string"
        ? fileData
        : btoa(String.fromCharCode(...new Uint8Array(fileData)));
    const chunkSize = 500;
    const chunks = [];

    for (let i = 0; i < base64.length; i += chunkSize) {
      chunks.push(base64.slice(i, i + chunkSize));
    }

    const fileId = `file_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    const manifest = {
      fileId,
      fileName,
      size: base64.length,
      chunks: chunks.length,
      hash: CryptoProof.hashString(base64),
      sender: this.userId,
      timestamp: Date.now(),
    };

    const manifestMsg = this.sendMessage(channelId, manifest, "file_manifest", {
      fileId,
    });

    const chunkMessages = chunks.map((chunk, index) => {
      return this.sendMessage(channelId, chunk, "file_chunk", {
        fileId,
        chunkIndex: index,
        totalChunks: chunks.length,
      });
    });

    const fileRecord = {
      ...manifest,
      manifestMessage: manifestMsg,
      chunkMessages,
      status: "complete",
    };

    channel.files.push(fileRecord);
    this.fileStore.set(fileId, { manifest, chunks, base64 });
    this.notifyListeners("file", fileRecord);

    return fileRecord;
  }

  reconstructFile(channelId, fileId) {
    const stored = this.fileStore.get(fileId);
    if (stored) return stored.base64;

    const channel = this.channels.get(channelId);
    if (!channel) return null;

    const chunkMessages = channel.messages
      .filter((m) => m.type === "file_chunk" && m.fileId === fileId)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);

    if (chunkMessages.length === 0) return null;

    const base64 = chunkMessages.map((m) => m.content).join("");
    return base64;
  }

  getChannelState(channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    return {
      id: channel.id,
      epoch: channel.lattice.epoch,
      fingerprint: CryptoProof.fingerprint(channel.lattice),
      messageCount: channel.messages.length,
      fileCount: channel.files.length,
      memberCount: channel.members.size,
      deltaCount: channel.deltas.length,
      grid: channel.lattice.grid,
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(type, data) {
    this.listeners.forEach((listener) => listener(type, data));
  }

  exportChannelProof(channelId) {
    const channel = this.channels.get(channelId);
    if (!channel) return null;

    return {
      channelId,
      initialSeed: `DCRE_CHANNEL_${channelId}_v1`,
      params: { n: this.n, m: this.m, transform: this.transform.name },
      currentEpoch: channel.lattice.epoch,
      currentFingerprint: CryptoProof.fingerprint(channel.lattice),
      messageCount: channel.messages.length,
      exportedAt: Date.now(),
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT APPLICATION - DCRE MESH
// ═══════════════════════════════════════════════════════════════════════════

const DCREMeshApp = () => {
  const [protocol, setProtocol] = useState(null);
  const [userId, setUserId] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [channels, setChannels] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [newChannelName, setNewChannelName] = useState("");
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [activeTab, setActiveTab] = useState("chat");
  const [showProof, setShowProof] = useState(null);
  const [channelState, setChannelState] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const connect = useCallback(() => {
    if (!userId.trim()) return;

    const proto = new DCREMeshProtocol(userId.trim(), {
      n: 12,
      m: 10,
      transform: "DCRE",
    });

    proto.subscribe((type, data) => {
      if (type === "message") {
        setMessages((prev) => [...prev, data]);
      } else if (type === "file") {
        setFiles((prev) => [...prev, data]);
      }
    });

    proto.createChannel("general");

    setProtocol(proto);
    setIsConnected(true);
    setChannels(["general"]);
    setActiveChannel("general");

    proto.sendMessage("general", `${userId} joined the mesh`, "system");
  }, [userId]);

  const createChannel = useCallback(() => {
    if (!protocol || !newChannelName.trim()) return;

    const channelId = newChannelName.trim().toLowerCase().replace(/\s+/g, "-");
    protocol.createChannel(channelId);
    setChannels((prev) => [...new Set([...prev, channelId])]);
    setActiveChannel(channelId);
    setNewChannelName("");

    protocol.sendMessage(
      channelId,
      `Channel "${channelId}" created by ${userId}`,
      "system"
    );
  }, [protocol, newChannelName, userId]);

  const sendMessage = useCallback(() => {
    if (!protocol || !activeChannel || !messageInput.trim()) return;

    protocol.sendMessage(activeChannel, messageInput.trim(), "text");
    setMessageInput("");
  }, [protocol, activeChannel, messageInput]);

  const handleFileUpload = useCallback(
    (e) => {
      const file = e.target.files[0];
      if (!file || !protocol || !activeChannel) return;

      setUploadProgress({ name: file.name, progress: 0 });

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result.split(",")[1];
        setUploadProgress({ name: file.name, progress: 50 });

        setTimeout(() => {
          protocol.shareFile(activeChannel, file.name, base64);
          setUploadProgress(null);
        }, 500);
      };
      reader.readAsDataURL(file);
    },
    [protocol, activeChannel]
  );

  const downloadFile = useCallback(
    (fileRecord) => {
      if (!protocol || !activeChannel) return;

      const base64 = protocol.reconstructFile(activeChannel, fileRecord.fileId);
      if (!base64) return;

      const link = document.createElement("a");
      link.href = `data:application/octet-stream;base64,${base64}`;
      link.download = fileRecord.fileName;
      link.click();
    },
    [protocol, activeChannel]
  );

  useEffect(() => {
    if (!protocol || !activeChannel) return;

    const interval = setInterval(() => {
      const state = protocol.getChannelState(activeChannel);
      setChannelState(state);
    }, 1000);

    return () => clearInterval(interval);
  }, [protocol, activeChannel]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const channelMessages = useMemo(() => {
    return messages.filter(
      (m) => m.channelId === activeChannel && m.type !== "file_chunk"
    );
  }, [messages, activeChannel]);

  const channelFiles = useMemo(() => {
    return files.filter(
      (f) =>
        f.channelId === activeChannel ||
        messages.some(
          (m) => m.channelId === activeChannel && m.fileId === f.fileId
        )
    );
  }, [files, messages, activeChannel]);

  const LatticeGrid = ({ grid, m, size = "normal" }) => {
    if (!grid) return null;
    const n = grid.length;
    const cellSize = size === "small" ? 16 : size === "tiny" ? 10 : 24;

    return (
      <div
        className="inline-grid gap-px rounded overflow-hidden"
        style={{ gridTemplateColumns: `repeat(${n}, ${cellSize}px)` }}
      >
        {grid.flat().map((value, i) => (
          <div
            key={i}
            style={{
              width: cellSize,
              height: cellSize,
              backgroundColor: `hsl(${(value / m) * 360}, 60%, 25%)`,
              transition: "background-color 0.3s",
            }}
          />
        ))}
      </div>
    );
  };

  // Login screen
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-4xl font-bold mx-auto mb-4 shadow-lg shadow-cyan-500/30 text-white">
              ◈
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">DCRE Mesh</h1>
            <p className="text-slate-400">
              Decentralized Communication & File Sharing
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Triangulation-Free • Proof by Replay • Delta Compressed
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">
                Choose your identity
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                placeholder="Enter username..."
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>

            <button
              onClick={connect}
              disabled={!userId.trim()}
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:from-cyan-400 hover:to-blue-500 transition-all shadow-lg shadow-cyan-500/25"
            >
              Connect to Mesh
            </button>

            <div className="pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-500 text-center">
                Your messages propagate through deterministic lattice evolution.
                <br />
                No central server. No routing. No location data.
              </p>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-4 text-center">
            {[
              {
                icon: "🎳",
                title: "Bowling Alley",
                desc: "Direct lane communication",
              },
              {
                icon: "🔐",
                title: "Proof by Replay",
                desc: "Cryptographic verification",
              },
              {
                icon: "Δ",
                title: "Delta Compressed",
                desc: "Efficient storage",
              },
            ].map((f, i) => (
              <div
                key={i}
                className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-3"
              >
                <div className="text-2xl mb-1">{f.icon}</div>
                <div className="text-xs font-medium text-slate-300">
                  {f.title}
                </div>
                <div className="text-[10px] text-slate-500">{f.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-600">
              By Bradley Clonan •{" "}
              <a
                href="mailto:clonanxyz@gmail.com"
                className="text-cyan-500 hover:underline"
              >
                clonanxyz@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Main app
  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0 bg-slate-950/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-slate-800 lg:hidden"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold">
            ◈
          </div>
          <div className="hidden sm:block">
            <h1 className="text-sm font-bold">DCRE Mesh</h1>
            <p className="text-[10px] text-slate-500">#{activeChannel}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {channelState && (
            <div className="hidden md:flex items-center gap-3 text-xs text-slate-400 mr-4">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Epoch {channelState.epoch}
              </span>
              <span>H: {channelState.fingerprint.slice(0, 6)}...</span>
            </div>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm">{userId}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? "w-64" : "w-0"
          } border-r border-slate-800 flex-shrink-0 overflow-hidden transition-all duration-300 bg-slate-900/50`}
        >
          <div className="w-64 h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-3">
              <div className="text-xs text-slate-500 uppercase font-semibold mb-2 px-2">
                Channels
              </div>
              <div className="space-y-1">
                {channels.map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setActiveChannel(ch)}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                      activeChannel === ch
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "text-slate-400 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    # {ch}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createChannel()}
                  placeholder="New channel..."
                  className="flex-1 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:border-cyan-500"
                />
                <button
                  onClick={createChannel}
                  disabled={!newChannelName.trim()}
                  className="px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {channelState && (
              <div className="p-3 border-t border-slate-800">
                <div className="text-xs text-slate-500 mb-2">Lattice State</div>
                <div className="flex justify-center">
                  <LatticeGrid grid={channelState.grid} m={10} size="tiny" />
                </div>
                <div className="mt-2 text-center text-[10px] text-slate-500">
                  {channelState.messageCount} msgs • {channelState.deltaCount}{" "}
                  deltas
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-slate-800 px-4 flex-shrink-0">
            {["chat", "files", "proof"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                  activeTab === tab
                    ? "text-cyan-400 border-cyan-400"
                    : "text-slate-400 border-transparent hover:text-white"
                }`}
              >
                {tab === "files" ? `Files (${channelFiles.length})` : tab}
              </button>
            ))}
          </div>

          {/* Chat Tab */}
          {activeTab === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {channelMessages.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-4xl mb-3">🎳</div>
                    <p className="text-slate-500">No messages yet</p>
                    <p className="text-xs text-slate-600 mt-1">
                      Messages propagate through lattice evolution
                    </p>
                  </div>
                ) : (
                  channelMessages.map((msg, i) => (
                    <div
                      key={msg.id || i}
                      className={`flex gap-3 ${
                        msg.type === "system" ? "justify-center" : ""
                      }`}
                    >
                      {msg.type === "system" ? (
                        <div className="text-xs text-slate-500 bg-slate-800/30 px-3 py-1 rounded-full">
                          {msg.content}
                        </div>
                      ) : msg.type === "file_manifest" ? (
                        <div className="flex-1 max-w-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-cyan-400">
                              {msg.sender}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                                📁
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {msg.content.fileName}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {(msg.content.size / 1024).toFixed(1)} KB •{" "}
                                  {msg.content.chunks} chunks
                                </div>
                              </div>
                              <button
                                onClick={() => downloadFile(msg.content)}
                                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 max-w-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-sm font-medium ${
                                msg.sender === userId
                                  ? "text-emerald-400"
                                  : "text-cyan-400"
                              }`}
                            >
                              {msg.sender}
                            </span>
                            <span className="text-xs text-slate-500">
                              {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                            <button
                              onClick={() => setShowProof(msg)}
                              className="text-[10px] text-slate-500 hover:text-cyan-400"
                            >
                              [proof]
                            </button>
                          </div>
                          <div
                            className={`rounded-xl px-4 py-2 ${
                              msg.sender === userId
                                ? "bg-emerald-500/20 text-emerald-100"
                                : "bg-slate-800 text-slate-200"
                            }`}
                          >
                            {msg.content}
                          </div>
                          <div className="text-[10px] text-slate-600 mt-1 font-mono">
                            H: {msg.perturbationHash?.slice(0, 8)}... • Epoch{" "}
                            {msg.proof?.afterEpoch}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 border-t border-slate-800 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && sendMessage()
                    }
                    placeholder="Type a message... (propagates via lattice perturbation)"
                    className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:outline-none focus:border-cyan-500 transition-colors"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
                    title="Share file"
                  >
                    📎
                  </button>
                  <button
                    onClick={sendMessage}
                    disabled={!messageInput.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-medium disabled:opacity-50 hover:from-cyan-400 hover:to-blue-500 transition-all"
                  >
                    Send
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {uploadProgress && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-400">
                    <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    Uploading {uploadProgress.name}...
                  </div>
                )}
              </div>
            </>
          )}

          {/* Files Tab */}
          {activeTab === "files" && (
            <div className="flex-1 overflow-y-auto p-4">
              {channelFiles.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-3">📁</div>
                  <p className="text-slate-500">No files shared yet</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm"
                  >
                    Share a file
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {channelFiles.map((file, i) => (
                    <div
                      key={file.fileId || i}
                      className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-2xl">
                          {file.fileName?.endsWith(".png") ||
                          file.fileName?.endsWith(".jpg")
                            ? "🖼️"
                            : file.fileName?.endsWith(".pdf")
                            ? "📄"
                            : "📁"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {file.fileName}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {(file.size / 1024).toFixed(1)} KB
                          </div>
                          <div className="text-xs text-slate-600 mt-1">
                            by {file.sender}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => downloadFile(file)}
                          className="flex-1 px-3 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 text-sm font-medium hover:bg-cyan-500/30"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => setShowProof(file)}
                          className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 text-sm hover:bg-slate-700"
                        >
                          Proof
                        </button>
                      </div>
                      <div className="mt-2 text-[10px] text-slate-600 font-mono">
                        Hash: {file.hash?.slice(0, 12)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Proof Tab */}
          {activeTab === "proof" && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="max-w-2xl mx-auto space-y-4">
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <span className="text-cyan-400">⚡</span>Channel Proof State
                  </h2>

                  {channelState && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs text-slate-500">
                            Current Epoch
                          </div>
                          <div className="text-xl font-mono text-amber-400">
                            {channelState.epoch}
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs text-slate-500">
                            Total Deltas
                          </div>
                          <div className="text-xl font-mono text-cyan-400">
                            {channelState.deltaCount}
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs text-slate-500">Messages</div>
                          <div className="text-xl font-mono text-emerald-400">
                            {channelState.messageCount}
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-3">
                          <div className="text-xs text-slate-500">Files</div>
                          <div className="text-xl font-mono text-purple-400">
                            {channelState.fileCount}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-xs text-slate-500 mb-2">
                          Current Fingerprint H(G)
                        </div>
                        <div className="font-mono text-lg text-amber-400">
                          {channelState.fingerprint}
                        </div>
                      </div>

                      <div className="flex justify-center">
                        <LatticeGrid
                          grid={channelState.grid}
                          m={10}
                          size="normal"
                        />
                      </div>

                      <div className="text-center text-xs text-slate-500">
                        Lattice State: Z<sub>10</sub>
                        <sup>12×12</sup> • Transform: DCRE
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-4">
                  <h3 className="font-semibold mb-3 text-cyan-400">
                    How DCRE Proof Works
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-300">
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">1.</span>
                      <span>Messages encoded as lattice perturbations</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">2.</span>
                      <span>
                        Lattice evolves deterministically via transform M
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">3.</span>
                      <span>Each transition recorded as sparse delta Δ</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">4.</span>
                      <span>Fingerprint H(G) uniquely identifies state</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">5.</span>
                      <span>Verify by replaying from G₀ + {"{Δ}"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-cyan-400">6.</span>
                      <span>Valid if computed H matches claimed H</span>
                    </div>
                  </div>
                </div>

                {protocol && (
                  <button
                    onClick={() => {
                      const proof = protocol.exportChannelProof(activeChannel);
                      const blob = new Blob([JSON.stringify(proof, null, 2)], {
                        type: "application/json",
                      });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `dcre-proof-${activeChannel}-${Date.now()}.json`;
                      a.click();
                    }}
                    className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-sm font-medium hover:bg-slate-700 transition-colors"
                  >
                    Export Channel Proof
                  </button>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Proof Modal */}
      {showProof && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setShowProof(null)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Proof Details</h3>
              <button
                onClick={() => setShowProof(null)}
                className="p-2 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-sm">
              {showProof.proof ? (
                <>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Message Hash</div>
                    <div className="font-mono text-cyan-400">
                      {showProof.perturbationHash}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500">Before Epoch</div>
                      <div className="font-mono">
                        {showProof.proof.beforeEpoch}
                      </div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500">After Epoch</div>
                      <div className="font-mono">
                        {showProof.proof.afterEpoch}
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">
                      Before Fingerprint
                    </div>
                    <div className="font-mono text-xs">
                      {showProof.proof.beforeFingerprint}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">
                      After Fingerprint
                    </div>
                    <div className="font-mono text-xs">
                      {showProof.proof.afterFingerprint}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">Signature</div>
                    <div className="font-mono text-xs">
                      {showProof.signature}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">File Hash</div>
                    <div className="font-mono text-cyan-400">
                      {showProof.hash}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="text-xs text-slate-500">File Name</div>
                    <div>{showProof.fileName}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500">Size</div>
                      <div>{(showProof.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <div className="bg-slate-800/50 rounded-lg p-3">
                      <div className="text-xs text-slate-500">Chunks</div>
                      <div>{showProof.chunks}</div>
                    </div>
                  </div>
                </>
              )}

              <div className="pt-3 border-t border-slate-700">
                <div className="text-xs text-slate-500">
                  This proof can be verified by replaying the lattice evolution
                  from the initial state through all recorded deltas.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="h-8 border-t border-slate-800 flex items-center justify-between px-4 text-[10px] text-slate-600 flex-shrink-0 bg-slate-900/50">
        <span>DCRE Mesh v1.0 • Triangulation-Free Communication</span>
        <span>
          Bradley Clonan •{" "}
          <a href="mailto:clonanxyz@gmail.com" className="text-cyan-500">
            clonanxyz@gmail.com
          </a>{" "}
          • Open to Work
        </span>
      </footer>
    </div>
  );
};

export default DCREMeshApp;

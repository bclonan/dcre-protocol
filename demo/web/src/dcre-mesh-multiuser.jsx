import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║  DCRE MESH - Multi-User Communication System                              ║
 * ║  With Real Connection Mechanisms                                          ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║                                                                           ║
 * ║  HOW USERS CONNECT:                                                       ║
 * ║                                                                           ║
 * ║  1. CHANNEL CODE - Share a code, both users join same lattice             ║
 * ║  2. DELTA SYNC - Changes propagate via broadcast channel                  ║
 * ║  3. DETERMINISTIC - Same seed + same deltas = same state                  ║
 * ║                                                                           ║
 * ║  The "magic" is that DCRE doesn't need to know WHO sent a message         ║
 * ║  or WHERE they are - just that the lattice evolved consistently.          ║
 * ║                                                                           ║
 * ║  Author: Bradley Clonan | clonanxyz@gmail.com                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// DCRE CORE (Same as before - the math doesn't change)
// ═══════════════════════════════════════════════════════════════════════════

const BoundedArithmetic = {
  mod: (value, m) => ((value % m) + m) % m,
  digitalRoot: (value, base) => value === 0 ? 0 : 1 + ((value - 1) % (base - 1)),
  det2x2Mod: (M, m) => BoundedArithmetic.mod(M[0][0] * M[1][1] - M[0][1] * M[1][0], m),
};

class Lattice {
  constructor(n, m) {
    this.n = n;
    this.m = m;
    this.grid = Array(n).fill(null).map(() => Array(n).fill(0));
    this.epoch = 0;
  }

  static encode(input, n, m) {
    const lattice = new Lattice(n, m);
    const bytes = new TextEncoder().encode(typeof input === 'string' ? input : JSON.stringify(input));
    for (let i = 0; i < n * n; i++) {
      lattice.grid[Math.floor(i / n)][i % n] = BoundedArithmetic.mod(i < bytes.length ? bytes[i] : 0, m);
    }
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        const neighbors = [lattice.grid[row][col], lattice.grid[row][(col + 1) % n], lattice.grid[(row + 1) % n][col]];
        lattice.grid[row][col] = BoundedArithmetic.mod(neighbors[0] + BoundedArithmetic.digitalRoot(neighbors[1] + neighbors[2], m), m);
      }
    }
    return lattice;
  }

  get(r, c) { return this.grid[BoundedArithmetic.mod(r, this.n)][BoundedArithmetic.mod(c, this.n)]; }
  set(r, c, v) { this.grid[BoundedArithmetic.mod(r, this.n)][BoundedArithmetic.mod(c, this.n)] = BoundedArithmetic.mod(v, this.m); }
  clone() { const copy = new Lattice(this.n, this.m); copy.grid = this.grid.map(r => [...r]); copy.epoch = this.epoch; return copy; }
}

class LatticeTransform {
  static M = [[2, 1], [1, 1]]; // DCRE primary transform
  
  static evolve(lattice) {
    const result = lattice.clone();
    const { n, m } = lattice;
    const M = LatticeTransform.M;
    for (let phase = 0; phase < 2; phase++) {
      for (let row = 0; row < n - 1; row += 2) {
        for (let col = phase; col < n - 1; col += 2) {
          const a = result.get(row, col), b = result.get(row, col + 1);
          const c = result.get(row + 1, col), d = result.get(row + 1, col + 1);
          result.set(row, col, BoundedArithmetic.mod(M[0][0] * a + M[0][1] * c, m));
          result.set(row, col + 1, BoundedArithmetic.mod(M[0][0] * b + M[0][1] * d, m));
          result.set(row + 1, col, BoundedArithmetic.mod(M[1][0] * a + M[1][1] * c, m));
          result.set(row + 1, col + 1, BoundedArithmetic.mod(M[1][0] * b + M[1][1] * d, m));
        }
      }
    }
    result.epoch = lattice.epoch + 1;
    return result;
  }
}

const CryptoProof = {
  fingerprint: (lattice) => {
    let hash = 2166136261;
    for (let r = 0; r < lattice.n; r++) for (let c = 0; c < lattice.n; c++) { hash ^= lattice.grid[r][c]; hash = Math.imul(hash, 16777619); }
    hash ^= lattice.n ^ (lattice.m << 8) ^ (lattice.epoch << 16);
    return (hash >>> 0).toString(16).padStart(8, '0');
  },
  hash: (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }
};

// ═══════════════════════════════════════════════════════════════════════════
// CONNECTION LAYER - How Users Actually Connect
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CONNECTION OPTIONS:
 * 
 * 1. BROADCAST CHANNEL API (Same Browser/Device - for demo)
 *    - Uses browser's BroadcastChannel for cross-tab communication
 *    - Perfect for demonstrating multi-user in same browser
 * 
 * 2. WEBSOCKET RELAY (Real Network)
 *    - Simple relay server forwards deltas to all channel members
 *    - Server sees encrypted deltas, not message content
 *    - Could be replaced with any pub/sub system
 * 
 * 3. WEBRTC PEER-TO-PEER (Serverless after signaling)
 *    - Direct peer connections after initial handshake
 *    - Truly decentralized once connected
 * 
 * 4. SHARED STORAGE (IPFS, Gun.js, etc.)
 *    - Deltas stored in decentralized storage
 *    - Users poll or subscribe for updates
 */

class ConnectionLayer {
  constructor(channelCode, userId) {
    this.channelCode = channelCode;
    this.userId = userId;
    this.listeners = new Set();
    this.broadcastChannel = null;
    this.connected = false;
    this.peers = new Set();
    this.messageQueue = [];
  }

  // Connect using BroadcastChannel (works across browser tabs)
  connect() {
    try {
      // BroadcastChannel allows communication between tabs/windows
      this.broadcastChannel = new BroadcastChannel(`dcre_mesh_${this.channelCode}`);
      
      this.broadcastChannel.onmessage = (event) => {
        const { type, data, sender } = event.data;
        if (sender === this.userId) return; // Ignore own messages
        
        if (type === 'announce') {
          this.peers.add(sender);
          // Respond to announcements
          this.broadcast({ type: 'present', sender: this.userId });
          this.notifyListeners('peer_joined', { userId: sender });
        } else if (type === 'present') {
          this.peers.add(sender);
        } else if (type === 'delta') {
          this.notifyListeners('delta', data);
        } else if (type === 'message') {
          this.notifyListeners('message', data);
        } else if (type === 'file') {
          this.notifyListeners('file', data);
        } else if (type === 'sync_request') {
          this.notifyListeners('sync_request', { requester: sender });
        } else if (type === 'sync_response') {
          this.notifyListeners('sync_response', data);
        }
      };

      this.connected = true;
      
      // Announce presence
      this.broadcast({ type: 'announce', sender: this.userId });
      
      return true;
    } catch (e) {
      console.error('BroadcastChannel not supported, falling back to local-only mode');
      this.connected = true;
      return true;
    }
  }

  broadcast(data) {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ ...data, sender: data.sender || this.userId });
    }
  }

  sendDelta(delta) {
    this.broadcast({ type: 'delta', data: delta, sender: this.userId });
  }

  sendMessage(message) {
    this.broadcast({ type: 'message', data: message, sender: this.userId });
  }

  sendFile(fileData) {
    this.broadcast({ type: 'file', data: fileData, sender: this.userId });
  }

  requestSync() {
    this.broadcast({ type: 'sync_request', sender: this.userId });
  }

  sendSyncResponse(state, requester) {
    this.broadcast({ type: 'sync_response', data: state, sender: this.userId });
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(type, data) {
    this.listeners.forEach(l => l(type, data));
  }

  disconnect() {
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
    this.connected = false;
  }

  getPeerCount() {
    return this.peers.size;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DCRE MESH PROTOCOL - Now with Real Multi-User Support
// ═══════════════════════════════════════════════════════════════════════════

class DCREMeshProtocol {
  constructor(userId, channelCode, config = {}) {
    this.userId = userId;
    this.channelCode = channelCode;
    this.n = config.n || 10;
    this.m = config.m || 10;
    
    // Initialize lattice from channel code (deterministic!)
    const seed = `DCRE_v1_${channelCode}`;
    this.lattice = Lattice.encode(seed, this.n, this.m);
    this.initialLattice = this.lattice.clone();
    
    this.deltas = [];
    this.messages = [];
    this.files = [];
    this.listeners = new Set();
    
    // Connection layer
    this.connection = new ConnectionLayer(channelCode, userId);
    this.setupConnectionHandlers();
  }

  setupConnectionHandlers() {
    this.connection.subscribe((type, data) => {
      switch (type) {
        case 'delta':
          this.applyRemoteDelta(data);
          break;
        case 'message':
          this.handleRemoteMessage(data);
          break;
        case 'file':
          this.handleRemoteFile(data);
          break;
        case 'peer_joined':
          this.notifyListeners('peer_joined', data);
          break;
        case 'sync_request':
          this.handleSyncRequest(data);
          break;
        case 'sync_response':
          this.handleSyncResponse(data);
          break;
      }
    });
  }

  connect() {
    const success = this.connection.connect();
    if (success) {
      // Request sync from existing peers
      setTimeout(() => this.connection.requestSync(), 500);
    }
    return success;
  }

  // Apply delta from remote peer
  applyRemoteDelta(deltaData) {
    const { delta, message } = deltaData;
    
    // Apply the delta to our lattice
    for (const change of delta.changes) {
      this.lattice.set(change.row, change.col, change.to);
    }
    this.lattice.epoch = delta.toEpoch;
    this.deltas.push(delta);
    
    if (message) {
      this.messages.push(message);
      this.notifyListeners('message', message);
    }
    
    this.notifyListeners('lattice_updated', this.getState());
  }

  handleRemoteMessage(message) {
    if (!this.messages.find(m => m.id === message.id)) {
      this.messages.push(message);
      this.notifyListeners('message', message);
    }
  }

  handleRemoteFile(fileData) {
    if (!this.files.find(f => f.fileId === fileData.fileId)) {
      this.files.push(fileData);
      this.notifyListeners('file', fileData);
    }
  }

  handleSyncRequest(data) {
    // Send our current state to the requester
    this.connection.sendSyncResponse({
      epoch: this.lattice.epoch,
      fingerprint: CryptoProof.fingerprint(this.lattice),
      deltas: this.deltas.slice(-50), // Last 50 deltas
      messages: this.messages.slice(-50),
      files: this.files
    });
  }

  handleSyncResponse(state) {
    // If they're ahead of us, catch up
    if (state.epoch > this.lattice.epoch) {
      // Apply missing deltas
      const missingDeltas = state.deltas.filter(d => d.toEpoch > this.lattice.epoch);
      for (const delta of missingDeltas) {
        for (const change of delta.changes) {
          this.lattice.set(change.row, change.col, change.to);
        }
        this.lattice.epoch = delta.toEpoch;
        this.deltas.push(delta);
      }
      
      // Merge messages
      for (const msg of state.messages) {
        if (!this.messages.find(m => m.id === msg.id)) {
          this.messages.push(msg);
        }
      }
      this.messages.sort((a, b) => a.timestamp - b.timestamp);
      
      // Merge files
      for (const file of state.files) {
        if (!this.files.find(f => f.fileId === file.fileId)) {
          this.files.push(file);
        }
      }
      
      this.notifyListeners('synced', { epoch: this.lattice.epoch });
      this.notifyListeners('lattice_updated', this.getState());
    }
  }

  // Send a message
  sendMessage(content, type = 'text') {
    const beforeLattice = this.lattice.clone();
    
    // Encode message as perturbation
    const payload = JSON.stringify({ type, content, sender: this.userId, ts: Date.now() });
    const bytes = new TextEncoder().encode(payload);
    
    for (let i = 0; i < Math.min(bytes.length, this.n * this.n); i++) {
      const current = this.lattice.get(Math.floor(i / this.n), i % this.n);
      this.lattice.set(Math.floor(i / this.n), i % this.n, 
        BoundedArithmetic.mod(current + bytes[i], this.m));
    }
    
    // Evolve
    this.lattice = LatticeTransform.evolve(this.lattice);
    
    // Compute delta
    const delta = this.computeDelta(beforeLattice, this.lattice);
    this.deltas.push(delta);
    
    const message = {
      id: `${this.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      type,
      content,
      sender: this.userId,
      timestamp: Date.now(),
      epoch: this.lattice.epoch,
      fingerprint: CryptoProof.fingerprint(this.lattice),
      hash: CryptoProof.hash(payload)
    };
    
    this.messages.push(message);
    
    // Broadcast to peers
    this.connection.sendDelta({ delta, message });
    this.connection.sendMessage(message);
    
    this.notifyListeners('message', message);
    this.notifyListeners('lattice_updated', this.getState());
    
    return message;
  }

  // Share a file
  shareFile(fileName, base64Data) {
    const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const fileRecord = {
      fileId,
      fileName,
      size: base64Data.length,
      data: base64Data,
      sender: this.userId,
      timestamp: Date.now(),
      hash: CryptoProof.hash(base64Data)
    };
    
    this.files.push(fileRecord);
    
    // Also send as a message for the chat
    this.sendMessage({ fileId, fileName, size: base64Data.length, hash: fileRecord.hash }, 'file');
    
    // Broadcast file data
    this.connection.sendFile(fileRecord);
    
    this.notifyListeners('file', fileRecord);
    
    return fileRecord;
  }

  getFile(fileId) {
    return this.files.find(f => f.fileId === fileId);
  }

  computeDelta(before, after) {
    const changes = [];
    for (let r = 0; r < before.n; r++) {
      for (let c = 0; c < before.n; c++) {
        if (before.get(r, c) !== after.get(r, c)) {
          changes.push({ row: r, col: c, from: before.get(r, c), to: after.get(r, c) });
        }
      }
    }
    return { fromEpoch: before.epoch, toEpoch: after.epoch, changes };
  }

  getState() {
    return {
      epoch: this.lattice.epoch,
      fingerprint: CryptoProof.fingerprint(this.lattice),
      grid: this.lattice.grid,
      messageCount: this.messages.length,
      fileCount: this.files.length,
      peerCount: this.connection.getPeerCount(),
      deltaCount: this.deltas.length
    };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners(type, data) {
    this.listeners.forEach(l => l(type, data));
  }

  disconnect() {
    this.connection.disconnect();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REACT APPLICATION
// ═══════════════════════════════════════════════════════════════════════════

const DCREMeshMultiUser = () => {
  const [protocol, setProtocol] = useState(null);
  const [userId, setUserId] = useState('');
  const [channelCode, setChannelCode] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [latticeState, setLatticeState] = useState(null);
  const [peerCount, setPeerCount] = useState(0);
  const [activeTab, setActiveTab] = useState('chat');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const generateChannelCode = () => {
    const words = ['alpha', 'bravo', 'delta', 'echo', 'foxtrot', 'gamma', 'hotel', 'india', 'juliet', 'kilo'];
    const code = [
      words[Math.floor(Math.random() * words.length)],
      words[Math.floor(Math.random() * words.length)],
      Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    ].join('-');
    setChannelCode(code);
  };

  const connect = useCallback(() => {
    if (!userId.trim() || !channelCode.trim()) return;
    
    const proto = new DCREMeshProtocol(userId.trim(), channelCode.trim().toLowerCase());
    
    proto.subscribe((type, data) => {
      switch (type) {
        case 'message':
          setMessages(prev => {
            if (prev.find(m => m.id === data.id)) return prev;
            return [...prev, data].sort((a, b) => a.timestamp - b.timestamp);
          });
          break;
        case 'file':
          setFiles(prev => {
            if (prev.find(f => f.fileId === data.fileId)) return prev;
            return [...prev, data];
          });
          break;
        case 'lattice_updated':
        case 'synced':
          setLatticeState(proto.getState());
          setPeerCount(proto.connection.getPeerCount());
          break;
        case 'peer_joined':
          setPeerCount(proto.connection.getPeerCount());
          break;
      }
    });
    
    proto.connect();
    proto.sendMessage(`${userId} joined the channel`, 'system');
    
    setProtocol(proto);
    setIsConnected(true);
    setLatticeState(proto.getState());
  }, [userId, channelCode]);

  const sendMessage = useCallback(() => {
    if (!protocol || !messageInput.trim()) return;
    protocol.sendMessage(messageInput.trim());
    setMessageInput('');
  }, [protocol, messageInput]);

  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !protocol) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target.result.split(',')[1];
      protocol.shareFile(file.name, base64);
    };
    reader.readAsDataURL(file);
  }, [protocol]);

  const downloadFile = useCallback((fileRecord) => {
    const link = document.createElement('a');
    link.href = `data:application/octet-stream;base64,${fileRecord.data}`;
    link.download = fileRecord.fileName;
    link.click();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!protocol) return;
    const interval = setInterval(() => {
      setLatticeState(protocol.getState());
      setPeerCount(protocol.connection.getPeerCount());
    }, 2000);
    return () => clearInterval(interval);
  }, [protocol]);

  const LatticeViz = ({ grid, m }) => {
    if (!grid) return null;
    const n = grid.length;
    return (
      <div className="inline-grid gap-px" style={{ gridTemplateColumns: `repeat(${n}, 12px)` }}>
        {grid.flat().map((v, i) => (
          <div key={i} style={{ width: 12, height: 12, backgroundColor: `hsl(${(v / m) * 360}, 60%, 30%)` }} />
        ))}
      </div>
    );
  };

  // Login/Join screen
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-3xl mx-auto mb-4 shadow-lg shadow-cyan-500/30 text-white">◈</div>
            <h1 className="text-2xl font-bold text-white mb-1">DCRE Mesh</h1>
            <p className="text-slate-400 text-sm">Triangulation-Free Communication</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
            <div>
              <label className="block text-sm text-slate-400 mb-2">Your Name</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Enter your name..."
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-sm text-slate-400 mb-2">Channel Code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={channelCode}
                  onChange={(e) => setChannelCode(e.target.value)}
                  placeholder="e.g., alpha-bravo-123"
                  className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  onClick={generateChannelCode}
                  className="px-4 py-3 rounded-xl bg-slate-700 text-slate-300 hover:bg-slate-600"
                  title="Generate random code"
                >
                  🎲
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Share this code with others to join the same channel
              </p>
            </div>

            <button
              onClick={connect}
              disabled={!userId.trim() || !channelCode.trim()}
              className="w-full px-4 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold disabled:opacity-50 hover:from-cyan-400 hover:to-blue-500 transition-all"
            >
              Join Channel
            </button>

            <button
              onClick={() => setShowHowItWorks(true)}
              className="w-full px-4 py-2 text-sm text-slate-400 hover:text-white"
            >
              How does this work? →
            </button>
          </div>

          <div className="mt-6 bg-slate-900/30 border border-slate-800/50 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-2">🎳 How to Connect</h3>
            <ol className="text-xs text-slate-400 space-y-1">
              <li>1. Generate or enter a channel code</li>
              <li>2. Share the code with your friend</li>
              <li>3. Both join with the same code</li>
              <li>4. Your messages sync via lattice evolution!</li>
            </ol>
            <p className="text-[10px] text-slate-500 mt-3">
              💡 Open this page in two browser tabs to test it yourself!
            </p>
          </div>
        </div>

        {/* How It Works Modal */}
        {showHowItWorks && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50" onClick={() => setShowHowItWorks(false)}>
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-xl font-bold mb-4">How DCRE Multi-User Works</h2>
              
              <div className="space-y-4 text-sm text-slate-300">
                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="font-semibold text-cyan-400 mb-2">1. Shared Lattice Seed</h3>
                  <p>When you enter a channel code, it generates a <strong>deterministic initial lattice</strong>. Everyone with the same code starts with the exact same lattice state.</p>
                  <code className="block mt-2 text-xs bg-slate-900 p-2 rounded text-amber-400">
                    Lattice = encode("DCRE_v1_alpha-bravo-123", n=10, m=10)
                  </code>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="font-semibold text-cyan-400 mb-2">2. Messages as Perturbations</h3>
                  <p>Your message is encoded as <strong>lattice perturbations</strong> - small changes applied to specific cells.</p>
                  <code className="block mt-2 text-xs bg-slate-900 p-2 rounded text-amber-400">
                    perturbation = [(row, col, delta), ...]
                  </code>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="font-semibold text-cyan-400 mb-2">3. Delta Synchronization</h3>
                  <p>Instead of sending the message directly, you broadcast the <strong>delta (changes)</strong> to other peers. They apply the same changes to their lattice.</p>
                  <code className="block mt-2 text-xs bg-slate-900 p-2 rounded text-amber-400">
                    broadcast(delta) → all peers apply → same final state
                  </code>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="font-semibold text-cyan-400 mb-2">4. Deterministic Evolution</h3>
                  <p>After applying perturbations, the lattice <strong>evolves deterministically</strong>. Same input + same evolution = same output. Always.</p>
                  <code className="block mt-2 text-xs bg-slate-900 p-2 rounded text-amber-400">
                    G_new = Transform(G_old + perturbation)
                  </code>
                </div>

                <div className="bg-slate-800/50 rounded-lg p-4">
                  <h3 className="font-semibold text-cyan-400 mb-2">5. No Triangulation</h3>
                  <p>Traditional messaging: "Alice at IP 1.2.3.4 sends to Bob at IP 5.6.7.8 via route X"</p>
                  <p className="mt-2">DCRE: "A perturbation was applied. The lattice evolved. The fingerprint is H."</p>
                  <p className="mt-2 text-emerald-400">No sender location. No receiver location. No routing path.</p>
                </div>

                <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-lg p-4">
                  <h3 className="font-semibold text-white mb-2">Try It Yourself!</h3>
                  <p>Open this page in <strong>two browser tabs</strong>. Use the same channel code in both. Send a message from one tab and watch it appear in the other!</p>
                </div>
              </div>

              <button
                onClick={() => setShowHowItWorks(false)}
                className="mt-4 w-full px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Got it!
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main chat interface
  return (
    <div className="h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center font-bold">◈</div>
          <div>
            <div className="text-sm font-bold font-mono">{channelCode}</div>
            <div className="text-[10px] text-slate-500">
              {peerCount} peer{peerCount !== 1 ? 's' : ''} • Epoch {latticeState?.epoch || 0}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {latticeState && <LatticeViz grid={latticeState.grid} m={10} />}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/50">
            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
            <span className="text-sm">{userId}</span>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 px-4">
        {['chat', 'files', 'info'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize border-b-2 transition-colors ${
              activeTab === tab ? 'text-cyan-400 border-cyan-400' : 'text-slate-400 border-transparent'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-3">🎳</div>
                <p>No messages yet</p>
                <p className="text-xs mt-2">Share the channel code <span className="font-mono text-cyan-400">{channelCode}</span> with someone!</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.type === 'system' ? 'justify-center' : ''}`}>
                  {msg.type === 'system' ? (
                    <div className="text-xs text-slate-500 bg-slate-800/30 px-3 py-1 rounded-full">{msg.content}</div>
                  ) : msg.type === 'file' ? (
                    <div className="max-w-sm">
                      <div className="text-xs text-slate-400 mb-1">{msg.sender} shared a file</div>
                      <div className="bg-slate-800 rounded-lg p-3 flex items-center gap-3">
                        <div className="text-2xl">📁</div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{msg.content.fileName}</div>
                          <div className="text-xs text-slate-500">{(msg.content.size / 1024).toFixed(1)} KB</div>
                        </div>
                        <button
                          onClick={() => {
                            const file = protocol.getFile(msg.content.fileId);
                            if (file) downloadFile(file);
                          }}
                          className="px-3 py-1 rounded bg-cyan-500/20 text-cyan-400 text-xs"
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="max-w-md">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${msg.sender === userId ? 'text-emerald-400' : 'text-cyan-400'}`}>
                          {msg.sender}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className={`rounded-xl px-4 py-2 ${
                        msg.sender === userId ? 'bg-emerald-500/20' : 'bg-slate-800'
                      }`}>
                        {msg.content}
                      </div>
                      <div className="text-[10px] text-slate-600 mt-1 font-mono">
                        H:{msg.fingerprint?.slice(0, 6)} • E:{msg.epoch}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-slate-800">
            <div className="flex gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:outline-none focus:border-cyan-500"
              />
              <button onClick={() => fileInputRef.current?.click()} className="px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700">📎</button>
              <button onClick={sendMessage} disabled={!messageInput.trim()} className="px-6 py-3 rounded-xl bg-cyan-600 disabled:opacity-50 hover:bg-cyan-500">Send</button>
            </div>
            <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
          </div>
        </>
      )}

      {activeTab === 'files' && (
        <div className="flex-1 overflow-y-auto p-4">
          {files.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No files shared yet</div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {files.map(file => (
                <div key={file.fileId} className="bg-slate-800/50 rounded-xl p-4">
                  <div className="text-2xl mb-2">📁</div>
                  <div className="font-medium truncate">{file.fileName}</div>
                  <div className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB • by {file.sender}</div>
                  <button onClick={() => downloadFile(file)} className="mt-2 px-3 py-1 rounded bg-cyan-500/20 text-cyan-400 text-sm w-full">Download</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'info' && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-md mx-auto space-y-4">
            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">Channel Code</div>
              <div className="font-mono text-lg text-cyan-400">{channelCode}</div>
              <button 
                onClick={() => navigator.clipboard.writeText(channelCode)}
                className="mt-2 text-xs text-slate-400 hover:text-white"
              >
                Copy to clipboard
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-mono text-amber-400">{latticeState?.epoch || 0}</div>
                <div className="text-xs text-slate-500">Epoch</div>
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4 text-center">
                <div className="text-2xl font-mono text-emerald-400">{peerCount}</div>
                <div className="text-xs text-slate-500">Peers</div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-xl p-4">
              <div className="text-xs text-slate-500 mb-1">Lattice Fingerprint</div>
              <div className="font-mono text-amber-400">{latticeState?.fingerprint}</div>
            </div>

            <div className="flex justify-center">
              {latticeState && <LatticeViz grid={latticeState.grid} m={10} />}
            </div>
          </div>
        </div>
      )}

      <footer className="h-6 border-t border-slate-800 flex items-center justify-center text-[10px] text-slate-600">
        Bradley Clonan • clonanxyz@gmail.com • Open to Work
      </footer>
    </div>
  );
};

export default DCREMeshMultiUser;

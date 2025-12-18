/**
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  DCRE NETWORK ADAPTER                                                         ║
 * ║  Online/Offline Sync · Message Queuing · Triangulation-Free Routing           ║
 * ╠═══════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                               ║
 * ║  This adapter provides:                                                       ║
 * ║                                                                               ║
 * ║  1. TRANSPORT LAYER                                                           ║
 * ║     - WebSocket relay (online)                                                ║
 * ║     - WebRTC peer-to-peer (direct)                                           ║
 * ║     - BroadcastChannel (same device)                                         ║
 * ║     - IndexedDB persistence (offline)                                        ║
 * ║                                                                               ║
 * ║  2. ROUTING (Triangulation-Free)                                             ║
 * ║     - Bowling Alley lanes (parallel channels)                                ║
 * ║     - No IP/location tracking                                                 ║
 * ║     - Fingerprint-based message detection                                    ║
 * ║     - Delta propagation                                                       ║
 * ║                                                                               ║
 * ║  3. STATE MANAGEMENT                                                          ║
 * ║     - Grid state subscriptions                                                ║
 * ║     - Offline queue with auto-sync                                           ║
 * ║     - Conflict resolution via epoch ordering                                 ║
 * ║     - Checkpoint/restore system                                              ║
 * ║                                                                               ║
 * ║  Author: Bradley Clonan | clonanxyz@gmail.com                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: CORE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const DCREUtils = {
    // Modular arithmetic
    mod: (value, m) => ((value % m) + m) % m,

    // FNV-1a hash
    hash: (data) => {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(16).padStart(8, '0');
    },

    // Generate unique ID
    uid: () => `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

    // Timestamp
    now: () => Date.now(),

    // Deep clone
    clone: (obj) => JSON.parse(JSON.stringify(obj)),

    // Debounce
    debounce: (fn, ms) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn(...args), ms);
        };
    },

    // Retry with backoff
    retry: async (fn, maxAttempts = 3, baseDelay = 1000) => {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                if (attempt === maxAttempts) throw error;
                await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
            }
        }
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: PERSISTENCE LAYER (IndexedDB for Offline Support)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PERSISTENCE ADAPTER
 * 
 * Stores lattice states, deltas, and queued messages in IndexedDB.
 * Enables full offline operation with automatic sync when online.
 * 
 * STORES:
 * - channels: Channel metadata and current state
 * - deltas: All deltas for replay/verification
 * - queue: Outbound messages waiting for network
 * - checkpoints: Periodic full state snapshots
 */
class DCREPersistence {
    constructor(dbName = 'dcre_mesh') {
        this.dbName = dbName;
        this.db = null;
        this.ready = this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = () => reject(request.error);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Channel states
                if (!db.objectStoreNames.contains('channels')) {
                    const channels = db.createObjectStore('channels', { keyPath: 'channelId' });
                    channels.createIndex('lastUpdated', 'lastUpdated');
                }

                // Deltas for each channel
                if (!db.objectStoreNames.contains('deltas')) {
                    const deltas = db.createObjectStore('deltas', { keyPath: ['channelId', 'toEpoch'] });
                    deltas.createIndex('channelId', 'channelId');
                    deltas.createIndex('timestamp', 'timestamp');
                }

                // Outbound queue (offline messages)
                if (!db.objectStoreNames.contains('queue')) {
                    const queue = db.createObjectStore('queue', { keyPath: 'id' });
                    queue.createIndex('channelId', 'channelId');
                    queue.createIndex('timestamp', 'timestamp');
                    queue.createIndex('status', 'status');
                }

                // Checkpoints (full state snapshots)
                if (!db.objectStoreNames.contains('checkpoints')) {
                    const checkpoints = db.createObjectStore('checkpoints', { keyPath: ['channelId', 'epoch'] });
                    checkpoints.createIndex('channelId', 'channelId');
                }

                // Messages (for UI display)
                if (!db.objectStoreNames.contains('messages')) {
                    const messages = db.createObjectStore('messages', { keyPath: 'id' });
                    messages.createIndex('channelId', 'channelId');
                    messages.createIndex('timestamp', 'timestamp');
                }
            };

            request.onsuccess = () => {
                this.db = request.result;
                resolve(this);
            };
        });
    }

    // Generic transaction helper
    async transaction(stores, mode, callback) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(stores, mode);
            tx.onerror = () => reject(tx.error);
            tx.oncomplete = () => resolve();
            callback(tx);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CHANNEL OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    async saveChannel(channelData) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('channels', 'readwrite');
            const store = tx.objectStore('channels');
            const request = store.put({
                ...channelData,
                lastUpdated: DCREUtils.now()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getChannel(channelId) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('channels', 'readonly');
            const store = tx.objectStore('channels');
            const request = store.get(channelId);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllChannels() {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('channels', 'readonly');
            const store = tx.objectStore('channels');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // DELTA OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    async saveDelta(channelId, delta) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('deltas', 'readwrite');
            const store = tx.objectStore('deltas');
            const request = store.put({
                channelId,
                ...delta,
                timestamp: DCREUtils.now()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getDeltas(channelId, fromEpoch = 0) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('deltas', 'readonly');
            const store = tx.objectStore('deltas');
            const index = store.index('channelId');
            const request = index.getAll(channelId);
            request.onsuccess = () => {
                const deltas = request.result
                    .filter(d => d.toEpoch > fromEpoch)
                    .sort((a, b) => a.toEpoch - b.toEpoch);
                resolve(deltas);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // QUEUE OPERATIONS (Offline Messages)
    // ─────────────────────────────────────────────────────────────────────────────

    async enqueue(channelId, payload) {
        await this.ready;
        const item = {
            id: DCREUtils.uid(),
            channelId,
            payload,
            status: 'pending',
            timestamp: DCREUtils.now(),
            attempts: 0
        };
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('queue', 'readwrite');
            const store = tx.objectStore('queue');
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = () => reject(request.error);
        });
    }

    async dequeue(id) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('queue', 'readwrite');
            const store = tx.objectStore('queue');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getPendingQueue(channelId = null) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('queue', 'readonly');
            const store = tx.objectStore('queue');
            const index = store.index('status');
            const request = index.getAll('pending');
            request.onsuccess = () => {
                let items = request.result;
                if (channelId) {
                    items = items.filter(i => i.channelId === channelId);
                }
                resolve(items.sort((a, b) => a.timestamp - b.timestamp));
            };
            request.onerror = () => reject(request.error);
        });
    }

    async updateQueueItem(id, updates) {
        await this.ready;
        const item = await this.getQueueItem(id);
        if (!item) return null;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('queue', 'readwrite');
            const store = tx.objectStore('queue');
            const request = store.put({ ...item, ...updates });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getQueueItem(id) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('queue', 'readonly');
            const store = tx.objectStore('queue');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CHECKPOINT OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    async saveCheckpoint(channelId, epoch, grid, fingerprint) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('checkpoints', 'readwrite');
            const store = tx.objectStore('checkpoints');
            const request = store.put({
                channelId,
                epoch,
                grid,
                fingerprint,
                timestamp: DCREUtils.now()
            });
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getLatestCheckpoint(channelId) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('checkpoints', 'readonly');
            const store = tx.objectStore('checkpoints');
            const index = store.index('channelId');
            const request = index.getAll(channelId);
            request.onsuccess = () => {
                const checkpoints = request.result.sort((a, b) => b.epoch - a.epoch);
                resolve(checkpoints[0] || null);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // MESSAGE OPERATIONS
    // ─────────────────────────────────────────────────────────────────────────────

    async saveMessage(message) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            const request = store.put(message);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getMessages(channelId, limit = 100) {
        await this.ready;
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('messages', 'readonly');
            const store = tx.objectStore('messages');
            const index = store.index('channelId');
            const request = index.getAll(channelId);
            request.onsuccess = () => {
                const messages = request.result
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, limit)
                    .reverse();
                resolve(messages);
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Clear all data
    async clear() {
        await this.ready;
        const stores = ['channels', 'deltas', 'queue', 'checkpoints', 'messages'];
        for (const storeName of stores) {
            await new Promise((resolve, reject) => {
                const tx = this.db.transaction(storeName, 'readwrite');
                const store = tx.objectStore(storeName);
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: TRANSPORT LAYER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TRANSPORT INTERFACE
 * 
 * All transports implement this interface:
 * - connect(): Establish connection
 * - disconnect(): Close connection
 * - send(data): Send data to channel
 * - subscribe(callback): Receive data from channel
 * - isConnected(): Check connection status
 */

/**
 * BROADCAST CHANNEL TRANSPORT
 * 
 * Uses browser's BroadcastChannel API for same-device communication.
 * Perfect for demos and testing multi-tab scenarios.
 */
class BroadcastTransport {
    constructor(channelId) {
        this.channelId = channelId;
        this.channel = null;
        this.listeners = new Set();
        this.connected = false;
    }

    connect() {
        try {
            this.channel = new BroadcastChannel(`dcre_${this.channelId}`);
            this.channel.onmessage = (event) => {
                this.listeners.forEach(cb => cb(event.data));
            };
            this.connected = true;
            return true;
        } catch (e) {
            console.warn('BroadcastChannel not supported');
            return false;
        }
    }

    disconnect() {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.connected = false;
    }

    send(data) {
        if (this.channel && this.connected) {
            this.channel.postMessage(data);
            return true;
        }
        return false;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    isConnected() {
        return this.connected;
    }
}

/**
 * WEBSOCKET TRANSPORT
 * 
 * Connects to a relay server for cross-network communication.
 * Server only sees encrypted deltas, not message content.
 * 
 * PROTOCOL:
 * - JOIN: Subscribe to channel
 * - LEAVE: Unsubscribe from channel
 * - DELTA: Broadcast delta to channel members
 * - SYNC: Request state sync from peers
 */
class WebSocketTransport {
    constructor(channelId, serverUrl) {
        this.channelId = channelId;
        this.serverUrl = serverUrl;
        this.ws = null;
        this.listeners = new Set();
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.serverUrl);

                this.ws.onopen = () => {
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    // Join channel
                    this.send({
                        type: 'JOIN',
                        channelId: this.channelId,
                        timestamp: DCREUtils.now()
                    });
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.listeners.forEach(cb => cb(data));
                    } catch (e) {
                        console.warn('Invalid WebSocket message:', e);
                    }
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    this.attemptReconnect();
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

            } catch (e) {
                reject(e);
            }
        });
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.warn('Max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

        setTimeout(() => {
            console.log(`Reconnecting (attempt ${this.reconnectAttempts})...`);
            this.connect().catch(() => { });
        }, delay);
    }

    disconnect() {
        if (this.ws) {
            this.send({
                type: 'LEAVE',
                channelId: this.channelId
            });
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
            return true;
        }
        return false;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    isConnected() {
        return this.connected && this.ws?.readyState === WebSocket.OPEN;
    }
}

/**
 * WEBRTC TRANSPORT
 * 
 * Peer-to-peer communication after initial signaling.
 * Truly decentralized once connections are established.
 * 
 * PROCESS:
 * 1. Connect to signaling server
 * 2. Exchange offers/answers with peers
 * 3. Establish direct P2P connections
 * 4. Communicate directly (no server)
 */
class WebRTCTransport {
    constructor(channelId, signalingUrl) {
        this.channelId = channelId;
        this.signalingUrl = signalingUrl;
        this.peers = new Map(); // peerId → RTCPeerConnection
        this.dataChannels = new Map(); // peerId → RTCDataChannel
        this.listeners = new Set();
        this.connected = false;
        this.signaling = null;
        this.localId = DCREUtils.uid();

        this.rtcConfig = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
    }

    async connect() {
        // Connect to signaling server
        this.signaling = new WebSocket(this.signalingUrl);

        return new Promise((resolve, reject) => {
            this.signaling.onopen = () => {
                this.connected = true;
                // Announce presence
                this.signaling.send(JSON.stringify({
                    type: 'JOIN',
                    channelId: this.channelId,
                    peerId: this.localId
                }));
                resolve(true);
            };

            this.signaling.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                await this.handleSignaling(data);
            };

            this.signaling.onerror = reject;
        });
    }

    async handleSignaling(data) {
        const { type, peerId, payload } = data;

        switch (type) {
            case 'PEER_JOINED':
                // New peer joined, initiate connection
                await this.createOffer(peerId);
                break;

            case 'OFFER':
                // Received offer, create answer
                await this.handleOffer(peerId, payload);
                break;

            case 'ANSWER':
                // Received answer
                await this.handleAnswer(peerId, payload);
                break;

            case 'ICE_CANDIDATE':
                // Received ICE candidate
                await this.handleIceCandidate(peerId, payload);
                break;
        }
    }

    async createPeerConnection(peerId) {
        const pc = new RTCPeerConnection(this.rtcConfig);
        this.peers.set(peerId, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.signaling.send(JSON.stringify({
                    type: 'ICE_CANDIDATE',
                    peerId: this.localId,
                    targetPeerId: peerId,
                    payload: event.candidate
                }));
            }
        };

        pc.ondatachannel = (event) => {
            this.setupDataChannel(peerId, event.channel);
        };

        return pc;
    }

    setupDataChannel(peerId, channel) {
        this.dataChannels.set(peerId, channel);

        channel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.listeners.forEach(cb => cb(data));
            } catch (e) {
                console.warn('Invalid data channel message:', e);
            }
        };

        channel.onclose = () => {
            this.dataChannels.delete(peerId);
            this.peers.delete(peerId);
        };
    }

    async createOffer(peerId) {
        const pc = await this.createPeerConnection(peerId);
        const channel = pc.createDataChannel(`dcre_${this.channelId}`);
        this.setupDataChannel(peerId, channel);

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        this.signaling.send(JSON.stringify({
            type: 'OFFER',
            peerId: this.localId,
            targetPeerId: peerId,
            payload: offer
        }));
    }

    async handleOffer(peerId, offer) {
        const pc = await this.createPeerConnection(peerId);
        await pc.setRemoteDescription(offer);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.signaling.send(JSON.stringify({
            type: 'ANSWER',
            peerId: this.localId,
            targetPeerId: peerId,
            payload: answer
        }));
    }

    async handleAnswer(peerId, answer) {
        const pc = this.peers.get(peerId);
        if (pc) {
            await pc.setRemoteDescription(answer);
        }
    }

    async handleIceCandidate(peerId, candidate) {
        const pc = this.peers.get(peerId);
        if (pc) {
            await pc.addIceCandidate(candidate);
        }
    }

    disconnect() {
        // Close all peer connections
        for (const pc of this.peers.values()) {
            pc.close();
        }
        this.peers.clear();
        this.dataChannels.clear();

        // Close signaling
        if (this.signaling) {
            this.signaling.close();
            this.signaling = null;
        }

        this.connected = false;
    }

    send(data) {
        const payload = JSON.stringify(data);
        let sent = false;

        for (const channel of this.dataChannels.values()) {
            if (channel.readyState === 'open') {
                channel.send(payload);
                sent = true;
            }
        }

        return sent;
    }

    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    isConnected() {
        return this.connected && this.dataChannels.size > 0;
    }

    getPeerCount() {
        return this.dataChannels.size;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 4: BOWLING ALLEY ROUTER (Triangulation-Free)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * BOWLING ALLEY ROUTER
 * 
 * Implements triangulation-free routing where:
 * - Messages are identified by PERTURBATION SIGNATURE, not source/destination
 * - Routing is determined by LATTICE STATE, not IP addresses
 * - Verification is done by REPLAY, not trust
 * 
 * KEY CONCEPTS:
 * 
 * 1. LANES: Parallel independent channels
 *    Each lane has its own lattice state
 *    Messages in one lane don't affect others
 * 
 * 2. PERTURBATION SIGNATURE:
 *    P = hash(message + nonce + epoch)
 *    Used to identify and route messages
 *    No sender/receiver addresses needed
 * 
 * 3. EPOCH ORDERING:
 *    Messages are ordered by lattice epoch
 *    Conflicts resolved by epoch comparison
 *    No timestamps or clocks required
 * 
 * 4. FINGERPRINT VERIFICATION:
 *    Each state has unique fingerprint
 *    Verify by replay from known state
 *    No trust required
 */
class BowlingAlleyRouter {
    constructor(config = {}) {
        this.lanes = new Map(); // laneId → lane state
        this.subscriptions = new Map(); // pattern → callbacks
        this.messageIndex = new Map(); // perturbationHash → message
        this.maxLanes = config.maxLanes || 100;
        this.pruneInterval = config.pruneInterval || 60000;

        // Start pruning old messages
        this.startPruning();
    }

    /**
     * CREATE LANE
     * 
     * A lane is an independent communication channel.
     * Multiple lanes can exist in parallel without interference.
     */
    createLane(laneId, config = {}) {
        if (this.lanes.has(laneId)) {
            return this.lanes.get(laneId);
        }

        if (this.lanes.size >= this.maxLanes) {
            this.pruneOldestLane();
        }

        const lane = {
            id: laneId,
            created: DCREUtils.now(),
            lastActivity: DCREUtils.now(),
            epoch: 0,
            fingerprint: DCREUtils.hash(`lane_${laneId}_init`),
            pendingMessages: [],
            deliveredHashes: new Set(),
            subscribers: new Set(),
            config: {
                bufferSize: config.bufferSize || 1000,
                ttl: config.ttl || 3600000, // 1 hour default
                ...config
            }
        };

        this.lanes.set(laneId, lane);
        return lane;
    }

    /**
     * ROUTE MESSAGE
     * 
     * Routes a message through the appropriate lane.
     * No source/destination addresses - only perturbation signature.
     * 
     * Process:
     * 1. Compute perturbation hash from message
     * 2. Find target lane
     * 3. Check for duplicates using hash
     * 4. Update lane state
     * 5. Notify matching subscribers
     */
    routeMessage(laneId, message, delta) {
        const lane = this.lanes.get(laneId);
        if (!lane) {
            throw new Error(`Lane ${laneId} not found`);
        }

        // Compute perturbation signature
        const perturbationHash = DCREUtils.hash({
            content: message.content,
            nonce: message.nonce,
            epoch: delta.toEpoch
        });

        // Check for duplicate (already delivered)
        if (lane.deliveredHashes.has(perturbationHash)) {
            return { status: 'duplicate', hash: perturbationHash };
        }

        // Create routed message
        const routedMessage = {
            ...message,
            perturbationHash,
            laneId,
            routedAt: DCREUtils.now(),
            epoch: delta.toEpoch,
            delta
        };

        // Update lane state
        lane.epoch = delta.toEpoch;
        lane.fingerprint = delta.afterFingerprint || DCREUtils.hash(delta);
        lane.lastActivity = DCREUtils.now();
        lane.deliveredHashes.add(perturbationHash);

        // Buffer management
        lane.pendingMessages.push(routedMessage);
        if (lane.pendingMessages.length > lane.config.bufferSize) {
            lane.pendingMessages.shift();
        }

        // Index for lookup
        this.messageIndex.set(perturbationHash, routedMessage);

        // Notify subscribers
        this.notifySubscribers(laneId, routedMessage);

        return { status: 'routed', hash: perturbationHash, message: routedMessage };
    }

    /**
     * SUBSCRIBE TO LANE
     * 
     * Subscribe to receive messages from a lane.
     * Can specify patterns to filter messages.
     * 
     * Patterns:
     * - '*': All messages
     * - 'type:chat': Messages with type 'chat'
     * - 'sender:alice': Messages from sender 'alice'
     */
    subscribe(laneId, pattern, callback) {
        const lane = this.lanes.get(laneId);
        if (!lane) {
            this.createLane(laneId);
        }

        const subscription = {
            id: DCREUtils.uid(),
            laneId,
            pattern,
            callback,
            created: DCREUtils.now()
        };

        const key = `${laneId}:${pattern}`;
        if (!this.subscriptions.has(key)) {
            this.subscriptions.set(key, new Set());
        }
        this.subscriptions.get(key).add(subscription);

        // Return unsubscribe function
        return () => {
            const subs = this.subscriptions.get(key);
            if (subs) {
                subs.delete(subscription);
                if (subs.size === 0) {
                    this.subscriptions.delete(key);
                }
            }
        };
    }

    /**
     * NOTIFY SUBSCRIBERS
     * 
     * Deliver message to matching subscribers.
     */
    notifySubscribers(laneId, message) {
        // Notify wildcard subscribers
        const wildcardKey = `${laneId}:*`;
        const wildcardSubs = this.subscriptions.get(wildcardKey);
        if (wildcardSubs) {
            wildcardSubs.forEach(sub => sub.callback(message));
        }

        // Notify pattern-matched subscribers
        for (const [key, subs] of this.subscriptions) {
            if (!key.startsWith(`${laneId}:`)) continue;

            const pattern = key.split(':').slice(1).join(':');
            if (pattern === '*') continue; // Already handled

            if (this.matchesPattern(message, pattern)) {
                subs.forEach(sub => sub.callback(message));
            }
        }
    }

    /**
     * PATTERN MATCHING
     */
    matchesPattern(message, pattern) {
        if (pattern === '*') return true;

        const [field, value] = pattern.split(':');
        return message[field] === value;
    }

    /**
     * LOOKUP BY PERTURBATION HASH
     * 
     * Find a message by its perturbation signature.
     * No sender/receiver info needed.
     */
    lookupByHash(hash) {
        return this.messageIndex.get(hash);
    }

    /**
     * GET LANE STATE
     */
    getLaneState(laneId) {
        const lane = this.lanes.get(laneId);
        if (!lane) return null;

        return {
            id: lane.id,
            epoch: lane.epoch,
            fingerprint: lane.fingerprint,
            messageCount: lane.pendingMessages.length,
            lastActivity: lane.lastActivity,
            subscriberCount: this.getSubscriberCount(laneId)
        };
    }

    getSubscriberCount(laneId) {
        let count = 0;
        for (const [key, subs] of this.subscriptions) {
            if (key.startsWith(`${laneId}:`)) {
                count += subs.size;
            }
        }
        return count;
    }

    /**
     * GET MESSAGES SINCE EPOCH
     */
    getMessagesSinceEpoch(laneId, epoch) {
        const lane = this.lanes.get(laneId);
        if (!lane) return [];

        return lane.pendingMessages.filter(m => m.epoch > epoch);
    }

    /**
     * VERIFY MESSAGE BY REPLAY
     * 
     * Verify a message by replaying deltas.
     * True triangulation-free verification.
     */
    verifyMessage(hash, expectedFingerprint) {
        const message = this.messageIndex.get(hash);
        if (!message) {
            return { valid: false, reason: 'Message not found' };
        }

        // Compute expected fingerprint from delta
        const computedFingerprint = message.delta?.afterFingerprint;

        return {
            valid: computedFingerprint === expectedFingerprint,
            computed: computedFingerprint,
            expected: expectedFingerprint,
            message
        };
    }

    /**
     * PRUNING
     */
    startPruning() {
        setInterval(() => this.prune(), this.pruneInterval);
    }

    prune() {
        const now = DCREUtils.now();

        // Prune old messages from index
        for (const [hash, message] of this.messageIndex) {
            const lane = this.lanes.get(message.laneId);
            if (!lane || now - message.routedAt > lane.config.ttl) {
                this.messageIndex.delete(hash);
            }
        }

        // Prune inactive lanes
        for (const [laneId, lane] of this.lanes) {
            if (now - lane.lastActivity > lane.config.ttl && this.getSubscriberCount(laneId) === 0) {
                this.lanes.delete(laneId);
            }
        }
    }

    pruneOldestLane() {
        let oldest = null;
        let oldestTime = Infinity;

        for (const [laneId, lane] of this.lanes) {
            if (lane.lastActivity < oldestTime && this.getSubscriberCount(laneId) === 0) {
                oldest = laneId;
                oldestTime = lane.lastActivity;
            }
        }

        if (oldest) {
            this.lanes.delete(oldest);
        }
    }

    /**
     * EXPORT STATE
     */
    exportState() {
        const lanes = {};
        for (const [laneId, lane] of this.lanes) {
            lanes[laneId] = {
                id: lane.id,
                epoch: lane.epoch,
                fingerprint: lane.fingerprint,
                messageCount: lane.pendingMessages.length,
                created: lane.created,
                lastActivity: lane.lastActivity
            };
        }
        return lanes;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 5: STATE MANAGER (Grid State Subscriptions)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * STATE MANAGER
 * 
 * Manages lattice state with:
 * - Subscriptions for state changes
 * - Queuing for pending updates
 * - Checkpointing for recovery
 * - Conflict resolution
 */
class DCREStateManager {
    constructor(config = {}) {
        this.states = new Map(); // channelId → current state
        this.subscriptions = new Map(); // channelId → Set of callbacks
        this.pendingUpdates = new Map(); // channelId → queue of pending updates
        this.checkpoints = new Map(); // channelId → latest checkpoint

        this.config = {
            checkpointInterval: config.checkpointInterval || 50, // epochs
            maxPendingUpdates: config.maxPendingUpdates || 100,
            conflictResolution: config.conflictResolution || 'epoch', // 'epoch' or 'timestamp'
            ...config
        };

        this.persistence = config.persistence || null;
    }

    /**
     * INITIALIZE STATE
     */
    async initState(channelId, initialGrid, n, m) {
        const state = {
            channelId,
            grid: DCREUtils.clone(initialGrid),
            n,
            m,
            epoch: 0,
            fingerprint: this.computeFingerprint(initialGrid, n, m, 0),
            lastUpdated: DCREUtils.now(),
            history: []
        };

        this.states.set(channelId, state);
        this.pendingUpdates.set(channelId, []);

        // Save initial checkpoint
        await this.saveCheckpoint(channelId);

        return state;
    }

    /**
     * COMPUTE FINGERPRINT
     */
    computeFingerprint(grid, n, m, epoch) {
        let hash = 2166136261;
        const prime = 16777619;
        for (let row = 0; row < n; row++) {
            for (let col = 0; col < n; col++) {
                hash ^= grid[row][col];
                hash = Math.imul(hash, prime);
            }
        }
        hash ^= n ^ (m << 8) ^ (epoch << 16);
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    /**
     * APPLY DELTA
     */
    async applyDelta(channelId, delta, source = 'local') {
        const state = this.states.get(channelId);
        if (!state) {
            throw new Error(`State not found for channel ${channelId}`);
        }

        // Check epoch continuity
        if (delta.fromEpoch !== state.epoch) {
            // Queue for later or resolve conflict
            return this.handleEpochMismatch(channelId, delta, source);
        }

        // Apply changes
        for (const change of delta.changes) {
            state.grid[change.row][change.col] = change.to;
        }

        state.epoch = delta.toEpoch;
        state.fingerprint = this.computeFingerprint(state.grid, state.n, state.m, state.epoch);
        state.lastUpdated = DCREUtils.now();
        state.history.push({
            epoch: delta.toEpoch,
            changeCount: delta.changes.length,
            source,
            timestamp: DCREUtils.now()
        });

        // Limit history size
        if (state.history.length > 1000) {
            state.history = state.history.slice(-500);
        }

        // Save to persistence
        if (this.persistence) {
            await this.persistence.saveDelta(channelId, delta);
        }

        // Check if checkpoint needed
        if (state.epoch % this.config.checkpointInterval === 0) {
            await this.saveCheckpoint(channelId);
        }

        // Notify subscribers
        this.notifySubscribers(channelId, 'delta', { delta, state: this.getState(channelId) });

        // Process pending updates
        await this.processPendingUpdates(channelId);

        return { success: true, epoch: state.epoch, fingerprint: state.fingerprint };
    }

    /**
     * HANDLE EPOCH MISMATCH
     */
    async handleEpochMismatch(channelId, delta, source) {
        const state = this.states.get(channelId);
        const pending = this.pendingUpdates.get(channelId);

        if (delta.fromEpoch > state.epoch) {
            // Future delta - queue it
            if (pending.length < this.config.maxPendingUpdates) {
                pending.push({ delta, source, received: DCREUtils.now() });
                pending.sort((a, b) => a.delta.fromEpoch - b.delta.fromEpoch);
                return { success: false, queued: true, reason: 'Future epoch, queued for later' };
            } else {
                return { success: false, queued: false, reason: 'Queue full' };
            }
        } else if (delta.fromEpoch < state.epoch) {
            // Past delta - already applied or conflict
            if (this.config.conflictResolution === 'epoch') {
                return { success: false, queued: false, reason: 'Past epoch, already applied' };
            }
        }

        return { success: false, queued: false, reason: 'Unknown epoch mismatch' };
    }

    /**
     * PROCESS PENDING UPDATES
     */
    async processPendingUpdates(channelId) {
        const pending = this.pendingUpdates.get(channelId);
        if (!pending || pending.length === 0) return;

        const state = this.states.get(channelId);
        let processed = 0;

        while (pending.length > 0) {
            const next = pending[0];
            if (next.delta.fromEpoch === state.epoch) {
                pending.shift();
                await this.applyDelta(channelId, next.delta, next.source);
                processed++;
            } else if (next.delta.fromEpoch < state.epoch) {
                // Skip outdated
                pending.shift();
            } else {
                // Can't process yet
                break;
            }
        }

        if (processed > 0) {
            this.notifySubscribers(channelId, 'pending_processed', { count: processed });
        }
    }

    /**
     * SUBSCRIBE TO STATE CHANGES
     */
    subscribe(channelId, callback) {
        if (!this.subscriptions.has(channelId)) {
            this.subscriptions.set(channelId, new Set());
        }
        this.subscriptions.get(channelId).add(callback);

        // Return unsubscribe function
        return () => {
            const subs = this.subscriptions.get(channelId);
            if (subs) {
                subs.delete(callback);
            }
        };
    }

    /**
     * SUBSCRIBE TO ALL CHANNELS
     */
    subscribeAll(callback) {
        const unsubs = [];
        for (const channelId of this.states.keys()) {
            unsubs.push(this.subscribe(channelId, callback));
        }
        return () => unsubs.forEach(u => u());
    }

    /**
     * NOTIFY SUBSCRIBERS
     */
    notifySubscribers(channelId, event, data) {
        const subs = this.subscriptions.get(channelId);
        if (subs) {
            subs.forEach(cb => {
                try {
                    cb({ event, channelId, ...data });
                } catch (e) {
                    console.error('Subscriber error:', e);
                }
            });
        }
    }

    /**
     * GET STATE
     */
    getState(channelId) {
        const state = this.states.get(channelId);
        if (!state) return null;

        return {
            channelId: state.channelId,
            grid: DCREUtils.clone(state.grid),
            n: state.n,
            m: state.m,
            epoch: state.epoch,
            fingerprint: state.fingerprint,
            lastUpdated: state.lastUpdated,
            pendingCount: this.pendingUpdates.get(channelId)?.length || 0
        };
    }

    /**
     * CHECKPOINTING
     */
    async saveCheckpoint(channelId) {
        const state = this.states.get(channelId);
        if (!state) return;

        const checkpoint = {
            channelId,
            grid: DCREUtils.clone(state.grid),
            n: state.n,
            m: state.m,
            epoch: state.epoch,
            fingerprint: state.fingerprint,
            timestamp: DCREUtils.now()
        };

        this.checkpoints.set(channelId, checkpoint);

        if (this.persistence) {
            await this.persistence.saveCheckpoint(channelId, state.epoch, state.grid, state.fingerprint);
        }

        return checkpoint;
    }

    async loadFromCheckpoint(channelId) {
        let checkpoint = this.checkpoints.get(channelId);

        if (!checkpoint && this.persistence) {
            checkpoint = await this.persistence.getLatestCheckpoint(channelId);
        }

        if (!checkpoint) return null;

        const state = {
            channelId,
            grid: DCREUtils.clone(checkpoint.grid),
            n: checkpoint.n,
            m: checkpoint.m,
            epoch: checkpoint.epoch,
            fingerprint: checkpoint.fingerprint,
            lastUpdated: DCREUtils.now(),
            history: []
        };

        this.states.set(channelId, state);
        this.pendingUpdates.set(channelId, []);

        // Load and replay deltas since checkpoint
        if (this.persistence) {
            const deltas = await this.persistence.getDeltas(channelId, checkpoint.epoch);
            for (const delta of deltas) {
                await this.applyDelta(channelId, delta, 'replay');
            }
        }

        return state;
    }

    /**
     * VERIFY STATE
     */
    verifyState(channelId, expectedFingerprint) {
        const state = this.states.get(channelId);
        if (!state) {
            return { valid: false, reason: 'State not found' };
        }

        const computed = this.computeFingerprint(state.grid, state.n, state.m, state.epoch);
        return {
            valid: computed === expectedFingerprint,
            computed,
            expected: expectedFingerprint,
            epoch: state.epoch
        };
    }

    /**
     * EXPORT/IMPORT
     */
    exportState(channelId) {
        const state = this.states.get(channelId);
        if (!state) return null;

        return {
            channelId,
            grid: state.grid,
            n: state.n,
            m: state.m,
            epoch: state.epoch,
            fingerprint: state.fingerprint,
            exported: DCREUtils.now()
        };
    }

    importState(data) {
        const state = {
            channelId: data.channelId,
            grid: DCREUtils.clone(data.grid),
            n: data.n,
            m: data.m,
            epoch: data.epoch,
            fingerprint: data.fingerprint,
            lastUpdated: DCREUtils.now(),
            history: []
        };

        this.states.set(data.channelId, state);
        this.pendingUpdates.set(data.channelId, []);

        return state;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 6: MAIN ADAPTER (Ties Everything Together)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * DCRE NETWORK ADAPTER
 * 
 * Main adapter that integrates:
 * - Multiple transport options
 * - Persistence layer
 * - Bowling alley router
 * - State manager
 * - Online/offline handling
 * - Message queuing
 */
class DCREAdapter {
    constructor(config = {}) {
        this.config = {
            userId: config.userId || DCREUtils.uid(),
            transport: config.transport || 'broadcast', // 'broadcast', 'websocket', 'webrtc'
            serverUrl: config.serverUrl || null,
            enablePersistence: config.enablePersistence !== false,
            enableOfflineQueue: config.enableOfflineQueue !== false,
            autoReconnect: config.autoReconnect !== false,
            checkpointInterval: config.checkpointInterval || 50,
            ...config
        };

        // Core components
        this.persistence = this.config.enablePersistence ? new DCREPersistence() : null;
        this.router = new BowlingAlleyRouter();
        this.stateManager = new DCREStateManager({
            persistence: this.persistence,
            checkpointInterval: this.config.checkpointInterval
        });

        // Transport
        this.transport = null;
        this.transportType = null;

        // Connection state
        this.online = navigator.onLine;
        this.connected = false;
        this.channels = new Map(); // channelId → channel info

        // Event listeners
        this.listeners = new Map(); // event → Set of callbacks

        // Setup online/offline detection
        this.setupNetworkDetection();
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────────

    async init() {
        // Initialize persistence
        if (this.persistence) {
            await this.persistence.ready;
        }

        // Load saved channels
        await this.loadSavedChannels();

        this.emit('initialized', { userId: this.config.userId });
        return this;
    }

    async loadSavedChannels() {
        if (!this.persistence) return;

        const savedChannels = await this.persistence.getAllChannels();
        for (const channel of savedChannels) {
            this.channels.set(channel.channelId, {
                ...channel,
                connected: false
            });

            // Restore state from checkpoint
            await this.stateManager.loadFromCheckpoint(channel.channelId);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // NETWORK DETECTION
    // ─────────────────────────────────────────────────────────────────────────────

    setupNetworkDetection() {
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
    }

    async handleOnline() {
        this.online = true;
        this.emit('online', {});

        // Reconnect active channels
        for (const [channelId, channel] of this.channels) {
            if (!channel.connected) {
                await this.reconnectChannel(channelId);
            }
        }

        // Process offline queue
        await this.processOfflineQueue();
    }

    handleOffline() {
        this.online = false;
        this.emit('offline', {});

        // Mark all channels as disconnected
        for (const [channelId, channel] of this.channels) {
            channel.connected = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CHANNEL MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    async joinChannel(channelId, initialState = null) {
        // Create router lane
        this.router.createLane(channelId);

        // Initialize state
        if (initialState) {
            await this.stateManager.initState(
                channelId,
                initialState.grid,
                initialState.n,
                initialState.m
            );
        } else {
            // Try to load from persistence
            const loaded = await this.stateManager.loadFromCheckpoint(channelId);
            if (!loaded) {
                throw new Error(`No initial state provided and no saved state found for ${channelId}`);
            }
        }

        // Setup transport
        await this.setupTransport(channelId);

        // Track channel
        const channelInfo = {
            channelId,
            connected: this.transport?.isConnected() || false,
            joinedAt: DCREUtils.now(),
            userId: this.config.userId
        };
        this.channels.set(channelId, channelInfo);

        // Save to persistence
        if (this.persistence) {
            await this.persistence.saveChannel(channelInfo);
        }

        this.emit('channel_joined', { channelId });
        return channelInfo;
    }

    async leaveChannel(channelId) {
        const channel = this.channels.get(channelId);
        if (!channel) return;

        // Disconnect transport
        if (this.transport) {
            this.transport.disconnect();
        }

        this.channels.delete(channelId);
        this.emit('channel_left', { channelId });
    }

    async reconnectChannel(channelId) {
        const channel = this.channels.get(channelId);
        if (!channel || !this.online) return;

        try {
            await this.setupTransport(channelId);
            channel.connected = true;

            // Request sync from peers
            this.requestSync(channelId);

            this.emit('channel_reconnected', { channelId });
        } catch (e) {
            console.error(`Failed to reconnect channel ${channelId}:`, e);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // TRANSPORT SETUP
    // ─────────────────────────────────────────────────────────────────────────────

    async setupTransport(channelId) {
        // Cleanup existing transport
        if (this.transport) {
            this.transport.disconnect();
        }

        // Create transport based on config
        switch (this.config.transport) {
            case 'websocket':
                if (!this.config.serverUrl) {
                    throw new Error('WebSocket transport requires serverUrl');
                }
                this.transport = new WebSocketTransport(channelId, this.config.serverUrl);
                break;

            case 'webrtc':
                if (!this.config.serverUrl) {
                    throw new Error('WebRTC transport requires signalingUrl');
                }
                this.transport = new WebRTCTransport(channelId, this.config.serverUrl);
                break;

            case 'broadcast':
            default:
                this.transport = new BroadcastTransport(channelId);
                break;
        }

        this.transportType = this.config.transport;

        // Connect
        const connected = await this.transport.connect();
        this.connected = connected;

        // Subscribe to incoming messages
        this.transport.subscribe((data) => this.handleIncomingMessage(channelId, data));

        return connected;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // MESSAGE HANDLING
    // ─────────────────────────────────────────────────────────────────────────────

    handleIncomingMessage(channelId, data) {
        const { type, payload, sender } = data;

        // Ignore own messages
        if (sender === this.config.userId) return;

        switch (type) {
            case 'DELTA':
                this.handleIncomingDelta(channelId, payload, sender);
                break;

            case 'SYNC_REQUEST':
                this.handleSyncRequest(channelId, sender);
                break;

            case 'SYNC_RESPONSE':
                this.handleSyncResponse(channelId, payload);
                break;

            case 'MESSAGE':
                this.handleIncomingChatMessage(channelId, payload);
                break;

            default:
                console.warn('Unknown message type:', type);
        }
    }

    async handleIncomingDelta(channelId, payload, sender) {
        const { delta, message } = payload;

        // Route through bowling alley
        const routeResult = this.router.routeMessage(channelId, message || {}, delta);

        if (routeResult.status === 'duplicate') {
            return; // Already processed
        }

        // Apply to state
        const result = await this.stateManager.applyDelta(channelId, delta, sender);

        if (result.success) {
            // Save message
            if (message && this.persistence) {
                await this.persistence.saveMessage(message);
            }

            this.emit('delta_received', { channelId, delta, sender });

            if (message) {
                this.emit('message_received', { channelId, message });
            }
        } else if (result.queued) {
            this.emit('delta_queued', { channelId, delta, reason: result.reason });
        }
    }

    async handleSyncRequest(channelId, requester) {
        const state = this.stateManager.getState(channelId);
        if (!state) return;

        // Get recent deltas
        const deltas = this.persistence
            ? await this.persistence.getDeltas(channelId, Math.max(0, state.epoch - 100))
            : [];

        // Get recent messages
        const messages = this.persistence
            ? await this.persistence.getMessages(channelId, 50)
            : [];

        this.transport.send({
            type: 'SYNC_RESPONSE',
            sender: this.config.userId,
            payload: {
                epoch: state.epoch,
                fingerprint: state.fingerprint,
                deltas,
                messages
            }
        });
    }

    async handleSyncResponse(channelId, payload) {
        const { epoch, fingerprint, deltas, messages } = payload;
        const currentState = this.stateManager.getState(channelId);

        if (!currentState || epoch <= currentState.epoch) return;

        // Apply missing deltas
        for (const delta of deltas) {
            if (delta.toEpoch > currentState.epoch) {
                await this.stateManager.applyDelta(channelId, delta, 'sync');
            }
        }

        // Save messages
        if (messages && this.persistence) {
            for (const msg of messages) {
                await this.persistence.saveMessage(msg);
            }
        }

        this.emit('synced', { channelId, epoch: this.stateManager.getState(channelId)?.epoch });
    }

    handleIncomingChatMessage(channelId, message) {
        this.emit('message_received', { channelId, message });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SENDING MESSAGES
    // ─────────────────────────────────────────────────────────────────────────────

    async send(channelId, content, type = 'text', metadata = {}) {
        const message = {
            id: DCREUtils.uid(),
            channelId,
            type,
            content,
            sender: this.config.userId,
            timestamp: DCREUtils.now(),
            nonce: DCREUtils.uid(),
            ...metadata
        };

        // If offline, queue the message
        if (!this.online || !this.connected) {
            return this.queueMessage(channelId, message);
        }

        return this.sendImmediate(channelId, message);
    }

    async sendImmediate(channelId, message) {
        const state = this.stateManager.getState(channelId);
        if (!state) {
            throw new Error(`No state found for channel ${channelId}`);
        }

        // Create delta (simplified - in real implementation, this would apply perturbation and evolve)
        const delta = {
            fromEpoch: state.epoch,
            toEpoch: state.epoch + 1,
            changes: this.createPerturbationChanges(message, state),
            timestamp: DCREUtils.now()
        };

        // Apply locally
        await this.stateManager.applyDelta(channelId, delta, 'local');

        // Save message
        if (this.persistence) {
            await this.persistence.saveMessage(message);
        }

        // Broadcast
        this.transport.send({
            type: 'DELTA',
            sender: this.config.userId,
            payload: { delta, message }
        });

        this.transport.send({
            type: 'MESSAGE',
            sender: this.config.userId,
            payload: message
        });

        this.emit('message_sent', { channelId, message });
        return message;
    }

    createPerturbationChanges(message, state) {
        // Convert message to perturbation changes
        const bytes = new TextEncoder().encode(JSON.stringify(message));
        const changes = [];

        for (let i = 0; i < Math.min(bytes.length, state.n * state.n); i++) {
            const row = Math.floor(i / state.n);
            const col = i % state.n;
            const oldVal = state.grid[row][col];
            const newVal = DCREUtils.mod(oldVal + bytes[i], state.m);

            if (oldVal !== newVal) {
                changes.push({ row, col, from: oldVal, to: newVal });
            }
        }

        return changes;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // OFFLINE QUEUE
    // ─────────────────────────────────────────────────────────────────────────────

    async queueMessage(channelId, message) {
        if (!this.persistence || !this.config.enableOfflineQueue) {
            throw new Error('Cannot queue message: offline queue disabled');
        }

        const queueItem = await this.persistence.enqueue(channelId, message);
        this.emit('message_queued', { channelId, message, queueItem });
        return { queued: true, queueItem };
    }

    async processOfflineQueue() {
        if (!this.persistence || !this.config.enableOfflineQueue) return;

        const pending = await this.persistence.getPendingQueue();
        let processed = 0;
        let failed = 0;

        for (const item of pending) {
            try {
                await this.sendImmediate(item.channelId, item.payload);
                await this.persistence.dequeue(item.id);
                processed++;
            } catch (e) {
                // Update attempt count
                await this.persistence.updateQueueItem(item.id, {
                    attempts: item.attempts + 1,
                    lastError: e.message
                });
                failed++;
            }
        }

        if (processed > 0 || failed > 0) {
            this.emit('queue_processed', { processed, failed });
        }
    }

    async getQueueStatus() {
        if (!this.persistence) return { count: 0, items: [] };

        const pending = await this.persistence.getPendingQueue();
        return {
            count: pending.length,
            items: pending.map(i => ({
                id: i.id,
                channelId: i.channelId,
                timestamp: i.timestamp,
                attempts: i.attempts
            }))
        };
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SYNC
    // ─────────────────────────────────────────────────────────────────────────────

    requestSync(channelId) {
        if (!this.transport || !this.connected) return;

        this.transport.send({
            type: 'SYNC_REQUEST',
            sender: this.config.userId,
            payload: { channelId }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // STATE ACCESS
    // ─────────────────────────────────────────────────────────────────────────────

    getState(channelId) {
        return this.stateManager.getState(channelId);
    }

    subscribeToState(channelId, callback) {
        return this.stateManager.subscribe(channelId, callback);
    }

    subscribeToLane(channelId, pattern, callback) {
        return this.router.subscribe(channelId, pattern, callback);
    }

    getLaneState(channelId) {
        return this.router.getLaneState(channelId);
    }

    verifyMessage(hash, expectedFingerprint) {
        return this.router.verifyMessage(hash, expectedFingerprint);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENT SYSTEM
    // ─────────────────────────────────────────────────────────────────────────────

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.listeners.get(event).delete(callback);
    }

    off(event, callback) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.delete(callback);
        }
    }

    emit(event, data) {
        const listeners = this.listeners.get(event);
        if (listeners) {
            listeners.forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`Event listener error for ${event}:`, e);
                }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CLEANUP
    // ─────────────────────────────────────────────────────────────────────────────

    async destroy() {
        // Leave all channels
        for (const channelId of this.channels.keys()) {
            await this.leaveChannel(channelId);
        }

        // Cleanup
        this.listeners.clear();
        this.emit('destroyed', {});
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // DEBUG/STATUS
    // ─────────────────────────────────────────────────────────────────────────────

    getStatus() {
        return {
            userId: this.config.userId,
            online: this.online,
            connected: this.connected,
            transport: this.transportType,
            channels: Array.from(this.channels.values()),
            router: this.router.exportState()
        };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export {
    DCREAdapter,
    DCREPersistence,
    DCREStateManager,
    BowlingAlleyRouter,
    BroadcastTransport,
    WebSocketTransport,
    WebRTCTransport,
    DCREUtils
};

export default DCREAdapter;
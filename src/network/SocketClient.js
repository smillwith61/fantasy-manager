import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL
  || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

// Singleton socket client — shared across all Phaser scenes
class SocketClientClass {
  constructor() {
    this._socket = null;
    this.publicState = {};
    this.privateState = {};
    this.myPlayerId = null;
    this.roomCode = null;
  }

  connect() {
    if (this._socket?.connected) return Promise.resolve(this._socket);
    this._socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });

    // Keep state in sync
    this._socket.on('room_created', ({ code, publicState, privateState, player }) => {
      this.roomCode = code;
      this.myPlayerId = player.id;
      this.publicState = publicState;
      this.privateState = privateState;
    });
    this._socket.on('room_joined', ({ code, publicState, privateState, player }) => {
      this.roomCode = code;
      this.myPlayerId = player.id;
      this.publicState = publicState;
      this.privateState = privateState;
    });
    this._socket.on('player_joined',    ({ publicState }) => { this.publicState = publicState; });
    this._socket.on('game_started',     ({ publicState }) => { this.publicState = publicState; });
    this._socket.on('auction_update',   (s) => { if (this.publicState) this.publicState.auction = s; });
    this._socket.on('auction_result',   (r) => { if (r?.publicState) this.publicState = r.publicState; });
    this._socket.on('phase_changed',    ({ publicState }) => { if (publicState) this.publicState = publicState; });
    this._socket.on('matchday_results', ({ publicState }) => { if (publicState) this.publicState = publicState; });
    this._socket.on('transfer_update',  ({ publicState }) => { if (publicState) this.publicState = publicState; });
    this._socket.on('private_state',    (ps) => { this.privateState = ps; });

    return new Promise((resolve) => this._socket.on('connect', () => resolve(this._socket)));
  }

  get socket()     { return this._socket; }
  get isConnected(){ return this._socket?.connected ?? false; }
  get me()         { return this.publicState?.players?.[this.myPlayerId] ?? null; }
  get isHost()     { return this.me?.isHost ?? false; }

  emit(event, data) { this._socket?.emit(event, data); }

  // Register a listener; returns an unsubscribe function
  on(event, fn) {
    this._socket?.on(event, fn);
    return () => this._socket?.off(event, fn);
  }

  off(event, fn) { this._socket?.off(event, fn); }
}

export const SocketClient = new SocketClientClass();

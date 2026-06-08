import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GameRoom } from './GameRoom.js';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.static(path.join(__dirname, '../dist')));
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const rooms = new Map(); // code -> GameRoom

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getRoom(socket) {
  return rooms.get(socket.data?.roomCode);
}

io.on('connection', (socket) => {
  console.log('[+] Connected:', socket.id);

  // Lobby
  socket.on('create_room', ({ name, clubId }) => {
    const code = generateCode();
    const room = new GameRoom(code, io);
    rooms.set(code, room);
    const player = room.addPlayer(socket.id, name, clubId);
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.playerId = player.id;

    socket.emit('room_created', {
      code, player: room.getPlayerPublic(player),
      publicState: room.getPublicState(),
      privateState: room.getPrivateState(player.id),
    });
    console.log(`[room] Created ${code} by ${name}`);
  });

  socket.on('join_room', ({ code, name, clubId }) => {
    const uc = code.toUpperCase();
    const room = rooms.get(uc);
    if (!room) return socket.emit('join_error', 'Raum nicht gefunden.');
    if (room.phase !== 'lobby') return socket.emit('join_error', 'Spiel laeuft bereits.');
    if (room.players.length >= 8) return socket.emit('join_error', 'Raum ist voll (max. 8).');

    const player = room.addPlayer(socket.id, name, clubId);
    socket.join(uc);
    socket.data.roomCode = uc;
    socket.data.playerId = player.id;

    socket.emit('room_joined', {
      code: uc, player: room.getPlayerPublic(player),
      publicState: room.getPublicState(),
      privateState: room.getPrivateState(player.id),
    });
    socket.to(uc).emit('player_joined', {
      player: room.getPlayerPublic(player),
      publicState: room.getPublicState(),
    });
    console.log(`[room] ${name} joined ${uc}`);
  });

  socket.on('start_game', () => {
    const room = getRoom(socket);
    if (!room || room.players[socket.data.playerId]?.isHost !== true) return;
    if (room.players.length < 2) return socket.emit('join_error', 'Mindestens 2 Spieler benoetigt.');
    room.startGame();
    room.broadcast('game_started', { publicState: room.getPublicState() });
    room.sendAllPrivateStates();
    console.log(`[game] ${room.code} started with ${room.players.length} players`);
    setTimeout(() => room.startNextAuction(), 500);
  });

  // Auction
  socket.on('raise_bid', ({ amount }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.handleRaiseBid(socket.data.playerId, amount);
  });

  socket.on('pass_bid', () => {
    const room = getRoom(socket);
    if (!room) return;
    room.handlePassBid(socket.data.playerId);
  });

  socket.on('skip_auction', () => {
    const room = getRoom(socket);
    if (!room) return;
    room.skipCurrentAuction();
  });

  socket.on('end_auction_phase', () => {
    const room = getRoom(socket);
    if (!room || !room.players[socket.data.playerId]?.isHost) return;
    room.endAuctionPhase();
  });

  // Lineup (from TeamScene) - stores lineup + slot assignments for OOP penalty
  socket.on('submit_lineup', ({ lineup, slotAssignments, formation }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.storeLineup(socket.data.playerId, lineup, slotAssignments ?? {}, formation ?? '4-3-3');
  });

  // Matchday prep
  socket.on('submit_prep', ({ lineup, cardUid, targetManagerId, targetPlayerId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.submitPrep(socket.data.playerId, lineup, cardUid ?? null, targetManagerId ?? null, targetPlayerId ?? null);
  });

  socket.on('ready_for_matchday', () => {
    const room = getRoom(socket);
    if (!room) return;
    room.markReady(socket.data.playerId);
  });

  // Transfer
  socket.on('buy_player', ({ playerId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.handleBuyPlayer(socket.data.playerId, playerId);
  });

  socket.on('sell_player', ({ playerId }) => {
    const room = getRoom(socket);
    if (!room) return;
    room.handleSellPlayer(socket.data.playerId, playerId);
  });

  socket.on('transfer_ready', () => {
    const room = getRoom(socket);
    if (!room) return;
    room.markTransferReady(socket.data.playerId);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const room = getRoom(socket);
    if (room) {
      room.handleDisconnect(socket.id);
      socket.to(socket.data.roomCode).emit('player_disconnected', { playerId: socket.data.playerId });
    }
    console.log('[-] Disconnected:', socket.id);
  });
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => console.log(`\n Fantasy Manager Server auf http://localhost:${PORT}\n`));

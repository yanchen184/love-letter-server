const WebSocket = require('ws');
const http = require('http');

const VERSION = '1.0.0';
const PORT = process.env.PORT || 8089;

// 遊戲房間管理
const rooms = new Map();

// 卡牌定義
const CARD_TYPES = {
  GUARD: { value: 1, name: '守衛', count: 5 },
  PRIEST: { value: 2, name: '神父', count: 2 },
  BARON: { value: 3, name: '男爵', count: 2 },
  HANDMAID: { value: 4, name: '侍女', count: 2 },
  PRINCE: { value: 5, name: '王子', count: 2 },
  KING: { value: 6, name: '國王', count: 1 },
  COUNTESS: { value: 7, name: '伯爵夫人', count: 1 },
  PRINCESS: { value: 8, name: '公主', count: 1 }
};

// 創建 HTTP 伺服器（健康檢查用）
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health' || req.url === '/') {
    res.end(JSON.stringify({
      name: 'Love Letter Server',
      version: VERSION,
      status: 'running',
      rooms: rooms.size
    }));
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// WebSocket 伺服器
const wss = new WebSocket.Server({ server });

// 遊戲房間類別
class GameRoom {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map(); // playerId -> Player
    this.sockets = new Map(); // playerId -> WebSocket
    this.deck = [];
    this.removedCards = [];
    this.currentPlayerIndex = 0;
    this.phase = 'WAITING'; // WAITING, PLAYING, ROUND_END, GAME_OVER
    this.hostId = null;
  }

  get playerCount() { return this.players.size; }

  get tokensToWin() {
    switch (this.playerCount) {
      case 2: return 7;
      case 3: return 5;
      default: return 4;
    }
  }

  addPlayer(playerId, playerName, socket, isHost) {
    if (this.playerCount >= 4) return false;

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      hand: [],
      discardPile: [],
      eliminated: false,
      protected: false,
      tokens: 0
    });
    this.sockets.set(playerId, socket);

    if (isHost || !this.hostId) {
      this.hostId = playerId;
    }
    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    this.sockets.delete(playerId);

    if (this.hostId === playerId && this.playerCount > 0) {
      this.hostId = this.players.keys().next().value;
    }
  }

  initDeck() {
    this.deck = [];
    let id = 0;
    for (const [type, info] of Object.entries(CARD_TYPES)) {
      for (let i = 0; i < info.count; i++) {
        this.deck.push({ id: id++, type, value: info.value });
      }
    }
    this.shuffleDeck();
  }

  shuffleDeck() {
    for (let i = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }

  drawCard() {
    return this.deck.pop() || null;
  }

  getActivePlayers() {
    return [...this.players.values()].filter(p => !p.eliminated);
  }

  getCurrentPlayer() {
    const active = this.getActivePlayers();
    if (active.length === 0) return null;
    return active[this.currentPlayerIndex % active.length];
  }

  nextPlayer() {
    const active = this.getActivePlayers();
    if (active.length <= 1) return;
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % active.length;
  }

  getTargetablePlayers(excludeId) {
    return this.getActivePlayers().filter(p => p.id !== excludeId && !p.protected);
  }

  broadcast(message) {
    const json = JSON.stringify(message);
    for (const socket of this.sockets.values()) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(json);
      }
    }
  }

  sendTo(playerId, message) {
    const socket = this.sockets.get(playerId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  isRoundOver() {
    return this.getActivePlayers().length <= 1 || this.deck.length === 0;
  }

  determineRoundWinner() {
    const active = this.getActivePlayers();
    if (active.length === 1) return active[0];

    let winner = null;
    let highestValue = -1;
    for (const player of active) {
      const handValue = player.hand.reduce((sum, c) => sum + c.value, 0);
      if (handValue > highestValue) {
        highestValue = handValue;
        winner = player;
      }
    }
    return winner;
  }

  isGameOver() {
    for (const player of this.players.values()) {
      if (player.tokens >= this.tokensToWin) return true;
    }
    return false;
  }

  getGameWinner() {
    for (const player of this.players.values()) {
      if (player.tokens >= this.tokensToWin) return player;
    }
    return null;
  }
}

// 遊戲邏輯
function startGame(room) {
  if (room.playerCount < 2) {
    room.broadcast({ type: 'ERROR', data: { message: '需要至少2位玩家' } });
    return;
  }

  room.phase = 'PLAYING';
  room.broadcast({ type: 'GAME_START' });
  startNewRound(room);
}

function startNewRound(room) {
  // 重置玩家
  for (const player of room.players.values()) {
    player.hand = [];
    player.discardPile = [];
    player.eliminated = false;
    player.protected = false;
  }

  // 初始化牌組
  room.initDeck();
  room.removedCards = [];

  // 移除牌
  room.removedCards.push(room.drawCard());
  if (room.playerCount === 2) {
    for (let i = 0; i < 3; i++) {
      room.removedCards.push(room.drawCard());
    }
  }

  // 發牌
  for (const player of room.players.values()) {
    const card = room.drawCard();
    player.hand.push(card);
    room.sendTo(player.id, {
      type: 'CARD_DRAWN',
      data: { playerId: player.id, card }
    });
  }

  room.currentPlayerIndex = 0;
  drawCardForCurrentPlayer(room);
}

function drawCardForCurrentPlayer(room) {
  const current = room.getCurrentPlayer();
  if (!current) return;

  current.protected = false;

  const card = room.drawCard();
  if (card) {
    current.hand.push(card);
    room.sendTo(current.id, {
      type: 'CARD_DRAWN',
      data: { playerId: current.id, card }
    });
  }

  room.broadcast({
    type: 'TURN_CHANGE',
    data: { currentPlayer: current.id, currentPlayerName: current.name }
  });
}

function playCard(room, playerId, cardIndex, targetId, guessType) {
  const player = room.players.get(playerId);
  const current = room.getCurrentPlayer();

  if (!player || !current || current.id !== playerId) {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '不是你的回合' } });
    return;
  }

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '無效的卡牌' } });
    return;
  }

  const card = player.hand[cardIndex];

  // 檢查伯爵夫人強制規則
  if (mustPlayCountess(player) && card.type !== 'COUNTESS') {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '你必須打出伯爵夫人！' } });
    return;
  }

  // 執行效果
  const target = targetId ? room.players.get(targetId) : null;
  const result = executeCard(room, player, card, target, guessType);

  // 棄牌
  player.hand.splice(cardIndex, 1);
  player.discardPile.push(card);

  room.broadcast({
    type: 'CARD_PLAYED',
    data: { playerId, cardType: card.type, targetId, result }
  });

  checkRoundEnd(room);
}

function mustPlayCountess(player) {
  const hasCountess = player.hand.some(c => c.type === 'COUNTESS');
  const hasKingOrPrince = player.hand.some(c => c.type === 'KING' || c.type === 'PRINCE');
  return hasCountess && hasKingOrPrince;
}

function executeCard(room, player, card, target, guessType) {
  switch (card.type) {
    case 'GUARD':
      if (!guessType || guessType === 'GUARD') return '無效猜測';
      if (!target || target.protected) return '無效目標';
      if (target.hand.some(c => c.type === guessType)) {
        target.eliminated = true;
        target.discardPile.push(...target.hand);
        target.hand = [];
        return `猜對了！${target.name} 出局`;
      }
      return '猜錯了';

    case 'PRIEST':
      if (!target || target.protected) return '無效目標';
      if (target.hand.length > 0) {
        room.sendTo(player.id, {
          type: 'PRIEST_PEEK',
          data: { targetName: target.name, card: target.hand[0] }
        });
      }
      return `查看了 ${target.name} 的手牌`;

    case 'BARON':
      if (!target || target.protected) return '無效目標';
      const playerCard = player.hand.find(c => c.type !== 'BARON');
      const playerValue = playerCard ? playerCard.value : 0;
      const targetValue = target.hand[0]?.value || 0;

      if (playerValue > targetValue) {
        target.eliminated = true;
        target.discardPile.push(...target.hand);
        target.hand = [];
        return `${target.name} 出局 (${targetValue} vs ${playerValue})`;
      } else if (targetValue > playerValue) {
        player.eliminated = true;
        player.discardPile.push(...player.hand);
        player.hand = [];
        return `${player.name} 出局 (${playerValue} vs ${targetValue})`;
      }
      return '平手！';

    case 'HANDMAID':
      player.protected = true;
      return `${player.name} 獲得保護`;

    case 'PRINCE':
      const princetarget = target || player;
      if (princetarget !== player && princetarget.protected) return '目標受保護';

      if (princetarget.hand.some(c => c.type === 'PRINCESS')) {
        princetarget.eliminated = true;
        princetarget.discardPile.push(...princetarget.hand);
        princetarget.hand = [];
        return `${princetarget.name} 棄掉公主，出局！`;
      }

      if (princetarget.hand.length > 0) {
        princetarget.discardPile.push(...princetarget.hand);
        princetarget.hand = [];
        const newCard = room.drawCard();
        if (newCard) {
          princetarget.hand.push(newCard);
          room.sendTo(princetarget.id, {
            type: 'CARD_DRAWN',
            data: { playerId: princetarget.id, card: newCard }
          });
        }
      }
      return `${princetarget.name} 棄牌重抽`;

    case 'KING':
      if (!target || target.protected) return '無效目標';
      const playerHand = player.hand.filter(c => c.type !== 'KING');
      const targetHand = [...target.hand];
      player.hand = player.hand.filter(c => c.type === 'KING');
      player.hand.push(...targetHand);
      target.hand = playerHand;
      return `${player.name} 和 ${target.name} 交換了手牌`;

    case 'COUNTESS':
      return '打出伯爵夫人';

    case 'PRINCESS':
      player.eliminated = true;
      player.discardPile.push(...player.hand);
      player.hand = [];
      return `${player.name} 打出公主，出局！`;

    default:
      return '未知效果';
  }
}

function checkRoundEnd(room) {
  if (room.isRoundOver()) {
    const winner = room.determineRoundWinner();
    if (winner) {
      winner.tokens++;
      room.broadcast({
        type: 'ROUND_END',
        data: { winner: winner.id, winnerName: winner.name, tokens: winner.tokens }
      });
    }

    if (room.isGameOver()) {
      const gameWinner = room.getGameWinner();
      room.phase = 'GAME_OVER';
      room.broadcast({
        type: 'GAME_END',
        data: { winner: gameWinner.id, winnerName: gameWinner.name }
      });
    } else {
      setTimeout(() => startNewRound(room), 2000);
    }
  } else {
    room.nextPlayer();
    drawCardForCurrentPlayer(room);
  }
}

// WebSocket 連線處理
wss.on('connection', (ws, req) => {
  // 從 URL 解析房間 ID: /ws/game/1234
  const url = req.url || '';
  const match = url.match(/\/ws\/game\/(\w+)/);
  const roomId = match ? match[1] : 'default';

  let playerId = null;

  console.log(`New connection for room: ${roomId}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`Received: ${msg.type}`, msg.data);

      switch (msg.type) {
        case 'JOIN_ROOM': {
          playerId = msg.data.playerId;
          const playerName = msg.data.playerName;
          const isHost = msg.data.isHost;

          let room = rooms.get(roomId);
          if (!room) {
            room = new GameRoom(roomId);
            rooms.set(roomId, room);
          }

          if (room.addPlayer(playerId, playerName, ws, isHost)) {
            room.broadcast({
              type: 'PLAYER_JOINED',
              data: { playerId, playerName, playerCount: room.playerCount }
            });
            console.log(`${playerName} joined room ${roomId}`);
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', data: { message: '房間已滿' } }));
          }
          break;
        }

        case 'START_GAME': {
          const room = rooms.get(roomId);
          if (room) startGame(room);
          break;
        }

        case 'PLAY_CARD': {
          const room = rooms.get(roomId);
          if (room) {
            playCard(room, msg.data.playerId, msg.data.cardIndex,
                     msg.data.targetId, msg.data.guessType);
          }
          break;
        }

        case 'LEAVE_ROOM': {
          const room = rooms.get(roomId);
          if (room && playerId) {
            const player = room.players.get(playerId);
            room.removePlayer(playerId);
            room.broadcast({
              type: 'PLAYER_LEFT',
              data: { playerId, playerName: player?.name }
            });

            if (room.playerCount === 0) {
              rooms.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            }
          }
          break;
        }

        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
      }
    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (room && playerId) {
      const player = room.players.get(playerId);
      room.removePlayer(playerId);
      room.broadcast({
        type: 'PLAYER_LEFT',
        data: { playerId, playerName: player?.name }
      });

      if (room.playerCount === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      }
    }
    console.log(`Connection closed for room: ${roomId}`);
  });
});

// 啟動伺服器
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║   情書 Love Letter Server v${VERSION}     ║
║   Port: ${PORT}                           ║
║   Status: Running                     ║
╚═══════════════════════════════════════╝
  `);
});

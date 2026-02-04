/**
 * 通用遊戲伺服器 - Game Hub Server
 * 支援多種桌遊的 WebSocket 伺服器
 *
 * 版本: 1.0.0
 */

const WebSocket = require('ws');
const http = require('http');

const VERSION = '1.0.0';
const PORT = process.env.PORT || 8089;

// 載入遊戲模組
const games = {
  'love-letter': require('./games/love-letter')
};

// 房間管理
const rooms = new Map();

// 建立 HTTP 伺服器
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.url;

  // 首頁 / 健康檢查
  if (url === '/' || url === '/health') {
    res.end(JSON.stringify({
      name: 'Game Hub Server',
      version: VERSION,
      status: 'running',
      games: Object.keys(games),
      rooms: rooms.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 列出所有房間
  if (url === '/rooms') {
    const roomList = [];
    for (const [id, room] of rooms) {
      roomList.push({
        id,
        game: room.game.gameName,
        players: room.game.playerCount,
        maxPlayers: room.game.maxPlayers,
        phase: room.game.phase
      });
    }
    res.end(JSON.stringify({ rooms: roomList }));
    return;
  }

  // 列出支援的遊戲
  if (url === '/games') {
    const gameList = Object.keys(games).map(key => ({
      id: key,
      name: key,
      minPlayers: 2,
      maxPlayers: 4
    }));
    res.end(JSON.stringify({ games: gameList }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
});

// WebSocket 伺服器
const wss = new WebSocket.Server({ server });

/**
 * 房間類別 - 通用房間管理
 */
class GameRoom {
  constructor(roomId, gameType) {
    this.roomId = roomId;
    this.gameType = gameType;
    this.sockets = new Map(); // playerId -> WebSocket
    this.hostId = null;

    // 根據遊戲類型建立遊戲實例
    const GameClass = games[gameType]?.LoveLetterGame || games['love-letter'].LoveLetterGame;
    this.game = new GameClass(roomId);
  }

  addPlayer(playerId, playerName, socket, isHost) {
    if (!this.game.addPlayer(playerId, playerName)) {
      return false;
    }
    this.sockets.set(playerId, socket);
    if (isHost || !this.hostId) {
      this.hostId = playerId;
    }
    return true;
  }

  removePlayer(playerId) {
    this.game.removePlayer(playerId);
    this.sockets.delete(playerId);
    if (this.hostId === playerId && this.game.playerCount > 0) {
      this.hostId = this.game.players.keys().next().value;
    }
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
}

/**
 * 遊戲邏輯處理器
 */
function handleGameAction(room, action, data) {
  const game = room.game;

  switch (action) {
    case 'START_GAME':
      if (game.playerCount < game.minPlayers) {
        room.broadcast({ type: 'ERROR', data: { message: `需要至少 ${game.minPlayers} 位玩家` } });
        return;
      }
      game.startRound();
      room.broadcast({ type: 'GAME_START', data: { phase: game.phase } });

      // 發送初始手牌
      for (const player of game.players.values()) {
        room.sendTo(player.id, {
          type: 'CARD_DRAWN',
          data: { playerId: player.id, card: player.hand[0] }
        });
      }

      // 當前玩家抽牌
      drawCardForCurrentPlayer(room);
      break;

    case 'PLAY_CARD':
      playCard(room, data);
      break;
  }
}

function drawCardForCurrentPlayer(room) {
  const game = room.game;
  const current = game.getCurrentPlayer();
  if (!current) return;

  current.protected = false;
  const card = game.drawCard();
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

function playCard(room, data) {
  const game = room.game;
  const { playerId, cardIndex, targetId, guessType } = data;

  const player = game.players.get(playerId);
  const current = game.getCurrentPlayer();

  if (!player || !current || current.id !== playerId) {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '不是你的回合' } });
    return;
  }

  if (cardIndex < 0 || cardIndex >= player.hand.length) {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '無效的卡牌' } });
    return;
  }

  const card = player.hand[cardIndex];

  if (game.mustPlayCountess && game.mustPlayCountess(player) && card.type !== 'COUNTESS') {
    room.sendTo(playerId, { type: 'ERROR', data: { message: '你必須打出伯爵夫人！' } });
    return;
  }

  const target = targetId ? game.players.get(targetId) : null;
  const result = game.executeCard(player, card, target, guessType);

  if (!result.success) {
    room.sendTo(playerId, { type: 'ERROR', data: { message: result.message } });
    return;
  }

  // 棄牌
  player.hand.splice(cardIndex, 1);
  player.discardPile.push(card);

  // 廣播結果
  room.broadcast({
    type: 'CARD_PLAYED',
    data: { playerId, cardType: card.type, targetId, result: result.message }
  });

  // 私人訊息（如神父查看）
  if (result.privateInfo) {
    room.sendTo(playerId, {
      type: 'PRIVATE_INFO',
      data: result.privateInfo
    });
  }

  // 如果有新抽的牌（王子效果）
  if (result.newCard && target) {
    room.sendTo(target.id, {
      type: 'CARD_DRAWN',
      data: { playerId: target.id, card: result.newCard }
    });
  }

  // 檢查回合結束
  checkRoundEnd(room);
}

function checkRoundEnd(room) {
  const game = room.game;

  if (game.isRoundOver()) {
    const winner = game.determineRoundWinner();
    if (winner) {
      winner.tokens++;
      room.broadcast({
        type: 'ROUND_END',
        data: { winner: winner.id, winnerName: winner.name, tokens: winner.tokens }
      });
    }

    if (game.isGameOver()) {
      const gameWinner = game.getGameWinner();
      game.phase = 'GAME_OVER';
      room.broadcast({
        type: 'GAME_END',
        data: { winner: gameWinner.id, winnerName: gameWinner.name }
      });
    } else {
      setTimeout(() => {
        game.startRound();
        room.broadcast({ type: 'ROUND_START' });
        for (const player of game.players.values()) {
          room.sendTo(player.id, {
            type: 'CARD_DRAWN',
            data: { playerId: player.id, card: player.hand[0] }
          });
        }
        drawCardForCurrentPlayer(room);
      }, 2000);
    }
  } else {
    game.nextPlayer();
    drawCardForCurrentPlayer(room);
  }
}

// WebSocket 連線處理
wss.on('connection', (ws, req) => {
  // URL 格式: /ws/{gameType}/{roomId}
  // 例如: /ws/love-letter/1234
  const url = req.url || '';
  const match = url.match(/\/ws\/(\w+[-\w]*)\/(\w+)/);
  const gameType = match ? match[1] : 'love-letter';
  const roomId = match ? match[2] : 'default';

  let playerId = null;

  console.log(`[${new Date().toISOString()}] New connection: ${gameType}/${roomId}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[${roomId}] ${msg.type}:`, msg.data || '');

      switch (msg.type) {
        case 'JOIN_ROOM': {
          playerId = msg.data.playerId;
          const playerName = msg.data.playerName;
          const isHost = msg.data.isHost;

          let room = rooms.get(roomId);
          if (!room) {
            room = new GameRoom(roomId, gameType);
            rooms.set(roomId, room);
          }

          if (room.addPlayer(playerId, playerName, ws, isHost)) {
            room.broadcast({
              type: 'PLAYER_JOINED',
              data: {
                playerId,
                playerName,
                playerCount: room.game.playerCount,
                maxPlayers: room.game.maxPlayers
              }
            });
          } else {
            ws.send(JSON.stringify({ type: 'ERROR', data: { message: '房間已滿' } }));
          }
          break;
        }

        case 'START_GAME':
        case 'PLAY_CARD': {
          const room = rooms.get(roomId);
          if (room) {
            handleGameAction(room, msg.type, msg.data || {});
          }
          break;
        }

        case 'LEAVE_ROOM': {
          const room = rooms.get(roomId);
          if (room && playerId) {
            const player = room.game.players.get(playerId);
            room.removePlayer(playerId);
            room.broadcast({
              type: 'PLAYER_LEFT',
              data: { playerId, playerName: player?.name }
            });
            if (room.game.playerCount === 0) {
              rooms.delete(roomId);
            }
          }
          break;
        }

        case 'PING':
          ws.send(JSON.stringify({ type: 'PONG' }));
          break;
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(roomId);
    if (room && playerId) {
      const player = room.game.players.get(playerId);
      room.removePlayer(playerId);
      room.broadcast({
        type: 'PLAYER_LEFT',
        data: { playerId, playerName: player?.name }
      });
      if (room.game.playerCount === 0) {
        rooms.delete(roomId);
      }
    }
    console.log(`[${new Date().toISOString()}] Disconnected: ${gameType}/${roomId}`);
  });
});

// 啟動伺服器
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║      🎮 Game Hub Server v${VERSION}          ║
╠═══════════════════════════════════════════╣
║  Port: ${PORT}                                ║
║  Games: ${Object.keys(games).join(', ').padEnd(31)}║
║  Status: Running                          ║
╚═══════════════════════════════════════════╝
  `);
});

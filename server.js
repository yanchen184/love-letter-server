/**
 * 通用遊戲伺服器 - Game Hub Server
 * 支援多種桌遊的 WebSocket 伺服器
 *
 * 版本: 2.0.0
 * 新增: Memory Battle 翻牌記憶遊戲
 */

const WebSocket = require('ws');
const http = require('http');
const { v4: uuidv4 } = require('uuid');

const VERSION = '2.0.0';
const PORT = process.env.PORT || 8089;

// 載入遊戲模組
const games = {
  'love-letter': require('./games/love-letter'),
  'memory-battle': require('./games/memory-battle')
};

// 房間管理
const rooms = new Map();

// Memory Battle 專用 - 等待配對的房間
const memoryBattleQueue = new Map(); // gridSize -> roomId

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
      maxPlayers: key === 'memory-battle' ? 2 : 4
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
    this.turnTimer = null;

    // 根據遊戲類型建立遊戲實例
    if (gameType === 'memory-battle') {
      const { MemoryBattleGame } = games['memory-battle'];
      this.game = new MemoryBattleGame(roomId);
    } else {
      const GameClass = games[gameType]?.LoveLetterGame || games['love-letter'].LoveLetterGame;
      this.game = new GameClass(roomId);
    }
  }

  addPlayer(playerId, playerName, socket, isHost, avatar) {
    if (!this.game.addPlayer(playerId, playerName)) {
      return false;
    }
    // 設置 avatar（如果支援）
    const player = this.game.players.get(playerId);
    if (player && avatar) {
      player.avatar = avatar;
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
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
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

// ============================================
// Memory Battle 專用處理函數
// ============================================

function handleMemoryBattleAction(room, ws, action, data, playerId) {
  const game = room.game;

  switch (action) {
    case 'FLIP_CARD': {
      const result = game.flipCard(playerId, data.cardIndex);

      if (!result.success) {
        ws.send(JSON.stringify({ type: 'ERROR', message: result.message }));
        return;
      }

      // 廣播翻牌
      room.broadcast({
        type: 'CARD_FLIPPED',
        cardIndex: result.cardIndex,
        card: result.card,
        playerId,
      });

      // 如果翻了兩張，檢查配對
      if (game.flippedIndices.length === 2) {
        setTimeout(() => {
          const matchResult = game.checkMatch();
          if (matchResult) {
            room.broadcast({
              type: 'MATCH_RESULT',
              ...matchResult,
            });

            if (matchResult.isMatch) {
              // 配對成功，重置計時器
              startMemoryBattleTurnTimer(room);

              if (matchResult.isGameOver) {
                endMemoryBattleGame(room);
              }
            } else {
              // 不配對，換回合
              room.broadcast({
                type: 'TURN_CHANGED',
                currentPlayerIndex: game.currentPlayerIndex,
                roomState: game.getPublicState(),
              });
              startMemoryBattleTurnTimer(room);
            }
          }
        }, 800);
      }
      break;
    }

    case 'REMATCH': {
      if (game.phase === 'FINISHED' && game.playerCount === 2) {
        game.startGame();
        room.broadcast({
          type: 'GAME_STARTED',
          roomState: game.getPublicState(),
        });
        startMemoryBattleTurnTimer(room);
      }
      break;
    }
  }
}

function startMemoryBattleTurnTimer(room) {
  const game = room.game;
  const { TURN_TIME_LIMIT } = games['memory-battle'];

  if (room.turnTimer) {
    clearInterval(room.turnTimer);
  }

  game.turnTimeLeft = TURN_TIME_LIMIT;

  room.turnTimer = setInterval(() => {
    game.turnTimeLeft--;

    if (game.turnTimeLeft <= 0) {
      // 時間到 - 換回合
      handleMemoryBattleTimeout(room);
    } else if (game.turnTimeLeft <= 10) {
      // 發送警告
      room.broadcast({
        type: 'TURN_TIME_UPDATE',
        timeLeft: game.turnTimeLeft,
        isWarning: true,
      });
    }
  }, 1000);
}

function handleMemoryBattleTimeout(room) {
  const game = room.game;

  console.log(`[Memory Battle] Time's up in room ${room.roomId}`);

  // 翻回任何已翻的卡片
  game.switchTurn();

  room.broadcast({
    type: 'TURN_TIMEOUT',
    currentPlayerIndex: game.currentPlayerIndex,
    roomState: game.getPublicState(),
  });

  startMemoryBattleTurnTimer(room);
}

function endMemoryBattleGame(room) {
  const game = room.game;

  if (room.turnTimer) {
    clearInterval(room.turnTimer);
    room.turnTimer = null;
  }

  const winnerData = game.getWinner();
  const playerArray = Array.from(game.players.values());

  room.broadcast({
    type: 'GAME_ENDED',
    winnerId: winnerData?.winner?.id || null,
    isDraw: winnerData?.isDraw || false,
    finalScores: {
      [playerArray[0]?.id]: playerArray[0]?.score || 0,
      [playerArray[1]?.id]: playerArray[1]?.score || 0,
    },
    roomState: game.getPublicState(),
  });
}

function findOrCreateMemoryBattleRoom(gridSize) {
  // 檢查是否有等待中的房間
  const waitingRoomId = memoryBattleQueue.get(gridSize);
  if (waitingRoomId) {
    const room = rooms.get(waitingRoomId);
    if (room && room.game.playerCount === 1 && room.game.phase === 'WAITING') {
      memoryBattleQueue.delete(gridSize);
      return room;
    }
    // 房間無效，移除
    memoryBattleQueue.delete(gridSize);
  }

  // 建立新房間
  const roomId = uuidv4().slice(0, 8).toUpperCase();
  const room = new GameRoom(roomId, 'memory-battle');
  room.game.setGridSize(gridSize);
  rooms.set(roomId, room);
  memoryBattleQueue.set(gridSize, roomId);

  console.log(`[Memory Battle] Created room ${roomId} with grid ${gridSize}`);
  return room;
}

// ============================================
// Love Letter 原有處理函數
// ============================================

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

// ============================================
// WebSocket 連線處理
// ============================================

wss.on('connection', (ws, req) => {
  // URL 格式: /ws/{gameType}/{roomId}
  // 或 Memory Battle 配對: /ws/memory-battle/auto
  const url = req.url || '';
  const match = url.match(/\/ws\/(\w+[-\w]*)\/(\w+)/);
  let gameType = match ? match[1] : 'love-letter';
  let roomId = match ? match[2] : 'default';

  let playerId = null;
  let currentRoom = null;

  console.log(`[${new Date().toISOString()}] New connection: ${gameType}/${roomId}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(`[${roomId}] ${msg.type}:`, msg.data || msg.payload || '');

      // Memory Battle 專用訊息
      if (gameType === 'memory-battle') {
        switch (msg.type) {
          case 'JOIN_GAME': {
            const { playerName, avatar, gridSize } = msg.payload || msg.data || {};
            playerId = uuidv4();

            // 自動配對
            const room = findOrCreateMemoryBattleRoom(gridSize || '4x4');
            currentRoom = room;
            roomId = room.roomId;

            if (room.addPlayer(playerId, playerName || 'Player', ws, false, avatar)) {
              const playerIndex = room.game.playerCount - 1;

              ws.send(JSON.stringify({
                type: 'JOINED_ROOM',
                playerId,
                roomId: room.roomId,
                playerIndex,
                roomState: room.game.getPublicState(),
              }));

              room.broadcast({
                type: 'PLAYER_JOINED',
                player: {
                  id: playerId,
                  name: playerName || 'Player',
                  avatar: avatar || '👤',
                  score: 0,
                  isReady: false,
                },
                roomState: room.game.getPublicState(),
              });

              // 如果 2 人到齊，自動開始
              if (room.game.playerCount === 2) {
                setTimeout(() => {
                  if (room.game.startGame()) {
                    room.broadcast({
                      type: 'GAME_STARTED',
                      roomState: room.game.getPublicState(),
                    });
                    startMemoryBattleTurnTimer(room);
                  }
                }, 2000);
              }
            } else {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Failed to join room' }));
            }
            break;
          }

          case 'FLIP_CARD':
          case 'REMATCH': {
            if (currentRoom && playerId) {
              handleMemoryBattleAction(currentRoom, ws, msg.type, msg.payload || msg.data || {}, playerId);
            }
            break;
          }

          case 'LEAVE_ROOM': {
            if (currentRoom && playerId) {
              const player = currentRoom.game.players.get(playerId);
              currentRoom.removePlayer(playerId);
              currentRoom.broadcast({
                type: 'PLAYER_LEFT',
                playerId,
                roomState: currentRoom.game.getPublicState(),
              });
              if (currentRoom.game.playerCount === 0) {
                rooms.delete(currentRoom.roomId);
                memoryBattleQueue.delete(currentRoom.game.gridSize);
              }
            }
            ws.send(JSON.stringify({ type: 'LEFT_ROOM' }));
            break;
          }

          case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;
        }
        return;
      }

      // Love Letter 原有訊息處理
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
          currentRoom = room;

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
    if (currentRoom && playerId) {
      const player = currentRoom.game.players.get(playerId);
      currentRoom.removePlayer(playerId);
      currentRoom.broadcast({
        type: 'PLAYER_LEFT',
        playerId,
        playerName: player?.name,
        roomState: currentRoom.game?.getPublicState?.() || null,
      });
      if (currentRoom.game.playerCount === 0) {
        rooms.delete(currentRoom.roomId);
        if (gameType === 'memory-battle') {
          memoryBattleQueue.delete(currentRoom.game.gridSize);
        }
      }
    }
    console.log(`[${new Date().toISOString()}] Disconnected: ${gameType}/${roomId}`);
  });

  // 發送連接成功訊息
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    version: VERSION,
  }));
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

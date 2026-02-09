/**
 * Memory Battle 遊戲模組
 * 翻牌記憶對戰遊戲
 *
 * 版本: 1.0.0
 */

// 卡片符號
const CARD_SYMBOLS = [
  { id: 0, symbol: '🦊', name: 'Fox' },
  { id: 1, symbol: '🐺', name: 'Wolf' },
  { id: 2, symbol: '🦁', name: 'Lion' },
  { id: 3, symbol: '🐯', name: 'Tiger' },
  { id: 4, symbol: '🦋', name: 'Butterfly' },
  { id: 5, symbol: '🌸', name: 'Cherry Blossom' },
  { id: 6, symbol: '🌙', name: 'Moon' },
  { id: 7, symbol: '⭐', name: 'Star' },
  { id: 8, symbol: '🔮', name: 'Crystal Ball' },
  { id: 9, symbol: '🗡️', name: 'Sword' },
  { id: 10, symbol: '🛡️', name: 'Shield' },
  { id: 11, symbol: '🏰', name: 'Castle' },
  { id: 12, symbol: '🐉', name: 'Dragon' },
  { id: 13, symbol: '🧙', name: 'Wizard' },
  { id: 14, symbol: '👑', name: 'Crown' },
  { id: 15, symbol: '💎', name: 'Gem' },
  { id: 16, symbol: '🔥', name: 'Fire' },
  { id: 17, symbol: '💧', name: 'Water' },
];

// 棋盤配置
const GRID_CONFIGS = {
  '4x4': { rows: 4, cols: 4, totalCards: 16, totalPairs: 8 },
  '4x6': { rows: 4, cols: 6, totalCards: 24, totalPairs: 12 },
  '6x6': { rows: 6, cols: 6, totalCards: 36, totalPairs: 18 },
};

// 回合時間限制（秒）
const TURN_TIME_LIMIT = 30;

/**
 * 洗牌函數
 */
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * 生成遊戲卡片
 */
function generateCards(gridSize) {
  const config = GRID_CONFIGS[gridSize] || GRID_CONFIGS['4x4'];
  const numPairs = config.totalPairs;
  const selectedSymbols = shuffleArray(CARD_SYMBOLS).slice(0, numPairs);

  const cards = [];
  selectedSymbols.forEach((symbol, index) => {
    cards.push({
      id: index * 2,
      symbolId: symbol.id,
      symbol: symbol.symbol,
      isFlipped: false,
      isMatched: false,
      matchedBy: null, // 追蹤配對者（玩家索引 0/1）
    });
    cards.push({
      id: index * 2 + 1,
      symbolId: symbol.id,
      symbol: symbol.symbol,
      isFlipped: false,
      isMatched: false,
      matchedBy: null, // 追蹤配對者（玩家索引 0/1）
    });
  });

  return shuffleArray(cards);
}

/**
 * Memory Battle 遊戲類別
 */
class MemoryBattleGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.gameName = 'Memory Battle';
    this.minPlayers = 2;
    this.maxPlayers = 2;
    this.phase = 'WAITING'; // WAITING, PLAYING, FINISHED
    this.gridSize = '4x4';
    this.cards = [];
    this.players = new Map();
    this.currentPlayerIndex = 0;
    this.flippedIndices = [];
    this.matchedPairs = 0;
    this.totalPairs = 8;
    this.turnTimeLeft = TURN_TIME_LIMIT;
    this.turnTimer = null;
  }

  get playerCount() {
    return this.players.size;
  }

  addPlayer(playerId, playerName) {
    if (this.players.size >= this.maxPlayers) {
      return false;
    }

    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      avatar: this.players.size === 0 ? '👤' : '👥',
      score: 0,
      isReady: false,
    });

    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
    if (this.turnTimer) {
      clearInterval(this.turnTimer);
      this.turnTimer = null;
    }
    if (this.phase === 'PLAYING') {
      this.phase = 'WAITING';
    }
  }

  setGridSize(gridSize) {
    if (GRID_CONFIGS[gridSize]) {
      this.gridSize = gridSize;
      this.totalPairs = GRID_CONFIGS[gridSize].totalPairs;
    }
  }

  startGame() {
    if (this.players.size !== 2) {
      return false;
    }

    this.phase = 'PLAYING';
    this.currentPlayerIndex = 0;
    this.flippedIndices = [];
    this.matchedPairs = 0;
    this.turnTimeLeft = TURN_TIME_LIMIT;

    // 重置分數
    for (const player of this.players.values()) {
      player.score = 0;
    }

    // 生成卡片
    this.cards = generateCards(this.gridSize);
    this.totalPairs = GRID_CONFIGS[this.gridSize].totalPairs;

    return true;
  }

  getCurrentPlayer() {
    const playerArray = Array.from(this.players.values());
    return playerArray[this.currentPlayerIndex];
  }

  flipCard(playerId, cardIndex) {
    // 驗證是否為當前玩家
    const currentPlayer = this.getCurrentPlayer();
    if (!currentPlayer || currentPlayer.id !== playerId) {
      return { success: false, message: 'Not your turn' };
    }

    // 驗證卡片索引
    if (cardIndex < 0 || cardIndex >= this.cards.length) {
      return { success: false, message: 'Invalid card index' };
    }

    const card = this.cards[cardIndex];

    // 不能翻已翻或已配對的卡
    if (card.isFlipped || card.isMatched) {
      return { success: false, message: 'Card already flipped or matched' };
    }

    // 不能翻超過 2 張
    if (this.flippedIndices.length >= 2) {
      return { success: false, message: 'Two cards already flipped' };
    }

    // 翻牌
    card.isFlipped = true;
    this.flippedIndices.push(cardIndex);

    return {
      success: true,
      cardIndex,
      card: {
        id: card.id,
        symbol: card.symbol,
        symbolId: card.symbolId,
        isFlipped: true,
        isMatched: false,
      },
    };
  }

  checkMatch() {
    if (this.flippedIndices.length !== 2) {
      return null;
    }

    const [idx1, idx2] = this.flippedIndices;
    const card1 = this.cards[idx1];
    const card2 = this.cards[idx2];

    const isMatch = card1.symbolId === card2.symbolId;

    if (isMatch) {
      card1.isMatched = true;
      card2.isMatched = true;
      card1.matchedBy = this.currentPlayerIndex; // 記錄配對者
      card2.matchedBy = this.currentPlayerIndex; // 記錄配對者
      this.matchedPairs++;

      const currentPlayer = this.getCurrentPlayer();
      if (currentPlayer) {
        currentPlayer.score++;
      }

      this.flippedIndices = [];

      // 檢查遊戲是否結束
      if (this.matchedPairs === this.totalPairs) {
        this.phase = 'FINISHED';
      }

      return {
        isMatch: true,
        cardIndices: [idx1, idx2],
        playerId: currentPlayer?.id,
        playerScore: currentPlayer?.score,
        matchedPairs: this.matchedPairs,
        totalPairs: this.totalPairs,
        isGameOver: this.phase === 'FINISHED',
      };
    } else {
      // 不配對 - 翻回去
      card1.isFlipped = false;
      card2.isFlipped = false;

      this.flippedIndices = [];

      // 換回合
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;

      return {
        isMatch: false,
        cardIndices: [idx1, idx2],
      };
    }
  }

  getWinner() {
    if (this.phase !== 'FINISHED') return null;

    const playerArray = Array.from(this.players.values());
    const [p1, p2] = playerArray;

    if (!p1 || !p2) return null;

    if (p1.score > p2.score) {
      return { winner: p1, isDraw: false };
    } else if (p2.score > p1.score) {
      return { winner: p2, isDraw: false };
    } else {
      return { winner: null, isDraw: true };
    }
  }

  switchTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % 2;
    this.flippedIndices.forEach(idx => {
      this.cards[idx].isFlipped = false;
    });
    this.flippedIndices = [];
    this.turnTimeLeft = TURN_TIME_LIMIT;
  }

  getPublicState() {
    const playerArray = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      isReady: p.isReady,
    }));

    return {
      roomId: this.roomId,
      gridSize: this.gridSize,
      players: playerArray,
      cards: this.cards.map(c => ({
        id: c.id,
        isFlipped: c.isFlipped,
        isMatched: c.isMatched,
        matchedBy: c.matchedBy, // 傳送配對者資訊
        // ✅ FIX: 總是發送 symbol 和 symbolId（前端需要顯示卡片背面）
        symbol: c.symbol,
        symbolId: c.symbolId,
      })),
      currentPlayerIndex: this.currentPlayerIndex,
      matchedPairs: this.matchedPairs,
      totalPairs: this.totalPairs,
      phase: this.phase,
      turnTimeLeft: this.turnTimeLeft,
    };
  }
}

module.exports = {
  MemoryBattleGame,
  GRID_CONFIGS,
  TURN_TIME_LIMIT,
};

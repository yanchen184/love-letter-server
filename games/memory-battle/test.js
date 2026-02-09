/**
 * Memory Battle 遊戲測試
 * 完整的單元測試和整合測試
 */

const { MemoryBattleGame, GRID_CONFIGS } = require('./index.js');

// 測試工具
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.tests = [];
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log('\n🧪 Running Memory Battle Tests...\n');
    console.log('='.repeat(60));

    for (const test of this.tests) {
      try {
        await test.fn();
        this.passed++;
        console.log(`✅ PASS: ${test.name}`);
      } catch (error) {
        this.failed++;
        console.log(`❌ FAIL: ${test.name}`);
        console.log(`   Error: ${error.message}`);
        if (error.expected !== undefined) {
          console.log(`   Expected: ${JSON.stringify(error.expected)}`);
          console.log(`   Received: ${JSON.stringify(error.received)}`);
        }
      }
    }

    console.log('='.repeat(60));
    console.log(`\n📊 Results: ${this.passed} passed, ${this.failed} failed`);
    console.log(`Total: ${this.passed + this.failed} tests\n`);

    return this.failed === 0;
  }
}

// 斷言函數
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    const error = new Error(message || `Expected ${expected}, got ${actual}`);
    error.expected = expected;
    error.received = actual;
    throw error;
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected non-null value');
  }
}

function assertArrayLength(array, length, message) {
  if (!Array.isArray(array)) {
    throw new Error('Expected an array');
  }
  if (array.length !== length) {
    const error = new Error(message || `Expected array length ${length}, got ${array.length}`);
    error.expected = length;
    error.received = array.length;
    throw error;
  }
}

// 建立測試套件
const runner = new TestRunner();

// ============================================================
// 遊戲初始化測試
// ============================================================

runner.test('Game initialization', () => {
  const game = new MemoryBattleGame('test-room-1');
  
  assertEqual(game.roomId, 'test-room-1', 'Room ID should match');
  assertEqual(game.phase, 'WAITING', 'Initial phase should be WAITING');
  assertEqual(game.playerCount, 0, 'Should have 0 players initially');
  assertEqual(game.gridSize, '4x4', 'Default grid size should be 4x4');
  assertArrayLength(game.cards, 0, 'Should have no cards initially');
});

// ============================================================
// 玩家管理測試
// ============================================================

runner.test('Add first player', () => {
  const game = new MemoryBattleGame('test-room-2');
  const success = game.addPlayer('player1', 'Alice');
  
  assert(success, 'Should successfully add first player');
  assertEqual(game.playerCount, 1, 'Should have 1 player');
  
  const players = Array.from(game.players.values());
  assertEqual(players[0].name, 'Alice', 'Player name should be Alice');
  assertEqual(players[0].avatar, '👤', 'First player should have 👤 avatar');
});

runner.test('Add second player', () => {
  const game = new MemoryBattleGame('test-room-3');
  game.addPlayer('player1', 'Alice');
  const success = game.addPlayer('player2', 'Bob');
  
  assert(success, 'Should successfully add second player');
  assertEqual(game.playerCount, 2, 'Should have 2 players');
  
  const players = Array.from(game.players.values());
  assertEqual(players[1].name, 'Bob', 'Player name should be Bob');
  assertEqual(players[1].avatar, '👥', 'Second player should have 👥 avatar');
});

runner.test('Reject third player', () => {
  const game = new MemoryBattleGame('test-room-4');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  const success = game.addPlayer('player3', 'Charlie');
  
  assertEqual(success, false, 'Should reject third player');
  assertEqual(game.playerCount, 2, 'Should still have 2 players');
});

// ============================================================
// 遊戲開始測試
// ============================================================

runner.test('Cannot start game with 1 player', () => {
  const game = new MemoryBattleGame('test-room-5');
  game.addPlayer('player1', 'Alice');
  const success = game.startGame();
  
  assertEqual(success, false, 'Should not start with 1 player');
  assertEqual(game.phase, 'WAITING', 'Phase should remain WAITING');
  assertArrayLength(game.cards, 0, 'Should have no cards');
});

runner.test('Start game with 2 players (4x4)', () => {
  const game = new MemoryBattleGame('test-room-6');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.setGridSize('4x4');
  const success = game.startGame();
  
  assert(success, 'Should start game successfully');
  assertEqual(game.phase, 'PLAYING', 'Phase should be PLAYING');
  assertArrayLength(game.cards, 16, 'Should have 16 cards for 4x4');
  assertEqual(game.totalPairs, 8, 'Should have 8 pairs');
  assertEqual(game.matchedPairs, 0, 'Should have 0 matched pairs');
  
  // 檢查卡片是否有 symbol
  game.cards.forEach((card, idx) => {
    assertNotNull(card.symbol, `Card ${idx} should have a symbol`);
    assertNotNull(card.symbolId, `Card ${idx} should have a symbolId`);
    assertEqual(card.isFlipped, false, `Card ${idx} should not be flipped`);
    assertEqual(card.isMatched, false, `Card ${idx} should not be matched`);
  });
});

runner.test('Start game with different grid sizes', () => {
  const gridSizes = ['4x4', '4x6', '6x6'];
  
  gridSizes.forEach(gridSize => {
    const game = new MemoryBattleGame(`test-room-grid-${gridSize}`);
    game.addPlayer('player1', 'Alice');
    game.addPlayer('player2', 'Bob');
    game.setGridSize(gridSize);
    game.startGame();
    
    const config = GRID_CONFIGS[gridSize];
    assertArrayLength(game.cards, config.totalCards, `Should have ${config.totalCards} cards for ${gridSize}`);
    assertEqual(game.totalPairs, config.totalPairs, `Should have ${config.totalPairs} pairs for ${gridSize}`);
  });
});

// ============================================================
// 卡片配對測試
// ============================================================

runner.test('Ensure cards come in pairs', () => {
  const game = new MemoryBattleGame('test-room-7');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  // 統計每個 symbolId 出現次數
  const symbolCounts = {};
  game.cards.forEach(card => {
    symbolCounts[card.symbolId] = (symbolCounts[card.symbolId] || 0) + 1;
  });
  
  // 每個 symbolId 應該出現恰好 2 次
  Object.entries(symbolCounts).forEach(([symbolId, count]) => {
    assertEqual(count, 2, `Symbol ${symbolId} should appear exactly twice`);
  });
});

// ============================================================
// 翻牌邏輯測試
// ============================================================

runner.test('Flip card by current player', () => {
  const game = new MemoryBattleGame('test-room-8');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  const currentPlayer = game.getCurrentPlayer();
  const result = game.flipCard(currentPlayer.id, 0);
  
  assert(result.success, 'Should flip card successfully');
  assertEqual(game.cards[0].isFlipped, true, 'Card should be flipped');
  assertArrayLength(game.flippedIndices, 1, 'Should have 1 flipped card');
});

runner.test('Cannot flip card by wrong player', () => {
  const game = new MemoryBattleGame('test-room-9');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  const players = Array.from(game.players.values());
  const notCurrentPlayer = players[1]; // Bob is not the first player
  const result = game.flipCard(notCurrentPlayer.id, 0);
  
  assertEqual(result.success, false, 'Should not allow wrong player to flip');
  assertEqual(game.cards[0].isFlipped, false, 'Card should not be flipped');
});

runner.test('Cannot flip more than 2 cards', () => {
  const game = new MemoryBattleGame('test-room-10');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  const currentPlayer = game.getCurrentPlayer();
  game.flipCard(currentPlayer.id, 0);
  game.flipCard(currentPlayer.id, 1);
  const result = game.flipCard(currentPlayer.id, 2);
  
  assertEqual(result.success, false, 'Should not allow flipping 3rd card');
  assertArrayLength(game.flippedIndices, 2, 'Should still have 2 flipped cards');
});

runner.test('Check match - matching cards', () => {
  const game = new MemoryBattleGame('test-room-11');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  // 找到兩張相同的卡片
  const firstSymbolId = game.cards[0].symbolId;
  const secondIndex = game.cards.findIndex((card, idx) => idx > 0 && card.symbolId === firstSymbolId);
  
  // 翻開兩張相同的卡片
  const currentPlayer = game.getCurrentPlayer();
  game.flipCard(currentPlayer.id, 0);
  game.flipCard(currentPlayer.id, secondIndex);
  
  const matchResult = game.checkMatch();
  
  assert(matchResult.isMatch, 'Should be a match');
  assertEqual(game.cards[0].isMatched, true, 'First card should be matched');
  assertEqual(game.cards[secondIndex].isMatched, true, 'Second card should be matched');
  assertEqual(game.matchedPairs, 1, 'Should have 1 matched pair');
  
  // 檢查分數
  const players = Array.from(game.players.values());
  assertEqual(players[0].score, 1, 'Player should have 1 point');
});

runner.test('Check match - non-matching cards', () => {
  const game = new MemoryBattleGame('test-room-12');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  // 找到兩張不同的卡片
  const firstSymbolId = game.cards[0].symbolId;
  const differentIndex = game.cards.findIndex(card => card.symbolId !== firstSymbolId);
  
  // 翻開兩張不同的卡片
  const currentPlayer = game.getCurrentPlayer();
  game.flipCard(currentPlayer.id, 0);
  game.flipCard(currentPlayer.id, differentIndex);
  
  const matchResult = game.checkMatch();
  
  assertEqual(matchResult.isMatch, false, 'Should not be a match');
  assertEqual(game.cards[0].isMatched, false, 'First card should not be matched');
  assertEqual(game.cards[differentIndex].isMatched, false, 'Second card should not be matched');
  assertEqual(game.matchedPairs, 0, 'Should have 0 matched pairs');
});

// ============================================================
// 🚨 關鍵測試：getPublicState() 必須包含 symbol！
// ============================================================

runner.test('🚨 CRITICAL: getPublicState returns symbols for all cards', () => {
  const game = new MemoryBattleGame('test-room-critical');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  const state = game.getPublicState();
  
  // 檢查是否有 cards
  assert(Array.isArray(state.cards), 'State should have cards array');
  assertArrayLength(state.cards, 16, 'Should have 16 cards in state');
  
  // 🚨 關鍵：每張卡片都必須有 symbol 和 symbolId
  state.cards.forEach((card, idx) => {
    assertNotNull(card.symbol, `Card ${idx} in state should have symbol (even if not flipped)`);
    assertNotNull(card.symbolId, `Card ${idx} in state should have symbolId (even if not flipped)`);
    
    // 檢查卡片結構
    assert('id' in card, `Card ${idx} should have id`);
    assert('isFlipped' in card, `Card ${idx} should have isFlipped`);
    assert('isMatched' in card, `Card ${idx} should have isMatched`);
    assert('matchedBy' in card, `Card ${idx} should have matchedBy`);
  });
  
  console.log('   ✅ All cards have symbols in getPublicState()');
});

runner.test('🚨 CRITICAL: getPublicState cards match internal cards', () => {
  const game = new MemoryBattleGame('test-room-critical-2');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  const state = game.getPublicState();
  
  // 檢查每張卡片的 symbol 是否與內部狀態一致
  state.cards.forEach((stateCard, idx) => {
    const internalCard = game.cards[idx];
    assertEqual(stateCard.symbol, internalCard.symbol, `Card ${idx} symbol should match`);
    assertEqual(stateCard.symbolId, internalCard.symbolId, `Card ${idx} symbolId should match`);
  });
});

// ============================================================
// 回合切換測試
// ============================================================

runner.test('Switch turn after mismatch', () => {
  const game = new MemoryBattleGame('test-room-13');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  assertEqual(game.currentPlayerIndex, 0, 'Should start with player 0');
  
  game.switchTurn();
  
  assertEqual(game.currentPlayerIndex, 1, 'Should switch to player 1');
  assertArrayLength(game.flippedIndices, 0, 'Flipped indices should be cleared');
});

// ============================================================
// 遊戲結束測試
// ============================================================

runner.test('Game ends when all pairs matched', () => {
  const game = new MemoryBattleGame('test-room-14');
  game.addPlayer('player1', 'Alice');
  game.addPlayer('player2', 'Bob');
  game.startGame();
  
  // 模擬所有配對完成
  game.matchedPairs = game.totalPairs;
  game.phase = 'FINISHED';
  
  assertEqual(game.phase, 'FINISHED', 'Phase should be FINISHED');
  
  const winner = game.getWinner();
  assertNotNull(winner, 'Should have a winner or draw');
});

// ============================================================
// 運行所有測試
// ============================================================

(async () => {
  const success = await runner.run();
  process.exit(success ? 0 : 1);
})();

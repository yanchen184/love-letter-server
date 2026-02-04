/**
 * 情書 Love Letter 遊戲模組
 */

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

class LoveLetterGame {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = new Map();
    this.deck = [];
    this.removedCards = [];
    this.currentPlayerIndex = 0;
    this.phase = 'WAITING';
  }

  get playerCount() { return this.players.size; }
  get minPlayers() { return 2; }
  get maxPlayers() { return 4; }
  get gameName() { return 'love-letter'; }

  get tokensToWin() {
    switch (this.playerCount) {
      case 2: return 7;
      case 3: return 5;
      default: return 4;
    }
  }

  addPlayer(playerId, playerName) {
    if (this.playerCount >= this.maxPlayers) return false;
    this.players.set(playerId, {
      id: playerId,
      name: playerName,
      hand: [],
      discardPile: [],
      eliminated: false,
      protected: false,
      tokens: 0
    });
    return true;
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
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

  // 遊戲邏輯
  startRound() {
    for (const player of this.players.values()) {
      player.hand = [];
      player.discardPile = [];
      player.eliminated = false;
      player.protected = false;
    }

    this.initDeck();
    this.removedCards = [];
    this.removedCards.push(this.drawCard());

    if (this.playerCount === 2) {
      for (let i = 0; i < 3; i++) {
        this.removedCards.push(this.drawCard());
      }
    }

    for (const player of this.players.values()) {
      player.hand.push(this.drawCard());
    }

    this.currentPlayerIndex = 0;
    this.phase = 'PLAYING';
  }

  mustPlayCountess(player) {
    const hasCountess = player.hand.some(c => c.type === 'COUNTESS');
    const hasKingOrPrince = player.hand.some(c => c.type === 'KING' || c.type === 'PRINCE');
    return hasCountess && hasKingOrPrince;
  }

  executeCard(player, card, target, guessType) {
    switch (card.type) {
      case 'GUARD':
        if (!guessType || guessType === 'GUARD') return { success: false, message: '無效猜測' };
        if (!target || target.protected) return { success: false, message: '無效目標' };
        if (target.hand.some(c => c.type === guessType)) {
          target.eliminated = true;
          target.discardPile.push(...target.hand);
          target.hand = [];
          return { success: true, message: `猜對了！${target.name} 出局` };
        }
        return { success: true, message: '猜錯了' };

      case 'PRIEST':
        if (!target || target.protected) return { success: false, message: '無效目標' };
        return {
          success: true,
          message: `查看了 ${target.name} 的手牌`,
          privateInfo: { targetCard: target.hand[0] }
        };

      case 'BARON':
        if (!target || target.protected) return { success: false, message: '無效目標' };
        const playerCard = player.hand.find(c => c.type !== 'BARON');
        const playerValue = playerCard ? playerCard.value : 0;
        const targetValue = target.hand[0]?.value || 0;

        if (playerValue > targetValue) {
          target.eliminated = true;
          target.discardPile.push(...target.hand);
          target.hand = [];
          return { success: true, message: `${target.name} 出局 (${targetValue} vs ${playerValue})` };
        } else if (targetValue > playerValue) {
          player.eliminated = true;
          player.discardPile.push(...player.hand);
          player.hand = [];
          return { success: true, message: `${player.name} 出局 (${playerValue} vs ${targetValue})` };
        }
        return { success: true, message: '平手！' };

      case 'HANDMAID':
        player.protected = true;
        return { success: true, message: `${player.name} 獲得保護` };

      case 'PRINCE':
        const princeTarget = target || player;
        if (princeTarget !== player && princeTarget.protected) {
          return { success: false, message: '目標受保護' };
        }
        if (princeTarget.hand.some(c => c.type === 'PRINCESS')) {
          princeTarget.eliminated = true;
          princeTarget.discardPile.push(...princeTarget.hand);
          princeTarget.hand = [];
          return { success: true, message: `${princeTarget.name} 棄掉公主，出局！` };
        }
        if (princeTarget.hand.length > 0) {
          princeTarget.discardPile.push(...princeTarget.hand);
          princeTarget.hand = [];
          const newCard = this.drawCard();
          if (newCard) princeTarget.hand.push(newCard);
          return { success: true, message: `${princeTarget.name} 棄牌重抽`, newCard };
        }
        return { success: true, message: '無效果' };

      case 'KING':
        if (!target || target.protected) return { success: false, message: '無效目標' };
        const pCards = player.hand.filter(c => c.type !== 'KING');
        const tCards = [...target.hand];
        player.hand = player.hand.filter(c => c.type === 'KING');
        player.hand.push(...tCards);
        target.hand = pCards;
        return { success: true, message: `${player.name} 和 ${target.name} 交換了手牌` };

      case 'COUNTESS':
        return { success: true, message: '打出伯爵夫人' };

      case 'PRINCESS':
        player.eliminated = true;
        player.discardPile.push(...player.hand);
        player.hand = [];
        return { success: true, message: `${player.name} 打出公主，出局！` };

      default:
        return { success: false, message: '未知卡牌' };
    }
  }
}

module.exports = { LoveLetterGame, CARD_TYPES };

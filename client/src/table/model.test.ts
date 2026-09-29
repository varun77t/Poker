import { describe, expect, it } from 'vitest';
import { game, player, seat, snapshot } from './fixtures';
import type { FinalResult } from '@poker/shared';
import { buildStandings, buildTableModel, chipColors, formatNet, potTotal, sizingPresets, slotOf, summarizeGame, summarizeResult, waitingHint, type SeatModel } from './model';

const seated = (m: ReturnType<typeof buildTableModel>) => m.seats.filter((s): s is SeatModel => !('empty' in s));

describe('seat placement', () => {
  it('puts the viewer at the bottom and the others clockwise', () => {
    expect([3, 4, 0, 1, 2].map((s) => slotOf(s, 3))).toEqual([0, 1, 2, 3, 4]);
    expect([0, 1, 2, 3, 4].map((s) => slotOf(s, 0))).toEqual([0, 1, 2, 3, 4]);
  });

  it('rotates the whole table around whoever is looking', () => {
    const m = buildTableModel(snapshot(game(), [0, 1, 2], 'cleo'));
    expect(m.viewerSeat).toBe(2);
    expect(m.seats.map((s) => s.slot)).toEqual([3, 4, 0, 1, 2]);
    expect(seated(m).find((s) => s.isYou)?.seat).toBe(2);
    expect(m.seats.filter((s) => 'empty' in s).map((s) => s.seat)).toEqual([3, 4]);
  });
});

describe('seat tags', () => {
  it('marks the blinds before anyone acts, then shows what each player did', () => {
    const g = game({ toActSeat: 0, players: [player(0), player(1, { committed: 5 }), player(2, { committed: 10 })] });
    const m = seated(buildTableModel(snapshot(g, [0, 1, 2])));
    expect(m.map((s) => s.tag)).toEqual([null, { kind: 'blind', text: 'SB' }, { kind: 'blind', text: 'BB' }]);
    expect(m.map((s) => s.isTurn)).toEqual([true, false, false]);

    const later = game({
      players: [
        player(0, { lastAction: { type: 'raise', amount: 40, allIn: false } }),
        player(1, { status: 'folded', lastAction: { type: 'fold', allIn: false } }),
        player(2, { status: 'allIn', stack: 0, lastAction: { type: 'call', amount: 40, allIn: true } }),
      ],
    });
    const tags = seated(buildTableModel(snapshot(later, [0, 1, 2]))).map((s) => s.tag);
    expect(tags).toEqual([{ kind: 'action', text: 'Raise' }, { kind: 'action', text: 'Fold' }, { kind: 'allIn' }]);
  });

  it('keeps a fold labelled all hand, and clears last-street actions once the result is up', () => {
    const flop = game({ street: 'flop', players: [player(0), player(1, { status: 'folded' }), player(2, { lastAction: { type: 'bet', amount: 20, allIn: false } })] });
    expect(seated(buildTableModel(snapshot(flop, [0, 1, 2]))).map((s) => s.tag)).toEqual([null, { kind: 'action', text: 'Fold' }, { kind: 'action', text: 'Bet' }]);

    const over = game({
      players: [player(0, { lastAction: { type: 'call', amount: 20, allIn: false } }), player(1, { status: 'folded' }), player(2, { status: 'allIn', stack: 0 })],
      result: { wonByFold: false, pots: [], shown: [] },
    });
    expect(seated(buildTableModel(snapshot(over, [0, 1, 2]))).map((s) => s.tag)).toEqual([null, { kind: 'action', text: 'Fold' }, { kind: 'allIn' }]);
  });

  it('shows who is away, who left, who waits for the next hand and who is out of chips', () => {
    const g = game({ players: [player(0), player(1)] });
    const m = seated(
      buildTableModel(
        snapshot(g, [0, seat(1, { connected: false }), seat(2, { leaving: true }), seat(3, { waitingForNextHand: true }), seat(4, { busted: true, stack: 0 })]),
      ),
    );
    expect(m.map((s) => s.tag?.kind)).toEqual([undefined, 'away', 'left', 'nextHand', 'busted']);
    expect(m.map((s) => s.player !== null)).toEqual([true, true, false, false, false]);
    expect(m.map((s) => s.sittingOut)).toEqual([false, false, true, true, true]);
  });
});

describe('pot and bet sizing', () => {
  // Pot 100 from earlier streets; I have 10 in, the others bet 40. I need 30 to call.
  const g = game({ pots: [{ amount: 100, eligibleSeats: [0, 1, 2] }], players: [player(0, { committed: 10 }), player(1, { committed: 40 }), player(2, { committed: 40 })] });
  const legal = { canFold: true, canCheck: false, canCall: true, callAmount: 30, canBet: false, canRaise: true, minTo: 70, maxTo: 1000 };

  it('counts every chip in the middle', () => {
    expect(potTotal(g)).toBe(190);
  });

  it('sizes half-pot and pot raises as "raise to" totals, within the legal range', () => {
    // Call 30 first (pot becomes 220), then raise by half of it (110) or all of it (220), on top of 40.
    expect(sizingPresets(g, legal, 10)).toEqual({ min: 70, half: 150, pot: 260, max: 1000 });
    expect(sizingPresets(g, { ...legal, maxTo: 200 }, 10)).toEqual({ min: 70, half: 150, pot: 200, max: 200 });
    expect(sizingPresets(g, { ...legal, minTo: 180 }, 10).half).toBe(180);
  });

  it('picks bigger chips for bigger stacks', () => {
    expect(chipColors(5)).toEqual(['red']);
    expect(chipColors(2500).length).toBeGreaterThan(chipColors(60).length);
  });
});

describe('result text', () => {
  const names = (id: string) => (id === 'ana' ? 'You' : id.replace(/^./, (c) => c.toUpperCase()));
  const shown = (seatIndex: number, label: string, best5: string[]) => ({
    seat: seatIndex,
    playerId: ['ana', 'ben', 'cleo'][seatIndex] as string,
    holeCards: ['2c', '3c'] as ['2c', '3c'],
    best5: best5 as ['As'],
    category: 'pair' as const,
    label,
  });

  it('reads a hand won by folds without showing anything', () => {
    const g = game({ result: { wonByFold: true, pots: [{ amount: 45, eligibleSeats: [1], winners: [{ seat: 1, playerId: 'ben', amount: 45 }] }], shown: [] } });
    expect(summarizeResult(g, names)).toEqual({ title: 'Ben wins 45', subtitle: 'Everyone else folded', highlight: new Set() });
  });

  it('names the winner, the hand and the five cards that won', () => {
    const g = game({
      result: {
        wonByFold: false,
        pots: [{ amount: 1280, eligibleSeats: [0, 1], winners: [{ seat: 0, playerId: 'ana', amount: 1280 }] }],
        shown: [shown(0, 'Full house, kings over sevens', ['Ks', 'Kh', 'Kd', '7h', '7c']), shown(1, 'Two pair, jacks and sevens', ['Jc', 'Jd', '7h', '7c', 'Ks'])],
      },
    });
    const r = summarizeResult(g, names);
    expect(r?.title).toBe('You win 1,280');
    expect(r?.subtitle).toBe('Full house, kings over sevens');
    expect([...(r?.highlight ?? [])].sort()).toEqual(['7c', '7h', 'Kd', 'Kh', 'Ks']);
  });

  it('reads split pots and side pots', () => {
    const split = game({
      result: {
        wonByFold: false,
        pots: [{ amount: 200, eligibleSeats: [1, 2], winners: [{ seat: 1, playerId: 'ben', amount: 100 }, { seat: 2, playerId: 'cleo', amount: 100 }] }],
        shown: [shown(1, 'Straight, ten high', ['Ts']), shown(2, 'Straight, ten high', ['Ts'])],
      },
    });
    expect(summarizeResult(split, names)).toMatchObject({ title: 'Ben and Cleo split 200', subtitle: 'Straight, ten high' });

    const sides = game({
      result: {
        wonByFold: false,
        pots: [
          { amount: 300, eligibleSeats: [0, 1, 2], winners: [{ seat: 0, playerId: 'ana', amount: 300 }] },
          { amount: 150, eligibleSeats: [1, 2], winners: [{ seat: 2, playerId: 'cleo', amount: 150 }] },
        ],
        shown: [shown(0, 'Flush, ace high', ['As']), shown(1, 'Pair of nines', ['9s']), shown(2, 'Two pair, fours and threes', ['4s'])],
      },
    });
    expect(summarizeResult(sides, names)).toMatchObject({ title: 'You win 300, Cleo wins 150', subtitle: 'Flush, ace high / Two pair, fours and threes' });
  });
});

describe('final standings (finished screen)', () => {
  const line = (playerId: string, finalStack: number, totalBuyIn = 1000): FinalResult => ({
    playerId,
    displayName: playerId.replace(/^./, (c) => c.toUpperCase()),
    finalStack,
    totalBuyIn,
    rebuys: totalBuyIn / 1000 - 1,
    net: finalStack - totalBuyIn,
    botLevel: null,
  });
  const finished = (results: FinalResult[], occupied: number[] = [0, 1, 2]) => {
    const s = snapshot(null, occupied);
    return { ...s.room, status: 'finished' as const, table: null, finalResults: results };
  };

  it('ranks by the server order, shares ranks on ties, and flags you, the winner and who left', () => {
    const room = finished([line('ben', 2200), line('ana', 1400, 2000), line('cleo', 300), line('dev', 0)]);
    expect(buildStandings(room).map((s) => [s.playerId, s.rank, s.isTop, s.isYou, s.left])).toEqual([
      ['ben', 1, true, false, false],
      ['ana', 2, false, true, false],
      ['cleo', 3, false, false, false],
      ['dev', 4, false, false, true],
    ]);
    const tied = buildStandings(finished([line('ana', 1500), line('ben', 1500), line('cleo', 0)]));
    expect(tied.map((s) => [s.rank, s.isTop])).toEqual([
      [1, true],
      [1, true],
      [3, false],
    ]);
  });

  it('writes the headline for a winner, a shared top, and nobody ahead', () => {
    const nameOf = (s: { isYou: boolean; displayName: string }) => (s.isYou ? 'You' : s.displayName);
    expect(summarizeGame(buildStandings(finished([line('ben', 1800), line('ana', 200)])), nameOf)).toEqual({
      title: 'Ben wins the game',
      subtitle: '800 chips up',
    });
    expect(summarizeGame(buildStandings(finished([line('ana', 1800), line('ben', 200)])), nameOf).title).toBe('You win the game');
    expect(summarizeGame(buildStandings(finished([line('ana', 1500), line('ben', 1500), line('cleo', 0)])), nameOf)).toEqual({
      title: 'You and Ben share the top',
      subtitle: '500 chips up each',
    });
    expect(summarizeGame(buildStandings(finished([line('ana', 1000), line('ben', 1000)])), nameOf)).toEqual({
      title: 'Game over',
      subtitle: 'Everyone finished even',
    });
  });

  it('signs net results so colour is never the only signal', () => {
    expect([1240, -1000, 0].map(formatNet)).toEqual(['+1,240', '\u22121,000', 'Even']);
  });
});

describe('waiting message (R-10.4, R-10.6)', () => {
  const bot = (i: number, name: string) => seat(i, { playerId: `bot:${i}`, displayName: name, isBot: true, botLevel: 'normal' });

  it('names who can rebuy and offers the host a bot when fewer than two have chips', () => {
    const s = snapshot(null, [seat(0, { stack: 0, busted: true }), seat(1)]);
    expect(waitingHint(s)).toBe('A hand needs two players with chips. You can rebuy. Invite a friend with code ABC234, add a bot, or end the game from the top bar.');
    expect(waitingHint(snapshot(null, [seat(0, { stack: 0, busted: true }), seat(1)], 'ben'))).toBe('A hand needs two players with chips. Ana can rebuy. Invite a friend with code ABC234.');
  });

  it('says the bots will not play alone, and who they are waiting for', () => {
    const busted = snapshot(null, [seat(0, { stack: 0, busted: true }), bot(1, 'Ace Bot'), bot(2, 'King Bot')]);
    expect(waitingHint(busted)).toBe("The bots don't play on their own. You can rebuy. Invite a friend with code ABC234, or end the game from the top bar.");
    const away = snapshot(null, [seat(0, { stack: 0, busted: true }), bot(1, 'Ace Bot'), seat(3, { connected: false })]);
    expect(waitingHint(away)).toBe("The bot doesn't play on its own. Waiting for Dev to come back. You can rebuy. Invite a friend with code ABC234, or end the game from the top bar.");
  });
});

import type { Card } from '@poker/shared';
import { describe, expect, it } from 'vitest';
import { handHint, toGameView } from '../../src/engine';
import { act, deal, newHand } from './helpers';

/** GameView.yourHand: the viewer's own hand as a hint, and the hand's public history. */

const hint = (hole: string, board = '') =>
  handHint(hole.split(' ') as [Card, Card], board ? (board.split(' ') as Card[]) : []);

describe('hand hints', () => {
  it('names the starting hand before the flop', () => {
    expect(hint('Qs Qd')).toEqual({ category: 'pair', label: 'Pair of Queens', onBoard: false, draws: [] });
    expect(hint('As 7d')).toEqual({ category: 'highCard', label: 'Ace high', onBoard: false, draws: [] });
  });

  it('names every made hand with the table’s own labels (game-rules §8)', () => {
    expect(hint('Kd 2c', 'Ks 9h 4d').label).toBe('Pair of Kings');
    expect(hint('Kd 9c', 'Ks 9h 4d').label).toBe('Two Pair, Kings and Nines');
    expect(hint('4s 4c', 'Ks 9h 4d').label).toBe('Three of a Kind, Fours');
    expect(hint('Jc Td', 'Qs 9h 8d').label).toBe('Straight, Queen high');
    expect(hint('As 2s', 'Ks 9s 4s').label).toBe('Flush, Ace high');
    expect(hint('9c 9d', 'Ks Kh 9h').label).toBe('Full House, Nines over Kings');
    expect(hint('Kc Kd', 'Ks Kh 9h').label).toBe('Four of a Kind, Kings');
    expect(hint('9s Ts', 'Js Qs Ks').label).toBe('Straight Flush, King high');
    expect(hint('7c 2d', 'Ks 9h 4d')).toMatchObject({ category: 'highCard', label: 'King high' });
  });

  it('says when the board alone makes the hand', () => {
    expect(hint('Ac 2d', '7s 7h Kd')).toMatchObject({ category: 'pair', onBoard: true });
    expect(hint('Kc 2d', '7s 7h Kd')).toMatchObject({ category: 'twoPair', onBoard: false });
    expect(hint('2c 3d', 'As Ks Qs Js Ts')).toMatchObject({ category: 'straightFlush', onBoard: true });
    expect(hint('9s 3d', 'As Ks Qs Js Ts')).toMatchObject({ category: 'straightFlush', onBoard: true });
    expect(hint('Ac 3d', 'Qs Qh 9d 9c 2s')).toMatchObject({ category: 'twoPair', onBoard: false }); // the ace kicker plays
  });

  it('finds flush and straight draws on the flop and turn, not the river', () => {
    expect(hint('As 7s', 'Ks 9s 2d').draws).toEqual(['flushDraw']);
    expect(hint('9c 8d', '7s 6h 2d').draws).toEqual(['straightDraw']); // open-ended
    expect(hint('9c 5d', '8s 6h 2d').draws).toEqual(['gutshot']);
    expect(hint('Ac 2d', '3s 4h Kd').draws).toEqual(['gutshot']); // the wheel needs a five
    expect(hint('9s 8s', '7s 6h 2s').draws).toEqual(['flushDraw', 'straightDraw']);
    expect(hint('As 7s', 'Ks 9s 2d 4c 8h').draws).toEqual([]);
  });

  it('only counts draws the viewer’s own cards help with', () => {
    expect(hint('Ac 2d', 'Ks 9s 5s').draws).toEqual([]); // three spades on the board, none in hand
    expect(hint('2c 2d', '9s 8h 7d 6c').draws).toEqual([]); // the board's own open-ended draw
    expect(hint('Tc 2d', '9s 8h 7d 3c').draws).toEqual(['straightDraw']);
  });

  it('skips draws to hands no better than what is already made', () => {
    expect(hint('9c 8d', '7s 6h 5d').draws).toEqual([]); // already a straight
    expect(hint('As 7s', 'Ks 9s 2s').draws).toEqual([]); // already a flush
  });
});

describe('toGameView extras', () => {
  it('gives each viewer only their own hint, and none once folded', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000, 2: 1000 }, button: 0, hole: { 0: ['As', 'Ad'], 1: ['7c', '2d'], 2: ['Kh', 'Qh'] }, board: ['Ah', '9s', '4d'] });
    expect(toGameView(s, 'p0').yourHand?.label).toBe('Pair of Aces');
    expect(toGameView(s, 'p2').yourHand?.label).toBe('King high');
    s = act(s, 0, 'raise', 30);
    s = act(s, 1, 'fold');
    expect(toGameView(s, 'p1').yourHand).toBeNull();
    expect(toGameView(s, 'nobody').yourHand).toBeNull();
    s = deal(act(s, 2, 'call'));
    expect(toGameView(s, 'p0').yourHand?.label).toBe('Three of a Kind, Aces');
  });

  it('carries the public action history, street by street', () => {
    let s = newHand({ stacks: { 0: 1000, 1: 1000 }, button: 0 });
    s = act(act(s, 0, 'raise', 30), 1, 'call');
    s = act(act(deal(s), 1, 'bet', 40), 0, 'fold');
    expect(toGameView(s, 'p1').history).toEqual([
      { seat: 0, street: 'preflop', type: 'raise', amount: 30, allIn: false },
      { seat: 1, street: 'preflop', type: 'call', amount: 30, allIn: false },
      { seat: 1, street: 'flop', type: 'bet', amount: 40, allIn: false },
      { seat: 0, street: 'flop', type: 'fold', allIn: false },
    ]);
  });
});

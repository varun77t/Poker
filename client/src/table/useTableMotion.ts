import type { GameView } from '@poker/shared';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { cardBackNode, chipStackNode } from '../components/table/flyers';
import { formatChips } from './model';
import { TIMING, planMotion, type MotionStep } from './motionPlan';

/**
 * Plays the table's motion: after each snapshot renders, it diffs the new game view against the
 * previous one (planMotion) and flies copies of cards and chips between anchors on an overlay.
 * The real elements are already in their final state; a target is only hidden until its copy lands.
 * Motion is decoration: if anything is missing or the user prefers reduced motion, nothing moves.
 */

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
const BOUNCE = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

type Rects = Map<string, DOMRect>;

function measure(root: HTMLElement): Rects {
  const rects: Rects = new Map();
  for (const el of root.querySelectorAll<HTMLElement>('[data-anchor]')) {
    rects.set(el.dataset.anchor as string, el.getBoundingClientRect());
  }
  return rects;
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

export function useTableMotion(stage: RefObject<HTMLElement | null>, overlay: RefObject<HTMLElement | null>, game: GameView | null, viewerId: string) {
  const previous = useRef<{ game: GameView | null; rects: Rects }>({ game: null, rects: new Map() });
  const running = useRef(new Set<() => void>());

  useLayoutEffect(() => {
    const root = stage.current;
    const layer = overlay.current;
    const prev = previous.current;
    const rects = root ? measure(root) : new Map<string, DOMRect>();
    previous.current = { game, rects };
    if (!root || !layer || prev.game === game) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const origin = layer.getBoundingClientRect();
    const anchorEl = (name: string) => root.querySelector<HTMLElement>(`[data-anchor="${name}"]`);

    /** Hides `el` until `release` runs (or a safety timeout, so nothing can stay hidden). */
    const hideUntil = (el: HTMLElement | null, ms: number) => {
      if (!el) return () => {};
      el.style.visibility = 'hidden';
      const release = () => {
        el.style.visibility = '';
        clearTimeout(safety);
      };
      const safety = window.setTimeout(release, ms + 400);
      return release;
    };

    const fly = (node: HTMLElement, from: DOMRect, to: DOMRect, delay: number, rotate: number, onLand: () => void) => {
      const start = center(from);
      const end = center(to);
      node.style.position = 'absolute';
      node.style.left = '0';
      node.style.top = '0';
      node.style.visibility = 'hidden';
      layer.appendChild(node);
      const { width, height } = node.getBoundingClientRect();
      const at = (p: { x: number; y: number }, lift = 0) => `translate(${p.x - origin.left - width / 2}px, ${p.y - origin.top - height / 2 - lift}px)`;
      const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
      const cancel = () => {
        clearTimeout(timer);
        node.remove();
        running.current.delete(cancel);
      };
      running.current.add(cancel);
      const timer = window.setTimeout(() => {
        node.style.visibility = '';
        const anim = node.animate(
          [
            { transform: `${at(start)} rotate(${rotate}deg)` },
            { transform: `${at(mid, 12)} rotate(${rotate / 3}deg)`, offset: 0.55 },
            { transform: `${at(end)} rotate(0deg)` },
          ],
          { duration: TIMING.flight, easing: EASE, fill: 'forwards' },
        );
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          node.remove();
          running.current.delete(cancel);
          onLand();
        };
        anim.onfinish = finish;
        // Throttled or background tabs may never fire onfinish; the timer keeps the table honest.
        window.setTimeout(finish, TIMING.flight + 80);
      }, delay);
    };

    const turnOver = (el: HTMLElement | null, delay = 0) =>
      el?.animate([{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], { duration: 220, delay, easing: EASE });
    const settle = (el: HTMLElement | null) =>
      el?.animate([{ transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }], { duration: 240, easing: BOUNCE });

    const run = (step: MotionStep) => {
      switch (step.kind) {
        case 'deal':
        case 'board': {
          const target = anchorEl(step.to);
          const from = rects.get('deck');
          const to = rects.get(step.to);
          if (!target || !from || !to) return;
          const release = hideUntil(target, step.delay + TIMING.flight);
          fly(cardBackNode(to.width), from, to, step.delay, -14, () => {
            release();
            if (step.kind === 'board' || step.flip) turnOver(target);
          });
          return;
        }
        case 'chips': {
          const from = (step.fromPrevious ? prev.rects : rects).get(step.from);
          const to = rects.get(step.to);
          if (!from || !to) return;
          // Hide what the chips are flying into (a bet stack, or the pot) until they arrive.
          const visual = step.to.startsWith('bet-')
            ? root.querySelector<HTMLElement>(`[data-bet-visual="${step.to.slice(4)}"]`)
            : step.to === 'pot'
              ? root.querySelector<HTMLElement>('[data-pot-visual]')
              : null;
          const release = hideUntil(visual, step.delay + TIMING.flight);
          fly(chipStackNode(step.amount), from, to, step.delay, 0, () => {
            release();
            settle(visual ?? anchorEl(step.to));
            if (step.float) floatAmount(layer, origin, to, step.amount);
          });
          return;
        }
        case 'reveal':
          turnOver(anchorEl(step.target), step.delay);
          return;
      }
    };

    for (const step of planMotion(prev.game, game, viewerId)) run(step);
  }, [game, stage, overlay, viewerId]);

  // Keep anchor positions fresh when the window changes size between snapshots.
  useEffect(() => {
    const onResize = () => {
      if (stage.current) previous.current.rects = measure(stage.current);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [stage]);

  useEffect(() => {
    const cancels = running.current;
    return () => {
      for (const cancel of cancels) cancel();
      cancels.clear();
    };
  }, []);
}

/** "+280" rising from a winner's name plate. */
function floatAmount(layer: HTMLElement, origin: DOMRect, at: DOMRect, amount: number) {
  const el = document.createElement('span');
  el.textContent = `+${formatChips(amount)}`;
  el.dataset.float = '';
  const x = at.left + at.width / 2 - origin.left;
  const y = at.top - origin.top;
  Object.assign(el.style, { position: 'absolute', left: `${x}px`, top: `${y}px` });
  layer.appendChild(el);
  const anim = el.animate(
    [
      { transform: 'translate(-50%, 0)', opacity: 1 },
      { transform: 'translate(-50%, -28px)', opacity: 0 },
    ],
    { duration: 1400, easing: 'ease-out', fill: 'forwards' },
  );
  anim.onfinish = () => el.remove();
  window.setTimeout(() => el.remove(), 1600);
}

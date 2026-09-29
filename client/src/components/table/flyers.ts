import { chipColors } from '../../table/model';
import chipStyles from './ChipStack.module.css';
import cardStyles from './PlayingCard.module.css';

/** Plain DOM copies of cards and chips for the motion overlay (see table/useTableMotion.ts). */

export function cardBackNode(width: number): HTMLElement {
  const el = document.createElement('div');
  el.className = `${cardStyles.card} ${cardStyles.back}`;
  el.style.width = `${width}px`;
  const pattern = document.createElement('span');
  pattern.className = cardStyles.pattern as string;
  el.appendChild(pattern);
  return el;
}

export function chipStackNode(amount: number): HTMLElement {
  const stack = document.createElement('span');
  stack.className = chipStyles.stack as string;
  chipColors(amount).forEach((colour, i) => {
    const chip = document.createElement('i');
    chip.className = `${chipStyles.chip} ${chipStyles[colour]}`;
    chip.style.top = `${-i * 4}px`;
    stack.appendChild(chip);
  });
  return stack;
}

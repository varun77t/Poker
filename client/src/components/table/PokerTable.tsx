import type { GameView, TableSnapshot } from '@poker/shared';
import { formatChips, SLOTS, waitingHint, type ResultSummary, type TableModel } from '../../table/model';
import { ChipStack } from './ChipStack';
import { cx } from '../../lib/cx';
import { PlayingCard } from './PlayingCard';
import { EmptySeat, Seat, type TurnClock } from './Seat';
import styles from './PokerTable.module.css';

interface Props {
  snapshot: TableSnapshot;
  model: TableModel;
  result: ResultSummary | null;
  clock: TurnClock | null;
  /** The game is over: the table dims and the seats rest while the result plate stays lit. */
  resting?: boolean;
}

const at = ([x, y]: [number, number]) => ({ left: `${x * 100}%`, top: `${y * 100}%` });

/** The oval table: rail, felt, board, pots, bets, dealer button and the five seats around it. */
export function PokerTable({ snapshot, model, result, clock, resting = false }: Props) {
  const game = snapshot.game;
  const { table, youId, hostId } = snapshot.room;
  const highlight = result && result.highlight.size > 0 ? result.highlight : null;
  const slotOfSeat = (seat: number) => model.seats[seat]?.slot ?? 0;
  const isHost = youId === hostId;

  return (
    <div className={cx(styles.table, resting && styles.resting)}>
      <div className={styles.felt}>
        <div className={cx(styles.wordmark, (result || table?.waitingForPlayers) && styles.hidden)} aria-hidden="true">
          PRIVATE HOLD'EM
        </div>
        <span className={styles.deck} data-anchor="deck" aria-hidden="true" />

        <div className={styles.center} data-anchor="pot">
          {result ? (
            <div className={styles.result} role="status">
              <h2>{result.title}</h2>
              <p>{result.subtitle}</p>
            </div>
          ) : (
            game && <Pots game={game} />
          )}
        </div>

        {game && <Board game={game} highlight={highlight} />}

        {table?.waitingForPlayers && (
          <div className={styles.waiting} role="status">
            <h2>Waiting for players</h2>
            <p>{waitingHint(snapshot)}</p>
          </div>
        )}

        {/* Fixed spots where each seat's bet sits, so chips always have somewhere to fly. */}
        {model.seats.map((s) => (
          <span key={`spot-${s.seat}`} className={styles.spot} style={at(SLOTS[s.slot]?.bet ?? [0.5, 0.5])} data-anchor={`bet-${s.seat}`} />
        ))}
        {game &&
          !game.result &&
          game.players
            .filter((p) => p.committed > 0)
            .map((p) => (
              <div key={`bet-${p.seat}`} className={styles.bet} style={at(SLOTS[slotOfSeat(p.seat)]?.bet ?? [0.5, 0.5])} data-bet-visual={p.seat}>
                <ChipStack amount={p.committed} />
                <span>{formatChips(p.committed)}</span>
              </div>
            ))}

        {game && (
          <span className={styles.dealer} style={at(SLOTS[slotOfSeat(game.buttonSeat)]?.dealer ?? [0.5, 0.5])} aria-label="Dealer button">
            D
          </span>
        )}

        <div className={styles.seats}>
          {model.seats.map((s) =>
            'empty' in s ? (
              // A finished table shows only the seats people sat in.
              !resting && <EmptySeat key={s.seat} seat={s.seat} slot={s.slot} canAddBot={isHost} />
            ) : (
              <Seat
                key={s.seat}
                model={s}
                highlight={highlight}
                clock={s.isTurn ? clock : null}
                removable={isHost && !resting && s.view.isBot && !s.view.leaving}
              />
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function Pots({ game }: { game: GameView }) {
  if (game.pots.length === 0) return null;
  return (
    <div className={styles.pots} data-pot-visual>
      {game.pots.map((pot, i) => (
        <span key={i} className={styles.pot}>
          {i === 0 && <ChipStack amount={pot.amount} />}
          <span className={styles.potLabel}>
            <span>{i === 0 ? 'Pot' : 'Side pot'}</span>
            {formatChips(pot.amount)}
          </span>
        </span>
      ))}
    </div>
  );
}

function Board({ game, highlight }: { game: GameView; highlight: Set<string> | null }) {
  const cards = game.board;
  return (
    <div className={styles.board} aria-label={cards.length ? `Board: ${cards.length} cards` : 'Board'}>
      {Array.from({ length: 5 }, (_, i) => {
        const card = cards[i];
        return card ? (
          <PlayingCard
            key={i}
            card={card}
            anchor={`board-${i}`}
            tone={highlight ? (highlight.has(card) ? 'lift' : 'dim') : undefined}
            className={styles.boardCard}
          />
        ) : (
          <span key={i} className={styles.slot} aria-hidden="true" />
        );
      })}
    </div>
  );
}

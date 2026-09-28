import type { PlayerId } from '@poker/shared';
import type { IoSocket } from './types';

/** The single active socket per player. A newer connection for the same player replaces the older one. */
export class Connections {
  private readonly byPlayer = new Map<PlayerId, IoSocket>();

  get size(): number {
    return this.byPlayer.size;
  }

  get(playerId: PlayerId): IoSocket | undefined {
    return this.byPlayer.get(playerId);
  }

  has(playerId: PlayerId): boolean {
    return this.byPlayer.has(playerId);
  }

  /** Makes `socket` the player's active connection. Returns the connection it replaced, if any. */
  set(playerId: PlayerId, socket: IoSocket): IoSocket | undefined {
    const previous = this.byPlayer.get(playerId);
    this.byPlayer.set(playerId, socket);
    return previous === socket ? undefined : previous;
  }

  /** Forgets `socket` if it is still the player's active connection. Returns true if it was. */
  release(playerId: PlayerId, socket: IoSocket): boolean {
    if (this.byPlayer.get(playerId) !== socket) return false;
    this.byPlayer.delete(playerId);
    return true;
  }
}

import type { PlayerId } from '@poker/shared';
import { seatedPlayers, toSnapshot, type Room } from '../rooms/room';
import type { Connections } from './connections';

/**
 * Sends each seated player their own snapshot on their own socket. Never broadcasts one payload to a
 * whole Socket.IO room: once cards exist, snapshots differ per player (docs/architecture.md §9).
 */
export class Broadcaster {
  constructor(private readonly connections: Connections) {}

  roomChanged(room: Room): void {
    for (const seat of seatedPlayers(room)) this.sendTo(seat.playerId, room);
  }

  sendTo(playerId: PlayerId, room: Room): void {
    this.connections.get(playerId)?.emit('state', toSnapshot(room, playerId));
  }
}

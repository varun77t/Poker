import type { PlayerId } from '@poker/shared';
import type { Clock } from '../clock';
import { members, toSnapshot, type Room } from '../rooms/room';
import type { Connections } from './connections';

/**
 * Sends each member their own snapshot on their own socket. Never broadcasts one payload to a whole
 * Socket.IO room: snapshots differ per player because of hole cards (docs/architecture.md §9).
 */
export class Broadcaster {
  constructor(
    private readonly connections: Connections,
    private readonly clock: Clock,
  ) {}

  roomChanged(room: Room): void {
    for (const seat of members(room)) this.sendTo(seat.playerId, room);
  }

  sendTo(playerId: PlayerId, room: Room): void {
    this.connections.get(playerId)?.emit('state', toSnapshot(room, playerId, this.clock.now()));
  }
}

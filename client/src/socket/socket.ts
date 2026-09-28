import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { io, type Socket } from 'socket.io-client';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Single app-wide socket. It connects to the page's own origin: the Vite proxy in development,
 * the same Node server in production. Connection is started explicitly (autoConnect: false)
 * so the session token can be attached first once identity lands in Phase 2.
 */
export const socket: ClientSocket = io({ autoConnect: false });

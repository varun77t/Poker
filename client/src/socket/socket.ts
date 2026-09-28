import type { ClientToServerEvents, ServerToClientEvents } from '@poker/shared';
import { io, type Socket } from 'socket.io-client';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Single app-wide socket. It connects to the page's own origin: the Vite proxy in development,
 * the same Node server in production. It only connects once a session token is attached
 * (see connection.ts), because the server rejects handshakes without one.
 */
export const socket: ClientSocket = io({ autoConnect: false });

/**
 * useSocket.ts — Reusable Socket.IO hook for Stream Pay
 *
 * Connects to the backend server and joins the appropriate room
 * (merchant:{id} or user:{id}) so the component receives real-time events.
 *
 * Usage:
 *   const socket = useSocket({ role: 'user', id: userId });
 *
 * Then subscribe in useEffect:
 *   socket?.on('session:update', handler);
 *   return () => socket?.off('session:update', handler);
 */
import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_API_URL?.includes("localhost")
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : (import.meta.env.VITE_API_URL || "http://localhost:4000");

interface UseSocketOptions {
    role: "user" | "merchant";
    id: string | null | undefined;
}

export function useSocket({ role, id }: UseSocketOptions): Socket | null {
    const socketRef = useRef<Socket | null>(null);

    useEffect(() => {
        if (!id) return;

        const socket = io(SERVER_URL, { transports: ["websocket", "polling"] });
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log(`[Socket] Connected as ${role}:${id}`);
            // Join the appropriate room so we receive events for this entity
            if (role === "merchant") {
                socket.emit("join:merchant", id);
            } else {
                socket.emit("join:user", id);
            }
        });

        socket.on("disconnect", (reason) => {
            console.log("[Socket] Disconnected:", reason);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [role, id]);

    return socketRef.current;
}

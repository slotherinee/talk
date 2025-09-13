const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const { generateTurnCredentials } = require("./turn-credentials");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Serve built client (if present) from server/dist
const distPath = path.join(__dirname, "dist");
// ICE servers endpoint
app.get("/api/ice-servers", (req, res) => {
  const turnCreds = generateTurnCredentials();
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.sipnet.ru" },
    { urls: "stun:stun.sipnet.net" },
    {
      urls: "turn:" + req.get("host") + ":3478",
      username: turnCreds.username,
      credential: turnCreds.credential,
    },
    {
      urls: "turns:" + req.get("host") + ":5349",
      username: turnCreds.username,
      credential: turnCreds.credential,
    },
  ];
  res.json({ iceServers });
});

// Room validation endpoint
app.get("/api/room/:roomId/exists", (req, res) => {
  const roomId = req.params.roomId;
  const roomExists = io.sockets.adapter.rooms.has(roomId);
  const wasCreated = roomCreatedAt.has(roomId);

  res.json({
    exists: roomExists,
    wasCreated: wasCreated,
    canJoin: roomExists || !roomExists, // Allow joining even if room doesn't exist (auto-create)
  });
});

app.use(express.static(distPath));
// SPA fallback to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const ROOM_EMPTY_GRACE_MS = 60 * 1000;
const roomTtlTimers = new Map();
const roomCreatedAt = new Map();
const emptyTimers = new Map();
const roomMessages = new Map();

const lockedRooms = new Set();

function emitMembers(room) {
  const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
  const enriched = clients.map((id) => {
    const s = io.sockets.sockets.get(id);
    return {
      id,
      name: s && s.data && s.data.username ? s.data.username : id,
      muted: !!(s && s.data && s.data.muted),
    };
  });
  io.in(room).emit("members", enriched);
  if (enriched.length === 0) {
    if (!emptyTimers.has(room)) {
      const deleteAt = new Date(Date.now() + ROOM_EMPTY_GRACE_MS).toISOString();
      const t = setTimeout(() => {
        if (!io.sockets.adapter.rooms.get(room)) {
          const ttlTimer = roomTtlTimers.get(room);
          if (ttlTimer) clearTimeout(ttlTimer);
          roomTtlTimers.delete(room);
          roomCreatedAt.delete(room);
          lockedRooms.delete(room);
          roomMessages.delete(room);
        }
        emptyTimers.delete(room);
      }, ROOM_EMPTY_GRACE_MS);
      emptyTimers.set(room, t);
    }
  } else {
    const et = emptyTimers.get(room);
    if (et) {
      clearTimeout(et);
      emptyTimers.delete(room);
    }
    if (!roomTtlTimers.has(room)) {
      scheduleRoomTtl(room);
    }
  }
}

function scheduleRoomTtl(room) {
  if (roomTtlTimers.has(room)) return;
  roomCreatedAt.set(room, Date.now());
  const expireAt = new Date(Date.now() + ROOM_TTL_MS).toISOString();
  const timer = setTimeout(() => {
    const set = io.sockets.adapter.rooms.get(room);
    if (set && set.size > 0) {
      for (const id of set) {
        const s = io.sockets.sockets.get(id);
        if (s) {
          try {
            s.emit("room-expired");
          } catch (_) {}
          try {
            s.leave(room);
          } catch (_) {}
        }
      }
    } else {
    }
    lockedRooms.delete(room);
    roomCreatedAt.delete(room);
    roomTtlTimers.delete(room);
    roomMessages.delete(room);
  }, ROOM_TTL_MS);
  roomTtlTimers.set(room, timer);
}

io.on("connection", (socket) => {
  socket.on("join", (room, username) => {
    try {
      const existing = io.sockets.adapter.rooms.get(room);
      const existingSize = existing ? existing.size : 0;

      if (lockedRooms.has(room) && existing && existing.size > 0) {
        socket.emit("room-join-denied", "locked");
        return;
      }

      socket.data.username = (username || "").trim().slice(0, 10) || socket.id;
      socket.data.room = room;

      socket.join(room);

      const newRoomSize = io.sockets.adapter.rooms.get(room)?.size || 0;

      io.in(room).emit("participant-joined", {
        id: socket.id,
        name: socket.data.username || socket.id,
        ts: Date.now(),
      });

      if (!existing || existing.size === 0) {
        const old = roomTtlTimers.get(room);
        if (old) {
          clearTimeout(old);
          roomTtlTimers.delete(room);
        }
        scheduleRoomTtl(room);
      }

      emitMembers(room);
      socket.emit("room-join-ok", {
        locked: lockedRooms.has(room),
        ttlMs: ROOM_TTL_MS,
        remainingMs: roomCreatedAt.has(room)
          ? Math.max(0, ROOM_TTL_MS - (Date.now() - roomCreatedAt.get(room)))
          : ROOM_TTL_MS,
      });
    } catch (e) {
      console.error(
        `❌ [JOIN] Error for socket ${socket.id} joining room "${room}":`,
        e
      );
      socket.emit("room-join-denied", "error");
    }
  });

  socket.on("set-username", (room, username) => {
    try {
      socket.data.username = (username || "").trim().slice(0, 10) || socket.id;
      emitMembers(room);
    } catch (e) {
      console.warn("set-username error", e);
    }
  });

  socket.on("set-muted", (room, muted) => {
    try {
      socket.data.muted = !!muted;
      emitMembers(room);
    } catch (e) {}
  });

  socket.on("set-room-locked", (room, locked) => {
    try {
      if (!socket.rooms.has(room)) return;
      if (locked) lockedRooms.add(room);
      else lockedRooms.delete(room);
      io.in(room).emit("room-lock-state", !!locked);
    } catch (e) {}
  });

  socket.on("raise-hand", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      io.in(room).emit("raise-hand", {
        id: socket.id,
        username: socket.data.username,
        ts: Date.now(),
      });
    } catch (e) {}
  });

  socket.on("screen-share-stopped", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      io.in(room).emit("screen-share-stopped", {
        id: socket.id,
        username: socket.data.username,
        ts: Date.now(),
      });
    } catch (e) {}
  });

  socket.on("screen-share-started", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      io.in(room).emit("screen-share-started", {
        id: socket.id,
        username: socket.data.username,
        ts: Date.now(),
      });
    } catch (e) {}
  });

  socket.on("chat-send", (room, text, clientTs) => {
    try {
      if (!socket.rooms.has(room)) return;
      const trimmed = (text || "").trim();
      if (!trimmed) return;
      const msg = {
        id: socket.id,
        name:
          socket.data && socket.data.username
            ? socket.data.username
            : socket.id,
        text: trimmed.slice(0, 1000),
        ts:
          typeof clientTs === "number" &&
          Math.abs(Date.now() - clientTs) < 5 * 60 * 1000
            ? clientTs
            : Date.now(),
      };
      if (!roomMessages.has(room)) roomMessages.set(room, []);
      const arr = roomMessages.get(room);
      arr.push(msg);
      if (arr.length > 500) arr.splice(0, arr.length - 500);
      io.in(room).emit("chat-message", msg);
    } catch (e) {}
  });

  socket.on("chat-get-history", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      const history = roomMessages.get(room) || [];
      socket.emit("chat-history", history);
    } catch (e) {}
  });

  socket.on("get-room-state", (room) => {
    try {
      const locked = lockedRooms.has(room);
      const remainingMs = roomCreatedAt.has(room)
        ? Math.max(0, ROOM_TTL_MS - (Date.now() - roomCreatedAt.get(room)))
        : ROOM_TTL_MS;
      socket.emit("room-state", { locked, remainingMs });
    } catch (e) {}
  });

  socket.on("leave", (room) => {
    try {
      const beforeSize = io.sockets.adapter.rooms.get(room)?.size || 0;
      socket.leave(room);
      socket.data.room = null;
      const afterSize = io.sockets.adapter.rooms.get(room)?.size || 0;

      emitMembers(room);
      io.in(room).emit("participant-left", {
        id: socket.id,
        name: socket.data.username || socket.id,
        ts: Date.now(),
      });
    } catch (e) {
      console.error(
        `❌ [LEAVE] Error for socket ${socket.id} leaving room "${room}":`,
        e
      );
    }
  });

  socket.on("offer", (room, description) => {
    socket.to(room).emit("offer", socket.id, description);
  });

  socket.on("offer-to", (targetId, description) => {
    socket.to(targetId).emit("offer", socket.id, description);
  });

  socket.on("answer", (id, description) => {
    socket.to(id).emit("answer", socket.id, description);
  });

  socket.on("candidate", (room, candidate) => {
    socket.to(room).emit("candidate", socket.id, candidate);
  });

  socket.on("candidate-to", (targetId, candidate) => {
    socket.to(targetId).emit("candidate", socket.id, candidate);
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (room) {
      const beforeSize = io.sockets.adapter.rooms.get(room)?.size || 0;

      emitMembers(room);
      try {
        io.in(room).emit("participant-left", {
          id: socket.id,
          name: socket.data.username || socket.id,
          ts: Date.now(),
        });
      } catch (e) {
        console.error(
          `❌ [DISCONNECT] Error emitting participant-left for ${socket.id}:`,
          e
        );
      }

      const afterSize = io.sockets.adapter.rooms.get(room)?.size || 0;
    }
  });
});

io.on("disconnect", () => {});

server.on("close", () => {});

server.listen(3000, () => console.log("Server running"));

io.of("/").adapter.on("delete-room", () => {});

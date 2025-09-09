const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

// Serve built client (if present) from server/dist
const distPath = path.join(__dirname, "dist");
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
      console.log(
        `[ROOM ${room}] became empty -> scheduling deletion in ${
          ROOM_EMPTY_GRACE_MS / 1000
        }s (at ${deleteAt})`
      );
      const t = setTimeout(() => {
        if (!io.sockets.adapter.rooms.get(room)) {
          console.log(
            `[ROOM ${room}] empty grace elapsed -> deleting room metadata`
          );
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
      console.log(`[ROOM ${room}] repopulated -> canceled pending deletion`);
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
  console.log(
    `[ROOM ${room}] TTL scheduled for ${(ROOM_TTL_MS / 60000).toFixed(
      0
    )} minutes (expires at ${expireAt})`
  );
  const timer = setTimeout(() => {
    const set = io.sockets.adapter.rooms.get(room);
    if (set && set.size > 0) {
      console.log(
        `[ROOM ${room}] TTL expired -> forcing ${set.size} participant(s) to leave`
      );
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
      console.log(`[ROOM ${room}] TTL expired with no participants`);
    }
    lockedRooms.delete(room);
    roomCreatedAt.delete(room);
    roomTtlTimers.delete(room);
    roomMessages.delete(room);
  }, ROOM_TTL_MS);
  roomTtlTimers.set(room, timer);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join", (room, username) => {
    try {
      const existing = io.sockets.adapter.rooms.get(room);
      if (lockedRooms.has(room) && existing && existing.size > 0) {
        socket.emit("room-join-denied", "locked");
        return;
      }
      socket.data.username = (username || "").trim() || socket.id;
      socket.join(room);
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
          console.log(
            `[ROOM ${room}] first member after empty -> restarting TTL`
          );
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
      console.warn("join error", e);
      socket.emit("room-join-denied", "error");
    }
  });

  socket.on("set-username", (room, username) => {
    try {
      socket.data.username = (username || "").trim() || socket.id;
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
      io.in(room).emit("raise-hand", { id: socket.id, ts: Date.now() });
    } catch (e) {}
  });

  socket.on("screen-share-stopped", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      io.in(room).emit("screen-share-stopped", {
        id: socket.id,
        ts: Date.now(),
      });
    } catch (e) {}
  });

  socket.on("screen-share-started", (room) => {
    try {
      if (!socket.rooms.has(room)) return;
      io.in(room).emit("screen-share-started", {
        id: socket.id,
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
      socket.leave(room);
      emitMembers(room);
      io.in(room).emit("participant-left", {
        id: socket.id,
        name: socket.data.username || socket.id,
        ts: Date.now(),
      });
    } catch (e) {}
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
    for (const room of socket.rooms) {
      if (room === socket.id) continue;
      emitMembers(room);
      try {
        io.in(room).emit("participant-left", {
          id: socket.id,
          name: socket.data.username || socket.id,
          ts: Date.now(),
        });
      } catch (e) {}
    }
  });
});

io.on("disconnect", () => {});

server.on("close", () => {});

server.listen(3000, () => console.log("Server running"));

io.of("/").adapter.on("delete-room", () => {});

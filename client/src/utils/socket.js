import io from "socket.io-client";

let socket = null;

export const connectSocket = () => {
  if (socket && socket.connected) return socket;
  const socketUrl = import.meta.env.DEV ? "http://localhost:3000" : "";

  socket = io(socketUrl, {
    forceNew: true,
    transports: ["websocket", "polling"],
  });

  return socket;
};

export const getSocket = () => socket;

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default {
  get current() {
    return socket;
  },
  connect: connectSocket,
  disconnect: disconnectSocket,
};

export const formatDuration = (ms) => {
  if (ms == null) return "--:--";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => n.toString().padStart(2, "0");
  return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
};

export const formatRemaining = (ms) => {
  if (ms == null) return "";
  const m = Math.max(0, Math.floor(ms / 60000));
  return m + "м";
};

export const generateRoomId = () =>
  "r-" + Math.random().toString(36).slice(2, 10);

export const parseRoomId = (input) => {
  if (!input || typeof input !== "string") return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    const pathname = url.pathname.slice(1);
    if (pathname) return pathname;

    // Fallback to search params (old format)
    const roomParam = url.searchParams.get("room");
    if (roomParam) return roomParam;

    return null;
  } catch {
    return trimmed;
  }
};

export const isValidRoomId = (roomId) => {
  if (!roomId || typeof roomId !== "string") return false;
  const trimmed = roomId.trim();
  return /^[a-zA-Z0-9_-]{3,50}$/.test(trimmed);
};

export const checkRoomExists = async (roomId) => {
  if (!isValidRoomId(roomId)) {
    return { exists: false, error: "Invalid room ID format" };
  }

  try {
    const response = await fetch(
      `/api/room/${encodeURIComponent(roomId)}/exists`
    );
    const data = await response.json();
    return {
      exists: data.exists,
      wasCreated: data.wasCreated,
      canJoin: data.canJoin,
    };
  } catch (error) {
    console.warn("Room check failed:", error);
    return { exists: false, error: "Failed to check room", canJoin: true };
  }
};

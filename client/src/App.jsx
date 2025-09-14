import { useState, useRef, useEffect } from "react";
import { connectSocket, getSocket, disconnectSocket } from "./utils/socket";
import {
  generateRoomId,
  parseRoomId,
  isValidRoomId,
  checkRoomExists,
} from "./utils/helpers";
import {
  createPeerConnectionFor,
  watchRemoteStream,
  renegotiateWith,
  addLocalTracksToPc,
  setupRemoteAnalyser,
  handleOffer,
} from "./utils/webrtc";
import {
  createMicToggler,
  createCamToggler,
  createScreenShareToggler,
  createCameraSwitcher,
} from "./utils/mediaControls";
import { getUserDevices, switchToDevice } from "./utils/deviceUtils";
import useMountTransition from "./hooks/useMountTransition";

// Screen components
import JoinScreen from "./screens/JoinScreen";
import PrecallScreen from "./screens/PrecallScreen";
import LobbyScreen from "./screens/LobbyScreen";
import CallScreen from "./screens/CallScreen";

export default function App() {
  const [screen, setScreen] = useState("join");
  const [roomId, setRoomId] = useState("");
  const [username, setUsername] = useState(""); // applied name
  const [tempName, setTempName] = useState(""); // entered in lobby
  const [autoCreated, setAutoCreated] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [volume, setVolume] = useState(100);
  const [micLevel, setMicLevel] = useState(0);
  const localVideo = useRef();
  const pcs = useRef({});
  const localAudioTrackRef = useRef(null);
  const localVideoTrackRef = useRef(null);
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});
  const politeRef = useRef({});
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteLevels, setRemoteLevels] = useState({});
  const [members, setMembers] = useState([]); // array of {id, name, muted}
  const [errors, setErrors] = useState({ roomId: "" });
  const [notifications, setNotifications] = useState([]);
  const prevMembersRef = useRef([]);
  const remoteAnalyzersRef = useRef({});
  const [stream, setStream] = useState(null);
  const [remotePresent, setRemotePresent] = useState(false);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const gainNodeRef = useRef(null);
  const rafRef = useRef(null);
  const [sharing, setSharing] = useState(false);
  const [shareLinkFlipTs, setShareLinkFlipTs] = useState(0); // flip animation for link share icon
  const screenTrackRef = useRef(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [callStartTs, setCallStartTs] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [remainingMs, setRemainingMs] = useState(null);
  const [roomLocked, setRoomLocked] = useState(false);
  const [handSignals, setHandSignals] = useState([]); // {id, expires}
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );
  const [isTablet, setIsTablet] = useState(
    typeof window !== "undefined"
      ? window.innerWidth >= 640 && window.innerWidth < 1024
      : false
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showMicPopover, setShowMicPopover] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatUnread, setChatUnread] = useState(0);
  const chatEndRef = useRef(null);
  const chatMobileContainerRef = useRef(null);
  const chatDesktopContainerRef = useRef(null);
  const chatMsgIdsRef = useRef(new Set());
  const chatHistoryRequestedRef = useRef(false);
  const localMsgCounterRef = useRef(0);
  const toolsSheetVisible = useMountTransition(
    (isMobile || isTablet) && toolsOpen,
    300
  );
  const chatDesktopVisible = useMountTransition(
    chatOpen && !isMobile && !isTablet,
    280
  );
  const chatMobileVisible = useMountTransition(
    chatOpen && (isMobile || isTablet),
    300
  );

  // Device management state
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [outputDevices, setOutputDevices] = useState([]);
  const [currentAudioDevice, setCurrentAudioDevice] = useState("");
  const [currentVideoDevice, setCurrentVideoDevice] = useState("");
  const [currentOutputDevice, setCurrentOutputDevice] = useState("");
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth;
      const mobile = w < 640;
      const tablet = w >= 640 && w < 1024;
      setIsMobile(mobile);
      setIsTablet(tablet);
      if (!mobile) setToolsOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = "::-webkit-scrollbar { display: none; }";
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  useEffect(() => {
    let int;
    if (screen === "call") {
      if (!callStartTs) setCallStartTs(Date.now());
      int = setInterval(() => {
        setElapsed(Date.now() - (callStartTs || Date.now()));
        if (remainingMs !== null)
          setRemainingMs((r) => (r !== null ? Math.max(0, r - 1000) : r));
      }, 1000);
    }
    return () => {
      if (int) clearInterval(int);
    };
  }, [screen, callStartTs, remainingMs]);

  useEffect(() => {
    // Connect socket when we're on precall or call screen
    if (screen !== "precall" && screen !== "call") return;

    const socket = connectSocket();
    if (socket._appListenersAdded) return;
    socket._appListenersAdded = true;

    const handleMembers = (list) => {
      const normalized = (list || []).map((item) =>
        typeof item === "string" ? { id: item, name: item } : item
      );
      setMembers(normalized);
    };
    socket.on("members", handleMembers);

    socket.on(
      "offer",
      async (id, description) => await handleOfferFromPeer(id, description)
    );

    socket.on("answer", async (fromId, description) => {
      const pc = pcs.current[fromId];
      if (!pc) return;
      try {
        const state = pc.signalingState;
        if (
          state === "have-local-offer" ||
          state === "have-local-pranswer" ||
          state === "have-remote-offer"
        ) {
          await pc.setRemoteDescription(description);
        } else {
          console.warn("Received answer in unexpected signaling state", state);
        }
      } catch (e) {
        console.warn("setRemoteDescription failed for answer", e);
      }
    });

    socket.on("candidate", async (fromId, candidate) => {
      const pc = pcs.current[fromId];
      if (pc)
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {}
    });
    socket.on("room-join-ok", (info) => {
      if (info) {
        setRoomLocked(!!info.locked);
        if (info.remainingMs !== undefined) setRemainingMs(info.remainingMs);
      }
    });
    socket.on("room-join-denied", (reason) => {
      const msg =
        reason === "locked"
          ? "Комната залочена: вход запрещён"
          : "Вход запрещен";
      setNotifications((n) => [
        ...n,
        { id: Date.now() + Math.random(), text: msg },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 5000);
      if (reason === "locked")
        setErrors((e) => ({ ...e, roomId: "Комната залочена" }));
    });
    socket.on("room-lock-state", (locked) => {
      setRoomLocked(!!locked);
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: locked ? "Комната залочена" : "Комната разлочена",
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 3500);
    });
    socket.on("room-expired", () => {
      setNotifications((n) => [
        ...n,
        { id: Date.now() + Math.random(), text: "Комната истекла" },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
      Object.values(pcs.current).forEach((pc) => {
        try {
          pc.close();
        } catch (e) {}
      });
      pcs.current = {};
      setRemoteStreams({});
      setMembers([]);
      setScreen("join");
    });
    socket.on("raise-hand", ({ id, username }) => {
      const expires = Date.now() + 3500;
      setHandSignals((prev) => [
        ...prev.filter((h) => h.id !== id),
        { id, expires },
      ]);
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: `${((username || id)?.slice(0, 10) || "").substring(
            0,
            10
          )} поднял(а) руку`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 3500);
    });

    socket.on("screen-share-started", ({ id, username }) => {
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: `${((username || id)?.slice(0, 10) || "").substring(
            0,
            10
          )} начал(а) демонстрировать экран`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
    });

    socket.on("screen-share-stopped", ({ id, username }) => {
      setRemoteStreams((prev) => {
        const ms = prev[id];
        if (!ms) return prev;
        const audio = ms.getAudioTracks();
        const ns = new MediaStream([...audio]);
        return { ...prev, [id]: ns };
      });
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: `${((username || id)?.slice(0, 10) || "").substring(
            0,
            10
          )} перестал(а) демонстрировать экран`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
    });
    socket.on("chat-message", (msg) => {
      const baseKey =
        (msg.username || msg.id) + ":" + msg.ts + ":" + (msg.text || "");
      if (chatMsgIdsRef.current.has(baseKey)) return; // already optimistic or received
      chatMsgIdsRef.current.add(baseKey);
      setChatMessages((prev) => {
        if (
          prev.some(
            (m) => m.id === msg.id && m.ts === msg.ts && m.text === msg.text
          )
        )
          return prev;
        return [...prev, msg];
      });
      setChatUnread((u) => (chatOpen ? u : u + 1));
    });
    socket.on("chat-history", (history) => {
      const list = history || [];
      list.forEach((m) =>
        chatMsgIdsRef.current.add(
          (m.username || m.id) + ":" + m.ts + ":" + (m.text || "")
        )
      );
      setChatMessages(list);
    });

    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket._appListenersAdded = false;
      }
    };
  }, [screen, chatOpen]); // Add screen dependency

  useEffect(() => {
    const memberIds = new Set(members.map((m) => m.id));
    setRemoteStreams((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (!memberIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setRemoteLevels((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (!memberIds.has(id)) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [members]);

  // Device initialization - load available devices on mount
  useEffect(() => {
    const initializeDevices = async () => {
      try {
        const devices = await getUserDevices();
        setAudioDevices(devices.audioInput);
        setVideoDevices(devices.videoInput);
        setOutputDevices(devices.audioOutput);

        // Set current devices from getUserMedia constraints or first available
        if (devices.audioInput.length > 0 && !currentAudioDevice) {
          setCurrentAudioDevice(devices.audioInput[0].deviceId);
        }
        if (devices.videoInput.length > 0 && !currentVideoDevice) {
          setCurrentVideoDevice(devices.videoInput[0].deviceId);
        }
        if (devices.audioOutput.length > 0 && !currentOutputDevice) {
          setCurrentOutputDevice(devices.audioOutput[0].deviceId);
        }
      } catch (error) {
        console.warn("Failed to initialize devices:", error);
      }
    };

    if (screen === "precall" || screen === "call") {
      initializeDevices();
    }
  }, [screen, currentAudioDevice, currentVideoDevice, currentOutputDevice]);

  useEffect(() => {
    if (!handSignals.length) return; // nothing active
    const t = setInterval(() => {
      const now = Date.now();
      setHandSignals((list) => list.filter((h) => h.expires > now));
    }, 1000);
    return () => clearInterval(t);
  }, [handSignals]);

  useEffect(() => {
    if (screen === "lobby") {
      const name = tempName.trim();
      setUsername(name); // keep applied
      const socket = getSocket();
      if (roomId && socket)
        socket.emit("set-username", roomId, name || socket.id);
    }
  }, [tempName, screen, roomId]);

  useEffect(() => {
    const prev = prevMembersRef.current || [];
    const prevIds = prev.map((p) => p.id);
    const currentIds = members.map((m) => m.id);
    const added = members.filter((m) => !prevIds.includes(m.id));
    const removed = prev.filter((m) => !currentIds.includes(m.id));

    added.forEach((member) => {
      const id = member.id;
      const socket = getSocket();
      if (id === socket?.id) return;
      const msg = `${
        (member.name || id)?.slice(0, 10)?.substring(0, 10) || ""
      } присоединился`;
      setNotifications((n) => [
        ...n,
        { id: Date.now() + Math.random(), text: msg },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
      (async () => {
        try {
          if (pcs.current[id]) return;
          const pc = createPeerConnectionForId(id);

          // Add local tracks first
          try {
            addLocalTracksToPC(pc);
          } catch (e) {
            console.warn("Failed to add tracks to new PC:", e);
          }

          await new Promise((resolve) => setTimeout(resolve, 100));

          if (pc.signalingState === "stable" && !makingOfferRef.current[id]) {
            makingOfferRef.current[id] = true;
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              if (socket) socket.emit("offer-to", id, offer);
            } catch (offerError) {
              console.warn("Failed to create/send offer:", offerError);
            }
            makingOfferRef.current[id] = false;
          }
        } catch (e) {
          console.warn("auto-offer failed", e);
          makingOfferRef.current[id] = false;
        }
      })();
    });

    removed.forEach((member) => {
      const id = member.id;
      const msg = `${
        (member.name || id)?.slice(0, 10)?.substring(0, 10) || ""
      } вышел`;
      setNotifications((n) => [
        ...n,
        { id: Date.now() + Math.random(), text: msg },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
    });

    // cleanup for removed peers
    removed.forEach((member) => {
      const id = member.id;
      setRemoteStreams((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      setRemoteLevels((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      const a = remoteAnalyzersRef.current[id];
      if (a) {
        try {
          if (a.raf) cancelAnimationFrame(a.raf);
        } catch (e) {}
        try {
          a.source.disconnect();
        } catch (e) {}
        try {
          a.analyser.disconnect();
        } catch (e) {}
        delete remoteAnalyzersRef.current[id];
      }
      if (pcs.current[id]) {
        try {
          pcs.current[id].close();
        } catch (e) {}
        delete pcs.current[id];
      }
    });

    prevMembersRef.current = members;
  }, [members]);

  useEffect(() => {
    if (localVideo.current) {
      localVideo.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    const hasRemote = Object.keys(remoteStreams).some((k) => {
      const s = remoteStreams[k];
      return s && s.getTracks && s.getTracks().length > 0;
    });
    setRemotePresent(hasRemote);
  }, [remoteStreams]);
  useEffect(() => {
    const interval = setInterval(() => {
      setRemoteStreams((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(prev).forEach(([pid, ms]) => {
          if (!ms) return;
          const vids = ms.getVideoTracks();
          if (!vids.length) return;
          const live = vids.filter((t) => t.readyState === "live" && t.enabled);
          if (live.length !== vids.length) {
            const newStream = new MediaStream([
              ...live,
              ...ms.getAudioTracks(),
            ]);
            next[pid] = newStream;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // cleanup analyzers/audiocontext on unmount
  useEffect(() => {
    return () => {
      Object.values(remoteAnalyzersRef.current || {}).forEach((a) => {
        try {
          if (a.raf) cancelAnimationFrame(a.raf);
        } catch (e) {}
        try {
          a.source.disconnect();
        } catch (e) {}
        try {
          a.analyser.disconnect();
        } catch (e) {}
      });
      remoteAnalyzersRef.current = {};
      try {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      } catch (e) {}
      try {
        if (audioContextRef.current) audioContextRef.current.close();
      } catch (e) {}
    };
  }, []);

  const createPeerConnectionForId = (id) => {
    return createPeerConnectionFor(
      id,
      getSocket,
      politeRef,
      pcs,
      setRemoteStreams,
      (id, streamObj) =>
        setupRemoteAnalyser(
          id,
          streamObj,
          remoteAnalyzersRef,
          audioContextRef,
          setRemoteLevels
        ),
      (id, streamObj) => watchRemoteStream(id, streamObj, setRemoteStreams)
    );
  };

  const renegotiateWithPeer = (peerId) => {
    return renegotiateWith(peerId, pcs, getSocket);
  };

  const addLocalTracksToPC = (pc) => {
    return addLocalTracksToPc(
      pc,
      localAudioTrackRef,
      localVideoTrackRef,
      sharing,
      screenTrackRef
    );
  };

  const handleOfferFromPeer = (id, description) => {
    return handleOffer(
      id,
      description,
      pcs,
      createPeerConnectionForId,
      politeRef,
      makingOfferRef,
      ignoreOfferRef,
      addLocalTracksToPC,
      getSocket
    );
  };

  // Media control functions
  const toggleMic = createMicToggler(
    micOn,
    setMicOn,
    localAudioTrackRef,
    stream,
    setStream,
    audioContextRef,
    analyserRef,
    sourceRef,
    gainNodeRef,
    rafRef,
    setMicLevel,
    volume,
    pcs,
    renegotiateWithPeer,
    roomId,
    getSocket
  );

  const toggleCam = createCamToggler(
    camOn,
    setCamOn,
    localVideoTrackRef,
    stream,
    setStream,
    localVideo,
    pcs,
    renegotiateWithPeer
  );

  const toggleScreenShare = createScreenShareToggler(
    sharing,
    setSharing,
    screenTrackRef,
    pcs,
    renegotiateWithPeer,
    localVideoTrackRef,
    camOn,
    setCamOn,
    stream,
    setStream,
    roomId,
    getSocket
  );

  const switchCamera = createCameraSwitcher(
    camOn,
    localVideoTrackRef,
    stream,
    setStream,
    pcs,
    renegotiateWithPeer
  );

  // Device selection handlers
  const handleAudioDeviceSelect = async (deviceId) => {
    try {
      await switchToDevice(deviceId, "audio", {
        stream,
        setStream,
        localAudioTrackRef,
        localVideoTrackRef,
        pcs: pcs.current,
        renegotiateWithPeer: renegotiateWithPeer,
      });
      setCurrentAudioDevice(deviceId);
    } catch (error) {
      console.error("Failed to switch audio device:", error);
    }
  };

  const handleVideoDeviceSelect = async (deviceId) => {
    try {
      await switchToDevice(deviceId, "video", {
        stream,
        setStream,
        localAudioTrackRef,
        localVideoTrackRef,
        pcs: pcs.current,
        renegotiateWithPeer: renegotiateWithPeer,
        localVideo: localVideo.current,
      });
      setCurrentVideoDevice(deviceId);
    } catch (error) {
      console.error("Failed to switch video device:", error);
    }
  };

  const handleOutputDeviceSelect = async (deviceId) => {
    try {
      setCurrentOutputDevice(deviceId);
      // Note: Output device switching would need additional implementation
      // for existing audio elements if we had remote audio elements
    } catch (error) {
      console.error("Failed to switch output device:", error);
    }
  };

  useEffect(() => {
    if (screen !== "join") return;

    // Try to get room ID from current URL
    const url = new URL(window.location.href);
    const pathname = url.pathname.slice(1); // Remove leading "/"
    const searchRoom = url.searchParams.get("room"); // Fallback to old format
    const hashRoom = window.location.hash.replace("#", ""); // Legacy hash format

    const potentialRoomId = pathname || searchRoom || hashRoom;
    const parsedRoomId = parseRoomId(potentialRoomId);

    if (parsedRoomId && !roomId) {
      setRoomId(parsedRoomId);
      setScreen("precall");
    }
  }, [screen, roomId]);

  const createRoom = () => {
    // Always generate a new room ID
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setAutoCreated(true);
    setErrors({ roomId: "" });

    try {
      // Set clean URL format: /roomId instead of /?room=roomId
      window.history.replaceState({}, "", `/${newRoomId}`);
    } catch (e) {}

    setScreen("precall");
  };

  const joinRoom = async () => {
    let target = parseRoomId(roomId);

    if (!target) {
      // No valid room ID provided, generate a new one
      target = generateRoomId();
      setRoomId(target);
      setAutoCreated(true);
    } else if (!isValidRoomId(target)) {
      // Invalid format
      setErrors({ roomId: "Неверный формат ID комнаты" });
      return;
    } else {
      // Check if room exists (for user feedback)
      try {
        const roomCheck = await checkRoomExists(target);
        if (roomCheck.error) {
          console.warn("Room check error:", roomCheck.error);
          // Continue anyway, server will handle it
        }
        if (!roomCheck.exists && !roomCheck.wasCreated) {
          setAutoCreated(true); // Will create new room
        }
      } catch (e) {
        console.warn("Room validation failed:", e);
        // Continue anyway
      }
    }

    setRoomId(target);
    setErrors({ roomId: "" });

    try {
      // Set clean URL format: /roomId instead of /?room=roomId
      window.history.replaceState({}, "", `/${target}`);
    } catch (e) {}

    setScreen("precall");
  };

  const handlePrecallStart = async () => {
    if (localVideo.current && stream) localVideo.current.srcObject = stream;
    setScreen("lobby");
  };

  const applyUsername = () => {
    const socket = getSocket();
    const finalName = (
      tempName.trim() ||
      username.trim() ||
      socket?.id ||
      "user"
    ).slice(0, 10);
    setUsername(finalName);
    if (socket) socket.emit("set-username", roomId, finalName);
  };

  const startCall = async () => {
    // Set up video stream for the call screen if not already done
    if (localVideo.current && stream) localVideo.current.srcObject = stream;

    // Ensure socket is connected
    const socket = getSocket();
    if (!socket || !socket.connected) {
      console.error("❌ Socket not connected when trying to start call");
      return;
    }

    // Apply username from tempName (or use fallback)
    const finalName = (
      tempName.trim() ||
      username.trim() ||
      socket.id ||
      "user"
    ).slice(0, 10);
    setUsername(finalName);
    socket.emit("set-username", roomId, finalName);

    // Join the room and establish peer connections
    socket.emit("join", roomId, finalName);
    const targetIds = members.map((m) => m.id).filter((id) => id !== socket.id);
    for (const memberId of targetIds) {
      const pc = createPeerConnectionForId(memberId);
      try {
        addLocalTracksToPC(pc);
      } catch (e) {}
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (socket) socket.emit("offer-to", memberId, offer);
    }
    setScreen("call");
    setCallStartTs(Date.now());
    if (roomId && socket) {
      try {
        socket.emit("chat-get-history", roomId);
      } catch (e) {}
    }
  };

  // Room control functions
  const toggleRoomLock = () => {
    if (!roomId) return;
    const socket = getSocket();
    if (socket) socket.emit("set-room-locked", roomId, !roomLocked);
  };

  const raiseHand = () => {
    const socket = getSocket();
    if (roomId && socket) socket.emit("raise-hand", roomId);
  };
  const sendChat = () => {
    if (!roomId) return;
    const text = chatInput.trim();
    if (!text) return;
    const ts = Date.now();
    const socket = getSocket();
    const optimistic = {
      id: socket?.id || "user",
      name: username || socket?.id || "user",
      text,
      ts,
      _local: true,
      _c: ++localMsgCounterRef.current,
    };
    const baseKey = optimistic.id + ":" + optimistic.ts + ":" + optimistic.text;
    chatMsgIdsRef.current.add(baseKey); // mark so echo from server is ignored
    setChatMessages((prev) => [...prev, optimistic]);
    try {
      if (socket) socket.emit("chat-send", roomId, text, ts);
    } catch (e) {
      console.warn("chat-send failed", e);
    }
    setChatInput("");
  };

  const handleLeave = () => {
    try {
      const socket = getSocket();
      if (socket) socket.emit("leave", roomId);
    } catch (e) {}
    Object.values(pcs.current).forEach((pc) => {
      try {
        pc.close();
      } catch (e) {}
    });
    pcs.current = {};
    setRemoteStreams({});
    setMembers([]);

    // Disconnect socket when leaving
    disconnectSocket();

    setScreen("join");
    try {
      window.history.replaceState({}, "", window.location.origin + "/");
      setRoomId("");
    } catch (_) {}
  };
  useEffect(() => {
    if (chatOpen) {
      setChatUnread(0);

      // Function to scroll to bottom
      const scrollToBottom = () => {
        const el = chatEndRef.current;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "end" });
        }

        // Mobile container scrolling
        const mc = chatMobileContainerRef.current;
        if (mc) {
          mc.scrollTo({ top: mc.scrollHeight, behavior: "smooth" });
        }

        // Desktop container scrolling
        const dc = chatDesktopContainerRef.current;
        if (dc) {
          dc.scrollTo({ top: dc.scrollHeight, behavior: "smooth" });
        }
      };

      // Immediate scroll attempt
      scrollToBottom();

      // Delayed scroll to account for animation/layout changes
      const timeouts = [
        setTimeout(scrollToBottom, 100),
        setTimeout(scrollToBottom, 300),
        setTimeout(() => {
          // Final scroll with 'auto' behavior as fallback
          const mc = chatMobileContainerRef.current;
          if (mc) {
            mc.scrollTo({ top: mc.scrollHeight, behavior: "auto" });
          }
          const dc = chatDesktopContainerRef.current;
          if (dc) {
            dc.scrollTo({ top: dc.scrollHeight, behavior: "auto" });
          }
        }, 500),
      ];

      return () => {
        timeouts.forEach(clearTimeout);
      };
    }
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && roomId && !chatHistoryRequestedRef.current) {
      try {
        const socket = getSocket();
        if (socket) socket.emit("chat-get-history", roomId);
        chatHistoryRequestedRef.current = true;
      } catch (e) {}
    }
  }, [chatOpen, roomId]);

  useEffect(() => {
    if (!chatOpen) return;

    // Function to scroll to bottom
    const scrollToBottom = () => {
      const el = chatEndRef.current;
      if (el) {
        try {
          el.scrollIntoView({ behavior: "smooth", block: "end" });
        } catch (_) {}
      }

      // Mobile container scrolling
      const mc = chatMobileContainerRef.current;
      if (mc) {
        try {
          mc.scrollTo({ top: mc.scrollHeight, behavior: "smooth" });
        } catch (_) {}
      }

      // Desktop container scrolling
      const dc = chatDesktopContainerRef.current;
      if (dc) {
        try {
          dc.scrollTo({ top: dc.scrollHeight, behavior: "smooth" });
        } catch (_) {}
      }
    };

    // Scroll with delays to account for layout settling
    scrollToBottom();
    const timeout1 = setTimeout(scrollToBottom, 100);
    const timeout2 = setTimeout(() => {
      // Final fallback with auto behavior
      const mc = chatMobileContainerRef.current;
      if (mc) {
        try {
          mc.scrollTo({ top: mc.scrollHeight, behavior: "auto" });
        } catch (_) {}
      }
      const dc = chatDesktopContainerRef.current;
      if (dc) {
        try {
          dc.scrollTo({ top: dc.scrollHeight, behavior: "auto" });
        } catch (_) {}
      }
    }, 300);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, [chatMessages, chatOpen]);

  if (screen === "join") {
    return <JoinScreen createRoom={createRoom} />;
  }

  if (screen === "precall") {
    return (
      <PrecallScreen
        micOn={micOn}
        camOn={camOn}
        micLevel={micLevel}
        toggleMic={toggleMic}
        toggleCam={toggleCam}
        localVideo={localVideo}
        stream={stream}
        startCall={startCall}
        roomId={roomId}
        tempName={tempName}
        setTempName={setTempName}
        audioDevices={audioDevices}
        videoDevices={videoDevices}
        currentAudioDevice={currentAudioDevice}
        currentVideoDevice={currentVideoDevice}
        onAudioDeviceSelect={handleAudioDeviceSelect}
        onVideoDeviceSelect={handleVideoDeviceSelect}
      />
    );
  }

  if (screen === "lobby") {
    return (
      <LobbyScreen
        roomId={roomId}
        tempName={tempName}
        setTempName={setTempName}
        startCall={startCall}
      />
    );
  }

  if (screen === "call") {
    return (
      <CallScreen
        members={members}
        remoteStreams={remoteStreams}
        stream={stream}
        username={username}
        micLevel={micLevel}
        remoteLevels={remoteLevels}
        handSignals={handSignals}
        micOn={micOn}
        camOn={camOn}
        sharing={sharing}
        toggleMic={toggleMic}
        toggleCam={toggleCam}
        switchCamera={switchCamera}
        toggleScreenShare={toggleScreenShare}
        roomId={roomId}
        roomLocked={roomLocked}
        toggleRoomLock={toggleRoomLock}
        raiseHand={raiseHand}
        notifications={notifications}
        setNotifications={setNotifications}
        shareLinkFlipTs={shareLinkFlipTs}
        setShareLinkFlipTs={setShareLinkFlipTs}
        participantsOpen={participantsOpen}
        setParticipantsOpen={setParticipantsOpen}
        isMobile={isMobile}
        isTablet={isTablet}
        toolsOpen={toolsOpen}
        setToolsOpen={setToolsOpen}
        showMicPopover={showMicPopover}
        setShowMicPopover={setShowMicPopover}
        volume={volume}
        setVolume={setVolume}
        gainNodeRef={gainNodeRef}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        chatUnread={chatUnread}
        setChatUnread={setChatUnread}
        chatMessages={chatMessages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        sendChat={sendChat}
        chatEndRef={chatEndRef}
        chatMobileContainerRef={chatMobileContainerRef}
        chatDesktopContainerRef={chatDesktopContainerRef}
        elapsed={elapsed}
        remainingMs={remainingMs}
        onLeave={handleLeave}
        pcs={pcs}
        setRemoteStreams={setRemoteStreams}
        setMembers={setMembers}
        deviceSettingsOpen={deviceSettingsOpen}
        onDeviceSettingsOpen={() => setDeviceSettingsOpen(true)}
        onDeviceSettingsClose={() => setDeviceSettingsOpen(false)}
        audioDevices={audioDevices}
        videoDevices={videoDevices}
        outputDevices={outputDevices}
        currentAudioDevice={currentAudioDevice}
        currentVideoDevice={currentVideoDevice}
        currentOutputDevice={currentOutputDevice}
        onAudioDeviceSelect={handleAudioDeviceSelect}
        onVideoDeviceSelect={handleVideoDeviceSelect}
        onOutputDeviceSelect={handleOutputDeviceSelect}
      />
    );
  }

  return null;
}

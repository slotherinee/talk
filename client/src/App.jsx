import React, { useState, useRef, useEffect } from "react";
import io from "socket.io-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  LogOut,
  Share2,
  User,
  MonitorUp,
  Users,
  Lock,
  Unlock,
  Hand,
  Settings,
  X,
  MessageSquare,
  ChevronUp,
} from "lucide-react";

function Input(props) {
  return (
    <input
      {...props}
      className={
        `w-full mb-4 text-white bg-transparent border border-neutral-800 placeholder:text-neutral-500 focus:ring-2 focus:ring-neutral-600 rounded-lg px-4 py-2 ` +
        (props.className || "")
      }
    />
  );
}

function Button({ children, className = "", variant = "default", ...rest }) {
  let base =
    "py-2 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ";
  let color = "";
  if (variant === "default")
    color = "bg-neutral-800 text-white hover:bg-neutral-700";
  else if (variant === "outline")
    color =
      "bg-transparent text-neutral-200 border border-neutral-600 hover:bg-neutral-900";
  else if (variant === "destructive")
    color = "bg-red-600 text-white hover:bg-red-700";
  return (
    <button className={base + color + " " + className} {...rest}>
      {children}
    </button>
  );
}

function MicActivityDot({ level, muted, className = "", size = 20 }) {
  const displayedRef = useRef(0);
  const [frame, setFrame] = useState(0); // trigger re-render for animation
  const lastRippleRef = useRef(0);
  const [ripples, setRipples] = useState([]); // store ripple ids

  useEffect(() => {
    let raf;
    const loop = () => {
      const target = Math.min(1, (level || 0) * 1.5);
      const current =
        displayedRef.current + (target - displayedRef.current) * 0.18; // easing
      displayedRef.current = current;
      setFrame((f) => f + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [level]);

  const val = displayedRef.current;
  const speaking = val > 0.22; // post-smoothing threshold
  const intense = val > 0.55;
  const veryIntense = val > 0.75;

  useEffect(() => {
    if (speaking) {
      const now = performance.now();
      if (now - lastRippleRef.current > 550) {
        lastRippleRef.current = now;
        setRipples((r) => [
          ...r.filter((x) => now - x.time < 1200),
          { id: now + Math.random(), time: now },
        ]);
      }
    }
  }, [speaking, frame]);

  // color logic
  const baseIdle = muted ? "#52525b" : "#155dfc";
  const baseSpeaking = muted ? "#dc2626" : "#3b82f6";
  const core = speaking ? baseSpeaking : baseIdle;
  const glowColor =
    muted && speaking
      ? "rgba(220,38,38,0.55)"
      : speaking
      ? "rgba(59,130,246,0.55)"
      : "rgba(59,130,246,0)";
  const shadow = speaking
    ? `0 0 ${4 + val * 6}px ${1 + val * 3}px ${glowColor}, 0 0 ${
        10 + val * 14
      }px ${2 + val * 4}px ${glowColor}`
    : "none";
  const scale = 1 + (speaking ? 0.08 + val * 0.25 : 0);

  useEffect(() => {
    if (document.getElementById("mic-ripple-style")) return;
    const style = document.createElement("style");
    style.id = "mic-ripple-style";
    style.textContent = `@keyframes micRipple{0%{transform:scale(.75);opacity:.35}65%{opacity:.10}100%{transform:scale(1.75);opacity:0}}`;
    document.head.appendChild(style);
  }, []);

  return (
    <div
      className={"relative flex items-center justify-center " + className}
      aria-label={
        muted
          ? speaking
            ? "Speaking (muted)"
            : "Muted"
          : speaking
          ? "Speaking"
          : "Mic on"
      }
      style={{ width: size, height: size }}
    >
      {ripples.map((r) => (
        <span
          key={r.id}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            animation: `micRipple ${950 + val * 420}ms ease-out`,
            background: glowColor,
            mixBlendMode: "plus-lighter",
            filter: "blur(1.5px)",
          }}
        />
      ))}
      <span
        className="rounded-full transition-all duration-150"
        style={{
          width: size - 8,
          height: size - 8,
          transform: `scale(${scale})`,
          background: core,
          boxShadow: shadow,
          outline: veryIntense
            ? `1px solid ${core}AA`
            : intense
            ? `1px solid ${core}55`
            : "1px solid transparent",
        }}
      />
    </div>
  );
}

const socket = (() => {
  if (typeof window !== "undefined") {
    if (window.__APP_SOCKET__) return window.__APP_SOCKET__;
    const s = io("http://localhost:3000");
    window.__APP_SOCKET__ = s;
    return s;
  }
  return io("http://localhost:3000");
})();

function useMountTransition(open, ms) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open && !mounted) setMounted(true);
    if (!open && mounted) {
      const t = setTimeout(() => setMounted(false), ms);
      return () => clearTimeout(t);
    }
  }, [open, mounted, ms]);
  return mounted;
}

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
      async (id, description) => await handleOffer(id, description)
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
    socket.on("raise-hand", ({ id }) => {
      const expires = Date.now() + 3500;
      setHandSignals((prev) => [
        ...prev.filter((h) => h.id !== id),
        { id, expires },
      ]);
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: `${id.substring(0, 6)} поднял(а) руку`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 3500);
    });

    socket.on("screen-share-started", ({ id }) => {
      setNotifications((n) => [
        ...n,
        {
          id: Date.now() + Math.random(),
          text: `${id.substring(0, 6)} начал(а) демонстрировать экран`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
    });

    socket.on("screen-share-stopped", ({ id }) => {
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
          text: `${id.substring(0, 6)} перестал(а) демонстрировать экран`,
        },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
    });
    socket.on("chat-message", (msg) => {
      const baseKey = msg.id + ":" + msg.ts + ":" + (msg.text || "");
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
        chatMsgIdsRef.current.add(m.id + ":" + m.ts + ":" + (m.text || ""))
      );
      setChatMessages(list);
    });
    return () => {};
  }, []);

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
      if (roomId) socket.emit("set-username", roomId, name || socket.id);
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
      if (id === socket.id) return;
      const msg = `${member.name || id.substring(0, 6)} присоединился`;
      setNotifications((n) => [
        ...n,
        { id: Date.now() + Math.random(), text: msg },
      ]);
      setTimeout(() => setNotifications((n) => n.slice(1)), 4000);
      (async () => {
        try {
          if (pcs.current[id]) return;
          const pc = createPeerConnectionFor(id);
          try {
            addLocalTracksToPc(pc);
          } catch (e) {}
          if (pc.signalingState === "stable" && !makingOfferRef.current[id]) {
            makingOfferRef.current[id] = true;
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer-to", id, offer);
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
      const msg = `${member.name || id.substring(0, 6)} вышел`;
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

  const createPeerConnectionFor = (id) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    // polite determination: deterministic by comparing ids
    politeRef.current[id] = String(socket.id) < String(id);
    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("candidate-to", id, e.candidate);
    };
    pc.ontrack = (e) => {
      setRemoteStreams((prev) => {
        let peerStream = prev[id] || new MediaStream();
        if (
          e.track &&
          !peerStream.getTracks().some((t) => t.id === e.track.id)
        ) {
          try {
            peerStream.addTrack(e.track);
          } catch (_) {}
        }
        if (peerStream.getAudioTracks().length > 0) {
          try {
            setupRemoteAnalyser(id, peerStream);
          } catch (_) {}
        }
        try {
          watchRemoteStream(id, peerStream);
        } catch (_) {}
        return { ...prev, [id]: peerStream };
      });
    };
    pcs.current[id] = pc;
    return pc;
  };

  const watchRemoteStream = (id, streamObj) => {
    if (!streamObj) return;
    try {
      streamObj.getTracks().forEach((track) => {
        const refresh = () => {
          setRemoteStreams((prev) => {
            const current = prev[id];
            if (!current) return { ...prev };
            const kept = current
              .getTracks()
              .filter(
                (t) =>
                  !(
                    t.kind === "video" &&
                    (t.readyState !== "live" || !t.enabled)
                  )
              );
            if (kept.length !== current.getTracks().length) {
              const newStream = new MediaStream(kept);
              return { ...prev, [id]: newStream };
            }
            return { ...prev };
          });
        };
        track.onmute = refresh;
        track.onunmute = refresh;
        track.onended = refresh;
      });
    } catch (e) {}
  };

  const renegotiateWith = async (peerId) => {
    const pc = pcs.current[peerId];
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer-to", peerId, offer);
    } catch (e) {
      console.warn("renegotiate failed", peerId, e);
    }
  };

  const addLocalTracksToPc = (pc) => {
    if (!pc) return;
    try {
      if (localAudioTrackRef.current) {
        const senders = pc.getSenders();
        const existing = senders.find(
          (s) => s.track && s.track.kind === "audio"
        );
        if (existing) {
          try {
            existing.replaceTrack(localAudioTrackRef.current);
          } catch (e) {}
        } else {
          try {
            pc.addTrack(
              localAudioTrackRef.current,
              new MediaStream([localAudioTrackRef.current])
            );
          } catch (e) {}
        }
      }
      const activeVideoTrack =
        sharing && screenTrackRef.current
          ? screenTrackRef.current
          : localVideoTrackRef.current && localVideoTrackRef.current.enabled
          ? localVideoTrackRef.current
          : null;
      if (activeVideoTrack) {
        const senders = pc.getSenders();
        const existing = senders.find(
          (s) => s.track && s.track.kind === "video"
        );
        if (existing) {
          try {
            existing.replaceTrack(activeVideoTrack);
          } catch (e) {}
        } else {
          try {
            pc.addTrack(activeVideoTrack, new MediaStream([activeVideoTrack]));
          } catch (e) {}
        }
      }
    } catch (e) {
      console.warn("addLocalTracksToPc failed", e);
    }
  };

  const setupRemoteAnalyser = (id, streamObj) => {
    const existing = remoteAnalyzersRef.current[id];
    if (existing) {
      if (existing.raf) cancelAnimationFrame(existing.raf);
      try {
        existing.source.disconnect();
      } catch (e) {}
      try {
        existing.analyser.disconnect();
      } catch (e) {}
      delete remoteAnalyzersRef.current[id];
    }
    if (!streamObj) return;
    const audioTracks = streamObj.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) return;
    if (!audioContextRef.current)
      audioContextRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    const ac = audioContextRef.current;
    const src = ac.createMediaStreamSource(new MediaStream([audioTracks[0]]));
    const analyser = ac.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const loop = () => {
      const bufferLength = analyser.frequencyBinCount;
      const data = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length) / 255;
      setRemoteLevels((prev) => ({ ...prev, [id]: rms }));
      remoteAnalyzersRef.current[id].raf = requestAnimationFrame(loop);
    };
    remoteAnalyzersRef.current[id] = { source: src, analyser, raf: null };
    remoteAnalyzersRef.current[id].raf = requestAnimationFrame(loop);
  };

  const handleOffer = async (id, description) => {
    let pc = pcs.current[id];
    if (!pc) pc = createPeerConnectionFor(id);
    const polite = politeRef.current[id];
    const offerCollision =
      makingOfferRef.current[id] || pc.signalingState !== "stable";
    if (offerCollision && !polite) {
      console.warn("Offer collision, ignoring offer from", id);
      return;
    }
    ignoreOfferRef.current[id] = false;
    try {
      await pc.setRemoteDescription(description);
      try {
        addLocalTracksToPc(pc);
      } catch (e) {}
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", id, answer);
    } catch (e) {
      console.warn("handleOffer failed", e);
    }
  };

  // Toggle microphone: manage tracks and audio analyser for level feedback
  const toggleMic = async () => {
    if (!micOn) {
      try {
        let micTrack = localAudioTrackRef.current;
        if (!micTrack) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          micTrack = micStream.getAudioTracks()[0];
          localAudioTrackRef.current = micTrack;
          const newStream = stream ? stream : new MediaStream();
          try {
            newStream.addTrack(micTrack);
          } catch (e) {}
          setStream(newStream);
        } else {
          micTrack.enabled = true;
          if (stream && !stream.getAudioTracks().includes(micTrack)) {
            try {
              stream.addTrack(micTrack);
            } catch (e) {}
            setStream(stream);
          }
        }

        if (!audioContextRef.current) {
          const ac = new (window.AudioContext || window.webkitAudioContext)();
          audioContextRef.current = ac;
        }
        const ac = audioContextRef.current;
        const src = ac.createMediaStreamSource(new MediaStream([micTrack]));
        const gain = ac.createGain();
        gain.gain.value = volume / 100;
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        src.connect(gain);
        gain.connect(analyser);
        analyserRef.current = analyser;
        sourceRef.current = src;
        gainNodeRef.current = gain;

        // start measuring
        const update = () => {
          const bufferLength = analyser.frequencyBinCount;
          const data = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(data);
          // compute RMS-ish level
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / data.length) / 255;
          setMicLevel(rms);
          rafRef.current = requestAnimationFrame(update);
        };
        rafRef.current = requestAnimationFrame(update);

        Object.entries(pcs.current).forEach(([peerId, pc]) => {
          try {
            const senders = pc.getSenders();
            const audioSender = senders.find(
              (s) => s.track && s.track.kind === "audio"
            );
            if (audioSender) {
              audioSender
                .replaceTrack(localAudioTrackRef.current)
                .catch(() => {});
            } else {
              try {
                pc.addTrack(
                  localAudioTrackRef.current,
                  new MediaStream([localAudioTrackRef.current])
                );
                renegotiateWith(peerId);
              } catch (e) {
                console.warn("addTrack audio failed", e);
              }
            }
          } catch (e) {
            console.warn("pc audio update failed", e);
          }
        });
        setMicOn(true);
        if (roomId) socket.emit("set-muted", roomId, false);
        // ensure peers renegotiate if needed
        setTimeout(() => {
          Object.keys(pcs.current).forEach((id) => renegotiateWith(id));
        }, 200);
      } catch (e) {
        console.error("Mic access error", e);
      }
    } else {
      if (stream) {
        if (localAudioTrackRef.current)
          localAudioTrackRef.current.enabled = false;
      }
      Object.values(pcs.current).forEach((pc) => {
        try {
          const senders = pc.getSenders();
          const audioSender = senders.find(
            (s) => s.track && s.track.kind === "audio"
          );
          if (audioSender && audioSender.track) {
            try {
              audioSender.track.enabled = false;
            } catch (e) {}
          }
        } catch (e) {}
      });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (sourceRef.current)
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
      if (gainNodeRef.current)
        try {
          gainNodeRef.current.disconnect();
        } catch (e) {}
      if (analyserRef.current)
        try {
          analyserRef.current.disconnect();
        } catch (e) {}
      setMicLevel(0);
      setMicOn(false);
      if (roomId) socket.emit("set-muted", roomId, true);
    }
  };

  const toggleCam = async () => {
    if (!camOn) {
      try {
        let camTrack = localVideoTrackRef.current;
        if (!camTrack) {
          const camStream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 360 },
          });
          camTrack = camStream.getVideoTracks()[0];
          localVideoTrackRef.current = camTrack;
          const newStream = stream ? stream : new MediaStream();
          try {
            newStream.addTrack(camTrack);
          } catch (e) {}
          setStream(newStream);
          if (localVideo.current) localVideo.current.srcObject = newStream;
        } else {
          camTrack.enabled = true;
        }

        Object.entries(pcs.current).forEach(([peerId, pc]) => {
          try {
            const senders = pc.getSenders();
            const videoSender = senders.find(
              (s) => s.track && s.track.kind === "video"
            );
            if (videoSender) {
              videoSender
                .replaceTrack(localVideoTrackRef.current)
                .catch(() => {});
            } else {
              try {
                pc.addTrack(
                  localVideoTrackRef.current,
                  new MediaStream([localVideoTrackRef.current])
                );
                renegotiateWith(peerId);
              } catch (e) {
                console.warn("addTrack video failed", e);
              }
            }
          } catch (e) {
            console.warn("pc video update failed", e);
          }
        });
        setCamOn(true);
        setTimeout(() => {
          Object.keys(pcs.current).forEach((id) => renegotiateWith(id));
        }, 200);
      } catch (e) {
        console.error("Camera access error", e);
      }
    } else {
      if (stream) {
        if (localVideoTrackRef.current)
          localVideoTrackRef.current.enabled = false;
        if (localVideo.current) {
          localVideo.current.srcObject = stream;
        }
      }
      Object.values(pcs.current).forEach((pc) => {
        try {
          const senders = pc.getSenders();
          const videoSender = senders.find(
            (s) => s.track && s.track.kind === "video"
          );
          if (videoSender && videoSender.track)
            try {
              videoSender.track.enabled = false;
            } catch (e) {
              /* ignore */
            }
        } catch (e) {
          /* ignore */
        }
      });
      setCamOn(false);
    }
  };

  useEffect(() => {
    if (screen !== "join") return;
    const url = new URL(window.location.href);
    const rid =
      url.searchParams.get("room") || window.location.hash.replace("#", "");
    if (rid && !roomId) {
      setRoomId(rid);

      socket.emit("join", rid, undefined);
      setScreen("precall");
    }
  }, [screen, roomId]);

  const generateRoomId = () => "r-" + Math.random().toString(36).slice(2, 10);

  const joinRoom = () => {
    let target = roomId.trim();
    if (!target) {
      target = generateRoomId();
      setRoomId(target);
      setAutoCreated(true);
    }
    setErrors({ roomId: "" });
    socket.emit("join", target, undefined);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("room", target);
      window.history.replaceState({}, "", url.toString());
    } catch (e) {}
    setScreen("precall");
  };

  const handlePrecallStart = async () => {
    if (localVideo.current && stream) localVideo.current.srcObject = stream;
    setScreen("lobby");
  };

  const applyUsername = () => {
    const finalName = tempName.trim() || username.trim() || socket.id;
    setUsername(finalName);
    socket.emit("set-username", roomId, finalName);
  };

  const startCall = async () => {
    if (!username.trim()) applyUsername();
    const targetIds = members.map((m) => m.id).filter((id) => id !== socket.id);
    for (const memberId of targetIds) {
      const pc = createPeerConnectionFor(memberId);
      try {
        addLocalTracksToPc(pc);
      } catch (e) {}
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer-to", memberId, offer);
    }
    setScreen("call");
    setCallStartTs(Date.now());
    if (roomId) {
      try {
        socket.emit("chat-get-history", roomId);
      } catch (e) {}
    }
  };

  const stopScreenShare = () => {
    const oldTrack = screenTrackRef.current;
    if (oldTrack) {
      try {
        oldTrack.onended = null;
      } catch (e) {}
      try {
        oldTrack.stop();
      } catch (e) {}
      screenTrackRef.current = null;
    }
    Object.entries(pcs.current).forEach(([peerId, pc]) => {
      try {
        const sender = pc
          .getSenders()
          .find((s) => s.track && s.track === oldTrack);
        if (sender) {
          if (
            localVideoTrackRef.current &&
            localVideoTrackRef.current.enabled
          ) {
            try {
              sender.replaceTrack(localVideoTrackRef.current);
            } catch (e) {}
          } else {
            try {
              pc.removeTrack(sender);
            } catch (e) {}
          }
          setTimeout(() => renegotiateWith(peerId), 50);
        }
      } catch (e) {}
    });
    setSharing(false);
    if (roomId) {
      try {
        socket.emit("screen-share-stopped", roomId);
      } catch (_) {}
    }
  };

  const toggleScreenShare = async () => {
    if (!sharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const track = displayStream.getVideoTracks()[0];
        screenTrackRef.current = track;
        track.onended = () => {
          stopScreenShare();
        };
        if (camOn) {
          if (localVideoTrackRef.current) {
            try {
              localVideoTrackRef.current.enabled = false;
            } catch (e) {}
          }
          setCamOn(false);
        }
        Object.entries(pcs.current).forEach(([peerId, pc]) => {
          try {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender) {
              sender.replaceTrack(track).catch(() => {});
            } else {
              try {
                pc.addTrack(track, new MediaStream([track]));
              } catch (e) {}
            }
            setTimeout(() => renegotiateWith(peerId), 80);
          } catch (e) {}
        });
        const newStream = stream
          ? new MediaStream(
              stream.getTracks().filter((t) => t.kind !== "video")
            )
          : new MediaStream();
        try {
          newStream.addTrack(track);
        } catch (e) {}
        setStream(newStream);
        setSharing(true);
        if (roomId) {
          try {
            socket.emit("screen-share-started", roomId);
          } catch (_) {}
        }
      } catch (e) {
        console.warn("display media error", e);
      }
    } else {
      stopScreenShare();
      if (localVideoTrackRef.current) {
        try {
          localVideoTrackRef.current.enabled = true;
        } catch (e) {}
        Object.entries(pcs.current).forEach(([peerId, pc]) => {
          try {
            const sender = pc
              .getSenders()
              .find((s) => s.track && s.track.kind === "video");
            if (sender)
              sender.replaceTrack(localVideoTrackRef.current).catch(() => {});
            else
              pc.addTrack(
                localVideoTrackRef.current,
                new MediaStream([localVideoTrackRef.current])
              );
            setTimeout(() => renegotiateWith(peerId), 80);
          } catch (e) {}
        });
        setCamOn(true);
        const newStream = stream
          ? new MediaStream(
              stream.getTracks().filter((t) => t.kind !== "video")
            )
          : new MediaStream();
        try {
          newStream.addTrack(localVideoTrackRef.current);
        } catch (e) {}
        setStream(newStream);
      }
    }
  };

  const toggleRoomLock = () => {
    if (!roomId) return;
    socket.emit("set-room-locked", roomId, !roomLocked);
  };

  const formatDuration = (ms) => {
    if (ms == null) return "--:--";
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => n.toString().padStart(2, "0");
    return (h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(s);
  };

  const formatRemaining = (ms) => {
    if (ms == null) return "";
    const m = Math.max(0, Math.floor(ms / 60000));
    return m + "м";
  };

  const raiseHand = () => {
    if (roomId) socket.emit("raise-hand", roomId);
  };
  const sendChat = () => {
    if (!roomId) return;
    const text = chatInput.trim();
    if (!text) return;
    const ts = Date.now();
    const optimistic = {
      id: socket.id,
      name: username || socket.id,
      text,
      ts,
      _local: true,
      _c: ++localMsgCounterRef.current,
    };
    const baseKey = optimistic.id + ":" + optimistic.ts + ":" + optimistic.text;
    chatMsgIdsRef.current.add(baseKey); // mark so echo from server is ignored
    setChatMessages((prev) => [...prev, optimistic]);
    try {
      socket.emit("chat-send", roomId, text, ts);
    } catch (e) {
      console.warn("chat-send failed", e);
    }
    setChatInput("");
  };
  useEffect(() => {
    if (chatOpen) setChatUnread(0);
  }, [chatOpen]);

  useEffect(() => {
    if (chatOpen && roomId && !chatHistoryRequestedRef.current) {
      try {
        socket.emit("chat-get-history", roomId);
        chatHistoryRequestedRef.current = true;
      } catch (e) {}
    }
  }, [chatOpen, roomId]);

  useEffect(() => {
    if (!chatOpen) return;
    const el = chatEndRef.current;
    if (el) {
      try {
        el.scrollIntoView({ behavior: "smooth", block: "end" });
      } catch (_) {}
    }
  }, [chatMessages, chatOpen]);

  if (screen === "join") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black px-4">
        <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
          <h1 className="text-3xl font-bold mb-6 text-center text-neutral-100">
            Вход в комнату
          </h1>
          <Input
            type="text"
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />
          {errors.roomId && (
            <div className="text-red-500 text-sm -mt-3 mb-3">
              {errors.roomId}
            </div>
          )}
          <Button className="w-full" onClick={joinRoom}>
            Создать / Войти
          </Button>
          {autoCreated && (
            <div className="text-xs text-neutral-500 mt-3">
              Создана новая комната: {roomId}
            </div>
          )}
          <div className="text-xs text-neutral-600 mt-4">
            Имя укажете позже.
          </div>
        </div>
      </div>
    );
  }

  if (screen === "precall") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black px-4">
        <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
          <h2 className="text-2xl font-bold mb-4 text-neutral-100">
            Настройка перед звонком
          </h2>
          <div className="flex flex-col gap-4 mb-4">
            <div className="flex gap-3 items-center">
              <Button
                variant={micOn ? "default" : "outline"}
                className="w-full"
                onClick={toggleMic}
              >
                {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                Микрофон
                <MicActivityDot level={micLevel} muted={!micOn} />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={camOn ? "default" : "outline"}
                className="w-full"
                onClick={toggleCam}
              >
                {camOn ? (
                  <Video size={16} className="icon-speaking-pulse" />
                ) : (
                  <VideoOff size={16} />
                )}
                {camOn ? "Камера: Вкл" : "Камера: Выкл"}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-medium text-blue-400 flex items-center gap-2">
                <Volume2 size={16} /> Громкость микрофона: {volume}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setVolume(v);
                  if (gainNodeRef.current)
                    gainNodeRef.current.gain.value = v / 100;
                }}
                className="w-full accent-blue-600"
              />
            </div>
          </div>
          <div className="mb-4 flex justify-center">
            {camOn ? (
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                className="w-full h-36 rounded-lg bg-black border border-neutral-800 object-cover"
              />
            ) : (
              <div className="w-full h-36 rounded-lg bg-neutral-800 border border-neutral-800 flex items-center justify-center text-neutral-500">
                Камера выключена
              </div>
            )}
          </div>
          <Button className="w-full" onClick={handlePrecallStart}>
            Продолжить
          </Button>
          <div className="text-xs text-neutral-600 mt-3 break-all">
            Ссылка: {window.location.origin}?room={roomId}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-black px-4">
        <div className="rounded-xl shadow-lg p-8 w-full max-w-xl border border-neutral-800 bg-neutral-900">
          <p className="mb-4 text-lg text-neutral-100">Room: {roomId}</p>
          <Input
            type="text"
            placeholder="Ваше имя (опционально)"
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
          />
          <Button className="w-full" onClick={startCall}>
            Подключиться
          </Button>
          <div className="text-xs text-neutral-600 mt-4 break-all">
            Поделиться ссылкой: {window.location.origin}?room={roomId}
          </div>
        </div>
      </div>
    );
  }

  if (screen === "call") {
    const participants = [
      ...members.filter((m) => m.id !== socket.id).map((m) => m.id),
      socket.id,
    ];
    const count = participants.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    return (
      <div className="min-h-screen min-w-screen bg-black text-neutral-100 relative">
        <div
          className="grid gap-0 w-full h-screen"
          style={{
            gridTemplateColumns: `repeat(${Math.min(
              cols,
              window.innerWidth < 640 ? 2 : cols
            )}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {participants.map((id) => {
            const streamObj = id === socket.id ? stream : remoteStreams[id];
            const key = `p-${id}`;
            const isLocal = id === socket.id;
            const level = isLocal ? micLevel : remoteLevels[id] || 0;
            const speaking = level > 0.18;
            const memberObj = members.find((m) => m.id === id);
            const rawName =
              id === socket.id ? username || "" : memberObj?.name || "";
            const displayName = rawName.trim()
              ? rawName.trim()
              : id.substring(0, 4);
            const muted = id === socket.id ? !micOn : memberObj?.muted ?? false;
            return (
              <div
                key={key}
                className="relative bg-black flex items-center justify-center overflow-hidden w-full h-full"
              >
                {(() => {
                  const hasActiveVideo =
                    streamObj &&
                    streamObj.getVideoTracks &&
                    streamObj
                      .getVideoTracks()
                      .some((t) => t.readyState === "live" && t.enabled);
                  return hasActiveVideo;
                })() ? (
                  <div
                    className={`relative w-full h-full ${
                      speaking ? "ring-4 ring-blue-500/60 ring-offset-0" : ""
                    } ${speaking ? "video-pulse" : ""}`}
                  >
                    <VideoTile stream={streamObj} muted={isLocal} />
                    {handSignals.some((h) => h.id === id) && (
                      <div className="absolute top-2 right-2 bg-amber-500/80 text-black text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 shadow">
                        <span className="hand-wave">
                          <Hand size={14} />
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {streamObj && streamObj.getAudioTracks().length > 0 && (
                      <AudioSink stream={streamObj} muted={isLocal} />
                    )}
                    <div className="text-neutral-400 flex items-center justify-center w-full h-full">
                      <div
                        className={`relative w-24 h-24 rounded-full flex flex-col items-center justify-center text-sm font-semibold px-2 text-center transition-all ${
                          isLocal
                            ? "bg-white/10 border border-white/40 text-white"
                            : "bg-neutral-800"
                        } ${
                          speaking
                            ? "ring-4 ring-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)]"
                            : ""
                        }`}
                      >
                        <User size={24} className="mb-1 opacity-80" />
                        {handSignals.some((h) => h.id === id) && (
                          <div className="absolute -top-3 right-0 translate-x-1/3 bg-white/90 text-black text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow">
                            <span className="hand-wave">
                              <Hand size={12} />
                            </span>
                          </div>
                        )}
                        <span className="text-[10px] mt-0.5 opacity-90 max-w-[5rem] truncate">
                          {displayName}
                        </span>
                      </div>
                    </div>
                  </>
                )}
                {isLocal && (
                  <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full shadow">
                    Вы
                  </div>
                )}
                <div className="absolute bottom-2 left-2 bg-neutral-900/70 text-xs px-2 py-1 rounded flex items-center gap-1">
                  {displayName}
                  {muted && <MicOff size={12} className="text-red-400" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute top-4 right-4">
          <Button
            variant="destructive"
            className="cursor-pointer"
            onClick={() => {
              try {
                socket.emit("leave", roomId);
              } catch (e) {}
              Object.values(pcs.current).forEach((pc) => {
                try {
                  pc.close();
                } catch (e) {}
              });
              pcs.current = {};
              setRemoteStreams({});
              setMembers([]);
              setScreen("join");
              try {
                window.history.replaceState(
                  {},
                  "",
                  window.location.origin + "/"
                );
                setRoomId("");
              } catch (_) {}
            }}
          >
            <LogOut size={14} /> {!isMobile && "Выйти"}
          </Button>
        </div>

        {!isMobile && !isTablet && (
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
            <div className="bg-neutral-900 bg-opacity-90 border border-neutral-800 rounded-full px-2 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 shadow-lg justify-center max-w-fit">
              <div className="relative flex items-center">
                <Button
                  variant={micOn ? "default" : "outline"}
                  onClick={toggleMic}
                  className="!pr-2 h-[34px] cursor-pointer icon-hover-base icon-press transform-gpu"
                >
                  {micOn ? (
                    <Mic
                      size={16}
                      className={micLevel > 0.1 ? "icon-speaking-pulse" : ""}
                    />
                  ) : (
                    <MicOff size={16} />
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (micOn) setShowMicPopover((o) => !o);
                    }}
                    className={`ml-1 p-1 rounded focus:outline-none ${
                      micOn
                        ? "hover:bg-neutral-700 cursor-pointer"
                        : "opacity-30 cursor-not-allowed"
                    }`}
                    aria-label="Настроить громкость"
                    disabled={!micOn}
                  >
                    <ChevronUp
                      size={14}
                      className={`transition-transform ${
                        showMicPopover ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                </Button>
                {showMicPopover && micOn && (
                  <div
                    className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 shadow-lg flex items-center gap-2 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Volume2 size={14} className="text-neutral-400" />
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={volume}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        if (gainNodeRef.current)
                          gainNodeRef.current.gain.value = v / 100;
                      }}
                      className="w-32 h-1 accent-blue-500 cursor-pointer"
                    />
                    <span className="text-[11px] text-neutral-300 w-8 text-right">
                      {volume}%
                    </span>
                  </div>
                )}
              </div>
              <Button
                variant={camOn ? "default" : "outline"}
                onClick={toggleCam}
                disabled={sharing}
                className="cursor-pointer icon-hover-base icon-press"
              >
                {camOn ? (
                  <Video size={16} className="icon-speaking-pulse" />
                ) : (
                  <VideoOff size={16} />
                )}
              </Button>
              <Button
                variant={sharing ? "default" : "outline"}
                onClick={toggleScreenShare}
                className="cursor-pointer icon-hover-base icon-press"
              >
                <MonitorUp
                  size={16}
                  className={sharing ? "icon-speaking-pulse" : ""}
                />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const link = `${window.location.origin}?room=${roomId}`;
                  navigator.clipboard
                    .writeText(link)
                    .then(() => {
                      setNotifications((n) => [
                        ...n,
                        {
                          id: Date.now() + Math.random(),
                          text: "Ссылка скопирована",
                        },
                      ]);
                      setTimeout(
                        () => setNotifications((n) => n.slice(1)),
                        3000
                      );
                      setShareLinkFlipTs(Date.now());
                    })
                    .catch(() => {});
                }}
                className="cursor-pointer icon-hover-base icon-press"
              >
                <Share2
                  size={16}
                  className={`icon-share-intro ${
                    shareLinkFlipTs && Date.now() - shareLinkFlipTs < 1000
                      ? "icon-share-flip-once"
                      : ""
                  }`}
                />
              </Button>
              <Button
                variant="outline"
                onClick={raiseHand}
                className="cursor-pointer icon-hover-base icon-press"
              >
                <span
                  className={
                    handSignals.some((h) => h.id === socket.id)
                      ? "hand-wave"
                      : ""
                  }
                >
                  <Hand size={16} />
                </span>
              </Button>
              <Button
                variant="outline"
                onClick={() => setParticipantsOpen((o) => !o)}
                className="cursor-pointer icon-hover-base icon-press"
              >
                <Users size={16} />
                <span className="text-xs">{members.length}</span>
              </Button>
              <Button
                variant="outline"
                onClick={toggleRoomLock}
                className={`cursor-pointer icon-hover-base icon-press ${
                  roomLocked ? "icon-lock-shake" : ""
                }`}
              >
                {roomLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </Button>
              <Button
                variant={chatOpen ? "default" : "outline"}
                onClick={() => setChatOpen((o) => !o)}
                className="relative cursor-pointer icon-hover-base icon-press"
              >
                <MessageSquare size={16} />
                {chatUnread > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30 chat-badge-anim">
                    {chatUnread > 99 ? "99+" : chatUnread}
                  </span>
                )}
              </Button>
              <div className="text-xs text-neutral-300 px-2 py-1 rounded bg-neutral-800/60 whitespace-nowrap h-[34px] w-[100px] flex items-center justify-center">
                {formatDuration(elapsed)}
                {remainingMs != null && (
                  <span className="text-neutral-500 ml-1">
                    / {formatRemaining(remainingMs)}
                  </span>
                )}
              </div>
              <MicActivityDot
                level={micLevel}
                muted={!micOn}
                className="ml-1"
              />
            </div>
          </div>
        )}

        {(isMobile || isTablet) && (
          <>
            {!toolsOpen && (
              <button
                aria-label="Tools"
                onClick={() => setToolsOpen(true)}
                className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-neutral-900 border border-neutral-700 rounded-full w-12 h-12 flex items-center justify-center text-neutral-200 shadow-lg active:scale-95"
              >
                <span className="relative inline-flex">
                  <Settings size={20} />
                  {chatUnread > 0 && (
                    <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30">
                      {chatUnread > 99 ? "99+" : chatUnread}
                    </span>
                  )}
                </span>
              </button>
            )}
            {toolsSheetVisible && (
              <>
                <div
                  className={`fixed inset-0 ${
                    toolsOpen ? "animate-fade-in" : "animate-fade-out"
                  } bg-black/50 backdrop-blur-sm`}
                  onClick={() => setToolsOpen(false)}
                />
                <div
                  className={`fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl shadow-2xl p-4 h-auto flex flex-col ${
                    toolsOpen ? "animate-sheet-in" : "animate-sheet-out"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-neutral-300">
                      Инструменты
                    </span>
                    <button
                      aria-label="Close"
                      onClick={() => setToolsOpen(false)}
                      className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-[11px] font-medium text-neutral-300">
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant={micOn ? "default" : "outline"}
                        className="!p-3 w-12 h-12"
                        onClick={toggleMic}
                      >
                        {micOn ? <Mic size={18} /> : <MicOff size={18} />}
                      </Button>
                      <span>Мик</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant={camOn ? "default" : "outline"}
                        className="!p-3 w-12 h-12"
                        onClick={toggleCam}
                        disabled={sharing}
                      >
                        {camOn ? (
                          <Video size={18} className="icon-speaking-pulse" />
                        ) : (
                          <VideoOff size={18} />
                        )}
                      </Button>
                      <span>Кам</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant={sharing ? "default" : "outline"}
                        className="!p-3 w-12 h-12"
                        onClick={toggleScreenShare}
                      >
                        <MonitorUp
                          size={18}
                          className={sharing ? "icon-speaking-pulse" : ""}
                        />
                      </Button>
                      <span>Экран</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="outline"
                        className="!p-3 w-12 h-12"
                        onClick={() => {
                          const link = `${window.location.origin}?room=${roomId}`;
                          navigator.clipboard
                            .writeText(link)
                            .then(() => {
                              setNotifications((n) => [
                                ...n,
                                {
                                  id: Date.now() + Math.random(),
                                  text: "Ссылка скопирована",
                                },
                              ]);
                              setTimeout(
                                () => setNotifications((n) => n.slice(1)),
                                3000
                              );
                              setShareLinkFlipTs(Date.now());
                            })
                            .catch(() => {});
                        }}
                      >
                        <Share2
                          size={18}
                          className={`${
                            shareLinkFlipTs &&
                            Date.now() - shareLinkFlipTs < 1000
                              ? "icon-share-flip-once"
                              : ""
                          }`}
                        />
                      </Button>
                      <span>Линк</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="outline"
                        className="!p-3 w-12 h-12"
                        onClick={raiseHand}
                      >
                        <span
                          className={
                            handSignals.some((h) => h.id === socket.id)
                              ? "hand-wave"
                              : ""
                          }
                        >
                          <Hand size={18} />
                        </span>
                      </Button>
                      <span>Рука</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="outline"
                        className="!p-3 w-12 h-12"
                        onClick={() => setParticipantsOpen((o) => !o)}
                      >
                        <Users size={18} />
                      </Button>
                      <span>Люди</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant="outline"
                        className="!p-3 w-12 h-12"
                        onClick={toggleRoomLock}
                      >
                        {roomLocked ? <Lock size={18} /> : <Unlock size={18} />}
                      </Button>
                      <span>{roomLocked ? "Откр" : "Лок"}</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Button
                        variant={chatOpen ? "default" : "outline"}
                        className="!p-3 w-12 h-12 relative"
                        onClick={() => setChatOpen((o) => !o)}
                      >
                        <MessageSquare size={18} />
                        {chatUnread > 0 && (
                          <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[10px] rounded-full px-1 leading-none py-[2px] min-w-[16px] text-center border border-white/30">
                            {chatUnread > 99 ? "99+" : chatUnread}
                          </span>
                        )}
                      </Button>
                      <span>Чат</span>
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-neutral-800 text-[10px] leading-tight">
                        <div className="text-center">
                          <div>{formatDuration(elapsed)}</div>
                          {remainingMs != null && (
                            <div className="text-neutral-500">
                              {formatRemaining(remainingMs)}
                            </div>
                          )}
                        </div>
                      </div>
                      <span>Время</span>
                    </div>
                    <div className="flex flex-col items-center gap-1 col-span-4">
                      <div className="w-full flex items-center gap-2 px-2 py-1 bg-neutral-800/50 rounded-lg border border-neutral-700/60">
                        <Volume2 size={16} className="text-neutral-400" />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={volume}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setVolume(v);
                            if (gainNodeRef.current)
                              gainNodeRef.current.gain.value = v / 100;
                          }}
                          className="flex-1 accent-blue-600"
                        />
                        <span className="text-[11px] text-neutral-400 w-8 text-right">
                          {volume}%
                        </span>
                      </div>
                      <span className="text-[10px] mt-0.5">Микр.</span>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <MicActivityDot level={micLevel} muted={!micOn} />
                  </div>
                  {participantsOpen && (
                    <div className="mt-4 flex-1 overflow-y-auto rounded-lg border border-neutral-800 p-2 bg-neutral-950">
                      <div className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <Users size={14} /> Участники ({members.length})
                      </div>
                      <div className="flex flex-col gap-1 text-[11px]">
                        {members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-800/50"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <User size={14} className="opacity-70" />
                              <span className="truncate" title={m.name}>
                                {m.name || m.id.substring(0, 6)}
                              </span>
                            </div>
                            {m.muted && (
                              <MicOff size={14} className="text-red-400" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {!isMobile && !isTablet && participantsOpen && (
          <div className="absolute bottom-32 left-1/2 -translate-x-1/2 w-64 max-h-64 overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-lg shadow-lg p-3 flex flex-col gap-2 text-sm">
            <div className="font-semibold text-neutral-200 mb-1 flex items-center gap-2">
              <Users size={14} /> Участники ({members.length})
            </div>
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-neutral-800/50"
              >
                <div className="flex items-center gap-2 truncate">
                  <User size={14} className="opacity-70" />
                  <span className="truncate" title={m.name}>
                    {m.name || m.id.substring(0, 6)}
                  </span>
                </div>
                {m.muted && <MicOff size={14} className="text-red-400" />}
              </div>
            ))}
          </div>
        )}

        <div className="absolute top-6 left-6 flex flex-col gap-2">
          {notifications.map((n) => (
            <div
              key={n.id}
              className="bg-neutral-800 text-neutral-100 px-3 py-1 rounded shadow"
            >
              {n.text}
            </div>
          ))}
        </div>
        {chatDesktopVisible && (
          <div className="fixed inset-0 z-40 flex items-center justify-center">
            <div
              className={`absolute inset-0 ${
                chatOpen ? "animate-fade-in" : "animate-fade-out"
              } bg-black/60`}
              onClick={() => setChatOpen(false)}
            />
            <div
              className={`relative z-50 w-full max-w-md h-[70vh] flex flex-col bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl ${
                chatOpen ? "animate-modal-in" : "animate-modal-out"
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <span className="font-semibold text-neutral-200 flex items-center gap-2">
                  <MessageSquare size={16} /> Чат
                </span>
                <button
                  onClick={() => setChatOpen(false)}
                  className="p-2 rounded hover:bg-neutral-800 text-neutral-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {chatMessages.length === 0 ? (
                  <div className="text-neutral-500 text-center mt-8 text-xs">
                    Пока нет сообщений
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} className="group">
                      <div className="text-[11px] text-neutral-500 mb-0.5 flex items-center gap-2">
                        <span
                          className="font-medium text-neutral-300 truncate max-w-[140px]"
                          title={m.name}
                        >
                          {m.name || m.id.slice(0, 4)}
                        </span>
                        <span>
                          {new Date(m.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="bg-neutral-800/70 rounded-lg px-3 py-2 whitespace-pre-wrap break-words leading-snug text-neutral-100">
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
                className="p-3 border-t border-neutral-800 flex items-center gap-2"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Сообщение"
                  className="flex-1 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600"
                />
                <Button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-3 py-2"
                >
                  Отпр
                </Button>
              </form>
            </div>
          </div>
        )}
        {chatMobileVisible && (
          <div className="fixed inset-0 z-40">
            <div
              className={`absolute inset-0 ${
                chatOpen ? "animate-fade-in" : "animate-fade-out"
              } bg-black/50 backdrop-blur-sm`}
              onClick={() => setChatOpen(false)}
            />
            <div
              className={`absolute bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 rounded-t-2xl shadow-2xl flex flex-col max-h-[70vh] ${
                chatOpen ? "animate-sheet-in" : "animate-sheet-out"
              }`}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <span className="font-semibold text-neutral-200 flex items-center gap-2">
                  <MessageSquare size={16} /> Чат
                </span>
                <button
                  onClick={() => setChatOpen(false)}
                  className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {chatMessages.length === 0 ? (
                  <div className="text-neutral-500 text-center mt-4 text-xs">
                    Пока нет сообщений
                  </div>
                ) : (
                  chatMessages.map((m, i) => (
                    <div key={i} className="group">
                      <div className="text-[11px] text-neutral-500 mb-0.5 flex items-center gap-2">
                        <span
                          className="font-medium text-neutral-300 truncate max-w-[140px]"
                          title={m.name}
                        >
                          {m.name || m.id.slice(0, 4)}
                        </span>
                        <span>
                          {new Date(m.ts).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div className="bg-neutral-800/70 rounded-lg px-3 py-2 whitespace-pre-wrap break-words leading-snug text-neutral-100">
                        {m.text}
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat();
                }}
                className="p-3 border-t border-neutral-800 flex items-center gap-2"
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Сообщение"
                  className="flex-1 bg-neutral-800/60 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-600"
                />
                <Button
                  type="submit"
                  disabled={!chatInput.trim()}
                  className="px-3 py-2 h-[38px]"
                >
                  Отправить
                </Button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// helper components
function VideoTile({ stream, muted }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      const tryPlay = async () => {
        try {
          await ref.current.play();
        } catch (e) {
          /* autoplay blocked */
        }
      };
      ref.current.onloadedmetadata = tryPlay;
      tryPlay();
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className="w-full h-full object-cover"
    />
  );
}

function AudioSink({ stream, muted }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      const tryPlay = async () => {
        try {
          await ref.current.play();
        } catch (e) {
          /* autoplay policy may block until user gesture */
        }
      };
      ref.current.onloadedmetadata = tryPlay;
      tryPlay();
    }
  }, [stream]);
  return (
    <audio ref={ref} autoPlay playsInline muted={muted} className="hidden" />
  );
}

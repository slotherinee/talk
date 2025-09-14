export const createPeerConnectionFor = (
  id,
  getSocket,
  politeRef,
  pcs,
  setRemoteStreams,
  setupRemoteAnalyser,
  watchRemoteStream
) => {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });

  const socketInstance = getSocket();
  politeRef.current[id] = String(socketInstance?.id || "") < String(id);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      const currentSocket = getSocket();
      if (currentSocket) {
        currentSocket.emit("candidate-to", id, e.candidate);
      }
    }
  };

  pc.ontrack = (e) => {
    setRemoteStreams((prev) => {
      let peerStream = prev[id] || new MediaStream();
      if (e.track && !peerStream.getTracks().some((t) => t.id === e.track.id)) {
        try {
          peerStream.addTrack(e.track);
        } catch (error) {
          console.warn("Failed to add track:", error);
        }
      }
      if (peerStream.getAudioTracks().length > 0) {
        try {
          setupRemoteAnalyser(id, peerStream);
        } catch (error) {
          console.warn("Failed to setup remote analyser:", error);
        }
      }
      try {
        watchRemoteStream(id, peerStream);
      } catch (error) {
        console.warn("Failed to watch remote stream:", error);
      }
      return { ...prev, [id]: peerStream };
    });
  };

  pc.onconnectionstatechange = () => {
    console.log("Connection state for", id, ":", pc.connectionState);
    if (pc.connectionState === "failed") {
      console.warn("Connection failed for", id, "attempting restart");
      pc.restartIce();
    }
  };

  pcs.current[id] = pc;
  return pc;
};

export const watchRemoteStream = (id, streamObj, setRemoteStreams) => {
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
                !(t.kind === "video" && (t.readyState !== "live" || !t.enabled))
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

export const renegotiateWith = async (peerId, pcs, getSocket) => {
  const pc = pcs.current[peerId];
  if (!pc) return;
  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const socket = getSocket();
    if (socket) socket.emit("offer-to", peerId, offer);
  } catch (e) {
    console.warn("renegotiate failed", peerId, e);
  }
};

export const addLocalTracksToPc = (
  pc,
  localAudioTrackRef,
  localVideoTrackRef,
  sharing,
  screenTrackRef
) => {
  if (!pc) return;
  try {
    if (
      localAudioTrackRef.current &&
      localAudioTrackRef.current.readyState === "live"
    ) {
      const senders = pc.getSenders();
      const existing = senders.find((s) => s.track && s.track.kind === "audio");
      if (existing) {
        try {
          existing.replaceTrack(localAudioTrackRef.current);
        } catch (e) {
          console.warn("Failed to replace audio track:", e);
        }
      } else {
        try {
          pc.addTrack(
            localAudioTrackRef.current,
            new MediaStream([localAudioTrackRef.current])
          );
        } catch (e) {
          console.warn("Failed to add audio track:", e);
        }
      }
    }

    const activeVideoTrack =
      sharing &&
      screenTrackRef.current &&
      screenTrackRef.current.readyState === "live"
        ? screenTrackRef.current
        : localVideoTrackRef.current &&
          localVideoTrackRef.current.readyState === "live"
        ? localVideoTrackRef.current
        : null;

    if (activeVideoTrack) {
      const senders = pc.getSenders();
      const existing = senders.find((s) => s.track && s.track.kind === "video");
      if (existing) {
        try {
          existing.replaceTrack(activeVideoTrack);
        } catch (e) {
          console.warn("Failed to replace video track:", e);
        }
      } else {
        try {
          pc.addTrack(activeVideoTrack, new MediaStream([activeVideoTrack]));
        } catch (e) {
          console.warn("Failed to add video track:", e);
        }
      }
    }
  } catch (e) {
    console.warn("addLocalTracksToPc failed", e);
  }
};

export const setupRemoteAnalyser = (
  id,
  streamObj,
  remoteAnalyzersRef,
  audioContextRef,
  setRemoteLevels
) => {
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

export const handleOffer = async (
  id,
  description,
  pcs,
  createPeerConnectionForFn,
  politeRef,
  makingOfferRef,
  ignoreOfferRef,
  addLocalTracksToPcFn,
  getSocket
) => {
  let pc = pcs.current[id];
  if (!pc) pc = createPeerConnectionForFn(id);

  const polite = politeRef.current[id];
  const offerCollision =
    makingOfferRef.current[id] || pc.signalingState !== "stable";

  ignoreOfferRef.current[id] = !polite && offerCollision;

  if (ignoreOfferRef.current[id]) {
    console.warn("Offer collision, ignoring offer from", id);
    return;
  }

  try {
    await pc.setRemoteDescription(description);

    // Add local tracks before creating answer
    try {
      addLocalTracksToPcFn(pc);
    } catch (e) {
      console.warn("Failed to add local tracks:", e);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    const socketInstance = getSocket();
    if (socketInstance) socketInstance.emit("answer", id, answer);
  } catch (e) {
    console.warn("handleOffer failed", e);
    ignoreOfferRef.current[id] = false;
  }
};

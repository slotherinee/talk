export const createMicToggler = (
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
  renegotiateWith,
  roomId,
  socket
) => {
  return async () => {
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

        const update = () => {
          const bufferLength = analyser.frequencyBinCount;
          const data = new Uint8Array(bufferLength);
          analyser.getByteFrequencyData(data);
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
        const socketInstance = socket();
        if (roomId && socketInstance)
          socketInstance.emit("set-muted", roomId, false);
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
      const socketInstance = socket();
      if (roomId && socketInstance)
        socketInstance.emit("set-muted", roomId, true);
    }
  };
};

export const createCamToggler = (
  camOn,
  setCamOn,
  localVideoTrackRef,
  stream,
  setStream,
  localVideo,
  pcs,
  renegotiateWith
) => {
  return async () => {
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
};

export const createScreenShareToggler = (
  sharing,
  setSharing,
  screenTrackRef,
  pcs,
  renegotiateWith,
  localVideoTrackRef,
  camOn,
  setCamOn,
  stream,
  setStream,
  roomId,
  socket
) => {
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
        const socketInstance = socket();
        if (socketInstance) socketInstance.emit("screen-share-stopped", roomId);
      } catch (_) {}
    }
  };

  return async () => {
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
            const socketInstance = socket();
            if (socketInstance)
              socketInstance.emit("screen-share-started", roomId);
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
};

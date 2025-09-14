export const getUserDevices = async () => {
  try {
    await navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
      })
      .catch(() => {});

    const devices = await navigator.mediaDevices.enumerateDevices();

    const audioInputs = devices
      .filter((device) => device.kind === "audioinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Микрофон ${device.deviceId.slice(0, 8)}`,
        kind: "audioinput",
      }));

    const videoInputs = devices
      .filter((device) => device.kind === "videoinput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Камера ${device.deviceId.slice(0, 8)}`,
        kind: "videoinput",
      }));

    const audioOutputs = devices
      .filter((device) => device.kind === "audiooutput")
      .map((device) => ({
        deviceId: device.deviceId,
        label: device.label || `Динамики ${device.deviceId.slice(0, 8)}`,
        kind: "audiooutput",
      }));

    return {
      audioInput: audioInputs,
      videoInput: videoInputs,
      audioOutput: audioOutputs,
    };
  } catch (error) {
    console.warn("Failed to get user devices:", error);
    return {
      audioInput: [],
      videoInput: [],
      audioOutput: [],
    };
  }
};

export const switchToDevice = async (deviceId, kind, context) => {
  try {
    const {
      stream,
      setStream,
      localAudioTrackRef,
      localVideoTrackRef,
      pcs,
      renegotiateWithPeer,
      localVideo,
    } = context;

    const constraints = {};

    if (kind === "audio") {
      constraints.audio = { deviceId: { exact: deviceId } };
      if (stream && stream.getVideoTracks().length > 0) {
        constraints.video = true;
      }
    } else if (kind === "video") {
      constraints.video = { deviceId: { exact: deviceId } };
      if (stream && stream.getAudioTracks().length > 0) {
        constraints.audio = true;
      }
    }

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);

    if (kind === "audio" && localAudioTrackRef) {
      if (stream) {
        stream.getAudioTracks().forEach((track) => track.stop());
      }

      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newAudioTrack) {
        localAudioTrackRef.current = newAudioTrack;
      }
    } else if (kind === "video" && localVideoTrackRef) {
      if (stream) {
        stream.getVideoTracks().forEach((track) => track.stop());
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (newVideoTrack) {
        localVideoTrackRef.current = newVideoTrack;
        if (localVideo) {
          localVideo.srcObject = newStream;
        }
      }
    }
    if (setStream) {
      setStream(newStream);
    }

    if (pcs && renegotiateWithPeer) {
      Object.keys(pcs).forEach((peerId) => {
        const pc = pcs[peerId];
        if (pc && pc.connectionState === "connected") {
          try {
            renegotiateWithPeer(peerId);
          } catch (err) {
            console.warn("Failed to renegotiate with peer:", peerId, err);
          }
        }
      });
    }

    return newStream;
  } catch (error) {
    console.warn(`Failed to switch to ${kind} device:`, error);
    throw error;
  }
};

export const getTrackDevice = (track) => {
  if (!track) return null;

  try {
    const settings = track.getSettings();
    return {
      deviceId: settings.deviceId,
      label: track.label || settings.deviceId?.slice(0, 8) || "Unknown",
    };
  } catch (error) {
    console.warn("Failed to get track device info:", error);
    return null;
  }
};

export const setAudioOutputDevice = async (element, deviceId) => {
  try {
    if (element && element.setSinkId) {
      await element.setSinkId(deviceId);
      return true;
    }
    return false;
  } catch (error) {
    console.warn("Failed to set audio output device:", error);
    return false;
  }
};

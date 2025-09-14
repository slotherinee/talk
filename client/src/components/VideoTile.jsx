import { useRef, useEffect } from "react";

function VideoTile({ stream, muted, isScreenShare = false, isLocal = false }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      const tryPlay = async () => {
        try {
          await ref.current.play();
        } catch (e) {}
      };
      ref.current.onloadedmetadata = tryPlay;
      tryPlay();
    }
  }, [stream]);

  const shouldMirror = isLocal && !isScreenShare;

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`size-full object-cover object-center ${
        shouldMirror ? "transform -scale-x-100" : ""
      }`}
    />
  );
}

export default VideoTile;

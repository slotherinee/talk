import { useRef, useEffect } from "react";

function VideoTile({ stream, muted, isScreenShare = false }) {
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
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={`size-full object-cover object-center ${
        isScreenShare ? "" : "transform -scale-x-100"
      }`}
    />
  );
}

export default VideoTile;

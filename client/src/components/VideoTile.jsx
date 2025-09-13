import { useRef, useEffect } from "react";

function VideoTile({ stream, muted }) {
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
      className="w-full h-full object-cover transform -scale-x-100"
    />
  );
}

export default VideoTile;

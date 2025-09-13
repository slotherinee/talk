import { useRef, useEffect } from "react";

function AudioSink({ stream, muted }) {
  const ref = useRef();
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      const tryPlay = async () => {
        try {
          await ref.current.play();
        } catch (e) {
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

export default AudioSink;
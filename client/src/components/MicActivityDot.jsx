import { useState, useRef, useEffect } from "react";

function MicActivityDot({ level, muted, className = "", size = 20 }) {
  const displayedRef = useRef(0);
  const [frame, setFrame] = useState(0);
  const lastRippleRef = useRef(0);
  const [ripples, setRipples] = useState([]);

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
  const speaking = val > 0.22;
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

export default MicActivityDot;

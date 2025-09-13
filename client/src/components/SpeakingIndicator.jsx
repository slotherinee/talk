import { useState, useRef, useEffect } from "react";

function SpeakingIndicator({ 
  speaking, 
  level = 0, 
  children, 
  className = "", 
  glowColor = "rgba(59,130,246,0.4)",
  ringColor = "rgb(59,130,246)" 
}) {
  const [ripples, setRipples] = useState([]);
  const lastRippleRef = useRef(0);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (speaking) {
      const now = performance.now();
      if (now - lastRippleRef.current > 800) {
        lastRippleRef.current = now;
        setRipples((r) => [
          ...r.filter((x) => now - x.time < 1000),
          { id: now + Math.random(), time: now },
        ]);
      }
    }
  }, [speaking, frame]);

  useEffect(() => {
    let raf;
    if (speaking) {
      const loop = () => {
        setFrame((f) => f + 1);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  useEffect(() => {
    if (document.getElementById("speaking-ripple-style")) return;
    const style = document.createElement("style");
    style.id = "speaking-ripple-style";
    style.textContent = `
      @keyframes speakingRipple {
        0% {
          transform: scale(1);
          opacity: 0.8;
        }
        50% {
          opacity: 0.4;
        }
        100% {
          transform: scale(1.6);
          opacity: 0;
        }
      }
      
      @keyframes speakingGlow {
        0%, 100% {
          box-shadow: 0 0 10px ${glowColor}, 0 0 20px ${glowColor}, 0 0 30px ${glowColor};
        }
        50% {
          box-shadow: 0 0 15px ${glowColor}, 0 0 30px ${glowColor}, 0 0 45px ${glowColor};
        }
      }
    `;
    document.head.appendChild(style);
  }, [glowColor]);

  const intensity = Math.min(1, level * 2);
  const dynamicGlow = speaking 
    ? `0 0 ${4 + intensity * 6}px ${glowColor}, 0 0 ${8 + intensity * 12}px ${glowColor}`
    : 'none';

  return (
    <div 
      className={`relative ${className}`}
      style={{
        borderRadius: 'inherit'
      }}
    >
      {speaking && ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute inset-0 pointer-events-none rounded-full border-2"
          style={{
            borderColor: ringColor,
            animation: `speakingRipple ${1000 + intensity * 200}ms ease-out`,
            mixBlendMode: 'plus-lighter',
          }}
        />
      ))}
      
      <div
        className={`relative ${speaking ? 'animate-pulse' : ''}`}
        style={{
          borderRadius: 'inherit',
          boxShadow: dynamicGlow,
          transition: 'box-shadow 0.3s ease-in-out',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default SpeakingIndicator;
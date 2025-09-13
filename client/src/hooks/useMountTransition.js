import { useState, useEffect } from "react";

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

export default useMountTransition;

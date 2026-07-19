import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/** CAD stiliaus kryželis, sekantis pelę, su „matmenų“ koordinatėmis metrais */
export default function CadCursor() {
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Tik su pele (ne jutikliniuose)
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const move = (e: MouseEvent) => {
      x.set(e.clientX);
      y.set(e.clientY);
      setCoords({ x: e.clientX / 100, y: e.clientY / 100 });
      setVisible(true);
    };
    const leave = () => setVisible(false);
    window.addEventListener('mousemove', move, { passive: true });
    document.documentElement.addEventListener('mouseleave', leave);
    return () => {
      window.removeEventListener('mousemove', move);
      document.documentElement.removeEventListener('mouseleave', leave);
    };
  }, [x, y]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] hidden md:block" aria-hidden>
      {/* Vertikali linija */}
      <motion.div
        className="absolute top-0 h-full w-px bg-sky-400/25"
        style={{ left: sx }}
      />
      {/* Horizontali linija */}
      <motion.div
        className="absolute left-0 h-px w-full bg-sky-400/25"
        style={{ top: sy }}
      />
      {/* Koordinatės */}
      <motion.div
        className="font-dim absolute rounded border border-sky-400/40 bg-slate-950/85 px-1.5 py-0.5 text-[10px] text-sky-300"
        style={{ left: sx, top: sy, x: 12, y: 12 }}
      >
        {coords.x.toFixed(3)} ; {coords.y.toFixed(3)}
      </motion.div>
      {/* Kryželio centras */}
      <motion.div
        className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2"
        style={{ left: sx, top: sy }}
      >
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-sky-300" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-sky-300" />
      </motion.div>
    </div>
  );
}

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationFrame, useMotionValue, useTransform } from 'motion/react';

interface ShinyTextProps {
  text: string;
  className?: string;
  color?: string;
  shineColor?: string;
  speed?: number;
}

export default function ShinyText({
  text,
  className = '',
  color = '#8ea0b4',
  shineColor = '#ffffff',
  speed = 2,
}: ShinyTextProps) {
  const [isPaused] = useState(false);
  const progress = useMotionValue(0);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  useAnimationFrame((time) => {
    if (isPaused) {
      lastTimeRef.current = null;
      return;
    }

    if (lastTimeRef.current === null) {
      lastTimeRef.current = time;
      return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;
    elapsedRef.current += deltaTime;

    const animationDuration = speed * 1000;
    const cycleTime = elapsedRef.current % animationDuration;
    const value = (cycleTime / animationDuration) * 100;
    progress.set(value);
  });

  useEffect(() => {
    elapsedRef.current = 0;
    progress.set(0);
  }, [progress]);

  const backgroundPosition = useTransform(progress, (value) => `${150 - value * 2}% center`);

  const gradientStyle: CSSProperties = {
    backgroundImage: `linear-gradient(110deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  return (
    <motion.span className={className} style={{ ...gradientStyle, backgroundPosition }}>
      {text}
    </motion.span>
  );
}

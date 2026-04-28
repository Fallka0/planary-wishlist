import { motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

type AnimationFrameSnapshot = Record<string, string | number>;

function buildKeyframes(from: AnimationFrameSnapshot, steps: AnimationFrameSnapshot[]) {
  const keys = new Set([...Object.keys(from), ...steps.flatMap((step) => Object.keys(step))]);

  return [...keys].reduce<Record<string, Array<string | number | undefined>>>((accumulator, key) => {
    accumulator[key] = [from[key], ...steps.map((step) => step[key])];
    return accumulator;
  }, {});
}

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
  direction?: 'top' | 'bottom';
}

export default function BlurText({
  text = '',
  delay = 200,
  className = '',
  animateBy = 'words',
  direction = 'top',
}: BlurTextProps) {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const current = ref.current;
    if (!current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        observer.unobserve(current);
      }
    });

    observer.observe(current);
    return () => observer.disconnect();
  }, []);

  const animationFrom = useMemo<AnimationFrameSnapshot>(
    () =>
      direction === 'top'
        ? { filter: 'blur(10px)', opacity: 0, y: -50 }
        : { filter: 'blur(10px)', opacity: 0, y: 50 },
    [direction],
  );

  const animationTo = useMemo<AnimationFrameSnapshot[]>(
    () => [
      {
        filter: 'blur(5px)',
        opacity: 0.5,
        y: direction === 'top' ? 5 : -5,
      },
      { filter: 'blur(0px)', opacity: 1, y: 0 },
    ],
    [direction],
  );

  return (
    <p ref={ref} className={className}>
      {elements.map((segment, index) => {
        const animateKeyframes = buildKeyframes(animationFrom, animationTo);

        return (
          <motion.span
            key={`${segment}-${index}`}
            className="inline-fragment"
            initial={animationFrom as never}
            animate={(inView ? animateKeyframes : animationFrom) as never}
            transition={{
              duration: 0.7,
              times: [0, 0.5, 1],
              delay: (index * delay) / 1000,
              ease: 'easeOut',
            }}
          >
            {segment === ' ' ? '\u00A0' : segment}
            {animateBy === 'words' && index < elements.length - 1 && '\u00A0'}
          </motion.span>
        );
      })}
    </p>
  );
}

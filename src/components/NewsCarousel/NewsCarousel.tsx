'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import styles from './NewsCarousel.module.scss';

interface NewsCarouselProps {
  initialItems: any[];
}

export default function NewsCarousel({ initialItems }: NewsCarouselProps) {
  const [items] = useState<any[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const autoRotateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoRotation = useCallback(() => {
    if (autoRotateTimerRef.current) clearInterval(autoRotateTimerRef.current);
    autoRotateTimerRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
    }, 15000);
  }, [items.length]);

  useEffect(() => {
    if (items.length === 0) return;
    startAutoRotation();
    return () => {
      if (autoRotateTimerRef.current) clearInterval(autoRotateTimerRef.current);
    };
  }, [items.length, startAutoRotation]);

  const handleDotClick = (idx: number) => {
    setCurrentIndex(idx);
    startAutoRotation(); // Reset timer
  };

  const animate = useCallback((time: number) => {
    if (lastTimeRef.current !== null && scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight < scrollHeight - 1) {
        // Scroll 20 pixels per second (approx 0.33px per 16.6ms frame)
        const deltaTime = time - lastTimeRef.current;
        scrollRef.current.scrollTop += (20 * deltaTime) / 1000;
      }
    }
    lastTimeRef.current = time;
    requestRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    lastTimeRef.current = null;

    const delay = setTimeout(() => {
      requestRef.current = requestAnimationFrame(animate);
    }, 3000);

    return () => {
      clearTimeout(delay);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [currentIndex, animate]);

  useEffect(() => {
    // Hard refresh the entire page every 30 minutes to clear memory and cache
    const refreshInterval = setInterval(() => {
      window.location.reload();
    }, 1000 * 60 * 30); 

    return () => clearInterval(refreshInterval);
  }, []);

  if (items.length === 0) return <div className={styles.loading}>Naujienų nerasta</div>;

  const current = items[currentIndex];
  // Split description into paragraphs by \n\n
  const paragraphs: string[] = current.description
    ? current.description.split('\n\n').filter((p: string) => p.trim().length > 0)
    : [];

  return (
    <div className={styles.carouselWrapper}>
      <div className={styles.newsContainer}>
        {/* Left Column: Image and Headline */}
        <div className={styles.leftColumn}>
          <div className={styles.imageWrapper}>
            <Image
              src={current.image}
              alt={current.title}
              fill
              className={styles.mainImage}
              loading={currentIndex === 0 ? "eager" : "lazy"}
              preload={currentIndex === 0}
              unoptimized={current.image.includes('images.unsplash.com')}
              sizes="(max-width: 1200px) 70vw, 40vw"
            />
          </div>

          <div className={styles.headlineContainer}>
            <h2 className={styles.headline}>{current.title}</h2>
          </div>

          {/* Progress dots on top of image */}
          <div className={styles.progressContainer}>
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => handleDotClick(idx)}
                className={`${styles.dot} ${idx === currentIndex ? styles.activeDot : styles.inactiveDot}`}
              />
            ))}
          </div>
        </div>

        {/* Right Column: Date and Clean Paragraphs */}
        <div className={styles.rightColumn}>
          <div className={styles.dateLabel}>
            {current.date}
          </div>

          <div ref={scrollRef} className={styles.articleBody}>
            {paragraphs.map((p: string, idx: number) => (
              <p
                key={idx}
                className={`${styles.paragraph} ${idx === 0 && paragraphs.length > 1 ? styles.lead : styles.normal}`}
              >
                {p}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

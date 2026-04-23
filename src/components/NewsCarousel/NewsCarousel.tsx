'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import styles from './NewsCarousel.module.scss';

interface NewsCarouselProps {
  initialItems: any[];
}

export default function NewsCarousel({ initialItems }: NewsCarouselProps) {
  const router = useRouter();
  const [items, setItems] = useState<any[]>(initialItems);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoRotateTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startAutoRotation = useCallback(() => {
    if (autoRotateTimerRef.current) clearInterval(autoRotateTimerRef.current);
    autoRotateTimerRef.current = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
    }, 25000); // Increased interval to 25 seconds
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

  const scrollPosRef = useRef(0);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
      scrollPosRef.current = 0;
    }

    if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);

    const delay = setTimeout(() => {
      scrollIntervalRef.current = setInterval(() => {
        if (scrollRef.current && !isPaused) {
          const { scrollHeight, clientHeight } = scrollRef.current;
          
          if (scrollPosRef.current + clientHeight < scrollHeight - 2) {
            // 20px per second / 30fps = 0.6px per tick
            scrollPosRef.current += 0.6; 
            scrollRef.current.scrollTop = Math.floor(scrollPosRef.current);
          }
        }
      }, 30); // ~33fps for stability
    }, 2000);

    return () => {
      clearTimeout(delay);
      if (scrollIntervalRef.current) clearInterval(scrollIntervalRef.current);
    };
  }, [currentIndex, isPaused]);

  useEffect(() => {
    // Refresh the page data every 10 minutes to get today's news
    const refreshInterval = setInterval(() => {
      router.refresh(); 
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [router]);

  useEffect(() => {
    // Daily hard reload at 3 AM to clear memory
    const now = new Date();
    const night = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + (now.getHours() >= 3 ? 1 : 0),
      3, 0, 0
    );
    const msToNight = night.getTime() - now.getTime();

    const reloadTimeout = setTimeout(() => {
      window.location.reload();
    }, msToNight);

    return () => clearTimeout(reloadTimeout);
  }, []);

  useEffect(() => {
    // Hard refresh the entire page every 30 minutes to clear memory and cache
    const refreshInterval = setInterval(() => {
      window.location.reload();
    }, 1000 * 60 * 30); 

    return () => clearInterval(refreshInterval);
  }, []);

  if (items.length === 0) return <div className={styles.loading}>Naujienų nerasta</div>;

  const current = items[currentIndex];
  // Split description into paragraphs by double newlines
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
              priority={currentIndex === 0}
              unoptimized={current.image.includes('images.unsplash.com')}
              sizes="(max-width: 1200px) 70vw, 40vw"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (target.src !== 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1600') {
                  target.src = 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1600';
                }
              }}
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

          <div 
            ref={scrollRef} 
            className={styles.articleBody}
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            tabIndex={0}
          >
            {paragraphs.map((p: string, idx: number) => (
              <div
                key={idx}
                className={`${styles.paragraph} ${idx === 0 && paragraphs.length > 1 ? styles.lead : styles.normal}`}
                dangerouslySetInnerHTML={{ __html: p }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

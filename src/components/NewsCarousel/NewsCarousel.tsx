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

  useEffect(() => {
    const fetchLatestNews = async () => {
      try {
        // Naudojame ir laiką, ir Math.random(), nes TV vidiniai laikrodžiai dažnai būna "užšalę"
        const res = await fetch(`/api/news?t=${new Date().getTime()}&r=${Math.random()}`);
        
        const freshData = await res.json();
        
        // Jei gavome naujienų, pakeičiame karuselės duomenis
        if (freshData && freshData.length > 0) {
          setItems(freshData);
          // Apsauga: jei buvome 5 slaide, o naujienų liko tik 4, grįžtame į pradžią
          setCurrentIndex((prev) => (prev >= freshData.length ? 0 : prev));
        }
      } catch (error) {
        console.error("Klaida gaunant šviežias naujienas:", error);
      }
    };

    // Iškviečiame funkciją iškart, kai tik komponentas atsiranda ekrane
    fetchLatestNews();

    // Automatiškai ir tyliai fone ieškome naujų žinių kas 30 minučių (1800000 ms)
    const updateInterval = setInterval(fetchLatestNews, 1800000);
    
    return () => clearInterval(updateInterval);
  }, []);

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

  if (items.length === 0) return <div className={styles.loading}>Naujienų nerasta</div>;

  return (
    <div className={styles.carouselWrapper}>
      <div className={styles.newsContainer}>
        {items.map((item, idx) => {
          const isActive = idx === currentIndex;

          return (
            <div 
              key={idx} 
              className={`${styles.slide} ${isActive ? styles.activeSlide : styles.inactiveSlide}`}
            >
              {/* Left Column: Image and Headline */}
              <div className={styles.leftColumn}>
                <div className={styles.imageWrapper}>
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className={styles.mainImage}
                    loading={idx === 0 ? "eager" : "lazy"}
                    priority={idx === 0}
                    unoptimized={item.image.includes('images.unsplash.com')}
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
                  <h2 className={styles.headline}>{item.title}</h2>
                </div>
              </div>

              {/* Right Column: Date and Clean Paragraphs */}
              <div className={styles.rightColumn}>
                <div className={styles.dateLabel}>
                  {item.category} | {item.date}
                </div>

                <div 
                  ref={isActive ? scrollRef : null} 
                  className={styles.articleBody}
                  onMouseEnter={() => setIsPaused(true)}
                  onMouseLeave={() => setIsPaused(false)}
                  tabIndex={0}
                >
                  <div 
                    dangerouslySetInnerHTML={{ __html: item.description }}
                  />
                </div>
              </div>
            </div>
          );
        })}

        {/* Progress dots */}
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
    </div>
  );
}

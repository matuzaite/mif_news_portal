'use client';
import { useState, useEffect, useRef } from 'react';
import styles from './NewsCarousel.module.scss';

export default function NewsCarousel() {
  const [items, setItems] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  // Auto-rotation of articles
  useEffect(() => {
    if (items.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % items.length);
    }, 15000); // Rotate every 15 seconds
    return () => clearInterval(interval);
  }, [items]);

  // Handle auto-scrolling for long articles
  useEffect(() => {
    if (scrollInterval.current) clearInterval(scrollInterval.current);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;

    const startScrolling = () => {
      scrollInterval.current = setInterval(() => {
        if (scrollRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          if (scrollTop + clientHeight >= scrollHeight - 2) {
            clearInterval(scrollInterval.current!);
          } else {
            scrollRef.current.scrollTop += 1;
          }
        }
      }, 50);
    };

    const delay = setTimeout(startScrolling, 3000);
    return () => {
      clearTimeout(delay);
      if (scrollInterval.current) clearInterval(scrollInterval.current);
    };
  }, [currentIndex, items]);

  if (loading) return <div className={styles.loading}>Kraunamos naujienos...</div>;
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
          <div 
            className={styles.backgroundImage} 
            style={{ backgroundImage: `url(${current.image})` }} 
          />
          <img
            src={current.image}
            alt={current.title}
            className={styles.mainImage}
          />
          <div className={styles.imageOverlay} />
          
          <div className={styles.headlineContainer}>
            <h2 className={styles.headline}>{current.title}</h2>
          </div>

          {/* Progress dots on top of image */}
          <div className={styles.progressContainer}>
            {items.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
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
                className={`${styles.paragraph} ${idx === 0 ? styles.lead : styles.normal}`}
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

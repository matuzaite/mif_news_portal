'use client';
import { useState, useEffect } from 'react';
import styles from './Sidebar.module.scss';

export default function Sidebar() {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoContainer}>
        <img
          src="/MIF.svg"
          alt="VU MIF Logo"
        />
      </div>

      {/* Live Clock */}
      <div className={styles.clockSection}>
        <p className={styles.time}>
          {time ? time.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
        </p>
        <p className={styles.date}>
          {time ? time.toLocaleDateString('lt-LT', { day: 'numeric', month: 'long' }) : '...'}
        </p>
      </div>

      {/* Bottom section */}
      <div className={styles.bottomSection}>
        {/* Label */}
        <p className={`${styles.socialLabel} brand-font`}>
          Sekite VU MIF naujienas
        </p>

        {/* Social Icons */}
        <div className={styles.socialIcons}>
          {/* Facebook */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
          </svg>
          {/* Instagram */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17.5" cy="6.5" r="1" fill="white" stroke="none" />
          </svg>
          {/* LinkedIn */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
            <circle cx="4" cy="4" r="2" />
          </svg>
        </div>

        {/* Website */}
        <p className={styles.website}>
          www.mif.vu.lt
        </p>
      </div>
    </aside>
  );
}

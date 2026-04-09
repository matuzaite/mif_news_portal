'use client';
import { useState, useEffect } from 'react';
import NewsCard from '../NewsCard/NewsCard';
import styles from './NewsGrid.module.scss';

export default function NewsGrid() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => {
        setItems(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}>Kraunamos naujienos...</div>;

  return (
    <div className={styles.grid}>
      {items.map((item) => (
        <NewsCard key={item.id} item={item} />
      ))}
    </div>
  );
}

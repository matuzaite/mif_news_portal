'use client';
import { useState, useEffect } from 'react';
import NewsCard from '../NewsCard/NewsCard';
import styles from './NewsList.module.scss';

export default function NewsList() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/news')
      .then(res => res.json())
      .then(data => setItems(data));
  }, []);

  return (
    <div className={styles.list}>
      {items.map((item) => (
        <NewsCard key={item.id} item={item} />
      ))}
    </div>
  );
}

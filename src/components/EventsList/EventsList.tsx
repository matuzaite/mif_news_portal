'use client';
import { useState, useEffect } from 'react';
import EventCard from '@/components/EventCard';
import styles from './EventsList.module.scss';

export default function EventsList() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/news?type=renginiai')
      .then(res => res.json())
      .then(data => {
        setEvents(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Kraunami renginiai...</div>;
  if (events.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Renginių nerasta</div>;

  return (
    <div className={styles.eventsContainer}>
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}

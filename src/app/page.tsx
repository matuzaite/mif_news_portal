import Sidebar from '@/components/Sidebar/Sidebar';
import NewsCarousel from '@/components/NewsCarousel/NewsCarousel';
import styles from './page.module.css';

async function getNews() {
  const res = await fetch('http://localhost:3000/api/news', {
    next: { revalidate: 60 }
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function Home() {
  const news = await getNews();

  return (
    <main className={styles.main}>
      <Sidebar />
      <div className={styles.contentArea}>
        <NewsCarousel initialItems={news} />
      </div>
    </main>
  );
}
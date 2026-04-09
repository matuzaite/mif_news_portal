import Sidebar from '@/components/Sidebar/Sidebar';
import NewsCarousel from '@/components/NewsCarousel/NewsCarousel';

export default function Home() {
  return (
    <main style={{
      display: 'flex',
      flexDirection: 'row',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-color)',
    }}>
      {/* Left burgundy sidebar */}
      <Sidebar />

      {/* Right content area - Now full width for news */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--bg-white)',
      }}>
        <NewsCarousel />
      </div>
    </main>
  );
}
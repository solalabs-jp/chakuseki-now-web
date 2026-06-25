import type { NextPage } from 'next';

const Home: NextPage = () => {
  return (
    <main style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>ようこそ</h1>
        <p>Next.js で Firebase App Hosting 向けの Web アプリを構築しています。</p>
      </div>
    </main>
  );
};

export default Home;

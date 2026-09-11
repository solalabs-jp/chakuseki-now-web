import Sidebar from './Sidebar';
import AppDownloadButton from './AppDownloadButton';
import styles from '../styles/Layout.module.css';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { clearAuth, isLoggedIn } from '../lib/clientAuth';

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      setAuthorized(true);
      return;
    }
    router.replace('/login');
  }, [router]);

  // Firebase の idToken は1時間で失効するが、再ログインを促す導線が無いため、
  // 失効後は全 API が 401 を返し続けるだけで画面上は何も起きず気づけない。
  // /api/ への fetch が 401 を返したら認証情報を破棄してログイン画面に戻す。
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const guardedFetch: typeof window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (response.status === 401) {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
            ? input.toString()
            : input.url;
        if (url.startsWith('/api/')) {
          clearAuth();
          router.replace('/login');
        }
      }
      return response;
    };
    window.fetch = guardedFetch;
    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  if (!authorized) {
    return null;
  }

  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>{children}</main>
      <AppDownloadButton />
    </div>
  );
}

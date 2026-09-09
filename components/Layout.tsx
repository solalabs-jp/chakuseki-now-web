import Sidebar from './Sidebar';
import AppDownloadButton from './AppDownloadButton';
import styles from '../styles/Layout.module.css';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { isLoggedIn } from '../lib/clientAuth';

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

import Link from 'next/link';
import { useRouter } from 'next/router';
import UserProfileButton from './UserProfileButton';
import styles from '../styles/Sidebar.module.css';

function GridIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor">
      <rect x="0" y="0" width="6.5" height="6.5" rx="1.5"/>
      <rect x="8.5" y="0" width="6.5" height="6.5" rx="1.5"/>
      <rect x="0" y="8.5" width="6.5" height="6.5" rx="1.5"/>
      <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1.5"/>
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
      <circle cx="6" cy="4.5" r="2.5"/>
      <path d="M1 14c0-2.485 2.239-4.5 5-4.5" strokeLinecap="round"/>
      <path d="M10 11l1.5 1.5 3-3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
      <rect x="1" y="3" width="14" height="11.5" rx="2"/>
      <path d="M5 1.5v3M11 1.5v3M1 7h14" strokeLinecap="round"/>
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
      <circle cx="5.5" cy="4.5" r="2.5"/>
      <circle cx="10.5" cy="4.5" r="2.5"/>
      <path d="M0.5 13.5c0-2.485 2.239-4 5-4s5 1.515 5 4" strokeLinecap="round"/>
      <path d="M9.5 11c.8-.6 1.9-1 3-1s3.5 1 3.5 3.5" strokeLinecap="round"/>
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 16 16">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1.5V3M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" strokeLinecap="round"/>
    </svg>
  );
}

const navItems = [
  {
    label: 'ダッシュボード',
    href: '/',
    activeFor: ['/', '/class'],
    icon: <GridIcon />,
  },
  {
    label: '出席管理',
    href: '/attendance',
    activeFor: ['/attendance'],
    icon: <PersonIcon />,
  },
  {
    label: '時間割',
    href: '/schedule',
    activeFor: ['/schedule', '/schedule-detail', '/schedule-upload'],
    icon: <CalendarIcon />,
  },
  {
    label: '生徒・クラス管理',
    href: '/promotion',
    activeFor: ['/promotion', '/teachers'],
    icon: <UsersIcon />,
  },
  {
    label: '設定',
    href: '/settings',
    disabled: true,
    activeFor: ['/settings'],
    icon: <GearIcon />,
  },
];

export default function Sidebar() {
  const { pathname } = useRouter();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>着</div>
        <div className={styles.brandText}>
          <strong>着席なう</strong>
          <span>教員用ダッシュボード</span>
        </div>
      </div>

      <nav className={styles.navList}>
        {navItems.map((item) => {
          const isActive = item.activeFor.some(
            (p) => pathname === p || pathname.startsWith(p + '/')
          );
          const cls = `${styles.navItem}${isActive ? ' ' + styles.active : ''}`;

          if (item.disabled) {
            return (
              <button
                key={item.label}
                type="button"
                className={cls}
                onClick={() => alert('このページは現在準備中です')}
              >
                <span className={styles.navIcon}>{item.icon}</span>
                {item.label}
              </button>
            );
          }

          return (
            <Link key={item.label} href={item.href} className={cls}>
              <span className={styles.navIcon}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className={styles.userCard}>
        <div className={styles.userAvatar}>佐</div>
        <div className={styles.userText}>
          <span className={styles.userName}>佐藤先生</span>
          <span className={styles.userSub}>Homeroom 2A</span>
        </div>
        <UserProfileButton />
      </div>
    </aside>
  );
}

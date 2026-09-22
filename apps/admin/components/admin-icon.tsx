type AdminIconName = 'shop' | 'users' | 'subscription' | 'paused' | 'plus' | 'arrow' | 'tenant';

export function AdminIcon({ name, size = 18 }: { name: AdminIconName; size?: number }) {
  const paths: Record<AdminIconName, string> = {
    shop: 'M4 10v10h16V10M3 10l2-6h14l2 6M8 20v-6h8v6M3 10c0 2 3 2 4 0 1 2 4 2 5 0 1 2 4 2 5 0 1 2 4 2 4 0',
    users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-4M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8m8 0a4 4 0 0 1 0 8',
    subscription: 'M4 5h16v14H4zM4 9h16m-12 4h4',
    paused: 'M12 3a9 9 0 1 0 9 9M10 9v6m4-6v6',
    plus: 'M12 5v14M5 12h14',
    arrow: 'M7 17 17 7M8 7h9v9',
    tenant: 'M4 20V9l8-6 8 6v11M9 20v-6h6v6',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

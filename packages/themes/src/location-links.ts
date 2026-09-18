/** Public address → provider URLs. No geolocation, API key or tenant-independent cache. */
export function locationLinks(location: { address: string; city: string; state: string }) {
  if (!location.address.trim() || !location.city.trim()) return null;
  const address = [location.address, location.city, location.state, 'Brasil'].map(value => value.trim()).filter(Boolean).join(', ');
  const query = encodeURIComponent(address);
  return {
    address,
    embed: `https://www.google.com/maps?q=${query}&output=embed`,
    google: `https://www.google.com/maps/search/?api=1&query=${query}`,
    waze: `https://www.waze.com/ul?q=${query}&navigate=yes`,
    apple: `https://maps.apple.com/?q=${query}`,
  };
}

export function safeMapEmbed(value?: string) {
  try {
    const url = new URL(value ?? '');
    return url.origin === 'https://www.google.com' && !url.username && !url.password &&
      (url.pathname === '/maps/embed' || url.pathname.startsWith('/maps/embed/')) ? url.href : undefined;
  } catch { return undefined; }
}

type ShareBrowser = { share?: (data: ShareData) => Promise<void>; clipboard?: { writeText: (text: string) => Promise<void> } };
export async function shareLocation(browser: ShareBrowser, data: ShareData): Promise<'shared' | 'copied' | 'manual' | 'cancelled'> {
  if (browser.share) {
    try { await browser.share(data); return 'shared'; }
    catch (error) { if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') return 'cancelled'; }
  }
  try {
    if (!browser.clipboard) return 'manual';
    await browser.clipboard.writeText(data.url ?? '');
    return 'copied';
  } catch { return 'manual'; }
}

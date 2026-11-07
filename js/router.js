// Router berbasis hash (#/dashboard, #/kalkulator/acid-lab). Tidak butuh pengaturan server,
// sehingga berjalan sama di Live Server maupun GitHub Pages.

export function parseHash(hash = location.hash) {
  const match = /^#\/([a-z-]+)(?:\/([a-z0-9-]+))?\/?$/.exec(hash || '');
  return match ? { route: match[1], param: match[2] ?? null } : null;
}

export function createRouter(onChange, fallback = 'dashboard') {
  function handle() {
    const parsed = parseHash();
    if (parsed) onChange(parsed.route, parsed.param);
    else onChange(location.hash ? '__404' : fallback, null);
  }
  window.addEventListener('hashchange', handle);
  return {
    start() {
      if (!location.hash) history.replaceState(null, '', `#/${fallback}`);
      handle();
    },
    go(route, param = null) {
      const target = param ? `#/${route}/${param}` : `#/${route}`;
      if (location.hash === target) handle();
      else location.hash = target;
    },
  };
}

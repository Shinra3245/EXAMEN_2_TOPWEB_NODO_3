export function normalizeCentralUrl(value) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BANCO_CENTRAL_URL debe ser una URL HTTP válida sin credenciales ni parámetros.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/, '').replace(/(?:\/api)+$/, '')}/api`;
  return url.toString();
}

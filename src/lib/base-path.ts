/**
 * Базовый путь GitHub Pages.
 *
 * Для проекта вида https://user.github.io/repo/ приложение живёт не в корне,
 * а в /repo. GitHub Actions передаёт этот путь в NEXT_PUBLIC_BASE_PATH,
 * Next.js добавляет его к ссылкам и статике. Для user.github.io или
 * собственного домена переменная пустая.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "")
  .replace(/\/+$/, "")
  .replace(/^([^/])/, "/$1");

/** Превращает "/icons/x.png" в "/repo/icons/x.png" (или оставляет как есть) */
export function assetPath(path: string): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${clean}`;
}

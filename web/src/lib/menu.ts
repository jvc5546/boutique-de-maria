// The account menu in the top bar: your initial opens it; "Salir" lives
// inside, so signing out always takes two deliberate taps.
import { signOut } from './auth';

export function setupAccountMenu() {
  const btn = document.getElementById('account-btn') as HTMLButtonElement;
  const menu = document.getElementById('account-menu')!;
  const set = (open: boolean) => {
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    set(menu.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target as Node)) set(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      set(false);
      btn.focus();
    }
  });
  document.getElementById('signout')!.addEventListener('click', signOut);
}

/** Fill in the name and level shown in the menu. */
export function showAccount(name: string, level: string) {
  document.getElementById('account-initial')!.textContent = (name || '?').trim().charAt(0).toUpperCase();
  document.getElementById('account-name')!.textContent = name;
  const lv = document.getElementById('account-level')!;
  lv.textContent = level;
  lv.hidden = !level;
}

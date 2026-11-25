import { mountAdminView } from '/modules/adminView.js';
import { mountAnalystView } from '/modules/analystView.js';
import { createApi } from '/modules/api.js';
import { closeModal, initModalChrome } from '/modules/modals.js';
import { connectRealtime } from '/modules/realtime.js';

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'c360_token';
  const PROFILE_KEY = 'c360_profile';

  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');
  const passwordInput = document.getElementById('login-password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const appRoot = document.getElementById('app-root');
  const toastEl = document.getElementById('toast');

  let token = localStorage.getItem(TOKEN_KEY);
  let profile = null;
  let activeViewController = null;
  let realtimeHandle = null;
  let toastTimer = null;

  try {
    profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    token = null;
  }

  initModalChrome();

  function toast(message, isError = false) {
    toastEl.textContent = message;
    toastEl.classList.toggle('is-error', isError);
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 4000);
  }

  function teardownSession() {
    if (realtimeHandle) {
      realtimeHandle.disconnect();
      realtimeHandle = null;
    }
    if (activeViewController?.unmount) {
      activeViewController.unmount();
    }
    activeViewController = null;
  }

  function showLogin(message = '') {
    closeModal();
    teardownSession();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    token = null;
    profile = null;
    appRoot.innerHTML = '';
    appRoot.classList.add('hidden');
    document.body.dataset.theme = 'login';
    loginScreen.classList.remove('hidden');
    loginForm.reset();
    passwordInput.type = 'password';
    syncPasswordEye();

    if (message) {
      loginError.textContent = message;
      loginError.classList.remove('hidden');
    } else {
      loginError.textContent = '';
      loginError.classList.add('hidden');
    }
    document.getElementById('login-username')?.focus();
  }

  const api = createApi(
    () => token,
    (reason) => showLogin(reason || 'Tu sesión expiró. Inicia sesión de nuevo.')
  );

  function syncPasswordEye() {
    const showing = passwordInput.type === 'text';
    togglePasswordBtn.querySelector('.eye-open')?.classList.toggle('hidden', showing);
    togglePasswordBtn.querySelector('.eye-closed')?.classList.toggle('hidden', !showing);
    togglePasswordBtn.title = showing ? 'Ocultar contraseña' : 'Mostrar contraseña';
  }

  togglePasswordBtn.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    syncPasswordEye();
  });

  async function mountSession() {
    if (!token) {
      showLogin();
      return;
    }
    try {
      const session = await api('/api/auth/me');
      profile = session.user;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));

      loginScreen.classList.add('hidden');
      appRoot.classList.remove('hidden');
      teardownSession();

      const isAdmin = profile.rol === 'admin';
      document.body.dataset.theme = isAdmin ? 'admin' : 'analyst';

      const ctx = {
        api,
        profile,
        toast,
        onSwitchAccount: () => showLogin(),
      };

      activeViewController = isAdmin ? mountAdminView(appRoot, ctx) : mountAnalystView(appRoot, ctx);

      realtimeHandle = connectRealtime(token, {
        onStatus: (status) => activeViewController?.onRealtimeStatus?.(status),
        onEvent: (eventName, payload) => activeViewController?.onRealtimeEvent?.(eventName, payload),
      });
    } catch {
      showLogin('Tu sesión terminó. Inicia sesión nuevamente.');
    }
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginError.textContent = '';

    const fd = new FormData(loginForm);
    const username = String(fd.get('username') || '').trim();
    const password = String(fd.get('password') || '');

    if (!username || !password) {
      loginError.textContent = 'Ingresa tu usuario y contraseña para continuar.';
      loginError.classList.remove('hidden');
      return;
    }

    loginSubmit.disabled = true;
    loginSubmit.textContent = 'Verificando acceso…';
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      token = data.token;
      profile = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      await mountSession();
    } catch (err) {
      loginError.textContent = err.message || 'Usuario o contraseña incorrectos.';
      loginError.classList.remove('hidden');
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = 'Entrar a Community 360';
    }
  });

  mountSession();
});

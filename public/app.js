import { mountAdminView } from '/modules/adminView.js';
import { mountAnalystView } from '/modules/analystView.js';
import { createApi } from '/modules/api.js';
import { closeModal, initModalChrome } from '/modules/modals.js';
import { connectRealtime } from '/modules/realtime.js';

document.addEventListener('DOMContentLoaded', () => {
  const TOKEN_KEY = 'c360_token';
  const PROFILE_KEY = 'c360_profile';
  const COLOR_MODE_KEY = 'c360_color_mode';

  const loginScreen = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');
  const loginSubmit = document.getElementById('login-submit');
  const registerForm = document.getElementById('register-form');
  const registerError = document.getElementById('register-error');
  const registerSubmit = document.getElementById('register-submit');
  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabRegisterBtn = document.getElementById('tab-register-btn');
  const authLoginPane = document.getElementById('auth-login-pane');
  const authRegisterPane = document.getElementById('auth-register-pane');
  const loginThemeToggle = document.getElementById('login-theme-toggle');
  const passwordInput = document.getElementById('login-password');
  const togglePasswordBtn = document.getElementById('toggle-password');
  const appRoot = document.getElementById('app-root');
  const toastEl = document.getElementById('toast');

  let token = localStorage.getItem(TOKEN_KEY);
  let profile = null;
  let activeViewController = null;
  let realtimeHandle = null;
  let toastTimer = null;
  let colorMode = localStorage.getItem(COLOR_MODE_KEY) === 'dark' ? 'dark' : 'light';

  try {
    profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    token = null;
  }

  initModalChrome();

  function applyColorMode(mode) {
    colorMode = mode === 'dark' ? 'dark' : 'light';
    localStorage.setItem(COLOR_MODE_KEY, colorMode);
    document.documentElement.dataset.colorMode = colorMode;
    document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
      const isDark = colorMode === 'dark';
      const icon = btn.querySelector('.theme-icon');
      const label = btn.querySelector('.theme-label');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      if (label) label.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
      btn.title = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    });
  }

  function toggleColorMode() {
    applyColorMode(colorMode === 'dark' ? 'light' : 'dark');
  }

  applyColorMode(colorMode);
  loginThemeToggle?.addEventListener('click', toggleColorMode);

  function switchAuthTab(tab) {
    const isRegister = tab === 'register';
    tabLoginBtn?.classList.toggle('active', !isRegister);
    tabRegisterBtn?.classList.toggle('active', isRegister);
    authLoginPane?.classList.toggle('hidden', isRegister);
    authRegisterPane?.classList.toggle('hidden', !isRegister);
    loginError.classList.add('hidden');
    registerError.classList.add('hidden');
  }

  tabLoginBtn?.addEventListener('click', () => switchAuthTab('login'));
  tabRegisterBtn?.addEventListener('click', () => switchAuthTab('register'));

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
    registerForm?.reset();
    switchAuthTab('login');
    passwordInput.type = 'password';
    syncPasswordEye();
    applyColorMode(colorMode);

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
        colorMode: () => colorMode,
        onToggleColorMode: toggleColorMode,
        onSwitchAccount: () => showLogin(),
      };

      activeViewController = isAdmin ? mountAdminView(appRoot, ctx) : mountAnalystView(appRoot, ctx);
      applyColorMode(colorMode);

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

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    registerError.classList.add('hidden');
    registerError.textContent = '';

    const fd = new FormData(registerForm);
    const username = String(fd.get('username') || '').trim();
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const rol = String(fd.get('rol') || 'analista');

    if (username.length < 4) {
      registerError.textContent = 'El nombre de usuario debe tener al menos 4 caracteres.';
      registerError.classList.remove('hidden');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      registerError.textContent = 'Ingresa un correo electrónico válido.';
      registerError.classList.remove('hidden');
      return;
    }
    if (password.length < 4) {
      registerError.textContent = 'La contraseña debe tener al menos 4 caracteres.';
      registerError.classList.remove('hidden');
      return;
    }

    registerSubmit.disabled = true;
    registerSubmit.textContent = 'Creando tu cuenta…';
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password, rol }),
      });
      token = data.token;
      profile = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      toast(`¡Bienvenida/o, ${profile.username}! Tu cuenta fue creada.`);
      await mountSession();
    } catch (err) {
      registerError.textContent = err.message || 'No fue posible crear la cuenta.';
      registerError.classList.remove('hidden');
    } finally {
      registerSubmit.disabled = false;
      registerSubmit.textContent = 'Crear cuenta y entrar';
    }
  });

  mountSession();
});

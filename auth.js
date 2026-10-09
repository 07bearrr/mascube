/* ============================================================
   账号系统：注册 / 登录 / 权限
   - 用户名 + 密码（密码用 SHA-256 加盐后存储，不存明文）
   - 管理员可管理所有账号；普通用户只能看到自己的数据
   ============================================================ */
const Auth = (() => {
  const SESSION_KEY = 'mascube_session';
  const AUTH_SALT = 'mascube2026';
  let session = null; // { username, isAdmin, ts }

  /* ---- SHA-256（纯 JS 实现，兼容本地 / 云端环境） ---- */
  function sha256Hex(str) {
    const bytes = new TextEncoder().encode(str);
    const K = [
      0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
      0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
      0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
      0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
      0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
      0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
      0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
      0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const bitLenHi = Math.floor(bytes.length / 536870912);
    const bitLenLo = (bytes.length << 3) >>> 0;
    const paddedLen = (((bytes.length + 8) >>> 6) + 1) << 6;
    const padded = new Uint8Array(paddedLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(paddedLen - 8, bitLenHi >>> 0, false);
    dv.setUint32(paddedLen - 4, bitLenLo, false);
    const w = new Uint32Array(64);
    for (let off = 0; off < paddedLen; off += 64) {
      for (let t = 0; t < 16; t++) {
        w[t] = (padded[off + t * 4] << 24) | (padded[off + t * 4 + 1] << 16) | (padded[off + t * 4 + 2] << 8) | padded[off + t * 4 + 3];
      }
      for (let t = 16; t < 64; t++) {
        const x = w[t - 15], y = w[t - 2];
        const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        const ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function hashPassword(username, password) {
    return sha256Hex(AUTH_SALT + '|' + username + '|' + password);
  }

  function makeId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  /* ---- 会话 ---- */
  function loadSession() {
    try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) { session = null; }
    return session;
  }
  function saveSession(s) { session = s; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession() { session = null; localStorage.removeItem(SESSION_KEY); }
  function currentUser() { return session ? session.username : null; }
  function isAdmin() { return !!(session && session.isAdmin); }
  function loggedIn() { return !!session; }

  /* ---- 注册 / 登录 ---- */
  async function register(username, password) {
    username = (username || '').trim();
    if (!username || !password) throw new Error('用户名和密码不能为空');
    if (username.length < 2) throw new Error('用户名至少 2 个字符');
    const users = await Storage.getAll('users');
    if (users.some(u => u.username === username)) throw new Error('该账号已存在');
    const user = {
      id: makeId(),
      username,
      password: hashPassword(username, password),
      is_admin: false,
      created_at: new Date().toISOString(),
    };
    await Storage.add('users', user);
    saveSession({ username, isAdmin: false, ts: Date.now() });
    return user;
  }

  async function login(username, password) {
    username = (username || '').trim();
    if (!username || !password) throw new Error('请输入账号和密码');
    const users = await Storage.getAll('users');
    // 首次使用（还没有任何账号）时，可用 wlb 自动初始化管理员
    if (users.length === 0 && username === 'wlb') {
      const adminHash = '66376bf896cd3fd0c2e8388050e5c34e5d9c4db69016301a089be2920a78f682';
      if (hashPassword(username, password) === adminHash) {
        const admin = { id: 'admin', username: 'wlb', password: adminHash, is_admin: true, created_at: new Date().toISOString() };
        await Storage.add('users', admin);
        saveSession({ username, isAdmin: true, ts: Date.now() });
        return admin;
      }
    }
    const user = users.find(u => u.username === username);
    if (!user) throw new Error('账号不存在');
    if (hashPassword(username, password) !== user.password) throw new Error('密码错误');
    saveSession({ username, isAdmin: !!user.is_admin, ts: Date.now() });
    return user;
  }

  async function refresh() {
    if (!session) return null;
    try {
      const users = await Storage.getAll('users');
      const user = users.find(u => u.username === session.username);
      if (!user) { clearSession(); return null; }
      session.isAdmin = !!user.is_admin;
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return user;
    } catch (e) { return null; }
  }

  function logout() { clearSession(); }

  /* ---- 管理员 ---- */
  async function listUsers() {
    const users = await Storage.getAll('users');
    return users.map(u => ({ id: u.id, username: u.username, is_admin: !!u.is_admin, created_at: u.created_at }));
  }

  async function resetPassword(username, newPassword) {
    const users = await Storage.getAll('users');
    const user = users.find(u => u.username === username);
    if (!user) throw new Error('账号不存在');
    await Storage.update('users', user.id, { password: hashPassword(username, newPassword) });
  }

  return { loadSession, currentUser, isAdmin, loggedIn, register, login, refresh, logout, listUsers, resetPassword, hashPassword };
})();

// Data layer. Two interchangeable stores with the same API:
//  - FirebaseStore: shared between both phones through Firestore (works offline, syncs when back online)
//  - LocalStore:   preview mode on one device only, used until firebase-config.js is filled in
const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
export const COLLECTIONS = ["items", "tasks", "places", "guide"];

export async function createStore(config, tripId) {
  if (config && config.apiKey && !String(config.apiKey).startsWith("PASTE")) {
    const s = new FirebaseStore(config, tripId);
    await s.load();
    return s;
  }
  return new LocalStore();
}

/* ------------------------------------------------------------------ Firebase */
class FirebaseStore {
  constructor(config, tripId) { this.config = config; this.tripId = tripId; this.mode = "firebase"; this.unsubs = []; }

  async load() {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`), import(`${SDK}/firebase-firestore.js`),
    ]);
    this.a = authMod; this.f = fsMod;
    const app = appMod.initializeApp(this.config);
    this.auth = authMod.getAuth(app);
    try {
      this.db = fsMod.initializeFirestore(app, {
        localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }),
      });
    } catch {
      this.db = fsMod.getFirestore(app);
    }
  }

  onAuth(cb) { return this.a.onAuthStateChanged(this.auth, (u) => cb(u ? { email: u.email, uid: u.uid } : null)); }
  signIn(email, password) { return this.a.signInWithEmailAndPassword(this.auth, email.trim(), password); }
  signOut() { this.stop(); return this.a.signOut(this.auth); }

  col(name) { return this.f.collection(this.db, "trips", this.tripId, name); }
  metaDoc(name) { return this.f.doc(this.db, "trips", this.tripId, "meta", name); }

  // cb(state, status) — state = {items, tasks, places, guide, settings, trip}
  // status = {offline: bool, pending: bool, error?: string}
  start(cb) {
    this.stop();
    const state = { items: [], tasks: [], places: [], guide: [], settings: {}, trip: null };
    const flags = {};
    const ready = new Set();
    const emit = () => {
      const st = Object.values(flags);
      cb({ ...state, loaded: ready.size >= COLLECTIONS.length + 2 }, {
        offline: !navigator.onLine,
        pending: st.some((m) => m.hasPendingWrites),
      });
    };
    const onErr = (e) => cb(null, { error: e.code || e.message });
    for (const name of COLLECTIONS) {
      this.unsubs.push(this.f.onSnapshot(this.col(name), { includeMetadataChanges: true }, (snap) => {
        state[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        flags[name] = snap.metadata; ready.add(name); emit();
      }, onErr));
    }
    for (const name of ["settings", "trip"]) {
      this.unsubs.push(this.f.onSnapshot(this.metaDoc(name), { includeMetadataChanges: true }, (snap) => {
        state[name] = snap.exists() ? snap.data() : (name === "trip" ? null : {});
        flags["m_" + name] = snap.metadata; ready.add("m_" + name); emit();
      }, onErr));
    }
    const net = () => emit();
    window.addEventListener("online", net); window.addEventListener("offline", net);
    this.unsubs.push(() => { window.removeEventListener("online", net); window.removeEventListener("offline", net); });
  }
  stop() { this.unsubs.forEach((u) => u()); this.unsubs = []; }

  // Writes resolve when the server confirms; while offline they are queued, so callers don't await them.
  add(name, data) { return this.f.addDoc(this.col(name), { ...data, updated: Date.now() }); }
  update(name, id, data) { return this.f.updateDoc(this.f.doc(this.col(name), id), { ...data, updated: Date.now() }); }
  remove(name, id) { return this.f.deleteDoc(this.f.doc(this.col(name), id)); }
  setSettings(data) { return this.f.setDoc(this.metaDoc("settings"), data, { merge: true }); }

  async importSeed(seed, replace) {
    const ops = [];
    if (replace) {
      for (const name of COLLECTIONS) {
        const snap = await this.f.getDocs(this.col(name));
        snap.forEach((d) => ops.push((b) => b.delete(d.ref)));
      }
    }
    let n = 0;
    for (const name of COLLECTIONS) {
      for (const row of seed[name] || []) {
        const ref = this.f.doc(this.col(name));
        const data = { ...row, created: Date.now() + n++, updated: Date.now() };
        ops.push((b) => b.set(ref, data));
      }
    }
    ops.push((b) => b.set(this.metaDoc("trip"), seed.trip));
    ops.push((b) => b.set(this.metaDoc("settings"), seed.settings || {}, { merge: true }));
    for (let i = 0; i < ops.length; i += 400) {
      const batch = this.f.writeBatch(this.db);
      ops.slice(i, i + 400).forEach((op) => op(batch));
      await batch.commit();
    }
  }
}

/* ------------------------------------------------------------------ Local preview */
const KEY = "japan-trip-preview-v1";
class LocalStore {
  constructor() { this.mode = "local"; this.cb = null; }
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} this.emit(); }
  emit() {
    if (!this.cb) return;
    const s = this.read();
    this.cb({ items: s.items || [], tasks: s.tasks || [], places: s.places || [], guide: s.guide || [],
      settings: s.settings || {}, trip: s.trip || null, loaded: true }, { offline: false, pending: false });
  }
  onAuth(cb) { setTimeout(() => cb({ email: "preview", uid: "preview" }), 0); return () => {}; }
  async signIn() {}
  async signOut() {}
  start(cb) { this.cb = cb; this.emit(); }
  stop() { this.cb = null; }
  id() { return (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); }
  async add(name, data) { const s = this.read(); (s[name] ||= []).push({ id: this.id(), ...data, updated: Date.now() }); this.write(s); }
  async update(name, id, data) {
    const s = this.read(); s[name] = (s[name] || []).map((r) => (r.id === id ? { ...r, ...data, updated: Date.now() } : r)); this.write(s);
  }
  async remove(name, id) { const s = this.read(); s[name] = (s[name] || []).filter((r) => r.id !== id); this.write(s); }
  async setSettings(data) { const s = this.read(); s.settings = { ...(s.settings || {}), ...data }; this.write(s); }
  async importSeed(seed, replace) {
    const s = replace ? {} : this.read();
    let n = 0;
    for (const name of COLLECTIONS) {
      s[name] = [...(s[name] || []), ...(seed[name] || []).map((r) => ({ id: this.id(), ...r, created: Date.now() + n++ }))];
    }
    s.trip = seed.trip; s.settings = { ...(seed.settings || {}), ...(s.settings || {}) };
    this.write(s);
  }
}

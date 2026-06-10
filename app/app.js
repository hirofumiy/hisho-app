/* 秘書室 — アプリ本体
 * デモモード（鍵未設定）と本番モード（Supabase接続）の両対応。
 */

const cfg = window.HISHO_CONFIG || {};
const FORCE_DEMO = location.hash === "#demo" || localStorage.getItem("hisho.forceDemo") === "1";
const LIVE = !FORCE_DEMO &&
             cfg.SUPABASE_URL && !cfg.SUPABASE_URL.startsWith("__") &&
             cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.startsWith("__");

const CATEGORY = {
  event:    { icon: "📅", title: "今日の予定" },
  recent:   { icon: "📧", title: "直近の動き" },
  reminder: { icon: "⏰", title: "リマインダー（要返信）" },
  manual:   { icon: "📝", title: "手動タスク" },
};
const CAT_ORDER = ["event", "recent", "reminder", "manual"];
const PRI_LABEL = { high: "高", mid: "中", low: "低" };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let tasks = [];
let filter = "open";
let store = null; // data backend (demo or live)

/* ============================================================
 * データバックエンド
 * ============================================================ */

// ---- デモ（localStorage）----
const DEMO_KEY = "hisho.demo.tasks.v1";
function demoSeed() {
  const today = isoDate(new Date());
  return [
    { source:"timetree", source_id:"e1", title:"高山出張（飛騨高山ワシントンホテルプラザ 泊）", detail:"", category:"event", priority:null, sender:null, task_date:today, status:"open" },
    { source:"timetree", source_id:"e2", title:"ひなた不動産 森社長 訪問", detail:"09:00–12:00", category:"event", priority:null, sender:null, task_date:today, status:"open" },
    { source:"timetree", source_id:"e3", title:"中部電力高山支社 荒川さん 訪問", detail:"13:00–14:00", category:"event", priority:null, sender:null, task_date:today, status:"open" },
    { source:"timetree", source_id:"e4", title:"洞口不動産 柚原様 訪問", detail:"14:30–15:30", category:"event", priority:null, sender:null, task_date:today, status:"open" },
    { source:"gmail", source_id:"g1", title:"善久さん：MTG日程の返信待ち", detail:"候補日3つ返すだけ。先方が待っている状態です。", category:"recent", priority:"high", sender:"善久さん", gmail_thread_id:"DEMO1", task_date:today, status:"open" },
    { source:"gmail", source_id:"g2", title:"見澤さん：資料送付の依頼", detail:"提案書PDFを送付。", category:"recent", priority:"mid", sender:"見澤さん", gmail_thread_id:"DEMO2", task_date:today, status:"open" },
    { source:"gmail", source_id:"g3", title:"西出さん：先月の問い合わせ", detail:"12日前。返信し忘れの可能性あり。", category:"reminder", priority:"high", sender:"西出さん", gmail_thread_id:"DEMO3", task_date:today, status:"open" },
    { source:"manual", source_id:"m1", title:"銀行・郵便局", detail:"", category:"manual", priority:"mid", sender:null, task_date:today, status:"open" },
  ].map((t, i) => ({ id: "demo-" + i, handled_at: null, ...t }));
}
const demoStore = {
  async list() {
    const raw = localStorage.getItem(DEMO_KEY);
    if (!raw) { const seed = demoSeed(); localStorage.setItem(DEMO_KEY, JSON.stringify(seed)); return seed; }
    return JSON.parse(raw);
  },
  async setStatus(id, status) {
    const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    const t = all.find(x => x.id === id);
    if (t) { t.status = status; t.handled_at = status === "open" ? null : new Date().toISOString(); }
    localStorage.setItem(DEMO_KEY, JSON.stringify(all));
  },
  async add(task) {
    const all = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
    const row = { id: "demo-" + Date.now(), handled_at: null, gmail_thread_id: null, sender: null, detail: "", ...task };
    all.push(row); localStorage.setItem(DEMO_KEY, JSON.stringify(all)); return row;
  },
};

// ---- 本番（Supabase）----
async function liveStoreFactory() {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const sb = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,       // セッションをlocalStorageに保存
      autoRefreshToken: true,     // 期限切れ前に自動更新（＝ログイン維持）
      detectSessionInUrl: true,
      storage: window.localStorage,
    },
  });

  // 認証チェック（マジックリンク）
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showAuth(sb); return null; }

  return {
    sb,
    async list() {
      const { data, error } = await sb.from("tasks")
        .select("*").order("category").order("priority", { nullsFirst: false }).order("created_at");
      if (error) throw error;
      return data;
    },
    async setStatus(id, status) {
      const { error } = await sb.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    async add(task) {
      const { data, error } = await sb.from("tasks").insert(task).select().single();
      if (error) throw error;
      return data;
    },
  };
}

function showAuth(sb) {
  $("#app").style.display = "none";
  $("#fab").style.display = "none";
  const auth = $("#auth"); auth.hidden = false;
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    const btn = $("#authBtn"); btn.dataset.state = "loading";
    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.dataset.state = "";
    const msg = $("#authMsg"); msg.hidden = false;
    if (error) {
      msg.textContent = "ログインに失敗しました：" + error.message;
    } else {
      msg.textContent = "ログインしました。読み込み中…";
      location.reload();   // 再起動で保存済みセッションからアプリ表示へ
    }
  });
}

/* ============================================================
 * レンダリング
 * ============================================================ */
function isoDate(d) { return d.toLocaleDateString("sv-SE"); } // YYYY-MM-DD (local)
function todayLabel() {
  const d = new Date();
  const w = ["日","月","火","水","木","金","土"][d.getDay()];
  return { md: `${d.getMonth()+1}/${d.getDate()}`, w: `${w}曜日` };
}

function visible(t) {
  if (filter === "all") return true;
  if (filter === "open") return t.status === "open";
  return t.status === "done" || t.status === "dismissed";
}

function render() {
  // counts
  const open = tasks.filter(t => t.status === "open").length;
  const done = tasks.filter(t => t.status === "done" || t.status === "dismissed").length;
  const carry = tasks.filter(t => t.status === "open" && (t.category === "recent" || t.category === "reminder")).length;
  $("#statOpen").textContent = open;
  $("#statDone").textContent = done;
  $("#statCarry").textContent = carry;
  $("#cnt-open").textContent = open;
  $("#cnt-done").textContent = done;
  $("#cnt-all").textContent = tasks.length;
  const total = tasks.length || 1;
  $("#progressBar").style.width = Math.round(done / total * 100) + "%";

  updateBadge(open);

  // groups
  const shown = tasks.filter(visible);
  const wrap = $("#groups"); wrap.innerHTML = "";
  for (const cat of CAT_ORDER) {
    const items = shown.filter(t => t.category === cat);
    if (!items.length) continue;
    const g = document.createElement("section");
    g.className = "group";
    g.innerHTML = `<div class="group__head">
        <span class="group__icon">${CATEGORY[cat].icon}</span>
        <h2 class="group__title">${CATEGORY[cat].title}</h2>
        <span class="group__rule"></span>
      </div><ul class="list"></ul>`;
    const ul = g.querySelector(".list");
    items.forEach(t => ul.appendChild(taskEl(t)));
    wrap.appendChild(g);
  }

  const isEmpty = shown.length === 0;
  $("#empty").hidden = !isEmpty;
  $("#emptyText").textContent =
    filter === "open" ? "未対応はありません。お疲れさまでした。"
    : filter === "done" ? "対応済のタスクはまだありません。"
    : "タスクがありません。";
}

function taskEl(t) {
  const li = document.createElement("li");
  li.className = "task" + (t.status !== "open" ? " is-done" : "");
  li.dataset.id = t.id;

  const meta = [];
  if (t.sender) meta.push(escapeHtml(t.sender));
  if (t.priority) meta.push(`<span class="pri"><span class="dot dot--${t.priority}"></span>${PRI_LABEL[t.priority]}</span>`);

  const thread = (t.source === "gmail" && t.gmail_thread_id && !String(t.gmail_thread_id).startsWith("DEMO"))
    ? `<a class="threadlink" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(t.gmail_thread_id)}" target="_blank" rel="noopener" aria-label="メールを開く">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>
       </a>` : "";

  li.innerHTML = `
    <button class="task__check" aria-pressed="${t.status !== "open"}" aria-label="対応済にする">
      <span class="ring"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>
    </button>
    <div class="task__body">
      <p class="task__title">${escapeHtml(t.title)}</p>
      ${meta.length ? `<div class="task__meta">${meta.join("")}</div>` : ""}
      ${t.detail ? `<div class="task__detail">${escapeHtml(t.detail)}</div>` : ""}
    </div>
    <div class="task__side">${thread}</div>`;

  li.querySelector(".task__check").addEventListener("click", () => toggle(t.id));
  return li;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

/* ============================================================
 * 操作（楽観的更新 + Undo）
 * ============================================================ */
let undoTimer = null;
async function toggle(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const prev = t.status;
  const next = prev === "open" ? "done" : "open";
  t.status = next;                       // 楽観的更新
  t.handled_at = next === "open" ? null : new Date().toISOString();
  render();
  try { await store.setStatus(id, next); }
  catch (e) { t.status = prev; render(); showError("更新に失敗しました。"); return; }

  if (next === "done") showToast("対応済にしました", () => toggle(id));
}

async function addManual(title, priority) {
  const row = { source:"manual", source_id: cryptoId(), title, detail:"", category:"manual", priority, task_date: isoDate(new Date()), status:"open" };
  try {
    const saved = await store.add(row);
    tasks.push(saved); render();
  } catch (e) { showError("追加に失敗しました。"); }
}
function cryptoId() {
  return (crypto.randomUUID && crypto.randomUUID()) || ("m-" + Date.now());
}

/* ============================================================
 * UI: toast / sheet / tabs / error
 * ============================================================ */
function showToast(text, onUndo) {
  const el = $("#toast"); $("#toastText").textContent = text;
  el.classList.add("is-open");
  clearTimeout(undoTimer);
  const undo = $("#toastUndo");
  undo.onclick = () => { el.classList.remove("is-open"); onUndo && onUndo(); };
  undoTimer = setTimeout(() => el.classList.remove("is-open"), 4000);
}
function showError(msg) {
  const b = $("#errorBanner"); $("#errorText").textContent = msg; b.hidden = false;
  setTimeout(() => { b.hidden = true; }, 6000);
}

/* ===== アプリアイコンの未対応バッジ（iOS16.4+ / ホーム画面追加時） ===== */
function badgeReady() {
  return ("setAppBadge" in navigator) &&
         (typeof Notification !== "undefined") &&
         (Notification.permission === "granted");
}
function updateBadge(open) {
  if (!badgeReady()) return;
  try { open > 0 ? navigator.setAppBadge(open) : navigator.clearAppBadge(); } catch (e) {}
}
function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
         window.navigator.standalone === true;
}
function maybeOfferBadge() {
  // ホーム画面追加済み & 通知未許可のときだけ「有効にする」案内を出す
  if (!("setAppBadge" in navigator) || typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (!isStandalone()) return;
  const b = $("#badgeBanner");
  if (b) b.hidden = false;
}
async function enableBadge() {
  const b = $("#badgeBanner"); if (b) b.hidden = true;
  try {
    const p = await Notification.requestPermission();
    if (p === "granted") updateBadge(tasks.filter(t => t.status === "open").length);
  } catch (e) {}
}

function openSheet() {
  $("#scrim").classList.add("is-open");
  $("#sheet").classList.add("is-open");
  $("#sheet").setAttribute("aria-hidden", "false");
  setTimeout(() => $("#addTitle").focus(), 280);
}
function closeSheet() {
  $("#scrim").classList.remove("is-open");
  $("#sheet").classList.remove("is-open");
  $("#sheet").setAttribute("aria-hidden", "true");
}

/* ============================================================
 * 起動
 * ============================================================ */
async function boot() {
  const { md, w } = todayLabel();
  $("#dateLabel").innerHTML = `<b>${md}</b><span>${w}</span>`;

  // backend 選択
  if (LIVE) {
    try { store = await liveStoreFactory(); if (!store) return; /* auth画面表示中 */ }
    catch (e) { showError("Supabase接続に失敗しました。デモに切替えます。"); }
  }
  if (!store) { store = demoStore; $("#demoBanner").hidden = false; }

  // データ取得
  try { tasks = await store.list(); }
  catch (e) { showError("データ取得に失敗しました。"); tasks = []; }
  render();
  $("#syncLabel").textContent = "最終更新 " + new Date().toLocaleTimeString("ja-JP", { hour:"2-digit", minute:"2-digit" });

  // events
  $$('input[name="filter"]').forEach(r => r.addEventListener("change", e => { filter = e.target.value; render(); }));
  $("#fab").addEventListener("click", openSheet);
  $("#scrim").addEventListener("click", closeSheet);
  const badgeBtn = $("#badgeEnable");
  if (badgeBtn) badgeBtn.addEventListener("click", enableBadge);
  maybeOfferBadge();
  $("#addForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#addTitle").value.trim(); if (!title) return;
    const pri = ($('input[name="pri"]:checked') || {}).value || "mid";
    closeSheet();
    await addManual(title, pri);
    $("#addTitle").value = "";
  });
  $("#syncBtn").addEventListener("click", async () => {
    const b = $("#syncBtn"); b.classList.add("is-syncing");
    try { tasks = await store.list(); render(); $("#syncLabel").textContent = "最終更新 " + new Date().toLocaleTimeString("ja-JP", { hour:"2-digit", minute:"2-digit" }); }
    catch (e) { showError("再読み込みに失敗しました。"); }
    finally { setTimeout(() => b.classList.remove("is-syncing"), 600); }
  });
}

// service worker（新版を検知したら自動で再読込＝以後キャッシュ手動クリア不要）
if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.update();
        setInterval(() => reg.update(), 60 * 60 * 1000); // 1時間ごとに更新確認
      })
      .catch(() => {});
  });
}

boot();

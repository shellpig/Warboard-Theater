// i18n:引擎 UI 字典 t(key) + 戰役內容多語物件解析 pick(obj)

export const LANGS = ["zh-TW", "zh-CN", "en", "ja"];
const FALLBACK = "zh-TW";
const STORAGE_KEY = "wt-lang";

export const LANG_NAMES = {
  "zh-TW": "繁體中文",
  "zh-CN": "简体中文",
  "en": "English",
  "ja": "日本語",
};

const DICT = {
  "zh-TW": {
    brand: "戰局劇場",
    tagline: "歷史戰役 3D 推演劇場",
    coming_soon: "即將上演",
    back_to_menu: "節目單",
    loading: "載入中…",
    load_error: "載入失敗",
    troops: "兵力",
    based_on: "本推演依《{src}》敘事",
  },
  "zh-CN": {
    brand: "战局剧场",
    tagline: "历史战役 3D 推演剧场",
    coming_soon: "即将上演",
    back_to_menu: "节目单",
    loading: "加载中…",
    load_error: "加载失败",
    troops: "兵力",
    based_on: "本推演依《{src}》叙事",
  },
  "en": {
    brand: "Warboard Theater",
    tagline: "A 3D theater of historic battles",
    coming_soon: "Coming Soon",
    back_to_menu: "Program",
    loading: "Loading…",
    load_error: "Failed to load",
    troops: "Troops",
    based_on: "Based on {src}",
  },
  "ja": {
    brand: "戦局シアター",
    tagline: "歴史合戦を再現する3Dシアター",
    coming_soon: "近日公開",
    back_to_menu: "番組表",
    loading: "読み込み中…",
    load_error: "読み込みに失敗しました",
    troops: "兵力",
    based_on: "『{src}』に基づく",
  },
};

let current = FALLBACK;

// 解析順序:?lang= 參數 → localStorage → navigator → zh-TW
export function initI18n() {
  const param = new URLSearchParams(location.search).get("lang");
  const stored = localStorage.getItem(STORAGE_KEY);
  let lang = param || stored;
  if (!lang) {
    const nav = navigator.language || "";
    if (/^zh-?(TW|HK|Hant)/i.test(nav)) lang = "zh-TW";
    else if (/^zh/i.test(nav)) lang = "zh-CN";
    else if (/^ja/i.test(nav)) lang = "ja";
    else lang = "en";
  }
  current = LANGS.includes(lang) ? lang : FALLBACK;
  document.documentElement.lang = current;
  return current;
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) return;
  localStorage.setItem(STORAGE_KEY, lang);
  const url = new URL(location.href);
  url.searchParams.set("lang", lang);
  location.href = url.toString();
}

export function t(key, vars) {
  let s = DICT[current]?.[key] ?? DICT[FALLBACK][key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}

// 內容字串:純字串視為單語;多語物件 fallback 鏈 = 目標語系 → zh-TW → 第一個值
export function pick(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[current] ?? value[FALLBACK] ?? Object.values(value)[0] ?? "";
}

export function createLangSwitcher() {
  const sel = document.createElement("select");
  sel.className = "lang-switcher";
  for (const lang of LANGS) {
    const opt = document.createElement("option");
    opt.value = lang;
    opt.textContent = LANG_NAMES[lang];
    opt.selected = lang === current;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => setLang(sel.value));
  return sel;
}

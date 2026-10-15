/* Micro-blog: public feed from data/posts.json, author mode behind a password,
   publishing through the GitHub Contents API with a token kept in this browser. */
(() => {
  const OWNER = "myangell5522";
  const REPO_CANDIDATES = ["myangellpage.io", `${OWNER}.github.io`];
  const POSTS_PATH = "data/posts.json";
  const MEDIA_DIR = "media/posts";
  const PASS_HASH = "1c93a522bb1ab7d9014fd591be2e5c741e0f16857cdd1f394587c302d454875f";
  const MAX_LEN = 1000;
  const KEY = {
    author: "blog:author",
    token: "blog:token",
    repo: "blog:repo",
  };
  const TAGS = {
    wip: "WIP",
    release: "Релиз",
    update: "Апдейт",
  };

  const $ = (sel) => document.querySelector(sel);
  const feed = $("#feed");
  const countEl = $("#blog-count");
  const composer = $("#composer");
  const textArea = $("#composer-text");
  const fileInput = $("#composer-file");
  const previewBox = $("#composer-preview");
  const submitBtn = $("#composer-submit");
  const charCount = $("#composer-count");
  const statusEl = $("#composer-status");
  const authDialog = $("#auth");
  const tokenDialog = $("#token");
  const toastEl = $("#toast");

  let posts = [];
  let selectedTag = "";
  let attached = null; // { file, url }
  let busy = false;

  /* ---------- storage helpers ---------- */

  function store(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable */
    }
  }

  function load(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /* ---------- profile ---------- */

  function profile() {
    return (
      window.siteProfile || {
        name: "myangell",
        login: OWNER,
        avatar: `https://github.com/${OWNER}.png`,
      }
    );
  }

  window.addEventListener("profile", () => {
    document.querySelectorAll("[data-me-avatar]").forEach((img) => (img.src = profile().avatar));
    render();
  });

  /* ---------- formatting ---------- */

  const fmtFull = new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Moscow",
  });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Europe/Moscow" });
  const fmtShortYear = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Moscow",
  });

  function plural(value, one, few, many) {
    const n10 = value % 10;
    const n100 = value % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  function relative(date) {
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 45) return "только что";
    if (diff < 3600) return `${Math.round(diff / 60)} мин`;
    if (diff < 86400) return `${Math.round(diff / 3600)} ч`;
    if (diff < 172800) return "вчера";
    if (diff < 7 * 86400) {
      const d = Math.round(diff / 86400);
      return `${d} ${plural(d, "день", "дня", "дней")} назад`;
    }
    return new Date().getFullYear() === date.getFullYear() ? fmtShort.format(date) : fmtShortYear.format(date);
  }

  function safeImage(src) {
    if (typeof src !== "string") return "";
    if (/^media\/posts\/[\w.-]+$/.test(src)) return src;
    if (src.startsWith("blob:")) return src;
    try {
      const url = new URL(src);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function linkify(text) {
    const frag = document.createDocumentFragment();
    const re = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;
    let last = 0;
    let match;
    while ((match = re.exec(text))) {
      if (match.index > last) frag.append(text.slice(last, match.index));
      const a = document.createElement("a");
      a.href = match[0];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = match[0].replace(/^https?:\/\/(www\.)?/, "");
      frag.append(a);
      last = match.index + match[0].length;
    }
    if (last < text.length) frag.append(text.slice(last));
    return frag;
  }

  /* ---------- rendering ---------- */

  const CHECK_ICON =
    '<svg class="post__check" viewBox="0 0 24 24" aria-label="Автор"><path fill="currentColor" d="M22.5 12.5c0-1.58-.88-2.95-2.15-3.6.15-.44.23-.91.23-1.4 0-2.21-1.71-4-3.82-4-.47 0-.92.08-1.34.25C14.8 2.48 13.5 1.5 12 1.5s-2.8.98-3.42 2.25c-.42-.17-.87-.25-1.34-.25-2.11 0-3.82 1.79-3.82 4 0 .49.08.96.23 1.4C2.38 9.55 1.5 10.92 1.5 12.5c0 1.5.8 2.8 1.97 3.48-.03.17-.04.34-.04.52 0 2.21 1.71 4 3.82 4 .47 0 .92-.09 1.34-.25.62 1.27 1.92 2.25 3.41 2.25s2.8-.98 3.42-2.25c.42.16.87.25 1.34.25 2.11 0 3.82-1.79 3.82-4 0-.18-.01-.35-.04-.52 1.17-.68 1.97-1.98 1.97-3.48zm-6.13-3.17-5.25 7.5c-.18.25-.46.4-.77.42h-.05c-.29 0-.57-.13-.76-.35l-2.75-3.25 1.52-1.29 1.92 2.27 4.5-6.43 1.64 1.13z"/></svg>';
  const LINK_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const TRASH_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function postNode(post, index, { fresh = false } = {}) {
    const me = profile();
    const article = document.createElement("article");
    article.className = `post${fresh ? " post--new" : ""}`;
    article.id = `post-${post.id}`;
    article.style.setProperty("--i", String(Math.min(index, 10)));

    const avatar = document.createElement("img");
    avatar.className = "post__avatar";
    avatar.src = me.avatar;
    avatar.alt = "";
    avatar.width = 40;
    avatar.height = 40;
    avatar.loading = "lazy";

    const body = document.createElement("div");
    body.className = "post__body";

    const head = document.createElement("div");
    head.className = "post__head";
    const name = document.createElement("span");
    name.className = "post__name";
    name.textContent = me.name;
    head.append(name);
    head.insertAdjacentHTML("beforeend", CHECK_ICON);
    const handle = document.createElement("span");
    handle.className = "post__handle";
    handle.textContent = `@${me.login}`;
    const dot = document.createElement("span");
    dot.className = "post__dot";
    dot.textContent = "·";
    const date = new Date(post.createdAt);
    const time = document.createElement("a");
    time.className = "post__time";
    time.href = `#post-${post.id}`;
    time.dataset.time = post.createdAt;
    if (!Number.isNaN(date.getTime())) {
      time.textContent = relative(date);
      time.title = `${fmtFull.format(date)} МСК`;
    }
    head.append(handle, dot, time);
    if (post.tag && TAGS[post.tag]) {
      const tag = document.createElement("span");
      tag.className = `post__tag post__tag--${post.tag}`;
      tag.textContent = TAGS[post.tag];
      head.append(tag);
    }
    body.append(head);

    if (post.text) {
      const text = document.createElement("p");
      text.className = "post__text";
      text.append(linkify(String(post.text)));
      body.append(text);
    }

    const imageSrc = safeImage(post.image);
    if (imageSrc) {
      const img = document.createElement("img");
      img.className = "post__image";
      img.src = imageSrc;
      img.alt = "";
      img.loading = "lazy";
      img.addEventListener("click", () => openLightbox(imageSrc));
      img.addEventListener("error", () => img.remove());
      body.append(img);
    }

    const actions = document.createElement("div");
    actions.className = "post__actions";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "post__action";
    copy.innerHTML = `${LINK_ICON}<span>Ссылка</span>`;
    copy.addEventListener("click", async () => {
      const url = `${location.origin}${location.pathname}#post-${post.id}`;
      try {
        await navigator.clipboard.writeText(url);
        toast("Ссылка скопирована");
      } catch {
        location.hash = `post-${post.id}`;
      }
    });
    actions.append(copy);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "post__action post__action--delete";
    del.innerHTML = `${TRASH_ICON}<span>Удалить</span>`;
    let armed = 0;
    del.addEventListener("click", () => {
      if (!armed) {
        del.querySelector("span").textContent = "Точно?";
        armed = setTimeout(() => {
          armed = 0;
          del.querySelector("span").textContent = "Удалить";
        }, 3000);
        return;
      }
      clearTimeout(armed);
      armed = 0;
      removePost(post, article);
    });
    actions.append(del);
    body.append(actions);

    article.append(avatar, body);
    return article;
  }

  function render(freshId) {
    const list = posts
      .filter((p) => p && p.id && p.createdAt)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    countEl.textContent = list.length ? `${list.length} ${plural(list.length, "пост", "поста", "постов")}` : "";
    if (!list.length) {
      const empty = document.createElement("p");
      empty.className = "muted feed__empty";
      empty.textContent = isAuthor() ? "Пока пусто. Напишите первый пост ↑" : "Пока тут тихо. Загляните позже ✦";
      feed.replaceChildren(empty);
      return;
    }
    feed.replaceChildren(...list.map((post, i) => postNode(post, i, { fresh: post.id === freshId })));
  }

  setInterval(() => {
    document.querySelectorAll(".post__time[data-time]").forEach((el) => {
      const d = new Date(el.dataset.time);
      if (!Number.isNaN(d.getTime())) el.textContent = relative(d);
    });
  }, 60000);

  function openLightbox(src) {
    const box = document.createElement("div");
    box.className = "lightbox";
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    box.append(img);
    const close = () => {
      box.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => e.key === "Escape" && close();
    box.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.append(box);
  }

  let toastTimer = 0;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    toastEl.style.animation = "none";
    void toastEl.offsetWidth;
    toastEl.style.animation = "";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.hidden = true), 3200);
  }

  /* ---------- loading ---------- */

  async function loadPublic() {
    try {
      const res = await fetch(`./${POSTS_PATH}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      posts = Array.isArray(data) ? data : Array.isArray(data.posts) ? data.posts : [];
    } catch {
      posts = [];
    }
    render();
    scrollToHash();
  }

  async function loadFresh() {
    // Author with a token reads straight from the repo, so new posts show up
    // before GitHub Pages finishes rebuilding.
    if (!isAuthor() || !load(KEY.token)) return;
    try {
      const { list } = await readPosts();
      posts = list;
      render();
    } catch {
      /* keep the public copy */
    }
  }

  function scrollToHash() {
    if (!location.hash.startsWith("#post-")) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("post--new");
    }
  }

  /* ---------- auth ---------- */

  function isAuthor() {
    return load(KEY.author) === "1";
  }

  function applyAuthor() {
    const on = isAuthor();
    document.documentElement.classList.toggle("is-author", on);
    composer.hidden = !on;
    $("#lock-btn").setAttribute("aria-label", on ? "Написать пост" : "Войти как автор");
    $("#lock-btn").title = on ? "Режим автора включён" : "Режим автора";
    document.querySelectorAll("[data-me-avatar]").forEach((img) => (img.src = profile().avatar));
  }

  async function sha256(text) {
    if (!crypto?.subtle) throw new Error("no-subtle");
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    const input = dialog.querySelector("input");
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  document.querySelectorAll("dialog [data-close]").forEach((btn) =>
    btn.addEventListener("click", () => closeDialog(btn.closest("dialog"))),
  );
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeDialog(dialog);
    }),
  );

  $("#lock-btn").addEventListener("click", () => {
    if (isAuthor()) {
      composer.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => textArea.focus({ preventScroll: true }), 300);
      return;
    }
    $("#auth-password").value = "";
    $("#auth-error").textContent = "";
    openDialog(authDialog);
  });

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = $("#auth-password");
    const card = $("#auth-form");
    let ok = false;
    try {
      ok = (await sha256(input.value)) === PASS_HASH;
    } catch {
      $("#auth-error").textContent = "Браузер не поддерживает проверку пароля здесь (нужен https).";
      return;
    }
    if (!ok) {
      $("#auth-error").textContent = "Неверный пароль";
      card.classList.remove("is-shaking");
      void card.offsetWidth;
      card.classList.add("is-shaking");
      input.select();
      return;
    }
    store(KEY.author, "1");
    closeDialog(authDialog);
    applyAuthor();
    render();
    toast("Режим автора включён ✦");
    if (!load(KEY.token)) setTimeout(() => askToken(), 400);
    else loadFresh();
    setTimeout(() => textArea.focus(), 450);
  });

  $("#logout-btn").addEventListener("click", () => {
    store(KEY.author, null);
    applyAuthor();
    render();
    toast("Вы вышли из режима автора");
  });

  let tokenResolve = null;
  function askToken() {
    $("#token-value").value = "";
    $("#token-error").textContent = "";
    openDialog(tokenDialog);
    return new Promise((resolve) => {
      tokenResolve = resolve;
    });
  }

  tokenDialog.addEventListener("close", () => {
    if (tokenResolve) {
      tokenResolve(load(KEY.token));
      tokenResolve = null;
    }
  });

  $("#token-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const value = $("#token-value").value.trim();
    const err = $("#token-error");
    if (!value) {
      err.textContent = "Вставьте токен";
      return;
    }
    err.textContent = "Проверяю…";
    store(KEY.token, value);
    store(KEY.repo, null);
    try {
      await resolveRepo();
      err.textContent = "";
      closeDialog(tokenDialog);
      toast("Токен сохранён");
      loadFresh();
    } catch (error) {
      store(KEY.token, null);
      err.textContent = error.message || "Токен не подошёл";
    }
  });

  /* ---------- GitHub API ---------- */

  async function gh(path, options = {}) {
    const token = load(KEY.token);
    const res = await fetch(`https://api.github.com${path}`, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
    return res;
  }

  async function resolveRepo() {
    const cached = load(KEY.repo);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        /* refetch */
      }
    }
    let lastStatus = 0;
    for (const name of REPO_CANDIDATES) {
      const res = await gh(`/repos/${OWNER}/${name}`);
      lastStatus = res.status;
      if (res.ok) {
        const data = await res.json();
        if (data.permissions && !data.permissions.push) {
          throw new Error("У токена нет права записи в репозиторий");
        }
        const info = { full: data.full_name, branch: data.default_branch || "main" };
        store(KEY.repo, JSON.stringify(info));
        return info;
      }
      if (res.status === 401) throw new Error("Токен недействителен или истёк");
    }
    throw new Error(lastStatus === 404 ? "Нет доступа к репозиторию сайта" : `GitHub ответил ${lastStatus}`);
  }

  function b64encodeUtf8(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function b64decodeUtf8(b64) {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function readPosts() {
    const repo = await resolveRepo();
    const res = await gh(`/repos/${repo.full}/contents/${POSTS_PATH}?ref=${encodeURIComponent(repo.branch)}&t=${Date.now()}`, {
      cache: "no-store",
    });
    if (res.status === 404) return { repo, list: [], sha: undefined };
    if (!res.ok) throw new Error(`Не удалось прочитать посты (${res.status})`);
    const data = await res.json();
    let list = [];
    try {
      const parsed = JSON.parse(b64decodeUtf8(data.content || ""));
      list = Array.isArray(parsed) ? parsed : parsed.posts || [];
    } catch {
      list = [];
    }
    return { repo, list, sha: data.sha };
  }

  async function writePosts(mutate, message) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { repo, list, sha } = await readPosts();
      const next = mutate(list.slice());
      const res = await gh(`/repos/${repo.full}/contents/${POSTS_PATH}`, {
        method: "PUT",
        body: JSON.stringify({
          message,
          content: b64encodeUtf8(`${JSON.stringify(next, null, 2)}\n`),
          branch: repo.branch,
          ...(sha ? { sha } : {}),
        }),
      });
      if (res.ok) return next;
      if (res.status === 409 || res.status === 422) continue; // file changed meanwhile — retry
      if (res.status === 401 || res.status === 403) {
        throw new Error("Нет доступа: проверьте токен (Contents: Read and write)");
      }
      throw new Error(`GitHub ответил ${res.status}`);
    }
    throw new Error("Не удалось сохранить: файл постоянно меняется, попробуйте ещё раз");
  }

  async function uploadImage(blob, id) {
    const repo = await resolveRepo();
    const ext = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[blob.type] || "img";
    const path = `${MEDIA_DIR}/${id}.${ext}`;
    const b64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("Не удалось прочитать картинку"));
      reader.readAsDataURL(blob);
    });
    const res = await gh(`/repos/${repo.full}/contents/${path}`, {
      method: "PUT",
      body: JSON.stringify({ message: `Blog image ${id}`, content: b64, branch: repo.branch }),
    });
    if (!res.ok) throw new Error(`Картинка не загрузилась (${res.status})`);
    return path;
  }

  async function deleteFile(path) {
    try {
      const repo = await resolveRepo();
      const info = await gh(`/repos/${repo.full}/contents/${path}?ref=${encodeURIComponent(repo.branch)}`);
      if (!info.ok) return;
      const { sha } = await info.json();
      await gh(`/repos/${repo.full}/contents/${path}`, {
        method: "DELETE",
        body: JSON.stringify({ message: `Remove blog image`, sha, branch: repo.branch }),
      });
    } catch {
      /* best effort */
    }
  }

  // Shrink big photos before upload so the repo stays light. GIFs stay animated.
  async function prepareImage(file) {
    if (file.type === "image/gif") return file;
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 600 * 1024) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
      return blob && blob.size < file.size ? blob : file;
    } catch {
      return file;
    }
  }

  /* ---------- composer ---------- */

  function updateComposer() {
    const len = textArea.value.length;
    charCount.textContent = `${len}/${MAX_LEN}`;
    charCount.classList.toggle("is-near", len > MAX_LEN * 0.9);
    submitBtn.disabled = busy || (!textArea.value.trim() && !attached);
  }

  function setStatus(text, error = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("is-error", error);
  }

  textArea.addEventListener("input", () => {
    textArea.style.height = "auto";
    textArea.style.height = `${Math.min(320, textArea.scrollHeight)}px`;
    updateComposer();
  });

  textArea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  document.querySelectorAll(".tag-pick").forEach((btn) =>
    btn.addEventListener("click", () => {
      selectedTag = btn.dataset.tag;
      document.querySelectorAll(".tag-pick").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    }),
  );

  function clearAttachment() {
    if (attached?.url) URL.revokeObjectURL(attached.url);
    attached = null;
    previewBox.hidden = true;
    previewBox.replaceChildren();
    fileInput.value = "";
    updateComposer();
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStatus("Картинка больше 8 МБ", true);
      fileInput.value = "";
      return;
    }
    clearAttachment();
    attached = { file, url: URL.createObjectURL(file) };
    const img = document.createElement("img");
    img.src = attached.url;
    img.alt = "";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Убрать картинку");
    remove.addEventListener("click", clearAttachment);
    previewBox.replaceChildren(img, remove);
    previewBox.hidden = false;
    updateComposer();
  });

  composer.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = textArea.value.trim().slice(0, MAX_LEN);
    if (!text && !attached) return;

    if (!load(KEY.token)) {
      const token = await askToken();
      if (!token) {
        setStatus("Без токена GitHub опубликовать не получится", true);
        return;
      }
    }

    busy = true;
    updateComposer();
    submitBtn.textContent = "Публикую…";
    setStatus("");
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    try {
      let image;
      if (attached) {
        setStatus("Загружаю картинку…");
        image = await uploadImage(await prepareImage(attached.file), id);
      }
      setStatus("Сохраняю пост…");
      const post = { id, createdAt: new Date().toISOString(), text, ...(selectedTag ? { tag: selectedTag } : {}), ...(image ? { image } : {}) };
      const localImage = attached?.url;
      posts = await writePosts((list) => [post, ...list.filter((p) => p.id !== id)], `Blog: ${text.slice(0, 50) || "image"}`);
      // Show the local preview until Pages serves the uploaded file.
      if (image && localImage) {
        const shown = posts.find((p) => p.id === id);
        if (shown) shown.image = localImage;
        attached = null;
      }
      textArea.value = "";
      textArea.style.height = "";
      clearAttachment();
      render(id);
      if (image && localImage) posts.find((p) => p.id === id).image = image;
      setStatus("Опубликовано. Для всех появится через минуту, после пересборки сайта.");
      toast("Пост опубликован ✦");
    } catch (error) {
      setStatus(error.message || "Ошибка публикации", true);
    } finally {
      busy = false;
      submitBtn.textContent = "Опубликовать";
      updateComposer();
    }
  });

  async function removePost(post, node) {
    if (!load(KEY.token)) {
      const token = await askToken();
      if (!token) return;
    }
    node.style.transition = "opacity 0.3s, transform 0.3s";
    node.style.opacity = "0.4";
    try {
      posts = await writePosts((list) => list.filter((p) => p.id !== post.id), `Blog: remove post ${post.id}`);
      if (typeof post.image === "string" && post.image.startsWith(`${MEDIA_DIR}/`)) deleteFile(post.image);
      node.style.transform = "translateX(30px)";
      node.style.opacity = "0";
      setTimeout(render, 300);
      toast("Пост удалён");
    } catch (error) {
      node.style.opacity = "";
      toast(error.message || "Не удалось удалить");
    }
  }

  /* ---------- start ---------- */

  applyAuthor();
  updateComposer();
  loadPublic().then(loadFresh);
})();

/**
 * SillyTavern Extension: Fragment Hub (灵感碎片 · 剧情与番外便签系统)
 * Author: Daigo
 * Version: 1.0.0
 */

(function () {
  const MODULE_NAME = "fragment_hub";
  const STORAGE_KEY = "ST_FRAGMENT_HUB_DATA";

  // 默认初始数据（针对酒馆剧情、角色对白、伏笔与番外深度定制）
  const DEFAULT_SETTINGS = {
    custom_categories: ["灵感脑洞", "剧情伏笔", "番外短篇", "角色对白/设定", "世界观/世界书"],
    custom_tags: ["伏笔", "高光时刻", "情感转折", "修罗场", "打斗", "日常", "世界观设定", "对话碎片"],
    custom_redact_words: ["秘密", "底牌", "真名", "弱点", "背叛"],
    isRedactViewEnabled: false,
    tagMatchMode: "and",
    sortBy: "updated_desc",
    fragments: [
      {
        id: 1,
        title: "深夜密谈·隐秘誓约",
        category: "剧情伏笔",
        tags: "伏笔, 情感转折, 秘密",
        content: "夜色渐深，窗外的雨声敲击着玻璃。他低声开口：「如果有一天我站在你的对立面，不要犹豫。」\n对方没有回答，只是静静地将手中的黑棋落下，棋子在棋盘上发出清脆的声响。\n「我不会给你那个机会。」",
        char_count: 98,
        created_at: "2026-09-15 20:30:00",
        updated_at: "2026-09-15 20:30:00"
      },
      {
        id: 2,
        title: "异能共鸣与延迟代价",
        category: "世界观/世界书",
        tags: "世界观设定, 战斗, 弱点",
        content: "【精神共鸣机制】\n1. 双向共感建立后，痛觉将以 50% 比例分摊，但神经反射延迟会增加 0.5 秒。\n2. 在过载状态下，两人的信息素/精神频率会发生共振，可能导致短期记忆混淆与幻觉。",
        char_count: 94,
        created_at: "2026-09-15 21:00:00",
        updated_at: "2026-09-15 21:00:00"
      },
      {
        id: 3,
        title: "雨夜重逢·便利店番外",
        category: "番外短篇",
        tags: "日常, 高光时刻, 对话碎片",
        content: "凌晨两点四十分，便利店自动玻璃门伴随着电子音滑开。外面是暴雨，他浑身湿透，手里只攥着一把坏掉的黑伞骨架。另一个人正站在热气腾腾的关东煮铁格前面，回过头时手里还捏着两串萝卜。\n\n「没带伞吗？」那人问。他摇摇头，视线却落在那人沾了雨丝的发梢上。",
        char_count: 138,
        created_at: "2026-09-15 22:15:00",
        updated_at: "2026-09-15 22:15:00"
      }
    ]
  };

  // 运行期状态
  const state = {
    settings: null,
    currentCategory: "",
    selectedTags: new Set(),
    tagMatchMode: "and",
    sortBy: "updated_desc",
    searchKeyword: "",
    editingFragment: null,
    isBatchMode: false,
    selectedFragmentIds: new Set(),
    isHomeTagPoolExpanded: false,
    isEditorTagPoolExpanded: false,
    isRedactViewEnabled: false,
    shareCardTheme: "morandi-warm",
    shareApplyRedact: true,
    shareShowTags: true,
    shareShowFooter: true,
    undoStack: [],
    redoStack: [],
    isUndoRedoing: false,
    docMatches: [],
    docCurrentMatchIndex: -1,
    isOpen: false
  };


  // 防抖函数
  function debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // 提示信息 Toast
  function showToast(msg) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = "block";
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = "none";
    }, 2200);
  }

  // 时间格式化
  function formatDate(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr.replace(/-/g, "/"));
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function getNowDateString() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeRegExp(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // 获取 SillyTavern 宿主环境上下文
  function getSTContext() {
    return typeof SillyTavern !== "undefined" && SillyTavern.getContext ? SillyTavern.getContext() : null;
  }

  // 持久化存储 (SillyTavern 扩展配置 + localStorage 本地双重持久化)
  function saveStorage() {
    const ctx = getSTContext();
    if (ctx && ctx.extension_settings) {
      ctx.extension_settings[MODULE_NAME] = state.settings;
      if (typeof ctx.saveSettingsDebounced === "function") {
        ctx.saveSettingsDebounced();
      }
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn("[FragmentHub] localStorage save failed:", e);
    }
  }

  // 加载数据
  function loadStorage() {
    const ctx = getSTContext();
    let loaded = null;
    if (ctx && ctx.extension_settings && ctx.extension_settings[MODULE_NAME]) {
      loaded = ctx.extension_settings[MODULE_NAME];
    }
    if (!loaded) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) loaded = JSON.parse(raw);
      } catch (e) {
        console.warn("[FragmentHub] localStorage load failed:", e);
      }
    }

    state.settings = Object.assign({}, DEFAULT_SETTINGS, loaded || {});
    if (!Array.isArray(state.settings.fragments)) state.settings.fragments = [...DEFAULT_SETTINGS.fragments];
    if (!Array.isArray(state.settings.custom_categories)) state.settings.custom_categories = [...DEFAULT_SETTINGS.custom_categories];
    if (!Array.isArray(state.settings.custom_tags)) state.settings.custom_tags = [...DEFAULT_SETTINGS.custom_tags];
    if (!Array.isArray(state.settings.custom_redact_words)) state.settings.custom_redact_words = [...DEFAULT_SETTINGS.custom_redact_words];

    state.isRedactViewEnabled = !!state.settings.isRedactViewEnabled;
    state.tagMatchMode = state.settings.tagMatchMode || "and";
    state.sortBy = state.settings.sortBy || "updated_desc";
  }

  // 一键敏感词打码渲染
  function applyRedactHtml(text, isRedactActive) {
    if (!text) return "";
    let safe = escapeHtml(text);
    if (!isRedactActive) return safe;
    const words = state.settings.custom_redact_words || [];
    if (!words.length) return safe;

    const validWords = words.filter((w) => w && w.trim().length > 0);
    if (!validWords.length) return safe;

    const sortedWords = [...validWords].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(sortedWords.map(escapeRegExp).join("|"), "gi");
    return safe.replace(pattern, (match) => `<span class="redacted-mask" title="敏感词遮罩">${match}</span>`);
  }

  // 搜索关键字高亮
  function highlightText(text, keyword, isRedactActive) {
    if (!text) return "";
    let processed = applyRedactHtml(text, isRedactActive);
    if (!keyword || !keyword.trim()) return processed;

    const kw = keyword.trim();
    const kwRegex = new RegExp(`(${escapeRegExp(escapeHtml(kw))})`, "gi");
    return processed.replace(kwRegex, `<mark class="search-highlight">$1</mark>`);
  }

  // 动态引入 html2canvas（支持酒馆环境无网络直接调用或 CDN 异步加载）
  async function ensureHtml2Canvas() {
    if (window.html2canvas) return window.html2canvas;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      script.onload = () => resolve(window.html2canvas);
      script.onerror = () => reject(new Error("无法加载 html2canvas 库"));
      document.head.appendChild(script);
    });
  }

  // =========================================================================
  // SillyTavern 交互彩蛋：一键填入酒馆聊天输入框
  // =========================================================================
  function insertTextToSillyTavernChat(content, autoCloseModal = false) {
    if (!content) {
      showToast("便签内容为空，无需插入");
      return;
    }

    const textarea = document.querySelector("#send_textarea") || document.querySelector("#chat_input") || document.querySelector("textarea[placeholder*='Send a message']");
    if (!textarea) {
      navigator.clipboard.writeText(content).then(() => {
        showToast("未检测到酒馆聊天输入框，已复制到剪贴板");
      }).catch(() => {
        showToast("复制失败，请手动选择复制");
      });
      return;
    }

    const currentVal = textarea.value || "";
    if (!currentVal.trim()) {
      textarea.value = content;
    } else {
      textarea.value = currentVal + "\n\n" + content;
    }

    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
    textarea.focus();

    showToast("✨ 已成功填入酒馆输入框！");

    if (autoCloseModal) {
      closeMainModal();
    }
  }

  // =========================================================================
  // UI 渲染与状态响应
  // =========================================================================

  function getMetadata() {
    const fragments = state.settings.fragments || [];
    const catMap = {};
    const tagMap = {};

    fragments.forEach((f) => {
      const cat = f.category || "未分类";
      catMap[cat] = (catMap[cat] || 0) + 1;

      if (f.tags) {
        f.tags.split(/[,，]/).forEach((t) => {
          const clean = t.trim();
          if (clean) {
            tagMap[clean] = (tagMap[clean] || 0) + 1;
          }
        });
      }
    });

    state.settings.custom_categories.forEach((cat) => {
      if (!(cat in catMap)) catMap[cat] = 0;
    });
    state.settings.custom_tags.forEach((tag) => {
      if (!(tag in tagMap)) tagMap[tag] = 0;
    });

    const categories = Object.keys(catMap).map((name) => ({ name, count: catMap[name] }));
    const tags = Object.keys(tagMap).map((name) => ({ name, count: tagMap[name] }));

    return { categories, tags, redact_words: state.settings.custom_redact_words || [] };
  }

  function renderCategoryChips() {
    const container = document.getElementById("category-chips");
    if (!container) return;
    const meta = getMetadata();
    const totalCount = state.settings.fragments.length;

    let html = `
      <button class="chip ${state.currentCategory === "" ? "active" : ""}" data-category="">
        全部 <span class="chip-count">${totalCount}</span>
      </button>
    `;

    meta.categories.forEach((c) => {
      const isActive = state.currentCategory === c.name;
      html += `
        <button class="chip ${isActive ? "active" : ""}" data-category="${escapeHtml(c.name)}">
          ${escapeHtml(c.name)} <span class="chip-count">${c.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll(".chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.currentCategory = btn.dataset.category || "";
        renderCategoryChips();
        renderHomeTagPool();
        renderCards();
      });
    });
  }

  function renderHomeTagPool() {
    const container = document.getElementById("tag-pool");
    const countEl = document.getElementById("tag-pool-count");
    const selBadge = document.getElementById("tag-pool-selected-badge");
    const selCount = document.getElementById("tag-pool-selected-count");
    if (!container) return;

    const meta = getMetadata();
    const tags = meta.tags;

    if (countEl) countEl.textContent = `${tags.length} 个`;

    if (state.selectedTags.size > 0) {
      if (selBadge) selBadge.style.display = "inline-flex";
      if (selCount) selCount.textContent = state.selectedTags.size;
    } else {
      if (selBadge) selBadge.style.display = "none";
    }

    if (tags.length === 0) {
      container.innerHTML = `<span class="tag-pool-empty">暂无标签，创建便签时可直接新增</span>`;
      return;
    }

    let html = "";
    tags.forEach((t) => {
      const isSelected = state.selectedTags.has(t.name);
      html += `
        <button class="tag-chip ${isSelected ? "active" : ""}" data-tag="${escapeHtml(t.name)}">
          #${escapeHtml(t.name)}
          <span class="tag-count-badge">${t.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll(".tag-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const tagName = chip.dataset.tag;
        if (state.selectedTags.has(tagName)) {
          state.selectedTags.delete(tagName);
        } else {
          state.selectedTags.add(tagName);
        }
        renderHomeTagPool();
        renderCards();
      });
    });
  }

  function getFilteredFragments() {
    let list = [...(state.settings.fragments || [])];

    if (state.currentCategory) {
      list = list.filter((f) => (f.category || "未分类") === state.currentCategory);
    }

    if (state.selectedTags.size > 0) {
      const selArr = Array.from(state.selectedTags);
      list = list.filter((f) => {
        const itemTags = (f.tags || "")
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (state.tagMatchMode === "and") {
          return selArr.every((st) => itemTags.includes(st));
        } else {
          return selArr.some((st) => itemTags.includes(st));
        }
      });
    }

    if (state.searchKeyword && state.searchKeyword.trim()) {
      const kw = state.searchKeyword.trim().toLowerCase();
      list = list.filter((f) => {
        const title = (f.title || "").toLowerCase();
        const content = (f.content || "").toLowerCase();
        const tags = (f.tags || "").toLowerCase();
        const cat = (f.category || "").toLowerCase();
        return title.includes(kw) || content.includes(kw) || tags.includes(kw) || cat.includes(kw);
      });
    }

    list.sort((a, b) => {
      if (state.sortBy === "updated_desc") {
        return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
      } else if (state.sortBy === "updated_asc") {
        return new Date(a.updated_at || 0) - new Date(b.updated_at || 0);
      } else if (state.sortBy === "created_desc") {
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      } else if (state.sortBy === "char_desc") {
        return (b.char_count || 0) - (a.char_count || 0);
      } else if (state.sortBy === "char_asc") {
        return (a.char_count || 0) - (b.char_count || 0);
      }
      return 0;
    });

    return list;
  }

  function renderCards() {
    const grid = document.getElementById("cards-grid");
    const empty = document.getElementById("empty-state");
    const countText = document.getElementById("fragment-count-text");
    if (!grid) return;

    const list = getFilteredFragments();
    if (countText) countText.textContent = `共 ${list.length} 条灵感便签`;

    if (list.length === 0) {
      grid.innerHTML = "";
      if (empty) empty.style.display = "flex";
      return;
    }

    if (empty) empty.style.display = "none";

    let html = "";
    list.forEach((f) => {
      const isSelected = state.selectedFragmentIds.has(f.id);
      const isRedact = state.isRedactViewEnabled;
      const kw = state.searchKeyword;

      const titleHtml = highlightText(f.title, kw, isRedact);
      const contentSnippet = f.content.length > 220 ? f.content.slice(0, 220) + "..." : f.content;
      const contentHtml = highlightText(contentSnippet, kw, isRedact).replace(/\n/g, "<br>");

      const tagsList = (f.tags || "")
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => `<span class="card-tag">#${escapeHtml(t)}</span>`)
        .join("");

      html += `
        <article class="fragment-card ${isSelected ? "selected-card" : ""}" data-id="${f.id}">
          <div class="card-header">
            <div class="card-header-left">
              ${
                state.isBatchMode
                  ? `<input type="checkbox" class="card-batch-checkbox" data-id="${f.id}" ${isSelected ? "checked" : ""}>`
                  : ""
              }
              <span class="card-category-badge">${escapeHtml(f.category || "未分类")}</span>
            </div>
            <span class="card-date">${formatDate(f.updated_at)}</span>
          </div>

          <h3 class="card-title">${titleHtml}</h3>
          <div class="card-content-preview">${contentHtml}</div>

          ${tagsList ? `<div class="card-tags-list">${tagsList}</div>` : ""}

          <div class="card-footer">
            <span class="card-char-count">${f.char_count || f.content.length} 字</span>
            
            <div class="card-actions">
              <button class="card-action-btn btn-send-to-st-chat" data-id="${f.id}" title="一键填入酒馆聊天输入框">
                <svg class="icon" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>

              <button class="card-action-btn btn-card-share" data-id="${f.id}" title="排版并导出卡片">
                <svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </button>

              <button class="card-action-btn btn-card-edit" data-id="${f.id}" title="编辑便签">
                <svg class="icon" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>

              <button class="card-action-btn btn-card-delete" data-id="${f.id}" title="删除便签">
                <svg class="icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </article>
      `;
    });

    grid.innerHTML = html;

    grid.querySelectorAll(".fragment-card").forEach((card) => {
      const id = parseInt(card.dataset.id, 10);
      const frag = state.settings.fragments.find((item) => item.id === id);

      if (state.isBatchMode) {
        card.addEventListener("click", (e) => {
          if (e.target.closest(".card-action-btn")) return;
          toggleSelectFragment(id);
        });
      } else {
        card.addEventListener("click", (e) => {
          if (e.target.closest(".card-action-btn")) return;
          if (frag) openEditor(frag);
        });
      }
    });

    grid.querySelectorAll(".btn-send-to-st-chat").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const frag = state.settings.fragments.find((item) => item.id === id);
        if (frag) insertTextToSillyTavernChat(frag.content, false);
      });
    });

    grid.querySelectorAll(".btn-card-share").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const frag = state.settings.fragments.find((item) => item.id === id);
        if (frag) openCardShareModal(frag);
      });
    });

    grid.querySelectorAll(".btn-card-edit").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const frag = state.settings.fragments.find((item) => item.id === id);
        if (frag) openEditor(frag);
      });
    });

    grid.querySelectorAll(".btn-card-delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        if (confirm("确定要删除这条便签吗？此操作无法撤销。")) {
          deleteFragment(id);
        }
      });
    });
  }

  // =========================================================================
  // 批量管理模式
  // =========================================================================
  function toggleBatchMode(force) {
    state.isBatchMode = typeof force === "boolean" ? force : !state.isBatchMode;
    state.selectedFragmentIds.clear();

    const bar = document.getElementById("batch-action-bar");
    const toggleBtn = document.getElementById("btn-toggle-batch-mode");
    if (bar) bar.style.display = state.isBatchMode ? "flex" : "none";
    if (toggleBtn) toggleBtn.classList.toggle("active", state.isBatchMode);

    updateBatchUI();
    renderCards();
  }

  function toggleSelectFragment(id) {
    if (state.selectedFragmentIds.has(id)) {
      state.selectedFragmentIds.delete(id);
    } else {
      state.selectedFragmentIds.add(id);
    }
    updateBatchUI();
    renderCards();
  }

  function updateBatchUI() {
    const countEl = document.getElementById("batch-selected-count");
    const selectAll = document.getElementById("batch-select-all");
    const list = getFilteredFragments();

    if (countEl) countEl.textContent = state.selectedFragmentIds.size;
    if (selectAll) {
      selectAll.checked = list.length > 0 && state.selectedFragmentIds.size === list.length;
    }
  }

  function setupBatchOperations() {
    const btnSetCat = document.getElementById("btn-batch-set-cat");
    const btnAddTags = document.getElementById("btn-batch-add-tags");
    const btnDelete = document.getElementById("btn-batch-delete");
    const btnCancel = document.getElementById("btn-batch-cancel");
    const selectAll = document.getElementById("batch-select-all");

    if (selectAll) {
      selectAll.addEventListener("change", (e) => {
        const list = getFilteredFragments();
        if (e.target.checked) {
          list.forEach((f) => state.selectedFragmentIds.add(f.id));
        } else {
          state.selectedFragmentIds.clear();
        }
        updateBatchUI();
        renderCards();
      });
    }

    if (btnCancel) btnCancel.addEventListener("click", () => toggleBatchMode(false));

    // 批量修改分类
    if (btnSetCat) {
      btnSetCat.addEventListener("click", () => {
        if (state.selectedFragmentIds.size === 0) {
          showToast("请先选择要操作的便签");
          return;
        }
        const modal = document.getElementById("batch-cat-modal");
        const countText = document.getElementById("batch-cat-count-text");
        const sel = document.getElementById("batch-cat-select");
        if (countText) countText.textContent = state.selectedFragmentIds.size;

        const meta = getMetadata();
        sel.innerHTML = meta.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
        modal.style.display = "flex";
      });
    }

    document.getElementById("btn-close-batch-cat")?.addEventListener("click", () => {
      document.getElementById("batch-cat-modal").style.display = "none";
    });
    document.getElementById("btn-cancel-batch-cat")?.addEventListener("click", () => {
      document.getElementById("batch-cat-modal").style.display = "none";
    });

    document.getElementById("btn-confirm-batch-cat")?.addEventListener("click", () => {
      const targetCat = document.getElementById("batch-cat-select").value;
      const ids = Array.from(state.selectedFragmentIds);
      state.settings.fragments.forEach((f) => {
        if (ids.includes(f.id)) {
          f.category = targetCat;
          f.updated_at = getNowDateString();
        }
      });
      saveStorage();
      document.getElementById("batch-cat-modal").style.display = "none";
      toggleBatchMode(false);
      renderCategoryChips();
      renderHomeTagPool();
      renderCards();
      showToast(`已成功将 ${ids.length} 条便签分类修改为「${targetCat}」`);
    });

    // 批量追加标签
    if (btnAddTags) {
      btnAddTags.addEventListener("click", () => {
        if (state.selectedFragmentIds.size === 0) {
          showToast("请先选择要操作的便签");
          return;
        }
        const modal = document.getElementById("batch-tags-modal");
        const countText = document.getElementById("batch-tags-count-text");
        const input = document.getElementById("batch-tags-input");
        if (countText) countText.textContent = state.selectedFragmentIds.size;
        if (input) input.value = "";
        modal.style.display = "flex";
      });
    }

    document.getElementById("btn-close-batch-tags")?.addEventListener("click", () => {
      document.getElementById("batch-tags-modal").style.display = "none";
    });
    document.getElementById("btn-cancel-batch-tags")?.addEventListener("click", () => {
      document.getElementById("batch-tags-modal").style.display = "none";
    });

    document.getElementById("btn-confirm-batch-tags")?.addEventListener("click", () => {
      const rawTags = document.getElementById("batch-tags-input").value;
      const newTags = rawTags
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);

      if (!newTags.length) {
        showToast("请输入要追加的标签");
        return;
      }

      newTags.forEach((t) => {
        if (!state.settings.custom_tags.includes(t)) {
          state.settings.custom_tags.push(t);
        }
      });

      const ids = Array.from(state.selectedFragmentIds);
      state.settings.fragments.forEach((f) => {
        if (ids.includes(f.id)) {
          const currentTags = (f.tags || "")
            .split(/[,，]/)
            .map((t) => t.trim())
            .filter(Boolean);
          newTags.forEach((nt) => {
            if (!currentTags.includes(nt)) currentTags.push(nt);
          });
          f.tags = currentTags.join(", ");
          f.updated_at = getNowDateString();
        }
      });

      saveStorage();
      document.getElementById("batch-tags-modal").style.display = "none";
      toggleBatchMode(false);
      renderCategoryChips();
      renderHomeTagPool();
      renderCards();
      showToast(`已成功为 ${ids.length} 篇便签追加标签`);
    });

    // 批量删除
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        if (state.selectedFragmentIds.size === 0) {
          showToast("请先选择要操作的便签");
          return;
        }
        const count = state.selectedFragmentIds.size;
        if (confirm(`确定要永久删除选中的 ${count} 条便签吗？`)) {
          const ids = Array.from(state.selectedFragmentIds);
          state.settings.fragments = state.settings.fragments.filter((f) => !ids.includes(f.id));
          saveStorage();
          toggleBatchMode(false);
          renderCategoryChips();
          renderHomeTagPool();
          renderCards();
          showToast(`已批量删除 ${count} 条便签`);
        }
      });
    }
  }

  // =========================================================================
  // 编辑器与单篇查找替换
  // =========================================================================
  function openEditor(fragment = null) {
    state.editingFragment = fragment;
    state.undoStack = [];
    state.redoStack = [];
    state.docMatches = [];
    state.docCurrentMatchIndex = -1;

    const modal = document.getElementById("editor-modal");
    const titleText = document.getElementById("editor-modal-mode-title");
    const titleInput = document.getElementById("editor-title");
    const contentInput = document.getElementById("editor-content");
    const tagsInput = document.getElementById("editor-tags");
    const deleteBtn = document.getElementById("btn-delete-fragment");
    const replacePanel = document.getElementById("doc-replace-panel");

    if (replacePanel) replacePanel.style.display = "none";
    clearBackdropHighlights();

    setupEditorCategorySelect(fragment ? fragment.category : "");

    if (fragment) {
      if (titleText) titleText.textContent = "编辑便签";
      if (titleInput) titleInput.value = fragment.title || "";
      if (contentInput) contentInput.value = fragment.content || "";
      if (tagsInput) tagsInput.value = fragment.tags || "";
      if (deleteBtn) deleteBtn.style.display = "inline-flex";
    } else {
      if (titleText) titleText.textContent = "新建便签";
      if (titleInput) titleInput.value = "";
      if (contentInput) contentInput.value = "";
      if (tagsInput) tagsInput.value = "";
      if (deleteBtn) deleteBtn.style.display = "none";
    }

    renderEditorHistoryTags();
    setupEditorTagsSelector();
    updateEditorCharStats();
    pushHistorySnapshot();

    modal.style.display = "flex";
    if (titleInput) titleInput.focus();
  }

  function closeEditor() {
    const modal = document.getElementById("editor-modal");
    if (modal) modal.style.display = "none";
    state.editingFragment = null;
    clearBackdropHighlights();
  }

  function updateEditorCharStats() {
    const contentInput = document.getElementById("editor-content");
    const charEl = document.getElementById("editor-char-count");
    const lineEl = document.getElementById("editor-line-count");
    if (!contentInput) return;

    const val = contentInput.value || "";
    if (charEl) charEl.textContent = val.length;
    if (lineEl) lineEl.textContent = val.length > 0 ? val.split("\n").length : 0;
  }

  function setupEditorCategorySelect(selectedCat = "") {
    const sel = document.getElementById("editor-category");
    const customInput = document.getElementById("editor-custom-cat");
    const btnAdd = document.getElementById("btn-add-custom-cat");
    if (!sel) return;

    const meta = getMetadata();
    const categories = meta.categories.map((c) => c.name);

    if (selectedCat && !categories.includes(selectedCat)) {
      categories.push(selectedCat);
    }

    sel.innerHTML = categories.map((c) => `<option value="${escapeHtml(c)}" ${c === selectedCat ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");

    if (customInput) customInput.style.display = "none";
    if (btnAdd) {
      btnAdd.onclick = () => {
        if (customInput.style.display === "none") {
          customInput.style.display = "inline-block";
          customInput.focus();
        } else {
          const val = customInput.value.trim();
          if (val) {
            if (!state.settings.custom_categories.includes(val)) {
              state.settings.custom_categories.push(val);
              saveStorage();
            }
            setupEditorCategorySelect(val);
          }
          customInput.value = "";
          customInput.style.display = "none";
        }
      };
    }
  }

  function renderEditorHistoryTags() {
    const panel = document.getElementById("editor-history-tags-list");
    const countEl = document.getElementById("editor-history-count");
    if (!panel) return;

    const meta = getMetadata();
    const tags = meta.tags;
    if (countEl) countEl.textContent = tags.length;

    const currentTags = (document.getElementById("editor-tags")?.value || "")
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);

    let html = "";
    tags.forEach((t) => {
      const isSelected = currentTags.includes(t.name);
      html += `
        <button type="button" class="editor-history-tag-chip ${isSelected ? "active" : ""}" data-tag="${escapeHtml(t.name)}">
          #${escapeHtml(t.name)}
        </button>
      `;
    });

    panel.innerHTML = html;

    panel.querySelectorAll(".editor-history-tag-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const tagName = btn.dataset.tag;
        const tagsInput = document.getElementById("editor-tags");
        if (!tagsInput) return;

        let tags = tagsInput.value
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean);
        if (tags.includes(tagName)) {
          tags = tags.filter((t) => t !== tagName);
        } else {
          tags.push(tagName);
        }
        tagsInput.value = tags.join(", ");
        renderEditorHistoryTags();
      });
    });
  }

  function setupEditorTagsSelector() {
    const tagsInput = document.getElementById("editor-tags");
    const dropdown = document.getElementById("tag-autocomplete-dropdown");
    if (!tagsInput || !dropdown) return;

    tagsInput.oninput = () => {
      const val = tagsInput.value;
      const cursorPos = tagsInput.selectionStart || val.length;
      const leftPart = val.slice(0, cursorPos);
      const lastComma = Math.max(leftPart.lastIndexOf(","), leftPart.lastIndexOf("，"));
      const currentToken = leftPart.slice(lastComma + 1).trim();

      if (!currentToken) {
        dropdown.style.display = "none";
        return;
      }

      const meta = getMetadata();
      const allTags = meta.tags.map((t) => t.name);
      const matches = allTags.filter((t) => t.toLowerCase().includes(currentToken.toLowerCase()));

      if (matches.length === 0) {
        dropdown.style.display = "none";
        return;
      }

      dropdown.innerHTML = matches
        .map((t) => `<div class="tag-autocomplete-item" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</div>`)
        .join("");
      dropdown.style.display = "block";

      dropdown.querySelectorAll(".tag-autocomplete-item").forEach((item) => {
        item.onmousedown = (e) => {
          e.preventDefault();
          const selectedTag = item.dataset.tag;
          const rightPart = val.slice(cursorPos);
          const nextComma = rightPart.search(/[,，]/);
          const afterToken = nextComma !== -1 ? rightPart.slice(nextComma) : "";

          const prefix = leftPart.slice(0, lastComma + 1);
          const spacer = prefix && !prefix.endsWith(" ") ? " " : "";
          tagsInput.value = prefix + spacer + selectedTag + (afterToken ? afterToken : ", ");
          dropdown.style.display = "none";
          renderEditorHistoryTags();
        };
      });
    };

    tagsInput.onblur = () => {
      setTimeout(() => {
        dropdown.style.display = "none";
      }, 200);
    };
  }

  function pushHistorySnapshot() {
    if (state.isUndoRedoing) return;
    const title = document.getElementById("editor-title")?.value || "";
    const content = document.getElementById("editor-content")?.value || "";
    const tags = document.getElementById("editor-tags")?.value || "";

    const snapshot = { title, content, tags };
    const last = state.undoStack[state.undoStack.length - 1];
    if (last && last.title === title && last.content === content && last.tags === tags) {
      return;
    }

    state.undoStack.push(snapshot);
    if (state.undoStack.length > 50) state.undoStack.shift();
    state.redoStack = [];
    updateUndoRedoButtons();
  }

  function handleUndo() {
    if (state.undoStack.length <= 1) return;
    state.isUndoRedoing = true;
    const current = state.undoStack.pop();
    state.redoStack.push(current);

    const prev = state.undoStack[state.undoStack.length - 1];
    if (prev) {
      document.getElementById("editor-title").value = prev.title;
      document.getElementById("editor-content").value = prev.content;
      document.getElementById("editor-tags").value = prev.tags;
      updateEditorCharStats();
      renderEditorHistoryTags();
    }
    state.isUndoRedoing = false;
    updateUndoRedoButtons();
  }

  function handleRedo() {
    if (state.redoStack.length === 0) return;
    state.isUndoRedoing = true;
    const next = state.redoStack.pop();
    state.undoStack.push(next);

    document.getElementById("editor-title").value = next.title;
    document.getElementById("editor-content").value = next.content;
    document.getElementById("editor-tags").value = next.tags;
    updateEditorCharStats();
    renderEditorHistoryTags();

    state.isUndoRedoing = false;
    updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("btn-editor-undo");
    const redoBtn = document.getElementById("btn-editor-redo");
    if (undoBtn) undoBtn.disabled = state.undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
  }

  function saveFragment() {
    const titleInput = document.getElementById("editor-title");
    const contentInput = document.getElementById("editor-content");
    const tagsInput = document.getElementById("editor-tags");
    const catSelect = document.getElementById("editor-category");

    const title = titleInput?.value.trim() || "无标题便签";
    const content = contentInput?.value.trim() || "";
    const category = catSelect?.value || "未分类";
    const tags = (tagsInput?.value || "")
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
      .join(", ");

    if (!content) {
      showToast("请输入便签内容");
      return;
    }

    if (tags) {
      tags.split(", ").forEach((t) => {
        if (!state.settings.custom_tags.includes(t)) {
          state.settings.custom_tags.push(t);
        }
      });
    }

    const now = getNowDateString();

    if (state.editingFragment) {
      const id = state.editingFragment.id;
      const target = state.settings.fragments.find((f) => f.id === id);
      if (target) {
        target.title = title;
        target.category = category;
        target.tags = tags;
        target.content = content;
        target.char_count = content.length;
        target.updated_at = now;
      }
      showToast("便签已保存更新");
    } else {
      const newId = state.settings.fragments.reduce((max, f) => Math.max(max, f.id || 0), 0) + 1;
      const newFrag = {
        id: newId,
        title,
        category,
        tags,
        content,
        char_count: content.length,
        created_at: now,
        updated_at: now
      };
      state.settings.fragments.unshift(newFrag);
      showToast("新便签已创建");
    }

    saveStorage();
    closeEditor();
    renderCategoryChips();
    renderHomeTagPool();
    renderCards();
  }

  function deleteFragment(id) {
    state.settings.fragments = state.settings.fragments.filter((f) => f.id !== id);
    saveStorage();
    if (state.editingFragment && state.editingFragment.id === id) {
      closeEditor();
    }
    renderCategoryChips();
    renderHomeTagPool();
    renderCards();
    showToast("便签已删除");
  }

  function clearBackdropHighlights() {
    const backdrop = document.getElementById("editor-highlights-backdrop");
    if (backdrop) backdrop.innerHTML = "";
  }

  function syncBackdropScroll() {
    const textarea = document.getElementById("editor-content");
    const backdrop = document.getElementById("editor-highlights-backdrop");
    if (textarea && backdrop) {
      backdrop.scrollTop = textarea.scrollTop;
      backdrop.scrollLeft = textarea.scrollLeft;
    }
  }

  function updateFindMatches() {
    const textarea = document.getElementById("editor-content");
    const findInput = document.getElementById("doc-find-input");
    const matchCountEl = document.getElementById("doc-find-match-count");
    const backdrop = document.getElementById("editor-highlights-backdrop");
    if (!textarea || !findInput || !backdrop) return;

    const query = findInput.value;
    const text = textarea.value;

    if (!query) {
      state.docMatches = [];
      state.docCurrentMatchIndex = -1;
      if (matchCountEl) matchCountEl.textContent = "0 / 0";
      backdrop.innerHTML = escapeHtml(text).replace(/\n/g, "<br>") + "<br>";
      return;
    }

    const matches = [];
    let pos = 0;
    while ((pos = text.indexOf(query, pos)) !== -1) {
      matches.push(pos);
      pos += query.length;
    }

    state.docMatches = matches;
    if (matches.length > 0) {
      if (state.docCurrentMatchIndex === -1 || state.docCurrentMatchIndex >= matches.length) {
        state.docCurrentMatchIndex = 0;
      }
    } else {
      state.docCurrentMatchIndex = -1;
    }

    if (matchCountEl) {
      matchCountEl.textContent = matches.length > 0 ? `${state.docCurrentMatchIndex + 1} / ${matches.length}` : "0 / 0";
    }

    let html = "";
    let lastIdx = 0;
    matches.forEach((mIdx, i) => {
      const isCur = i === state.docCurrentMatchIndex;
      html += escapeHtml(text.slice(lastIdx, mIdx));
      html += `<mark class="${isCur ? "find-match-current" : "find-match"}">${escapeHtml(query)}</mark>`;
      lastIdx = mIdx + query.length;
    });
    html += escapeHtml(text.slice(lastIdx));
    backdrop.innerHTML = html.replace(/\n/g, "<br>") + "<br>";
    syncBackdropScroll();
  }

  function scrollToCurrentMatch() {
    if (state.docCurrentMatchIndex < 0 || !state.docMatches.length) return;
    const pos = state.docMatches[state.docCurrentMatchIndex];
    const query = document.getElementById("doc-find-input")?.value || "";
    const textarea = document.getElementById("editor-content");
    if (!textarea) return;

    textarea.focus();
    textarea.setSelectionRange(pos, pos + query.length);
    updateFindMatches();
  }

  function setupSingleDocReplace() {
    const btnToggle = document.getElementById("btn-toggle-doc-replace");
    const panel = document.getElementById("doc-replace-panel");
    const findInput = document.getElementById("doc-find-input");
    const replaceInput = document.getElementById("doc-replace-input");
    const btnPrev = document.getElementById("btn-doc-find-prev");
    const btnNext = document.getElementById("btn-doc-find-next");
    const btnReplaceOne = document.getElementById("btn-doc-replace-one");
    const btnReplaceAll = document.getElementById("btn-doc-replace-all");
    const btnClose = document.getElementById("btn-close-doc-replace");
    const textarea = document.getElementById("editor-content");

    if (btnToggle) {
      btnToggle.addEventListener("click", () => {
        const isHidden = panel.style.display === "none";
        panel.style.display = isHidden ? "flex" : "none";
        btnToggle.classList.toggle("active", isHidden);
        if (isHidden) {
          findInput.focus();
          updateFindMatches();
        } else {
          clearBackdropHighlights();
        }
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        panel.style.display = "none";
        btnToggle?.classList.remove("active");
        clearBackdropHighlights();
      });
    }

    if (findInput) {
      findInput.addEventListener("input", () => {
        state.docCurrentMatchIndex = -1;
        updateFindMatches();
      });
    }

    if (textarea) {
      textarea.addEventListener("scroll", syncBackdropScroll);
      textarea.addEventListener("input", () => {
        updateEditorCharStats();
        debounce(pushHistorySnapshot, 400)();
        if (panel.style.display !== "none") updateFindMatches();
      });
    }

    if (btnNext) {
      btnNext.addEventListener("click", () => {
        if (!state.docMatches.length) return;
        state.docCurrentMatchIndex = (state.docCurrentMatchIndex + 1) % state.docMatches.length;
        scrollToCurrentMatch();
      });
    }

    if (btnPrev) {
      btnPrev.addEventListener("click", () => {
        if (!state.docMatches.length) return;
        state.docCurrentMatchIndex = (state.docCurrentMatchIndex - 1 + state.docMatches.length) % state.docMatches.length;
        scrollToCurrentMatch();
      });
    }

    if (btnReplaceOne) {
      btnReplaceOne.addEventListener("click", () => {
        if (state.docCurrentMatchIndex < 0 || !state.docMatches.length) return;
        const query = findInput.value;
        const repl = replaceInput.value;
        const pos = state.docMatches[state.docCurrentMatchIndex];
        const val = textarea.value;

        textarea.value = val.slice(0, pos) + repl + val.slice(pos + query.length);
        pushHistorySnapshot();
        updateEditorCharStats();
        updateFindMatches();
        showToast("已替换当前匹配项");
      });
    }

    if (btnReplaceAll) {
      btnReplaceAll.addEventListener("click", () => {
        const query = findInput.value;
        const repl = replaceInput.value;
        if (!query) return;

        const val = textarea.value;
        const regex = new RegExp(escapeRegExp(query), "g");
        const count = (val.match(regex) || []).length;
        if (count === 0) {
          showToast("未找到匹配项");
          return;
        }

        textarea.value = val.replace(regex, repl);
        pushHistorySnapshot();
        updateEditorCharStats();
        updateFindMatches();
        showToast(`已替换正文全部 ${count} 处匹配项`);
      });
    }
  }

  // =========================================================================
  // 排版卡片美化与导出分享
  // =========================================================================
  function openCardShareModal(fragment) {
    if (!fragment) {
      const title = document.getElementById("editor-title")?.value || "无标题便签";
      const content = document.getElementById("editor-content")?.value || "";
      const category = document.getElementById("editor-category")?.value || "未分类";
      const tags = document.getElementById("editor-tags")?.value || "";
      fragment = { title, content, category, tags, updated_at: getNowDateString() };
    }

    state.shareCurrentFrag = fragment;
    const modal = document.getElementById("card-share-modal");
    updateCardSharePreview();
    modal.style.display = "flex";
  }

  function updateCardSharePreview() {
    const f = state.shareCurrentFrag;
    if (!f) return;

    const card = document.getElementById("share-render-card");
    const catEl = document.getElementById("share-preview-cat");
    const dateEl = document.getElementById("share-preview-date");
    const titleEl = document.getElementById("share-preview-title");
    const contentEl = document.getElementById("share-preview-content");
    const tagsEl = document.getElementById("share-preview-tags");
    const wordsEl = document.getElementById("share-preview-words");
    const footerEl = document.getElementById("share-preview-footer");

    card.className = `share-card theme-${state.shareCardTheme}`;

    if (catEl) catEl.textContent = f.category || "未分类";
    if (dateEl) dateEl.textContent = formatDate(f.updated_at);
    if (titleEl) titleEl.textContent = f.title || "无标题便签";

    if (contentEl) {
      const isRedact = state.shareApplyRedact;
      contentEl.innerHTML = applyRedactHtml(f.content, isRedact).replace(/\n/g, "<br>");
    }

    if (tagsEl) {
      if (state.shareShowTags && f.tags) {
        const tagSpans = f.tags
          .split(/[,，]/)
          .map((t) => t.trim())
          .filter(Boolean)
          .map((t) => `<span class="share-tag">#${escapeHtml(t)}</span>`)
          .join("");
        tagsEl.innerHTML = tagSpans;
        tagsEl.style.display = "flex";
      } else {
        tagsEl.style.display = "none";
      }
    }

    if (footerEl) {
      footerEl.style.display = state.shareShowFooter ? "flex" : "none";
    }

    if (wordsEl) {
      wordsEl.textContent = `${f.content ? f.content.length : 0} 字`;
    }
  }

  function setupCardShareModal() {
    const modal = document.getElementById("card-share-modal");
    const btnClose = document.getElementById("btn-close-card-share");
    const btnExportPng = document.getElementById("btn-export-card-png");
    const btnCopyText = document.getElementById("btn-copy-card-text");

    if (btnClose) btnClose.addEventListener("click", () => (modal.style.display = "none"));

    document.querySelectorAll(".theme-picker .theme-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".theme-picker .theme-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        state.shareCardTheme = btn.dataset.theme;
        updateCardSharePreview();
      });
    });

    document.getElementById("share-toggle-redact")?.addEventListener("change", (e) => {
      state.shareApplyRedact = e.target.checked;
      updateCardSharePreview();
    });
    document.getElementById("share-toggle-tags")?.addEventListener("change", (e) => {
      state.shareShowTags = e.target.checked;
      updateCardSharePreview();
    });
    document.getElementById("share-toggle-footer")?.addEventListener("change", (e) => {
      state.shareShowFooter = e.target.checked;
      updateCardSharePreview();
    });

    if (btnCopyText) {
      btnCopyText.addEventListener("click", () => {
        const f = state.shareCurrentFrag;
        if (!f) return;
        const text = `【${f.category || "未分类"}】${f.title}\n\n${f.content}\n\n标签: ${f.tags || "无"}\n字数: ${f.content.length} | 灵感碎片`;
        navigator.clipboard.writeText(text).then(() => {
          showToast("排版文本已成功复制到剪贴板");
        }).catch(() => {
          showToast("复制失败，请手动选择复制");
        });
      });
    }

    if (btnExportPng) {
      btnExportPng.addEventListener("click", async () => {
        const card = document.getElementById("share-render-card");
        if (!card) return;

        showToast("正在渲染高清卡片中...");
        try {
          const h2c = await ensureHtml2Canvas();
          const canvas = await h2c(card, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false
          });

          const previewImgBox = document.getElementById("share-preview-img-box");
          const previewImg = document.getElementById("share-preview-img");
          const dataUrl = canvas.toDataURL("image/png");

          if (previewImgBox && previewImg) {
            previewImg.src = dataUrl;
            previewImgBox.style.display = "block";
          }

          const link = document.createElement("a");
          link.download = `灵感碎片_${state.shareCurrentFrag.title || "便签"}_${Date.now()}.png`;
          link.href = dataUrl;
          link.click();
          showToast("卡片图片生成成功！");
        } catch (err) {
          console.error("[FragmentHub] Export PNG error:", err);
          showToast("生成卡片失败，已生成文本排版");
        }
      });
    }
  }

  // =========================================================================
  // 设置管理（分类、标签、敏感词打码库）
  // =========================================================================
  function renderSettingsManageLists() {
    const redactBox = document.getElementById("manage-redact-chips");
    const catBox = document.getElementById("manage-cat-chips");
    const tagBox = document.getElementById("manage-tag-chips");

    if (redactBox) {
      redactBox.innerHTML = state.settings.custom_redact_words
        .map(
          (w) => `
        <span class="manage-chip">
          ${escapeHtml(w)}
          <button type="button" class="btn-del-chip" data-type="redact" data-val="${escapeHtml(w)}">&times;</button>
        </span>
      `
        )
        .join("");
    }

    if (catBox) {
      catBox.innerHTML = state.settings.custom_categories
        .map(
          (c) => `
        <span class="manage-chip">
          ${escapeHtml(c)}
          <button type="button" class="btn-del-chip" data-type="cat" data-val="${escapeHtml(c)}">&times;</button>
        </span>
      `
        )
        .join("");
    }

    if (tagBox) {
      tagBox.innerHTML = state.settings.custom_tags
        .map(
          (t) => `
        <span class="manage-chip">
          #${escapeHtml(t)}
          <button type="button" class="btn-del-chip" data-type="tag" data-val="${escapeHtml(t)}">&times;</button>
        </span>
      `
        )
        .join("");
    }

    document.querySelectorAll(".btn-del-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        const val = btn.dataset.val;
        if (type === "redact") {
          state.settings.custom_redact_words = state.settings.custom_redact_words.filter((w) => w !== val);
        } else if (type === "cat") {
          state.settings.custom_categories = state.settings.custom_categories.filter((c) => c !== val);
        } else if (type === "tag") {
          state.settings.custom_tags = state.settings.custom_tags.filter((t) => t !== val);
        }
        saveStorage();
        renderSettingsManageLists();
        renderCategoryChips();
        renderHomeTagPool();
        renderCards();
      });
    });
  }

  function setupSettingsModal() {
    const modal = document.getElementById("settings-modal");
    const btnOpen = document.getElementById("btn-open-settings");
    const btnClose = document.getElementById("btn-close-settings");

    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        renderSettingsManageLists();
        modal.style.display = "flex";
      });
    }
    if (btnClose) btnClose.addEventListener("click", () => (modal.style.display = "none"));

    document.getElementById("btn-add-redact-word")?.addEventListener("click", () => {
      const input = document.getElementById("new-redact-input");
      const words = (input?.value || "")
        .split(/[,，]/)
        .map((w) => w.trim())
        .filter(Boolean);
      if (!words.length) return;

      words.forEach((w) => {
        if (!state.settings.custom_redact_words.includes(w)) {
          state.settings.custom_redact_words.push(w);
        }
      });
      saveStorage();
      input.value = "";
      renderSettingsManageLists();
      renderCards();
      showToast("敏感词已添加到打码库");
    });

    document.getElementById("btn-create-new-cat")?.addEventListener("click", () => {
      const input = document.getElementById("new-cat-input");
      const val = input?.value.trim();
      if (!val) return;

      if (!state.settings.custom_categories.includes(val)) {
        state.settings.custom_categories.push(val);
        saveStorage();
        input.value = "";
        renderSettingsManageLists();
        renderCategoryChips();
        showToast(`已新增分类「${val}」`);
      }
    });

    document.getElementById("btn-create-new-tag")?.addEventListener("click", () => {
      const input = document.getElementById("new-tag-input");
      const tags = (input?.value || "")
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean);
      if (!tags.length) return;

      tags.forEach((t) => {
        if (!state.settings.custom_tags.includes(t)) {
          state.settings.custom_tags.push(t);
        }
      });
      saveStorage();
      input.value = "";
      renderSettingsManageLists();
      renderHomeTagPool();
      showToast("新标签已添加到全量库");
    });
  }

  // =========================================================================
  // 全局查找与替换
  // =========================================================================
  function setupGlobalReplace() {
    const modal = document.getElementById("global-replace-modal");
    const btnOpen = document.getElementById("btn-open-global-replace");
    const btnClose = document.getElementById("btn-close-global-replace");
    const btnCancel = document.getElementById("btn-cancel-global-replace");
    const btnExec = document.getElementById("btn-exec-global-replace");
    const scopeSelect = document.getElementById("global-replace-scope");

    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        const meta = getMetadata();
        scopeSelect.innerHTML = `<option value="">全部分类 (所有便签)</option>` + meta.categories.map((c) => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");
        document.getElementById("global-find-text").value = "";
        document.getElementById("global-replace-text").value = "";
        document.getElementById("global-replace-result").style.display = "none";
        modal.style.display = "flex";
      });
    }

    if (btnClose) btnClose.addEventListener("click", () => (modal.style.display = "none"));
    if (btnCancel) btnCancel.addEventListener("click", () => (modal.style.display = "none"));

    if (btnExec) {
      btnExec.addEventListener("click", () => {
        const findStr = document.getElementById("global-find-text")?.value;
        const replaceStr = document.getElementById("global-replace-text")?.value || "";
        const scope = scopeSelect.value;
        const resultBox = document.getElementById("global-replace-result");

        if (!findStr) {
          showToast("请输入需要查找的文本");
          return;
        }

        let affectedCount = 0;
        let totalReplacedOccurrences = 0;
        const regex = new RegExp(escapeRegExp(findStr), "g");
        const now = getNowDateString();

        state.settings.fragments.forEach((f) => {
          if (scope && f.category !== scope) return;

          let matched = false;
          if (f.title && f.title.includes(findStr)) {
            const matches = (f.title.match(regex) || []).length;
            totalReplacedOccurrences += matches;
            f.title = f.title.replace(regex, replaceStr);
            matched = true;
          }
          if (f.content && f.content.includes(findStr)) {
            const matches = (f.content.match(regex) || []).length;
            totalReplacedOccurrences += matches;
            f.content = f.content.replace(regex, replaceStr);
            f.char_count = f.content.length;
            matched = true;
          }
          if (matched) {
            f.updated_at = now;
            affectedCount++;
          }
        });

        saveStorage();
        renderCategoryChips();
        renderHomeTagPool();
        renderCards();

        if (resultBox) {
          resultBox.innerHTML = `✅ 全局替换完成！共影响了 <b>${affectedCount}</b> 篇便签，完成了 <b>${totalReplacedOccurrences}</b> 处文本替换。`;
          resultBox.style.display = "block";
        }
        showToast(`全局替换成功，更新了 ${affectedCount} 篇便签`);
      });
    }
  }

  // =========================================================================
  // 数据全量备份与导入恢复
  // =========================================================================
  function setupBackup() {
    const modal = document.getElementById("backup-modal");
    const btnOpen = document.getElementById("btn-open-backup");
    const btnClose = document.getElementById("btn-close-backup");
    const btnDownload = document.getElementById("btn-download-json-backup");
    const btnTriggerImport = document.getElementById("btn-trigger-file-import");
    const fileInput = document.getElementById("backup-file-input");

    if (btnOpen) btnOpen.addEventListener("click", () => (modal.style.display = "flex"));
    if (btnClose) btnClose.addEventListener("click", () => (modal.style.display = "none"));

    if (btnDownload) {
      btnDownload.addEventListener("click", () => {
        const payload = {
          version: "1.0.0",
          export_time: getNowDateString(),
          data: state.settings
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `灵感碎片_备份_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("全量备份文件已导出下载");
      });
    }

    if (btnTriggerImport) btnTriggerImport.addEventListener("click", () => fileInput?.click());

    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const parsed = JSON.parse(ev.target.result);
            const data = parsed.data || parsed;
            const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "merge";

            if (!data.fragments || !Array.isArray(data.fragments)) {
              alert("备份文件格式不正确，缺少便签数据。");
              return;
            }

            if (mode === "overwrite") {
              state.settings = Object.assign({}, DEFAULT_SETTINGS, data);
            } else {
              const existingIds = new Set(state.settings.fragments.map((f) => f.id));
              let maxId = state.settings.fragments.reduce((max, f) => Math.max(max, f.id || 0), 0);

              data.fragments.forEach((f) => {
                if (existingIds.has(f.id)) {
                  maxId++;
                  f.id = maxId;
                }
                state.settings.fragments.push(f);
              });

              (data.custom_categories || []).forEach((c) => {
                if (!state.settings.custom_categories.includes(c)) state.settings.custom_categories.push(c);
              });
              (data.custom_tags || []).forEach((t) => {
                if (!state.settings.custom_tags.includes(t)) state.settings.custom_tags.push(t);
              });
              (data.custom_redact_words || []).forEach((w) => {
                if (!state.settings.custom_redact_words.includes(w)) state.settings.custom_redact_words.push(w);
              });
            }

            saveStorage();
            modal.style.display = "none";
            fileInput.value = "";
            renderCategoryChips();
            renderHomeTagPool();
            renderCards();
            showToast("数据恢复成功！");
          } catch (err) {
            alert("读取备份文件失败: " + err.message);
          }
        };
        reader.readAsText(file);
      });
    }
  }

  // =========================================================================
  // 主弹窗控制器与事件绑定
  // =========================================================================
  function openMainModal() {
    const modal = document.getElementById("st-fragment-hub-modal");
    if (!modal) return;
    modal.style.display = "flex";
    state.isOpen = true;
    renderCategoryChips();
    renderHomeTagPool();
    renderCards();
  }

  function closeMainModal() {
    const modal = document.getElementById("st-fragment-hub-modal");
    if (!modal) return;
    modal.style.display = "none";
    state.isOpen = false;
  }

  function initUIEvents() {
    document.getElementById("btn-close-hub-modal")?.addEventListener("click", closeMainModal);
    document.getElementById("btn-create-fragment")?.addEventListener("click", () => openEditor(null));
    document.getElementById("btn-toggle-batch-mode")?.addEventListener("click", () => toggleBatchMode());

    const redactViewBtn = document.getElementById("btn-toggle-redact-view");
    if (redactViewBtn) {
      redactViewBtn.classList.toggle("active", state.isRedactViewEnabled);
      redactViewBtn.addEventListener("click", () => {
        state.isRedactViewEnabled = !state.isRedactViewEnabled;
        state.settings.isRedactViewEnabled = state.isRedactViewEnabled;
        saveStorage();
        redactViewBtn.classList.toggle("active", state.isRedactViewEnabled);
        renderCards();
        showToast(state.isRedactViewEnabled ? "已开启全局敏感词打码视图" : "已恢复明文完整视图");
      });
    }

    const searchInput = document.getElementById("search-input");
    const searchClear = document.getElementById("search-clear");
    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce((e) => {
          state.searchKeyword = e.target.value;
          if (searchClear) searchClear.style.display = state.searchKeyword ? "inline-flex" : "none";
          renderCards();
        }, 200)
      );
    }
    if (searchClear) {
      searchClear.addEventListener("click", () => {
        searchInput.value = "";
        state.searchKeyword = "";
        searchClear.style.display = "none";
        renderCards();
      });
    }

    const sortSelect = document.getElementById("sort-select");
    if (sortSelect) {
      sortSelect.value = state.sortBy;
      sortSelect.addEventListener("change", (e) => {
        state.sortBy = e.target.value;
        state.settings.sortBy = state.sortBy;
        saveStorage();
        renderCards();
      });
    }

    const btnAnd = document.getElementById("btn-mode-and");
    const btnOr = document.getElementById("btn-mode-or");
    if (btnAnd && btnOr) {
      btnAnd.addEventListener("click", (e) => {
        e.stopPropagation();
        state.tagMatchMode = "and";
        btnAnd.classList.add("active");
        btnOr.classList.remove("active");
        renderCards();
      });
      btnOr.addEventListener("click", (e) => {
        e.stopPropagation();
        state.tagMatchMode = "or";
        btnOr.classList.add("active");
        btnAnd.classList.remove("active");
        renderCards();
      });
    }

    const tagToggle = document.getElementById("tag-pool-toggle-btn");
    const tagPoolChips = document.getElementById("tag-pool");
    const tagCollapseText = document.getElementById("tag-collapse-text");
    const tagCollapseArrow = document.getElementById("tag-collapse-arrow");
    if (tagToggle) {
      tagToggle.addEventListener("click", (e) => {
        if (e.target.closest(".match-mode-switch")) return;
        state.isHomeTagPoolExpanded = !state.isHomeTagPoolExpanded;
        if (tagPoolChips) tagPoolChips.style.display = state.isHomeTagPoolExpanded ? "none" : "flex";
        if (tagCollapseText) tagCollapseText.textContent = state.isHomeTagPoolExpanded ? "展开" : "收起";
        if (tagCollapseArrow) tagCollapseArrow.classList.toggle("rotated", state.isHomeTagPoolExpanded);
      });
    }

    const historyTagsToggle = document.getElementById("history-tags-toggle-btn");
    const historyTagsList = document.getElementById("editor-history-tags-list");
    const historyCollapseText = document.getElementById("editor-tag-collapse-text");
    const historyCollapseArrow = document.getElementById("editor-tag-collapse-arrow");
    if (historyTagsToggle) {
      historyTagsToggle.addEventListener("click", () => {
        state.isEditorTagPoolExpanded = !state.isEditorTagPoolExpanded;
        if (historyTagsList) historyTagsList.style.display = state.isEditorTagPoolExpanded ? "flex" : "none";
        if (historyCollapseText) historyCollapseText.textContent = state.isEditorTagPoolExpanded ? "收起" : "展开";
        if (historyCollapseArrow) historyCollapseArrow.classList.toggle("rotated", state.isEditorTagPoolExpanded);
      });
    }

    document.getElementById("btn-close-editor")?.addEventListener("click", closeEditor);
    document.getElementById("btn-save-fragment")?.addEventListener("click", saveFragment);
    document.getElementById("btn-delete-fragment")?.addEventListener("click", () => {
      if (state.editingFragment && confirm("确定要删除这条便签吗？")) {
        deleteFragment(state.editingFragment.id);
      }
    });

    document.getElementById("btn-open-card-share")?.addEventListener("click", () => openCardShareModal(state.editingFragment));

    document.getElementById("btn-editor-send-to-st-chat")?.addEventListener("click", () => {
      const content = document.getElementById("editor-content")?.value;
      insertTextToSillyTavernChat(content, false);
    });

    document.getElementById("btn-editor-undo")?.addEventListener("click", handleUndo);
    document.getElementById("btn-editor-redo")?.addEventListener("click", handleRedo);

    setupBatchOperations();
    setupSingleDocReplace();
    setupCardShareModal();
    setupSettingsModal();
    setupGlobalReplace();
    setupBackup();

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const modals = [
          "card-share-modal",
          "settings-modal",
          "batch-cat-modal",
          "batch-tags-modal",
          "global-replace-modal",
          "backup-modal",
          "editor-modal"
        ];
        for (const mId of modals) {
          const el = document.getElementById(mId);
          if (el && el.style.display !== "none") {
            el.style.display = "none";
            return;
          }
        }
        if (state.isOpen) {
          closeMainModal();
        }
      }

      const editorModal = document.getElementById("editor-modal");
      if (editorModal && editorModal.style.display !== "none") {
        if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) {
          e.preventDefault();
          saveFragment();
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) {
          e.preventDefault();
          handleRedo();
        }
      }
    });
  }

  // =========================================================================
  // SillyTavern 扩展挂载入口
  // =========================================================================
  async function initExtension() {
    loadStorage();

    try {
      let html = "";
      try {
        const templateResp = await fetch(new URL("template.html", import.meta.url));
        if (templateResp.ok) html = await templateResp.text();
      } catch (err) {
        console.warn("[FragmentHub] Fetch template.html relative failed:", err);
      }

      if (!html) {
        const fallbackResp = await fetch("/scripts/extensions/third-party/sillytavern-fragment-hub/template.html");
        if (fallbackResp.ok) html = await fallbackResp.text();
      }

      if (html) {
        const wrap = document.createElement("div");
        wrap.innerHTML = html;
        document.body.appendChild(wrap.firstElementChild);
      }
    } catch (err) {
      console.error("[FragmentHub] Failed to load template.html:", err);
    }

    createExtensionMenuItem();
    initUIEvents();
    console.log("[FragmentHub] 灵感碎片 · 剧情与番外便签扩展初始化成功！");
  }

  function createExtensionMenuItem() {
    const extensionsMenu = document.getElementById("extensions_menu");
    if (!extensionsMenu) {
      setTimeout(createExtensionMenuItem, 500);
      return;
    }

    if (document.getElementById("st-fragment-hub-menu-item")) return;

    const menuItem = document.createElement("div");
    menuItem.id = "st-fragment-hub-menu-item";
    menuItem.className = "extension_menu_item list-group-item flex-container flexGap5";
    menuItem.innerHTML = `
      <i class="fa-solid fa-note-sticky fa-fw"></i>
      <span>灵感便签 (Fragment Hub)</span>
    `;
    menuItem.addEventListener("click", () => {
      openMainModal();
    });

    extensionsMenu.appendChild(menuItem);
  }

  if (typeof jQuery !== "undefined") {
    jQuery(initExtension);
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initExtension);
  } else {
    initExtension();
  }
})();

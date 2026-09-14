/**
 * SillyTavern Extension: Fragment Hub (灵感碎片 · 同人梗与番外便签系统)
 * 适配 SillyTavern 1.18.0+ 全局便签本模式，支持聊天输入框一键填入
 */

(function () {
  'use strict';

  const EXTENSION_NAME = 'sillytavern-fragment-hub';
  const STORAGE_KEY = 'sillytavern_fragment_hub_data';

  // 默认初始数据
  const DEFAULT_DATA = {
    fragments: [
      {
        id: 1,
        title: "咖啡馆偶遇雨夜",
        category: "现背AU",
        tags: "雨夜, 甜虐, 咖啡馆, 对白",
        content: "「带伞了吗？」他收起黑伞，水滴顺着伞尖在地砖上晕开一片深色。\n对方摇了摇头，把围巾往上拉了拉：「没有，没想到雨下这么大。」\n「那就一起坐会儿吧，等雨停。」",
        char_count: 85,
        created_at: new Date(Date.now() - 3600000 * 24).toISOString().replace('T', ' ').substring(0, 19),
        updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      },
      {
        id: 2,
        title: "战后清晨的红茶与晨光",
        category: "原著延伸/番外",
        tags: "治愈, 番外, 日常, 战后",
        content: "阳光透过窗帘的破洞照在木桌上，茶杯里升腾起薄薄的热汽。\n经过了整整三年的颠沛流离，他们终于可以不用时刻把手指按在刀柄上睡去。\n「红茶放糖了吗？」\n「放了两块，按你的习惯。」",
        char_count: 98,
        created_at: new Date(Date.now() - 3600000 * 12).toISOString().replace('T', ' ').substring(0, 19),
        updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      }
    ],
    categories: ["日常脑洞", "原著延伸/番外", "现背AU", "未分类"],
    tags: ["对白", "番外", "现背AU", "甜虐", "战后", "治愈", "梗", "脑洞"],
    redactWords: ["某某", "真实姓名"]
  };

  // 全局状态管理
  const state = {
    fragments: [],
    categories: [],
    tags: [],
    allRegisteredCategories: [],
    allRegisteredTags: [],
    redactWords: [],
    isRedactViewEnabled: true,
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
    shareCardTheme: "morandi-warm",
    shareApplyRedact: true,
    shareShowTags: true,
    shareShowFooter: true,
    undoStack: [],
    redoStack: [],
    isUndoRedoing: false,
    totalCount: 0
  };

  function loadStoredData() {
    try {
      if (window.extension_settings && window.extension_settings[EXTENSION_NAME]) {
        const d = window.extension_settings[EXTENSION_NAME];
        if (d && Array.isArray(d.fragments)) return d;
      }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.fragments)) return parsed;
      }
    } catch (e) {
      console.warn('[FragmentHub] 读取本地存储失败，使用默认数据:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }

  function saveStoredData(data) {
    try {
      if (window.extension_settings) {
        window.extension_settings[EXTENSION_NAME] = data;
        if (typeof window.saveSettingsDebounced === 'function') {
          window.saveSettingsDebounced();
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('[FragmentHub] 保存本地存储异常:', e);
    }
  }

  const db = {
    getAll: () => loadStoredData(),
    
    getFilteredFragments: (params) => {
      const data = loadStoredData();
      let list = [...data.fragments];

      if (params.q) {
        const kw = params.q.toLowerCase();
        list = list.filter(f => 
          (f.title && f.title.toLowerCase().includes(kw)) ||
          (f.content && f.content.toLowerCase().includes(kw)) ||
          (f.category && f.category.toLowerCase().includes(kw)) ||
          (f.tags && f.tags.toLowerCase().includes(kw))
        );
      }

      if (params.category) {
        list = list.filter(f => f.category === params.category);
      }

      if (params.tags && params.tags.length > 0) {
        const reqTags = params.tags;
        const mode = params.tag_mode || 'and';
        list = list.filter(f => {
          const fTags = (f.tags || '').split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
          if (mode === 'and') {
            return reqTags.every(rt => fTags.includes(rt));
          } else {
            return reqTags.some(rt => fTags.includes(rt));
          }
        });
      }

      const sort = params.sort || 'updated_desc';
      list.sort((a, b) => {
        if (sort === 'updated_desc') return new Date(b.updated_at) - new Date(a.updated_at);
        if (sort === 'updated_asc') return new Date(a.updated_at) - new Date(b.updated_at);
        if (sort === 'created_desc') return new Date(b.created_at) - new Date(a.created_at);
        if (sort === 'created_asc') return new Date(a.created_at) - new Date(b.created_at);
        if (sort === 'chars_desc') return (b.char_count || 0) - (a.char_count || 0);
        if (sort === 'chars_asc') return (a.char_count || 0) - (b.char_count || 0);
        if (sort === 'title_asc') return (a.title || '').localeCompare(b.title || '', 'zh-CN');
        if (sort === 'title_desc') return (b.title || '').localeCompare(a.title || '', 'zh-CN');
        return 0;
      });

      return list;
    },

    getMeta: (categoryFilter = '') => {
      const data = loadStoredData();
      const catCounts = {};
      data.fragments.forEach(f => {
        if (f.category) {
          catCounts[f.category] = (catCounts[f.category] || 0) + 1;
        }
      });

      const allCats = Array.from(new Set([...(data.categories || []), ...Object.keys(catCounts)])).sort();
      const categoriesWithCount = allCats.map(c => ({
        name: c,
        count: catCounts[c] || 0
      }));

      let tagSourceFragments = data.fragments;
      if (categoryFilter) {
        tagSourceFragments = tagSourceFragments.filter(f => f.category === categoryFilter);
      }

      const tagSet = new Set();
      tagSourceFragments.forEach(f => {
        if (f.tags) {
          f.tags.split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean).forEach(t => tagSet.add(t));
        }
      });

      if (!categoryFilter && data.tags) {
        data.tags.forEach(t => tagSet.add(t));
      }

      const allRegTags = Array.from(new Set([...Array.from(tagSet), ...(data.tags || [])])).sort();

      return {
        total_count: data.fragments.length,
        categories: categoriesWithCount,
        tags: Array.from(tagSet).sort(),
        all_registered_categories: allCats,
        all_registered_tags: allRegTags,
        redact_words: data.redactWords || []
      };
    },

    createFragment: (payload) => {
      const data = loadStoredData();
      const newId = data.fragments.length > 0 ? Math.max(...data.fragments.map(f => f.id || 0)) + 1 : 1;
      const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
      const content = payload.content || '';
      const fragment = {
        id: newId,
        title: payload.title || '无标题灵感',
        category: payload.category || '日常脑洞',
        tags: payload.tags || '',
        content: content,
        char_count: content.length,
        created_at: now,
        updated_at: now
      };
      data.fragments.unshift(fragment);

      if (fragment.category && !data.categories.includes(fragment.category)) {
        data.categories.push(fragment.category);
      }
      if (fragment.tags) {
        const newTags = fragment.tags.split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        newTags.forEach(t => {
          if (!data.tags.includes(t)) data.tags.push(t);
        });
      }

      saveStoredData(data);
      return fragment;
    },

    updateFragment: (id, payload) => {
      const data = loadStoredData();
      const idx = data.fragments.findIndex(f => f.id === parseInt(id, 10));
      if (idx === -1) return null;

      const content = payload.content !== undefined ? payload.content : data.fragments[idx].content;
      data.fragments[idx] = {
        ...data.fragments[idx],
        title: payload.title !== undefined ? payload.title : data.fragments[idx].title,
        category: payload.category !== undefined ? payload.category : data.fragments[idx].category,
        tags: payload.tags !== undefined ? payload.tags : data.fragments[idx].tags,
        content: content,
        char_count: content.length,
        updated_at: new Date().toISOString().replace('T', ' ').substring(0, 19)
      };

      if (data.fragments[idx].category && !data.categories.includes(data.fragments[idx].category)) {
        data.categories.push(data.fragments[idx].category);
      }
      if (data.fragments[idx].tags) {
        const newTags = data.fragments[idx].tags.split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        newTags.forEach(t => {
          if (!data.tags.includes(t)) data.tags.push(t);
        });
      }

      saveStoredData(data);
      return data.fragments[idx];
    },

    deleteFragment: (id) => {
      const data = loadStoredData();
      data.fragments = data.fragments.filter(f => f.id !== parseInt(id, 10));
      saveStoredData(data);
      return true;
    },

    batchUpdate: (ids, action, value) => {
      const data = loadStoredData();
      const idSet = new Set(ids.map(i => parseInt(i, 10)));
      let count = 0;

      if (action === 'delete_batch') {
        const initialLen = data.fragments.length;
        data.fragments = data.fragments.filter(f => !idSet.has(f.id));
        count = initialLen - data.fragments.length;
      } else if (action === 'set_category') {
        data.fragments.forEach(f => {
          if (idSet.has(f.id)) {
            f.category = value;
            f.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            count++;
          }
        });
        if (value && !data.categories.includes(value)) data.categories.push(value);
      } else if (action === 'add_tag') {
        const tagsToAdd = value.split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        data.forEachTags:
        data.fragments.forEach(f => {
          if (idSet.has(f.id)) {
            const curTags = (f.tags || '').split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
            tagsToAdd.forEach(t => {
              if (!curTags.includes(t)) curTags.push(t);
            });
            f.tags = curTags.join(', ');
            f.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
            count++;
          }
        });
        tagsToAdd.forEach(t => {
          if (!data.tags.includes(t)) data.tags.push(t);
        });
      }

      saveStoredData(data);
      return count;
    },

    manageCategories: (action, name) => {
      const data = loadStoredData();
      if (action === 'add') {
        if (!data.categories.includes(name)) data.categories.push(name);
      } else if (action === 'delete') {
        data.categories = data.categories.filter(c => c !== name);
        data.fragments.forEach(f => {
          if (f.category === name) f.category = '未分类';
        });
      }
      saveStoredData(data);
    },

    manageTags: (action, name) => {
      const data = loadStoredData();
      if (action === 'add') {
        if (!data.tags.includes(name)) data.tags.push(name);
      } else if (action === 'delete') {
        data.tags = data.tags.filter(t => t !== name);
        data.fragments.forEach(f => {
          if (f.tags) {
            const tags = f.tags.split(/[,，\s]+/).map(t => t.replace(/^#/, '').trim()).filter(t => t && t !== name);
            f.tags = tags.join(', ');
          }
        });
      }
      saveStoredData(data);
    },

    manageRedact: (action, word) => {
      const data = loadStoredData();
      if (!data.redactWords) data.redactWords = [];
      if (action === 'add') {
        if (!data.redactWords.includes(word)) data.redactWords.push(word);
      } else if (action === 'delete') {
        data.redactWords = data.redactWords.filter(w => w !== word);
      }
      saveStoredData(data);
    },

    globalReplace: (findStr, replaceStr, matchCase, includeTitle) => {
      const data = loadStoredData();
      let modifiedFragments = 0;
      let replacedOccurrences = 0;

      data.fragments.forEach(f => {
        let changed = false;
        const flags = matchCase ? 'g' : 'gi';
        const escapedFind = findStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const reg = new RegExp(escapedFind, flags);

        if (includeTitle && f.title) {
          const matchT = f.title.match(reg);
          if (matchT) {
            replacedOccurrences += matchT.length;
            f.title = f.title.replace(reg, replaceStr);
            changed = true;
          }
        }

        if (f.content) {
          const matchC = f.content.match(reg);
          if (matchC) {
            replacedOccurrences += matchC.length;
            f.content = f.content.replace(reg, replaceStr);
            f.char_count = f.content.length;
            changed = true;
          }
        }

        if (changed) {
          f.updated_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
          modifiedFragments++;
        }
      });

      saveStoredData(data);
      return { modifiedFragments, replacedOccurrences };
    },

    importData: (importedData) => {
      const data = loadStoredData();
      let importedCount = 0;
      if (Array.isArray(importedData.fragments)) {
        const existingIds = new Set(data.fragments.map(f => f.id));
        importedData.fragments.forEach(item => {
          let targetId = item.id;
          if (!targetId || existingIds.has(targetId)) {
            targetId = data.fragments.length > 0 ? Math.max(...data.fragments.map(f => f.id || 0)) + 1 : 1;
          }
          existingIds.add(targetId);
          data.fragments.push({
            id: targetId,
            title: item.title || '无标题灵感',
            category: item.category || '日常脑洞',
            tags: item.tags || '',
            content: item.content || '',
            char_count: (item.content || '').length,
            created_at: item.created_at || new Date().toISOString().replace('T', ' ').substring(0, 19),
            updated_at: item.updated_at || new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
          importedCount++;
        });
      }

      if (Array.isArray(importedData.categories)) {
        importedData.categories.forEach(c => {
          if (!data.categories.includes(c)) data.categories.push(c);
        });
      }
      if (Array.isArray(importedData.tags)) {
        importedData.tags.forEach(t => {
          if (!data.tags.includes(t)) data.tags.push(t);
        });
      }
      if (Array.isArray(importedData.redact_words)) {
        if (!data.redactWords) data.redactWords = [];
        importedData.redact_words.forEach(w => {
          if (!data.redactWords.includes(w)) data.redactWords.push(w);
        });
      }

      saveStoredData(data);
      return importedCount;
    }
  };

  function debounce(fn, delay = 250) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.display = 'block';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.display = 'none';
    }, 2200);
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.replace(' ', 'T'));
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const pad = (n) => String(n).padStart(2, '0');
    if (isToday) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function applyRedactHtml(text, allowRedact = true) {
    if (!text) return '';
    let escaped = escapeHtml(text);
    if (!allowRedact || !state.isRedactViewEnabled || !state.redactWords || state.redactWords.length === 0) {
      return escaped;
    }
    for (const word of state.redactWords) {
      if (!word || !word.trim()) continue;
      try {
        const escapedWord = word.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapedWord, 'gi');
        escaped = escaped.replace(regex, '<span class="redact-block">████</span>');
      } catch (e) {}
    }
    return escaped;
  }

  function highlightText(text, keyword) {
    if (!text) return '';
    const escaped = escapeHtml(text);
    if (!keyword) return escaped;
    const kw = keyword.trim();
    if (!kw) return escaped;
    try {
      const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(${escapedKw})`, 'gi');
      return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch (e) {
      return escaped;
    }
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve();
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.onload = () => resolve();
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  function insertToSillyTavernInput(text) {
    const chatInput = document.getElementById('send_textarea');
    if (!chatInput) {
      showToast('未找到酒馆聊天输入框');
      return;
    }
    const currentVal = chatInput.value;
    if (currentVal && !currentVal.endsWith('\n')) {
      chatInput.value = currentVal + '\n' + text;
    } else {
      chatInput.value = (currentVal || '') + text;
    }
    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
    chatInput.focus();
    showToast('已填入酒馆输入框 ✨');
    
    const wrapper = document.getElementById('fragment-hub-modal-wrapper');
    if (wrapper) wrapper.classList.remove('active');
  }

  async function fetchFragments() {
    const list = db.getFilteredFragments({
      q: state.searchKeyword,
      category: state.currentCategory,
      sort: state.sortBy,
      tags: Array.from(state.selectedTags),
      tag_mode: state.tagMatchMode
    });
    state.fragments = list;
    renderCards();
    renderStatus();
  }

  async function fetchMeta() {
    const meta = db.getMeta(state.currentCategory);
    state.categories = meta.categories;
    state.tags = meta.tags;
    state.allRegisteredCategories = meta.all_registered_categories;
    state.allRegisteredTags = meta.all_registered_tags;
    state.redactWords = meta.redact_words;
    state.totalCount = meta.total_count;

    renderCategoryChips();
    renderHomeTagPool();
  }

  function renderCategoryChips() {
    const container = document.getElementById('category-chips');
    if (!container) return;
    const cats = state.categories;

    let totalNum = state.totalCount || 0;
    if (!totalNum && cats.length) {
      totalNum = cats.reduce((acc, cur) => acc + (cur.count || 0), 0);
    }

    let html = `<button 
      class="chip-btn ${state.currentCategory === '' ? 'active' : ''}" 
      data-category=""
    >
      <span class="chip-name">全部灵感</span>
      <span class="chip-count">${totalNum}</span>
    </button>`;

    cats.forEach((cat) => {
      const isSelected = state.currentCategory === cat.name;
      html += `
        <button 
          class="chip-btn ${isSelected ? 'active' : ''}" 
          data-category="${escapeHtml(cat.name)}"
        >
          <span class="chip-name">${escapeHtml(cat.name)}</span>
          <span class="chip-count">${cat.count}</span>
        </button>
      `;
    });

    container.innerHTML = html;

    container.querySelectorAll('.chip-btn').forEach((chip) => {
      chip.onclick = () => {
        const cat = chip.dataset.category;
        state.currentCategory = cat;
        fetchMeta();
        fetchFragments();
      };
    });
  }

  function renderHomeTagPool() {
    const poolContainer = document.getElementById('tag-pool-container');
    const poolEl = document.getElementById('tag-pool');
    const countBadge = document.getElementById('tag-pool-count');
    const collapseText = document.getElementById('tag-collapse-text');
    const collapseArrow = document.getElementById('tag-collapse-arrow');
    const selectedBadge = document.getElementById('tag-pool-selected-badge');
    const selectedCountEl = document.getElementById('tag-pool-selected-count');
    const matchModeSwitch = document.getElementById('match-mode-switch');

    if (!poolContainer) return;
    if (!state.tags || state.tags.length === 0) {
      poolContainer.style.display = 'none';
      return;
    }
    poolContainer.style.display = 'flex';
    if (countBadge) countBadge.textContent = state.tags.length;

    const selCount = state.selectedTags.size;
    if (selCount > 0) {
      if (selectedBadge) selectedBadge.style.display = 'inline-flex';
      if (selectedCountEl) selectedCountEl.textContent = selCount;
      if (matchModeSwitch) matchModeSwitch.style.display = 'inline-flex';
    } else {
      if (selectedBadge) selectedBadge.style.display = 'none';
      if (matchModeSwitch) matchModeSwitch.style.display = 'none';
    }

    if (poolEl) {
      poolEl.innerHTML = state.tags.map(t => {
        const isSelected = state.selectedTags.has(t);
        return `<span class="tag-item ${isSelected ? 'active' : ''}" data-tag="${escapeHtml(t)}">#${escapeHtml(t)}</span>`;
      }).join('');

      if (state.isHomeTagPoolExpanded) {
        poolEl.style.display = 'flex';
        if (collapseText) collapseText.textContent = '收起';
        if (collapseArrow) collapseArrow.classList.add('expanded');
      } else {
        poolEl.style.display = 'none';
        if (collapseText) collapseText.textContent = '展开';
        if (collapseArrow) collapseArrow.classList.remove('expanded');
      }

      poolEl.querySelectorAll('.tag-item').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const clickedTag = el.dataset.tag;
          if (state.selectedTags.has(clickedTag)) {
            state.selectedTags.delete(clickedTag);
          } else {
            state.selectedTags.add(clickedTag);
          }
          renderHomeTagPool();
          fetchFragments();
        };
      });
    }
  }

  function setupHomeTagPoolToggle() {
    const toggleBtn = document.getElementById('tag-pool-toggle-btn');
    if (!toggleBtn) return;
    toggleBtn.onclick = () => {
      state.isHomeTagPoolExpanded = !state.isHomeTagPoolExpanded;
      renderHomeTagPool();
    };

    const btnModeAnd = document.getElementById('btn-mode-and');
    const btnModeOr = document.getElementById('btn-mode-or');
    if (btnModeAnd && btnModeOr) {
      btnModeAnd.onclick = () => {
        if (state.tagMatchMode !== 'and') {
          state.tagMatchMode = 'and';
          btnModeAnd.classList.add('active');
          btnModeOr.classList.remove('active');
          fetchFragments();
        }
      };
      btnModeOr.onclick = () => {
        if (state.tagMatchMode !== 'or') {
          state.tagMatchMode = 'or';
          btnModeOr.classList.add('active');
          btnModeAnd.classList.remove('active');
          fetchFragments();
        }
      };
    }
  }

  function renderStatus() {
    const totalCount = state.fragments.length;
    const catText = state.currentCategory ? ` · 分类「${state.currentCategory}」` : '';
    const kwText = state.searchKeyword ? ` · 搜「${state.searchKeyword}」` : '';
    const tagsArr = Array.from(state.selectedTags);
    const tagsText = tagsArr.length > 0 ? ` · 标签「${tagsArr.map(t => '#' + t).join(', ')}」(${state.tagMatchMode === 'and' ? '同时包含' : '包含其一'})` : '';

    const countEl = document.getElementById('status-count');
    const filterDescEl = document.getElementById('status-filter-desc');
    if (countEl) countEl.textContent = totalCount;
    if (filterDescEl) filterDescEl.textContent = `${catText}${tagsText}${kwText}`;
  }

  function renderCards() {
    const container = document.getElementById('cards-container');
    if (!container) return;
    if (state.fragments.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px 16px; color: var(--text-light);">
          <svg class="icon" style="width:36px;height:36px;margin-bottom:8px;stroke:var(--border-light);" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <p>暂无符合条件的碎片，点击右上角「新建梗」写下第一条灵感吧</p>
        </div>
      `;
      return;
    }

    const kw = state.searchKeyword;

    container.innerHTML = state.fragments.map((frag) => {
      const rawTitle = frag.title || '无标题灵感';
      const rawCat = frag.category || '未分类';
      const rawContent = frag.content || '（暂无正文内容）';
      const rawTags = (frag.tags || '').split(/[,，\\s]+/).filter(Boolean);

      const titleRedacted = applyRedactHtml(rawTitle);
      const contentRedacted = applyRedactHtml(rawContent);
      const titleHtml = kw ? highlightText(rawTitle, kw) : titleRedacted;
      const catHtml = highlightText(rawCat, kw);
      const previewHtml = kw ? highlightText(rawContent, kw) : contentRedacted;
      const tagsHtml = rawTags.map(t => `<span class="card-tag">#${highlightText(t, kw)}</span>`).join('');

      const chars = frag.char_count || (frag.content ? frag.content.length : 0);
      const dateStr = formatDate(frag.updated_at);
      const isSelected = state.selectedFragmentIds.has(frag.id);

      return `
        <article class="card-item ${isSelected ? 'batch-selected' : ''}" data-id="${frag.id}">
          ${state.isBatchMode ? `
            <input type="checkbox" class="card-batch-checkbox" data-id="${frag.id}" ${isSelected ? 'checked' : ''}>
          ` : ''}
          <div class="card-header">
            <h3 class="card-title">${titleHtml}</h3>
            <span class="card-category-badge">${catHtml}</span>
          </div>
          <div class="card-preview-text">${previewHtml}</div>
          ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
          <div class="card-footer">
            <div style="display:flex;align-items:center;gap:6px;">
              <span>${chars} 字</span>
              <button class="icon-btn-action btn-card-quick-send" data-id="${frag.id}" title="直接填入酒馆输入框" style="padding:2px 6px;font-size:11px;height:auto;cursor:pointer;">
                <svg class="icon-sm" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                <span>填入</span>
              </button>
            </div>
            <time>${dateStr}</time>
          </div>
        </article>
      `;
    }).join('');

    container.querySelectorAll('.card-item').forEach((card) => {
      const id = parseInt(card.dataset.id, 10);
      const checkbox = card.querySelector('.card-batch-checkbox');
      const quickSendBtn = card.querySelector('.btn-card-quick-send');

      if (quickSendBtn) {
        quickSendBtn.onclick = (e) => {
          e.stopPropagation();
          const frag = state.fragments.find(f => f.id === id);
          if (frag && frag.content) {
            insertToSillyTavernInput(frag.content);
          }
        };
      }

      card.onclick = (e) => {
        if (state.isBatchMode) {
          if (e.target !== checkbox) {
            toggleSelectFragment(id);
          }
        } else {
          const frag = state.fragments.find(f => f.id === id);
          if (frag) openEditor(frag);
        }
      };

      if (checkbox) {
        checkbox.onclick = (e) => {
          e.stopPropagation();
          toggleSelectFragment(id);
        };
      }
    });
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

  function setupBatchMode() {
    const btnToggle = document.getElementById('btn-toggle-batch-mode');
    const batchBar = document.getElementById('batch-action-bar');
    const btnCancel = document.getElementById('btn-batch-cancel');
    const selectAllBox = document.getElementById('batch-select-all');

    if (!btnToggle || !batchBar) return;

    btnToggle.onclick = () => {
      state.isBatchMode = !state.isBatchMode;
      state.selectedFragmentIds.clear();
      btnToggle.classList.toggle('active', state.isBatchMode);
      batchBar.style.display = state.isBatchMode ? 'block' : 'none';
      updateBatchUI();
      renderCards();
    };

    if (btnCancel) {
      btnCancel.onclick = () => {
        state.isBatchMode = false;
        state.selectedFragmentIds.clear();
        btnToggle.classList.remove('active');
        batchBar.style.display = 'none';
        renderCards();
      };
    }

    if (selectAllBox) {
      selectAllBox.onchange = () => {
        if (selectAllBox.checked) {
          state.fragments.forEach(f => state.selectedFragmentIds.add(f.id));
        } else {
          state.selectedFragmentIds.clear();
        }
        updateBatchUI();
        renderCards();
      };
    }

    document.getElementById('btn-batch-set-cat').onclick = () => {
      if (state.selectedFragmentIds.size === 0) {
        showToast('请先勾选需要修改的碎片');
        return;
      }
      const modal = document.getElementById('batch-cat-modal');
      document.getElementById('batch-cat-count-text').textContent = state.selectedFragmentIds.size;
      const select = document.getElementById('batch-cat-select');
      select.innerHTML = state.allRegisteredCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    };

    document.getElementById('btn-close-batch-cat').onclick = () => {
      document.getElementById('batch-cat-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
    };
    document.getElementById('btn-cancel-batch-cat').onclick = () => {
      document.getElementById('batch-cat-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
    };

    document.getElementById('btn-confirm-batch-cat').onclick = async () => {
      const val = document.getElementById('batch-cat-select').value;
      const count = db.batchUpdate(Array.from(state.selectedFragmentIds), 'set_category', val);
      showToast(`成功将 ${count} 篇碎片修改为「${val}」`);
      document.getElementById('batch-cat-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
      state.selectedFragmentIds.clear();
      await fetchMeta();
      await fetchFragments();
    };

    document.getElementById('btn-batch-add-tags').onclick = () => {
      if (state.selectedFragmentIds.size === 0) {
        showToast('请先勾选需要添加标签的碎片');
        return;
      }
      const modal = document.getElementById('batch-tags-modal');
      document.getElementById('batch-tags-count-text').textContent = state.selectedFragmentIds.size;
      document.getElementById('batch-tags-input').value = '';
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    };

    document.getElementById('btn-close-batch-tags').onclick = () => {
      document.getElementById('batch-tags-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
    };
    document.getElementById('btn-cancel-batch-tags').onclick = () => {
      document.getElementById('batch-tags-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
    };

    document.getElementById('btn-confirm-batch-tags').onclick = async () => {
      const val = document.getElementById('batch-tags-input').value.trim();
      if (!val) {
        showToast('请输入要添加的标签');
        return;
      }
      const count = db.batchUpdate(Array.from(state.selectedFragmentIds), 'add_tag', val);
      showToast(`成功为 ${count} 篇碎片追加标签`);
      document.getElementById('batch-tags-modal').style.display = 'none';
      document.body.classList.remove('modal-open');
      state.selectedFragmentIds.clear();
      await fetchMeta();
      await fetchFragments();
    };

    document.getElementById('btn-batch-delete').onclick = async () => {
      const size = state.selectedFragmentIds.size;
      if (size === 0) {
        showToast('请先勾选需要删除的碎片');
        return;
      }
      if (!confirm(`确定要批量删除选中的 ${size} 篇碎片吗？此操作无法撤销！`)) return;

      const count = db.batchUpdate(Array.from(state.selectedFragmentIds), 'delete_batch');
      showToast(`已成功删除 ${count} 篇碎片`);
      state.selectedFragmentIds.clear();
      await fetchMeta();
      await fetchFragments();
    };
  }

  function updateBatchUI() {
    const count = state.selectedFragmentIds.size;
    const countEl = document.getElementById('batch-selected-count');
    const selectAllBox = document.getElementById('batch-select-all');
    if (countEl) countEl.textContent = count;
    if (selectAllBox) {
      selectAllBox.checked = count > 0 && count === state.fragments.length;
    }
  }

  function setupRedactGlobalToggle() {
    const btn = document.getElementById('btn-toggle-redact-view');
    if (!btn) return;
    const updateBtnUI = () => {
      if (state.isRedactViewEnabled) {
        btn.classList.add('active');
        btn.title = '当前：打码保护开启 (敏感词已遮罩)，点击可查看明文';
      } else {
        btn.classList.remove('active');
        btn.title = '当前：打码保护已关闭 (显示明文)，点击开启遮罩';
      }
    };
    updateBtnUI();

    btn.onclick = () => {
      state.isRedactViewEnabled = !state.isRedactViewEnabled;
      updateBtnUI();
      showToast(state.isRedactViewEnabled ? '敏感词打码已开启 (████)' : '敏感词打码已关闭 (明文展示)');
      renderCards();
    };
  }

  function setupCardShareModal() {
    const modal = document.getElementById('card-share-modal');
    const btnOpen = document.getElementById('btn-open-card-share');
    const btnClose = document.getElementById('btn-close-card-share');
    if (!modal || !btnOpen) return;

    const themeDots = modal.querySelectorAll('.theme-dot');
    const toggleRedact = document.getElementById('share-toggle-redact');
    const toggleTags = document.getElementById('share-toggle-tags');
    const toggleFooter = document.getElementById('share-toggle-footer');
    const btnCopyText = document.getElementById('btn-copy-card-text');
    const btnDownloadImg = document.getElementById('btn-download-card-img');
    const btnDownloadText = document.getElementById('btn-download-card-text');
    const previewBox = document.getElementById('share-preview-img-box');
    const previewImg = document.getElementById('share-preview-img');

    btnOpen.onclick = () => {
      if (previewBox) previewBox.style.display = 'none';
      updateCardSharePreview();
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    };

    const closeModal = () => {
      modal.style.display = 'none';
      if (document.getElementById('editor-modal').style.display === 'none') {
        document.body.classList.remove('modal-open');
      }
    };
    if (btnClose) btnClose.onclick = closeModal;

    themeDots.forEach(dot => {
      dot.onclick = () => {
        themeDots.forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        state.shareCardTheme = dot.dataset.theme;
        updateCardSharePreview();
        if (previewBox) previewBox.style.display = 'none';
      };
    });

    if (toggleRedact) {
      toggleRedact.onchange = () => {
        state.shareApplyRedact = toggleRedact.checked;
        updateCardSharePreview();
        if (previewBox) previewBox.style.display = 'none';
      };
    }

    if (toggleTags) {
      toggleTags.onchange = () => {
        state.shareShowTags = toggleTags.checked;
        updateCardSharePreview();
        if (previewBox) previewBox.style.display = 'none';
      };
    }

    if (toggleFooter) {
      toggleFooter.onchange = () => {
        state.shareShowFooter = toggleFooter.checked;
        updateCardSharePreview();
        if (previewBox) previewBox.style.display = 'none';
      };
    }

    if (btnCopyText) {
      btnCopyText.onclick = () => {
        const title = document.getElementById('edit-title').value.trim() || '无标题灵感';
        const cat = getSelectedCategoryValue();
        const tags = document.getElementById('edit-tags').value.trim();
        let content = document.getElementById('edit-content').value;

        if (state.shareApplyRedact && state.redactWords && state.redactWords.length > 0) {
          for (const w of state.redactWords) {
            if (!w.trim()) continue;
            const reg = new RegExp(w.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            content = content.replace(reg, '████');
          }
        }

        let copyText = '【' + title + '】\n分类: ' + cat + '\n';
        if (tags) copyText += '标签: ' + tags + '\n';
        copyText += '------------------------\n' + content + '\n------------------------\n—— 记录于 灵感碎片 · Fragment Hub';

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(copyText).then(() => {
            showToast('排版文本已成功复制到剪贴板');
          }).catch(() => {
            fallbackCopy(copyText);
          });
        } else {
          fallbackCopy(copyText);
        }
      };
    }

    function fallbackCopy(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        showToast('排版文本已成功复制到剪贴板');
      } catch (e) {
        showToast('复制失败，请手动选取文字');
      }
      document.body.removeChild(ta);
    }

    if (btnDownloadImg) {
      btnDownloadImg.onclick = async () => {
        const cardEl = document.getElementById('share-render-card');
        if (!cardEl) return;

        showToast('正在渲染高清卡片图片...');
        btnDownloadImg.disabled = true;
        if (btnDownloadText) btnDownloadText.textContent = '生成中...';

        try {
          await loadHtml2Canvas();
          if (window.html2canvas) {
            const canvas = await window.html2canvas(cardEl, {
              scale: 2.5,
              useCORS: true,
              allowTaint: true,
              backgroundColor: null,
              logging: false
            });

            const imgUrl = canvas.toDataURL('image/png');
            const titleStr = (document.getElementById('edit-title').value.trim() || '灵感碎片').replace(/[/\\?%*:|"<>]/g, '');
            const fileName = titleStr + '_分享卡片.png';

            if (previewImg && previewBox) {
              previewImg.src = imgUrl;
              previewBox.style.display = 'flex';
              previewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }

            let nativeShared = false;
            if (navigator.canShare && canvas.toBlob) {
              try {
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                if (blob) {
                  const file = new File([blob], fileName, { type: 'image/png' });
                  if (navigator.canShare({ files: [file] })) {
                    await navigator.share({
                      files: [file],
                      title: titleStr,
                      text: '来自灵感碎片 · Fragment Hub'
                    });
                    nativeShared = true;
                    showToast('已调起系统分享 / 保存');
                  }
                }
              } catch (shareErr) {
                console.log('Web share canceled or unsupported:', shareErr);
              }
            }

            if (!nativeShared) {
              try {
                const a = document.createElement('a');
                a.download = fileName;
                a.href = imgUrl;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                  document.body.removeChild(a);
                }, 100);
                showToast('图片已生成！长按下图可直接保存到相册');
              } catch (downloadErr) {
                showToast('图片已生成，请长按下图保存至相册');
              }
            }
          } else {
            showToast('渲染组件加载失败，请检查网络');
          }
        } catch (err) {
          console.error('生成卡片失败:', err);
          showToast('生成图片失败，请重试');
        } finally {
          btnDownloadImg.disabled = false;
          if (btnDownloadText) btnDownloadText.textContent = '生成并保存图片';
        }
      };
    }
  }

  function updateCardSharePreview() {
    const card = document.getElementById('share-render-card');
    const catEl = document.getElementById('share-preview-cat');
    const dateEl = document.getElementById('share-preview-date');
    const titleEl = document.getElementById('share-preview-title');
    const contentEl = document.getElementById('share-preview-content');
    const tagsEl = document.getElementById('share-preview-tags');
    const footerEl = document.getElementById('share-preview-footer');
    const wordsEl = document.getElementById('share-preview-words');

    if (!card) return;

    card.className = 'share-card theme-' + state.shareCardTheme;

    const rawTitle = document.getElementById('edit-title').value.trim() || '无标题灵感';
    const rawCat = getSelectedCategoryValue();
    const rawContent = document.getElementById('edit-content').value || '（暂无正文内容）';
    const rawTags = document.getElementById('edit-tags').value.trim();

    if (catEl) catEl.textContent = rawCat;

    const now = new Date();
    if (dateEl) dateEl.textContent = now.getFullYear() + '.' + String(now.getMonth() + 1).padStart(2, '0') + '.' + String(now.getDate()).padStart(2, '0');

    if (state.shareApplyRedact) {
      if (titleEl) titleEl.innerHTML = applyRedactHtml(rawTitle, true);
      if (contentEl) contentEl.innerHTML = applyRedactHtml(rawContent, true);
    } else {
      if (titleEl) titleEl.textContent = rawTitle;
      if (contentEl) contentEl.textContent = rawContent;
    }

    if (tagsEl) {
      if (state.shareShowTags && rawTags) {
        tagsEl.style.display = 'flex';
        const tagList = rawTags.split(/[,，\\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
        tagsEl.innerHTML = tagList.map(t => '<span class="share-card-tag">#' + escapeHtml(t) + '</span>').join('');
      } else {
        tagsEl.style.display = 'none';
      }
    }

    if (footerEl) {
      if (state.shareShowFooter) {
        footerEl.style.display = 'flex';
        if (wordsEl) wordsEl.textContent = rawContent.length + ' 字';
      } else {
        footerEl.style.display = 'none';
      }
    }
  }

  function setupSettingsModal() {
    const btnOpen = document.getElementById('btn-open-settings');
    const modal = document.getElementById('settings-modal');
    const btnClose = document.getElementById('btn-close-settings');
    if (!modal || !btnOpen) return;

    btnOpen.onclick = () => {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
      renderSettingsManageLists();
    };
    if (btnClose) {
      btnClose.onclick = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      };
    }

    document.getElementById('btn-add-new-cat').onclick = async () => {
      const input = document.getElementById('new-cat-input');
      const val = input.value.trim();
      if (!val) return;
      db.manageCategories('add', val);
      input.value = '';
      showToast(`已添加分类「${val}」`);
      await fetchMeta();
      renderSettingsManageLists();
    };

    document.getElementById('btn-add-new-redact').onclick = async () => {
      const input = document.getElementById('new-redact-input');
      const val = input.value.trim();
      if (!val) return;
      const words = val.split(/[,，\\s]+/).map(w => w.trim()).filter(Boolean);
      for (const w of words) {
        db.manageRedact('add', w);
      }
      input.value = '';
      showToast('已添加打码词');
      await fetchMeta();
      await fetchFragments();
      renderSettingsManageLists();
    };

    document.getElementById('btn-add-new-tag').onclick = async () => {
      const input = document.getElementById('new-tag-input');
      const val = input.value.trim();
      if (!val) return;
      const tags = val.split(/[,，\\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
      for (const t of tags) {
        db.manageTags('add', t);
      }
      input.value = '';
      showToast('已添加标签');
      await fetchMeta();
      renderSettingsManageLists();
    };
  }

  function renderSettingsManageLists() {
    const redactListEl = document.getElementById('manage-redact-list');
    const catListEl = document.getElementById('manage-category-list');
    const tagListEl = document.getElementById('manage-tag-list');

    if (redactListEl) {
      if (!state.redactWords || state.redactWords.length === 0) {
        redactListEl.innerHTML = '<div style="font-size:12px;color:var(--text-light);padding:4px;">暂无打码词，可在上方添加</div>';
      } else {
        redactListEl.innerHTML = state.redactWords.map(w => '<div class="tag-manage-item"><span style="display:inline-flex;align-items:center;gap:4px;"><span class="redact-block" style="font-size:10px;">██</span>' + escapeHtml(w) + '</span><button class="manage-item-del" data-type="redact" data-word="' + escapeHtml(w) + '" title="删除打码词">&times;</button></div>').join('');

        redactListEl.querySelectorAll(".manage-item-del[data-type='redact']").forEach(btn => {
          btn.onclick = async () => {
            const word = btn.dataset.word;
            db.manageRedact('delete', word);
            showToast('已删除打码词「' + word + '」');
            await fetchMeta();
            await fetchFragments();
            renderSettingsManageLists();
          };
        });
      }
    }

    if (catListEl) {
      catListEl.innerHTML = state.allRegisteredCategories.map(c => `
        <div class="manage-item">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            ${escapeHtml(c)}
          </span>
          <button class="manage-item-del" data-type="cat" data-name="${escapeHtml(c)}" title="删除分类">&times;</button>
        </div>
      `).join('');

      catListEl.querySelectorAll('.manage-item-del').forEach(btn => {
        btn.onclick = async () => {
          const name = btn.dataset.name;
          if (!confirm(`确定要删除分类「${name}」吗？已存在此分类下的碎片将被重置为「未分类」。`)) return;
          db.manageCategories('delete', name);
          showToast(`已删除分类「${name}」`);
          await fetchMeta();
          await fetchFragments();
          renderSettingsManageLists();
        };
      });
    }

    if (tagListEl) {
      tagListEl.innerHTML = state.allRegisteredTags.map(t => `
        <div class="tag-manage-item">
          <span style="display:inline-flex;align-items:center;gap:4px;">
            <svg class="icon-sm" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
            #${escapeHtml(t)}
          </span>
          <button class="manage-item-del" data-type="tag" data-name="${escapeHtml(t)}" title="删除标签">&times;</button>
        </div>
      `).join('');

      tagListEl.querySelectorAll('.manage-item-del').forEach(btn => {
        btn.onclick = async () => {
          const name = btn.dataset.name;
          if (!confirm(`确定要删除标签「#${name}」吗？该标签将从所有碎片中移除。`)) return;
          db.manageTags('delete', name);
          showToast(`已删除标签「#${name}」`);
          await fetchMeta();
          await fetchFragments();
          renderSettingsManageLists();
        };
      });
    }
  }

  function setupCategorySelect(selectedCategory) {
    const selectEl = document.getElementById('edit-category-select');
    const customInput = document.getElementById('edit-category-custom');
    if (!selectEl) return;

    const allCats = state.allRegisteredCategories.length ? state.allRegisteredCategories : ['日常脑洞', '原著延伸/番外', '现背AU', '未分类'];

    let html = allCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    html += `<option value="__NEW__">➕ 新建自定义分类...</option>`;
    selectEl.innerHTML = html;

    if (allCats.includes(selectedCategory)) {
      selectEl.value = selectedCategory;
      customInput.style.display = 'none';
      customInput.value = '';
    } else if (selectedCategory) {
      selectEl.value = '__NEW__';
      customInput.style.display = 'block';
      customInput.value = selectedCategory;
    } else {
      selectEl.value = allCats[0] || '日常脑洞';
      customInput.style.display = 'none';
      customInput.value = '';
    }

    selectEl.onchange = () => {
      if (selectEl.value === '__NEW__') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
        customInput.value = '';
      }
    };
  }

  function getSelectedCategoryValue() {
    const selectEl = document.getElementById('edit-category-select');
    const customInput = document.getElementById('edit-category-custom');
    if (!selectEl) return '未分类';
    if (selectEl.value === '__NEW__') {
      return customInput.value.trim() || '未分类';
    }
    return selectEl.value || '未分类';
  }

  function setupEditorTagsSelector(initialTagsStr) {
    const tagsInput = document.getElementById('edit-tags');
    const panel = document.getElementById('history-tags-panel');
    const listEl = document.getElementById('editor-history-tags-list');
    const countEl = document.getElementById('editor-history-count');
    const collapseText = document.getElementById('editor-tag-collapse-text');
    const collapseArrow = document.getElementById('editor-tag-collapse-arrow');

    if (!tagsInput || !panel) return;

    tagsInput.value = initialTagsStr || '';
    const allKnownTags = state.allRegisteredTags;

    if (allKnownTags.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'flex';
    if (countEl) countEl.textContent = allKnownTags.length;

    function renderEditorCollapseState() {
      if (state.isEditorTagPoolExpanded) {
        listEl.style.display = 'flex';
        if (collapseText) collapseText.textContent = '收起';
        if (collapseArrow) collapseArrow.classList.add('expanded');
      } else {
        listEl.style.display = 'none';
        if (collapseText) collapseText.textContent = '展开';
        if (collapseArrow) collapseArrow.classList.remove('expanded');
      }
    }
    renderEditorCollapseState();

    const toggleHistoryBtn = document.getElementById('history-tags-toggle-btn');
    if (toggleHistoryBtn) {
      toggleHistoryBtn.onclick = () => {
        state.isEditorTagPoolExpanded = !state.isEditorTagPoolExpanded;
        renderEditorCollapseState();
      };
    }

    function getCurrentInputTags() {
      return tagsInput.value.split(/[,，\\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean);
    }

    function refreshTagSelectionStates() {
      const current = getCurrentInputTags();
      listEl.querySelectorAll('.tag-selectable').forEach(el => {
        const tagText = el.dataset.tag;
        const isSelected = current.includes(tagText);
        el.classList.toggle('selected', isSelected);
      });
    }

    listEl.innerHTML = allKnownTags.map(t => {
      return `<span class="tag-selectable" data-tag="${escapeHtml(t)}"><span class="check-mark">✓ </span>#${escapeHtml(t)}</span>`;
    }).join('');

    listEl.querySelectorAll('.tag-selectable').forEach(el => {
      el.onclick = () => {
        const clickedTag = el.dataset.tag;
        let current = getCurrentInputTags();

        if (current.includes(clickedTag)) {
          current = current.filter(t => t !== clickedTag);
        } else {
          current.push(clickedTag);
        }

        tagsInput.value = current.join(', ');
        refreshTagSelectionStates();
      };
    });

    tagsInput.oninput = () => {
      refreshTagSelectionStates();
    };

    refreshTagSelectionStates();
  }

  function pushHistorySnapshot() {
    if (state.isUndoRedoing) return;
    const content = document.getElementById('edit-content').value;
    const title = document.getElementById('edit-title').value;
    const tags = document.getElementById('edit-tags').value;

    const currentSnapshot = JSON.stringify({ title, tags, content });
    const lastSnapshot = state.undoStack[state.undoStack.length - 1];

    if (lastSnapshot !== currentSnapshot) {
      state.undoStack.push(currentSnapshot);
      if (state.undoStack.length > 50) state.undoStack.shift();
      state.redoStack = [];
      updateUndoRedoButtons();
    }
  }

  function updateUndoRedoButtons() {
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');
    if (btnUndo) btnUndo.disabled = (state.undoStack.length <= 1);
    if (btnRedo) btnRedo.disabled = (state.redoStack.length === 0);
  }

  function handleUndo() {
    if (state.undoStack.length <= 1) return;
    const current = state.undoStack.pop();
    state.redoStack.push(current);

    const prev = JSON.parse(state.undoStack[state.undoStack.length - 1]);
    state.isUndoRedoing = true;
    document.getElementById('edit-title').value = prev.title;
    document.getElementById('edit-tags').value = prev.tags;
    document.getElementById('edit-content').value = prev.content;
    updateCharCounter();
    updateUndoRedoButtons();
    state.isUndoRedoing = false;
    showToast('已撤回');
  }

  function handleRedo() {
    if (state.redoStack.length === 0) return;
    const nextJson = state.redoStack.pop();
    state.undoStack.push(nextJson);

    const next = JSON.parse(nextJson);
    state.isUndoRedoing = true;
    document.getElementById('edit-title').value = next.title;
    document.getElementById('edit-tags').value = next.tags;
    document.getElementById('edit-content').value = next.content;
    updateCharCounter();
    updateUndoRedoButtons();
    state.isUndoRedoing = false;
    showToast('已重做');
  }

  function openEditor(fragment = null) {
    state.editingFragment = fragment;
    const modal = document.getElementById('editor-modal');
    const modeTitle = document.getElementById('editor-modal-mode-title');
    const btnDel = document.getElementById('btn-delete-fragment');
    const replacePanel = document.getElementById('doc-replace-panel');
    const toggleBtn = document.getElementById('btn-toggle-doc-replace');

    if (replacePanel) replacePanel.style.display = 'none';
    if (toggleBtn) toggleBtn.classList.remove('active');
    document.getElementById('doc-find-input').value = '';
    document.getElementById('doc-replace-input').value = '';
    document.getElementById('doc-match-count').textContent = '0 处匹配';

    state.undoStack = [];
    state.redoStack = [];

    if (fragment) {
      modeTitle.textContent = '编辑碎片';
      document.getElementById('edit-id').value = fragment.id;
      document.getElementById('edit-title').value = fragment.title || '';
      document.getElementById('edit-content').value = fragment.content || '';
      if (btnDel) btnDel.style.display = 'inline-flex';

      setupCategorySelect(fragment.category || '日常脑洞');
      setupEditorTagsSelector(fragment.tags || '');
    } else {
      modeTitle.textContent = '新建灵感';
      document.getElementById('edit-id').value = '';
      document.getElementById('edit-title').value = '';
      document.getElementById('edit-content').value = '';
      if (btnDel) btnDel.style.display = 'none';

      setupCategorySelect(state.currentCategory || '日常脑洞');
      setupEditorTagsSelector(state.selectedTags.size > 0 ? Array.from(state.selectedTags).join(', ') : '');
    }

    const initContent = document.getElementById('edit-content').value;
    const initTitle = document.getElementById('edit-title').value;
    const initTags = document.getElementById('edit-tags').value;
    state.undoStack.push(JSON.stringify({ title: initTitle, tags: initTags, content: initContent }));
    updateUndoRedoButtons();

    updateCharCounter();
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

    setTimeout(() => {
      if (!fragment) {
        document.getElementById('edit-title').focus();
      }
    }, 100);
  }

  function closeEditor() {
    const modal = document.getElementById('editor-modal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    state.editingFragment = null;
  }

  function updateCharCounter() {
    const content = document.getElementById('edit-content').value;
    const chars = content.length;
    const lines = content ? content.split('\n').length : 0;
    const charEl = document.getElementById('stat-chars');
    const lineEl = document.getElementById('stat-lines');
    if (charEl) charEl.textContent = chars;
    if (lineEl) lineEl.textContent = lines;
  }

  async function saveFragment() {
    const id = document.getElementById('edit-id').value;
    const title = document.getElementById('edit-title').value.trim() || '无标题灵感';
    const category = getSelectedCategoryValue();
    const tags = document.getElementById('edit-tags').value.trim();
    const content = document.getElementById('edit-content').value;

    const payload = { title, category, tags, content };

    if (id) {
      db.updateFragment(id, payload);
      showToast('已保存修改 ✨');
    } else {
      db.createFragment(payload);
      showToast('已新建灵感 ✨');
    }

    closeEditor();
    await fetchMeta();
    await fetchFragments();
  }

  async function deleteFragment() {
    const id = document.getElementById('edit-id').value;
    if (!id) return;
    if (!confirm('确定要删除这条碎片吗？')) return;

    db.deleteFragment(id);
    showToast('已删除');
    closeEditor();
    await fetchMeta();
    await fetchFragments();
  }

  function setupSingleDocReplace() {
    const toggleBtn = document.getElementById('btn-toggle-doc-replace');
    const panel = document.getElementById('doc-replace-panel');
    const findInput = document.getElementById('doc-find-input');
    const replaceInput = document.getElementById('doc-replace-input');
    const countEl = document.getElementById('doc-match-count');
    const contentArea = document.getElementById('edit-content');

    if (!toggleBtn || !panel) return;

    toggleBtn.onclick = () => {
      const isShown = panel.style.display !== 'none';
      panel.style.display = isShown ? 'none' : 'flex';
      toggleBtn.classList.toggle('active', !isShown);
      if (!isShown) findInput.focus();
    };

    function updateMatchCount() {
      const findStr = findInput.value;
      if (!findStr) {
        countEl.textContent = '0 处匹配';
        return;
      }
      const text = contentArea.value;
      let count = 0;
      let pos = text.indexOf(findStr);
      while (pos !== -1) {
        count++;
        pos = text.indexOf(findStr, pos + findStr.length);
      }
      countEl.textContent = `${count} 处匹配`;
    }

    findInput.addEventListener('input', updateMatchCount);

    document.getElementById('btn-doc-replace-one').onclick = () => {
      const findStr = findInput.value;
      const replaceStr = replaceInput.value;
      if (!findStr) return;

      const text = contentArea.value;
      const idx = text.indexOf(findStr);
      if (idx !== -1) {
        const newText = text.substring(0, idx) + replaceStr + text.substring(idx + findStr.length);
        contentArea.value = newText;
        updateCharCounter();
        updateMatchCount();
        pushHistorySnapshot();
        showToast('已替换 1 处');
      } else {
        showToast('未找到匹配内容');
      }
    };

    document.getElementById('btn-doc-replace-all').onclick = () => {
      const findStr = findInput.value;
      const replaceStr = replaceInput.value;
      if (!findStr) return;

      const text = contentArea.value;
      const splitArr = text.split(findStr);
      const count = splitArr.length - 1;
      if (count > 0) {
        contentArea.value = splitArr.join(replaceStr);
        updateCharCounter();
        updateMatchCount();
        pushHistorySnapshot();
        showToast(`已在当前篇替换 ${count} 处`);
      } else {
        showToast('未找到匹配内容');
      }
    };
  }

  function setupGlobalReplace() {
    const btnOpen = document.getElementById('btn-open-global-replace');
    const modal = document.getElementById('global-replace-modal');
    const btnClose = document.getElementById('btn-close-global-replace');
    const btnCancel = document.getElementById('btn-cancel-global-replace');
    const btnExec = document.getElementById('btn-exec-global-replace');
    const resultBox = document.getElementById('global-replace-result');

    if (!btnOpen || !modal) return;

    btnOpen.onclick = () => {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
      resultBox.style.display = 'none';
      document.getElementById('global-find-text').focus();
    };

    const close = () => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
    };
    if (btnClose) btnClose.onclick = close;
    if (btnCancel) btnCancel.onclick = close;

    btnExec.onclick = async () => {
      const findStr = document.getElementById('global-find-text').value;
      const replaceStr = document.getElementById('global-replace-text').value;
      const matchCase = document.getElementById('global-match-case').checked;
      const includeTitle = document.getElementById('global-include-title').checked;

      if (!findStr) {
        showToast('请输入要查找的内容');
        return;
      }

      if (!confirm(`确认在整个数据库的所有碎片中，将「${findStr}」全局替换为「${replaceStr}」吗？`)) {
        return;
      }

      const res = db.globalReplace(findStr, replaceStr, matchCase, includeTitle);
      resultBox.style.display = 'block';
      resultBox.textContent = `替换完成！共修改了 ${res.modifiedFragments} 篇碎片，累计替换 ${res.replacedOccurrences} 处文本。`;
      showToast('全局替换完成');
      await fetchFragments();
    };
  }

  function setupBackup() {
    const btnOpen = document.getElementById('btn-open-backup');
    const modal = document.getElementById('backup-modal');
    const btnClose = document.getElementById('btn-close-backup');
    const btnDownload = document.getElementById('btn-download-json');
    const btnCopyJson = document.getElementById('btn-copy-json');
    const fileInput = document.getElementById('import-file-input');

    if (!btnOpen || !modal) return;

    btnOpen.onclick = () => {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
    };
    if (btnClose) {
      btnClose.onclick = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
      };
    }

    btnDownload.onclick = async () => {
      try {
        showToast('正在导出备份数据...');
        const data = db.getAll();
        const jsonStr = JSON.stringify(data, null, 2);

        const now = new Date();
        const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const fileName = '灵感碎片备份_' + dateStr + '.json';

        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 200);
        showToast('备份文件已开始下载！');
      } catch (err) {
        console.error('导出失败:', err);
        showToast('导出备份失败');
      }
    };

    if (btnCopyJson) {
      btnCopyJson.onclick = async () => {
        try {
          const data = db.getAll();
          const jsonStr = JSON.stringify(data, null, 2);

          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(jsonStr);
            showToast('全量备份 JSON 已复制到剪贴板');
          } else {
            const ta = document.createElement('textarea');
            ta.value = jsonStr;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('全量备份 JSON 已复制到剪贴板');
          }
        } catch (e) {
          showToast('复制失败，请点击直接下载文件');
        }
      };
    }

    if (fileInput) {
      fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
          try {
            const json = JSON.parse(evt.target.result);
            if (!json.fragments || !Array.isArray(json.fragments)) {
              showToast('备份文件格式不正确');
              return;
            }

            const count = db.importData(json);
            showToast(`成功恢复导入 ${count} 条碎片`);
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
            await fetchMeta();
            await fetchFragments();
          } catch (err) {
            showToast('解析文件失败');
          }
        };
        reader.readAsText(file);
      };
    }
  }

  function initEvents() {
    document.getElementById('btn-create-fragment').onclick = () => openEditor();
    document.getElementById('btn-close-editor').onclick = closeEditor;
    document.getElementById('btn-save-fragment').onclick = saveFragment;
    document.getElementById('btn-delete-fragment').onclick = deleteFragment;

    const btnSendToChat = document.getElementById('btn-send-to-chat');
    if (btnSendToChat) {
      btnSendToChat.onclick = () => {
        const content = document.getElementById('edit-content').value;
        if (!content) {
          showToast('正文为空，无法填入');
          return;
        }
        insertToSillyTavernInput(content);
      };
    }

    const btnCloseSt = document.getElementById('btn-close-st-panel');
    if (btnCloseSt) {
      btnCloseSt.onclick = () => {
        const wrapper = document.getElementById('fragment-hub-modal-wrapper');
        if (wrapper) wrapper.classList.remove('active');
      };
    }

    document.getElementById('btn-undo').onclick = handleUndo;
    document.getElementById('btn-redo').onclick = handleRedo;

    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');

    const onSearch = debounce(() => {
      state.searchKeyword = searchInput.value.trim();
      searchClear.style.display = state.searchKeyword ? 'block' : 'none';
      fetchFragments();
    }, 250);

    searchInput.addEventListener('input', onSearch);
    searchClear.onclick = () => {
      searchInput.value = '';
      state.searchKeyword = '';
      searchClear.style.display = 'none';
      fetchFragments();
    };

    document.getElementById('reset-filter-link').onclick = async () => {
      state.currentCategory = '';
      state.selectedTags.clear();
      state.searchKeyword = '';
      searchInput.value = '';
      searchClear.style.display = 'none';
      await fetchMeta();
      await fetchFragments();
    };

    const contentArea = document.getElementById('edit-content');
    const titleInput = document.getElementById('edit-title');
    const tagsInput = document.getElementById('edit-tags');

    const onEditorInput = debounce(() => {
      pushHistorySnapshot();
    }, 300);

    contentArea.addEventListener('input', () => {
      updateCharCounter();
      onEditorInput();
    });
    titleInput.addEventListener('input', onEditorInput);
    tagsInput.addEventListener('input', onEditorInput);

    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? e.metaKey : e.ctrlKey;
      if (modifier && !e.altKey) {
        if (e.key === 'z' || e.key === 'Z') {
          const editorModal = document.getElementById('editor-modal');
          if (editorModal && editorModal.style.display !== 'none') {
            e.preventDefault();
            if (e.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          const editorModal = document.getElementById('editor-modal');
          if (editorModal && editorModal.style.display !== 'none') {
            e.preventDefault();
            handleRedo();
          }
        }
      }
    });

    const sortSelect = document.getElementById('sort-select');
    if (sortSelect) {
      sortSelect.value = state.sortBy || 'updated_desc';
      const onSortChange = () => {
        state.sortBy = sortSelect.value;
        fetchFragments();
      };
      sortSelect.onchange = onSortChange;
      sortSelect.oninput = onSortChange;
    }

    setupSingleDocReplace();
    setupGlobalReplace();
    setupBackup();
    setupBatchMode();
    setupSettingsModal();
    setupHomeTagPoolToggle();
    setupRedactGlobalToggle();
    setupCardShareModal();
  }

  async function initExtension() {
    try {
      const resp = await fetch('/scripts/extensions/third-party/sillytavern-fragment-hub/panel.html');
      let panelHtml = '';
      if (resp.ok) {
        panelHtml = await resp.text();
      } else {
        console.warn('[FragmentHub] 未能从网络路径读取 panel.html，尝试从相对目录载入');
      }

      if (panelHtml) {
        let wrapper = document.getElementById('fragment-hub-modal-wrapper');
        if (!wrapper) {
          wrapper = document.createElement('div');
          wrapper.id = 'fragment-hub-modal-wrapper';
          wrapper.innerHTML = `
            <div id="fragment-hub-container">
              ${panelHtml}
            </div>
          `;
          document.body.appendChild(wrapper);

          wrapper.addEventListener('click', (e) => {
            if (e.target === wrapper) {
              wrapper.classList.remove('active');
            }
          });
        }
      }
    } catch (e) {
      console.error('[FragmentHub] 加载面板 HTML 失败:', e);
    }

    function registerTopNavButton() {
      const topBar = document.getElementById('top-bar') || document.querySelector('.top-bar') || document.getElementById('header_bar');
      const existingBtn = document.getElementById('fragment-hub-top-icon');
      if (existingBtn) return;

      const btn = document.createElement('div');
      btn.id = 'fragment-hub-top-icon';
      btn.className = 'drawer-icon interactable';
      btn.title = '灵感碎片 · 同人便签本 (Fragment Hub)';
      btn.innerHTML = `
        <svg style="width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24">
          <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/>
          <path d="M12 8v8M8 12h8"/>
          <circle cx="12" cy="12" r="1.5"/>
        </svg>
      `;

      btn.onclick = () => {
        const wrapper = document.getElementById('fragment-hub-modal-wrapper');
        if (wrapper) {
          const isActive = wrapper.classList.toggle('active');
          if (isActive) {
            fetchMeta();
            fetchFragments();
          }
        }
      };

      const targetContainer = document.getElementById('extensions_button') || topBar;
      if (targetContainer && targetContainer.parentNode) {
        targetContainer.parentNode.insertBefore(btn, targetContainer);
      } else if (topBar) {
        topBar.appendChild(btn);
      } else {
        document.body.appendChild(btn);
      }

      const extList = document.getElementById('extensions_list');
      if (extList) {
        const menuItem = document.createElement('div');
        menuItem.className = 'list-group-item flex-container flexGap5 interactable';
        menuItem.innerHTML = `
          <svg style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:2;" viewBox="0 0 24 24">
            <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6z"/>
            <path d="M12 8v8M8 12h8"/>
          </svg>
          <span>灵感碎片 (Fragment Hub)</span>
        `;
        menuItem.onclick = () => {
          const wrapper = document.getElementById('fragment-hub-modal-wrapper');
          if (wrapper) {
            wrapper.classList.add('active');
            fetchMeta();
            fetchFragments();
          }
        };
        extList.appendChild(menuItem);
      }
    }

    registerTopNavButton();

    initEvents();
    await fetchMeta();
    await fetchFragments();
    console.log('[FragmentHub] SillyTavern 扩展已成功初始化完成！');
  }

  if (typeof jQuery !== 'undefined') {
    jQuery(document).ready(() => {
      setTimeout(initExtension, 600);
    });
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(initExtension, 600);
    });
  }
})();

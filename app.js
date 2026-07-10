(() => {
  "use strict";

  const RULES = Object.freeze({
    ssq: Object.freeze({
      name: "双色球",
      primaryMax: 33,
      primaryCount: 6,
      secondaryMax: 16,
      secondaryCount: 1,
      primaryLabel: "红球",
      secondaryLabel: "蓝球"
    }),
    dlt: Object.freeze({
      name: "大乐透",
      primaryMax: 35,
      primaryCount: 5,
      secondaryMax: 12,
      secondaryCount: 2,
      primaryLabel: "前区",
      secondaryLabel: "后区"
    })
  });

  const ALLOWED_COUNTS = Object.freeze([1, 3, 5, 10]);
  const UINT32_RANGE = 0x100000000;

  function randomInt(maxExclusive) {
    if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
      throw new RangeError("maxExclusive must be a positive integer");
    }

    if (globalThis.crypto?.getRandomValues) {
      const limit = Math.floor(UINT32_RANGE / maxExclusive) * maxExclusive;
      const buffer = new Uint32Array(1);
      do {
        globalThis.crypto.getRandomValues(buffer);
      } while (buffer[0] >= limit);
      return buffer[0] % maxExclusive;
    }

    return Math.floor(Math.random() * maxExclusive);
  }

  function sampleSorted(max, count) {
    const pool = Array.from({ length: max }, (_, index) => index + 1);
    for (let index = 0; index < count; index += 1) {
      const swapIndex = index + randomInt(max - index);
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool.slice(0, count).sort((left, right) => left - right);
  }

  function getRule(game) {
    const rule = RULES[game];
    if (!rule) {
      throw new RangeError(`Unknown game: ${game}`);
    }
    return rule;
  }

  function generateGroup(game) {
    const rule = getRule(game);
    return {
      primary: sampleSorted(rule.primaryMax, rule.primaryCount),
      secondary: sampleSorted(rule.secondaryMax, rule.secondaryCount)
    };
  }

  function generateGroups(game, count) {
    getRule(game);
    if (!ALLOWED_COUNTS.includes(count)) {
      throw new RangeError(`Unsupported group count: ${count}`);
    }
    return Array.from({ length: count }, () => generateGroup(game));
  }

  const pad = value => String(value).padStart(2, "0");

  function formatGroups(game, groups) {
    const rule = getRule(game);
    const lines = groups.map((group, index) =>
      `第 ${index + 1} 组：${group.primary.map(pad).join(" ")} + ${group.secondary.map(pad).join(" ")}`
    );
    return [rule.name, ...lines].join("\n");
  }

  globalThis.LotteryCore = Object.freeze({
    RULES,
    ALLOWED_COUNTS,
    generateGroup,
    generateGroups,
    formatGroups,
    pad
  });

  const state = {
    game: "ssq",
    count: 1,
    current: [],
    history: []
  };

  function ballMarkup(value, kind) {
    return `<span class="number-ball ${kind}" aria-label="${pad(value)}">${pad(value)}</span>`;
  }

  function groupMarkup(group, index, rule) {
    return `
      <div class="number-group">
        <span class="group-index">第 ${index + 1} 组</span>
        <div class="ball-zone" aria-label="${rule.primaryLabel}">
          <span class="zone-label">${rule.primaryLabel}</span>
          ${group.primary.map(value => ballMarkup(value, "primary-ball")).join("")}
        </div>
        <span class="plus" aria-hidden="true">+</span>
        <div class="ball-zone" aria-label="${rule.secondaryLabel}">
          <span class="zone-label">${rule.secondaryLabel}</span>
          ${group.secondary.map(value => ballMarkup(value, "secondary-ball")).join("")}
        </div>
      </div>`;
  }

  function initPage() {
    const generateButton = document.querySelector("#generate-button");
    if (!generateButton) {
      return;
    }

    const elements = {
      tabs: document.querySelector("#game-tabs"),
      rule: document.querySelector("#rule-description"),
      results: document.querySelector("#current-results"),
      counts: document.querySelector("#group-counts"),
      generate: generateButton,
      copy: document.querySelector("#copy-current"),
      history: document.querySelector("#history-list"),
      clear: document.querySelector("#clear-history"),
      stamp: document.querySelector("#result-stamp"),
      toast: document.querySelector("#toast")
    };

    const emptyResultMarkup = `
      <div class="result-empty">
        <span class="empty-spark" aria-hidden="true">✦</span>
        <p>点击下方按钮，生成你的随机号码</p>
      </div>`;

    const showToast = message => {
      elements.toast.textContent = message;
      elements.toast.classList.add("is-visible");
      clearTimeout(showToast.timer);
      showToast.timer = setTimeout(
        () => elements.toast.classList.remove("is-visible"),
        1800
      );
    };

    const renderCurrent = () => {
      if (!state.current.length) {
        elements.results.innerHTML = emptyResultMarkup;
        elements.copy.disabled = true;
        elements.stamp.textContent = "等待生成";
        return;
      }

      const rule = RULES[state.game];
      elements.results.innerHTML = state.current
        .map((group, index) => groupMarkup(group, index, rule))
        .join("");
      elements.copy.disabled = false;
      elements.stamp.textContent = new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date());
    };

    const historyMarkup = record => `
      <article class="history-entry">
        <div class="history-entry-head">
          <span>${RULES[record.game].name} · ${record.groups.length} 组</span>
          <button class="entry-copy" type="button" data-history-id="${record.id}">复制</button>
        </div>
        <time datetime="${record.createdAt.toISOString()}">${new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit"
        }).format(record.createdAt)}</time>
        <pre>${formatGroups(record.game, record.groups).split("\n").slice(1).join("\n")}</pre>
      </article>`;

    const renderHistory = () => {
      elements.history.innerHTML = state.history.length
        ? state.history.map(historyMarkup).join("")
        : `
          <div class="history-empty">
            <span aria-hidden="true">◌</span>
            <p>新生成的号码会保留在这里</p>
          </div>`;
      elements.clear.disabled = state.history.length === 0;
    };

    const legacyCopy = text => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.append(area);
      area.select();
      try {
        return document.execCommand("copy");
      } finally {
        area.remove();
      }
    };

    const showManualCopy = text => {
      let fallback = document.querySelector("#copy-fallback");
      if (!fallback) {
        fallback = document.createElement("div");
        fallback.id = "copy-fallback";
        fallback.className = "copy-fallback";
        fallback.setAttribute("role", "dialog");
        fallback.setAttribute("aria-modal", "true");
        fallback.setAttribute("aria-labelledby", "copy-fallback-title");
        fallback.innerHTML = `
          <div class="copy-fallback-card">
            <p class="section-kicker">MANUAL COPY</p>
            <h2 id="copy-fallback-title">手动复制号码</h2>
            <p>浏览器暂时没有开放剪贴板权限，请选中下方内容后复制。</p>
            <textarea aria-label="待复制的号码" readonly></textarea>
            <button class="generate-button copy-fallback-close" type="button">我知道了</button>
          </div>`;
        fallback.querySelector(".copy-fallback-close").addEventListener("click", () => {
          fallback.classList.remove("is-visible");
        });
        fallback.addEventListener("keydown", event => {
          if (event.key === "Escape") {
            fallback.classList.remove("is-visible");
          }
        });
        document.body.append(fallback);
      }

      const area = fallback.querySelector("textarea");
      area.value = text;
      fallback.classList.add("is-visible");
      requestAnimationFrame(() => {
        area.focus();
        area.select();
      });
    };

    const copyText = async text => {
      let copied = false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch (error) {
          copied = false;
        }
      }

      if (!copied) {
        try {
          copied = legacyCopy(text);
        } catch (error) {
          copied = false;
        }
      }

      if (copied) {
        showToast("号码已复制");
      } else {
        showManualCopy(text);
        showToast("请手动复制号码");
      }
    };

    elements.tabs.addEventListener("click", event => {
      const button = event.target.closest("[data-game]");
      if (!button || button.dataset.game === state.game) {
        return;
      }

      state.game = button.dataset.game;
      elements.tabs.querySelectorAll("[data-game]").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-checked", String(active));
      });

      const rule = RULES[state.game];
      elements.rule.textContent =
        `${rule.primaryCount} 个${rule.primaryLabel} + ${rule.secondaryCount} 个${rule.secondaryLabel}`;
      state.current = [];
      renderCurrent();
    });

    elements.counts.addEventListener("click", event => {
      const button = event.target.closest("[data-count]");
      if (!button) {
        return;
      }

      state.count = Number(button.dataset.count);
      elements.counts.querySelectorAll("[data-count]").forEach(item => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });
    });

    elements.generate.addEventListener("click", () => {
      state.current = generateGroups(state.game, state.count);
      state.history.unshift({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        game: state.game,
        groups: state.current,
        createdAt: new Date()
      });
      renderCurrent();
      renderHistory();
    });

    elements.copy.addEventListener("click", () => {
      copyText(formatGroups(state.game, state.current));
    });

    elements.history.addEventListener("click", event => {
      const button = event.target.closest("[data-history-id]");
      if (!button) {
        return;
      }
      const record = state.history.find(item => item.id === button.dataset.historyId);
      if (record) {
        copyText(formatGroups(record.game, record.groups));
      }
    });

    elements.clear.addEventListener("click", () => {
      if (
        !globalThis.__LOTTERY_TEST__ &&
        !globalThis.confirm("清空本次生成历史？")
      ) {
        return;
      }
      state.history = [];
      renderHistory();
      showToast("历史已清空");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initPage, { once: true });
  } else {
    initPage();
  }
})();

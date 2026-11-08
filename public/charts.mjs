import {money, monthName, comparisonMetrics} from "./dashboard.mjs";

const NS = "http://www.w3.org/2000/svg";
const tickMoney = value => new Intl.NumberFormat("en-CA", {notation: "compact", maximumFractionDigits: 1}).format(value);
const node = (tag, attributes = {}, text) => {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
};
function canvas(container, label, height, width = 720) {
  const svg = node("svg", {viewBox: `0 0 ${width} ${height}`, width, height, preserveAspectRatio: "xMinYMin meet", role: "group", "aria-label": label, class: "chart-svg"});
  container.replaceChildren(svg);
  return svg;
}
function interactive(group, label, tooltip) {
  group.setAttribute("tabindex", "0");
  group.setAttribute("role", "img");
  group.setAttribute("aria-label", label);
  group.classList.add("chart-point");
  group.append(node("title", {}, label));
  for (const event of ["focus", "pointerenter", "click"]) group.addEventListener(event, () => {tooltip.textContent = label;tooltip.hidden = false;});
  group.addEventListener("blur", () => {tooltip.hidden = true;});
  group.addEventListener("pointerleave", () => {if (document.activeElement !== group) tooltip.hidden = true;});
}
function bounds(values) {
  const known = values.filter(Number.isFinite);
  const min = Math.min(0, ...known), max = Math.max(0, ...known);
  return max === min ? [0, 1] : [min, max];
}

export function renderMonthlyChart(container, rows, tooltip) {
  // The panel stays measurable while history loads; a hidden plot reports zero width.
  const availableWidth = container.closest(".cashflow-panel")?.clientWidth || container.clientWidth;
  const chartWidth = Math.max(rows.length > 6 ? 660 : 240, availableWidth);
  const chartHeight = Number.parseFloat(getComputedStyle(container).getPropertyValue("--chart-height")) || 260;
  const svg = canvas(container, "Recorded monthly money in and money out in CAD. Focus a month for exact amounts.", chartHeight, chartWidth);
  if (rows.length > 6) svg.classList.add("chart-wide");
  const left = 58, right = chartWidth - 12, plotWidth = right - left;
  const [min, max] = bounds(rows.flatMap(row => row.slice(1)));
  const top = 26, bottom = chartHeight - 52;
  const y = value => bottom - (value - min) / (max - min) * (bottom - top);
  for (let i = 0; i <= 3; i++) {
    const value = min + (max - min) * i / 3;
    svg.append(node("line", {x1: left, x2: right, y1: y(value), y2: y(value), class: value === 0 ? "zero-line" : "grid-line"}));
    svg.append(node("text", {x: left - 10, y: y(value) + 4, "text-anchor": "end", class: "axis-label"}, tickMoney(value)));
  }
  if (min < 0 && max > 0) svg.append(node("line", {x1: left, x2: right, y1: y(0), y2: y(0), class: "zero-line"}));
  svg.append(node("text", {x: 8, y: 14, class: "axis-label"}, "CAD"));
  const step = plotWidth / rows.length;
  rows.forEach(([month, incoming, outgoing], index) => {
    const center = left + step * (index + .5);
    const width = Math.min(32, step * .26);
    const group = node("g");
    const shortfall = Number.isFinite(incoming) && Number.isFinite(outgoing) && outgoing > incoming;
    group.setAttribute("data-shortfall", String(shortfall));
    if (shortfall) {
      group.append(node("rect", {x: center - step / 2 + 3, y: 20, width: step - 6, height: bottom - 14, rx: 5, class: "shortfall-band"}));
      group.append(node("circle", {cx: center, cy: 17, r: 5, class: "shortfall-marker"}));
    }
    // The transparent hit target keeps zero and missing records keyboard/touch accessible.
    group.append(node("rect", {x: center - step / 2 + 3, y: 20, width: step - 6, height: bottom - 14, class: "chart-hit"}));
    [incoming, outgoing].forEach((value, series) => {
      if (Number.isFinite(value)) group.append(node("rect", {x: center + (series ? 3 : -width - 3), y: Math.min(y(0), y(value)), width, height: Math.max(1, Math.abs(y(value) - y(0))), rx: 2, class: series ? "bar-out" : "bar-in"}));
      else group.append(node("text", {x: center + (series ? width / 2 + 3 : -width / 2 - 3), y: y(0) - 5, "text-anchor": "middle", class: "axis-label"}, "—"));
    });
    interactive(group, `${monthName(month)}: money in ${money(incoming)}; money out ${money(outgoing)}.${shortfall ? ` Money out exceeded money in by ${money(outgoing - incoming)}.` : ""}`, tooltip);
    svg.append(group);
    const label = monthName(month).split(" ");
    svg.append(node("text", {x: center, y: chartHeight - 28, "text-anchor": "middle", class: "axis-label"}, label[0]));
    const year = label.slice(1).join(" ");
    // Narrow six-month cards show each year once instead of crowding repeated year labels.
    if (step >= 42 || index === 0 || year !== monthName(rows[index - 1][0]).split(" ").slice(1).join(" ")) {
      svg.append(node("text", {x: center, y: chartHeight - 10, "text-anchor": "middle", class: "axis-label axis-year"}, year));
    }
  });
  tooltip.hidden = true;
}

// Clip a brief surface current to the actual filled amount; it never changes the bar geometry.
function waterSurface(svg, start, width, id) {
  if (width <= 0) return;
  const defs = node("defs"), clip = node("clipPath", {id});
  clip.append(node("rect", {x: start, y: 4, width, height: 8, rx: 2}));defs.append(clip);svg.append(defs);
  const surface = node("g", {"clip-path": `url(#${id})`});
  surface.append(node("path", {class: "water-sheen", d: "M-84 7Q-62 0-42 7T0 7V16H-84Z"}));
  svg.append(surface);
}
export function renderProgressFlow(container, progress) {
  const svg = node("svg", {viewBox: "0 0 280 16", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false", class: "progress-surface"});
  waterSurface(svg, 2, 276 * Math.min(1, Math.max(0, progress)), "goal-surface-clip");
  container.replaceChildren(svg);
}

export function renderComparisonChart(container, before, after, visibility = "all") {
  const rows = comparisonMetrics(before, after).filter(row => visibility === "all" || row.changed === (visibility === "changed"));
  const keys = new Set(rows.map(row => row.key));
  for (const article of [...container.children]) if (!keys.has(article.dataset.metric)) article.remove();
  const html = (tag, text, className) => {
    const item = document.createElement(tag);
    if (text !== undefined) item.textContent = text;
    if (className) item.className = className;
    return item;
  };
  for (const [index, row] of rows.entries()) {
    let article = container.querySelector(`[data-metric="${row.key}"]`);
    if (!article) {
      article = html("article", undefined, "comparison-metric");
      article.dataset.metric = row.key;article.tabIndex = 0;
      article.append(html("h4", row.label), html("dl", undefined, "comparison-values"));
      container.append(article);
    }
    if (container.children[index] !== article) {
      const focused = article.contains(document.activeElement) ? document.activeElement : null;
      container.insertBefore(article, container.children[index] || null);
      focused?.focus({preventScroll: true});
    }
    article.classList.toggle("is-changed", row.changed);
    article.classList.toggle("is-unchanged", !row.changed);
    article.setAttribute("aria-label", `${row.label}. Before, historical baseline: ${money(row.before)}. After, hypothetical scenario: ${money(row.after)}. Change: ${row.change}, ${row.direction.toLowerCase()}.`);
    const values = article.querySelector("dl");
    const content = document.createDocumentFragment();
    for (const [label, value, series] of [["Before", row.before, "before"], ["After", row.after, "after"]]) {
      const group = html("div", undefined, `comparison-${series}`);
      const amount = html("dd", money(value));amount.dataset.value = String(value);
      group.append(html("dt", label), amount);
      const svg = node("svg", {viewBox: "0 0 280 16", preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false", class: "pair-bar"});
      const [minimum, maximum] = row.domain;
      const x = number => 2 + (number - minimum) / (maximum - minimum) * 276;
      svg.append(node("rect", {x: 2, y: 4, width: 276, height: 8, rx: 2, class: "bar-track"}));
      if (value !== 0) svg.append(node("rect", {x: Math.min(x(0), x(value)), y: 4, width: Math.abs(x(value) - x(0)), height: 8, rx: 2, class: series === "before" ? "bar-before" : "bar-after"}));
      if (series === "after" && value !== 0) waterSurface(svg, Math.min(x(0), x(value)), Math.abs(x(value) - x(0)), `surface-${row.key}`);
      svg.append(node("line", {x1: x(0), x2: x(0), y1: 1, y2: 15, class: "zero-line"}));
      group.append(svg);content.append(group);
    }
    const change = html("div", undefined, "comparison-change");
    const delta = html("dd", row.change);delta.dataset.value = String(row.delta);
    delta.dataset.sign = row.delta > 0 ? "positive" : row.delta < 0 ? "negative" : "zero";
    delta.append(html("span", row.direction, "change-direction"));
    change.append(html("dt", "Change"), delta);content.append(change);
    // Keep the row itself stable for keyboard focus and short feedback animations.
    values.replaceChildren(content);
  }
}

export function renderStoryChart(container, story) {
  const width = Math.max(320, container.clientWidth);
  const plotWidth = width - 118;
  const svg = canvas(container, `The same 55% income replacement across ${story.count} accounts: ${story.groups.map(group => `${group.count} ${group.label.toLowerCase()}`).join("; ")}. No-shortfall labels are categories, not durations.`, 226, width);
  story.groups.forEach((group, index) => {
    const top = 8 + index * 74;
    svg.append(node("text", {x: 0, y: top + 14, class: "chart-metric-label"}, group.label));
    svg.append(node("rect", {x: 0, y: top + 30, width: plotWidth, height: 12, rx: 3, class: "bar-track"}));
    const share = story.count ? group.count / story.count : 0;
    svg.append(node("rect", {x: 0, y: top + 30, width: plotWidth * share, height: 12, rx: 3, class: `story-bar story-${group.key}`}));
    svg.append(node("text", {x: width - 2, y: top + 41, "text-anchor": "end", class: "value-label"}, `${group.count.toLocaleString("en-CA")} · ${(share * 100).toFixed(1)}%`));
  });
}

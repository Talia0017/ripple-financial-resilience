import {money, monthName} from "./dashboard.mjs";

const NS = "http://www.w3.org/2000/svg";
const tickMoney = value => new Intl.NumberFormat("en-CA", {notation: "compact", maximumFractionDigits: 1}).format(value);
const node = (tag, attributes = {}, text) => {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
};
function canvas(container, label, height, width = 720) {
  const svg = node("svg", {viewBox: `0 0 ${width} ${height}`, role: "group", "aria-label": label, class: "chart-svg"});
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
  const chartWidth = Math.max(rows.length > 6 ? 660 : 320, container.clientWidth);
  const svg = canvas(container, "Recorded monthly money in and money out in CAD. Focus a month for exact amounts.", 286, chartWidth);
  if (rows.length > 6) svg.classList.add("chart-wide");
  const left = 58, right = chartWidth - 12, plotWidth = right - left;
  const [min, max] = bounds(rows.flatMap(row => row.slice(1)));
  const y = value => 224 - (value - min) / (max - min) * 196;
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
    // The transparent hit target keeps zero and missing records keyboard/touch accessible.
    group.append(node("rect", {x: center - step / 2 + 3, y: 20, width: step - 6, height: 210, class: "chart-hit"}));
    [incoming, outgoing].forEach((value, series) => {
      if (Number.isFinite(value)) group.append(node("rect", {x: center + (series ? 3 : -width - 3), y: Math.min(y(0), y(value)), width, height: Math.max(1, Math.abs(y(value) - y(0))), rx: 2, class: series ? "bar-out" : "bar-in"}));
      else group.append(node("text", {x: center + (series ? width / 2 + 3 : -width / 2 - 3), y: y(0) - 5, "text-anchor": "middle", class: "axis-label"}, "—"));
    });
    interactive(group, `${monthName(month)}: money in ${money(incoming)}; money out ${money(outgoing)}.`, tooltip);
    svg.append(group);
    const label = monthName(month).split(" ");
    svg.append(node("text", {x: center, y: 248, "text-anchor": "middle", class: "axis-label"}, label[0]));
    svg.append(node("text", {x: center, y: 265, "text-anchor": "middle", class: "axis-label axis-year"}, label.slice(1).join(" ")));
  });
  tooltip.hidden = true;
}

export function renderComparisonChart(container, before, after, tooltip) {
  const metrics = [["Money in", "income"], ["Spending", "spending"], ["Remaining buffer", "buffer_left"], ["Monthly shortfall", "monthly_shortfall"]];
  const svg = canvas(container, "Baseline versus hypothetical scenario in CAD. Each pair uses the same scale; negative values extend left of zero.", 304);
  svg.classList.add("comparison-svg");
  const [min, max] = bounds(metrics.flatMap(([, key]) => [before[key], after[key]]));
  const x = value => 156 + (value - min) / (max - min) * 445;
  for (let i = 0; i <= 4; i++) {
    const value = min + (max - min) * i / 4;
    svg.append(node("line", {x1: x(value), x2: x(value), y1: 24, y2: 266, class: "grid-line"}));
    svg.append(node("text", {x: x(value), y: 292, "text-anchor": "middle", class: "axis-label"}, tickMoney(value)));
  }
  svg.append(node("text", {x: 156, y: 13, class: "axis-label"}, "CAD · shared scale"));
  svg.append(node("line", {x1: x(0), x2: x(0), y1: 24, y2: 266, class: "zero-line"}));
  metrics.forEach(([label, key], index) => {
    const top = 29 + index * 61;
    svg.append(node("text", {x: 4, y: top + 23, class: "chart-metric-label"}, label));
    const group = node("g");
    [before[key], after[key]].forEach((value, series) => {
      group.append(node("rect", {x: Math.min(x(0), x(value)), y: top + series * 19, width: Math.max(1, Math.abs(x(value) - x(0))), height: 13, rx: 2, class: series ? "bar-after" : "bar-before"}));
    });
    // Exact labels remain visible even when a small value has a very short bar.
    svg.append(node("text", {x: 711, y: top + 11, "text-anchor": "end", class: "value-label"}, money(before[key])));
    svg.append(node("text", {x: 711, y: top + 30, "text-anchor": "end", class: "value-label"}, money(after[key])));
    interactive(group, `${label}: baseline ${money(before[key])}; scenario ${money(after[key])}.`, tooltip);
    svg.append(group);
  });
  tooltip.hidden = true;
}

export function renderStoryChart(container, story) {
  const width = Math.max(320, container.clientWidth);
  const plotWidth = width - 118;
  const svg = canvas(container, `Within the ${story.sample}-account near-median inflow band, ${story.groups[0].count} accounts have money in covering spending and ${story.groups[1].count} have spending above money in. Counts, not forecasts.`, 142, width);
  story.groups.forEach((group, index) => {
    const top = 8 + index * 70;
    svg.append(node("text", {x: 0, y: top + 14, class: "chart-metric-label"}, group.label));
    svg.append(node("rect", {x: 0, y: top + 30, width: plotWidth, height: 12, rx: 3, class: "bar-track"}));
    svg.append(node("rect", {x: 0, y: top + 30, width: plotWidth * group.share, height: 12, rx: 3, class: index ? "bar-out" : "bar-in"}));
    svg.append(node("text", {x: width - 2, y: top + 41, "text-anchor": "end", class: "value-label"}, `${group.count} · ${(group.share * 100).toFixed(1)}%`));
  });
}

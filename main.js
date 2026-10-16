/* =====================================================================

* LEVEL 1 ("overview"): year x month heatmap. Cell color = the month's
 *   max (or min) temperature; a toggle switches max/min; hover shows a
 *   tooltip with the date and values; a legend maps color to Celsius.
 * 
 * LEVEL 2 ("detail"): same matrix for the last N years, and each cell
 *   also holds a mini line chart of the daily max and min temperature
 *   (x = day of month, y = temperature).
 *
 * Code marked "LEVEL 2 only" is skipped when the Level 1 view is active.
 * ===================================================================== */

/* ---------- Configuration (all tunables live here) ---------- */
const CONFIG = {
  dataFile: "temperature_daily.csv",   // CSV in the same folder as this page
  tempDomain: [0, 40],                 // legend / color range in Celsius
  binOffset: -1,                       // shifts color-band edges (°C) to reproduce the reference image
  colorSteps: 11,                      // number of discrete color bands
  lineColors: {max: "#2ca02c", min: "#a6cee3"},
  margin: {top: 30, right: 110, bottom: 20, left: 90},
  miniChartPad: 6,                     // LEVEL 2: inner padding of each cell around its line chart
  cellPad: 6,                          // gap between cells
  views: {                             // per-view layout
    // LEVEL 1: all years, small cells, colors only
    overview: {label: "Level 1: Heatmap", cellW: 38, cellH: 34, years: null},
    // LEVEL 2: last `years` years, larger cells to hold the mini line charts
    detail:   {label: "Level 2: Daily lines", cellW: 88, cellH: 60, years: 10}
  },
  metrics: {max: "Maximum", min: "Minimum"},
  legendSize: {width: 18, height: 240}
};
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const state = {view: "overview", metric: "max"};

/* ---------- Data loading & aggregation ---------- */
/** Load the CSV file and parse it into daily records (returns a Promise). */
function loadDaily() {
  return d3.csv(CONFIG.dataFile, d => {
    const [y, m, day] = d.date.split("-").map(Number);
    return {date: d.date, year: y, month: m - 1, day, max: +d.max_temperature, min: +d.min_temperature};
  });
}
/** Group daily records by year-month; summarize extremes of the month. */
function aggregateMonthly(daily) {
  return Array.from(d3.group(daily, d => d.year, d => d.month), ([year, months]) =>
    Array.from(months, ([month, days]) => ({
      year, month, days,
      max: d3.max(days, d => d.max),   // hottest day of the month
      min: d3.min(days, d => d.min)    // coldest day of the month
    }))).flat();
}
let monthly = [];   // filled once the CSV has loaded
let allYears = [];

/* ---------- Scales ---------- */
const palette = d3.quantize(d3.interpolateSpectral, CONFIG.colorSteps).reverse();
const colorScale = d3.scaleQuantize()
  .domain(CONFIG.tempDomain.map(t => t + CONFIG.binOffset))
  .range(palette);

/* ---------- Tooltip ---------- */
const tip = d3.select("#tip");
function showTip(event, html) {
  tip.html(html).style("opacity", 1)
     .style("left", Math.min(event.clientX + 14, innerWidth - 220) + "px")
     .style("top", event.clientY + 14 + "px");
}
const hideTip = () => tip.style("opacity", 0);
const monthLabel = d => `${d.year}-${String(d.month + 1).padStart(2, "0")}`;

/* ---------- Drawing ---------- */
/** Draw the full chart for the current state. */
function render() {
  const v = CONFIG.views[state.view], m = CONFIG.margin;
  const years = v.years ? allYears.slice(-v.years) : allYears;
  const data = monthly.filter(d => years.includes(d.year));
  const w = m.left + years.length * (v.cellW + CONFIG.cellPad) + m.right;
  const h = m.top + 12 * (v.cellH + CONFIG.cellPad) + m.bottom;
  const svg = d3.select("#chart").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w);
  svg.selectAll("*").remove();

  const x = d3.scaleBand().domain(years).range([0, years.length * (v.cellW + CONFIG.cellPad)]).paddingInner(0);
  const y = d3.scaleBand().domain(d3.range(12)).range([0, 12 * (v.cellH + CONFIG.cellPad)]);
  const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

  drawAxes(g, x, y, v);
  drawCells(g, data, x, y, v);
  drawLegend(svg, w - m.right + 30, m.top);
}

function drawAxes(g, x, y, v) {
  g.append("g").attr("class", "axis").call(d3.axisTop(x).tickSize(6));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickFormat(i => MONTH_NAMES[i]).tickSize(6));
}

function drawCells(g, data, x, y, v) {
  const detail = state.view === "detail";
  const cells = g.selectAll("g.cell").data(data).join("g").attr("class", "cell")
    .attr("transform", d => `translate(${x(d.year) + CONFIG.cellPad / 2},${y(d.month) + CONFIG.cellPad / 2})`);

  cells.append("rect").attr("width", v.cellW).attr("height", v.cellH)
    .attr("fill", d => colorScale(d[state.metric]));

  // LEVEL 2 only: overlay daily max/min line charts on top of the colored cells
  if (detail) drawMiniLines(cells, v);

  // Tooltip keeps one format in both levels: "Date: YYYY-MM; max: .. min: .."
  //  - LEVEL 1: max/min are the month's extremes.
  //  - LEVEL 2: max/min are the values of the day under the cursor.
  cells.on("mousemove", (event, d) => {
    const {max, min} = detail ? hoveredDay(d, d3.pointer(event)[0], v) : d;
    showTip(event, `Date: ${monthLabel(d)}; max: ${max} min: ${min}`);
  }).on("mouseleave", hideTip);
}
const daysInMonth = d => new Date(d.year, d.month + 1, 0).getDate();

/** LEVEL 2 only: x scale (day of month -> pixel) shared by the lines and the hover lookup. */
function dayScale(d, v) {
  const pad = CONFIG.miniChartPad;
  return d3.scaleLinear().domain([1, daysInMonth(d)]).range([pad, v.cellW - pad]);
}

/** LEVEL 2 only: the daily record under the cursor (px = x position inside the cell). */
function hoveredDay(d, px, v) {
  const first = d.days[0].day, last = d.days[d.days.length - 1].day;   // last month may be partial
  const dayNumber = Math.round(dayScale(d, v).invert(px));
  return d.days.find(p => p.day === Math.max(first, Math.min(last, dayNumber)));
}

/** LEVEL 2 only: overlay a max and a min daily line chart inside each cell. */
function drawMiniLines(cells, v) {
  const pad = CONFIG.miniChartPad;
  cells.each(function (d) {
    const sx = dayScale(d, v);
    const sy = d3.scaleLinear().domain(CONFIG.tempDomain).range([v.cellH - pad, pad]);
    ["max", "min"].forEach(key => {
      d3.select(this).append("path").datum(d.days)
        .attr("fill", "none").attr("stroke", CONFIG.lineColors[key]).attr("stroke-width", 1.6)
        .attr("pointer-events", "none")
        .attr("d", d3.line().x(p => sx(p.day)).y(p => sy(p[key])));
    });
  });
}

/** LEVEL 1 + 2: vertical discrete-color legend, 0 at top and max at bottom. */
function drawLegend(svg, lx, ly) {
  const {width, height} = CONFIG.legendSize, n = palette.length, bh = height / n;
  const g = svg.append("g").attr("transform", `translate(${lx},${ly})`);
  g.selectAll("rect").data(palette).join("rect").attr("width", width).attr("height", bh)
    .attr("y", (_, i) => i * bh).attr("fill", c => c);
  g.append("text").attr("x", width + 6).attr("y", 10).text(`${CONFIG.tempDomain[0]} °C`);
  g.append("text").attr("x", width + 6).attr("y", height + 4).text(`${CONFIG.tempDomain[1]} °C`);
  const lines = g.append("g").attr("transform", `translate(0,${height + 30})`);
  if (state.view === "detail") {   // LEVEL 2 only: key for the two line colors
    [["max", "Daily max"], ["min", "Daily min"]].forEach(([k, label], i) => {
      lines.append("rect").attr("y", i * 16).attr("width", 18).attr("height", 3).attr("fill", CONFIG.lineColors[k]);
      lines.append("text").attr("x", 24).attr("y", i * 16 + 5).text(label).style("font-size", "11px");
    });
  }
}

/* ---------- Controls ---------- */
/** Build a segmented button group and re-render on selection. */
function makeToggle(selector, options, key) {
  const group = d3.select(selector);
  group.selectAll("button").data(Object.entries(options)).join("button")
    .text(([, label]) => label)
    .on("click", (_, [k]) => { state[key] = k; refresh(); });
}
function refresh() {
  d3.select("#viewGroup").selectAll("button").classed("on", ([k]) => k === state.view);
  d3.select("#metricGroup").selectAll("button").classed("on", ([k]) => k === state.metric);
  render();
}
/* ---------- Startup: load data, then build controls and draw ---------- */
loadDaily().then(daily => {
  monthly = aggregateMonthly(daily);
  allYears = [...new Set(monthly.map(d => d.year))].sort(d3.ascending);
  makeToggle("#viewGroup", Object.fromEntries(Object.entries(CONFIG.views).map(([k, v]) => [k, v.label])), "view");
  makeToggle("#metricGroup", Object.fromEntries(Object.entries(CONFIG.metrics).map(([k, l]) => [k, `${l} temperature`])), "metric");
  refresh();
}).catch(err => {
  d3.select(".chart").text(`Could not load ${CONFIG.dataFile}: ${err.message}. Serve this folder with a local web server.`);
});
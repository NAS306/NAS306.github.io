import { ROGUE_HISTORY_METRICS, getRogueChartModel } from './51-rogue-history.js';
import { formatRogueMetric } from './22-rogue-stats.js';

export class RogueHistoryView {
  constructor(section, signal) {
    this.section = section;
    this.totals = section.querySelector('.rogue-totals');
    this.chart = section.querySelector('.rogue-round-charts');
    this.select = section.querySelector('select');
    this.buttons = [...section.querySelectorAll('[data-result-view]')];
    for (const group of ['Round totals', 'Tank at round end']) {
      const options = document.createElement('optgroup'); options.label = group;
      for (const metric of ROGUE_HISTORY_METRICS.filter(item => item.group === group)) {
        const option = document.createElement('option'); option.value = metric.key; option.textContent = metric.label;
        options.append(option);
      }
      this.select.append(options);
    }
    for (const button of this.buttons) button.addEventListener('click', () => this.show(button.dataset.resultView), { signal });
    this.select.addEventListener('change', () => this.render(), { signal });
  }
  reset(history) { this.history = history; this.select.value = 'kills'; this.show('totals'); }
  show(view) {
    this.totals.hidden = view !== 'totals'; this.chart.hidden = view !== 'rounds';
    for (const button of this.buttons) button.setAttribute('aria-pressed', String(button.dataset.resultView === view));
    if (view === 'rounds') this.render();
  }
  render() {
    const metric = ROGUE_HISTORY_METRICS.find(item => item.key === this.select.value);
    const model = getRogueChartModel(this.history.rows, metric);
    const decimals = metric.decimals ?? 1;
    const fmt = value => formatRogueMetric(value, decimals);
    const svg = this.chart.querySelector('svg');
    let path = '', connected = false;
    for (const point of model.points) {
      if (point.y === null) { connected = false; continue; }
      path += `${connected ? 'L' : 'M'}${point.x},${point.y} `; connected = true;
    }
    svg.setAttribute('aria-label', `${metric.label} by round. Exact values are listed below.`);
    svg.innerHTML = model.ticks.map(tick => `<line x1="82" x2="628" y1="${tick.y}" y2="${tick.y}" class="chart-grid"/><text x="72" y="${tick.y + 6}" text-anchor="end">${fmt(tick.value)}</text>`).join('')
      + `<path d="${path}" class="chart-line"/>`
      + model.points.map(point => `${model.points.length <= 10 || point.round === 1 || point.round % 5 === 0 ? `<text x="${point.x}" y="292" text-anchor="middle">${point.round}</text>` : ''}`
        + (point.y === null ? '' : `<circle cx="${point.x}" cy="${point.y}" r="6" class="${point.outcome === 'lost' ? 'chart-lost' : 'chart-point'}"><title>Round ${point.round}: ${fmt(point.value)}${point.outcome === 'lost' ? ' (lost)' : ''}</title></circle>`)).join('')
      + '<text x="355" y="322" text-anchor="middle">Round</text>';
    this.chart.querySelector('.rogue-chart-values').innerHTML = model.points.map(point => `<div><dt>R${point.round}${point.outcome === 'lost' ? ' · Lost' : ''}</dt><dd>${fmt(point.value)}</dd></div>`).join('');
    this.chart.querySelector('.rogue-chart-note').textContent = metric.section === 'combat'
      ? 'Each round, including a failed round. Point totals reflect the amount actually received.'
      : 'Remaining HP at each round end, before the next upgrades.';
  }
}

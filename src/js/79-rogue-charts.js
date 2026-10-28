import { ROGUE_HISTORY_METRICS, getRogueChartModel } from './51-rogue-history.js';
import { formatRogueMetric } from './22-rogue-stats.js';
import { ABILITIES } from './41-rogue-abilities.js';
import { UPGRADES } from './42-rogue-state.js';

const escapeMarkup = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function formatRoundPreparation(row) {
  const prep = row.preparation;
  if (!prep) return 'Preparation: not recorded';
  const upgrades = prep.upgrades.map(item => `${UPGRADES[item.key].name} +${item.count} (Lv.${item.level})`).join(', ') || 'none';
  const ability = prep.ability ? `${ABILITIES[prep.ability].name}${prep.abilityLevel ? ` (Lv.${prep.abilityLevel})` : ''}` : row.round === 1 ? 'none (starting round)' : 'skipped';
  const removed = prep.removedAbility ? `\nReduced: ${ABILITIES[prep.removedAbility].name} Lv.${prep.removedAbilityLevel + 1} → ${prep.removedAbilityLevel ? `Lv.${prep.removedAbilityLevel}` : 'removed'}` : '';
  const selections = prep.superPicks ? Object.entries(prep.superPicks).map(([id, count]) => `${ABILITIES[id].name} +${count}`).join(', ') || 'skipped' : ability;
  return `Upgrades: ${upgrades}\nAbility: ${selections}${removed}`;
}

export class RogueHistoryView {
  constructor(section, signal) {
    this.chart = section.querySelector('.rogue-round-charts');
    this.hiddenMetrics = new Set();
    this.buttons = ROGUE_HISTORY_METRICS.map(metric => {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.metric = metric.key;
      button.style.setProperty('--series-color', metric.color);
      button.setAttribute('aria-controls', 'rogue-combined-chart');
      const swatch = document.createElement('span'); swatch.className = 'rogue-legend-swatch'; swatch.setAttribute('aria-hidden', 'true');
      if (metric.dash) swatch.classList.add('is-dashed');
      button.append(swatch, document.createTextNode(metric.label));
      button.addEventListener('click', () => {
        if (this.hiddenMetrics.has(metric.key)) this.hiddenMetrics.delete(metric.key);
        else this.hiddenMetrics.add(metric.key);
        this.render();
      }, { signal });
      this.chart.querySelector('.rogue-chart-legend').append(button);
      return button;
    });
  }
  reset(history) { this.history = history; this.hiddenMetrics.clear(); this.render(); }
  render() {
    const rows = this.history?.rows ?? [];
    const model = getRogueChartModel(rows);
    const preparation = new Map(rows.map(row => [row.round, formatRoundPreparation(row)]));
    const fmt = (value, metric) => formatRogueMetric(value, metric.decimals ?? 1);
    let drawing = model.ticks.map(tick => `<line x1="60" x2="876" y1="${tick.y}" y2="${tick.y}" class="chart-grid"/><text x="50" y="${tick.y + 5}" text-anchor="end">${tick.value}%</text>`).join('');
    for (const series of model.series) {
      const button = this.buttons.find(item => item.dataset.metric === series.key);
      button.setAttribute('aria-pressed', String(!this.hiddenMetrics.has(series.key)));
      button.title = series.peak > 0 ? `${series.label}: peak per round ${fmt(series.peak, series)} = 100%`
        : `${series.label}: ${series.points.some(point => point.value === 0) ? '0 in recorded rounds' : 'no value recorded'}`;
      if (this.hiddenMetrics.has(series.key)) continue;
      let path = '', connected = false;
      for (const point of series.points) {
        if (point.y === null) { connected = false; continue; }
        path += `${connected ? 'L' : 'M'}${point.x},${point.y} `; connected = true;
      }
      drawing += `<g data-series="${series.key}" style="--series-color:${series.color}"><path d="${path}" class="chart-line" stroke-dasharray="${series.dash}"/>`
        + series.points.filter(point => point.y !== null).map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="chart-point${point.outcome === 'lost' ? ' chart-lost' : ''}"><title>${escapeMarkup(`Round ${point.round}${point.outcome === 'lost' ? ' (lost)' : ''} · ${series.label}: ${fmt(point.value, series)} · ${Number(point.percent.toFixed(1))}% of peak\n${preparation.get(point.round)}`)}</title></circle>`).join('') + '</g>';
    }
    const rounds = model.series[0].points;
    drawing += rounds.filter(point => rows.length <= 10 || point.round === 1 || point.round % 5 === 0)
      .map(point => `<text x="${point.x}" y="268" text-anchor="middle">${point.round}</text>`).join('')
      + '<text x="468" y="294" text-anchor="middle">Round</text>';
    const svg = this.chart.querySelector('svg');
    svg.setAttribute('aria-label', 'Six combat trends by round, normalized to each metric’s own peak of 100%. Actual values are in the table below.');
    svg.innerHTML = drawing;
    this.chart.querySelector('.rogue-chart-values').innerHTML = '<table><thead><tr><th scope="col">Round</th>'
      + ROGUE_HISTORY_METRICS.map(metric => `<th scope="col" style="color:${metric.color}">${metric.label}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map(row => `<tr data-round="${row.round}"><th scope="row">R${row.round}${row.outcome === 'lost' ? ' · Lost' : ''}</th>`
        + ROGUE_HISTORY_METRICS.map(metric => `<td>${fmt(row.combat[metric.key], metric)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
    for (const row of this.chart.querySelectorAll('tbody tr')) row.title = preparation.get(Number(row.dataset.round));
    this.chart.querySelector('.rogue-chart-note').textContent = this.hiddenMetrics.size === ROGUE_HISTORY_METRICS.length
      ? 'Use the legend to show a line. The table always shows all actual values.'
      : 'Each line’s own peak = 100%; actual values below. — = no kills. Hover a round for upgrades and ability picks. Repairs count toward the next round.';
  }
}

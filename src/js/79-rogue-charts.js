import { ROGUE_HISTORY_METRICS, getRogueChartModel } from './51-rogue-history.js';
import { ABILITIES } from './41-rogue-abilities.js';
import { UPGRADES } from './42-rogue-state.js';

import { t, tx, getI18n } from './24-i18n.js';
import { abilityName } from './75-localized-game-text.js';

const escapeMarkup = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function formatRoundPreparation(row) {
  const prep = row.preparation;
  if (!prep) return t('history.missing');
  const upgrades = prep.upgrades.map(item => `${t(`upgrade.${item.key}.name`, {}, UPGRADES[item.key].name)} +${item.count} (Lv.${item.level})`).join(', ') || tx('none');
  const ability = prep.ability ? `${abilityName(prep.ability)}${prep.abilityLevel ? ` (Lv.${prep.abilityLevel})` : ''}` : row.round === 1 ? t('history.start') : tx('skipped');
  const removed = prep.removedAbility ? `\n${t('history.reduced', { name: abilityName(prep.removedAbility), before: prep.removedAbilityLevel + 1, after: prep.removedAbilityLevel ? `Lv.${prep.removedAbilityLevel}` : getI18n().locale === 'en' ? 'removed' : t('ability.remove') })}` : '';
  const selections = prep.superPicks ? Object.entries(prep.superPicks).map(([id, count]) => `${abilityName(id)} +${count}`).join(', ') || tx('skipped') : ability;
  return `${t('history.upgrades', { items: upgrades })}\n${t('history.ability', { items: selections })}${removed}`;
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
      const label = document.createElement('span'); label.dataset.i18n = `text.${metric.label}`; label.textContent = tx(metric.label);
      button.append(swatch, label);
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
    const fmt = (value, metric) => value === null ? '—' : new Intl.NumberFormat(getI18n().locale, { maximumFractionDigits: metric.decimals ?? 1, minimumFractionDigits: metric.decimals === 2 ? 2 : 0 }).format(value);
    let drawing = model.ticks.map(tick => `<line x1="60" x2="876" y1="${tick.y}" y2="${tick.y}" class="chart-grid"/><text x="50" y="${tick.y + 5}" text-anchor="end">${tick.value}%</text>`).join('');
    for (const series of model.series) {
      const button = this.buttons.find(item => item.dataset.metric === series.key);
      button.setAttribute('aria-pressed', String(!this.hiddenMetrics.has(series.key)));
      button.title = series.peak > 0 ? t('chart.peak', { label: tx(series.label), value: fmt(series.peak, series) })
        : `${series.label}: ${series.points.some(point => point.value === 0) ? t('chart.zero') : t('chart.noValue')}`;
      if (this.hiddenMetrics.has(series.key)) continue;
      let path = '', connected = false;
      for (const point of series.points) {
        if (point.y === null) { connected = false; continue; }
        path += `${connected ? 'L' : 'M'}${point.x},${point.y} `; connected = true;
      }
      drawing += `<g data-series="${series.key}" style="--series-color:${series.color}"><path d="${path}" class="chart-line" stroke-dasharray="${series.dash}"/>`
        + series.points.filter(point => point.y !== null).map(point => `<circle cx="${point.x}" cy="${point.y}" r="3.5" class="chart-point${point.outcome === 'lost' ? ' chart-lost' : ''}"><title>${escapeMarkup(`${t('chart.point', { round: point.round, lost: point.outcome === 'lost' ? ` (${tx('Lost').toLowerCase()})` : '', label: tx(series.label), value: fmt(point.value, series), percent: Number(point.percent.toFixed(1)) })}\n${preparation.get(point.round)}`)}</title></circle>`).join('') + '</g>';
    }
    const rounds = model.series[0].points;
    drawing += rounds.filter(point => rows.length <= 10 || point.round === 1 || point.round % 5 === 0)
      .map(point => `<text x="${point.x}" y="268" text-anchor="middle">${point.round}</text>`).join('')
      + `<text x="468" y="294" text-anchor="middle">${tx('Round')}</text>`;
    const svg = this.chart.querySelector('svg');
    svg.setAttribute('aria-label', t('chart.aria'));
    svg.innerHTML = drawing;
    this.chart.querySelector('.rogue-chart-values').innerHTML = `<table><thead><tr><th scope="col">${tx('Round')}</th>`
      + ROGUE_HISTORY_METRICS.map(metric => `<th scope="col" style="color:${metric.color}">${tx(metric.label)}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map(row => `<tr data-round="${row.round}"><th scope="row">R${row.round}${row.outcome === 'lost' ? ` · ${tx('Lost')}` : ''}</th>`
        + ROGUE_HISTORY_METRICS.map(metric => `<td>${fmt(row.combat[metric.key], metric)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
    for (const row of this.chart.querySelectorAll('tbody tr')) row.title = preparation.get(Number(row.dataset.round));
    this.chart.querySelector('.rogue-chart-note').textContent = this.hiddenMetrics.size === ROGUE_HISTORY_METRICS.length
      ? t('chart.hidden')
      : t('chart.note');
  }
}

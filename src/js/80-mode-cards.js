import { resolveWeaponProfile } from './10-weapon-config.js';
import { getEquilateralTriangleVertices } from './30-entities.js';

// Use the same weapon shapes, triangle geometry and colors as the combat renderer.
export const MODE_CARDS = Object.freeze([
  { id: 'frontline', title: 'Frontline', tag: 'TERRITORY WAR', accent: '#83baff', description: 'Capture strongholds. Push the front. Break their base.' },
  { id: 'siege', title: 'Siege Attack', tag: 'BREAK THE LINE', accent: '#edac74', description: 'Lead the assault through three fortified defense lines.' },
  { id: 'defense', title: 'Siege Defense', tag: 'HOLD YOUR GROUND', accent: '#87d9cf', description: 'Protect your strongholds. Stop the advancing army.' },
  { id: 'breakthrough', title: 'Breakthrough', tag: 'ALL-OUT ATTRITION', accent: '#b5d787', description: 'Outfight the enemy and drain their reinforcements.' },
  { id: 'roguelite', title: 'Roguelite', tag: 'ONE TANK. THIRTY ROUNDS.', accent: '#d4b1ff', description: 'Survive 30 rounds. Choose your powers. Balance the risk.' },
].map(Object.freeze));

function tank(x, y, angle, team, weapon = 'standard', scale = 1) {
  const color = team === 'player' ? '#ffe600' : team === 'blue' ? '#5cb3ff' : '#ff6a6a';
  const shape = resolveWeaponProfile(weapon).tankShape;
  const geometry = shape === 'square' ? '<rect x="-24" y="-24" width="48" height="48"/>'
    : shape === 'triangle' ? `<polygon points="${getEquilateralTriangleVertices(28).map(p => `${p.x},${p.y}`).join(' ')}"/>`
      : '<circle r="24"/>';
  return `<g data-unit-shape="${shape}" transform="translate(${x} ${y}) scale(${scale})">
    <g transform="rotate(${angle})" fill="${color}" stroke="#fff" stroke-width="2" style="filter:drop-shadow(0 0 9px ${color})">${geometry}</g>
    <rect x="-28" y="-47" width="56" height="5" fill="#080b0e"/><rect x="-28" y="-47" width="56" height="5" fill="#4cc14c"/>
    <path d="M-17-47v5m11-5v5m12-5v5m11-5v5" stroke="#4f4f4f" stroke-width="1"/>
  </g>`;
}
function stronghold(x, y, owner, base = false) {
  const color = owner === 'blue' ? '#5cb3ff' : owner === 'red' ? '#ff6a6a' : '#aaa';
  const size = base ? 80 : 72;
  const title = base ? 'BASE' : owner ? `${owner.toUpperCase()} Stronghold` : 'Neutral Stronghold';
  return `<g data-objective="${base ? 'base' : 'stronghold'}" transform="translate(${x} ${y})">
    <rect x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" fill="${color}" fill-opacity=".85" stroke="#fff" stroke-width="${base ? 4 : 3}" style="filter:drop-shadow(0 0 12px ${color})"/>
    <text y="${-size/2-10}" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="14" font-weight="700">${title}</text>
    ${base ? '' : `<rect x="-36" y="44" width="72" height="6" fill="${color}"/>`}
  </g>`;
}
function wall(y, gap = false) {
  return `<path d="M0 ${y}H${gap ? '174M248 '+y+'H' : ''}420" stroke="#b4becd" stroke-width="9" style="filter:drop-shadow(0 0 5px #dcecff)"/><path d="M160 ${y+17}H260" stroke="#dcecff" stroke-width="4"/>`;
}
function scene(id) {
  if (id === 'frontline') return `
    ${stronghold(210,210,null)}${stronghold(315,65,'red',true)}
    ${tank(90,332,-30,'player')}${tank(195,361,0,'blue','scatter',.85)}${tank(325,309,5,'blue','heavy',.8)}
    ${tank(72,105,150,'red','scatter',.8)}${tank(305,159,180,'red','standard',.75)}
    <path class="scene-tracer" d="M112 286 130 251M285 196 267 223" stroke="#ffe600" stroke-width="4"/>`;
  if (id === 'siege') return `
    ${wall(108)}${wall(215,true)}${wall(305,true)}${stronghold(210,63,'red',true)}
    <circle class="scene-pulse" cx="210" cy="215" r="35" fill="#ffce69" opacity=".2"/>
    ${tank(210,363,-90,'player')}${tank(100,357,-90,'blue','scatter',.85)}${tank(324,367,-90,'blue','heavy',.75)}
    ${tank(70,162,90,'red','heavy',.65)}${tank(339,150,90,'red','scatter',.7)}
    <path class="scene-tracer" d="M210 305v-35m0-20v-20" stroke="#ffe600" stroke-width="4"/>`;
  if (id === 'defense') return `
    ${wall(211)}${stronghold(210,354,'blue',true)}${stronghold(100,268,'blue')}${stronghold(318,268,'blue')}
    ${tank(191,258,-90,'player','heavy',.8)}${tank(60,102,75,'red','scatter',.75)}${tank(210,134,90,'red','heavy',.78)}${tank(351,81,115,'red','standard',.8)}
    <path class="scene-tracer" d="M192 204v-30m-96 26v-26" stroke="#5cb3ff" stroke-width="4"/>`;
  if (id === 'breakthrough') return `
    <path class="scene-route" d="M115 425C97 320 310 210 300 50" fill="none" stroke="#5cb3ff" stroke-width="2" stroke-dasharray="7 12" opacity=".35"/>
    ${tank(103,349,-45,'player')}${tank(207,280,-45,'blue','heavy',.8)}${tank(272,189,-90,'blue','scatter',.88)}
    ${tank(88,102,45,'red','scatter',.8)}${tank(332,87,135,'red','heavy',.75)}${tank(346,365,190,'red','standard',.8)}
    <path class="scene-tracer" d="M162 294 180 275m107-129 4-30" stroke="#5cb3ff" stroke-width="4"/>`;
  return `
    <circle class="scene-orbit" cx="210" cy="222" r="142" fill="none" stroke="#ff6a6a" stroke-opacity=".25" stroke-dasharray="5 12"/>
    <circle class="scene-pulse" cx="210" cy="222" r="63" fill="#ffe600" opacity=".08"/>
    ${tank(210,222,0,'player','standard',1.2)}
    ${tank(65,92,35,'red','scatter',.78)}${tank(336,83,145,'red','heavy',.78)}${tank(375,228,180,'red','standard',.78)}
    ${tank(317,377,-135,'red','scatter',.78)}${tank(92,369,-45,'red','heavy',.78)}${tank(37,249,0,'red','standard',.78)}
    <path class="scene-tracer" d="m243 158 18-31m-84 160-15 28" stroke="#ffe600" stroke-width="4"/>`;
}
export function modeArtwork(id) {
  const card = MODE_CARDS.find(card => card.id === id);
  return `<svg viewBox="0 0 420 430" fill="none" aria-hidden="true" focusable="false">
    <defs><radialGradient id="glow-${id}"><stop stop-color="${card.accent}" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient><pattern id="grid-${id}" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M60 0H0v60" stroke="#444" stroke-opacity=".45"/></pattern></defs>
    <path fill="#03060a" d="M0 0h420v430H0z"/><path fill="url(#grid-${id})" d="M0 0h420v430H0z"/>
    <ellipse cx="210" cy="205" rx="300" ry="300" fill="url(#glow-${id})"/>
    <g class="scene-field">${scene(id)}</g>
    <path d="M18 35V18h17m350 0h17v17M18 395v17h17m350 0h17v-17" stroke="${card.accent}" stroke-opacity=".4"/>
  </svg>`;
}
export function renderModeCards() {
  return MODE_CARDS.map((card, index) => `<div class="mode-card-with-guide">${card.id === 'roguelite' ? '<button type="button" class="mode-guide-button" data-i18n="menu.guide" data-rogue-guide aria-haspopup="dialog" aria-label="Read Roguelite mode guide">ⓘ Mode guide</button>' : ''}<button class="scenario-button" data-scenario="${card.id}" style="--mode-accent:${card.accent}" aria-label="${index+1}. ${card.title}. ${card.description}">
    <span class="mode-art">${modeArtwork(card.id)}<span class="mode-number">0${index+1}</span><span class="mode-deploy" aria-hidden="true">↗</span></span>
    <span class="mode-copy"><span class="mode-tag" data-i18n="mode.${card.id}.tag">${card.tag}</span><span class="mode-name" data-i18n="mode.${card.id}.name">${card.title}</span><span class="mode-description" data-i18n="mode.${card.id}.description">${card.description}</span><span class="mode-launch">DEPLOY <span aria-hidden="true">→</span></span></span>
  </button><button type="button" class="super-mode-button" data-super-mode="${card.id}">Unlock Super</button></div>`).join('\n');
}

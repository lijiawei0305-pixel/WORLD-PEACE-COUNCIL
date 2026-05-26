import { getAllianceForCountryCode } from '../../data/worldPeaceCouncil';
import { getFactionConfig, neutralFaction, type FactionConfig, type FactionDisplayId } from '../../data/factions';
import { localizeAllianceName, type Language } from '../../lib/i18n';

export type CountryFeature = {
  type: 'Feature';
  properties?: Record<string, unknown>;
  geometry?: unknown;
};

export function getIsoA3(country: CountryFeature): string {
  const props = country.properties ?? {};
  const code = props.ISO_A3 ?? props.ADM0_A3 ?? props.iso_a3 ?? props.ISO3 ?? props.id;
  return typeof code === 'string' ? code.toUpperCase() : 'UNK';
}

export function getCountryFaction(country: CountryFeature): FactionConfig {
  const isoA3 = getIsoA3(country);
  const continent = country.properties?.CONTINENT;
  const alliance = getAllianceForCountryCode(isoA3, continent);

  if (alliance) {
    return getFactionConfig(alliance.id);
  }

  return getFactionConfig('neutral' as FactionDisplayId);
}

/**
 * 当前回合的事件涉及的国家集合：地球渲染时把这些 polygon 用高亮的青色 cap、加亮的描边、凸起的 altitude 表现"发光"。
 * 调用方在 DiplomacyGlobe 里通过 ref 持有，prop 变化时刷新一次 polygonCapColor / polygonAltitude。
 */
export const HIGHLIGHT_CAP_COLOR = 'rgba(126, 246, 255, 0.78)';
export const HIGHLIGHT_STROKE_COLOR = 'rgba(126, 246, 255, 0.95)';
export const HIGHLIGHT_ALTITUDE = 0.045;

function isHighlighted(country: CountryFeature, highlighted?: ReadonlySet<string>): boolean {
  if (!highlighted || highlighted.size === 0) {
    return false;
  }
  return highlighted.has(getIsoA3(country));
}

export function getPolygonCapColor(country: CountryFeature, highlighted?: ReadonlySet<string>): string {
  if (isHighlighted(country, highlighted)) {
    return HIGHLIGHT_CAP_COLOR;
  }
  return getCountryFaction(country).fill;
}

export function getPolygonStrokeColor(
  country: CountryFeature,
  selectedCountry: string,
  hoverCountry?: string,
  highlighted?: ReadonlySet<string>,
): string {
  const isoA3 = getIsoA3(country);

  if (isoA3 === selectedCountry) {
    return 'rgba(255, 255, 255, 0.92)';
  }

  if (isoA3 === hoverCountry) {
    return 'rgba(230, 250, 255, 0.72)';
  }

  if (highlighted && highlighted.has(isoA3)) {
    return HIGHLIGHT_STROKE_COLOR;
  }

  return getCountryFaction(country).stroke;
}

export function getPolygonAltitude(
  country: CountryFeature,
  selectedCountry: string,
  hoverCountry?: string,
  highlighted?: ReadonlySet<string>,
): number {
  const isoA3 = getIsoA3(country);

  if (isoA3 === selectedCountry) {
    return 0.028;
  }

  if (highlighted && highlighted.has(isoA3)) {
    return HIGHLIGHT_ALTITUDE;
  }

  if (isoA3 === hoverCountry) {
    return 0.018;
  }

  if (getCountryFaction(country).id === 'african_union') {
    return 0.008;
  }

  return 0.006;
}

export function createCountryLabel(country: CountryFeature, language: Language = 'zh'): string {
  const isoA3 = getIsoA3(country);
  const faction = getCountryFaction(country);
  const alliance = getAllianceForCountryCode(isoA3, country.properties?.CONTINENT);
  const props = country.properties ?? {};
  const name = String(props.NAME ?? props.ADMIN ?? props.NAME_LONG ?? isoA3);
  const influence = faction.id === neutralFaction.id ? 42 : 78;
  const stability = faction.id === 'russian_alliance' || faction.id === 'zhonghua_alliance' ? 58 : 64;
  const allianceName = localizeAllianceName(alliance?.name ?? neutralFaction.name, language);

  return `
    <div class="country-tooltip">
      <div class="country-tooltip__name">${name}</div>
      <div>ISO: ${isoA3}</div>
      <div>${language === 'en' ? 'Alliance' : '所属联盟'}: <span class="country-tooltip__badge" style="--tooltip-alliance-color:${faction.color}">${allianceName}</span></div>
      <div>${language === 'en' ? 'Influence' : '影响力'}: ${influence}</div>
      <div>${language === 'en' ? 'Stability' : '稳定度'}: ${stability}%</div>
    </div>
  `;
}

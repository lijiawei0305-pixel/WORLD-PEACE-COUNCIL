import { getAllianceForCountryCode } from '../../data/worldPeaceCouncil';
import { getFactionConfig, neutralFaction, type FactionConfig, type FactionDisplayId } from '../../data/factions';

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

export function getPolygonCapColor(country: CountryFeature): string {
  return getCountryFaction(country).fill;
}

export function getPolygonStrokeColor(country: CountryFeature, selectedCountry: string, hoverCountry?: string): string {
  const isoA3 = getIsoA3(country);

  if (isoA3 === selectedCountry) {
    return 'rgba(255, 255, 255, 0.92)';
  }

  if (isoA3 === hoverCountry) {
    return 'rgba(230, 250, 255, 0.72)';
  }

  return getCountryFaction(country).stroke;
}

export function getPolygonAltitude(country: CountryFeature, selectedCountry: string, hoverCountry?: string): number {
  const isoA3 = getIsoA3(country);

  if (isoA3 === selectedCountry) {
    return 0.028;
  }

  if (isoA3 === hoverCountry) {
    return 0.018;
  }

  if (getCountryFaction(country).id === 'african_union') {
    return 0.008;
  }

  return 0.006;
}

export function createCountryLabel(country: CountryFeature): string {
  const isoA3 = getIsoA3(country);
  const faction = getCountryFaction(country);
  const alliance = getAllianceForCountryCode(isoA3, country.properties?.CONTINENT);
  const props = country.properties ?? {};
  const name = String(props.NAME ?? props.ADMIN ?? props.NAME_LONG ?? isoA3);
  const influence = faction.id === neutralFaction.id ? 42 : 78;
  const stability = faction.id === 'russian_alliance' || faction.id === 'zhonghua_alliance' ? 58 : 64;
  const allianceName = alliance?.name ?? neutralFaction.name;

  return `
    <div class="country-tooltip">
      <div class="country-tooltip__name">${name}</div>
      <div>ISO: ${isoA3}</div>
      <div>所属联盟: <span class="country-tooltip__badge" style="--tooltip-alliance-color:${faction.color}">${allianceName}</span></div>
      <div>影响力: ${influence}</div>
      <div>稳定度: ${stability}%</div>
    </div>
  `;
}

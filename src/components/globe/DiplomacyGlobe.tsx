import { type CSSProperties, useEffect, useRef } from 'react';
import Globe, { type GlobeInstance } from 'globe.gl';
import * as THREE from 'three';
import { capitals, type Capital } from '../../data/capitals';
import { demoDiplomacyArcs } from '../../data/demoDiplomacyArcs';
import { getFactionConfig } from '../../data/factions';
import { createGlobeSelection, type GlobeSelection } from '../../data/worldPeaceCouncil';
import { localizeAllianceName, useLanguage } from '../../lib/i18n';
import {
  createArcLabel,
  createRenderArcs,
  getArcAltitude,
  getArcAnimateTime,
  getArcColor,
  getArcStroke,
  seededRandom,
  type RenderArc,
} from './globeArcStyle';
import {
  createCountryLabel,
  getIsoA3,
  getPolygonAltitude,
  getPolygonCapColor,
  getPolygonStrokeColor,
  type CountryFeature,
} from './globeCountryStyle';
import {
  addCloudLayer,
  addSpaceLighting,
  disposeGlobeEffect,
  type GlobeEffect,
} from './globeEffects';
import { createEarthRimMesh, disposeEarthRimMesh, syncScreenAtmosphere, type EarthRimMesh } from './earthRim';

type CountriesGeoJson = {
  type: 'FeatureCollection';
  features?: CountryFeature[];
};

type DiplomacyGlobeProps = {
  selectedCountry: string;
  selectedLocation?: GlobeSelection;
  highlightedCountries?: readonly string[];
  onLocationSelect: (selection: GlobeSelection) => void;
};

const importantCapitalIds = new Set(capitals.map((capital) => capital.id));
const labeledCapitalIds = new Set(capitals.map((capital) => capital.id));
const renderArcs = createRenderArcs(demoDiplomacyArcs);

function createGlobe(container: HTMLElement): GlobeInstance {
  try {
    return new Globe(container);
  } catch {
    return Globe()(container);
  }
}

function createCapitalLabel(capital: Capital): HTMLElement {
  const faction = getFactionConfig(capital.faction);
  const el = document.createElement('div');
  el.className = `globe-marker-label globe-marker-label--${capital.importance}`;
  el.style.setProperty('--marker-color', faction.color);
  el.style.setProperty('--marker-glow', faction.glow);
  el.textContent = capital.name;
  return el;
}

function createCapitalTooltip(capital: Capital, language: 'zh' | 'en'): string {
  const selection = createGlobeSelection({
    kind: 'city',
    isoA3: capital.isoA3,
    countryName: capital.country,
    cityName: capital.name,
  });

  return `
    <div class="country-tooltip">
      <div class="country-tooltip__name">${capital.name}</div>
      <div>${language === 'en' ? 'Country' : '国家'}: ${selection.countryName}</div>
      <div>ISO: ${selection.isoA3}</div>
      <div>${language === 'en' ? 'Alliance' : '所属联盟'}: <span class="country-tooltip__badge" style="--tooltip-alliance-color:${selection.allianceColor}">${localizeAllianceName(selection.allianceName, language)}</span></div>
      <div>${language === 'en' ? 'Influence' : '影响力'}: ${selection.influence}</div>
      <div>${language === 'en' ? 'Stability' : '稳定度'}: ${selection.stability}%</div>
    </div>
  `;
}

function getCapitalRadius(capital: Capital, selectedCountry: string): number {
  const baseRadius = capital.importance === 'major' ? 0.35 : capital.importance === 'regional' ? 0.25 : 0.16;
  return capital.isoA3 === selectedCountry ? baseRadius + 0.16 : baseRadius;
}

function getCapitalColor(capital: Capital, selectedCountry: string): string {
  if (capital.isoA3 === selectedCountry) {
    return '#ffffff';
  }

  return getFactionConfig(capital.faction).color;
}

function getCountryName(country: CountryFeature): string {
  const props = country.properties ?? {};
  return String(props.NAME ?? props.ADMIN ?? props.NAME_LONG ?? getIsoA3(country));
}

function tuneSceneLighting(world: GlobeInstance) {
  const scene = world.scene() as unknown as THREE.Scene;

  scene.children.forEach((child) => {
    if (!(child instanceof THREE.Light)) {
      return;
    }

    if (child instanceof THREE.AmbientLight) {
      child.intensity = Math.min(child.intensity, 0.24);
    }

    if (child instanceof THREE.DirectionalLight) {
      child.intensity = Math.min(child.intensity, 0.42);
    }
  });
}

export default function DiplomacyGlobe({ selectedCountry, selectedLocation, highlightedCountries, onLocationSelect }: DiplomacyGlobeProps) {
  const { language, t } = useLanguage();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const screenHaloRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const selectedCountryRef = useRef(selectedCountry);
  const hoverCountryRef = useRef<string | undefined>(undefined);
  // 当前回合事件涉及国家集合，命令式更新 globe.gl 的 polygon 着色 / altitude / stroke 时使用。
  const highlightedCountriesRef = useRef<Set<string>>(new Set(highlightedCountries ?? []));

  useEffect(() => {
    selectedCountryRef.current = selectedCountry;
  }, [selectedCountry]);

  useEffect(() => {
    highlightedCountriesRef.current = new Set((highlightedCountries ?? []).map((iso) => iso.toUpperCase()));
    const globe = globeRef.current;
    if (!globe) {
      return;
    }
    // highlightedCountries 变化后强制 globe.gl 重新计算 polygon cap / altitude / stroke。
    globe
      .polygonCapColor<CountryFeature>((country) => getPolygonCapColor(country, highlightedCountriesRef.current))
      .polygonAltitude<CountryFeature>((country) =>
        getPolygonAltitude(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
      )
      .polygonStrokeColor<CountryFeature>((country) =>
        getPolygonStrokeColor(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
      );
  }, [highlightedCountries]);

  useEffect(() => {
    if (!containerRef.current || globeRef.current) {
      return undefined;
    }

    let disposed = false;
    const effects: GlobeEffect[] = [];
    let rimMesh: EarthRimMesh | null = null;
    let initialHaloFrame = 0;
    let gui: { destroy: () => void } | null = null;
    const container = containerRef.current;
    const globe = createGlobe(container);
    globeRef.current = globe;

    const syncHalo = () => {
      if (!screenHaloRef.current) {
        return;
      }

      syncScreenAtmosphere(globe, screenHaloRef.current);
    };

    const refreshPolygonFocus = () => {
      globe
        .polygonAltitude<CountryFeature>((country) =>
          getPolygonAltitude(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
        )
        .polygonStrokeColor<CountryFeature>((country) =>
          getPolygonStrokeColor(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
        );
    };

    const setSize = () => {
      if (!containerRef.current || !globeRef.current) {
        return;
      }

      const { clientWidth, clientHeight } = containerRef.current;
      globeRef.current.width(clientWidth).height(clientHeight);
      requestAnimationFrame(syncHalo);
    };

    setSize();

    globe
      .backgroundColor('rgba(0,0,0,0)')
      .globeImageUrl('/textures/earth-night-4k.jpg')
      .bumpImageUrl('/textures/earth-bump-4k.png')
      .showAtmosphere(true)
      .atmosphereColor('#65eaff')
      .atmosphereAltitude(0.02)
      .globeOffset([0, -20])
      .pointOfView({ lat: 35, lng: 25, altitude: 1.65 }, 1000)
      .arcsData<RenderArc>(renderArcs)
      .arcStartLat<RenderArc>('startLat')
      .arcStartLng<RenderArc>('startLng')
      .arcEndLat<RenderArc>('endLat')
      .arcEndLng<RenderArc>('endLng')
      .arcColor<RenderArc>(getArcColor)
      .arcAltitude<RenderArc>(getArcAltitude)
      .arcStroke<RenderArc>(getArcStroke)
      .arcDashLength<RenderArc>((arc) => (arc.visualRole === 'pulse' ? 0.18 : 1))
      .arcDashGap<RenderArc>((arc) => (arc.visualRole === 'pulse' ? 0.78 : 0))
      .arcDashInitialGap<RenderArc>((arc) => seededRandom(arc.id))
      .arcDashAnimateTime<RenderArc>(getArcAnimateTime)
      .arcLabel<RenderArc>(createArcLabel)
      .pointsData<Capital>(capitals)
      .pointLat<Capital>('lat')
      .pointLng<Capital>('lng')
      .pointAltitude<Capital>(0.018)
      .pointRadius<Capital>((capital) => getCapitalRadius(capital, selectedCountryRef.current))
      .pointColor<Capital>((capital) => getCapitalColor(capital, selectedCountryRef.current))
      .pointLabel<Capital>((capital) => createCapitalTooltip(capital, language))
      .onPointClick<Capital>((capital) => {
        onLocationSelect(
          createGlobeSelection({
            kind: 'city',
            isoA3: capital.isoA3,
            countryName: capital.country,
            cityName: capital.name,
          }),
        );
        globe.pointOfView({ lat: capital.lat, lng: capital.lng, altitude: 1.55 }, 650);
      })
      .ringsData<Capital>(capitals.filter((capital) => importantCapitalIds.has(capital.id)))
      .ringLat<Capital>('lat')
      .ringLng<Capital>('lng')
      .ringColor<Capital>((capital: Capital) => () => getFactionConfig(capital.faction).glow)
      .ringMaxRadius<Capital>((capital) => (capital.importance === 'major' ? 3.8 : 2.6))
      .ringPropagationSpeed<Capital>(1.1)
      .ringRepeatPeriod<Capital>((capital) => (capital.status === 'critical' ? 850 : 1400))
      .htmlElementsData<Capital>(capitals.filter((capital) => labeledCapitalIds.has(capital.id)))
      .htmlLat<Capital>('lat')
      .htmlLng<Capital>('lng')
      .htmlAltitude<Capital>(0.07)
      .htmlElement<Capital>(createCapitalLabel);

    const controls = globe.controls();
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.38;
    controls.zoomSpeed = 0.55;
    controls.enablePan = false;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.18;
    controls.minDistance = 170;
    controls.maxDistance = 430;

    tuneSceneLighting(globe);
    effects.push(...addSpaceLighting(globe));
    effects.push(addCloudLayer(globe));
    rimMesh = createEarthRimMesh(globe);
    initialHaloFrame = requestAnimationFrame(syncHalo);

    controls.addEventListener?.('change', syncHalo);

    if (import.meta.env.DEV && import.meta.env.VITE_SHOW_RIM_DEBUG === 'true') {
      const rimDebug = {
        haloOpacity: 0,
        haloRotation: 90,
        atmosphereAltitude: 0.02,
        rimPower: 10,
        rimIntensity: 0.8,
        innerMaskStart: 54,
        innerMaskEnd: 64,
        outerBlurOpacity: 0,
      };

      import('lil-gui').then(({ GUI }) => {
        if (disposed) {
          return;
        }

        const devGui = new GUI({ title: 'Earth Rim Debug' });
        gui = devGui;
        devGui
          .add(rimDebug, 'haloOpacity', 0, 1, 0.01)
          .onChange((value: number) => screenHaloRef.current?.style.setProperty('--halo-opacity', String(value)));
        devGui
          .add(rimDebug, 'haloRotation', -90, 90, 1)
          .onChange((value: number) => screenHaloRef.current?.style.setProperty('--halo-rotation', `${value}deg`));
        devGui
          .add(rimDebug, 'atmosphereAltitude', 0.02, 0.2, 0.005)
          .onChange((value: number) => globe.atmosphereAltitude(value));
        devGui.add(rimDebug, 'rimPower', 2, 10, 0.1).onChange((value: number) => {
          if (rimMesh) rimMesh.material.uniforms.power.value = value;
        });
        devGui.add(rimDebug, 'rimIntensity', 0, 0.8, 0.01).onChange((value: number) => {
          if (rimMesh) rimMesh.material.uniforms.intensity.value = value;
        });
        devGui.add(rimDebug, 'innerMaskStart', 54, 66, 0.1).onChange((value: number) => {
          screenHaloRef.current?.style.setProperty('--halo-inner-start', `${value}%`);
        });
        devGui.add(rimDebug, 'innerMaskEnd', 64, 76, 0.1).onChange((value: number) => {
          screenHaloRef.current?.style.setProperty('--halo-inner-end', `${value}%`);
        });
        devGui.add(rimDebug, 'outerBlurOpacity', 0, 0.9, 0.01).onChange((value: number) => {
          screenHaloRef.current?.style.setProperty('--halo-outer-opacity', String(value));
        });
      });
    }

    // Later: wrap globe.gl behind a GlobeEngine interface, then migrate to three-globe or native Three.js.
    // Later: connect selected country and diplomacy state to Zustand.
    // Later: feed marker/arcs actions from an AI command system.
    fetch('/data/countries.geojson')
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Missing GeoJSON'))))
      .then((geoJson: CountriesGeoJson) => {
        if (disposed) {
          return;
        }

        const countries = Array.isArray(geoJson.features) ? geoJson.features : [];
        globe
          .polygonsData<CountryFeature>(countries)
          .polygonCapColor<CountryFeature>((country) => getPolygonCapColor(country, highlightedCountriesRef.current))
          .polygonSideColor<CountryFeature>('rgba(0, 80, 120, 0.04)')
          .polygonStrokeColor<CountryFeature>((country) =>
            getPolygonStrokeColor(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
          )
          .polygonAltitude<CountryFeature>((country) =>
            getPolygonAltitude(country, selectedCountryRef.current, hoverCountryRef.current, highlightedCountriesRef.current),
          )
          .polygonLabel<CountryFeature>((country) => createCountryLabel(country, language))
          .onPolygonHover<CountryFeature>((country) => {
            hoverCountryRef.current = country ? getIsoA3(country) : undefined;
            refreshPolygonFocus();
          })
          .onPolygonClick<CountryFeature>((country) => {
            onLocationSelect(
              createGlobeSelection({
                kind: 'country',
                isoA3: getIsoA3(country),
                countryName: getCountryName(country),
                continent: country.properties?.CONTINENT,
              }),
            );
          });
      })
      .catch(() => {
        globe.polygonsData<CountryFeature>([]);
      });

    const resizeObserver = new ResizeObserver(setSize);
    resizeObserver.observe(container);
    window.addEventListener('resize', setSize);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener('resize', setSize);
      cancelAnimationFrame(initialHaloFrame);
      controls.removeEventListener?.('change', syncHalo);
      gui?.destroy();
      if (rimMesh) {
        disposeEarthRimMesh(globe, rimMesh);
      }
      effects.forEach(disposeGlobeEffect);
      globe._destructor?.();
      globeRef.current = null;
      container.replaceChildren();
    };
  }, [language, onLocationSelect]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) {
      return;
    }

    globe
      .polygonAltitude<CountryFeature>((country) =>
        getPolygonAltitude(country, selectedCountry, hoverCountryRef.current, highlightedCountriesRef.current),
      )
      .polygonStrokeColor<CountryFeature>((country) =>
        getPolygonStrokeColor(country, selectedCountry, hoverCountryRef.current, highlightedCountriesRef.current),
      )
      .pointRadius<Capital>((capital) => getCapitalRadius(capital, selectedCountry))
      .pointColor<Capital>((capital) => getCapitalColor(capital, selectedCountry));
  }, [selectedCountry]);

  return (
    <section className="globe-stage" aria-label="Interactive diplomacy globe">
      <div ref={containerRef} className="globe-canvas" />
      <div ref={screenHaloRef} className="screen-atmosphere" />
      {selectedLocation ? (
        <article
          className="globe-selection-card"
          style={
            {
              '--selection-color': selectedLocation.allianceColor,
              '--selection-glow': selectedLocation.allianceGlow,
            } as CSSProperties
          }
        >
          <span>{selectedLocation.kind === 'city' ? t('cityNode') : t('countryArea')}</span>
          <h2>{selectedLocation.kind === 'city' ? selectedLocation.cityName : selectedLocation.countryName}</h2>
          {selectedLocation.kind === 'city' ? <p>{selectedLocation.countryName}</p> : null}
          <dl>
            <div>
              <dt>ISO</dt>
              <dd>{selectedLocation.isoA3}</dd>
            </div>
            <div>
              <dt>{t('allianceBelonging')}</dt>
              <dd>
                <i />
                {localizeAllianceName(selectedLocation.allianceName, language)}
              </dd>
            </div>
            <div>
              <dt>{t('influence')}</dt>
              <dd>{selectedLocation.influence}</dd>
            </div>
            <div>
              <dt>{t('stability')}</dt>
              <dd>{selectedLocation.stability}%</dd>
            </div>
          </dl>
        </article>
      ) : null}
    </section>
  );
}

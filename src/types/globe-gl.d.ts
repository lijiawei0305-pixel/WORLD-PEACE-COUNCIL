declare module 'globe.gl' {
  type Accessor<T, R> = R | keyof T | ((datum: T) => R);

  export type GlobeInstance = {
    (container: HTMLElement): GlobeInstance;
    width(value: number): GlobeInstance;
    height(value: number): GlobeInstance;
    backgroundColor(value: string): GlobeInstance;
    globeImageUrl(value: string): GlobeInstance;
    bumpImageUrl(value: string): GlobeInstance;
    showAtmosphere(value: boolean): GlobeInstance;
    atmosphereColor(value: string): GlobeInstance;
    atmosphereAltitude(value: number): GlobeInstance;
    globeOffset(value: [number, number]): GlobeInstance;
    pointOfView(value: { lat: number; lng: number; altitude: number }, transitionMs?: number): GlobeInstance;
    camera(): unknown;
    renderer(): {
      domElement: HTMLCanvasElement;
    };
    scene(): {
      add(object: unknown): void;
      remove(object: unknown): void;
    };
    getGlobeRadius(): number;
    controls(): {
      enableDamping: boolean;
      dampingFactor: number;
      rotateSpeed: number;
      zoomSpeed: number;
      autoRotate: boolean;
      autoRotateSpeed: number;
      enablePan: boolean;
      minDistance: number;
      maxDistance: number;
      addEventListener?: (type: string, listener: () => void) => void;
      removeEventListener?: (type: string, listener: () => void) => void;
    };
    polygonsData<T>(data: T[]): GlobeInstance;
    polygonCapColor<T>(value: Accessor<T, string>): GlobeInstance;
    polygonSideColor<T>(value: Accessor<T, string>): GlobeInstance;
    polygonStrokeColor<T>(value: Accessor<T, string>): GlobeInstance;
    polygonAltitude<T>(value: Accessor<T, number>): GlobeInstance;
    polygonLabel<T>(value: Accessor<T, string>): GlobeInstance;
    onPolygonClick<T>(callback: (polygon: T) => void): GlobeInstance;
    onPolygonHover<T>(callback: (polygon: T | null) => void): GlobeInstance;
    arcsData<T>(data: T[]): GlobeInstance;
    arcStartLat<T>(value: Accessor<T, number>): GlobeInstance;
    arcStartLng<T>(value: Accessor<T, number>): GlobeInstance;
    arcEndLat<T>(value: Accessor<T, number>): GlobeInstance;
    arcEndLng<T>(value: Accessor<T, number>): GlobeInstance;
    arcColor<T>(value: Accessor<T, string | string[]>): GlobeInstance;
    arcAltitude<T>(value: Accessor<T, number>): GlobeInstance;
    arcStroke<T>(value: Accessor<T, number>): GlobeInstance;
    arcDashLength<T>(value: Accessor<T, number>): GlobeInstance;
    arcDashGap<T>(value: Accessor<T, number>): GlobeInstance;
    arcDashInitialGap<T>(value: Accessor<T, number>): GlobeInstance;
    arcDashAnimateTime<T>(value: Accessor<T, number>): GlobeInstance;
    arcLabel<T>(value: Accessor<T, string>): GlobeInstance;
    pointsData<T>(data: T[]): GlobeInstance;
    pointLat<T>(value: Accessor<T, number>): GlobeInstance;
    pointLng<T>(value: Accessor<T, number>): GlobeInstance;
    pointAltitude<T>(value: Accessor<T, number>): GlobeInstance;
    pointRadius<T>(value: Accessor<T, number>): GlobeInstance;
    pointColor<T>(value: Accessor<T, string>): GlobeInstance;
    pointLabel<T>(value: Accessor<T, string>): GlobeInstance;
    onPointClick<T>(callback: (point: T) => void): GlobeInstance;
    onPointHover<T>(callback: (point: T | null) => void): GlobeInstance;
    ringsData<T>(data: T[]): GlobeInstance;
    ringLat<T>(value: Accessor<T, number>): GlobeInstance;
    ringLng<T>(value: Accessor<T, number>): GlobeInstance;
    ringColor<T>(value: Accessor<T, string | ((t: number) => string)>): GlobeInstance;
    ringMaxRadius<T>(value: Accessor<T, number>): GlobeInstance;
    ringPropagationSpeed<T>(value: Accessor<T, number>): GlobeInstance;
    ringRepeatPeriod<T>(value: Accessor<T, number>): GlobeInstance;
    htmlElementsData<T>(data: T[]): GlobeInstance;
    htmlLat<T>(value: Accessor<T, number>): GlobeInstance;
    htmlLng<T>(value: Accessor<T, number>): GlobeInstance;
    htmlAltitude<T>(value: Accessor<T, number>): GlobeInstance;
    htmlElement<T>(value: Accessor<T, HTMLElement>): GlobeInstance;
    _destructor?: () => void;
  };

  const Globe: {
    new (container?: HTMLElement): GlobeInstance;
    (container?: HTMLElement): GlobeInstance;
  };

  export default Globe;
}

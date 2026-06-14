declare module "@mapbox/mapbox-gl-geocoder" {
  import mapboxgl from "mapbox-gl";

  type GeocoderOptions = {
    accessToken: string;
    mapboxgl: typeof mapboxgl;
    marker?: boolean;
    placeholder?: string;
    countries?: string;
  };

  type GeocoderResultEvent = {
    result?: {
      place_name?: string;
      center?: [number, number];
    };
  };

  export default class MapboxGeocoder {
    constructor(options: GeocoderOptions);
    on(event: "result", callback: (event: GeocoderResultEvent) => void): this;
  }
}

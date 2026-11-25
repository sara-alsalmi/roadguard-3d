export interface CityConfig {
  id: string;
  name: string;
  lon: number;
  lat: number;
}

/** Configurable demonstration regions. Riyadh is the default. */
export const CITIES: CityConfig[] = [{ id: "riyadh", name: "Riyadh", lon: 46.6695, lat: 24.7165 }];
export const DEFAULT_CITY = CITIES[0];

const env = import.meta.env;
export const CONFIG = {
  ionToken: ((env.VITE_CESIUM_ION_TOKEN as string | undefined) ?? "").trim(),
  googleKey: ((env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? "").trim(),
  enableGoogle3D: env.VITE_ENABLE_GOOGLE_3D_TILES === "true",
  inferenceBase: ((env.VITE_INFERENCE_API_URL as string | undefined) ?? "").replace(/\/$/, ""),
};

export const CLASS_META = {
  pothole: { label: "Pothole", color: "#f5f5f7", short: "PH" },
  barrier: { label: "Excavation Barrier", color: "#ffd60a", short: "EB" },
  sidewalk: { label: "Dilapidated Sidewalk", color: "#bf5af2", short: "DS" },
} as const;

export const STATUS_META = {
  predicted: { label: "Predicted", color: "#ff9f0a" },
  new: { label: "New", color: "#ff453a" },
  review: { label: "Under Review", color: "#64d2ff" },
  assigned: { label: "Team Assigned", color: "#0a84ff" },
  resolved: { label: "Resolved", color: "#30d158" },
} as const;

export const LOCATION_META = {
  verified: { label: "Verified", hint: "Surveyed GPS record" },
  manual: { label: "Manually selected", hint: "Placed by an operator on the map" },
  simulated: { label: "Simulated", hint: "Demo placement, not a survey" },
} as const;

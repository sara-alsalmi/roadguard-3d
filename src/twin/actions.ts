import { Cartesian3 } from "cesium";
import { useApp } from "../store/appStore";
import { smoothBearing } from "../utils/geo";
import { nearestCorridor } from "../utils/network";
import { cameraController } from "../components/map/cameraController";
import { heightAt } from "../components/map/terrain";
import { damageGround } from "../components/twin/hazardLayer";

const st = () => useApp.getState();

/** fly the camera to a spot, looking along the road */
export function flyToLocation(lon: number, lat: number, opts?: { range?: number; pitch?: number; duration?: number; ground?: number }) {
  const sn = nearestCorridor(lon, lat);
  const bearing = smoothBearing(sn.corridor.pl, sn.s);
  return cameraController.flyToPoint(Cartesian3.fromDegrees(lon, lat, (opts?.ground ?? heightAt(lon, lat)) + 1), {
    heading: bearing + 28,
    pitch: opts?.pitch ?? -32,
    range: opts?.range ?? 85,
    duration: opts?.duration ?? 2,
  });
}

/** open a damage (map click, list click or the linked website) */
export function selectDamage(id: string | null, fly = true) {
  st().select(id);
  if (!id) return;
  const d = st().incidents.find((i) => i.id === id);
  // close enough that the 3D damage is what you see
  if (d && fly) void flyToLocation(d.lon, d.lat, { range: 22, pitch: -38, duration: 2, ground: damageGround(d) });
}

export function goOverview() {
  void cameraController.flyToOverview(2.4);
}

export function removeDamage(id: string) {
  st().removeIncident(id);
}

export function clearAll() {
  useApp.setState({ incidents: [], selectedId: null, alert: null });
}

export type DemoRoutePosition = [number, number];

export const CUSTOM_DEMO_ROUTE_KEY = "wannarun-custom-demo-route-v1";
export const CUSTOM_DEMO_ROUTE_EVENT = "wannarun:custom-demo-route-updated";

export function readCustomDemoRoute(): DemoRoutePosition[] {
  try {
    const route = JSON.parse(localStorage.getItem(CUSTOM_DEMO_ROUTE_KEY) ?? "[]");
    if (!Array.isArray(route)) return [];
    return route.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))
      ? route as DemoRoutePosition[]
      : [];
  } catch {
    return [];
  }
}

function distanceMeters(a: DemoRoutePosition, b: DemoRoutePosition) {
  const latScale = 111_320;
  const lonScale = Math.cos(a[0] * Math.PI / 180) * latScale;
  return Math.hypot((a[0] - b[0]) * latScale, (a[1] - b[1]) * lonScale);
}

export function makeRoundTripRoute(route: DemoRoutePosition[]): DemoRoutePosition[] {
  if (route.length < 2 || distanceMeters(route[0], route[route.length - 1]) <= 25) return route;
  return [...route, ...route.slice(0, -1).reverse()];
}

export function saveCustomDemoRoute(route: DemoRoutePosition[]) {
  localStorage.setItem(CUSTOM_DEMO_ROUTE_KEY, JSON.stringify(route));
  announceCustomDemoRouteChange();
}

export function announceCustomDemoRouteChange() {
  window.dispatchEvent(new Event(CUSTOM_DEMO_ROUTE_EVENT));
}


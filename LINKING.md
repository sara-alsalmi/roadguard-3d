# Linking RoadGuard 3D with another website

RoadGuard 3D can be embedded in any web page, and that page can send it model results.
Replace `SITE` below with the published address, e.g. `https://sara-alsalmi.github.io/roadguard-3d/`.

## 1. Embed the map

```html
<iframe id="roadguard" src="SITE?embed" width="100%" height="700" style="border:0" allow="fullscreen"></iframe>
```

`?embed` gives a clean view: map, report list and details, without the demo buttons. It always starts from the same
demo state.
Add `&origin=https://your-site.com` so that only your site can send messages to the map.

## 2. Send a detection (your site → map)

```js
const map = document.getElementById("roadguard").contentWindow;
map.postMessage({
  type: "roadguard:detection",
  cls: "pothole",                         // "pothole" | "barrier" | "sidewalk"
  image: "data:image/jpeg;base64,...",    // or an https:// image URL (keep it under ~3 MB)
  title: "Pothole on lane 2",             // optional
  boxes: [                                // optional, from the real model only
    { bbox: [0.31, 0.52, 0.22, 0.18], confidence: 0.87 }   // x, y, w, h normalised 0..1
  ],
  auto: true,    // run the automatic response: confirm → team → repair (default true)
  focus: true    // open the report and fly to it (default true)
}, "*");
```

What the map does:
- **Location:** the report is placed at a **random simulated spot on the demo roads**, because the dataset has no GPS. It is marked "Simulated".
- **Image:** the image is shown in the report with the model's boxes.
- **Confidence:** shown **only** when you send it. Nothing is invented.
- **Automatic response:** with `auto: true` the report is confirmed, the nearest team drives out, works on site, and the report closes as Resolved. All of this is simulated.

## 3. Messages back (map → your site)

```js
window.addEventListener("message", (e) => {
  if (!e.data || typeof e.data.type !== "string" || !e.data.type.startsWith("roadguard:")) return;
  console.log(e.data);
});
```

| type | data | when |
|---|---|---|
| `roadguard:ready` | | the map has loaded (send `{type:"roadguard:ping"}` to ask again) |
| `roadguard:created` | `id, cls, lon, lat, locationSource` | your detection is on the map |
| `roadguard:status` | `id, status` | a report changes: `predicted → review → assigned → resolved` |
| `roadguard:selected` | `id` (or `null`) | someone opened or closed a report |
| `roadguard:error` | `message` | your message was rejected (wrong class, bad image) |

Open a report from your site: `map.postMessage({ type: "roadguard:select", id: "RG-0112" }, "*")`

## 4. Try it

Open `SITE/link-demo.html`. It is an example "second website" with the map embedded: pick a class, choose a road
image, and press **Send to the map**.

## Connecting the trained model

Run YOLO/CNN on your server, then send its result with the `roadguard:detection` message above:
- **`cls`:** the top class.
- **`boxes`:** the boxes normalised to 0..1, with their confidence.
- **`image`:** the image as a data URL.

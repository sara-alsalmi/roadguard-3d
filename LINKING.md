# Linking the RoadGuard 3D digital twin with another website

The twin shows real Riyadh roads in 3D. Every road photo or video sent to it appears on the map as a 3D damage
(pothole, excavation barrier, broken sidewalk). Click the damage to see the photo with the model's boxes, or play the video.
Replace `SITE` with `https://sara-alsalmi.github.io/roadguard-3d/`.

## 1. Embed the map

```html
<iframe id="roadguard" src="SITE?embed" width="100%" height="700" style="border:0" allow="fullscreen"></iframe>
```
Add `&origin=https://your-site.com` so that only your site can send messages to the map.

## 2. Send a photo or video (your site → map)

```js
const map = document.getElementById("roadguard").contentWindow;
map.postMessage({
  type: "roadguard:detection",
  cls: "pothole",                      // "pothole" | "barrier" | "sidewalk" (top class from your model)
  image: fileOrBlob,                   // a File/Blob, an https:// URL, or a data:image URL
  // video: videoFile,                 // or a video (File/Blob, https:// URL)
  name: "IMG_0412.jpg",                // optional, shown under the photo
  boxes: [                             // optional, from the real model only
    { bbox: [0.31, 0.52, 0.22, 0.18], confidence: 0.87 }   // x, y, w, h normalised 0..1
  ],
  caseId: "INC-21-06-038549",          // optional: same caseId = more files of the same damage
  focus: true                          // open it and fly to it (default true)
}, "*");
```

- **Position:** the files have no GPS, so each damage is placed at a **simulated spot on a real road**, marked "Simulated".
- **Confidence:** shown **only** when you send it. Nothing is invented.

Other messages: `{ type: "roadguard:select", id }` opens a damage, `{ type: "roadguard:clear" }` removes everything,
`{ type: "roadguard:ping" }` asks for `roadguard:ready`.

## 3. Messages back (map → your site)

| type | data | when |
|---|---|---|
| `roadguard:ready` | | the map has loaded |
| `roadguard:created` | `id, cls, lon, lat, locationSource` | your file is on the map |
| `roadguard:selected` | `id` (or `null`) | someone opened or closed a damage |
| `roadguard:error` | `message` | the message was rejected (wrong class, bad file) |

## 4. Try it
- **Linking test:** open `SITE/link-demo.html`, an example "second website" with the map embedded.
- **Upload directly:** use the upload box on the map itself. Dataset photos together with their YOLO `.txt` label files bring their class and boxes. Photos of the same `INC-…` case become one damage with a gallery.

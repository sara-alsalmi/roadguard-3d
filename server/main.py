"""
Optional FastAPI inference server for RoadGuard 3D.

    pip install fastapi uvicorn[standard] python-multipart ultralytics pillow
    WEIGHTS=runs/detect/train/weights/best.pt uvicorn server.main:app --port 8000

The Vite dev server proxies /api -> http://127.0.0.1:8000, so the frontend's
"Real model (FastAPI)" adapter works with no extra configuration.

Contract (see src/services/inference/types.ts):
    POST /api/predict   multipart field "file"
    -> { image_width, image_height,
         detections: [{ class_name, bbox: [x1, y1, x2, y2] (pixels), confidence }],
         annotated_image: "data:image/jpeg;base64,..." | null }

Until WEIGHTS points at a trained model this server answers 503 - it never
returns made-up predictions.
"""
import base64
import io
import os

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

app = FastAPI(title="RoadGuard inference")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_model = None


def get_model():
    """Lazily load the Kaggle-trained YOLO weights."""
    global _model
    weights = os.environ.get("WEIGHTS")
    if not weights or not os.path.exists(weights):
        raise HTTPException(503, "No trained weights configured. Set WEIGHTS=/path/to/best.pt")
    if _model is None:
        from ultralytics import YOLO  # imported lazily so the server can start without it

        _model = YOLO(weights)
    return _model


@app.get("/api/health")
def health():
    return {"ok": True, "weights": os.environ.get("WEIGHTS")}


@app.post("/api/predict")
async def predict(file: UploadFile = File(...)):
    model = get_model()
    image = Image.open(io.BytesIO(await file.read())).convert("RGB")
    result = model.predict(image, verbose=False)[0]
    names = result.names
    detections = [
        {
            "class_name": names[int(b.cls)],
            "bbox": [float(v) for v in b.xyxy[0].tolist()],
            "confidence": float(b.conf),
        }
        for b in result.boxes
    ]
    annotated = Image.fromarray(result.plot()[..., ::-1])  # BGR -> RGB
    buf = io.BytesIO()
    annotated.save(buf, format="JPEG", quality=88)
    return {
        "image_width": image.width,
        "image_height": image.height,
        "detections": detections,
        "annotated_image": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(),
    }

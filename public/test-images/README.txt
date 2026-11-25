Real test images
================
1. Copy your photos here (e.g. pothole-01.jpg).
2. List them in manifest.json - one entry per class replaces the generated demo illustration of that class:

{
  "images": [
    {
      "cls": "pothole",                      // pothole | barrier | sidewalk
      "image": "pothole-01.jpg",
      "label": "Test photo · Riyadh",
      "annotations": [
        { "cls": "pothole", "bbox": [0.31, 0.52, 0.2, 0.14], "source": "model", "confidence": 0.87 }
      ]
    }
  ]
}

bbox is [x, y, width, height] normalised 0..1. Use "source": "model" for real model output (confidence is shown),
"manual" for hand labels. Never put a confidence on anything a model did not produce.

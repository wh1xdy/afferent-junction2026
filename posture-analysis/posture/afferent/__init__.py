"""afferent posture POC.

Webcam -> pose (feet) -> face identity lock -> One-Euro smoothing ->
situation (activity x orientation) -> posture angles + gait + facial
expressivity -> SQLite aggregates -> FastAPI dashboard.

Only derived aggregates are persisted by default: no images, no video, no
raw keypoints on disk (see plan section 16).
"""

__version__ = "0.1.0"

"""Halpe-26 keypoint layout (RTMPose body7 + feet), verified against the
mmpose halpe26 definition used by rtmlib BodyWithFeet.

Indices:
    0  nose            1  left_eye         2  right_eye
    3  left_ear        4  right_ear
    5  left_shoulder   6  right_shoulder
    7  left_elbow      8  right_elbow
    9  left_wrist     10  right_wrist
   11  left_hip       12  right_hip
   13  left_knee      14  right_knee
   15  left_ankle     16  right_ankle
   17  head           18  neck            19  hip
   20  left_big_toe  21  right_big_toe
   22  left_small_toe 23  right_small_toe
   24  left_heel     25  right_heel
"""
from __future__ import annotations

KP_NAMES: tuple[str, ...] = (
    "nose", "left_eye", "right_eye", "left_ear", "right_ear",
    "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
    "left_wrist", "right_wrist",
    "left_hip", "right_hip", "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "head", "neck", "hip",
    "left_big_toe", "right_big_toe", "left_small_toe", "right_small_toe",
    "left_heel", "right_heel",
)

N_KEYPOINTS = 26

# Convenience indices.
NOSE = 0
LEFT_EYE, RIGHT_EYE = 1, 2
LEFT_EAR, RIGHT_EAR = 3, 4
LEFT_SHOULDER, RIGHT_SHOULDER = 5, 6
LEFT_ELBOW, RIGHT_ELBOW = 7, 8
LEFT_WRIST, RIGHT_WRIST = 9, 10
LEFT_HIP, RIGHT_HIP = 11, 12
LEFT_KNEE, RIGHT_KNEE = 13, 14
LEFT_ANKLE, RIGHT_ANKLE = 15, 16
HEAD, NECK, HIP = 17, 18, 19
LEFT_BIG_TOE, RIGHT_BIG_TOE = 20, 21
LEFT_SMALL_TOE, RIGHT_SMALL_TOE = 22, 23
LEFT_HEEL, RIGHT_HEEL = 24, 25

FACE_POINTS = (NOSE, LEFT_EYE, RIGHT_EYE, LEFT_EAR, RIGHT_EAR)

"""Capture source classification: file vs camera device.

/dev/videoN must NOT be detected as a file — it would get synthetic
idx/fps timestamps instead of the epoch clock.
"""
from afferent.capture import _is_file_source


def test_dev_video_is_device_not_file():
    assert _is_file_source("/dev/video0") is False
    assert _is_file_source("/dev/video2") is False
    assert _is_file_source("/dev/v4l/by-id/usb-cam") is False


def test_numeric_and_video_names_are_devices():
    assert _is_file_source("0") is False
    assert _is_file_source("2") is False
    assert _is_file_source(0) is False
    assert _is_file_source("video0") is False


def test_video_extension_is_file():
    assert _is_file_source("recordings/dev_20261115_120000.mp4") is True
    assert _is_file_source("./take1.mkv") is True
    assert _is_file_source("/tmp/missing-but-extension.mp4") is True


def test_existing_regular_file_without_ext(tmp_path):
    f = tmp_path / "clipdata"
    f.write_bytes(b"x")  # exists, no video extension
    assert _is_file_source(str(f)) is True


def test_missing_path_without_ext_is_not_file(tmp_path):
    # "/tmp/..." path that does not exist and has no video ext -> device
    assert _is_file_source(str(tmp_path / "nonexistent")) is False

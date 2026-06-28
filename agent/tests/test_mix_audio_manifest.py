#!/usr/bin/env python3
"""Tests for timeline manifest serialization."""

import json
import os
import sys
import unittest

SHOW_PRODUCTION_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "skills",
    "show-production",
    "scripts",
)
sys.path.insert(0, os.path.abspath(SHOW_PRODUCTION_DIR))

from audio_timeline import build_manifest, save_manifest, strip_non_serializable_clip_refs  # noqa: E402


class _FakeClip:
    """Stand-in for pydub AudioSegment in serialization tests."""


class MixAudioManifestTest(unittest.TestCase):
    def test_manifest_serializes_after_clip_refs_stripped(self):
        events = [
            {
                "id": "turn_000",
                "type": "speech",
                "speaker": "Host",
                "text": "Hello world",
                "resolvedStartMs": 0,
                "durationMs": 500,
                "_clip": _FakeClip(),
            }
        ]

        manifest = build_manifest(events, 500)

        encoded = json.dumps(manifest)
        self.assertIn("turn_000", encoded)
        self.assertNotIn("_clip", encoded)

    def test_strip_non_serializable_clip_refs(self):
        events = [{"id": "evt_1", "_clip": _FakeClip()}]
        strip_non_serializable_clip_refs(events)
        self.assertNotIn("_clip", events[0])

    def test_save_manifest_writes_valid_json(self):
        events = [
            {
                "id": "turn_001",
                "type": "speech",
                "speaker": "Guest",
                "text": "Testing",
                "resolvedStartMs": 0,
                "durationMs": 1000,
            }
        ]
        manifest = build_manifest(events, 1000)

        workspace = os.path.join(os.path.dirname(__file__), "_tmp_manifest_workspace")
        os.makedirs(workspace, exist_ok=True)
        try:
            path = save_manifest(workspace, manifest)
            with open(path, encoding="utf-8") as handle:
                loaded = json.load(handle)
            self.assertEqual(loaded["totalDurationMs"], 1000)
            self.assertEqual(len(loaded["transcript"]), 1)
        finally:
            import shutil

            shutil.rmtree(workspace, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()

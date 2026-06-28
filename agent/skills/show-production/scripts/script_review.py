#!/usr/bin/env python3
"""Review generated script for pacing, balance, and production quality."""

import argparse
import json
import os
import re
import subprocess
import sys

from google import genai

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
from load_config import get_enabled_features, get_host_name, load_show_config  # noqa: E402

INTERRUPT_RE = re.compile(r"\[interrupts\s+([^\]]+)\]", re.IGNORECASE)

REVIEW_PROMPT_BASE = """You are a radio production director reviewing a script before TTS recording.

Analyze the script and return JSON with this structure:
{
  "passed": true/false,
  "issues": ["list of specific problems"],
  "speaker_line_counts": {"SpeakerName": count},
  "revision_notes": "concise instructions for the scriptwriter if failed"
}

Check:
1. Host name is consistent throughout
2. Every caller is introduced by name/location before first line
3. Guest count is reasonable for the show style
4. No single non-host speaker exceeds 45% of lines (except interview style)
5. No caller turn exceeds ~80 words
6. Required segments present (intro, main content, closing)
7. Content safety (no politics, profanity, etc.) — see show-specific allowances below
8. No fabricated facts beyond research
9. Overlap tags (`[interrupts]`, `[under]`, `[reaction]`) are plausible for personas — shy callers should not have many sharp interjections
10. `[interrupts SpeakerName]` references a speaker who spoke recently

Return ONLY valid JSON."""


def build_review_prompt(config):
    """Tailor review rules to show_config (topic, tone, enabled features)."""
    features = config.get("features", {})
    tone_context = (config.get("toneContext") or "").strip()
    topic = (config.get("topic") or "").strip()
    enabled = get_enabled_features(features)

    extra = []
    if topic:
        extra.append(f"- Show topic: {topic}")
    if tone_context:
        extra.append(f"- User tone/branding context: {tone_context}")
    if enabled:
        extra.append(f"- Enabled features: {', '.join(enabled)}")
    if features.get("mockSponsorRead"):
        extra.append(
            "- Fictional sponsor reads and mature men's health themes are ALLOWED when aligned with user context."
        )
    if tone_context and any(
        word in tone_context.lower()
        for word in ("intimacy", "sponsor", "pharma", "mature", "bedroom", "vitality")
    ):
        extra.append(
            "- Do NOT flag suggestive innuendo or ED/pharma sponsor content as a content safety violation."
        )

    if not extra:
        return REVIEW_PROMPT_BASE

    return REVIEW_PROMPT_BASE + "\n\n**Show-specific allowances:**\n" + "\n".join(extra)


def count_overlap_tags(script_text):
    interrupts = len(INTERRUPT_RE.findall(script_text))
    under = len(re.findall(r"\[under\]", script_text, re.IGNORECASE))
    reactions = len(re.findall(r"\[reaction\]", script_text, re.IGNORECASE))
    return interrupts, under + reactions


def count_speaker_lines(script_text):
    counts = {}
    for line in script_text.strip().split("\n"):
        line = line.strip()
        if not line or line.startswith("#") or line in ("[connect]", "[stinger]", "[hold]"):
            continue
        if ":" in line:
            speaker = line.split(":")[0].strip()
            counts[speaker] = counts.get(speaker, 0) + 1
    return counts


def main():
    parser = argparse.ArgumentParser(description="Review radio script quality")
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--config", default=None)
    parser.add_argument(
        "--auto-revise",
        action="store_true",
        help="Regenerate script once on failure (default: report only, do not overwrite script.md)",
    )
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    host_name = get_host_name(config)
    style = config.get("structure", {}).get("style", "debate")

    script_path = os.path.join(args.workspace, "data", "script.md")
    if not os.path.exists(script_path):
        print("ERROR: script.md not found")
        sys.exit(1)

    with open(script_path, encoding="utf-8") as f:
        script = f.read()

    print("=== AI Talk Radio: Script Review ===\n")

    line_counts = count_speaker_lines(script)
    total_lines = sum(line_counts.values())

    guests_config = config.get("guests", {})
    guest_mode = guests_config.get("mode", "auto")
    roster = guests_config.get("roster", [])
    target_count = guests_config.get("count")

    deterministic_issues = []
    if host_name not in line_counts:
        deterministic_issues.append(f"Host '{host_name}' has no lines in script")

    if guest_mode == "fixed" and roster:
        for guest in roster:
            name = guest.get("name")
            if name and name not in line_counts:
                deterministic_issues.append(
                    f"Fixed roster guest '{name}' has no lines in script"
                )

    if guest_mode == "guided" and target_count:
        non_host_speakers = [s for s in line_counts if s != host_name]
        if len(non_host_speakers) != target_count:
            deterministic_issues.append(
                f"Expected {target_count} guest speakers, found {len(non_host_speakers)}"
            )

    for speaker, count in line_counts.items():
        if speaker == host_name:
            continue
        pct = count / total_lines * 100 if total_lines else 0
        if style != "interview" and pct > 45:
            deterministic_issues.append(f"Speaker '{speaker}' has {pct:.0f}% of lines (max 45%)")

    realism = config.get("realism", {})
    if realism.get("enabled", True):
        interrupts, _backchannels = count_overlap_tags(script)
        intensity = realism.get("intensity", "moderate")
        max_interrupts = {"subtle": 2, "moderate": 4, "lively": 8}.get(intensity, 4)
        if interrupts > max_interrupts:
            deterministic_issues.append(
                f"Too many [interrupts] tags ({interrupts}) for {intensity} realism (max {max_interrupts})"
            )
        if style == "interview" and interrupts > 0:
            deterministic_issues.append("Interview style should not use guest [interrupts] tags")

    review_prompt = build_review_prompt(config)
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key"))

    review_input = (
        f"Host name: {host_name}\n"
        f"Style: {style}\n"
        f"Target guests: {config.get('guests', {}).get('count', 'auto')}\n"
        f"Line counts: {json.dumps(line_counts)}\n\n"
        f"Script:\n{script}"
    )

    try:
        interaction = client.interactions.create(
            model="gemini-3.5-flash",
            input=review_input,
            system_instruction=review_prompt,
        )
        review_text = interaction.steps[-1].content[0].text
        review_text = review_text.strip()
        if review_text.startswith("```"):
            review_text = review_text.split("\n", 1)[1]
            review_text = review_text.rsplit("```", 1)[0]
        review = json.loads(review_text)
    except Exception as e:
        print(f"LLM review failed ({e}), using deterministic checks only")
        review = {
            "passed": len(deterministic_issues) == 0,
            "issues": deterministic_issues,
            "revision_notes": "\n".join(deterministic_issues),
        }

    review["issues"] = list(set(review.get("issues", []) + deterministic_issues))
    if review["issues"]:
        review["passed"] = False

    review_path = os.path.join(args.workspace, "data", "script_review.json")
    with open(review_path, "w", encoding="utf-8") as f:
        json.dump(review, f, indent=2)

    if review.get("passed"):
        print("✅ Script review PASSED")
        print(f"\nReview saved to {review_path}")
        sys.exit(0)

    print("⚠️ Script review FAILED:")
    for issue in review.get("issues", []):
        print(f"   - {issue}")

    if args.auto_revise:
        revision_notes = review.get("revision_notes", "\n".join(review.get("issues", [])))
        script_gen = os.path.join(
            SCRIPT_DIR, "..", "..", "script-writing", "scripts", "generate_script.py"
        )
        print("\nAttempting one automatic revision (--auto-revise)...")
        subprocess.run(
            [
                "python3",
                script_gen,
                "--workspace",
                args.workspace,
                "--config",
                args.config or os.path.join(args.workspace, "data", "show_config.json"),
                "--revision",
                revision_notes,
            ],
            check=False,
        )
    else:
        print(
            "\nScript left unchanged. Fix issues manually or re-run with --auto-revise to regenerate."
        )

    print(f"\nReview saved to {review_path}")
    sys.exit(1)


if __name__ == "__main__":
    main()

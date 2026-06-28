#!/usr/bin/env python3
"""Generate the AI Talk Radio radio show script from research using the Interactions API."""

import argparse
import os
import sys

from google import genai

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "..", "..", "show-production", "scripts"))
from load_config import (  # noqa: E402
    build_branding_instructions,
    build_guest_instructions,
    build_segment_instructions,
    get_host_name,
    load_show_config,
)

STYLE_PROMPTS = {
    "debate": """
**Style: DEBATE**

**Callers**: For each topic, generate TWO callers representing opposing views. They should disagree respectfully but firmly.

**Structure:**
1. Cold Open (10 sec): Host teases the most controversial take.
2. Intro (15 sec): Host welcomes listeners, sets up the debate format.
3. Debate Segments (2.5 min): Host introduces a topic, takes calls from two sides. Callers argue their positions, host moderates.
4. Closing (15 sec): Host summarizes both sides, thanks callers.

**Realistic dialogue (when realism enabled):** Include 1-3 natural barge-ins using `[interrupts SpeakerName]` when callers react to dismissive language. Host may use `[under]` backchannels while guests speak.""",
    "roundtable": """
**Style: ROUNDTABLE**

**Callers**: 3-4 callers each bringing a different angle on the topic. Collaborative, building on each other's points rather than arguing.

**Structure:**
1. Cold Open (10 sec): Host previews the topic.
2. Intro (15 sec): Host welcomes the panel and introduces each caller.
3. Discussion (2.5 min): Open conversation — callers riff on each other's points, host guides the flow.
4. Closing (15 sec): Host ties the threads together.

**Realistic dialogue:** Callers may briefly overlap using `[interrupts SpeakerName]` or collaborative `[under]` reactions. Keep overlaps natural, not constant.""",
    "interview": """
**Style: INTERVIEW**

**Callers**: 1-2 callers presented as people with direct experience or deep knowledge. Host asks probing questions — this is more Q&A than conversation.

**Structure:**
1. Cold Open (10 sec): Host teases what the guest will reveal.
2. Intro (15 sec): Host introduces the guest(s) and their background.
3. Interview (2.5 min): Host asks questions, guest(s) answer in depth. Follow-up questions encouraged.
4. Closing (15 sec): Host thanks the guest(s) and summarizes key takeaways.

**Realistic dialogue:** Host may use `[under]` backchannels ("mm-hmm", "right") while guests speak. No guest-on-guest interruptions.""",
    "explainer": """
**Style: EXPLAINER**

**Callers**: 2-3 callers who each explain a different aspect of the topic. Think of it as a collaborative "teach the audience" format.

**Structure:**
1. Cold Open (10 sec): Host poses a question the audience might be wondering.
2. Intro (15 sec): Host sets up the topic and says we have people who can break it down.
3. Explainer Segments (2.5 min): Each caller explains their piece. Host asks clarifying questions on behalf of the audience.
4. Closing (15 sec): Host recaps the key points.

**Realistic dialogue:** Minimal overlap; occasional `[reaction]` or `[pause 1.5s]` for thinking beats only.""",
}

STYLE_PROMPTS["default"] = STYLE_PROMPTS["debate"]
VALID_STYLES = list(STYLE_PROMPTS.keys())

CONTENT_SAFETY = """
**CONTENT SAFETY — strictly off-limits:**
- Do NOT use any profanity, cuss words, or explicit language.
- Do NOT discuss politics, political parties, politicians, elections, legislation, or government policy.
- Do NOT discuss international politics, geopolitics, wars, conflicts, sanctions, or diplomacy.
- Do NOT discuss race, ethnicity, racial issues, stereotypes, or discrimination.
- Do NOT discuss religion, religious beliefs or practices.
- Do NOT discuss historical controversies (colonialism, slavery, genocide, etc.).
- Do NOT discuss gender/sexuality culture wars or immigration policy.
- If a research topic touches any of the above, skip it or focus only on the technical aspects.
- Keep the tone light, nerdy, and strictly focused on technology, software, science, and engineering."""


def build_base_prompt(config, duration, host_name):
    host = config.get("host", {})
    persona = host.get("persona", "Professional radio host")
    accent = host.get("accent", "British English")
    delivery = host.get("delivery", "measured")
    target_words = duration * 125

    return f"""You are a scriptwriter for a community radio show.

Write a ~{duration}-minute radio script based on the research provided. The show has:

**Host**: {host_name} (in the studio) — {persona}. Delivery style: {delivery}. Accent: {accent}.

**Format rules:**
- Every line MUST start with a speaker name and colon: `{host_name}:` or `[CallerName]:`
- You MUST include a gender tag `[Male]` or `[Female]` at the beginning of every caller turn.
- You MUST include an **accent tag** `[Accent: <accent_description>]` matching the caller's location.
- Example: `Caller1: [Male] [Accent: Irish] [hesitantly] I think...`
- You MUST include **audio tags** in square brackets to indicate delivery.
- Use tags like `[sighs]`, `[frustratedly]`, `[calmly]`, `[whispers]`, `[indignantly]`.
- **Realistic overlap tags** (use sparingly, match show style):
  - `[interrupts SpeakerName]` — barge-in over that speaker's current line (debate/roundtable only)
  - `[under]` or `[reaction]` — short backchannel ("mm-hmm", "right") under the previous speaker
  - `[pause 1.2s]` — variable pause before this line (optional)
  - Example: `Guest2: [interrupts Guest1] [indignantly] Oh obviously you can't align with the rest of us on that.`
- **CRITICAL**: Callers are amateurs — imperfect, natural speech with fillers ("uh", "like", "you know").
- **Tone**: Callers are smart, tech-savvy individuals, not professional broadcasters.
- **Host Introduction**: Host {host_name} MUST introduce each new caller by name and location before their first line.
- No stage directions outside of audio tags in the transcript.
- Keep sentences short and punchy — this is spoken word.
- Target ~{target_words} words total.
- DO NOT fabricate any facts. Only use information from the research provided.
- Time of Day: Do NOT assume the time of day (avoid "Good morning", "Good evening", etc.).
- No Songs: Do NOT include lines about playing music tracks or songs.
- Clean Wrap Up: Do a clean wrap up at the end without promising future segments.
- Marker lines `[connect]`, `[stinger]`, `[hold]` may appear on their own line — keep them exactly as written.

{CONTENT_SAFETY}"""


def main():
    parser = argparse.ArgumentParser(description="Generate AI Talk Radio radio script")
    parser.add_argument("--workspace", default="workspace", help="Workspace directory")
    parser.add_argument("--config", default=None, help="Path to show_config.json")
    parser.add_argument("--style", default=None, choices=VALID_STYLES, help="Show format override")
    parser.add_argument("--duration", type=int, default=None, help="Target duration in minutes")
    parser.add_argument("--context", default="", help="Additional tone/style notes")
    parser.add_argument("--revision", default="", help="Revision notes from script review")
    args = parser.parse_args()

    config = load_show_config(args.workspace, args.config)
    host_name = get_host_name(config)
    duration = args.duration or config.get("durationMinutes", 3)
    style = args.style or config.get("structure", {}).get("style", "debate")
    if style not in STYLE_PROMPTS:
        style = "debate"
    context = args.context or config.get("toneContext", "")

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", "dummy-key"))

    research_dir = os.path.join(args.workspace, "data", "research")
    research = ""
    if os.path.isdir(research_dir):
        for fname in sorted(os.listdir(research_dir)):
            if fname.endswith(".md"):
                with open(os.path.join(research_dir, fname), encoding="utf-8") as f:
                    research += f.read() + "\n\n"

    if not research.strip():
        print("ERROR: No research found in data/research/. Run the research step first.")
        return

    main_seg_min = (duration * 60 - 40) / 60
    main_seg_str = f"{main_seg_min:.1f} min"
    style_prompt = STYLE_PROMPTS[style].replace("2.5 min", main_seg_str)
    style_prompt = style_prompt.replace("Host", f"Host {host_name}")
    style_prompt = style_prompt.replace("host", "host")

    system_prompt = build_base_prompt(config, duration, host_name)
    system_prompt += "\n\n" + style_prompt
    system_prompt += "\n\n" + build_guest_instructions(config)
    segment_instructions = build_segment_instructions(config)
    if segment_instructions:
        system_prompt += "\n\n" + segment_instructions

    branding_instructions = build_branding_instructions(config)
    if branding_instructions:
        system_prompt += "\n\n" + branding_instructions

    topic = (config.get("topic") or "").strip()
    if topic:
        system_prompt += (
            f"\n\n**CRITICAL SHOW TOPIC:** {topic}\n"
            "Every segment must relate to this topic. Use station and sponsor details from show_config.json and toneContext."
        )

    if config.get("features", {}).get("coHost"):
        system_prompt += (
            "\n\n**Co-host**: Include a second studio co-host for brief banter in intro and closing. "
            "Give them a distinct name. Co-host lines do NOT get phone filter treatment."
        )

    if config.get("features", {}).get("fieldReporter"):
        system_prompt += (
            "\n\n**Field Reporter**: Include one on-location reporter segment with a location tag."
        )

    if "Hacker News" in research:
        system_prompt += (
            "\n\n**CRITICAL INSTRUCTION**: The research comes from Hacker News. "
            f"The host MUST explicitly mention and give credit to Hacker News during the show."
        )

    if context:
        system_prompt += (
            f"\n\n**ADDITIONAL CONTEXT FROM USER**: {context}\n"
            "(Apply ONLY to tone and style; do NOT dictate which facts to discuss.)"
        )

    if args.revision:
        system_prompt += (
            f"\n\n**REVISION REQUIRED** (fix these issues from script review):\n{args.revision}"
        )

    realism = config.get("realism", {})
    if realism.get("enabled", True):
        intensity = realism.get("intensity", "moderate")
        system_prompt += (
            f"\n\n**REALISM ({intensity})**: Write dialogue that sounds like live radio — "
            "natural overlaps where appropriate for the show style. Use `[interrupts Name]`, "
            "`[under]`, `[reaction]`, and `[pause Xs]` tags as documented."
        )

    print("=== AI Talk Radio: Script Generation ===\n")
    print(f"Style: {style}")
    print(f"Host: {host_name}")
    print(f"Duration: {duration} min")
    print(f"Read {len(research)} characters of research.")
    print("Generating script via Interactions API...\n")

    interaction = client.interactions.create(
        model="gemini-3.5-flash",
        input=f"Write the radio script based on this research:\n\n{research}",
        system_instruction=system_prompt,
    )

    script = interaction.steps[-1].content[0].text

    out_path = os.path.join(args.workspace, "data", "script.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(script)

    word_count = len(script.split())
    print(f"✅ Script saved to {out_path}")
    print(f"   Word count: {word_count}")
    print("\n--- Preview ---\n")
    print(script[:800])
    if len(script) > 800:
        print(f"\n... ({len(script) - 800} more characters)")


if __name__ == "__main__":
    main()

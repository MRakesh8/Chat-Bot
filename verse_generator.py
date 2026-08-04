import json
import os
import re
from openai import OpenAI

# Required Environment Variables:
# - GOOGLEAPI1: Google Gemini API Key
# - OPENROUTER_KEY: Primary OpenRouter API Key (sk-or-...)
# - OPENROUTER_KEY2: Optional Secondary OpenRouter API Key

GOOGLEAPI1 = os.environ.get("GOOGLEAPI1", "").strip()
OPENROUTER_KEY = os.environ.get("OPENROUTER_KEY", "").strip()
OPENROUTER_KEY2 = os.environ.get("OPENROUTER_KEY2", "").strip()


# --- 1a. Gemini primary ---

def _fetch_verse_gemini():
    """Try Google Gemini 2.5 Flash for verse generation."""
    if not GOOGLEAPI1:
        raise RuntimeError("GOOGLEAPI1 environment variable is not configured.")

    from google import genai as gai

    client = gai.Client(api_key=GOOGLEAPI1)
    system_prompt = _load_system_prompt()
    used_list = get_used_verses()
    user_prompt = (
        f"Avoid these verse_ids (already used): {used_list}\n\n"
        "Generate one new Bible verse package as raw JSON only, per the system instructions."
    )

    print("   [Phase 1] Trying Google Gemini 2.5 Flash …")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=f"{system_prompt}\n\n{user_prompt}",
    )
    content = response.text or ""

    match = re.search(r"\{.*\}", content, re.DOTALL)
    if not match:
        raise RuntimeError("Gemini returned no JSON object.")

    package = json.loads(match.group(0))
    ok, reason = _validate_package(package, used_list)
    if not ok:
        raise RuntimeError(f"Gemini package invalid: {reason}")

    save_used_verse(package["verse_id"])
    print(f"   [Phase 1] Gemini returned verse: {package['verse_id']}")
    return package


# --- 1b. OpenRouter fallback (Fully Working & Fixed) ---

def _fetch_verse_openrouter():
    api_keys = [k for k in [OPENROUTER_KEY, OPENROUTER_KEY2] if k]
    if not api_keys:
        raise RuntimeError("No OpenRouter API key configured in environment variables.")

    system_prompt = _load_system_prompt()
    used_list = get_used_verses()
    user_prompt = (
        f"Avoid these verse_ids (already used): {used_list}\n\n"
        "Generate one new Bible verse package as raw JSON only, per the system instructions."
    )

    models_to_try = [
        "nvidia/nemotron-3-nano-30b-a3b:free",
        "qwen/qwen3-next-80b-a3b-instruct:free",
        "z-ai/glm-4.5-air:free",
        "openai/gpt-oss-20b:free",
        "google/gemma-3n-e2b-it:free",
        "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    ]

    last_err = None
    for key in api_keys:
        # Added required headers for OpenRouter free models to work properly
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=key,
            timeout=50.0,
            default_headers={
                "HTTP-Referer": "https://localhost",  # Required by OpenRouter for free-tier requests
                "X-Title": "VerseBot",                # Required by OpenRouter for free-tier requests
            }
        )

        for model_id in models_to_try:
            try:
                print(f"   [Phase 1 fallback] trying OpenRouter model {model_id} …")
                response = client.chat.completions.create(
                    model=model_id,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user",   "content": user_prompt},
                    ],
                )
                content = response.choices[0].message.content or ""
                match = re.search(r"\{.*\}", content, re.DOTALL)
                if not match:
                    print(f"   model {model_id} returned no JSON, trying next…")
                    continue

                package = json.loads(match.group(0))
                ok, reason = _validate_package(package, used_list)
                if not ok:
                    print(f"   model {model_id} package invalid ({reason}), trying next…")
                    continue

                save_used_verse(package["verse_id"])
                print(f"   [Phase 1 fallback] OpenRouter model {model_id} succeeded!")
                return package
            except Exception as e:
                last_err = e
                print(f"   model {model_id} failed: {e}")

    raise RuntimeError(f"All OpenRouter models/keys exhausted. Last error: {last_err}")


def _phase1_fetch_verse():
    """Primary: Gemini 2.5 Flash. Fallback: OpenRouter Free Models."""
    try:
        return _fetch_verse_gemini()
    except Exception as e:
        print(f"   ⚠️  Gemini failed ({e}), falling back to OpenRouter…")
        return _fetch_verse_openrouter()

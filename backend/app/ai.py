import json
import os
from typing import Any

from openai import OpenAI

DEFAULT_AI_MODEL = "gpt-5.3-codex"


class AIConfigurationError(RuntimeError):
    pass


class AIResponseFormatError(RuntimeError):
    pass


def get_ai_model() -> str:
    return os.getenv("AI_MODEL", DEFAULT_AI_MODEL)


def get_openai_client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise AIConfigurationError("OPENAI_API_KEY is not configured")

    return OpenAI(api_key=api_key)


def run_connectivity_check(prompt: str = "2+2") -> dict[str, Any]:
    client = get_openai_client()
    model = get_ai_model()

    response = client.responses.create(
        model=model,
        input=[
            {
                "role": "system",
                "content": "You are a concise assistant. Reply with just the answer.",
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )

    answer = getattr(response, "output_text", "") or ""

    return {
        "model": model,
        "prompt": prompt,
        "answer": answer.strip(),
    }


def _structured_output_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "assistant_message": {"type": "string"},
            "board_update": {
                "anyOf": [
                    {
                        "type": "object",
                        "properties": {
                            "columns": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "title": {"type": "string"},
                                        "cardIds": {
                                            "type": "array",
                                            "items": {"type": "string"},
                                        },
                                    },
                                    "required": ["id", "title", "cardIds"],
                                    "additionalProperties": False,
                                },
                            },
                            "cards": {
                                "type": "object",
                                "additionalProperties": {
                                    "type": "object",
                                    "properties": {
                                        "id": {"type": "string"},
                                        "title": {"type": "string"},
                                        "details": {"type": "string"},
                                    },
                                    "required": ["id", "title", "details"],
                                    "additionalProperties": False,
                                },
                            },
                        },
                        "required": ["columns", "cards"],
                        "additionalProperties": False,
                    },
                    {
                        "type": "null",
                    },
                ]
            },
        },
        "required": ["assistant_message", "board_update"],
        "additionalProperties": False,
    }


def _parse_structured_json_output(output_text: str) -> dict[str, Any]:
    raw = output_text.strip()
    if not raw:
        raise AIResponseFormatError("AI returned empty structured output")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise AIResponseFormatError("AI returned invalid JSON structured output") from exc

    if not isinstance(parsed, dict):
        raise AIResponseFormatError("AI structured output must be a JSON object")

    return parsed


def run_kanban_assistant(
    board: dict[str, Any],
    user_message: str,
    conversation_history: list[dict[str, str]],
) -> dict[str, Any]:
    client = get_openai_client()
    model = get_ai_model()

    history_lines: list[str] = []
    for message in conversation_history:
        role = message.get("role", "user")
        content = message.get("content", "")
        history_lines.append(f"{role}: {content}")

    history_text = "\n".join(history_lines) if history_lines else "(none)"

    instruction = (
        "You are a project-management assistant for a Kanban board. "
        "Return only valid JSON with this shape: "
        "{\"assistant_message\": string, \"board_update\": BoardOrNull}. "
        "BoardOrNull must be either null or an object with keys \"columns\" and \"cards\" "
        "matching the incoming board shape. Do not include markdown fences or extra keys."
    )

    prompt = (
        f"Current board JSON:\n{json.dumps(board)}\n\n"
        f"Conversation history:\n{history_text}\n\n"
        f"User message:\n{user_message}"
    )

    response = client.responses.create(
        model=model,
        input=[
            {"role": "system", "content": instruction},
            {"role": "user", "content": prompt},
        ],
        temperature=0,
    )

    output_text = getattr(response, "output_text", "") or ""
    parsed = _parse_structured_json_output(output_text)
    parsed["model"] = model
    return parsed

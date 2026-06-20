"""Central configuration for Referral GPS.

Reads from environment (optionally a local .env file) so the backend can run in
two modes:

- LIVE mode:  OPENAI_API_KEY is set and USE_MOCK_LLM is not "true".
              Steps 1 & 4 call the OpenAI API.
- OFFLINE mode: no API key (or USE_MOCK_LLM=true). Steps 1 & 4 use deterministic
              local fallbacks so the full pipeline still works for demos and for
              frontend integration without any credentials.
"""
import os
from functools import lru_cache

try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    # python-dotenv is optional; environment variables still work without it.
    pass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    def __init__(self) -> None:
        self.openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
        self.openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
        self.extraction_temperature: float = float(
            os.getenv("EXTRACTION_TEMPERATURE", "0")
        )
        self.explanation_temperature: float = float(
            os.getenv("EXPLANATION_TEMPERATURE", "0.3")
        )

        explicit_mock = os.getenv("USE_MOCK_LLM")
        if explicit_mock is not None:
            self.use_mock_llm = _as_bool(explicit_mock)
        else:
            # Default: mock when there is no key to call a real model with.
            self.use_mock_llm = self.openai_api_key is None

        self.default_confidence_threshold: float = float(
            os.getenv("CONFIDENCE_THRESHOLD", "0.7")
        )

        # Resolve relative to this file so the backend works regardless of the
        # process working directory (e.g. launched from the repo root).
        _here = os.path.dirname(os.path.abspath(__file__))
        self.providers_path: str = os.getenv(
            "PROVIDERS_PATH", os.path.join(_here, "providers.json")
        )

        origins = os.getenv("CORS_ORIGINS", "*")
        self.cors_origins: list[str] = (
            ["*"] if origins.strip() == "*" else [o.strip() for o in origins.split(",")]
        )

    @property
    def llm_mode(self) -> str:
        return "offline" if self.use_mock_llm else "live"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()

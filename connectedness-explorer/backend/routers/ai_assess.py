from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import re

try:
    import anthropic
    _HAS_ANTHROPIC = True
except ImportError:
    _HAS_ANTHROPIC = False

router = APIRouter()

SYSTEM_PROMPT = """You are a macroeconomist evaluating a GFEVD-based connectedness analysis.
The user has selected 6 countries and run an Elastic-Net VAR(p) with Post-Selection OLS,
followed by a Generalized Forecast Error Variance Decomposition (Diebold & Yılmaz, 2014) at horizon H=10.

Evaluate the results along these dimensions:
1. Model Health: Is the VAR stable? Is the sparsity rate reasonable (typically 80-95% for macro data)? Is the effective sample size adequate?
2. TCI Interpretation: A TCI of ~40-55% is typical for macroeconomic GDP data. Flag if outside this range and explain why.
3. NET Structure: Do the transmitter/receiver roles make economic sense given the countries selected? For example, large open economies (US, China) typically transmit; small open economies typically receive.
4. Potential Issues: Flag any suspiciously low own-variance shares (<20%), extreme NET values, or other anomalies.
5. Overall Score: Rate the network quality from 1-10 with a brief justification. Output it as "Score: X/10" on its own line.

Keep the assessment concise (200-300 words), accessible to non-economists,
and in the same language the user is using. Use the actual numbers from the results."""


class AssessRequest(BaseModel):
    countries: list[str]
    tci: float
    net_rankings: list[dict]
    diagnostics: dict
    gfevd_matrix: dict


def _extract_score(text: str) -> float | None:
    m = re.search(r"[Ss]core[:\s]+(\d+(?:\.\d+)?)\s*/\s*10", text)
    if m:
        return float(m.group(1))
    return None


@router.post("/ai-assess")
async def ai_assess(body: AssessRequest):
    if not _HAS_ANTHROPIC:
        raise HTTPException(status_code=503, detail="Anthropic package not installed")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    diag = body.diagnostics
    own_variance = [
        body.gfevd_matrix["values"][i][i]
        for i in range(len(body.countries))
    ]

    user_content = f"""Countries: {', '.join(body.countries)}
Lag order p={diag.get('lag_order')}, Effective sample size={diag.get('effective_sample_size')}
Sparsity={diag.get('sparsity_pct')}%, Max eigenvalue modulus={diag.get('max_eigenvalue_modulus')}, Stable={diag.get('is_stable')}
TCI = {body.tci:.2f}%

NET transmitters/receivers (sorted by NET):
{chr(10).join(f"  {r['country']}: NET={r['net']:+.1f}, TO={r['to']:.1f}, FROM={r['from']:.1f}" for r in body.net_rankings)}

Own-variance shares (diagonal of GFEVD):
{chr(10).join(f"  {body.countries[i]}: {own_variance[i]:.1f}%" for i in range(len(body.countries)))}

Please evaluate these results."""

    try:
        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=600,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        text = message.content[0].text
        score = _extract_score(text)
        return {"assessment": text, "score": score}
    except anthropic.APIError as e:
        raise HTTPException(status_code=502, detail=f"Anthropic API error: {e}")

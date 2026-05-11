from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel, field_validator
import numpy as np

from ..engine.data_loader import get_growth_rates
from ..engine.var_model import fit_elastic_net_var, check_stability
from ..engine.gfevd import calculate_gfevd, compute_connectedness

router = APIRouter()


class AnalyzeRequest(BaseModel):
    countries: list[str]
    lag_order: int

    @field_validator("countries")
    @classmethod
    def must_be_six(cls, v):
        if len(v) != 6:
            raise ValueError("Exactly 6 countries required")
        return v

    @field_validator("lag_order")
    @classmethod
    def valid_lag(cls, v):
        if v < 1 or v > 4:
            raise ValueError("lag_order must be between 1 and 4")
        return v


@router.post("/analyze")
async def analyze(request: Request, body: AnalyzeRequest):
    gdp_data = request.app.state.gdp_data
    df = gdp_data["df"]
    available_names = {c["name"] for c in gdp_data["available_countries"]}

    for country in body.countries:
        if country not in available_names:
            raise HTTPException(status_code=422, detail=f"Country not available: {country}")
        if country not in df.columns:
            raise HTTPException(status_code=422, detail=f"Country data missing: {country}")

    p = body.lag_order
    N = 6
    H = 10

    # Get growth rates (log-differenced, aligned)
    try:
        Y, dates = get_growth_rates(df, body.countries)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Data processing error: {e}")

    effective_n = len(Y) - p
    if effective_n < 30:
        raise HTTPException(
            status_code=422,
            detail=f"Insufficient data: only {effective_n} usable observations after lagging (need ≥30). Try fewer countries or a smaller lag order.",
        )

    # Fit Elastic-Net VAR
    try:
        model = fit_elastic_net_var(Y, p)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"VAR estimation failed: {e}")

    A_mat = model["A_mat"]
    Sigma = model["Sigma"]
    active_counts = model["active_counts"]

    is_stable, max_eig = check_stability(A_mat, p, N)

    # Compute GFEVD
    D = calculate_gfevd(A_mat, Sigma, p, N, H=H)

    # Connectivity metrics
    metrics = compute_connectedness(D, body.countries)

    total_possible = N * N * p
    total_selected = int(active_counts.sum())
    sparsity_pct = round((1 - total_selected / total_possible) * 100, 1)

    edge_threshold = round(100.0 / N, 2)

    return {
        "success": True,
        "tci": round(metrics["TCI"], 2),
        "gfevd_matrix": {
            "rows": body.countries,
            "cols": body.countries,
            "values": [[round(float(D[i, j]), 1) for j in range(N)] for i in range(N)],
        },
        "net_rankings": metrics["rankings"],
        "diagnostics": {
            "effective_sample_size": effective_n,
            "lag_order": p,
            "params_per_equation": N * p,
            "total_params_selected": total_selected,
            "total_params_possible": total_possible,
            "sparsity_pct": sparsity_pct,
            "max_eigenvalue_modulus": round(max_eig, 3),
            "is_stable": is_stable,
        },
        "available_date_range": f"{dates[0]} - {dates[-1]}",
        "edge_threshold": edge_threshold,
    }


@router.get("/countries")
async def get_countries(request: Request):
    gdp_data = request.app.state.gdp_data
    return {"countries": gdp_data["available_countries"]}

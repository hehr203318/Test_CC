"""
Load and preprocess quarterly GDP data.
Computes log-differenced growth rates for use in the VAR.
"""
import pandas as pd
import numpy as np
import os

# Country metadata (IMF code → display info)
COUNTRY_META = {
    "United States":   {"code": "US", "region": "North America"},
    "China":           {"code": "CN", "region": "East Asia"},
    "Japan":           {"code": "JP", "region": "East Asia"},
    "Germany":         {"code": "DE", "region": "Europe"},
    "United Kingdom":  {"code": "GB", "region": "Europe"},
    "France":          {"code": "FR", "region": "Europe"},
    "India":           {"code": "IN", "region": "South Asia"},
    "South Korea":     {"code": "KR", "region": "East Asia"},
    "Italy":           {"code": "IT", "region": "Europe"},
    "Canada":          {"code": "CA", "region": "North America"},
    "Australia":       {"code": "AU", "region": "Oceania"},
    "Brazil":          {"code": "BR", "region": "Latin America"},
    "Spain":           {"code": "ES", "region": "Europe"},
    "Mexico":          {"code": "MX", "region": "Latin America"},
    "Netherlands":     {"code": "NL", "region": "Europe"},
    "Indonesia":       {"code": "ID", "region": "Southeast Asia"},
    "Singapore":       {"code": "SG", "region": "Southeast Asia"},
    "Thailand":        {"code": "TH", "region": "Southeast Asia"},
    "Malaysia":        {"code": "MY", "region": "Southeast Asia"},
    "Philippines":     {"code": "PH", "region": "Southeast Asia"},
    "New Zealand":     {"code": "NZ", "region": "Oceania"},
    "Hong Kong SAR":   {"code": "HK", "region": "East Asia"},
    "Sweden":          {"code": "SE", "region": "Europe"},
    "Norway":          {"code": "NO", "region": "Europe"},
    "Poland":          {"code": "PL", "region": "Europe"},
    "Austria":         {"code": "AT", "region": "Europe"},
    "Belgium":         {"code": "BE", "region": "Europe"},
    "Denmark":         {"code": "DK", "region": "Europe"},
    "Finland":         {"code": "FI", "region": "Europe"},
    "Ireland":         {"code": "IE", "region": "Europe"},
    "Switzerland":     {"code": "CH", "region": "Europe"},
    "South Africa":    {"code": "ZA", "region": "Africa"},
    "Argentina":       {"code": "AR", "region": "Latin America"},
    "Chile":           {"code": "CL", "region": "Latin America"},
    "Colombia":        {"code": "CO", "region": "Latin America"},
    "Turkey":          {"code": "TR", "region": "Europe/Asia"},
    "Israel":          {"code": "IL", "region": "Middle East"},
    "Saudi Arabia":    {"code": "SA", "region": "Middle East"},
    "Egypt":           {"code": "EG", "region": "Africa"},
    "Vietnam":         {"code": "VN", "region": "Southeast Asia"},
}


def load_gdp_data(csv_path: str) -> dict:
    """Load CSV and return metadata + raw DataFrame."""
    df = pd.read_csv(csv_path, index_col="Date")
    df.index = df.index.str.strip()

    # Build country list enriched with metadata
    available = []
    for col in df.columns:
        meta = COUNTRY_META.get(col, {"code": col[:2].upper(), "region": "Other"})
        available.append({
            "name": col,
            "code": meta["code"],
            "region": meta["region"],
        })

    return {
        "df": df,
        "available_countries": available,
    }


def get_growth_rates(df: pd.DataFrame, countries: list[str]) -> tuple[np.ndarray, list[str]]:
    """
    Compute log-differenced quarterly growth rates for selected countries.
    Returns aligned growth rate matrix (T x N) and the date labels (length T).
    """
    sub = df[countries].copy()
    sub = sub.dropna()  # inner join on non-missing

    # Log levels
    log_levels = np.log(sub.values.astype(float))
    # Quarter-on-quarter log differences
    growth = np.diff(log_levels, axis=0)
    dates = list(sub.index[1:])
    return growth, dates

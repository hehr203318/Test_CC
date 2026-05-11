"""
Download quarterly real GDP data from IMF IFS API for ~40 major economies.
Skips any country whose data is unavailable, too short (<60 quarters), or too sparse.
Saves result to data/quarterly_gdp.csv
"""
import requests
import pandas as pd
import numpy as np
import os
import time
import sys
from datetime import datetime

BASE_URL = "http://dataservices.imf.org/REST/SDMX_JSON.svc/CompactData/IFS"
MIN_QUARTERS = 60
MAX_MISSING_FRAC = 0.1  # allow up to 10% missing

COUNTRIES = [
    ("US", "United States", "North America"),
    ("CN", "China", "East Asia"),
    ("JP", "Japan", "East Asia"),
    ("DE", "Germany", "Europe"),
    ("GB", "United Kingdom", "Europe"),
    ("FR", "France", "Europe"),
    ("IN", "India", "South Asia"),
    ("KR", "South Korea", "East Asia"),
    ("IT", "Italy", "Europe"),
    ("CA", "Canada", "North America"),
    ("AU", "Australia", "Oceania"),
    ("BR", "Brazil", "Latin America"),
    ("ES", "Spain", "Europe"),
    ("MX", "Mexico", "Latin America"),
    ("NL", "Netherlands", "Europe"),
    ("ID", "Indonesia", "Southeast Asia"),
    ("SG", "Singapore", "Southeast Asia"),
    ("TH", "Thailand", "Southeast Asia"),
    ("MY", "Malaysia", "Southeast Asia"),
    ("PH", "Philippines", "Southeast Asia"),
    ("NZ", "New Zealand", "Oceania"),
    ("HK", "Hong Kong SAR", "East Asia"),
    ("SE", "Sweden", "Europe"),
    ("NO", "Norway", "Europe"),
    ("PL", "Poland", "Europe"),
    ("AT", "Austria", "Europe"),
    ("BE", "Belgium", "Europe"),
    ("DK", "Denmark", "Europe"),
    ("FI", "Finland", "Europe"),
    ("IE", "Ireland", "Europe"),
    ("CH", "Switzerland", "Europe"),
    ("ZA", "South Africa", "Africa"),
    ("AR", "Argentina", "Latin America"),
    ("CL", "Chile", "Latin America"),
    ("CO", "Colombia", "Latin America"),
    ("TR", "Turkey", "Europe/Asia"),
    ("IL", "Israel", "Middle East"),
    ("SA", "Saudi Arabia", "Middle East"),
    ("EG", "Egypt", "Africa"),
    ("VN", "Vietnam", "Southeast Asia"),
]

# Indicator codes to try in order (prefer seasonally adjusted)
INDICATOR_CODES = [
    "NGDP_R_SA_XDC",   # Real GDP, Seasonally Adjusted, Domestic Currency
    "NGDP_R_XDC",      # Real GDP, Domestic Currency (not SA)
    "NGDP_SA_XDC_R",   # Alternative naming
]


def parse_imf_date(period_str):
    """Convert IMF period string '2000-Q1' to '2000 Q1'."""
    return period_str.replace("-", " ")


def fetch_series(imf_code, indicator):
    url = f"{BASE_URL}/Q.{imf_code}.{indicator}"
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code != 200:
            return None
        data = resp.json()
    except Exception:
        return None

    try:
        series = data["CompactData"]["DataSet"]["Series"]
        if series is None:
            return None
        obs = series.get("Obs")
        if obs is None:
            return None
        # Obs can be a single dict or a list
        if isinstance(obs, dict):
            obs = [obs]
        if not obs:
            return None
        records = {}
        for ob in obs:
            period = ob.get("@TIME_PERIOD", "")
            value = ob.get("@OBS_VALUE")
            if period and value is not None:
                try:
                    records[parse_imf_date(period)] = float(value)
                except (ValueError, TypeError):
                    pass
        if not records:
            return None
        return pd.Series(records, name="value")
    except (KeyError, TypeError, AttributeError):
        return None


def download_country(imf_code, display_name):
    for indicator in INDICATOR_CODES:
        series = fetch_series(imf_code, indicator)
        if series is not None and len(series) >= MIN_QUARTERS:
            missing_frac = series.isna().mean()
            if missing_frac <= MAX_MISSING_FRAC:
                series = series.dropna()
                print(f"  OK  {display_name} ({imf_code}) — {indicator}, {len(series)} quarters")
                return series
            else:
                print(f"  SKIP {display_name} ({imf_code}) — {indicator}: too many missing ({missing_frac:.0%})")
        elif series is not None:
            print(f"  SKIP {display_name} ({imf_code}) — {indicator}: too short ({len(series)} quarters < {MIN_QUARTERS})")
        time.sleep(0.4)  # be polite to the API
    return None


def main():
    print(f"Downloading GDP data from IMF IFS API — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    results = {}
    skipped = []

    for imf_code, display_name, _region in COUNTRIES:
        series = download_country(imf_code, display_name)
        if series is not None:
            results[display_name] = series
        else:
            print(f"  SKIP {display_name} ({imf_code}) — no usable data found")
            skipped.append(display_name)
        time.sleep(0.2)

    if not results:
        print("\nERROR: No countries downloaded. Exiting.")
        sys.exit(1)

    # Align on common dates (inner join)
    df = pd.DataFrame(results)
    # Drop rows where all values are NaN
    df = df.dropna(how="all")
    # Sort by date
    df = df.sort_index()
    # Keep only rows with valid quarter format "YYYY QN"
    valid_mask = df.index.str.match(r"^\d{4} Q[1-4]$")
    df = df[valid_mask]

    out_path = os.path.join(os.path.dirname(__file__), "..", "data", "quarterly_gdp.csv")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df.index.name = "Date"
    df.to_csv(out_path)

    print(f"\n{'='*60}")
    print(f"成功下载 {len(results)} 个国家，跳过 {len(skipped)} 个国家")
    print(f"时间范围: {df.index[0]} — {df.index[-1]}")
    print(f"数据保存至: {os.path.abspath(out_path)}")
    if skipped:
        print(f"跳过: {', '.join(skipped)}")


if __name__ == "__main__":
    main()

"""
Download quarterly real GDP data for ~40 major economies.

Source priority per country:
  1. DBnomics → OECD/QNA  (OECD members, SA real GDP)
  2. DBnomics → IMF/IFS   (non-OECD and OECD fallback)
  3. OECD stats.oecd.org  (direct SDMX-JSON, kept as final fallback)

DBnomics (https://db.nomics.world) is a free aggregator that mirrors OECD,
IMF, World Bank and 80+ other providers — no API key required.

Saves result to  data/quarterly_gdp.csv
"""
import json
import os
import sys
import time
from datetime import datetime

import pandas as pd
import requests

MIN_QUARTERS = 60
MAX_MISSING_FRAC = 0.10

# ── Country list ──────────────────────────────────────────────────────────────
# (iso2, display_name, iso3_oecd, region)
# iso3_oecd=None means non-OECD member (skip OECD dataset, go straight to IMF)
COUNTRIES = [
    ("US", "United States",   "USA", "North America"),
    ("JP", "Japan",           "JPN", "East Asia"),
    ("DE", "Germany",         "DEU", "Europe"),
    ("GB", "United Kingdom",  "GBR", "Europe"),
    ("FR", "France",          "FRA", "Europe"),
    ("KR", "South Korea",     "KOR", "East Asia"),
    ("IT", "Italy",           "ITA", "Europe"),
    ("CA", "Canada",          "CAN", "North America"),
    ("AU", "Australia",       "AUS", "Oceania"),
    ("ES", "Spain",           "ESP", "Europe"),
    ("MX", "Mexico",          "MEX", "Latin America"),
    ("NL", "Netherlands",     "NLD", "Europe"),
    ("NZ", "New Zealand",     "NZL", "Oceania"),
    ("SE", "Sweden",          "SWE", "Europe"),
    ("NO", "Norway",          "NOR", "Europe"),
    ("PL", "Poland",          "POL", "Europe"),
    ("AT", "Austria",         "AUT", "Europe"),
    ("BE", "Belgium",         "BEL", "Europe"),
    ("DK", "Denmark",         "DNK", "Europe"),
    ("FI", "Finland",         "FIN", "Europe"),
    ("IE", "Ireland",         "IRL", "Europe"),
    ("CH", "Switzerland",     "CHE", "Europe"),
    ("CL", "Chile",           "CHL", "Latin America"),
    ("CO", "Colombia",        "COL", "Latin America"),
    ("TR", "Turkey",          "TUR", "Europe/Asia"),
    ("IL", "Israel",          "ISR", "Middle East"),
    # Non-OECD — IMF/IFS via DBnomics
    ("CN", "China",           None, "East Asia"),
    ("IN", "India",           None, "South Asia"),
    ("BR", "Brazil",          None, "Latin America"),
    ("ID", "Indonesia",       None, "Southeast Asia"),
    ("SG", "Singapore",       None, "Southeast Asia"),
    ("TH", "Thailand",        None, "Southeast Asia"),
    ("MY", "Malaysia",        None, "Southeast Asia"),
    ("PH", "Philippines",     None, "Southeast Asia"),
    ("HK", "Hong Kong SAR",   None, "East Asia"),
    ("ZA", "South Africa",    None, "Africa"),
    ("AR", "Argentina",       None, "Latin America"),
    ("SA", "Saudi Arabia",    None, "Middle East"),
    ("EG", "Egypt",           None, "Africa"),
    ("VN", "Vietnam",         None, "Southeast Asia"),
]

# ── DBnomics endpoints ────────────────────────────────────────────────────────
DBNOMICS_BASE = "https://api.db.nomics.world/v22/series"

# OECD QNA: seasonally adjusted real GDP volume index, quarterly
DBNOMICS_OECD = DBNOMICS_BASE + "/OECD/QNA/{iso3}.B1_GE.VOBARSA.Q?observations=1"

# IMF IFS: real GDP, domestic currency — try multiple indicator codes
IMF_INDICATORS = ["NGDP_R_SA_XDC", "NGDP_R_XDC", "NGDP_SA_XDC_R"]
DBNOMICS_IMF = DBNOMICS_BASE + "/IMF/IFS/Q.{iso2}.{ind}?observations=1"

# ── OECD direct fallback (stats.oecd.org) ────────────────────────────────────
OECD_DIRECT = (
    "https://stats.oecd.org/sdmx-json/data/QNA"
    "/{iso3}.B1_GE.VOBARSA.Q/all?startTime=2000-Q1&endTime=2024-Q4"
)


# ─────────────────────────────────────────────────────────────────────────────
# Helper: parse DBnomics observations response
# ─────────────────────────────────────────────────────────────────────────────

def _parse_dbnomics(data, verbose=False):
    """Extract a pd.Series from a DBnomics ?observations=1 response."""
    docs = data.get("series", {}).get("docs", [])
    if not docs:
        if verbose:
            print(f"    DBnomics: no docs. Keys: {list(data.keys())}")
        return None
    doc = docs[0]
    periods = doc.get("period", [])
    values = doc.get("value", [])
    if not periods:
        if verbose:
            print(f"    DBnomics: empty period list. Doc keys: {list(doc.keys())}")
        return None
    records = {}
    for p, v in zip(periods, values):
        if v is not None:
            records[str(p).replace("-", " ")] = float(v)
    if not records:
        if verbose:
            print(f"    DBnomics: 0 non-null values from {len(periods)} periods")
        return None
    return pd.Series(records, name="value")


def _get_json(url, verbose=False, label=""):
    if verbose:
        print(f"    GET {url}")
    try:
        resp = requests.get(url, timeout=45)
        if verbose:
            print(f"    HTTP {resp.status_code}  ({label})")
        if resp.status_code != 200:
            if verbose:
                print(f"    Body: {resp.text[:300]}")
            return None
        return resp.json()
    except Exception as exc:
        if verbose:
            print(f"    Exception: {exc}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Fetchers
# ─────────────────────────────────────────────────────────────────────────────

def fetch_dbnomics_oecd(iso3, verbose=False):
    url = DBNOMICS_OECD.format(iso3=iso3)
    data = _get_json(url, verbose, label="DBnomics/OECD")
    if data is None:
        return None
    return _parse_dbnomics(data, verbose)


def fetch_dbnomics_imf(iso2, indicator, verbose=False):
    url = DBNOMICS_IMF.format(iso2=iso2, ind=indicator)
    data = _get_json(url, verbose, label=f"DBnomics/IMF/{indicator}")
    if data is None:
        return None
    return _parse_dbnomics(data, verbose)


def fetch_oecd_direct(iso3, verbose=False):
    """Direct OECD SDMX-JSON fallback — print full response on failure."""
    url = OECD_DIRECT.format(iso3=iso3)
    data = _get_json(url, verbose, label="OECD-direct")
    if data is None:
        return None

    if verbose:
        top_keys = list(data.keys())
        print(f"    OECD-direct top-level keys: {top_keys}")
        print(f"    Snippet: {json.dumps(data)[:600]}")

    # Try standard SDMX-JSON layout
    datasets = data.get("dataSets") or data.get("data", {}).get("dataSets")
    if not datasets:
        if verbose:
            print("    No dataSets found in OECD-direct response")
        return None

    obs = datasets[0].get("observations", {})
    if not obs:
        return None

    try:
        dims = data["structure"]["dimensions"]["observation"]
        time_dim = next(d for d in dims if d["id"] == "TIME_PERIOD")
        periods = [v["id"] for v in time_dim["values"]]
    except Exception as exc:
        if verbose:
            print(f"    Structure parse error: {exc}")
        return None

    records = {}
    for key, vals in obs.items():
        t_idx = int(key.split(":")[-1])
        val = vals[0]
        if val is not None and t_idx < len(periods):
            records[periods[t_idx].replace("-", " ")] = float(val)

    if not records:
        return None
    if verbose:
        print(f"    OECD-direct: {len(records)} quarters")
    return pd.Series(records, name="value")


# ─────────────────────────────────────────────────────────────────────────────
# Quality gate
# ─────────────────────────────────────────────────────────────────────────────

def _accept(series, name, source):
    if series is None:
        return None
    n = len(series)
    if n < MIN_QUARTERS:
        print(f"    too short via {source}: {n} quarters (need {MIN_QUARTERS})")
        return None
    miss = series.isna().mean()
    if miss > MAX_MISSING_FRAC:
        print(f"    too sparse via {source}: {miss:.0%} missing")
        return None
    return series.dropna()


# ─────────────────────────────────────────────────────────────────────────────
# Per-country logic
# ─────────────────────────────────────────────────────────────────────────────

def download_country(iso2, name, iso3, verbose=False):
    # 1. DBnomics → OECD/QNA (OECD members only)
    if iso3 is not None:
        if verbose:
            print(f"  [1] DBnomics OECD/QNA ({iso3})…")
        raw = fetch_dbnomics_oecd(iso3, verbose)
        s = _accept(raw, name, "DBnomics/OECD")
        if s is not None:
            print(f"  OK  {name} — DBnomics OECD QNA, {len(s)} quarters")
            return s
        time.sleep(0.4)

    # 2. DBnomics → IMF/IFS
    for ind in IMF_INDICATORS:
        if verbose:
            print(f"  [2] DBnomics IMF/IFS ({iso2}.{ind})…")
        raw = fetch_dbnomics_imf(iso2, ind, verbose)
        s = _accept(raw, name, f"DBnomics/IMF/{ind}")
        if s is not None:
            print(f"  OK  {name} — DBnomics IMF {ind}, {len(s)} quarters")
            return s
        time.sleep(0.4)

    # 3. OECD direct SDMX (OECD members only)
    if iso3 is not None:
        if verbose:
            print(f"  [3] OECD direct SDMX ({iso3})…")
        raw = fetch_oecd_direct(iso3, verbose)
        s = _accept(raw, name, "OECD-direct")
        if s is not None:
            print(f"  OK  {name} — OECD direct, {len(s)} quarters")
            return s
        time.sleep(0.4)

    return None


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    test_mode = "--test" in sys.argv   # only first 2 countries

    print(f"Downloading quarterly GDP — {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")

    countries = COUNTRIES[:2] if test_mode else COUNTRIES

    results, skipped = {}, []

    for iso2, name, iso3, _region in countries:
        print(f"\n{name} ({iso2}):")
        s = download_country(iso2, name, iso3, verbose=verbose)
        if s is not None:
            results[name] = s
        else:
            print(f"  SKIP — no usable data found")
            skipped.append(name)
        time.sleep(0.25)

    if not results:
        print("\nERROR: No countries downloaded.")
        sys.exit(1)

    df = pd.DataFrame(results)
    df = df.dropna(how="all").sort_index()
    df = df[df.index.str.match(r"^\d{4} Q[1-4]$")]

    out = os.path.join(os.path.dirname(__file__), "..", "data", "quarterly_gdp.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    df.index.name = "Date"
    df.to_csv(out)

    print(f"\n{'='*60}")
    print(f"Downloaded {len(results)} countries, skipped {len(skipped)}")
    print(f"Date range: {df.index[0]} — {df.index[-1]}")
    print(f"Saved to: {os.path.abspath(out)}")
    if skipped:
        print(f"Skipped: {', '.join(skipped)}")


if __name__ == "__main__":
    main()

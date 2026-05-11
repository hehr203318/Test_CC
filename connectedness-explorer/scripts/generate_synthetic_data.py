"""
Generate synthetic quarterly GDP data for development/testing.
Uses a factor model to produce realistic cross-country correlations:
  GDP_growth[i,t] = lambda_i * global_factor[t] + mu_i * regional_factor[i,t] + epsilon[i,t]

Run this if you cannot reach the IMF API.
Real data can be fetched later with download_gdp_data.py.
"""
import numpy as np
import pandas as pd
import os

np.random.seed(42)

COUNTRIES = [
    ("United States",  "North America",    1.0,  0.5,  0.008),
    ("China",          "East Asia",        0.7,  0.6,  0.015),
    ("Japan",          "East Asia",        0.9,  0.5,  0.006),
    ("Germany",        "Europe",           0.85, 0.55, 0.007),
    ("United Kingdom", "Europe",           0.85, 0.5,  0.007),
    ("France",         "Europe",           0.8,  0.55, 0.007),
    ("India",          "South Asia",       0.6,  0.55, 0.014),
    ("South Korea",    "East Asia",        0.8,  0.6,  0.010),
    ("Italy",          "Europe",           0.75, 0.5,  0.008),
    ("Canada",         "North America",    0.9,  0.5,  0.008),
    ("Australia",      "Oceania",          0.75, 0.45, 0.008),
    ("Brazil",         "Latin America",    0.6,  0.5,  0.012),
    ("Spain",          "Europe",           0.8,  0.5,  0.009),
    ("Mexico",         "Latin America",    0.7,  0.5,  0.010),
    ("Netherlands",    "Europe",           0.85, 0.55, 0.007),
    ("Indonesia",      "Southeast Asia",   0.55, 0.55, 0.012),
    ("Singapore",      "Southeast Asia",   0.8,  0.6,  0.012),
    ("Thailand",       "Southeast Asia",   0.65, 0.55, 0.010),
    ("Malaysia",       "Southeast Asia",   0.7,  0.55, 0.010),
    ("Philippines",    "Southeast Asia",   0.6,  0.5,  0.012),
    ("New Zealand",    "Oceania",          0.75, 0.45, 0.008),
    ("Hong Kong SAR",  "East Asia",        0.8,  0.6,  0.012),
    ("Sweden",         "Europe",           0.85, 0.5,  0.007),
    ("Norway",         "Europe",           0.7,  0.5,  0.008),
    ("Poland",         "Europe",           0.7,  0.5,  0.009),
    ("Austria",        "Europe",           0.8,  0.55, 0.007),
    ("Belgium",        "Europe",           0.8,  0.55, 0.007),
    ("Denmark",        "Europe",           0.8,  0.5,  0.007),
    ("Finland",        "Europe",           0.8,  0.5,  0.008),
    ("Ireland",        "Europe",           0.7,  0.5,  0.012),
    ("Switzerland",    "Europe",           0.75, 0.5,  0.006),
    ("South Africa",   "Africa",           0.5,  0.45, 0.010),
    ("Argentina",      "Latin America",    0.4,  0.45, 0.018),
    ("Chile",          "Latin America",    0.55, 0.5,  0.011),
    ("Colombia",       "Latin America",    0.5,  0.5,  0.011),
    ("Turkey",         "Europe/Asia",      0.5,  0.45, 0.014),
    ("Israel",         "Middle East",      0.65, 0.45, 0.009),
    ("Saudi Arabia",   "Middle East",      0.5,  0.45, 0.010),
    ("Egypt",          "Africa",           0.4,  0.4,  0.012),
    ("Vietnam",        "Southeast Asia",   0.5,  0.5,  0.016),
]

REGIONS = list({c[1] for c in COUNTRIES})
T = 96  # 2000 Q1 to 2023 Q4

# Global factor (persistent AR(1))
global_factor = np.zeros(T)
global_factor[0] = 0
for t in range(1, T):
    global_factor[t] = 0.6 * global_factor[t - 1] + np.random.normal(0, 0.003)

# 2008-09 GFC shock
global_factor[34:38] -= 0.012
# 2020 COVID shock
global_factor[80:82] -= 0.04
global_factor[82:84] += 0.03

# Regional factors
region_factors = {}
for reg in REGIONS:
    rf = np.zeros(T)
    rf[0] = 0
    for t in range(1, T):
        rf[t] = 0.4 * rf[t - 1] + np.random.normal(0, 0.002)
    region_factors[reg] = rf

# Generate growth rates for each country
growth_rates = {}
for name, region, glo_load, reg_load, idio_sd in COUNTRIES:
    glo = glo_load * global_factor
    reg = reg_load * region_factors[region]
    idio = np.random.normal(0, idio_sd, T)
    # Add drift (mean growth)
    drift = 0.006 if region in ("East Asia", "Southeast Asia", "South Asia") else 0.003
    gr = drift + glo + reg + idio
    growth_rates[name] = gr

# Convert growth rates back to GDP index levels (start at 100)
gdp_levels = {}
for name, gr in growth_rates.items():
    levels = np.zeros(T + 1)
    levels[0] = 100.0
    for t in range(T):
        levels[t + 1] = levels[t] * np.exp(gr[t])
    gdp_levels[name] = levels[1:]  # drop t=0

# Build date index
dates = []
for year in range(2000, 2024):
    for q in range(1, 5):
        dates.append(f"{year} Q{q}")
dates = dates[:T]

df = pd.DataFrame(gdp_levels, index=dates)
df.index.name = "Date"

out_path = os.path.join(os.path.dirname(__file__), "..", "data", "quarterly_gdp.csv")
os.makedirs(os.path.dirname(out_path), exist_ok=True)
df.to_csv(out_path)

print(f"Synthetic GDP data saved to {os.path.abspath(out_path)}")
print(f"Countries: {len(df.columns)}, Quarters: {len(df)}")
print(f"Date range: {df.index[0]} — {df.index[-1]}")

# Macroeconomic Connectedness Explorer

An interactive tool for measuring and visualizing shock spillovers across 36 major economies, built on the Diebold–Yılmaz (2014) Generalized Forecast Error Variance Decomposition (GFEVD) framework.

Developed as part of an Economics Honors Thesis at Boston College (2026).

---

## What it does

1. **Select 6 countries** from a panel of 36 economies with quarterly real GDP data (2000–2024).
2. **Run Elastic-Net VAR(p)** — a penalized vector autoregression that performs automatic variable selection, followed by post-selection OLS to remove shrinkage bias.
3. **Compute GFEVD** — the share of country *i*'s *H*-step forecast error variance explained by a shock to country *j*, forming a connectedness matrix.
4. **Explore results** via an interactive table and a force-directed network graph with shock propagation animation.

---

## Methodology

### Elastic-Net VAR
- Each equation in the VAR is estimated separately via `ElasticNetCV` (sklearn) with `l1_ratio = 0.5` (equivalent to `alpha = 0.5` in R's glmnet), balancing LASSO and ridge penalties.
- Features are standardized before penalization; non-zero selected variables are then re-estimated by unconstrained OLS to remove shrinkage bias.
- Lag order *p* is chosen by the user (1–4); default is *p* = 4.

### GFEVD (Diebold–Yılmaz 2014)
- Uses generalized (non-orthogonalized) impulse responses, so results are invariant to variable ordering.
- Forecast horizon *H* = 10 quarters.
- Raw variance shares are row-normalized to sum to 100%.

### Connectedness measures
| Measure | Definition |
|---------|-----------|
| **FROM**_i | Share of *i*'s variance explained by shocks from all other countries |
| **TO**_j | Total spillover *j* sends to all other countries |
| **NET**_j | TO_j − FROM_j (positive = net transmitter) |
| **TCI** | Total Connectedness Index = mean(FROM) |

### Network visualization
- Nodes colored **green** (net transmitters, NET > 5%) or **red** (net receivers, NET < −5%).
- Edge width proportional to GFEVD spillover intensity.
- Clicking a node simulates a GDP shock: pulses propagate up to 9 hops, with stronger connections sustaining more hops and brighter pulses.

---

## Data

Quarterly real GDP data sourced from:
- **OECD Quarterly National Accounts** (seasonally adjusted volume index, `B1_GE.VOBARSA.Q`) — for 26 OECD member countries
- **IMF International Financial Statistics** (`NGDP_R_SA_XDC`) — for 10 additional economies

Both accessed via the [DBnomics](https://db.nomics.world) open data API. Data covers approximately 2000 Q1 – 2024 Q4 depending on country availability.

---

## Running locally

**Backend** (FastAPI + uvicorn):
```bash
cd connectedness-explorer
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

**Frontend** (React + Vite):
```bash
cd connectedness-explorer/frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | React, Vite, Tailwind CSS, D3.js |
| Backend | FastAPI, uvicorn |
| Econometrics | NumPy, SciPy, scikit-learn, pandas |
| Deployment | Docker, Render.com |
| Data | DBnomics (OECD QNA + IMF IFS) |

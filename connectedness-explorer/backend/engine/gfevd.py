"""
Generalized Forecast Error Variance Decomposition (GFEVD).
Implements Diebold & Yilmaz (2014), equations mirroring the R reference.
"""
import numpy as np


def compute_impulse_responses(A_mat: np.ndarray, p: int, N: int, H: int) -> np.ndarray:
    """
    Compute VMA impulse response matrices Phi_0, ..., Phi_{H-1}.
    Phi_0 = I_N
    Phi_h = sum_{k=1}^{p} A_k * Phi_{h-k}  for h >= 1
    Returns array of shape (H, N, N).
    """
    Phi = np.zeros((H, N, N))
    Phi[0] = np.eye(N)

    A_list = [A_mat[:, k * N : (k + 1) * N] for k in range(p)]

    for h in range(1, H):
        tmp = np.zeros((N, N))
        for k in range(p):
            lag = h - k - 1
            if lag >= 0:
                tmp += A_list[k] @ Phi[lag]
        Phi[h] = tmp

    return Phi


def calculate_gfevd(A_mat: np.ndarray, Sigma: np.ndarray, p: int, N: int, H: int = 10) -> np.ndarray:
    """
    Compute generalized FEVD matrix D (N x N), row-normalized to sum to 100.

    D[i, j] = fraction (%) of H-step forecast error variance of country i
              explained by shocks from country j.

    Formula (Diebold-Yilmaz 2014):
        d_tilde[i,j] = sigma_jj^{-1} * sum_{h=0}^{H-1} (e_i' Phi_h Sigma e_j)^2
                       / sum_{h=0}^{H-1} (e_i' Phi_h Sigma Phi_h' e_i)
        D[i,j] = d_tilde[i,j] / sum_j d_tilde[i,j] * 100
    """
    Phi = compute_impulse_responses(A_mat, p, N, H)
    sigma_diag = np.diag(Sigma)

    # Precompute Phi[h] @ Sigma for each h to avoid redundant matmul
    PhiSigma = [Phi[h] @ Sigma for h in range(H)]

    # Denominator: sum_h e_i' Phi_h Sigma Phi_h' e_i = sum_h (Phi_h Sigma Phi_h')[i,i]
    denom = np.zeros(N)
    for h in range(H):
        PS = PhiSigma[h]
        PtP = PS @ Phi[h].T  # N x N
        denom += np.diag(PtP)

    # Numerator: sigma_jj^{-1} * sum_h (e_i' Phi_h Sigma e_j)^2
    # = sigma_jj^{-1} * sum_h (PhiSigma[h][i, j])^2
    D_raw = np.zeros((N, N))
    for j in range(N):
        if sigma_diag[j] < 1e-16:
            continue
        col_sq_sum = np.zeros(N)
        for h in range(H):
            col_sq_sum += PhiSigma[h][:, j] ** 2  # shape (N,)
        D_raw[:, j] = col_sq_sum / sigma_diag[j]

    # Divide each row by denom
    for i in range(N):
        if denom[i] > 1e-16:
            D_raw[i, :] /= denom[i]
        else:
            D_raw[i, :] = 0.0

    # Row normalize to 100
    row_sums = D_raw.sum(axis=1)
    row_sums[row_sums < 1e-16] = 1.0
    D_norm = D_raw / row_sums[:, np.newaxis] * 100.0

    return D_norm


def compute_connectedness(D: np.ndarray, country_names: list[str]) -> dict:
    """
    Compute FROM, TO, NET per country and TCI from normalized GFEVD matrix.

    D[i,j] = % of country i's FEV explained by country j.
    FROM_i = sum_{j!=i} D[i,j]   (how much i receives from others)
    TO_j   = sum_{i!=j} D[i,j]   (how much j transmits to others)
    NET_j  = TO_j - FROM_j
    TCI    = mean(FROM) = sum_{i!=j} D[i,j] / N
    """
    N = len(country_names)
    eye_mask = ~np.eye(N, dtype=bool)

    FROM = D[eye_mask].reshape(N, N - 1).sum(axis=1)
    TO = D.T[eye_mask].reshape(N, N - 1).sum(axis=1)
    NET = TO - FROM
    TCI = float(FROM.mean())

    rankings = sorted(
        [
            {
                "country": country_names[j],
                "net": round(float(NET[j]), 2),
                "to": round(float(TO[j]), 2),
                "from": round(float(FROM[j]), 2),
            }
            for j in range(N)
        ],
        key=lambda x: x["net"],
        reverse=True,
    )

    return {
        "FROM": FROM,
        "TO": TO,
        "NET": NET,
        "TCI": TCI,
        "rankings": rankings,
    }

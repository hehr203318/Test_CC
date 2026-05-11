"""
Elastic-Net VAR(p) with Post-Selection OLS.
Mirrors the R glmnet implementation: l1_ratio=0.5 (alpha=0.5 in R).
"""
import numpy as np
from numpy.linalg import lstsq
from sklearn.linear_model import ElasticNetCV
from sklearn.preprocessing import StandardScaler


def build_lag_matrix(Y: np.ndarray, p: int) -> tuple[np.ndarray, np.ndarray]:
    """
    Build companion-form lag matrix from Y (T x N).
    Returns:
      Y_target: (T-p) x N — current period values
      X_lags:   (T-p) x (N*p) — stacked lagged values [Y_{t-1}, ..., Y_{t-p}]
    """
    T, N = Y.shape
    Y_target = Y[p:]
    X_lags = np.zeros((T - p, N * p))
    for lag in range(1, p + 1):
        X_lags[:, (lag - 1) * N : lag * N] = Y[p - lag : T - lag]
    return Y_target, X_lags


def fit_elastic_net_var(Y: np.ndarray, p: int, l1_ratio: float = 0.5, cv_folds: int = 5) -> dict:
    """
    Fit elastic-net VAR(p) with post-selection OLS.

    Args:
        Y: (T x N) matrix of log-differenced growth rates
        p: lag order
        l1_ratio: elastic-net mixing parameter (0=Ridge, 1=Lasso); 0.5 matches R glmnet alpha=0.5
        cv_folds: cross-validation folds for lambda selection

    Returns dict with:
        A_mat: (N x N*p) VAR coefficient matrix
        Sigma: (N x N) residual covariance matrix
        intercepts: (N,) vector
        residuals: (T-p x N) residual matrix
        active_counts: (N,) number of selected predictors per equation
    """
    T, N = Y.shape
    Y_target, X_lags = build_lag_matrix(Y, p)
    n_obs, n_pred = X_lags.shape

    A_mat = np.zeros((N, N * p))
    intercepts = np.zeros(N)
    residuals = np.zeros((n_obs, N))
    active_counts = np.zeros(N, dtype=int)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X_lags)

    for i in range(N):
        y_i = Y_target[:, i]

        cv_model = ElasticNetCV(
            l1_ratio=l1_ratio,
            cv=cv_folds,
            fit_intercept=True,
            max_iter=10000,
            n_jobs=-1,
            random_state=42,
        )
        cv_model.fit(X_scaled, y_i)

        # Active predictors are identified in standardized space
        # but we do OLS in original space — standardization doesn't change sparsity pattern
        active_idx = np.where(cv_model.coef_ != 0)[0]
        active_counts[i] = len(active_idx)

        if len(active_idx) > 0:
            X_sel = X_lags[:, active_idx]
            X_aug = np.column_stack([np.ones(n_obs), X_sel])
            coef, _, _, _ = lstsq(X_aug, y_i, rcond=None)
            intercepts[i] = coef[0]
            A_mat[i, active_idx] = coef[1:]
            residuals[:, i] = y_i - X_sel @ coef[1:] - coef[0]
        else:
            intercepts[i] = np.mean(y_i)
            residuals[:, i] = y_i - np.mean(y_i)

    Sigma = np.cov(residuals.T) if N > 1 else np.array([[np.var(residuals[:, 0], ddof=1)]])

    return {
        "A_mat": A_mat,
        "Sigma": Sigma,
        "intercepts": intercepts,
        "residuals": residuals,
        "active_counts": active_counts,
    }


def companion_matrix(A_mat: np.ndarray, p: int, N: int) -> np.ndarray:
    """Build (N*p x N*p) companion matrix for VAR stability check."""
    C = np.zeros((N * p, N * p))
    C[:N, :] = A_mat
    if p > 1:
        C[N:, : N * (p - 1)] = np.eye(N * (p - 1))
    return C


def check_stability(A_mat: np.ndarray, p: int, N: int) -> tuple[bool, float]:
    """
    Return (is_stable, max_eigenvalue_modulus).
    Stable iff max modulus < 1.
    """
    C = companion_matrix(A_mat, p, N)
    eigvals = np.linalg.eigvals(C)
    max_mod = float(np.max(np.abs(eigvals)))
    return max_mod < 1.0, max_mod

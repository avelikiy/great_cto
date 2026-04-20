//! Risk overlay — decides whether to forward a leader signal to the executor.
//!
//! DELIBERATE PROBLEM: zero tests. `qa-engineer` should report 0% coverage
//! on this critical path and file a P1 issue.

/// Returns true if the signal should be allowed through to execution.
///
/// Heuristic: size must be positive, symbol must be in the whitelist.
pub fn should_allow(symbol: &str, size: f64) -> bool {
    if size <= 0.0 {
        return false;
    }
    const WHITELIST: &[&str] = &["BTCUSDT", "ETHUSDT"];
    WHITELIST.contains(&symbol)
}

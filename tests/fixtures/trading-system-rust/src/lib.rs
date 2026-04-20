//! Minimal copy-trading bot — fixture only.
//!
//! Deliberately missing:
//! - kill-switch (no `trading_halted` flag, no circuit breaker)
//! - ADR for position sizing
//! - tests for `risk::should_allow`

pub mod executor;
pub mod risk;

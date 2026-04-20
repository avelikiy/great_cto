//! Position executor. Deliberately unsafe for the fixture.

use anyhow::Result;

pub struct Order {
    pub symbol: String,
    pub size: f64,
}

/// Submit an order to a broker.
///
/// DELIBERATE PROBLEM: `.unwrap()` on the broker call panics on any error,
/// crashing the whole engine mid-position. `project-auditor` / `code review`
/// should flag this as a P1 `trading panic on broker failure` issue.
pub async fn place_order(order: Order) -> Result<String> {
    let client = reqwest::Client::new();
    // BUG: unwrap on network call
    let response = client
        .post("https://broker.example/api/orders")
        .json(&serde_json::json!({ "sym": order.symbol, "sz": order.size }))
        .send()
        .await
        .unwrap();
    let body = response.text().await?;
    Ok(body)
}

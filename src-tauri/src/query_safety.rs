use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StatementSafety {
    ReadOnly,
    Mutating,
    Ambiguous,
    Empty,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatementClassification {
    pub safety: StatementSafety,
    pub reason: String,
}

pub fn classify_sql(_sql: &str) -> StatementClassification {
    StatementClassification {
        safety: StatementSafety::ReadOnly,
        reason: "stub".to_string(),
    }
}

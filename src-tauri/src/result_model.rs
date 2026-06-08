use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultSet {
    pub columns: Vec<ResultColumn>,
    pub rows: Vec<Vec<Value>>,
    pub metadata: ResultMetadata,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultColumn {
    pub name: String,
    pub value_type: ValueType,
    pub database_type: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValueType {
    Null,
    Boolean,
    Integer,
    Float,
    Decimal,
    Text,
    DateTime,
    Json,
    Binary,
    Vector,
    DatabaseSpecific,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "camelCase")]
pub enum Value {
    Null,
    Boolean(bool),
    Integer(i64),
    Float(f64),
    Decimal(String),
    Text(String),
    DateTime(String),
    Json(serde_json::Value),
    Binary(Vec<u8>),
    Vector(Vec<f32>),
    DatabaseSpecific(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResultMetadata {
    pub row_count: usize,
    pub elapsed_ms: Option<u128>,
    pub operation_id: Option<String>,
    pub notice: Option<String>,
}

use serde::{Deserialize, Serialize};

/// Response from a raw Redis command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RedisResponse {
    Nil,
    Status { value: String },
    Integer { value: i64 },
    BulkString { value: String },
    Array { value: Vec<RedisResponse> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RedisKeyType {
    String,
    Hash,
    List,
    Set,
    ZSet,
    Stream,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HashField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ZSetEntry {
    pub member: String,
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamEntry {
    pub id: String,
    pub fields: Vec<HashField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RedisKeyValue {
    StringVal { value: String },
    HashVal { fields: Vec<HashField> },
    ListVal { items: Vec<String> },
    SetVal { members: Vec<String> },
    ZSetVal { entries: Vec<ZSetEntry> },
    StreamVal { entries: Vec<StreamEntry> },
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyInfo {
    pub key: String,
    pub key_type: RedisKeyType,
    pub ttl: Option<i64>,
    pub value: RedisKeyValue,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisScanResult {
    pub keys: Vec<String>,
    pub next_cursor: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_response_nil_serde() {
        let v = RedisResponse::Nil;
        let json = serde_json::to_string(&v).unwrap();
        assert_eq!(json, r#"{"type":"nil"}"#);
        let back: RedisResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, RedisResponse::Nil));
    }

    #[test]
    fn redis_response_status_serde() {
        let v = RedisResponse::Status { value: "OK".into() };
        let json = serde_json::to_string(&v).unwrap();
        assert!(json.contains("\"type\":\"status\""));
        assert!(json.contains("\"value\":\"OK\""));
    }

    #[test]
    fn redis_response_array_serde() {
        let v = RedisResponse::Array {
            value: vec![
                RedisResponse::Integer { value: 1 },
                RedisResponse::BulkString { value: "hello".into() },
            ],
        };
        let json = serde_json::to_string(&v).unwrap();
        let back: RedisResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(back, RedisResponse::Array { .. }));
    }

    #[test]
    fn redis_key_info_serde() {
        let info = RedisKeyInfo {
            key: "user:1".into(),
            key_type: RedisKeyType::Hash,
            ttl: Some(3600),
            value: RedisKeyValue::HashVal {
                fields: vec![HashField { name: "name".into(), value: "Alice".into() }],
            },
        };
        let json = serde_json::to_string(&info).unwrap();
        let back: RedisKeyInfo = serde_json::from_str(&json).unwrap();
        assert_eq!(back.key, "user:1");
        assert!(matches!(back.key_type, RedisKeyType::Hash));
    }
}

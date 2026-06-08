use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AppErrorCategory {
    ConnectionFailed,
    AuthenticationFailed,
    MissingSecret,
    QueryError,
    PermissionDenied,
    UnsupportedCapability,
    Cancelled,
    Timeout,
    ProviderError,
    DimensionMismatch,
    SerializationError,
    InternalError,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub category: AppErrorCategory,
    pub message: String,
    pub recovery_hint: Option<String>,
    pub technical_details: Option<String>,
    pub operation_id: Option<String>,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl AppError {
    pub fn unsupported(message: impl Into<String>) -> Self {
        Self {
            category: AppErrorCategory::UnsupportedCapability,
            message: message.into(),
            recovery_hint: None,
            technical_details: None,
            operation_id: None,
        }
    }
}

#[derive(Debug, Error)]
pub enum AppRuntimeError {
    #[error("{0}")]
    User(AppError),
}

impl Serialize for AppRuntimeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            AppRuntimeError::User(error) => error.serialize(serializer),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{AppError, AppErrorCategory};

    #[test]
    fn serializes_error_category_in_camel_case() {
        let error = AppError {
            category: AppErrorCategory::MissingSecret,
            message: "OpenAI API key is required.".to_string(),
            recovery_hint: Some("Enter an API key or choose a remembered key.".to_string()),
            technical_details: None,
            operation_id: None,
        };

        let value = serde_json::to_value(error).expect("serialize error");
        assert_eq!(value["category"], "missingSecret");
    }
}

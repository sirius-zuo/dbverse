use serde::{Deserialize, Serialize};

use crate::errors::{AppError, AppErrorCategory, AppRuntimeError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingProviderProfile {
    pub id: String,
    pub display_name: String,
    pub provider: EmbeddingProviderKind,
    pub model: String,
    pub secret_ref: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EmbeddingProviderKind {
    Openai,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmbeddingResponse {
    pub vector: Vec<f32>,
    pub model: String,
    pub dimensions: usize,
}

pub fn validate_embedding_profile(profile: &EmbeddingProviderProfile) -> Result<(), AppRuntimeError> {
    if profile.display_name.trim().is_empty() || profile.model.trim().is_empty() {
        return Err(AppRuntimeError::User(AppError {
            category: AppErrorCategory::ProviderError,
            message: "Embedding provider profile is incomplete.".to_string(),
            recovery_hint: Some("Enter a display name and model.".to_string()),
            technical_details: None,
            operation_id: None,
        }));
    }

    Ok(())
}

pub async fn embed_with_openai_compatible(
    base_url: String,
    api_key: String,
    model: String,
    input: String,
) -> Result<EmbeddingResponse, AppRuntimeError> {
    #[derive(Serialize)]
    struct RequestBody {
        model: String,
        input: String,
    }

    #[derive(Deserialize)]
    struct ResponseBody {
        data: Vec<ResponseData>,
        model: String,
    }

    #[derive(Deserialize)]
    struct ResponseData {
        embedding: Vec<f32>,
    }

    let url = format!("{}/embeddings", base_url.trim_end_matches('/'));
    let mut request = reqwest::Client::new()
        .post(&url)
        .json(&RequestBody { model, input });

    if !api_key.is_empty() {
        request = request.bearer_auth(api_key);
    }

    let response = request
        .send()
        .await
        .map_err(|error| AppRuntimeError::User(AppError {
            category: AppErrorCategory::ProviderError,
            message: "Embedding request failed.".to_string(),
            recovery_hint: Some("Check your network connection and the base URL.".to_string()),
            technical_details: Some(error.to_string()),
            operation_id: None,
        }))?;

    if !response.status().is_success() {
        return Err(AppRuntimeError::User(AppError {
            category: AppErrorCategory::ProviderError,
            message: "Embedding provider rejected the request.".to_string(),
            recovery_hint: Some("Check the base URL, API key, and model name.".to_string()),
            technical_details: Some(response.status().to_string()),
            operation_id: None,
        }));
    }

    let body = response.json::<ResponseBody>().await.map_err(|error| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::SerializationError,
            message: "Embedding response could not be parsed.".to_string(),
            recovery_hint: None,
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })?;

    let vector = body.data.into_iter().next().map(|item| item.embedding).unwrap_or_default();
    Ok(EmbeddingResponse {
        dimensions: vector.len(),
        vector,
        model: body.model,
    })
}

#[cfg(test)]
mod tests {
    use super::{validate_embedding_profile, EmbeddingProviderKind, EmbeddingProviderProfile};

    #[test]
    fn rejects_missing_model() {
        let profile = EmbeddingProviderProfile {
            id: "openai".to_string(),
            display_name: "OpenAI".to_string(),
            provider: EmbeddingProviderKind::Openai,
            model: "".to_string(),
            secret_ref: None,
        };

        assert!(validate_embedding_profile(&profile).is_err());
    }

    #[test]
    fn rejects_empty_display_name() {
        let profile = EmbeddingProviderProfile {
            id: "openai".to_string(),
            display_name: "".to_string(),
            provider: EmbeddingProviderKind::Openai,
            model: "text-embedding-3-small".to_string(),
            secret_ref: None,
        };

        assert!(validate_embedding_profile(&profile).is_err());
    }

    #[test]
    fn accepts_valid_profile() {
        let profile = EmbeddingProviderProfile {
            id: "openai".to_string(),
            display_name: "OpenAI".to_string(),
            provider: EmbeddingProviderKind::Openai,
            model: "text-embedding-3-small".to_string(),
            secret_ref: Some("OPENAI_KEY".to_string()),
        };

        assert!(validate_embedding_profile(&profile).is_ok());
    }
}

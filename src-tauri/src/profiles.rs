use crate::domain::{ConnectionConfig, ConnectionProfile, DatabaseKind};
use crate::errors::{AppError, AppErrorCategory, AppRuntimeError};
use std::fs;
use std::path::Path;

pub fn validate_profile(profile: &ConnectionProfile) -> Result<(), AppRuntimeError> {
    match (&profile.kind, &profile.config) {
        (DatabaseKind::Sqlite, ConnectionConfig::Sqlite { path })
            if !path.trim().is_empty() =>
        {
            Ok(())
        }
        (DatabaseKind::Postgresql, ConnectionConfig::Postgresql {
            host, port, database, username, ..
        }) if !host.trim().is_empty()
            && *port > 0
            && !database.trim().is_empty()
            && !username.trim().is_empty() =>
        {
            Ok(())
        }
        (DatabaseKind::Lancedb, ConnectionConfig::Lancedb { path })
            if !path.trim().is_empty() =>
        {
            Ok(())
        }
        _ => Err(AppRuntimeError::User(AppError {
            category: AppErrorCategory::QueryError,
            message: "Connection profile is incomplete or does not match its database kind."
                .to_string(),
            recovery_hint: Some("Check required connection fields and try again.".to_string()),
            technical_details: None,
            operation_id: None,
        })),
    }
}

pub fn load_profiles(path: &Path) -> Result<Vec<ConnectionProfile>, AppRuntimeError> {
    if !path.exists() {
        return Ok(vec![]);
    }

    let raw = fs::read_to_string(path).map_err(|error| AppRuntimeError::User(AppError {
        category: AppErrorCategory::InternalError,
        message: "Could not read connection profiles.".to_string(),
        recovery_hint: None,
        technical_details: Some(error.to_string()),
        operation_id: None,
    }))?;

    serde_json::from_str::<Vec<ConnectionProfile>>(&raw).map_err(|error| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::SerializationError,
            message: "Connection profiles are not valid JSON.".to_string(),
            recovery_hint: Some("Restore or remove the profile catalog file.".to_string()),
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })
}

pub fn save_profiles(
    path: &Path,
    profiles: &[ConnectionProfile],
) -> Result<(), AppRuntimeError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AppRuntimeError::User(AppError {
            category: AppErrorCategory::InternalError,
            message: "Could not create app data directory.".to_string(),
            recovery_hint: None,
            technical_details: Some(error.to_string()),
            operation_id: None,
        }))?;
    }

    let raw = serde_json::to_string_pretty(profiles).map_err(|error| {
        AppRuntimeError::User(AppError {
            category: AppErrorCategory::SerializationError,
            message: "Could not serialize connection profiles.".to_string(),
            recovery_hint: None,
            technical_details: Some(error.to_string()),
            operation_id: None,
        })
    })?;

    fs::write(path, raw).map_err(|error| AppRuntimeError::User(AppError {
        category: AppErrorCategory::InternalError,
        message: "Could not save connection profiles.".to_string(),
        recovery_hint: None,
        technical_details: Some(error.to_string()),
        operation_id: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::PostgresSslMode;
    use uuid::Uuid;

    #[test]
    fn accepts_valid_postgres_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local Postgres".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "localhost".to_string(),
                port: 5432,
                database: "app".to_string(),
                username: "dbverse".to_string(),
                ssl_mode: PostgresSslMode::Prefer,
            },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(validate_profile(&profile).is_ok());
    }

    #[test]
    fn rejects_mismatched_profile_kind() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Wrong".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Lancedb {
                path: "/tmp/lancedb".to_string(),
            },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(validate_profile(&profile).is_err());
    }

    #[test]
    fn accepts_valid_sqlite_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local SQLite".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite {
                path: "/tmp/notes.db".to_string(),
            },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(validate_profile(&profile).is_ok());
    }

    #[test]
    fn rejects_sqlite_with_empty_path() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Bad SQLite".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite { path: "".to_string() },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(validate_profile(&profile).is_err());
    }

    #[test]
    fn rejects_empty_postgres_host() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "No host".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "".to_string(),
                port: 5432,
                database: "app".to_string(),
                username: "dbverse".to_string(),
                ssl_mode: PostgresSslMode::Prefer,
            },
            secret_refs: vec![],
            last_used_at: None,
        };
        assert!(validate_profile(&profile).is_err());
    }

    #[test]
    fn loads_empty_catalog_when_file_missing() {
        let tmp = Path::new("/tmp/.dbverse_test_missing.json");
        let profiles = load_profiles(tmp);
        assert!(profiles.is_ok());
        assert!(profiles.unwrap().is_empty());
    }

    #[test]
    fn saves_and_loads_profile_roundtrip() {
        let tmp = Path::new("/tmp/.dbverse_test_roundtrip.json");
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "RoundTrip".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite {
                path: "/tmp/rt.db".to_string(),
            },
            secret_refs: vec![],
            last_used_at: None,
        };
        let profiles = vec![profile.clone()];
        save_profiles(tmp, &profiles).expect("save should succeed");
        let loaded = load_profiles(tmp).expect("load should succeed");
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, profile.id);
        assert_eq!(loaded[0].display_name, "RoundTrip");
        std::fs::remove_file(tmp).ok();
    }
}

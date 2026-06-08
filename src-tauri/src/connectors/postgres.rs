use crate::domain::{ConnectionConfig, ConnectionProfile, PostgresSslMode};

pub fn build_connection_string(profile: &ConnectionProfile, password: Option<&str>) -> Option<String> {
    let ConnectionConfig::Postgresql {
        host,
        port,
        database,
        username,
        ssl_mode,
    } = &profile.config
    else {
        return None;
    };

    let sslmode = match ssl_mode {
        PostgresSslMode::Disable => "disable",
        PostgresSslMode::Prefer => "prefer",
        PostgresSslMode::Require => "require",
    };

    let mut parts = vec![
        format!("host={host}"),
        format!("port={port}"),
        format!("dbname={database}"),
        format!("user={username}"),
        format!("sslmode={sslmode}"),
    ];

    if let Some(password) = password {
        parts.push(format!("password={password}"));
    }

    Some(parts.join(" "))
}

#[cfg(test)]
mod tests {
    use super::build_connection_string;
    use crate::domain::{ConnectionConfig, ConnectionProfile, DatabaseKind, PostgresSslMode};
    use uuid::Uuid;

    #[test]
    fn builds_connection_string_without_password_in_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "localhost".to_string(),
                port: 5432,
                database: "postgres".to_string(),
                username: "postgres".to_string(),
                ssl_mode: PostgresSslMode::Prefer,
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        let conn = build_connection_string(&profile, Some("secret")).expect("conn string");
        assert!(conn.contains("host=localhost"));
        assert!(conn.contains("password=secret"));
    }

    #[test]
    fn returns_none_for_non_postgres_profile() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "SQLite".to_string(),
            kind: DatabaseKind::Sqlite,
            config: ConnectionConfig::Sqlite {
                path: "/tmp/test.db".to_string(),
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        assert!(build_connection_string(&profile, None).is_none());
    }

    #[test]
    fn omits_password_when_none() {
        let profile = ConnectionProfile {
            id: Uuid::new_v4(),
            display_name: "Local".to_string(),
            kind: DatabaseKind::Postgresql,
            config: ConnectionConfig::Postgresql {
                host: "localhost".to_string(),
                port: 5432,
                database: "app".to_string(),
                username: "dbverse".to_string(),
                ssl_mode: PostgresSslMode::Disable,
            },
            secret_refs: vec![],
            last_used_at: None,
        };

        let conn = build_connection_string(&profile, None).expect("conn string");
        assert!(conn.contains("sslmode=disable"));
        assert!(!conn.contains("password"));
    }
}

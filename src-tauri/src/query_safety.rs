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

pub fn classify_sql(sql: &str) -> StatementClassification {
    let trimmed = sql.trim();
    if trimmed.is_empty() {
        return StatementClassification {
            safety: StatementSafety::Empty,
            reason: "No SQL was provided.".to_string(),
        };
    }

    let statement_count = trimmed
        .split(';')
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .count();

    if statement_count > 1 {
        return StatementClassification {
            safety: StatementSafety::Ambiguous,
            reason: "Multiple statements require confirmation before execution.".to_string(),
        };
    }

    let first_word = trimmed
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();

    let mutating = matches!(
        first_word.as_str(),
        "insert"
            | "update"
            | "delete"
            | "create"
            | "alter"
            | "drop"
            | "truncate"
            | "grant"
            | "revoke"
            | "vacuum"
            | "replace"
            | "merge"
            | "copy"
            | "call"
    );

    if mutating {
        StatementClassification {
            safety: StatementSafety::Mutating,
            reason: format!("Statements starting with `{first_word}` may modify the database."),
        }
    } else if matches!(first_word.as_str(), "select" | "with" | "explain" | "show" | "pragma") {
        StatementClassification {
            safety: StatementSafety::ReadOnly,
            reason: "The statement appears to be read-only.".to_string(),
        }
    } else {
        StatementClassification {
            safety: StatementSafety::Ambiguous,
            reason: format!("Statements starting with `{first_word}` need confirmation."),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_sql, StatementSafety};

    #[test]
    fn classifies_select_as_read_only() {
        let result = classify_sql("select * from users");
        assert_eq!(result.safety, StatementSafety::ReadOnly);
    }

    #[test]
    fn classifies_insert_as_mutating() {
        let result = classify_sql("insert into users(id) values (1)");
        assert_eq!(result.safety, StatementSafety::Mutating);
    }

    #[test]
    fn classifies_multi_statement_as_ambiguous() {
        let result = classify_sql("select * from users; delete from users;");
        assert_eq!(result.safety, StatementSafety::Ambiguous);
    }

    #[test]
    fn classifies_blank_sql_as_empty() {
        let result = classify_sql("  \n  ");
        assert_eq!(result.safety, StatementSafety::Empty);
    }
}

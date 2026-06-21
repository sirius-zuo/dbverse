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

pub fn classify_cypher(cypher: &str) -> StatementClassification {
    let trimmed = cypher.trim();
    if trimmed.is_empty() {
        return StatementClassification {
            safety: StatementSafety::Empty,
            reason: "No Cypher was provided.".to_string(),
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
        "create" | "merge" | "delete" | "detach" | "set" | "remove" | "drop" | "call"
    );

    if mutating {
        StatementClassification {
            safety: StatementSafety::Mutating,
            reason: format!("Statements starting with `{first_word}` may modify the database."),
        }
    } else if matches!(first_word.as_str(), "match" | "return" | "with" | "unwind" | "show") {
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
    use super::{classify_cypher, classify_sql, StatementSafety};

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

    #[test]
    fn classifies_match_as_read_only() {
        let result = classify_cypher("MATCH (n:Person) RETURN n");
        assert_eq!(result.safety, StatementSafety::ReadOnly);
    }

    #[test]
    fn classifies_return_unwind_with_show_as_read_only() {
        for cypher in ["RETURN 1", "UNWIND [1,2] AS x RETURN x", "WITH 1 AS x RETURN x", "SHOW DATABASES"] {
            let result = classify_cypher(cypher);
            assert_eq!(result.safety, StatementSafety::ReadOnly, "expected read-only for: {cypher}");
        }
    }

    #[test]
    fn classifies_create_as_mutating() {
        let result = classify_cypher("CREATE (n:Person {name: 'Alice'})");
        assert_eq!(result.safety, StatementSafety::Mutating);
    }

    #[test]
    fn classifies_merge_delete_detach_set_remove_drop_call_as_mutating() {
        for cypher in [
            "MERGE (n:Person {id: 1})",
            "DELETE n",
            "DETACH DELETE n",
            "SET n.name = 'x'",
            "REMOVE n.name",
            "DROP INDEX foo",
            "CALL db.labels()",
        ] {
            let result = classify_cypher(cypher);
            assert_eq!(result.safety, StatementSafety::Mutating, "expected mutating for: {cypher}");
        }
    }

    #[test]
    fn classifies_multi_statement_cypher_as_ambiguous() {
        let result = classify_cypher("MATCH (n) RETURN n; MATCH (m) RETURN m;");
        assert_eq!(result.safety, StatementSafety::Ambiguous);
    }

    #[test]
    fn classifies_blank_cypher_as_empty() {
        let result = classify_cypher("   \n  ");
        assert_eq!(result.safety, StatementSafety::Empty);
    }

    #[test]
    fn classifies_unknown_leading_keyword_as_ambiguous() {
        let result = classify_cypher("EXPLAIN MATCH (n) RETURN n");
        assert_eq!(result.safety, StatementSafety::Ambiguous);
    }
}

use arrow_array::{Array, RecordBatch};
use futures::TryStreamExt;
use lancedb::query::{ExecutableQuery, QueryBase};
use serde::{Deserialize, Serialize};

use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanceSearchRequest {
    pub path: String,
    pub table: String,
    pub vector_field: String,
    pub vector: Vec<f32>,
    pub top_k: usize,
}

pub async fn search_lancedb(
    request: LanceSearchRequest,
) -> Result<ResultSet, lancedb::Error> {
    let db = lancedb::connect(&request.path).execute().await?;
    let table = db
        .open_table(&request.table)
        .execute()
        .await?;
    let batches = table
        .query()
        .nearest_to(request.vector.as_slice())?
        .limit(request.top_k)
        .execute()
        .await?
        .try_collect::<Vec<RecordBatch>>()
        .await?;

    Ok(record_batches_to_result_set(
        batches,
        Some(format!(
            "Searched `{}` using vector field `{}`.",
            request.table, request.vector_field
        )),
    ))
}

fn record_batches_to_result_set(
    batches: Vec<RecordBatch>,
    notice: Option<String>,
) -> ResultSet {
    let columns = batches
        .first()
        .map(|batch| {
            batch
                .schema()
                .fields()
                .iter()
                .map(|field| ResultColumn {
                    name: field.name().to_string(),
                    value_type: ValueType::DatabaseSpecific,
                    database_type: Some(field.data_type().to_string()),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let rows = batches
        .iter()
        .flat_map(|batch| {
            (0..batch.num_rows()).map(|row_index| {
                batch
                    .columns()
                    .iter()
                    .map(|array| {
                        arrow_value_to_result_value(array.as_ref(), row_index)
                    })
                    .collect::<Vec<_>>()
            })
        })
        .collect::<Vec<_>>();

    let row_count = rows.len();

    ResultSet {
        columns,
        rows,
        metadata: ResultMetadata {
            row_count,
            elapsed_ms: None,
            operation_id: None,
            notice,
        },
    }
}

fn arrow_value_to_result_value(array: &dyn Array, row_index: usize) -> Value {
    if array.is_null(row_index) {
        return Value::Null;
    }

    Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
}

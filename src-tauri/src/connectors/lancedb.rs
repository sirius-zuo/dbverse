use arrow_array::{Array, BooleanArray, FixedSizeListArray, Float32Array, Float64Array, Int32Array, Int64Array, RecordBatch, StringArray, UInt32Array, UInt64Array};
use arrow_schema::DataType;
use futures::TryStreamExt;
use lancedb::query::{ExecutableQuery, QueryBase};
use serde::{Deserialize, Serialize};

use crate::result_model::{ResultColumn, ResultMetadata, ResultSet, Value, ValueType};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanceDbDatasetInfo {
    pub name: String,
    pub column_names: Vec<String>,
    pub column_types: Vec<String>,
    pub row_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanceDbQueryRequest {
    pub path: String,
    pub table: String,
    pub offset: usize,
    pub limit: usize,
    pub sort_column: Option<String>,
    pub sort_direction: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanceSearchRequest {
    pub path: String,
    pub table: String,
    pub vector_field: String,
    pub vector: Vec<f32>,
    pub top_k: usize,
}

/// List all dataset names in a LanceDB database.
pub async fn list_lancedb_datasets(path: &str) -> Result<Vec<String>, lancedb::Error> {
    let db = lancedb::connect(path).execute().await?;
    let mut names = db.table_names().execute().await?;
    names.sort();
    Ok(names)
}

/// Query a LanceDB dataset with pagination.
pub async fn query_lancedb_dataset(
    request: LanceDbQueryRequest,
) -> Result<(LanceDbDatasetInfo, ResultSet), lancedb::Error> {
    let db = lancedb::connect(&request.path).execute().await?;
    let table = db.open_table(&request.table).execute().await?;

    // Get schema info
    let schema = table.schema().await?;
    let column_names: Vec<String> = schema.fields().iter().map(|f| f.name().to_string()).collect();
    let column_types: Vec<String> = schema
        .fields()
        .iter()
        .map(|f| f.data_type().to_string())
        .collect();

    // Fetch all data (lancedb 0.30 doesn't support server-side offset efficiently)
    let query = table.query();
    let batches: Vec<RecordBatch> = query
        .limit(request.limit)
        .execute()
        .await?
        .try_collect()
        .await?;

    let total_rows: usize = batches.iter().map(|b| b.num_rows()).sum();

    // Apply client-side offset by slicing
    let offset_batches = slice_batches(batches, request.offset, request.limit);
    let displayed_rows = offset_batches.iter().map(|b| b.num_rows()).sum::<usize>();

    let result_set = record_batches_to_result_set(
        offset_batches,
        Some(format!(
            "Queried dataset `{}`. Showing rows {}-{} of {}.",
            request.table,
            request.offset.saturating_add(1),
            (request.offset + displayed_rows).min(total_rows),
            total_rows
        )),
    );

    let dataset_info = LanceDbDatasetInfo {
        name: request.table.clone(),
        column_names,
        column_types,
        row_count: total_rows,
    };

    Ok((dataset_info, result_set))
}

/// Slice record batches starting from `offset` up to `max_rows`.
fn slice_batches(batches: Vec<RecordBatch>, offset: usize, max_rows: usize) -> Vec<RecordBatch> {
    let mut remaining = max_rows;
    let mut result = Vec::new();
    let mut skip = offset;

    for batch in batches {
        if skip >= batch.num_rows() {
            skip -= batch.num_rows();
            continue;
        }
        let start = skip;
        let take = remaining.min(batch.num_rows() - start);
        result.push(batch.slice(start, take));
        remaining -= take;
        if remaining <= 0 {
            break;
        }
        skip = 0;
    }

    result
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

    match array.data_type() {
        DataType::LargeUtf8 | DataType::Utf8 => {
            if let Some(str_arr) = array.as_any().downcast_ref::<StringArray>() {
                return Value::Text(str_arr.value(row_index).to_string());
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::Float32 => {
            if let Some(arr) = array.as_any().downcast_ref::<Float32Array>() {
                return Value::Float(arr.value(row_index) as f64);
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::Float64 => {
            if let Some(arr) = array.as_any().downcast_ref::<Float64Array>() {
                return Value::Float(arr.value(row_index));
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::Int32 => {
            if let Some(arr) = array.as_any().downcast_ref::<Int32Array>() {
                return Value::Integer(arr.value(row_index) as i64);
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::Int64 => {
            if let Some(arr) = array.as_any().downcast_ref::<Int64Array>() {
                return Value::Integer(arr.value(row_index));
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::UInt32 => {
            if let Some(arr) = array.as_any().downcast_ref::<UInt32Array>() {
                return Value::Integer(arr.value(row_index) as i64);
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::UInt64 => {
            if let Some(arr) = array.as_any().downcast_ref::<UInt64Array>() {
                return Value::Integer(arr.value(row_index) as i64);
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::Boolean => {
            if let Some(arr) = array.as_any().downcast_ref::<BooleanArray>() {
                return Value::Boolean(arr.value(row_index));
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::FixedSizeList(_, _) => {
            if let Some(list_arr) = array.as_any().downcast_ref::<FixedSizeListArray>() {
                let inner = list_arr.value(row_index);
                if let Some(float_arr) = inner.as_any().downcast_ref::<Float32Array>() {
                    return Value::Vector(float_arr.values().to_vec());
                }
            }
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        DataType::LargeList(_) => {
            Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1)))
        }
        _ => Value::DatabaseSpecific(format!("{:?}", array.slice(row_index, 1))),
    }
}

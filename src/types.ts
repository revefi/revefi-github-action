// Description: This file contains the typescript types for the application.

// The abstract object to represent a code change.
// This could correspond to a pull request, a commit, etc.
export class CodeChangeInfo {
  modifiedFiles: { [filePath: string]: ModifiedFile } = {};
}

// The modified file object.
export class ModifiedFile {
  filePath!: string;
  diff!: string;
  baseContent?: string;
  headContent?: string;
}

export class DbtModelInfo {
  models: { [filePath: string]: DbtModel } = {};
}

export class DbtModel {
  filePath!: string;
  fullTableName!: FullTableName;
}

export class FullTableName {
  databaseName!: string;
  schemaName!: string;
  tableName!: string;
}

export class RevefiTableDetails {
  artifactId!: number;
  artifact!: FullTableName;
  insertedRowCount!: number;
  totalRowCount!: number;
  mostRecentUpdateTimestamp!: number;
  loadDurationSeconds!: number;
  totalBytesProcessed!: number;
  downstreamObjectCount!: number;
}

export class SchemaChangeReport {
  reportItems: ReportItem[] = [];
}

export class ReportItem {
  filename!: string;
  fullTableName!: FullTableName;
  changeDescription!: string;
  revefiTableDetails!: RevefiTableDetails;
  revefiLink!: string;
}

export class SchemaChange {
  filename!: string;
  fullTableName!: FullTableName;
  changeDescription!: string;
}

export class RevefiSchemaReviewRequest {
  dataSourceId!: number;
  codeChangeInfo!: CodeChangeInfo;
  additionalContext!: string;
}

export class RevefiSchemaReviewResponse {
  schemaChanges: SchemaChange[] = [];
}
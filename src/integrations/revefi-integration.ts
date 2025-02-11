import * as core from '@actions/core';
import {
  CodeChangeInfo,
  FullTableName,
  RevefiSchemaReviewRequest,
  RevefiSchemaReviewResponse,
  RevefiTableDetails,
  SchemaChange,
  SchemaChangeReport
} from '../types';

export class RevefiIntegration {
private readonly apiUrl:string;
private readonly apiToken:string;
private readonly dataSourceId:number;

  constructor(apiUrl: string, apiToken: string, dataSourceId: number ) {
    this.apiUrl = apiUrl;
    this.apiToken = apiToken;
    this.dataSourceId = dataSourceId;
  }

  // Function to check if the Revefi API is connected.
  public async isConnected() {
    const url = `${this.apiUrl}/ping`;
    core.debug(`Sending GET request to: ${url}`);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'X-Source-Application': 'github-action',
        'cache': 'no-store',
      }
    });
    if (!response.ok) {
      core.warning(`Failed to connect to Revefi API: ${response.status} ${response.statusText}`);
      return false;
    }
    core.info('Connected to Revefi API');
    return true;
  }

  // Function to get the schema change report for a given code change info.
  public async getSchemaChangeReport(codeChangeInfo: CodeChangeInfo, additionalContext: string) {
    const schemaChanges = await this.getSchemaChanges(codeChangeInfo, additionalContext)
    if (schemaChanges.length === 0) {
      return new SchemaChangeReport();
    }
    return await this.buildSchemaChangeReport(schemaChanges);
  }

  // Function to get the details of a table from the revefi API
  public async getRevefiTableDetails(fullTableName: FullTableName): Promise<RevefiTableDetails> {
    const tableDetailsUrl = `${this.apiUrl}/table-details?`
        + `dataSourceId=${this.dataSourceId}`
        + `&databaseName=${fullTableName.databaseName}`
        + `&schemaName=${fullTableName.schemaName}`
        + `&tableName=${fullTableName.tableName}`;
    core.debug(`Sending GET request to: ${tableDetailsUrl}`);
    const response = await fetch(tableDetailsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'X-Source-Application': 'github-action',
        'cache': 'no-store',
      }
    });
    if (!response.ok) {
      throw new Error('Failed to get table details from revefi API'
          + ` (${response.status} ${response.statusText})`);
    }
    const data: any = await response.json();
    if (!data || !data.tableDetails) {
      throw new Error(`Failed to get table details from revefi API: ${JSON.stringify(data)}`);
    }
    core.debug(`Table details: ${JSON.stringify(data, null, 2)}`);
    return {
      artifactId: data.tableDetails.artifactId,
      artifact: data.tableDetails.artifact,
      insertedRowCount: data.tableDetails.insertedRowCount,
      totalRowCount: data.tableDetails.totalRowCount,
      mostRecentUpdateTimestamp: data.tableDetails.mostRecentUpdateTimestamp,
      loadDurationSeconds: data.tableDetails.loadDurationSeconds,
      totalBytesProcessed: data.tableDetails.totalBytesProcessed,
      downstreamObjectCount: data.tableDetails.downstreamObjectCount,
    };
  }

  // Build a comment string to post on a pull request given a SchemaChangeReport.
  public buildComment(schemaChangeReport: SchemaChangeReport) {
    let comment = '# Revefi detected schema changes!\n';
    comment += 'Potentially breaking schema changes were detected for the following tables:\n';

    for (const reportItem of schemaChangeReport.reportItems) {
      const tableDetails = reportItem.revefiTableDetails;
      const fullTableName = [
          reportItem.fullTableName.databaseName,
          reportItem.fullTableName.schemaName,
          reportItem.fullTableName.tableName
      ].join('.').toUpperCase();
      const shortTableName = reportItem.fullTableName.tableName.toUpperCase();
      const lastUpdateStr = new Date(tableDetails.mostRecentUpdateTimestamp * 1000).toUTCString();
      const totalBytesStr = this.getByteString(tableDetails.totalBytesProcessed);

      comment += `### \`${shortTableName}\`\n`;
      comment += `${reportItem.changeDescription}\n`;
      comment += `* Filename: \`${reportItem.filename}\`\n`
      comment += `* Full Table Name: \`${fullTableName}\`\n`;
      comment += `* Most Recent Update: ${lastUpdateStr}\n`;
      comment += `* Inserted Row Count: ${tableDetails.insertedRowCount.toLocaleString()}\n`;
      comment += `* Total Row Count: ${tableDetails.totalRowCount.toLocaleString()}\n`;
      comment += `* Total Bytes Processed: ${totalBytesStr}\n`;
      comment += `* Load Duration Seconds: ${tableDetails.loadDurationSeconds}\n`;
      comment += `* Downstream Object Count: ${tableDetails.downstreamObjectCount}\n`;
      comment += `* See more details on [Revefi](${reportItem.revefiLink})\n`;
    }
    return comment
  }

  // Function to get the schema changes from the revefi API for a given code change.
  private async getSchemaChanges(
      codeChangeInfo: CodeChangeInfo,
      additionalContext: string
  ): Promise<SchemaChange[]> {
    const revefiReviewUrl = `${this.apiUrl}/schema-review`;
    const request: RevefiSchemaReviewRequest = {
      dataSourceId: this.dataSourceId,
      codeChangeInfo: codeChangeInfo,
      additionalContext: additionalContext,
    };
    core.debug(`Sending POST request to: ${revefiReviewUrl}`);
    core.debug(`Request: ${JSON.stringify(request, null, 2)}`);
    const response = await fetch(revefiReviewUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'X-Source-Application': 'github-action',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    })
    core.debug(`Response: ${response.status} ${response.statusText}`);
    // If the size of the code change is too large, the API will return a 413 error.
    // We will log a warning but return an empty list of schema changes to allow the action
    // to complete successfully.
    if (response.status === 413) {
      core.warning(`Schema review request was too large. Skipping schema review.`);
      return [];
    }
    if (!response.ok) {
      throw new Error(`Failed to get schema changes from revefi API: `
          + `${response.status} ${response.statusText}`);
    }
    const schemaReviewResponse = await response.json() as RevefiSchemaReviewResponse;
    core.debug(`Schema Review Response: ${JSON.stringify(schemaReviewResponse, null, 2)}`);
    return schemaReviewResponse.schemaChanges;
  }

  // Function to build a SchemaChangeReport object from a list of SchemaChange objects.
  private async buildSchemaChangeReport(schemaChanges: SchemaChange[]) {
    const report = new SchemaChangeReport();
    for (const schemaChange of schemaChanges) {
      const revefiTableDetails = await this.getRevefiTableDetails(schemaChange.fullTableName);
      const revefiLink = this.getTableDashboardLink(revefiTableDetails.artifactId);
      const reportItem =  {
        filename: schemaChange.filename,
        fullTableName: schemaChange.fullTableName,
        changeDescription: schemaChange.changeDescription,
        revefiTableDetails: revefiTableDetails,
        revefiLink: revefiLink,
      };
      report.reportItems.push(reportItem);
    }
    return report;
  }

  // Get the revefi link for a given artifact ID's table dashboard.
  private getTableDashboardLink(artifactId: number) {
    const appUrl = this.apiUrl.replace('gateway', 'app').replace('/api/v1', '');
    return `${appUrl}/table/${artifactId}/dashboard?dsId=${this.dataSourceId}`;
  }

  // Convert a byte count to a human-readable string
  private getByteString(byteCount: number) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let unitIndex = 0;
    while (byteCount >= 1024) {
      byteCount /= 1024;
      unitIndex += 1;
    }
    return `${byteCount.toFixed(2)} ${units[unitIndex]}`;
  }
}
import {RevefiIntegration} from "../src/integrations/revefi-integration";
import {beforeAll, describe, expect, jest, test} from "@jest/globals";
import {CodeChangeInfo,DbtModelInfo,RevefiTableDetails} from "../src/types";

describe('Revefi Integration', () => {
  let revefi: RevefiIntegration;

  beforeAll(() => {
    if (!process.env.PUBLIC_API_URL || !process.env.PUBLIC_API_TOKEN) {
      throw new Error('Environment variables PUBLIC_API_URL and PUBLIC_API_TOKEN must be set');
    }
    revefi = new RevefiIntegration(
      process.env.PUBLIC_API_URL,
      process.env.PUBLIC_API_TOKEN,
      parseInt(process.env.DATA_SOURCE_ID ?? '1')
    );
  });

  test('should succeed connecting to revefi', async () => {
    const isConnected = await revefi.isConnected();
    expect(isConnected).toBeTruthy();
  });

  test('should succeed with valid request to schema-review', async () => {
    const codeChangeInfo: CodeChangeInfo = {
      modifiedFiles: {
        "snowflake/models/tpch_all.sql": {
          filePath: "snowflake/models/tpch_all.sql",
          diff: "-        nation.nation_name,\n"
        }
      }
    }
    const additionalContext: DbtModelInfo = {
      models: {
        "snowflake/models/tpch_all.sql": {
          filePath: "snowflake/models/tpch_all.sql",
          fullTableName: {
            databaseName: "PC_DBT_DB",
            schemaName: "TEST_DATA",
            tableName: "TPCH_ALL"
          }
        }
      }
    }
    const schemaChangeReport = await revefi.getSchemaChangeReport(
      codeChangeInfo,
      JSON.stringify(additionalContext)
    );
    expect(schemaChangeReport).toBeDefined();
    expect(schemaChangeReport.reportItems).toBeDefined();
    expect(schemaChangeReport.reportItems.length).toBeGreaterThan(0);
    expect(schemaChangeReport.reportItems[0].changeDescription).toBeDefined();
    expect(schemaChangeReport.reportItems[0].changeDescription).toContain('nation_name');
  });

  test('should succeed with empty request to schema-review', async () => {
    const schemaChangeReport = await revefi.getSchemaChangeReport(
      new CodeChangeInfo(),
      "" // empty additional context
    );
    expect(schemaChangeReport).toBeDefined();
    expect(schemaChangeReport.reportItems).toBeDefined();
    expect(schemaChangeReport.reportItems.length).toEqual(0)
  });

  test('should return empty if request to schema-review is too large', async () => {
    const codeChangeInfo: CodeChangeInfo = {
      modifiedFiles: {
        "snowflake/models/tpch_all.sql": {
          filePath: "snowflake/models/tpch_all.sql",
          diff: "-        nation.nation_name,\n"
        }
      }
    }
    const schemaChangeReport = await revefi.getSchemaChangeReport(
      codeChangeInfo,    // valid code change info
      "a".repeat(100000) // additional context too large
    );
    expect(schemaChangeReport).toBeDefined();
    expect(schemaChangeReport.reportItems).toBeDefined();
    expect(schemaChangeReport.reportItems.length).toEqual(0)
  });

  test('should succeed for valid table details request', async () => {
    const tableDetails: RevefiTableDetails = await revefi.getRevefiTableDetails({
      databaseName: "PC_DBT_DB",
      schemaName: "TEST_DATA",
      tableName: "TPCH_ALL"
    });
    expect(tableDetails).toBeDefined();
    expect(tableDetails.artifactId).toBeDefined();
  });

  test('should reject invalid table details request', async () => {
    try {
      await revefi.getRevefiTableDetails({
        databaseName: "PC_DBT_DB",
        schemaName: "TEST_DATA",
        tableName: "TPCH_ALL_INVALID"
      });
      expect(false).toBeTruthy();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });
});

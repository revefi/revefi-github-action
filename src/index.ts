import * as core from '@actions/core';
import { RevefiIntegration } from './integrations/revefi-integration';
import { GithubIntegration } from './integrations/github-integration';
import { DbtIntegration } from './integrations/dbt-integration';

async function run() {
  if (!process.env.GITHUB_TOKEN) {
    throw new Error('Valid GITHUB_TOKEN is required');
  }
  const githubIntegration = new GithubIntegration(process.env.GITHUB_TOKEN);
  const dbtIntegration = new DbtIntegration();

  if (!process.env.REVEFI_API_TOKEN) {
    throw new Error('Valid REVEFI_API_TOKEN is required');
  }
  if (!process.env.REVEFI_DATA_SOURCE_ID || isNaN(parseInt(process.env.REVEFI_DATA_SOURCE_ID))) {
    throw new Error('Valid REVEFI_DATA_SOURCE_ID is required');
  }
  const apiUrl = process.env.REVEFI_API_ENDPOINT || 'https://gateway.revefi.com/api/v1';
  const apiToken = process.env.REVEFI_API_TOKEN;
  const dataSourceId = parseInt(process.env.REVEFI_DATA_SOURCE_ID);
  const revefiIntegration = new RevefiIntegration(apiUrl, apiToken, dataSourceId);

  if (!await revefiIntegration.isConnected()) {
   throw new Error('Failed to connect to Revefi API, please check the configuration:\n'
      + `Revefi API URL: ${apiUrl}\n`
      + `Revefi API Token Set?: ${apiToken && apiToken.length > 0}\n`);
  }

  const codeChangeInfo = await githubIntegration.getCodeChangeInfo();
  const dbtModelInfo = await dbtIntegration.getModelInfo(codeChangeInfo);

  const additionalContext = JSON.stringify(dbtModelInfo, null, 2);
  const schemaChangeReport = await revefiIntegration.getSchemaChangeReport(
    codeChangeInfo,
    additionalContext
  );

  if (schemaChangeReport.reportItems.length === 0) {
    core.info('No schema changes detected');
    return;
  }

  const comment = revefiIntegration.buildComment(schemaChangeReport);
  await githubIntegration.postCommentOnIssue(comment);
}

run().catch((error) => {
  if (error instanceof Error) {
    core.setFailed(
      `${error.name}` + `\nError message: ${error.message}` + `\nError stacktrace: ${error.stack}`
    );
  } else {
    core.setFailed('Unknown error ${error}');
  }
});

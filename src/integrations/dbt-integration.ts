import fs from 'fs';
import path from 'path';
import {glob} from 'glob';
import {CodeChangeInfo, DbtModelInfo, DbtModel} from '../types';
import * as exec from '@actions/exec';
import * as core from "@actions/core";

export class DbtIntegration  {
  constructor() {
    // Load the secrets from the DBT profile secrets JSON string into the environment
    Object.assign(process.env, JSON.parse(process.env.DBT_PROFILE_SECRETS ?? '{}'));
  }

  // Function to get the context necessary for schema change detection.
  public async getModelInfo(codeChangeInfo: CodeChangeInfo): Promise<DbtModelInfo> {
    const result = new DbtModelInfo();
    const modifiedFiles = Object.keys(codeChangeInfo.modifiedFiles)
        .filter((f) => f.endsWith('.sql'));

    // Get all dbt project directories for the modified files
    const projectDirs = await this.getDbtProjectDirs(modifiedFiles);
    for (const projectDir of projectDirs) {

      // Run dbt parse and get the manifest json.
      const manifestJson = await this.getManifestJson(projectDir);

      // Get the modified dbt models in this project
      const modifiedFilesInProject = modifiedFiles.filter((f) => f.startsWith(projectDir));

      // Parse the manifest json to get the dbt model information for each modified file in this project
      for (const modifiedFile of modifiedFilesInProject) {
        result.models[modifiedFile] = this.getDbtModelFromManifest(manifestJson, modifiedFile);
      }
    }
    return result;
  }

  // Function to get the dbt model information from the manifest.json file.
  private getDbtModelFromManifest(manifestJson: any, filePath: string): DbtModel {
    core.debug(`Getting dbt model info for file: ${filePath}`);
    const dbtModel: any = Object.values(manifestJson.nodes).find((node: any) => {
      // e.g. filePath: ${projectDir}/models/model_name.sql,
      //      original_file_path: models/model_name.sql
      return filePath.endsWith(node.original_file_path)
    });
    if (!dbtModel) {
      throw new Error(`No dbt model found in manifest.json for model file: ${filePath}`);
    }
    return {
      filePath: filePath,
      fullTableName: {
        databaseName: dbtModel.database,
        schemaName: dbtModel.schema,
        tableName: dbtModel.name
      }
    }
  }

  // Function to get the dbt project directories for the modified files.
  private async getDbtProjectDirs(modifiedFiles: string[]): Promise<string[]> {
    // Find all profiles.yml files in the repository, the parent directory of each is a dbt project
    const profilesYmlFiles = glob.sync(`**/profiles.yml`);
    core.info(`Found profiles.yml files: ${JSON.stringify(profilesYmlFiles)}`);
    const projectDirs = profilesYmlFiles.map((f) => path.dirname(f));

    // Only return project directories that contain modified files
    const modifiedProjects = projectDirs.filter((projectDir) => {
      const projectFiles = glob.sync(`${projectDir}/**/*.sql`);
      return projectFiles.some((f) => modifiedFiles.includes(f));
    });
    core.debug(`Modified dbt project paths: ${JSON.stringify(modifiedProjects)}`);
    return modifiedProjects;
  }

  // Runs dbt parse in the project directory and returns the manifest.json data.
  private async getManifestJson(projectDir: string): Promise<any> {
    core.info(`Running 'dbt parse' in project directory: ${projectDir}`);
    const exitCode = await exec.exec('sh', ['-c', `cd ${projectDir} && dbt deps && dbt parse`]);
    if (exitCode !== 0) {
      throw new Error(`Failed to run 'dbt parse' in project directory: ${projectDir}`);
    }

    const manifestPath = path.join(projectDir, 'target', 'manifest.json');
    const manifestData = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(manifestData);
  }
}

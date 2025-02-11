import * as github from "@actions/github";
import * as core from "@actions/core";
import {GitHub} from "@actions/github/lib/utils";
import {CodeChangeInfo} from "../types";

export class GithubIntegration {
  private readonly githubToken: string;
  private octokit: InstanceType<typeof GitHub>;
  private readonly pullNumber: number;

  constructor(githubToken: string) {
    if (!github.context.payload.pull_request) {
      throw new Error('This action is designed to run on pull request events only. Exiting.');
    }
    this.githubToken = githubToken;
    this.octokit = github.getOctokit(this.githubToken);
    this.pullNumber = github.context.payload.pull_request.number;
  }

  // Get the modified files in the pull request
  async getCodeChangeInfo(): Promise<CodeChangeInfo> {
    const { baseSha, headSha } = await this.getPullRequestBaseAndHeadSHAs();
    const modifiedFiles = await this.getModifiedFilePaths();
    const codeChangeInfo = new CodeChangeInfo();
    for (const filePath of modifiedFiles) {
      const baseContent = await this.getFileContentsAtSha(filePath, baseSha);
      const headContent = await this.getFileContentsAtSha(filePath, headSha);
      const diff = await this.getDiffBetweenSHAs(filePath, baseSha, headSha);
      const modifiedFile = {
        filePath: filePath,
        baseContent: baseContent,
        headContent: headContent,
        diff: diff,
      }
      core.info(`Modified File: ${modifiedFile.filePath}`);
      codeChangeInfo.modifiedFiles[filePath] = modifiedFile;
    }
    return codeChangeInfo;
  }

  // Get the base and head SHAs of the current pull request.
  async getPullRequestBaseAndHeadSHAs() {
    core.debug(`Getting the base and head SHAs for the pull request: ${this.pullNumber}`);
    const response = await this.octokit.rest.pulls.get({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: this.pullNumber
    });
    if (response.status !== 200) {
      throw new Error(`Failed to get the pull request base and head SHAs. Exiting.`);
    }
    core.debug(`Base SHA: ${response.data.base.sha}, Head SHA: ${response.data.head.sha}`);
    return {
      baseSha: response.data.base.sha,
      headSha: response.data.head.sha
    };
  }

  // Get the list of paths of modified files in the pull request
  async getModifiedFilePaths() {
    core.debug(`Getting the list of modified files in the pull request: ${this.pullNumber}`);
    const response = await this.octokit.rest.pulls.listFiles({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      pull_number: this.pullNumber
    });
    if (response.status !== 200) {
      throw new Error(`Failed to get the list of modified files in the pull request. Exiting.`);
    }
    const modifiedFiles = response.data.map((file) => file.filename)
        .filter((f) => f.endsWith('.sql'));
    core.debug(`Modified Files: ${JSON.stringify(modifiedFiles)}`);
    return modifiedFiles;
  }

  // Get the contents of a file at a specific commit SHA
  async getFileContentsAtSha(filePath: string, sha: string) {
    try {
      core.debug(`Getting contents of: ${filePath} at SHA: ${sha}`);
      const response = await this.octokit.request(
          'GET /repos/{owner}/{repo}/contents/{path}?ref={ref}', {
            owner: github.context.repo.owner,
            repo: github.context.repo.repo,
            path: filePath,
            ref: sha
          });
      const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
      core.debug(`File contents: ${content}`);
      return content;
    } catch (error) {
      core.info(`Failed to get file contents for: ${filePath} at SHA: ${sha}`);
      core.info(`Error: ${error}`);
      return '';
    }
  }

  // Get the diff of a file between two commit SHAs
  async getDiffBetweenSHAs(filePath: string, baseSha: string, headSha: string) {
    core.debug(`Getting diff of: ${filePath} between base: ${baseSha} and head: ${headSha}`);
    const response = await this.octokit.rest.repos.compareCommits({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      base: baseSha,
      head: headSha
    });
    if (response.status !== 200 || !response.data.files) {
      throw new Error(`Failed to get diff between base SHA: ${baseSha} and head SHA: ${headSha}`);
    }
    const data: any = response.data;
    const fileDiff = data.files.find((file: any) => file.filename === filePath);
    if (!fileDiff) {
      throw new Error(`Failed to get diff for file: ${filePath}`);
    }
    core.debug(`File diff: ${fileDiff.patch}`);
    return fileDiff.patch;
  }

  // Post a comment on the pull request
  async postCommentOnIssue(comment: string){
    const { owner, repo } = github.context.repo;
    const response = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: this.pullNumber,
      body: comment,
    });
    core.debug(`createComment response: ${JSON.stringify(response, null, 2)}`);
    if (response.status !== 201) {
      throw new Error(`Failed to post a comment on the pull request. Exiting.`);
    }
  }
}



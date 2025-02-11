# Revefi Github Action

**Catch breaking schema changes before they happen!**

This action watches incoming PRs to detect schema changes. By integrating with the Revefi
APIs, we are able to provide engineers observability into what the downstream effects will be
before they are made.

## Usage

### Inputs

- `revefi-api-token` - **(Required)**. The Revefi API token used to authenticate the action.
- `revefi-data-source-id` - **(Required)** The data source ID in revefi to search for table details.
- `revefi-api-endpoint` - The Revefi public API URL. Defaults to `https://gateway.revefi.com/api/v1`.
- `dbt-profile-secrets` - A JSON object containing a map of the environment variables to secrets 
                          that must be set in the `profiles.yml` file. Defaults to `{}`.

### Required Permissions

- `contents: read` - Required to read the contents of the PR files.
- `issues: write` - Required to write comments to the PR.
- `pull-requests: write` - Required to write comments to the PR.

### Limitations

- The action currently only responds to pull requests.
- The action only detects schema changes on models in dbt project. See the `dbt`
  configuration section below for more information.

### Example `.github/workflows/revefi-action.yml`

```
name: Revefi Integration

on:
  pull_request:
    branches: '**'

jobs:
  revefi-integration:
    permissions:
      contents: read
      issues: write
      pull-requests: write
    runs-on: ubuntu-latest
    steps:
      - name: Check Revefi for schema changes
        uses: revefi/github-integration@main
        with:
          revefi-api-token:      ${{ secrets.REVEFI_API_TOKEN }}
          revefi-data-source-id: <data-source-id for the dbt project in revefi>
          revefi-api-endpoint:   'https://gateway.revefi.com/api/v1'
          dbt-profile-secrets:   ${{ secrets.DBT_PROFILE_SECRETS }}
```

## Configuration

### Github Settings

Ensure that the repository for which this action is being added has been setup to allow calling
external workflows.

https://docs.github.com/en/actions/sharing-automations/reusing-workflows#access-to-reusable-workflows

Secrets should be configured in the repository settings and passed to the action as inputs, as shown
in the example above.

### Revefi

A public API token must be generated on the Revefi platform. The token only requires read access.
This token should be configured as a secret in the repository settings and passed to the action as
an input.

Revefi API Documentation:
https://docs.revefi.com/docs/publicapis

### DBT

The action is currently designed only to work with dbt projects. The caller repository is 
therefore assumed to contain one or more dbt projects.

The dbt configuration `profiles.yml` files must be included in the repository with the necessary
secrets passed to the action, as we run `dbt parse` internally to detect schema changes.

The action accepts an input `dbt-profile-secrets` which is a JSON object containing a map of the
environment variables names to secrets which must correlate with the`profiles.yml` file(s). The
action will handle the replacement of these secrets in the `profiles.yml` file before running the
dbt command.

### Example DBT Setup

#### Example Project Structure
```plaintext
- dbt-repository/
  - snowflake/
    - dbt_project.yml
    - profiles.yml
    - models/**/*.sql
  ...
```

#### Example dbt-profile-secrets
```json
  {
    "SNOWFLAKE_ACCOUNT":   "<snowflake_account>",
    "SNOWFLAKE_USER":      "<snowflake_user>",
    "SNOWFLAKE_PASSWORD":  "<snowflake_password>",
    "SNOWFLAKE_ROLE":      "<snowflake_role>",
    "SNOWFLAKE_DATABASE":  "<snowflake_database>",
    "SNOWFLAKE_WAREHOUSE": "<snowflake_warehouse>",
    "SNOWFLAKE_SCHEMA":    "<snowflake_schema>"
  }
```

#### Example dbt Profile Configuration
```yaml
# repo/snowflake/profiles.yml
snowflake:
  target: dev
  outputs:
    dev:
      type:      snowflake
      account:   "{{ env_var('SNOWFLAKE_ACCOUNT') }}"
      user:      "{{ env_var('SNOWFLAKE_USER') }}"
      password:  "{{ env_var('SNOWFLAKE_PASSWORD') }}"
      role:      "{{ env_var('SNOWFLAKE_ROLE') }}"
      database:  "{{ env_var('SNOWFLAKE_DATABASE') }}"
      warehouse: "{{ env_var('SNOWFLAKE_WAREHOUSE') }}"
      schema:    "{{ env_var('SNOWFLAKE_SCHEMA') }}"
```

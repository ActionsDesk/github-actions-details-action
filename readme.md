# github-actions-details-action

> Collect and comment with details about GitHub Actions on PRs

[![Test](https://github.com/ActionsDesk/github-actions-details-action/actions/workflows/test.yml/badge.svg)](https://github.com/ActionsDesk/github-actions-details-action/actions/workflows/test.yml) [![CodeQL](https://github.com/ActionsDesk/github-actions-details-action/actions/workflows/codeql.yml/badge.svg)](https://github.com/ActionsDesk/github-actions-details-action/actions/workflows/codeql.yml) [![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

## Usage

```yml
name: Post Action details

on:
  pull_request:
    types: [opened, synchronize]
    paths: [github-actions-allow-list.yml]

jobs:
  post-details:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      issues: write
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Setup node
        uses: actions/setup-node@60edb5dd545a775178f52524783378180af0d1f8
        with:
          node-version: 20
          cache: 'npm'

      - name: Add GitHub Action Details from PR
        uses: ActionsDesk/github-actions-details-action@c49711d95dd1d7b855baa08ecac42bc9b4528a27
        with:
          search_token: ${{ secrets.SEARCH_TOKEN }}
          # same as defined under `on.pull_requests.paths`
          allow_list_path: github-actions-allow-list.yml
```

### Action Inputs

| Name              | Description                                                                                                               | Default                         | Required |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------ | :------------------------------ | :------- |
| `token`           | [`GITHUB_TOKEN`](https://docs.github.com/en/actions/reference/authentication-in-a-workflow#about-the-github_token-secret) | `${{ github.token }}`           | `true`   |
| `search_token`    | GitHub Personal Access Token ([PAT]) with no scopes                                                                       |                                 | `true`   |
| `allow_list_path` | Path to the GitHub Actions allow list YML within the repository                                                           | `github-actions-allow-list.yml` | `false`  |

## License

- [MIT License](./license)

[pat]: https://docs.github.com/en/github/authenticating-to-github/creating-a-personal-access-token 'Personal Access Token'

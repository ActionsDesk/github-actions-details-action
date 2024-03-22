import {getOctokit} from '@actions/github'

class ActionDetails {
  /**
   * @typedef Action
   * @property {string}   owner
   * @property {string}   repo
   * @property {string}   version
   * @property {number}   position
   * @property {registry} [registry=undefined]
   */

  /**
   * @typedef Commit
   * @property {string} url
   * @property {string} sha
   */

  /**
   * @typedef Release
   * @property {string} published
   * @property {string} name
   * @property {string} url
   * @property {string} tag
   * @property {Commit} commit
   */

  /**
   * @typedef License
   * @property {string} name
   */

  /**
   * @typedef Owner
   * @property {string} login
   * @property {"User"|"Organization"} type
   * @property {string} url
   */

  /**
   * @typedef Details
   * @property {string} action
   * @property {string} url
   * @property {string} description
   * @property {string} homepage
   * @property {string[]|null} topics
   * @property {string[]|null} languages
   * @property {Release} release
   * @property {License|null} license
   * @property {boolean} isSecurityPolicyEnabled
   * @property {string} securityPolicyUrl
   * @property {number} vulnerabilityAlerts
   * @property {Owner} owner
   * @property {number} stars
   */

  /**
   * @param {object} options
   * @param {string} options.token GitHub Token
   * @param {string} options.searchToken GitHub Personal Access Token (PAT)
   * @param {string} options.allowList Path to the GitHub Actions allow list YML within the repository
   * @param {import('@actions/github').context} options.context
   */
  constructor({token, searchToken, allowList, context}) {
    if (!token) {
      throw new Error('`token` is required')
    }
    this.octokit = getOctokit(token)

    if (!searchToken) {
      throw new Error('`search_token` is required')
    }
    this.search = getOctokit(searchToken)

    this.allowList = allowList
    this.context = context
  }

  /**
   * @async
   * @readonly
   * @returns {Action[]}
   */
  async extractActionFromConfig() {
    const {owner, repo} = this.context.repo

    const {
      octokit,
      allowList,
      context: {
        payload: {
          pull_request: {
            base: {ref: base},
            head: {ref: head},
          },
        },
      },
    } = this

    // get the `git diff`
    // https://docs.github.com/rest/commits/commits#compare-two-commits
    const {
      data: {files},
    } = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner,
      repo,
      basehead: `${base}...${head}`,
    })

    const actions = []

    const actionRegEx = /- ([a-z0-9-]+)\/([a-z0-9-_]+|\*)(@.*){0,1}/i
    const dockerRegEx = /- docker:\/\/([a-z0-9-.]+)\/?(([a-z0-9_-]\/?)+)(:(.*)|@([a-z0-9]+:[a-z0-9]+))?/i

    for (const file of files) {
      if (file.filename === allowList) {
        const lines = file.patch.split('\n')

        for (const [i, line] of lines.entries()) {
          if (line.indexOf('---') === -1 && line.indexOf('+  - ') === 0) {
            const slice = line.slice(1).trim()

            if (slice.indexOf('docker://') > -1) {
              const match = dockerRegEx.exec(slice)

              if (!match) {
                actions.push({
                  owner: 'docker://',
                  repo: null,
                  version: null,
                  position: i,
                  registry: slice.slice(11),
                })
                continue
              }

              const [, dRegistry, dRepo, , dVersion] = match

              actions.push({
                owner: 'docker://',
                repo: dRepo,
                version: dVersion && dVersion.slice(1),
                position: i,
                registry: dRegistry,
              })
              continue
            }

            const [, o, r, v] = actionRegEx.exec(slice)

            actions.push({owner: o, repo: r, version: v && v.slice(1), position: i})
          }
        }
      }
    }

    return actions
  }

  /**
   * @async
   * @readonly
   */
  async getDetails() {
    const actions = await this.extractActionFromConfig()

    for await (const action of actions) {
      const {owner, repo, version, position, registry} = action

      if (registry) {
        this.postReviewComment(
          `## :whale: Docker container image detected

**This will add the Docker container image to the allow list!**

${repo ? `:link: https://${registry}/${repo}${version ? `/${version}` : ''}` : `\`${registry}\``}

Please make sure this is intended by providing a business reason via comment below!
`,
          position,
        )
        continue
      }

      if (repo === '*') {
        this.postReviewComment(
          `## :warning: Wildcard GitHub Action detected \`${owner}/${repo}\`

**This will add all GitHub Action repositories owned by https://github.com/${owner} to the allow list!**

Please make sure this is intended by providing a business reason via comment below!`,
          position,
        )
        continue
      }

      try {
        // will throw if it's not a GitHub Action
        await this.search.rest.repos.getContent({
          owner,
          repo,
          path: 'action.yml',
        })

        const {
          search: {
            edges: [result],
          },
        } = await this.search.graphql(searchQuery, {
          search: `repo:${owner}/${repo} fork:false`,
        })

        const details = {
          ...result.node,

          actionRequestedVersion: version,

          // flatten languages array
          languages: result.node.languages.nodes.map(item => item.name),

          // flatten license
          license: result.node.license ? result.node.license.name : 'none',

          // flatten topics array
          topics: result.node.topics.nodes.map(item => item.topic.name),

          // flatten vulnerability alerts count
          vulnerabilityAlerts: result.node.vulnerabilityAlerts.totalCount,
        }

        const md = this.getMarkdown(details)
        this.postReviewComment(md, position)
      } catch (error) {
        this.postReviewComment(
          `## :stop_sign: \`${owner}/${repo}\` is not a known GitHub Action

:link: https://github.com/${owner}/${repo}

Please delete \`${owner}/${repo}\` from \`${this.allowList}\`!`,
          position,
        )
      }
    }
  }

  /**
   * @readonly
   * @param {Details} details
   * @returns {string}
   */
  getMarkdown(details) {
    const {
      action,
      actionRequestedVersion,
      url,
      description,
      homepage,
      topics,
      languages,
      release,
      license,
      isSecurityPolicyEnabled,
      securityPolicyUrl,
      vulnerabilityAlerts,
      owner,
      stars,
    } = details

    let versionLink = ''
    if (actionRequestedVersion && actionRequestedVersion.indexOf('v') === 0) {
      versionLink += `releases/tag/${actionRequestedVersion}`
    } else if (actionRequestedVersion) {
      versionLink += `tree/${actionRequestedVersion}`
    }

    return `## Details about [\`${action}\`](${url}) (:star: ${stars})

> ${description}

#### :lock: Security
${
  isSecurityPolicyEnabled && securityPolicyUrl
    ? `
- Security policy: ${securityPolicyUrl}`
    : ''
}
- Known vulnerabilities: ${vulnerabilityAlerts}
${
  actionRequestedVersion
    ? `- Requested version: [\`${action}@${actionRequestedVersion}\`](${url}/${versionLink})`
    : `- :warning: Warning: No version specified! It is required that a version (e.g. \`@v1\`, branch name or _preferably_ a SHA) is provided.`
}
${
  release
    ? `
#### :package: Latest release version

- Name: ${release.name}
- Tag: [${release.tag}](${release.url})
- Git SHA: [\`${release.commit.sha}\`](${release.commit.url})
- Published: ${release.published}
`
    : ''
}
#### :information_source: Additional Information

- Owner: [@${owner.login}](${owner.url}) (${owner.type})${
      owner.type === 'Organization'
        ? `
- Organization Verified: ${owner.isVerified === true ? ':white_check_mark:' : ':x:'}`
        : ''
    }${
      homepage
        ? `
- Homepage: ${homepage}`
        : ''
    }
- License: ${license}
- Programming languages: ${languages.length < 1 ? 'n/a' : languages.join(', ')}${
      topics.length < 1
        ? ''
        : `
- Topics: ${topics.map(topic => `[\`${topic}\`](https://github.com/topics/${topic})`).join(', ')}`
    }

---

<sup>All details as of date of this comment</sup>
`
  }

  /**
   * @async
   * @readonly
   * @param {string} body
   * @param {number} position
   */
  async postReviewComment(body, position) {
    const {
      octokit,
      allowList: path,
      context: {
        payload: {
          number: pull_number,
          pull_request: {
            head: {sha: commit_id},
          },
        },
      },
    } = this

    try {
      // https://docs.github.com/rest/pulls/reviews#create-a-review-for-a-pull-request
      await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews', {
        ...this.context.repo,
        pull_number,
        commit_id,
        event: body.indexOf(':stop_sign:') > -1 ? 'REQUEST_CHANGES' : 'COMMENT',
        comments: [
          {
            path,
            body,
            position,
          },
        ],
      })
    } catch (error) {
      // add a regular comment if we can't add a review comment
      //docs.github.com/rest/pulls/comments#create-a-review-comment-for-a-pull-request
      await octokit.request('POST /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
        ...this.context.repo,
        pull_number,
        body,
        commit_id,
        path,
      })
    }
  }
}

export default ActionDetails

const searchQuery = `query ($search: String!) {
  search(type: REPOSITORY, query: $search, first: 1) {
    edges {
      node {
        ... on Repository {
          action: nameWithOwner
          url
          description
          homepage: homepageUrl
          topics: repositoryTopics(first: 5) {
            nodes {
              topic {
                name
              }
            }
          }
          languages(first: 5) {
            nodes {
              name
            }
          }
          release: latestRelease {
            published: publishedAt
            name
            url
            tag: tagName
            commit: tagCommit {
              url
              sha: oid
            }
          }
          license: licenseInfo {
            name
          }
          isSecurityPolicyEnabled
          securityPolicyUrl
          vulnerabilityAlerts {
            totalCount
          }
          owner {
            type: __typename
            login
            url
            ... on Organization {
              isVerified
            }
          }
          stars: stargazerCount
        }
      }
    }
  }
}`

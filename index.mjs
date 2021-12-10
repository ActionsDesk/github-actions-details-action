import {getInput, setFailed} from '@actions/core'
import {join, parse} from 'path'
import ActionDetails from './utils/ActionDetails.mjs'
import {context} from '@actions/github'

// action
;(async () => {
  try {
    const searchToken = getInput('search_token', {required: true})
    const token = getInput('token', {required: true})
    const allowList = getInput('allow_list_path')
    const workspace = process.env.GITHUB_WORKSPACE

    const allowListPath = join(workspace, allowList)
    const {dir} = parse(allowListPath)

    if (dir.indexOf(workspace) < 0) {
      throw new Error(`${allowList} is not an allowed path`)
    }

    const ad = new ActionDetails({token, searchToken, allowList, context})

    await ad.getDetails()
    // await ad.postComment()
  } catch (error) {
    setFailed(error.message)
  }
})()

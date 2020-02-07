// Route: /:provider/:commit/:status
// Parameters:
// {
//   "repository": {
//     "type": "string",
//     "required": true
//   },
//   "branch": {
//     "type": "string",
//     "required": true
//   },
//   "build_name": {
//     "type": "string",
//     "required": true,
//     "default": "VSTS"
//   },
//   "build_number": {
//     "type": "string",
//     "required": true
//   },
//   "build_url": {
//     "type": "string",
//     "required": true
//   },
//   "description": {
//     "type": "string",
//     "required": false
//   }
// }
module['exports'] = function vso_post_build_status(hook) {
  var params = hook.params
  var token = hook.req.headers['x-git-token'] || hook.req.headers['Authorization'] || ''

  if (token === '') {
    hook.res.end('Unsupport token!')
  }

  var url = ''
  var headers = {}
  var body = {}

  // See https://msdn.microsoft.com/en-us/library/microsoft.teamfoundation.build.client.buildstatus%28v=vs.120%29.aspx
  // All Failed, InProgress, None, NotStarted, PartiallySucceeded, Stopped and Succeeded.
  var build_status = params.status
  var build_display = `${params.build_name}: ${params.build_number}`
  var build_description = params.description || build_display

  if (params.provider === 'gitlab' || params.provider === 'gitlabee') {
    // GitLab    
    var gitServerUrl = 'https://gitlab.com'
    if (params.provider === 'gitlabee') {
      gitServerUrl = hook.req.headers['x-git-server-url']
    }

    url = `${gitServerUrl}/api/v4/projects/${params.repository}/statuses/${params.commit}`
    headers = {
      'PRIVATE-TOKEN': token
    }

    console.log(`Build: ${params.branch} ${params.commit} ${build_status}`)

    // The state of the status. Can be one of the following: pending, running, success, failed, canceled
    switch (build_status || '') {
      case '':
      case 'Pending':
        build_status = 'pending'
        break
      case 'Succeeded':
      case 'SucceededWithIssues': // Treat CDN errors as success
        build_status = 'success'
        break
      case 'Canceled':
        build_status = 'canceled'
        break
      default:
        // Cannot use 'running' because there is noway to transition from running to success with set status.
        build_status = 'failed'
        break
    }

    body = {
      'state': build_status,
      'ref': `${params.branch.replace('refs/heads/', '')}`,
      'name': params.build_name,
      'target_url': params.build_url,
      'description': params.build_number
    }
  } else if (params.provider === 'bitbucket') {
    // Bitbucket
    url = `https://api.bitbucket.org/2.0/repositories/${params.repository}/commit/${params.commit}/statuses/build`
    headers = {
      'Authorization': token
    }

    // The state of the status. Can be one of the following: INPROGRESS|SUCCESSFUL|FAILED
    switch (build_status || '') {
      case 'Succeeded':
        build_status = 'SUCCESSFUL'
        break
      case '':
        build_status = 'INPROGRESS'
        break
      case 'Canceled':
        build_status = 'STOPPED'
        break
      default:
        build_status = 'FAILED'
        break
    }

    body = {
      'state': build_status,
      'key': params.build_name,
      'name': build_display,
      'url': params.build_url,
      'description': build_description
    }
  } else {
    hook.res.end('Unsupport provider!')
  }

  var options = {
    url: url,
    json: true,
    headers: headers,
    body: body
  }

  // npm modules available, see: http://hook.io/modules
  var request = require('request')
  request.post(options, (err, res, body) => {
    if (err) {
      return hook.res.end(err.messsage)
    }

    hook.res.end(body)
  })
}
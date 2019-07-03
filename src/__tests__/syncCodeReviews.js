const _ = require('lodash')
const { Probot } = require('probot')
const nock = require('nock')

const syncCodeReviews = require('../syncCodeReviews')
const Pivotal = require('../lib/Pivotal')

jest.mock('../lib/Pivotal')

nock.disableNetConnect()

const apimock = nock('https://api.github.com').get(
  '/repos/ezhlobo/my-repository/pulls/100/reviews',
)

const buildGithubReview = (id, state, user) => ({
  id,
  state,
  user,
})

describe('syncCodeReviews', () => {
  let probot

  beforeEach(() => {
    probot = new Probot({})
    // Load our app into probot
    const app = probot.load(syncCodeReviews)

    // just return a test token
    app.app = { getSignedJsonWebToken: () => 'test' }

    Pivotal.setStoryReviews.mockClear()
  })

  const pullRequestBody = 'https://www.pivotaltracker.com/story/show/1'
  const reviewerOne = { login: 'user_first' }

  describe('when one review was requested', () => {
    let payload = _.cloneDeep(
      require('./fixtures/pull_request.review_requested'),
    )

    _.set(payload, 'pull_request.body', pullRequestBody)
    _.set(payload, 'pull_request.requested_reviewers', [reviewerOne])
    _.set(payload, 'requested_reviewer', reviewerOne)

    describe('when it requested the first time on github', () => {
      beforeEach(() => {
        apimock.reply(200, [])
      })

      it('should add reviewer to the story with "unstarted" status', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'unstarted',
        )
      })
    })

    describe('when it requested the second time on github', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'DISMISSED', reviewerOne)])
      })

      it('should add reviewer to the story with "in_review" status', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })
  })

  describe('when the review request removed', () => {
    let payload = _.cloneDeep(
      require('./fixtures/pull_request.review_request_removed'),
    )

    _.set(payload, 'pull_request.body', pullRequestBody)
    _.set(payload, 'requested_reviewer', reviewerOne)

    describe('when there is no previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [])
      })

      it('removes reviewer from the story', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          null,
        )
      })
    })

    describe('when there is approved previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'APPROVED', reviewerOne)])
      })

      it('keeps the reviewer on the story but set "pass" state', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'pass',
        )
      })
    })

    describe('when there is rejected previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [
          buildGithubReview(301, 'CHANGES_REQUESTED', reviewerOne),
        ])
      })

      it('keeps the reviewer on the story but set "revise" state', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'revise',
        )
      })
    })

    describe('when there is commented previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'COMMENTED', reviewerOne)])
      })

      it('keeps the reviewer on the story but set "in_review" state', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })

    describe('when there are only dismissed previous reviews', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'DISMISSED', reviewerOne)])
      })

      it('removes the review from the story', async () => {
        await probot.receive({ name: 'pull_request', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          null,
        )
      })
    })
  })

  describe('when the review was submitted', () => {
    let payload

    beforeEach(() => {
      payload = _.cloneDeep(require('./fixtures/pull_request_review.submitted'))

      _.set(payload, 'pull_request.body', pullRequestBody)
      _.set(payload, 'review.user', reviewerOne)
    })

    describe('when it is approved review', () => {
      it('sets "pass" status of the story review', async () => {
        _.set(payload, 'review.state', 'approved')
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'pass',
        )
      })
    })

    describe('when it is rejected review', () => {
      it('sets "revise" status of the story review', async () => {
        _.set(payload, 'review.state', 'changes_requested')
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'revise',
        )
      })
    })

    describe('when it is commented review', () => {
      it('sets "in_review" status of the story review', async () => {
        _.set(payload, 'review.state', 'commented')
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })
  })

  describe('when the review was dismissed', () => {
    let payload = _.cloneDeep(
      require('./fixtures/pull_request_review.dismissed'),
    )

    _.set(payload, 'pull_request.body', pullRequestBody)
    _.set(payload, 'review.user', reviewerOne)

    describe('when there is no previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [])
      })

      it('sets "in_review" state for the story', async () => {
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })

    describe('when there is approved previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'APPROVED', reviewerOne)])
      })

      it('sets "pass" state', async () => {
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'pass',
        )
      })
    })

    describe('when there is rejected previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [
          buildGithubReview(301, 'CHANGES_REQUESTED', reviewerOne),
        ])
      })

      it('sets "revise" state', async () => {
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'revise',
        )
      })
    })

    describe('when there is commented previous review', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'COMMENTED', reviewerOne)])
      })

      it('sets "in_review" state', async () => {
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })

    describe('when there are only dismissed previous reviews', () => {
      beforeEach(() => {
        apimock.reply(200, [buildGithubReview(301, 'DISMISSED', reviewerOne)])
      })

      it('sets "in_review" state', async () => {
        await probot.receive({ name: 'pull_request_review', payload })

        expect(Pivotal.setStoryReviews).toHaveBeenLastCalledWith(
          '1',
          reviewerOne.login,
          'in_review',
        )
      })
    })
  })
})

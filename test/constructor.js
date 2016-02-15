'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var before = lab.before;

var clone = require('101/clone');
var redis = require('redis');
var sinon = require('sinon');

var redisTypes = require('redis-types');
var NaviEntry = require('../index.js');
var redisClient = redis.createClient();

function createNaviEntry () {
  var args = arguments;
  if (args.length === 1) {
    return new NaviEntry(args[0]);
  }
  else if (args.length === 2) {
    return new NaviEntry(args[0], args[1], args[2]);
  }
  else if (args.length === 3) {
    return new NaviEntry(args[0], args[1], args[2]);
  }
  else {
    return new NaviEntry(args[0], args[1], args[2], args[3]);
  }
}

describe('NaviEntry', function () {
  var ctx;
  before(function (done) {
    // reset redis-types (and navi-entry) to not having a client
    delete redisTypes.Key.prototype.redisClient;
    done();
  });
  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('constructor', function () {

    describe('errors', function () {

      it('should error if missing args', function (done) {
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerGitHubUsername: 'ownerGitHubUsername'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerGitHubUsername: 'ownerGitHubUsername',
            userContentDomain: 'runnableapp.com'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerGitHubUsername: 'ownerGitHubUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerGitHubUsername: 'ownerGitHubUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true,
            ownerGithub: 101
          })
        ).to.throw(/redis/);

        done();
      });

      it('should error if redisClient is not provided', function (done) {
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            branch:       'branch',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerGitHubUsername: 'ownerGitHubUsername',
            ownerGithub: 101,
            userContentDomain: 'runnableapp.com',
            masterPod: true
          })
        ).to.throw(Error, /redis client/);

        done();
      });
    });

    describe('success', function () {
      beforeEach(function (done) {
        NaviEntry.setRedisClient(redisClient);
        ctx.opts = {
          exposedPort: '80',
          shortHash:    'abcdef',
          branch:       'branch',
          ownerGitHubUsername: 'ownerGitHubUsername',
          ownerGithub: 101,
          userContentDomain: 'runnableapp.com',
          instanceName: 'instanceName'
        };
        done();
      });

      describe('masterPod:false', function () {
        beforeEach(function (done) {
          ctx.opts.masterPod = false;
          ctx.opts.instanceName = ctx.opts.branch+'-'+ctx.opts.instanceName;
          done();
        });

        it('should create an NaviEntry instance', function (done) {
          var opts = ctx.opts;
          var naviEntry = new NaviEntry(ctx.opts);

          expectDirectKey(naviEntry, opts);
          expect(naviEntry.elasticKey).to.not.exist();
          expect(naviEntry.key).to.equal(naviEntry.directKey);

          done();
        });
      });

      describe('masterPod:true', function () {
        beforeEach(function (done) {
          ctx.opts.masterPod = true;
          done();
        });

        it('should create an NaviEntry instance, masterPod:true', function (done) {
          var opts = ctx.opts;
          var naviEntry = new NaviEntry(ctx.opts);

          expectDirectKey(naviEntry, opts);
          expectElasticKey(naviEntry, opts);
          expect(naviEntry.key).to.equal(naviEntry.directKey);

          done();
        });

        describe('branch:undefined', function () {
          beforeEach(function (done) {
            delete ctx.opts.branch;
            done();
          });

          it('should create a NaviEntry instance', function (done) {
            var opts = ctx.opts;
            var naviEntry = new NaviEntry(ctx.opts);

            expect(naviEntry.directKey).to.not.exist();
            expectElasticKey(naviEntry, opts);
            expect(naviEntry.elasticKey).to.equal(naviEntry.key);

            done();
          });
        });
      });


      function expectDirectKey (naviEntry, opts) {
        var repoName = opts.masterPod ?
          opts.instanceName:
          // non masterPod instances include branch in their name
          opts.instanceName.replace(opts.branch+'-', '');
        expect(naviEntry.directKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            opts.shortHash, '-',
            repoName, '-',
            'staging', '-',
            opts.ownerGitHubUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerGitHubUsername).to.equal(opts.ownerGitHubUsername);
        expect(naviEntry.opts.userContentDomain).to.equal(opts.userContentDomain);
      }
      function expectElasticKey (naviEntry, opts) {
        expect(naviEntry.elasticKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            opts.instanceName, '-staging-', opts.ownerGitHubUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerGitHubUsername).to.equal(opts.ownerGitHubUsername);
        expect(naviEntry.opts.userContentDomain).to.equal(opts.userContentDomain);
      }
    });

  });
  describe('createFromUrl', function () {
    before(function(done) {
      NaviEntry.setRedisClient(redisClient);
      done();
    });
    it('should create correct entry', function(done) {
      expect(NaviEntry.createFromUrl('http://hash-repo-staging-codenow.runnableapp.com').key)
        .to.equal('frontend:80.hash-repo-staging-codenow.runnableapp.com');
      expect(NaviEntry.createFromUrl('http://repo-staging-codenow.runnableapp.com').key)
        .to.equal('frontend:80.repo-staging-codenow.runnableapp.com');
      expect(NaviEntry.createFromUrl('http://hash-repo-staging-codenow.runnableapp.com:542').key)
        .to.equal('frontend:542.hash-repo-staging-codenow.runnableapp.com');
      expect(NaviEntry.createFromUrl('http://repo-staging-codenow.runnableapp.com:542').key)
        .to.equal('frontend:542.repo-staging-codenow.runnableapp.com');
      done();
    });
  });

  describe('createFromHostname', function () {
    var testEntry;
    var opts = {
      exposedPort: '80',
      shortHash:    'abcdef',
      branch:       'branch',
      ownerGitHubUsername: 'ownerGitHubUsername',
      ownerGithub: 101,
      userContentDomain: 'runnableapp.com',
      masterPod: true,
      instanceName: 'instanceName'
    };
    before(function(done) {
      NaviEntry.setRedisClient(redisClient);
      done();
    });
    beforeEach(function(done) {
      testEntry = new NaviEntry(opts);
      testEntry.setBackend('backend1', done());
    });
    beforeEach(function(done) {
      var opt = clone(opts);
      opt.exposedPort = '443';
      var testEntry = new NaviEntry(opt);
      testEntry.setBackend('backend1', done());
    });
    beforeEach(function(done) {
      var opt = clone(opts);
      opt.exposedPort = '45678';
      var testEntry = new NaviEntry(opt);
      testEntry.setBackend('backend1', done());
    });
    beforeEach(function(done) {
      var opt = clone(opts);
      opt.branch = 'who';
      opt.masterPod = false;
      opt.instanceName = opt.branch + opts.instanceName;
      var testEntry = new NaviEntry(opt);
      testEntry.setBackend('backend2', done());
    });
    it('should create a naviEntry from hostname for masterPod', function (done) {
      var host = new NaviEntry(opts).getDirectHostname();
      NaviEntry.createFromHostname(redisClient, host, function (err, naviEntry) {
        naviEntry.lindex(1, function (err, backend) {
          expect(backend).to.equal('backend1');
          done();
        });
      });
    });
    it('should create a naviEntry from hostname for non masterPod', function (done) {
      var opt = clone(opts);
      opt.branch = 'who';
      opt.masterPod = false;
      opt.instanceName = opt.branch + opts.instanceName;
      var host = new NaviEntry(opt).getDirectHostname();
      NaviEntry.createFromHostname(redisClient, host, function (err, naviEntry) {
        naviEntry.lindex(1, function (err, backend) {
          expect(backend).to.equal('backend2');
          done();
        });
      });
    });
    it('should create a error if not found', function (done) {
      var opt = clone(opts);
      opt.instanceName = 'fake';
      var host = new NaviEntry(opt).getDirectHostname();
      NaviEntry.createFromHostname(redisClient, host, function (err) {
        expect(err).to.exist();
        done();
      });
    });
    it('should error if redis call failed', function (done) {
      var testErr = 'power kick';
      var hostname = new NaviEntry(opts).getDirectHostname();
      sinon.stub(redisClient, 'keys').yieldsAsync(testErr);
      NaviEntry.createFromHostname(redisClient, hostname, function (err) {
        expect(err).to.equal(testErr);
        done();
      });
    });
  });
});
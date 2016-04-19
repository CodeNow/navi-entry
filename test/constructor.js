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
var regexForRemovingShortHashFromDirectUrls = /^[A-z0-9]*-{1,2}/;
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
            ownerUsername: 'ownerUsername'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com'
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true
          })
        ).to.throw(/required/);
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            shortHash: 'abcdef',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
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
            ownerUsername: 'ownerUsername',
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
          ownerUsername: 'ownerUsername',
          ownerGithub: 101,
          userContentDomain: 'runnableapp.com',
          instanceName: 'instanceName',
          masterPod: false
        };
        done();
      });

      describe('masterPod:false', function () {
        beforeEach(function (done) {
          ctx.opts.instanceName = ctx.opts.branch+'-'+ctx.opts.instanceName;
          done();
        });

        it('should create an NaviEntry instance', function (done) {
          var opts = ctx.opts;
          var naviEntry = new NaviEntry(ctx.opts);

          expectDirectKey(
            naviEntry,
            opts,
            'abcdef-instancename-staging-ownerusername.runnableapp.com'
          );
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
      describe('isolated:true', function () {
        beforeEach(function (done) {
          ctx.opts.isolated = 'asdasd';
          done();
        });

        describe('Not isIsolationGroupMaster', function () {
          beforeEach(function (done) {
            ctx.opts.instanceName = 'asdad3f--' + ctx.opts.instanceName;
            done();
          });

          it('should create an NaviEntry instance, isolated:true', function (done) {
            var opts = ctx.opts;
            var naviEntry = new NaviEntry(ctx.opts);

            expectDirectKey(
              naviEntry,
              opts,
              'asdad3f--instancename-staging-ownerusername.runnableapp.com'
            );
            expect(naviEntry.elasticKey).to.not.exist();
            expect(naviEntry.key).to.equal(naviEntry.directKey);

            done();
          });

          describe('branch:undefined (Non-repo isolated containers)', function () {
            beforeEach(function (done) {
              delete ctx.opts.branch;
              done();
            });

            it('should create a NaviEntry instance', function (done) {
              var opts = ctx.opts;
              var naviEntry = new NaviEntry(ctx.opts);

              expectDirectKey(
                naviEntry,
                opts,
                'asdad3f--instancename-staging-ownerusername.runnableapp.com'
              );
              expect(naviEntry.elasticKey).to.not.exist();
              expect(naviEntry.key).to.equal(naviEntry.directKey);
              done();
            });
          });
          describe('branch:none masterpod (Non-repo isolate added after isolation)', function () {
            beforeEach(function (done) {
              delete ctx.opts.branch;
              ctx.opts.masterPod = true;
              done();
            });

            it('should create a NaviEntry instance', function (done) {
              var opts = ctx.opts;
              var naviEntry = new NaviEntry(ctx.opts);

              expect(naviEntry.directKey).to.not.exist();
              expectElasticKey(
                naviEntry,
                opts,
                'instancename-staging-ownerusername.runnableapp.com'
              );
              expect(naviEntry.elasticKey).to.equal(naviEntry.key);

              done();
            });
          });
        });

        describe('isIsolationGroupMaster', function () {
          beforeEach(function (done) {
            ctx.opts.isIsolationGroupMaster = true;
            done();
          });

          it('should create a NaviEntry instance', function (done) {
            var opts = ctx.opts;
            var naviEntry = new NaviEntry(ctx.opts);

            expectDirectKey(
              naviEntry,
              opts,
              'abcdef-instancename-staging-ownerusername.runnableapp.com'
            );
            expect(naviEntry.elasticKey).to.not.exist();
            expect(naviEntry.key).to.equal(naviEntry.directKey);

            done();
          });
        });
      });

      function expectDirectKey (naviEntry, opts, theUrl) {
        var repoName = opts.masterPod ?
          opts.instanceName:
          // non masterPod instances include branch in their name
          opts.instanceName.replace(opts.branch+'-', '');
        if (!opts.isolated) {
          repoName = opts.shortHash + '-' + repoName;
        }
        theUrl = theUrl || [
            repoName, '-',
            'staging', '-',
            opts.ownerUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase();

        expect(naviEntry.directKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            theUrl
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerUsername).to.equal(opts.ownerUsername);
        expect(naviEntry.opts.userContentDomain).to.equal(opts.userContentDomain);
      }
      function expectElasticKey (naviEntry, opts, theUrl) {
        var repoName = opts.isolated ?
         opts.instanceName.replace(regexForRemovingShortHashFromDirectUrls, ''): opts.instanceName;
        theUrl = theUrl || [
            repoName, '-staging-',
            opts.ownerUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase();
        expect(naviEntry.elasticKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            theUrl
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerUsername).to.equal(opts.ownerUsername);
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

  describe('formatOpts', function () {
    var opts = {
      exposedPort: '80',
      shortHash: 'abcdef',
      branch: 'branch',
      ownerUsername: 'ownerUsername',
      ownerGithub: 101,
      userContentDomain: 'runnableapp.com',
      masterPod: true,
      instanceName: 'instanceName'
    };
    describe('Verifying errors', function () {
      Object.keys(opts).forEach(function (optKey) {
        it('should throw error when missing the required opt ' + optKey, function (done) {
          expect(function () {
            delete opts[optKey];
            NaviEntry.formatOpts(opts);
          }).to.throw(Error);
          done();
        });
      });
    });

    it('should pull out the exposed port', function (done) {
      opts.exposedPort = '3000/sdfsfadfadsf';
      NaviEntry.formatOpts(opts);
      expect(opts.exposedPort).to.equal('3000');
      done();
    });

    it('should save isolatedParentShorthash since it\'s an isolated container', function (done) {
      opts.isolated = 'asdfasdfasdfgasdfh';
      opts.instanceName = '1123f1--instanceName';
      opts.masterPod = false;
      NaviEntry.formatOpts(opts);
      expect(opts.isolatedParentShortHash).to.equal('1123f1');
      done();
    });

    // This would be a freshly added non-repo container added to an isolation
    it('should not save isolatedParentShorthash, since this is a masterpod', function (done) {
      opts.isolated = 'asdfasdfasdfgasdfh';
      opts.instanceName = '1123f1--instanceName';
      NaviEntry.formatOpts(opts);
      expect(opts.isolatedParentShortHash).to.be.undefined();
      done();
    });

    it('should not save isolatedParentShorthash, since this is the group master', function (done) {
      opts.isolated = 'asdfasdfasdfgasdfh';
      opts.instanceName = '1123f1--instanceName';
      opts.isIsolationGroupMaster = true;
      NaviEntry.formatOpts(opts);
      expect(opts.isolatedParentShortHash).to.be.undefined();
      done();
    });
  });

  describe('createFromHostname', function () {
    var testEntry;
    var opts = {
      exposedPort: '80',
      shortHash:    'abcdef',
      branch:       'branch',
      ownerUsername: 'ownerUsername',
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
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var redis = require('redis');
var redisTypes = require('redis-types');

var NaviEntry = require('../index.js');
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
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  afterEach(function (done) {
    delete redisTypes.Key.prototype.redisClient;
    done();
  });

  describe('constructor', function () {

    describe('errors', function () {

      it('should error if missing args', function (done) {
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80'})
        ).to.throw();
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            instanceName: 'instanceName'
          })
        ).to.throw();
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername'
          })
        ).to.throw();
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            branch:       'branch',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com'
          })
        ).to.throw(Error, /masterPod/);

        done();
      });

      it('should error if redisClient is not provided', function (done) {
        expect(
          createNaviEntry.bind(null, {
            exposedPort: '80',
            branch:       'branch',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true
          })
        ).to.throw(Error, /redis client/);

        done();
      });
    });

    describe('success', function () {
      beforeEach(function (done) {
        NaviEntry.setRedisClient(redis.createClient());
        ctx.opts = {
          exposedPort: '80',
          branch:       'branch',
          ownerUsername: 'ownerUsername',
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
        var branchPart = opts.masterPod ?
          opts.branch+'-':
          ''; // non masterPod instances include branch in their name
        expect(naviEntry.directKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            branchPart,
            opts.instanceName, '-staging-', opts.ownerUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerUsername).to.equal(opts.ownerUsername);
        expect(naviEntry.opts.userContentDomain).to.equal(opts.userContentDomain);
      }
      function expectElasticKey (naviEntry, opts) {
        expect(naviEntry.elasticKey)
          .to.equal([
            'frontend:',
            opts.exposedPort, '.',
            opts.instanceName, '-staging-', opts.ownerUsername, '.',
            opts.userContentDomain
          ].join('').toLowerCase());
        expect(naviEntry.opts.exposedPort).to.equal(opts.exposedPort);
        expect(naviEntry.opts.instanceName).to.equal(opts.instanceName);
        expect(naviEntry.opts.branch).to.equal(opts.branch);
        expect(naviEntry.opts.ownerUsername).to.equal(opts.ownerUsername);
        expect(naviEntry.opts.userContentDomain).to.equal(opts.userContentDomain);
      }
    });

  });

  describe('createFromHostnameAndPort', function () {
    it('should create a naviEntry from hostname', function (done) {
      NaviEntry.setRedisClient(redis.createClient());
      var opts = {
        exposedPort: '80',
        branch:       'branch',
        ownerUsername: 'ownerUsername',
        userContentDomain: 'runnableapp.com',
        masterPod: true,
        instanceName: 'instanceName'
      };
      var host = new NaviEntry(opts).getDirectHostname();
      expect(
        NaviEntry.createFromHost(host).key
      ).to.equal(
        new NaviEntry(opts).key
      );

      expect(
        NaviEntry.createFromHost(host+':'+opts.exposedPort).key
      ).to.equal(
        new NaviEntry(opts).key
      );

      done();
    });

  });
});
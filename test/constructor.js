'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var sinon = require('sinon');

var redis = require('redis');
var redisTypes = require('redis-types');

var NaviEntry = require('../index.js');
function createNaviEntry () {
  var args = arguments;
  if (args.length === 1) {
    new NaviEntry(args[0]);
  }
  else if (args.length === 2) {
    new NaviEntry(args[0], args[1], args[2]);
  }
  else if (args.length === 3) {
    new NaviEntry(args[0], args[1], args[2]);
  }
  else {
    new NaviEntry(args[0], args[1], args[2], args[3]);
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

    describe('errors', function() {

      it('should error if missing args', function (done) {
        var expectedErrMessage = 'missing arguments';
        expect(
          createNaviEntry.bind(null, {
            containerPort: '80'})
        ).to.throw();
        expect(
          createNaviEntry.bind(null, {
            containerPort: '80',
            instanceName: 'instanceName'
          })
        ).to.throw();
        expect(
          createNaviEntry.bind(null, {
            containerPort: '80',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername'
          })
        ).to.throw();

        done();
      });

      it('should error if redisClient is not provided', function (done) {
        expect(
          createNaviEntry.bind(null, {
            containerPort: '80',
            branch:       'branch',
            instanceName: 'instanceName',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com'
          })
        ).to.throw(Error, /redis client/);

        done();
      });
    });

    it('should create an NaviEntry instance', function (done) {
      NaviEntry.setRedisClient(redis.createClient());
      var opts = {
        containerPort: '80',
        branch:       'branch',
        instanceName: 'instanceName',
        ownerUsername: 'ownerUsername',
        userContentDomain: 'runnableapp.com'
      };
      var naviEntry = new NaviEntry(opts);

      expect(naviEntry.key)
        .to.equal([
          'frontend:',
          opts.containerPort, '.',
          opts.branch, '-', opts.instanceName, '-staging-', opts.ownerUsername, '.',
          opts.userContentDomain
        ].join('').toLowerCase());
      expect(naviEntry.containerPort).to.equal(opts.containerPort);
      expect(naviEntry.instanceName).to.equal(opts.instanceName);
      expect(naviEntry.branch).to.equal(opts.branch);
      expect(naviEntry.ownerUsername).to.equal(opts.ownerUsername);
      expect(naviEntry.userContentDomain).to.equal(opts.userContentDomain);

      done();
    });

    it('should create an NaviEntry instance for a masterPod instance', function(done) {
      NaviEntry.setRedisClient(redis.createClient());
      var opts = {
        containerPort: '80',
        branch:       'branch',
        ownerUsername: 'ownerUsername',
        userContentDomain: 'runnableapp.com',
        instance: {
          masterPod: true,
          name: 'altname'
        }
      };
      var naviEntry = new NaviEntry(opts);

      expect(naviEntry.key)
        .to.equal([
          'frontend:',
          opts.containerPort, '.',
          opts.branch, '-', opts.instance.name, '-staging-', opts.ownerUsername, '.',
          opts.userContentDomain
        ].join('').toLowerCase());
      expect(naviEntry.elasticKey)
        .to.equal([
          'frontend:',
          opts.containerPort, '.',
          opts.instance.name, '-staging-', opts.ownerUsername, '.',
          opts.userContentDomain
        ].join('').toLowerCase());
      expect(naviEntry.containerPort).to.equal(opts.containerPort);
      expect(naviEntry.instanceName).to.equal(opts.instanceName);
      expect(naviEntry.branch).to.equal(opts.branch);
      expect(naviEntry.ownerUsername).to.equal(opts.ownerUsername);
      expect(naviEntry.userContentDomain).to.equal(opts.userContentDomain);

      done();
    });
  });

  describe('createFromHostnameAndPort', function () {
    it('should create a naviEntry from hostname', function (done) {
      NaviEntry.setRedisClient(redis.createClient());
      var opts = {
        containerPort: '80',
        branch:       'branch',
        ownerUsername: 'ownerUsername',
        userContentDomain: 'runnableapp.com',
        instance: {
          masterPod: true,
          name: 'instanceName'
        }
      };
      var host = NaviEntry.createHostname(opts);
      expect(
        NaviEntry.createFromHost(host).key
      ).to.equal(
        new NaviEntry(opts).key
      );

      expect(
        NaviEntry.createFromHost(host+':'+opts.containerPort).key
      ).to.equal(
        new NaviEntry(opts).key
      );

      done();
    });

  });
});
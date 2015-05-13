'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;
var sinon = require('sinon');

var noop = require('101/noop');
var redis = require('redis');
var redisTypes = require('redis-types');

var NaviEntry = require('../index.js');

describe('NaviEntry instance methods', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  afterEach(function (done) {
    delete redisTypes.Key.prototype.redisClient;
    done();
  });

  describe('w/ redis client set', function() {
    beforeEach(function (done) {
      ctx.redisClient = redis.createClient();
      NaviEntry.setRedisClient(ctx.redisClient);
      ctx.redisClient.on('connect', done);
      ctx.redisClient.on('error', done);
    });
    afterEach(function (done) {
      ctx.redisClient.quit();
      done();
    });

    describe('createHostname', function () {
      var opts = {
        exposedPort:  '80',
        ownerUsername: 'ownerUsername',
        userContentDomain: 'runnableapp.com',
        masterPod: true,
        instanceName: 'instanceName'
      };
      var host = NaviEntry.createHostname(opts);
      expect(host).to.equal([
        opts.instanceName, '-staging-', opts.ownerUsername, '.',
        opts.userContentDomain
      ].join('').toLowerCase());
    });

    describe('setBackend', function () {
      describe('not masterPod', function() {
        it('should create the redis list entry and set name and backend', function (done) {
          var instanceName = 'instanceName';
          var opts = {
            exposedPort:  '80',
            branch:       'branch',
            instanceName: instanceName,
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: false
          };
          var naviEntry = new NaviEntry(opts);
          var backendUrl = 'http://10.0.0.1:4000';

          naviEntry.setBackend(backendUrl, function (err) {
            if (err) { return done(err); }

            naviEntry.lrange(0, -1, function (err, values) {
              if (err) { return done(err); }

              expect(values).to.deep.equal([
                instanceName,
                backendUrl
              ]);

              done();
            });
          });
        });
      });
      describe('masterPod', function() {
        it('should create the redis list entry and set name and backend', function (done) {
          var instanceName = 'instanceName';
          var opts = {
            exposedPort:  '80',
            branch:       'branch',
            instanceName: instanceName,
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true
          };
          var naviEntry = new NaviEntry(opts);
          var ElasticNaviEntry = new NaviEntry(opts);
          var backendUrl = 'http://10.0.0.1:4000';

          naviEntry.setBackend(backendUrl, function (err) {
            if (err) { return done(err); }

            naviEntry.lrange(0, -1, function (err, values) {
              if (err) { return done(err); }

              expect(values).to.deep.equal([
                instanceName,
                backendUrl
              ]);
              naviEntry.key = naviEntry.elasticKey;
              naviEntry.lrange(0, -1, function (err, values) {
                if (err) { return done(err); }
                expect(values).to.deep.equal([
                  instanceName,
                  backendUrl
                ]);
                done();
              });
            });
          });
        });
      });

      describe('errors', function () {

        it('should callback error if opts where not set', function (done) {
          var opts = {
            exposedPort:  '80',
            branch:       'branch',
            ownerUsername: 'ownerUsername',
            userContentDomain: 'runnableapp.com',
            masterPod: true,
            instanceName: 'instanceName'
          };
          var host = NaviEntry.createHostname(opts);
          var naviEntry = NaviEntry.createFromHost(host);
          var backendUrl = 'http://10.0.0.1:4000';
          expect(naviEntry.setBackend.bind(naviEntry, backendUrl, noop))
            .to.throw();
          done();
        });
      });
    });
    describe('del', function () {
      var backendUrl = 'http://10.0.0.1:4000';
      var naviEntry;
      describe('not masterPod', function() {
        var instanceName = 'instanceName';
        var opts = {
          exposedPort:  '80',
          branch:       'branch',
          instanceName: instanceName,
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com',
          masterPod: false
        };
        beforeEach(function(done) {
          naviEntry = new NaviEntry(opts);
          naviEntry.setBackend(backendUrl, done);
        });
        it('should remove the redis list entry', function (done) {
          naviEntry.del(function (err) {
            if (err) { return done(err); }
            naviEntry.lrange(0, -1, function (err, values) {
              if (err) { return done(err); }
              expect(values.length).to.equal(0);
              done();
            });
          });
        });
      });
      describe('masterPod', function() {
        var instanceName = 'instanceName';
        var opts = {
          exposedPort:  '80',
          branch:       'branch',
          instanceName: instanceName,
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com',
          masterPod: true
        };
        beforeEach(function(done) {
          naviEntry = new NaviEntry(opts);
          naviEntry.setBackend(backendUrl, done);
        });
        it('should remove the redis list entry', function (done) {
          naviEntry.del(function (err) {
            if (err) { return done(err); }
            naviEntry.lrange(0, -1, function (err, values) {
              if (err) { return done(err); }
              expect(values.length).to.equal(0);
              naviEntry.key = naviEntry.elasticKey;
              naviEntry.lrange(0, -1, function (err, values) {
                if (err) { return done(err); }
                expect(values.length).to.equal(0);
                done();
              });
            });
          });
        });
      });
      describe('errors', function () {
        it('should callback error if opts where not set', function (done) {
          var naviEntry = new NaviEntry('key');
          expect(naviEntry.del.bind(naviEntry, noop))
            .to.throw();
          done();
        });
      });
    });

    describe('getInstanceName', function () {

      it('get the instance name', function (done) {
        var opts = {
          exposedPort:  '80',
          branch:       'branch',
          instanceName: 'instanceName',
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com',
          masterPod: false
        };
        var naviEntry = new NaviEntry(opts);
        var backendUrl = 'http://10.0.0.1:4000';
        naviEntry.setBackend(backendUrl, function (err) {
          if (err) { return done(err); }
          naviEntry.getInstanceName(function (err, name) {
            if (err) { return done(err); }
            expect(name).to.equal(opts.instanceName);
            done();
          });
        });
      });
    });

    describe('create naviEntry', function () {
      beforeEach(function (done) {
        var opts = ctx.opts = {
          exposedPort:  '80',
          branch:       'branch',
          instanceName: 'instanceName',
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com',
          masterPod: false
        };
        var naviEntry = ctx.naviEntry = new NaviEntry(opts);
        var backendUrl = 'http://10.0.0.1:4000';
        naviEntry.setBackend(backendUrl, done);
      });

      describe('getElasticHostname', function () {

        it('get the instance name', function (done) {
          ctx.naviEntry.getInstanceName(function (err, name) {
            if (err) { return done(err); }
            expect(name).to.equal(ctx.opts.instanceName);
            done();
          });
        });
      });

      describe('getElasticHostname', function () {

        it('should do remove the branch from the hostname', function (done) {
          var hostname = ctx.naviEntry.getElasticHostname(ctx.opts.branch);
          expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
          done();
        });
      });
    });
  });
});
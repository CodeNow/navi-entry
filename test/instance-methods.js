'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var afterEach = lab.afterEach;

var noop = require('101/noop');
var redis = require('redis');
var createCount = require('callback-count');

var NaviEntry = require('../index.js');
var RedisList = require('redis-types').List;

describe('NaviEntry instance methods', function () {
  var ctx;
  beforeEach(function (done) {
    ctx = {};
    done();
  });
  // afterEach(function (done) {
  //   var redisTypes = require('redis-types');
  //   delete redisTypes.Key.prototype.redisClient;
  //   done();
  // });

  describe('w/ redis client set', function() {
    beforeEach(function (done) {
      ctx.redisClient = redis.createClient();
      NaviEntry.setRedisClient(ctx.redisClient);
      ctx.redisClient.on('connect', done);
      ctx.redisClient.on('error', done);
    });

    describe('setBackend', function () {
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
          done();
        });
        afterEach(function (done) {
          ctx.naviEntry.del(done);
        });

        it('should create the redis list entry and set name and backend', function (done) {
          var naviEntry = ctx.naviEntry = new NaviEntry(ctx.opts);
          var backendUrl = 'http://10.0.0.1:4000';

          naviEntry.setBackend(backendUrl, function (err) {
            if (err) { return done(err); }

            expectListAtKey(naviEntry.directKey, [ctx.opts.instanceName, backendUrl], done);
          });
        });
      });

      describe('masterPod:true', function () {
        beforeEach(function (done) {
          ctx.opts.masterPod = true;
          done();
        });

        it('should create the redis list entry and set name and backend', function (done) {
          var naviEntry = ctx.naviEntry = new NaviEntry(ctx.opts);
          var backendUrl = 'http://10.0.0.1:4000';

          naviEntry.setBackend(backendUrl, function (err) {
            if (err) { return done(err); }

            var count = createCount(done);
            expectListAtKey(naviEntry.directKey, [ctx.opts.instanceName, backendUrl], count.inc().next);
            expectListAtKey(naviEntry.elasticKey, [ctx.opts.instanceName, backendUrl], count.inc().next);
          });
        });

        describe('branch:undefined', function () {
          beforeEach(function (done) {
            delete ctx.opts.branch;
            done();
          });

          it('should create a NaviEntry instance', function (done) {
            var naviEntry = ctx.naviEntry = new NaviEntry(ctx.opts);
            var backendUrl = 'http://10.0.0.1:4000';

            naviEntry.setBackend(backendUrl, function (err) {
              if (err) { return done(err); }

              var count = createCount(done);
              expectListAtKey(naviEntry.elasticKey, [ctx.opts.instanceName, backendUrl], count.inc().next);
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
          var host = new NaviEntry(opts).getElasticHostname();
          var naviEntry = NaviEntry.createFromHost(host);
          var backendUrl = 'http://10.0.0.1:4000';
          expect(naviEntry.setBackend.bind(naviEntry, backendUrl, noop))
            .to.throw();
          done();
        });
      });

      function expectListAtKey (key, list, done) {
        new RedisList(key).lrange(0, -1, function (err, data) {
          if (err) { return done(err); }
          expect(data).to.deep.equal(list);
          done();
        });
      }
    });

    describe('del', function () {
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
          done();
        });
        beforeEach(createEntryAndSet);
        afterEach(function (done) {
          ctx.naviEntry.del(done);
        });

        it('should create the redis list entry and set name and backend', function (done) {
          ctx.naviEntry.del(function (err) {
            if (err) { return done(err); }

            expectKeyDeleted(ctx.naviEntry.directKey, done);
          });
        });
      });

      describe('masterPod:true', function () {
        beforeEach(function (done) {
          ctx.opts.masterPod = true;
          done();
        });
        beforeEach(createEntryAndSet);

        it('should create the redis list entry and set name and backend', function (done) {
          ctx.naviEntry.del(function (err) {
            if (err) { return done(err); }

            var count = createCount(done);
            expectKeyDeleted(ctx.naviEntry.directKey, count.inc().next);
            expectKeyDeleted(ctx.naviEntry.elasticKey, count.inc().next);
          });
        });

        describe('branch:undefined', function () {
          beforeEach(function (done) {
            delete ctx.opts.branch;
            done();
          });
          beforeEach(createEntryAndSet);

          it('should create a NaviEntry instance', function (done) {
            ctx.naviEntry.del(function (err) {
              if (err) { return done(err); }

              var count = createCount(done);
              expectKeyDeleted(ctx.naviEntry.elasticKey, count.inc().next);
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
          var host = new NaviEntry(opts).getElasticHostname();
          var naviEntry = NaviEntry.createFromHost(host);
          var backendUrl = 'http://10.0.0.1:4000';
          expect(naviEntry.del.bind(naviEntry, backendUrl, noop))
            .to.throw();
          done();
        });
      });
      function createEntryAndSet (done) {
        var naviEntry = ctx.naviEntry = new NaviEntry(ctx.opts);
        var backendUrl = 'http://10.0.0.1:4000';

        naviEntry.setBackend(backendUrl, done);
      }
      function expectKeyDeleted (key, done) {
        new RedisList(key).exists(function (err, data) {
          if (err) { return done(err); }
          expect(data).to.be.equal(0);
          done();
        });
      }
    });

    describe('w/ naviEntry', function () {
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
      afterEach(function (done) {
        ctx.naviEntry.del(done);
      });

      describe('getInstanceName', function () {

        it('get the instance name', function (done) {

          var naviEntry = ctx.naviEntry;
          naviEntry.getInstanceName(function (err, name) {
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

        describe('masterPod:true', function() {
          beforeEach(function (done) {
            var opts = ctx.opts = {
              exposedPort:  '80',
              branch:       'branch',
              instanceName: 'instanceName',
              ownerUsername: 'ownerUsername',
              userContentDomain: 'runnableapp.com',
              masterPod: true
            };
            var naviEntry = ctx.naviEntry2 = new NaviEntry(opts);
            var backendUrl = 'http://10.0.0.1:4000';
            naviEntry.setBackend(backendUrl, done);
          });
          afterEach(function (done) {
            ctx.naviEntry2.del(done);
          });

          it('should do remove the branch from the hostname', function (done) {
            var hostname = ctx.naviEntry.getElasticHostname(ctx.opts.branch);
            expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
            done();
          });
        });
      });

      describe('getDirectHostname', function () {
        it('should do remove the branch from the hostname', function (done) {
          var hostname = ctx.naviEntry.getDirectHostname(ctx.opts.branch);
          expect(hostname).to.equal('branch-instancename-staging-ownerusername.runnableapp.com');
          done();
        });

        describe('no branch', function (done) {
          it('should stuff', function (done) {
            var host = ctx.naviEntry.getElasticHostname()+':'+ctx.opts.exposedPort;
            var naviEntry2 = NaviEntry.createFromHost(host);
            expect(naviEntry2.getDirectHostname.bind(naviEntry2))
              .to.throw();
            done();
          });
        });
      });
    });
  });
});
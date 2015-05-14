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
var put = require('101/put');
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
          ownerId: 101,
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
        afterEach(function (done) {
          ctx.naviEntry.del(done);
        });

        it('should create the redis list entry and set name and backend', function (done) {
          var naviEntry = ctx.naviEntry = new NaviEntry(ctx.opts);
          var backendUrl = 'http://10.0.0.1:4000';

          naviEntry.setBackend(backendUrl, function (err) {
            if (err) { return done(err); }

            expectListAtKey(naviEntry.directKey, [
              put(ctx.opts, 'direct', true),
              backendUrl
            ], done);
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
            expectListAtKey(naviEntry.directKey, [
              put(ctx.opts, 'direct', true),
              backendUrl
            ], count.inc().next);
            expectListAtKey(naviEntry.elasticKey, [
              put(ctx.opts, 'elastic', true),
              backendUrl
            ], count.inc().next);
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
              expectListAtKey(naviEntry.elasticKey, [
                put(ctx.opts, 'elastic', true),
                backendUrl
              ], count.inc().next);
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
            ownerId: 101,
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
          list[0] = JSON.stringify(list[0]);
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
          ownerId: 101,
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
            ownerId: 101,
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
          // instanceName includes branch, masterPod:false
          instanceName: 'branch-instanceName',
          ownerUsername: 'ownerUsername',
          ownerId: 101,
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

      describe('getInfo', function () {
        beforeEach(function (done) {
          var host = ctx.naviEntry.getDirectHostname()+':'+ctx.opts.exposedPort;
          ctx.naviEntry2 = NaviEntry.createFromHost(host);
          done();
        });

        it('should get info', function (done) {
          ctx.naviEntry2.getInfo(function (err, info) {
            if (err) { return done(err); }
            expect(info).to.deep.equal(
              put(ctx.opts, 'direct', true)
            );
            done();
          });
        });

        describe('lindex error', function () {
          beforeEach(function (done) {
            ctx.err = new Error('boom');
            sinon.stub(ctx.naviEntry2, 'lindex').yieldsAsync(ctx.err);
            done();
          });

          it('should callback the error', function (done) {
            ctx.naviEntry2.getInfo(function (err) {
              expect(err).to.equal(ctx.err);
              done();
            });
          });
        });

        describe('malformated info', function () {
          it('should callback parse error', function (done) {
            ctx.naviEntry2.lset(0, 'not json', function (err) {
              if (err) { return done(err); }
              ctx.naviEntry2.getInfo(function (err) {
                expect(err).to.exist();
                expect(err.message).to.match(/Unexpected/);
                done();
              });
            });
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
              ownerId: 101,
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

        describe('no branch', function () {
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
'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var expect = require('code').expect;
var describe = lab.describe;
var it = lab.test;
var beforeEach = lab.beforeEach;
var before = lab.before;
var afterEach = lab.afterEach;
var sinon = require('sinon');

var noop = require('101/noop');
var put = require('101/put');
var redis = require('redis');
var createCount = require('callback-count');

var NaviEntry = require('../index.js');
var RedisList = require('redis-types').List;
var redisClient = redis.createClient();
NaviEntry.setRedisClient(redisClient);

describe('NaviEntry instance methods', function () {
  var ctx= {};
  before(function (done) {
    redis.createClient().flushall(done);
  });

  beforeEach(function (done) {
    ctx = {};
    done();
  });

  describe('w/ redis client set', function() {
    describe('setBackend', function () {
      beforeEach(function (done) {
        ctx.opts = {
          exposedPort: '80',
          shortHash:    'abcdef',
          branch:       'branch',
          ownerUsername: 'ownerUsername',
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

        it('should callback error if opts were not set', function (done) {
          var opts = {
            exposedPort:  '80',
            shortHash:    'abcdef',
            branch:       'branch',
            ownerUsername: 'ownerUsername',
            ownerGithub: 101,
            userContentDomain: 'runnableapp.com',
            masterPod: true,
            instanceName: 'instanceName'
          };
          var host = new NaviEntry(opts).getElasticHostname();
          NaviEntry.createFromHostname(redisClient, host, function (err, naviEntry) {
            if (err) { return done(err); }
            var backendUrl = 'http://10.0.0.1:4000';
            expect(naviEntry.setBackend.bind(naviEntry, backendUrl, noop))
              .to.throw();
            done();
          });
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
        ctx.opts = {
          exposedPort: '80',
          shortHash:    'abcdef',
          branch:       'branch',
          ownerUsername: 'ownerUsername',
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
          shortHash:    'abcdef',
          branch:       'branch',
          // instanceName includes branch, masterPod:false
          instanceName: 'branch-instanceName',
          ownerUsername: 'ownerUsername',
          ownerGithub: 101,
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
          var hostname = ctx.naviEntry.getDirectHostname();
          NaviEntry.createFromHostname(redisClient, hostname, function (err, naviEntry) {
            if (err) { return done(err); }
            ctx.naviEntry2 = naviEntry;
            done();
          });
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
    });
  });
  describe('del', function () {
    describe('error', function() {
      it('should throw if created from url', function(done) {
        var naviEntry = NaviEntry.createFromUrl('test.com');
        expect(naviEntry.del.bind(naviEntry)).to.throw();
        done();
      });
    });
  });
  describe('_validateShortHash', function () {
    it('should throw if created from url', function(done) {
      var naviEntry = NaviEntry.createFromUrl('test.com');
      expect(naviEntry._validateShortHash.bind(naviEntry)).to.throw();
      done();
    });
  });
  describe('getDirectHostname', function () {
    describe('masterPod: true', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getDirectHostname(opts.shortHash);
        expect(hostname).to.equal('abcdef-instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('masterPod: true no branch', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        instanceName: 'instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getDirectHostname(opts.shortHash);
        expect(hostname).to.equal('abcdef-instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('masterPod: false', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'branch-instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getDirectHostname(opts.shortHash);
        expect(hostname).to.equal('abcdef-instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('isolation master', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'branch-instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false,
        isolated: 'asda34',
        isIsolationGroupMaster: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getDirectHostname(opts.shortHash);
        expect(hostname).to.equal('abcdef-instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('isolated dependency', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'abcdef--instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false,
        isolated: 'asda34'
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getDirectHostname(opts.shortHash);
        expect(hostname).to.equal('abcdef--instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
  });
  describe('getElasticHostname', function () {
    describe('masterPod: true', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getElasticHostname(opts.shortHash);
        expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('masterPod: true no branch', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        instanceName: 'instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getElasticHostname(opts.shortHash);
        expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('masterPod: false', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'branch-instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getElasticHostname(opts.shortHash);
        expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('isolation master', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'branch-instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false,
        isolated: 'asda34',
        isIsolationGroupMaster: true
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getElasticHostname(opts.shortHash);
        expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
    describe('isolated dependency', function () {
      var opts = {
        exposedPort:  '80',
        shortHash:    'abcdef',
        branch:       'branch',
        instanceName: 'abcdef--instanceName',
        ownerUsername: 'ownerUsername',
        ownerGithub: 101,
        userContentDomain: 'runnableapp.com',
        masterPod: false,
        isolated: 'asda34'
      };
      beforeEach(function(done) {
        ctx.naviEntry = new NaviEntry(opts);
        done();
      });
      it('should remove the shortHash from the hostname', function (done) {
        var hostname = ctx.naviEntry.getElasticHostname(opts.shortHash);
        expect(hostname).to.equal('instancename-staging-ownerusername.runnableapp.com');
        done();
      });
    });
  });
});
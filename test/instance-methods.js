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

    describe('setBackend', function () {
      it('should create the redis list entry and set name and backend', function (done) {
        var instanceName = 'instanceName';
        var opts = {
          containerPort: '80',
          branch:       'branch',
          instanceName: instanceName,
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com'
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

    describe('findInstanceNameForHostname', function () {

      beforeEach(function (done) {
        var opts = ctx.opts = {
          containerPort: '80',
          branch:       'branch',
          instanceName: 'instanceName',
          ownerUsername: 'ownerUsername',
          userContentDomain: 'runnableapp.com'
        };
        ctx.naviEntry = new NaviEntry(ctx.opts);
        var backendUrl = 'http://10.0.0.1:4000';
        ctx.hostname = [
          opts.branch, '-', opts.instanceName, '-staging-', opts.ownerUsername, '.',
          opts.userContentDomain
        ].join('').toLowerCase();
        ctx.naviEntry.setBackend(backendUrl, done);
      });

      it('should find the instance name for the hostname', function (done) {
        NaviEntry.findInstanceNameForHostname(ctx.hostname, done);
      });

      describe('no redis client', function() {
        beforeEach(function (done) {
          delete redisTypes.Key.prototype.redisClient;
          done();
        });

        it('should throw an error', function (done) {
          expect(
            NaviEntry.findInstanceNameForHostname.bind(NaviEntry, ctx.hostname)
          ).to.throw();
          done();
        });
      });

      describe('redis client error', function() {
        beforeEach(function (done) {
          ctx.err = new Error('boom');
          sinon.stub(redisTypes.Key.prototype.redisClient, 'keys')
            .yieldsAsync(ctx.err);
          done();
        });

        it('should callback the error', function (done) {
          NaviEntry.findInstanceNameForHostname(ctx.hostname, function (err) {
            expect(err).to.equal(ctx.err);
            done();
          });
        });
      });

      describe('no entry in redis', function () {
        beforeEach(function (done) {
          ctx.naviEntry.del(done);
        });

        it('should callback hostname not found', function (done) {
          NaviEntry.findInstanceNameForHostname(ctx.hostname, function (err) {
            expect(err).to.exist();
            expect(err.message).to.match(/hostname not found/);
            done();
          });
        });
      });
    });
  });
});
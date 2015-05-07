'use strict';

var url = require('url')
var redisTypes = require('redis-types');
var RedisList  = redisTypes.List;
var ErrorCat = require('error-cat');
var last = require('101/last');
var exists = require('101/exists');
var defaults = require('101/defaults');
var isString = require('101/is-string');
var keypather = require('keypather')();
var requireOpt = function (opts, key, instanceKeypath) {
  if (!exists(opts[key])) {
    var message = instanceKeypath ?
      'opts.'+key+' or opts.'+instanceKeypath+' is required':
      'opts.'+key+' is required';

    throw new Error(message);
  }
};
var formatOpts = function (opts) {
  var instance = opts.instance || {};
  var instanceBranchKeypath = 'contextVersion.appCodeVersions[0].lowerBranch';
  defaults(opts, {
    instanceName: instance.name,
    branch      : keypather.get(instance, instanceBranchKeypath),
    masterPod   : instance.masterPod || false
  });
  requireOpt(opts, 'ownerUsername');
  requireOpt(opts, 'instanceName', 'instance.name');
  requireOpt(opts, 'masterPod', 'instance.masterPod');
  requireOpt(opts, 'branch', 'instance.'+instanceBranchKeypath);
};

module.exports = NaviEntry;

/**
 * Create hipache host (redis list)
 * @param  {Object|String}  optsOrKey      options or key
 * @param  {String}    opts.containerPort  container.ports hash key - ex: "80/tcp"
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    [opts.instance]     instance json (including name, cv and masterPod)
 *                                           required if masterPod, branchName, instanceName not provided
 * @param  {String}    [opts.instanceName] instance name
 *                                           will override instance value if both are provided
 *                                           required if instance not provided
 * @param  {String}    [opts.branch]       instance's cv's repos branch
 *                                           will override instance value if both are provided
 *                                           required if instance not provided and not master pod
 * @param  {String}    [opts.masterPod]    whether instance is a masterPod
 *                                           will override instance value if both are provided
 *                                           defaults to false
 * @return {RedisList} hipache host   redis list
 */
function NaviEntry (optsOrKey) {
  var key, opts;
  var args = arguments;
  if (isString(optsOrKey)) {
    key = optsOrKey;
  }
  else {
    opts = optsOrKey;
  }

  if (opts) {
    formatOpts(opts);
    requireOpt(opts, 'containerPort');

    var containerPort     = this.containerPort     = opts.containerPort;
    var instanceName      = this.instanceName      = opts.instanceName;
    var branch            = this.branch            = opts.branch;
    var masterPod         = this.masterPod         = opts.masterPod;
    var ownerUsername     = this.ownerUsername     = opts.ownerUsername;
    var userContentDomain = this.userContentDomain = opts.userContentDomain;

    containerPort = containerPort.split('/')[0];
    // the new user domain is active. use the new domain scheme
    var hostname = NaviEntry.createHostname(opts);
    key = [
      'frontend:',
      containerPort, '.',
      hostname
    ].join('').toLowerCase();

    if (opts.masterPod) {
      this.elasticKey = [
        'frontend:',
        containerPort, '.',
        hostname.replace(new RegExp('^'+branch+'-'), '')
      ].join('').toLowerCase();
    }
  }

  RedisList.call(this, key);
}

require('util').inherits(NaviEntry, RedisList);

/**
 * create a NaviEntry instance from host
 * @param  {String} host  host of an instance container
 * @return {NaviEntry}    naviEntry
 */
NaviEntry.createFromHost = function (host) {
  var parsed = url.parse('http://'+host);
  parsed.port = parsed.port || '80';
  var key = [
    'frontend:',
    parsed.port, '.',
    parsed.hostname
  ].join('').toLowerCase();
  return new NaviEntry(key.toLowerCase());
};

/**
 * Create host from ops
 * @param  {Object}    opts                options
 * @param  {String}    opts.ownerUsername  instance owner's username
 * @param  {String}    opts.instanceName   instance name
 * @param  {String}    opts.branch         instance's cv's repos branch
 * @param  {String}    opts.masterPod      whether instance is a masterPod
 * @return {String}    host                host
 */
NaviEntry.createHostname = function (opts) {
  formatOpts(opts);
  return [
    opts.branch, '-', opts.instanceName, '-staging-', opts.ownerUsername, '.',
    opts.userContentDomain
  ].join('').toLowerCase();
};

/**
 * provide a redis client to navi entry
 * @param  {Object} redisClient from require('redis').createClient(opts)
 */
NaviEntry.setRedisClient = function (redisClient) {
  redisTypes({ redisClient: redisClient });
};

/**
 * finds instance name for hostname
 * @param  {String}   hostname  instance hostname (no protocol, no port)
 * @param  {Function} cb        callback(err, instanceName)
 */
NaviEntry.findInstanceNameForHostname = function (hostname, cb) {
  var redisClient = NaviEntry.prototype.redisClient;
  if (!redisClient) {
    throw new Error('redis client was not provided');
  }

  redisClient.keys('frontend:*.'+hostname, function (err, keys) {
    if (err) { return cb(err); }
    if (keys.length === 0) {
      return cb(ErrorCat.create(404, 'hostname not found'));
    }
    var naviEntry = new RedisList(keys[0]);
    naviEntry.lindex(0, cb);
  });
};

/**
 * sets the navi entry list values
 * @param {String} backendUrl should be a full url including protocol and port, ex: http://10.0.1.1:80
 */
NaviEntry.prototype.setBackend = function (backendUrl, cb) {
  this.redisClient.multi()
    .del(this.key)
    .rpush(this.key, this.instanceName)
    .rpush(this.key, backendUrl)
    .exec(cb);
};